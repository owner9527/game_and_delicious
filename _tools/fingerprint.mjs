// 代码级"美术投入"指纹：对比改动前后各游戏渲染代码里美术 API 的使用量。
// 用法: node fingerprint.mjs <root> [tag]
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'D:\\游戏';
const tag = process.argv[3] || 'current';
const KEYS = [
  'createLinearGradient', 'createRadialGradient', 'createPattern', 'shadowBlur',
  'globalCompositeOperation', 'lighter', 'ellipse(', 'clip(', 'vignette', '暗角',
  'noise', 'noiseCanvas', 'makeNoise', 'particle', 'Particle', '粒子', 'dust', 'mote',
  'bezierCurveTo', 'quadraticCurveTo', 'arc(', 'lineTo', 'setLineDash',
  'linear-gradient', 'radial-gradient', 'inset', 'box-shadow', 'filter:', 'backdrop-filter',
  'animation', '@keyframes', 'clip-path', 'mix-blend-mode', 'createElement(\'canvas\')', 'OffscreenCanvas',
];

const files = [];
for (const d of fs.readdirSync(root)) {
  const full = path.join(root, d);
  if (!/^\d+$/.test(d) || !fs.statSync(full).isDirectory()) continue;
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) { if (!/node_modules|screenshots|test/i.test(e.name)) walk(q); }
      else if (/\.(js|css|html|mjs)$/i.test(e.name)) files.push({ game: d, file: q });
    }
  };
  walk(full);
}

const perGame = {};
for (const f of files) {
  const txt = fs.readFileSync(f.file, 'utf8');
  const g = perGame[f.game] ||= { bytes: 0, counts: {} };
  g.bytes += txt.length;
  for (const k of KEYS) g.counts[k] = (g.counts[k] || 0) + txt.split(k).length - 1;
}

const out = {};
for (const g of Object.keys(perGame).sort((a, b) => a - b)) {
  const c = perGame[g].counts;
  out[g] = {
    kb: Math.round(perGame[g].bytes / 1024),
    gradient: c.createLinearGradient + c.createRadialGradient + c['linear-gradient'] + c['radial-gradient'],
    pattern_noise: c.createPattern + c.noise + c.noiseCanvas + c.makeNoise + c["createElement('canvas')"] + c.OffscreenCanvas,
    lighting: c.shadowBlur + c.createRadialGradient + c.lighter + c['mix-blend-mode'] + c['filter:'],
    particles: c.particle + c.Particle + c['粒子'] + c.dust + c.mote,
    curves: c.bezierCurveTo + c.quadraticCurveTo + c['arc('] + c.lineTo,
    css_art: c.inset + c['box-shadow'] + c['@keyframes'] + c.animation + c['clip-path'] + c['backdrop-filter'],
    vignette: c.vignette + c['暗角'],
  };
}
console.log(tag);
console.log('编号  体积KB  渐变  纹理/噪点  光照/辉光  粒子  曲线   CSS美术  暗角');
for (const g of Object.keys(out)) {
  const o = out[g];
  console.log(`${g.padEnd(5)} ${String(o.kb).padStart(5)} ${String(o.gradient).padStart(5)} ${String(o.pattern_noise).padStart(10)} ${String(o.lighting).padStart(9)} ${String(o.particles).padStart(5)} ${String(o.curves).padStart(5)} ${String(o.css_art).padStart(8)} ${String(o.vignette).padStart(5)}`);
}
fs.writeFileSync(`D:\\游戏\\_shots\\_fingerprint_${tag}.json`, JSON.stringify(out, null, 2));
