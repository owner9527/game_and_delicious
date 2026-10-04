// 帧率实测:进游戏后取样 1.6s �?rAF 间隔,输出 fps / 掉帧统计�?import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const PORT = 9800 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dshfps-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
});

try {
  let version;
  for (let i = 0; i < 100; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(120); } }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let loadFired = false;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Page.loadEventFired') loadFired = true; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120 && !loadFired; i++) await sleep(60);
  await sleep(1500);

  // 对照实验:--off 时关掉全�?CSS 动画�?DOM 粒子,隔离"合成器动�?+ 粒子"的开销
  const mode = process.argv[3] || 'on';
  if (mode === 'off') {
    const inject = `(function(){
      var s=document.createElement('style');
      s.textContent='*,*::before,*::after{animation:none !important;transition:none !important;}';
      document.head.appendChild(s);
      if(window.getAnimations) window.getAnimations().forEach(function(a){try{a.cancel();}catch(e){}});
      var box=document.getElementById('particles'); if(box) box.innerHTML='';
      return document.querySelectorAll('#art svg .svgFog,#art svg .svgFog2,#art svg .rainband,#art svg .flick').length;
    })()`;
    const n = await send('Runtime.evaluate', { expression: inject, returnByValue: true });
    console.log('ANIM_KILLED targets=' + n.result.value);
  }

  // 进入游戏内场�?带粒�?+ SVG 动画 + DOM 粒子),再取�?  const expr = `(function(){
    var out=[];
    var seq=['s1','h_lab'];
    var i=0;
    function step(){
      if(i<seq.length){ var id=seq[i++]; var n=STORY.nodes[id];
        enter(id,{apply:false}); document.getElementById('chapCard').classList.remove('on'); beginDialog(n); setTimeout(step,700); return; }
      // 取样 1.6 �?      var t0=performance.now(), last=t0, frames=0, worst=0, over=[];
      function loop(t){ var dt=t-last; last=t; frames++;
        if(dt>worst) worst=dt; if(dt>33.4) over.push(Math.round(dt));
        if(t-t0<1600) requestAnimationFrame(loop);
        else { var el=t-t0;
          window.__FPS__={ fps:+(frames/(el/1000)).toFixed(1), frames:frames, ms:+el.toFixed(0),
            worstFrameMs:+worst.toFixed(1), framesOver33ms:over.length, samples:over.slice(0,8),
            motes:document.querySelectorAll('#particles .mote,.rainlayer').length,
            svgNodes:document.querySelectorAll('#art svg *').length,
            anims:document.getAnimations?document.getAnimations().length:-1 };
        } }
      requestAnimationFrame(loop);
    }
    step();
    return 'started';
  })()`;
  try {
    await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  } catch (e) { console.log('EVAL_ERR ' + e); }
  let fpsVal = null;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    try {
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__FPS__||null)', returnByValue: true });
      if (r.result && r.result.value && r.result.value !== 'null') { fpsVal = r.result.value; break; }
    } catch (e) { console.log('POLL_ERR ' + e); break; }
  }
  console.log('FPS_RESULT ' + (fpsVal || '{"err":"未取�?}'));
} catch (e) {
  console.log('FPS_FATAL ' + (e && e.stack || e));
} finally {
  try { ws && ws.close(); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
