// 变体对比:同一页面下逐条切换优化项,量化每项开销。
// 用法: node _variants.mjs <url>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const PORT = 9500 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshvar-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

// 变体:patch 为要注入的 CSS(加在现有样式之后),setup 为额外 JS
const VARIANTS = [
  { n: 'A 只留粒子(隐藏全部叠加层)', css: '#grade{display:none!important} #lightfx{display:none!important} #stage::after{display:none!important}', js: '', delay: 1200 },
  { n: 'B 粒子 + grade', css: '#lightfx{display:none!important} #stage::after{display:none!important}', js: '', delay: 1200 },
  { n: 'C 粒子 + lightfx(去混合)', css: '#lightfx{mix-blend-mode:normal!important} #grade{display:none!important} #stage::after{display:none!important}', js: '', delay: 1200 },
  { n: 'D 粒子 + grain(去混合)', css: '#stage::after{mix-blend-mode:normal!important} #grade{display:none!important} #lightfx{display:none!important}', js: '', delay: 1200 },
  { n: 'E 粒子 + 三层都去混合', css: '#stage::after{mix-blend-mode:normal!important} #lightfx{mix-blend-mode:normal!important}', js: '', delay: 1200 },
];

try {
  let v; for (let i = 0; i < 100; i++) { try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(120); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let loaded = false;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Page.loadEventFired') loaded = true; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120 && !loaded; i++) await sleep(60);
  await sleep(1400);

  for (const vt of VARIANTS) {
    const setup = `(function(){
      document.querySelectorAll('style[data-var]').forEach(function(e){e.remove()});
      var st=document.createElement('style'); st.setAttribute('data-var','1'); st.textContent=${JSON.stringify(vt.css)}; document.head.appendChild(st);
      var n=STORY.nodes['s1']; enter('s1',{apply:false});
      document.getElementById('chapCard').classList.remove('on'); beginDialog(n);
      ${vt.js}
      return document.querySelectorAll('#particles .mote,.rainlayer').length;
    })()`;
    try { const r = await send('Runtime.evaluate', { expression: setup, returnByValue: true }); }
    catch (e) { console.log(vt.n + ' -> SETUP_ERR'); continue; }
    await sleep(vt.delay == null ? 700 : vt.delay);
    const meas = `(function(){ window.__V__=null; var t0=performance.now(), last=t0, f=0, worst=0, over=0;
      function loop(t){ var dt=t-last; last=t; f++; if(dt>worst) worst=dt; if(dt>33.4) over++;
        if(t-t0<1200) requestAnimationFrame(loop);
        else window.__V__={fps:+(f/((t-t0)/1000)).toFixed(1),frames:f,worst:+worst.toFixed(1),over33:over}; }
      requestAnimationFrame(loop); return 'ok'; })()`;
    try { await send('Runtime.evaluate', { expression: meas, returnByValue: true }); } catch (e) {}
    let out = null;
    for (let i = 0; i < 10; i++) { await sleep(350);
      try { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__V__||null)', returnByValue: true });
        if (r.result.value && r.result.value !== 'null') { out = r.result.value; break; } } catch (e) { break; } }
    console.log(vt.n + ' -> ' + (out || '{"fps":"未取样"}'));
  }
} catch (e) { console.log('FATAL ' + (e && e.message || e)); }
finally { try { ws && ws.close(); } catch {} try { edge.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }
