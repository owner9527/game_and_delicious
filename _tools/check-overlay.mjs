// 检测"隐形遮罩抢占点击"这类 bug：覆盖屏幕中心、pointer-events:auto，但祖先链上有 opacity:0 / visibility:hidden / display:none
const EXPR = `(()=>{
  const cx=Math.round(innerWidth/2), cy=Math.round(innerHeight/2);
  const bad=[]; const seen=new Set();
  for(const el of document.querySelectorAll('body *')){
    const cs=getComputedStyle(el);
    if(cs.pointerEvents!=='auto') continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2) continue;
    if(!(cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom)) continue;
    let p=el, why=null;
    while(p&&p!==document.documentElement){
      const s=getComputedStyle(p);
      if(s.display==='none'){why=why||'display:none';}
      if(s.visibility==='hidden'){why=why||'visibility:hidden';}
      if(parseFloat(s.opacity)===0){why=why||'opacity:0';}
      p=p.parentElement;
    }
    const key=(el.id||'')+'|'+String(el.className).slice(0,40);
    if(seen.has(key)) continue; seen.add(key);
    bad.push({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,44),why});
  }
  const top=document.elementFromPoint(cx,cy);
  return JSON.stringify({
    center:[cx,cy],
    topEl: top? (top.tagName+'#'+(top.id||'')+'.'+String(top.className).slice(0,30)) : null,
    blockersOverCenter: bad.length,
    list: bad.slice(0,10)
  });
})()`;

import { spawn } from 'node:child_process';
const BASE = 'http://127.0.0.1:8899';
const GAMES = [
  ['01', `${BASE}/1/${encodeURIComponent('余烬之城.html')}`],
  ['02', `${BASE}/2/index.html`],
  ['03', `${BASE}/3/index.html`],
  ['04', `${BASE}/4/index.html`],
  ['05', `${BASE}/5/index.html`],
  ['06', `${BASE}/6/index.html`],
  ['07', `${BASE}/7/index.html`],
  ['08', `${BASE}/8/index.html`],
  ['09', `${BASE}/9/index.html`],
  ['10', `${BASE}/10/index.html`],
];

const run = (n, url) => new Promise((res) => {
  const p = spawn(process.execPath, ['D:\\游戏\\_tools\\probe.mjs', url, `D:\\游戏\\_shots\\click_${n}.png`, '--wait=2500', `--eval=${EXPR}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let b = ''; p.stdout.on('data', d => b += d); p.stderr.on('data', d => b += d);
  p.on('close', () => {
    let j = null; try { j = JSON.parse(b); } catch {}
    let ev = null; try { ev = JSON.parse(j?.evalResult || 'null'); } catch {}
    res({ n, errors: (j?.errors || []).filter(e => !/favicon/.test(e)), ev });
  });
});

const out = [];
for (let i = 0; i < GAMES.length; i += 5) out.push(...await Promise.all(GAMES.slice(i, i + 5).map(([n, u]) => run(n, u))));
for (const r of out) {
  console.log(`${r.n}: blockers=${r.ev?.blockersOverCenter ?? '?'} top=${r.ev?.topEl ?? '?'} errors=${r.errors.length}`);
  for (const b of r.ev?.list || []) console.log(`     ${b.tag}#${b.id}.${b.cls}  why=${b.why}`);
}
