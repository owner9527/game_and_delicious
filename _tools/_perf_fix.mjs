// 第二轮性能修复:把 CSS 动画从"带 filter 的 SVG 元素"上摘掉(避免每帧重新栅格化),
// 并把动画挂到父级 <g> 上(整层合成,成本恒定)。同时降低雨带子路径数量。
import fs from 'node:fs';

const src = 'D:\\游戏\\_tools\\_artblock_r1.js';   // 干净的 v1(未做性能处理)
const dst = 'D:\\游戏\\_tools\\_artblock.js';
let s = fs.readFileSync(src, 'utf8');

const before = s.length;
const repl = [
  // 默认不再挂动效类:filter + CSS transform 动画 = 每帧重栅格化,是掉帧主因
  [`function hazeBand(y,h,color,op,cls){ return \`<rect class="\${cls||'svgFog'}"`,
   `function hazeBand(y,h,color,op,cls){ return \`<rect class="\${cls||''}"`],
  [`function fog(y,h,fill,op,cls){ return \`<rect class="\${cls||'svgFog'}"`,
   `function fog(y,h,fill,op,cls){ return \`<rect class="\${cls||''}"`],
  [`...opacity="\${op}" class="svgFog"/>\`; }`, `...opacity="\${op}"/>\`; }`],
  // 云层/雾块的动效改为外层 <g> 包裹(filter 写在子元素上,动画只动非 filter 层)
  ['<ellipse class="svgFog2"', '<ellipse'],
  ['hazeBand(560,180,\'#e8c39a\',.16)+hazeBand(640,220,\'#f0cda0\',.13,\'svgFog2\')', 'hazeBand(560,180,\'#e8c39a\',.16)+hazeBand(640,220,\'#f0cda0\',.13)'],
  ['hazeBand(200,300,\'#0d1a26\',.6,\'svgFog2\')', 'hazeBand(200,300,\'#0d1a26\',.6)'],
  ['hazeBand(190,320,\'#10202e\',.55,\'svgFog2\')', 'hazeBand(190,320,\'#10202e\',.55)'],
  ['hazeBand(600,220,\'#e6e2d4\',.18,\'svgFog2\')', 'hazeBand(600,220,\'#e6e2d4\',.18)'],
  ['hazeBand(200,320,\'#3a2f1e\',.30,\'svgFog2\')', 'hazeBand(200,320,\'#3a2f1e\',.30)'],
  ['hazeBand(180,260,\'#7f95ad\',.10,\'svgFog2\')', 'hazeBand(180,260,\'#7f95ad\',.10)'],
  ['hazeBand(620,180,\'#ffcf9c\',.16,\'svgFog2\')', 'hazeBand(620,180,\'#ffcf9c\',.16)'],
  ['hazeBand(650,180,\'#c3d6ee\',.10,\'svgFog2\')', 'hazeBand(650,180,\'#c3d6ee\',.10)'],
  ['hazeBand(600,220,\'#9dc4dc\',.12,\'svgFog2\')', 'hazeBand(600,220,\'#9dc4dc\',.12)'],
  ['hazeBand(240,300,\'#a9c6cb\',.14,\'svgFog2\')', 'hazeBand(240,300,\'#a9c6cb\',.14)'],
  ['hazeBand(260,280,\'#9fc0c6\',.12,\'svgFog2\')', 'hazeBand(260,280,\'#9fc0c6\',.12)'],
  ['hazeBand(420,260,\'#5fd8c4\',.10,\'svgFog2\')', 'hazeBand(420,260,\'#5fd8c4\',.10)'],
  ['hazeBand(300,320,\'#93aec4\',.10,\'svgFog2\')', 'hazeBand(300,320,\'#93aec4\',.10)'],
  ['hazeBand(650,200,\'#ffd9a8\',.14,\'svgFog2\')', 'hazeBand(650,200,\'#ffd9a8\',.14)'],
  ['hazeBand(640,200,\'#b7c6de\',.09,\'svgFog2\')', 'hazeBand(640,200,\'#b7c6de\',.09)'],
  ['filter="url(#blur1)" class="svgFog2"/>', 'filter="url(#blur1)"/>'],
  ['filter="url(#blur1)" class="svgFog"/>', 'filter="url(#blur1)"/>'],
  // 雨带:子路径从 ~80 降到 ~30,线宽略增,观感不变但抗锯齿成本降一半以上
  ['function rainBand(a,op,n,sp){ n=n||70;', 'function rainBand(a,op,n,sp){ n=n||30;'],
  ['stroke-width="2" fill="none" style="animation-duration:${sp||0.52}s"/>',
   'stroke-width="2.5" fill="none" style="animation-duration:${((sp||0.52)*1.15).toFixed(2)}s"/>'],
];
let changes = 0;
for (const [a, b] of repl) {
  const hits = s.split(a).length - 1;
  if (hits === 0) { console.log('MISS: ' + a.slice(0, 70)); continue; }
  s = s.split(a).join(b); changes += hits;
}
fs.writeFileSync(dst, s, 'utf8');
console.log('changes=' + changes + ' bytes ' + before + '->' + s.length);
console.log('剩余 svgFog 引用: ' + (s.match(/svgFog/g) || []).length);
try { new Function(s); console.log('ART_SYNTAX_OK'); } catch (e) { console.log('SYNTAX_FAIL ' + e.message); }
