// 帧率归因:逐项打开"新增的表现层",量化每一项的帧率代价(同一渲染进程内横向比较)。
// 用法: node _fpsmatrix.mjs <url> [--compare-before]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const PORT = 9100 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshm-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });

// 逐级打开:0=纯静态  1=+打字机  2=+DOM粒子  3=+lightfx  4=+grain  5=+grade  6=+SVG动效
const LEVELS = [
  { n: '0 纯静态场景(全部动效关闭)', css: '*{animation:none!important;transition:none!important} #particles,#lightfx,#grade{display:none!important} #stage::after{display:none!important}', js: '' },
  { n: '1 + 打字机光标/文字', css: '#particles,#lightfx,#grade{display:none!important} #stage::after{display:none!important}', js: '' },
  { n: '2 + DOM 环境粒子', css: '#lightfx,#grade{display:none!important} #stage::after{display:none!important}', js: '' },
  { n: '3 + lightfx 呼吸光晕', css: '#grade{display:none!important} #stage::after{display:none!important}', js: '' },
  { n: '4 + 胶片颗粒', css: '#grade{display:none!important}', js: '' },
  { n: '5 + grade 色彩分级', css: '', js: '' },
  { n: '6 + SVG 场景内动效(默认全开)', css: '', js: '' },
];

try {
  let v; for (let i = 0; i < 100; i++) { try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(120); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let loaded = false;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
    if (m.method === 'Page.loadEventFired') loaded = true; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120 && !loaded; i++) await sleep(60);
  await sleep(1500);

  for (const lv of LEVELS) {
    const setup = `(function(){
      document.querySelectorAll('style[data-lv]').forEach(function(e){e.remove()});
      var st=document.createElement('style'); st.setAttribute('data-lv','1'); st.textContent=${JSON.stringify(lv.css)}; document.head.appendChild(st);
      var n=STORY.nodes['s1']; enter('s1',{apply:false});
      document.getElementById('chapCard').classList.remove('on'); beginDialog(n);
      ${lv.js}
      return 1; })()`;
    try { await send('Runtime.evaluate', { expression: setup, returnByValue: true }); } catch (e) { console.log(lv.n + ' -> SETUP_ERR'); continue; }
    await sleep(1000);
    const meas = `(function(){ window.__M__=null; var t0=performance.now(), last=t0,f=0,worst=0,over=0;
      function loop(t){ var dt=t-last; last=t; f++; if(dt>worst) worst=dt; if(dt>33.4) over++;
        if(t-t0<1500) requestAnimationFrame(loop); else window.__M__={fps:+(f/((t-t0)/1000)).toFixed(1),frames:f,worst:+worst.toFixed(1),over33:over}; }
      requestAnimationFrame(loop); return 'ok'; })()`;
    try { await send('Runtime.evaluate', { expression: meas, returnByValue: true }); } catch (e) {}
    let out = null;
    for (let i = 0; i < 10; i++) { await sleep(400);
      try { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__M__||null)', returnByValue: true });
        if (r.result.value && r.result.value !== 'null') { out = r.result.value; break; } } catch (e) { break; } }
    console.log(lv.n + '  ->  ' + (out || '{"fps":"未取样"}'));
  }
} catch (e) { console.log('FATAL ' + (e && e.message || e)); }
finally { try { ws && ws.close(); } catch {} try { edge.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }
