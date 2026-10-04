// 粒子数量与帧率的关系:同一页面下依次设置 26/18/12/6/0 个粒子,各取样 1.2s。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const PORT = 9700 + Math.floor(Math.random() * 250);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshcnt-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });

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

  for (const n of [40, 22, 14, 8]) {
    const setup = `(function(){
      var node=STORY.nodes['s1']; enter('s1',{apply:false});
      document.getElementById('chapCard').classList.remove('on'); beginDialog(node);
      var box=document.getElementById('particles');
      // 先补足到 n 个,再多删少补:直接按 n 重建,保证数量精确
      var all=box.querySelectorAll('.mote,.rainlayer');
      var keep=Math.min(${n}, all.length);
      for(var i=keep;i<all.length;i++) all[i].remove();
      // 若不足则克隆补足(仅用于测量对比)
      var cur=box.querySelectorAll('.mote,.rainlayer');
      while(cur.length<${n} && cur.length>0){ box.appendChild(cur[cur.length-1].cloneNode(true)); cur=box.querySelectorAll('.mote,.rainlayer'); }
      // 把运动位移压缩到 30% 视口,减小每帧重绘面积
      box.querySelectorAll('.mote').forEach(function(m){
        var sw=parseFloat(m.style.getPropertyValue('--sw'))||0;
        m.style.setProperty('--sw', (sw*0.35).toFixed(2)+'vw');
        m.style.height=m.style.width;
      });
      return box.querySelectorAll('.mote,.rainlayer').length; })()`;
    try { const r = await send('Runtime.evaluate', { expression: setup, returnByValue: true }); } catch (e) { console.log(n + ' SETUP_ERR'); continue; }
    await sleep(600);
    const meas = `(function(){ window.__C__=null; var t0=performance.now(), last=t0, f=0, worst=0, over=0;
      function loop(t){ var dt=t-last; last=t; f++; if(dt>worst) worst=dt; if(dt>33.4) over++;
        if(t-t0<1200) requestAnimationFrame(loop);
        else window.__C__={fps:+(f/((t-t0)/1000)).toFixed(1),frames:f,worst:+worst.toFixed(1),over33:over}; }
      requestAnimationFrame(loop); return 'ok'; })()`;
    try { await send('Runtime.evaluate', { expression: meas, returnByValue: true }); } catch (e) {}
    let out = null;
    for (let i = 0; i < 10; i++) { await sleep(350);
      try { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__C__||null)', returnByValue: true });
        if (r.result.value && r.result.value !== 'null') { out = r.result.value; break; } } catch (e) { break; } }
    console.log('粒子数=' + n + ' -> ' + (out || '{"fps":"未取样"}'));
  }
} catch (e) { console.log('FATAL ' + (e && e.message || e)); }
finally { try { ws && ws.close(); } catch {} try { edge.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }
