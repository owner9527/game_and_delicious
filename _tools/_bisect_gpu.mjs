// 逐项启用/禁用视觉�?定位"合成器开销"来源。每项取�?1.2s �?rAF 间隔�?// 用法: node _bisect.mjs <url> [mask]
//   mask 为要"保留启用"的层名称,逗号分隔;不传则全开�?import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const keep = (process.argv[3] || 'motes,lightfx,grade,grain,svgfog,rainband,flick,noanim').split(',');
const PORT = 9600 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbis-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

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

  const on = k => keep.includes(k);
  const setup = `(function(){
    var kill=[]; if(!${on('motes')}) kill.push('#particles');
    if(!${on('lightfx')}) kill.push('#lightfx');
    if(!${on('grade')}) kill.push('#grade');
    kill.forEach(function(sel){ var e=document.querySelector(sel); if(e) e.style.display='none'; });
    if(!${on('grain')}){ var st=document.createElement('style'); st.textContent='#stage::after{display:none !important;}'; document.head.appendChild(st); }
    var n=STORY.nodes['s1']; enter('s1',{apply:false});
    document.getElementById('chapCard').classList.remove('on'); beginDialog(n);
    var removed=0;
    if(!${on('svgfog')}){ document.querySelectorAll('#art svg .svgFog,#art svg .svgFog2').forEach(function(e){ e.style.animation='none'; removed++; }); }
    if(!${on('rainband')}){ document.querySelectorAll('#art svg .rainband').forEach(function(e){ e.style.animation='none'; removed++; }); }
    if(!${on('flick')}){ document.querySelectorAll('#art svg .flick').forEach(function(e){ e.style.animation='none'; removed++; }); }
    if(!${on('noanim')}){ var s=document.createElement('style'); s.textContent='*,*::before,*::after{animation:none !important;transition:none !important;}'; document.head.appendChild(s);
      if(window.getAnimations) window.getAnimations().forEach(function(a){try{a.cancel();}catch(e){}}); }
    return JSON.stringify({killed:kill, svgAnimOff:removed,
      liveAnims: window.getAnimations?document.getAnimations().length:-1,
      motes:document.querySelectorAll('#particles .mote,.rainlayer').length});
  })()`;
  try { const r = await send('Runtime.evaluate', { expression: setup, returnByValue: true }); console.log('SETUP ' + r.result.value); }
  catch (e) { console.log('SETUP_ERR ' + e); }

  await sleep(900);
  // 短取�?避免 headless 软渲染过载导致渲染进程被杀
  const meas = `(function(){ window.__F2__=null; var t0=performance.now(), last=t0, f=0, worst=0, over=0;
    function loop(t){ var dt=t-last; last=t; f++; if(dt>worst) worst=dt; if(dt>33.4) over++;
      if(t-t0<1200) requestAnimationFrame(loop);
      else window.__F2__={fps:+(f/((t-t0)/1000)).toFixed(1),frames:f,worst:+worst.toFixed(1),over33:over,
        anims: window.getAnimations?document.getAnimations().length:-1}; }
    requestAnimationFrame(loop); return 'ok'; })()`;
  try { await send('Runtime.evaluate', { expression: meas, returnByValue: true }); } catch (e) { console.log('MEAS_ERR ' + e); }
  let out = null;
  for (let i = 0; i < 12; i++) { await sleep(400);
    try { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__F2__||null)', returnByValue: true });
      if (r.result.value && r.result.value !== 'null') { out = r.result.value; break; } } catch (e) { break; } }
  console.log('KEEP[' + keep.join('+') + '] ' + (out || '{"fps":"未取�?渲染进程被杀)"}'));
} catch (e) {
  console.log('FATAL ' + (e && e.message || e));
} finally {
  try { ws && ws.close(); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
