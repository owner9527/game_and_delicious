// 用 headless Edge + CDP 打开游戏页面：收集 console 报错、页面异常，并截图。
// 用法: node probe.mjs <url> <outPng> [--wait=3000] [--w=1280] [--h=800] [--click=x,y] [--click=x,y] [--key=Space] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const argv = process.argv.slice(2);
const url = argv[0];
const out = argv[1];
const opt = (name, def) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const optAll = (name) => argv.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3));
const waitMs = Number(opt('wait', 3500));
const W = Number(opt('w', 1280));
const H = Number(opt('h', 800));
const clicks = optAll('click').map(s => s.split(',').map(Number));
const keys = optAll('key');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9333 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshedge-'));

const edgeArgs = [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, 'about:blank',
];
// 默认禁用 GPU（截图更稳定）；加 --gpu 可测真实合成路径下的帧率
if (!argv.includes('--gpu')) edgeArgs.splice(1, 0, '--disable-gpu');
const edge = spawn(EDGE, edgeArgs, { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const send = (method, params = {}, sessionId, timeoutMs = 30000) => new Promise((resolve, reject) => {
  const id = ++msgId;
  const timer = setTimeout(() => {
    if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时: ' + method)); }
  }, timeoutMs);
  pending.set(id, {
    resolve: (v) => { clearTimeout(timer); resolve(v); },
    reject: (e) => { clearTimeout(timer); reject(e); },
  });
  try {
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
});

const errors = [];
const logs = [];

function finish(code) {
  try { ws && ws.close(); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

try {
  // 等待 DevTools 端点就绪
  let version;
  for (let i = 0; i < 100; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(120); }
  }
  if (!version) throw new Error('Edge DevTools 未就绪');

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let loadFired = false;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Page.loadEventFired') loadFired = true;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(d.exception?.description || d.text || 'unknown exception');
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
      logs.push(`[${m.params.type}] ${text}`);
      if (m.params.type === 'error') errors.push(text);
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push(`[${e.level}] ${e.text} ${e.url || ''}`);
      if (e.level === 'error') errors.push(`${e.text} ${e.url || ''}`);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // --touch：开启触摸模拟 + 移动 UA，用来还原手机上的真实滚动行为
  if (argv.includes('--touch')) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  }

  await send('Page.navigate', { url });
  for (let i = 0; i < 120 && !loadFired; i++) await sleep(60);
  await sleep(600);

  // 真实滚动（--scroll=<dy> 像素，正数向下滚）。--touch 时用触摸滑动手势，否则用鼠标滚轮
  const scrollDy = Number(opt('scroll', 0));
  if (scrollDy) {
    const sx = Number(opt('scrollX', Math.round(W / 2)));
    const sy = Number(opt('scrollY', Math.round(H / 2)));
    if (argv.includes('--touch')) {
      try {
        await send('Input.synthesizeScrollGesture', {
          x: sx, y: sy, xDistance: 0, yDistance: -scrollDy, speed: 800, gestureSourceType: 'touch',
        }, undefined, 20000);
      } catch (e) { errors.push('触摸滚动失败: ' + e.message); }
    } else {
      for (let i = 0; i < 3; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: sx, y: sy, deltaX: 0, deltaY: Math.round(scrollDy / 3), pointerType: 'mouse' });
        await sleep(180);
      }
    }
    await sleep(700);
  }

  // 真实拖拽（--drag=x1,y1,x2,y2，可多次）：走 CDP 真实输入，能正常触发 pointer 事件
  for (const d of optAll('drag')) {
    const p = d.split(',').map(Number);
    const [x1, y1, x2, y2] = p;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 });
    const N = 8;
    for (let i = 1; i <= N; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x1 + (x2 - x1) * i / N),
        y: Math.round(y1 + (y2 - y1) * i / N),
        button: 'left', buttons: 1,
      });
      await sleep(45);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(250);
  }

  // 交互：点击 / 按键
  let t = 0;
  for (const [x, y] of clicks) {
    t += 250;
    await sleep(250);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  }
  for (const k of keys) {
    await sleep(250);
    const code = { Space: 'Space', Enter: 'Enter', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }[k] || k;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Space' ? 32 : 0, text: k === 'Space' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  }

  await sleep(waitMs);

  const info = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      url: location.href,
      bodyLen: document.body.innerHTML.length,
      canvases: [...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight})),
      visibleScreens: [...document.querySelectorAll('.screen.show, #ui > *')].slice(0,6).map(e=>e.id||e.className),
      hooks: Object.keys(window).filter(k=>/app|game|engine|main/i.test(k)).slice(0,20)
    })`,
    returnByValue: true,
  });

  // 支持 --eval=<表达式> 与 --evalFile=<js文件>（后者避免 shell 引号转义问题）；按命令行顺序执行
  const allSteps = [];
  for (const a of argv) {
    if (a.startsWith('--eval=')) allSteps.push(a.slice(7));
    else if (a.startsWith('--evalFile=')) {
      try { allSteps.push(fs.readFileSync(a.slice(11), 'utf8')); }
      catch (e) { allSteps.push(`"READ_FAIL: ${String(e.message).replace(/"/g, '')}"`); }
    }
  }
  let evalResult;
  const evalTimeout = Number(opt('evalTimeout', 30000));
  for (let i = 0; i < allSteps.length; i++) {
    await sleep(900);
    const r = await send('Runtime.evaluate', { expression: allSteps[i], returnByValue: true, awaitPromise: true }, undefined, evalTimeout);
    if (i === allSteps.length - 1) evalResult = r.result?.value;
    if (r.exceptionDetails) errors.push('EVAL异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  }

  console.log(JSON.stringify({
    url, out, errors,
    evalResult,
    page: JSON.parse(info.result.value || '{}'),
    logs: logs.slice(-40),
  }, null, 2));
  finish(errors.length ? 2 : 0);
} catch (e) {
  console.log(JSON.stringify({ url, out, fatal: String(e && e.stack || e), errors }, null, 2));
  finish(1);
}
