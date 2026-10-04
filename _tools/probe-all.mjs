// 批量探测十款游戏：收集报错 + 截图
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const OUT = process.env.OUT || 'D:\\游戏\\_shots';
const TAG = process.env.TAG || 'before';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

const GAMES = [
  { n: '01', name: '余烬之城', url: `${BASE}/1/${encodeURIComponent('余烬之城.html')}` },
  { n: '02', name: '星火拓荒', url: `${BASE}/2/index.html` },
  { n: '03', name: '拓城记', url: `${BASE}/3/index.html` },
  { n: '04', name: '深渊词条', url: `${BASE}/4/index.html` },
  { n: '05', name: '幻境争锋', url: `${BASE}/5/index.html` },
  { n: '06', name: '回声', url: `${BASE}/6/index.html` },
  { n: '07', name: '镜像迷城', url: `${BASE}/7/index.html` },
  { n: '08', name: '时间碎片', url: `${BASE}/8/index.html` },
  { n: '09', name: '星穹拓荒', url: `${BASE}/9/index.html` },
  { n: '10', name: '情绪花园', url: `${BASE}/10/index.html` },
];

fs.mkdirSync(OUT, { recursive: true });

function run(g) {
  return new Promise((resolve) => {
    const out = `${OUT}\\${g.n}_${TAG}.png`;
    const p = spawn(process.execPath, ['D:\\游戏\\_tools\\probe.mjs', g.url, out, '--wait=3500'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', d => buf += d);
    p.stderr.on('data', d => buf += d);
    p.on('close', () => {
      let parsed = null;
      try { parsed = JSON.parse(buf); } catch {}
      resolve({ ...g, code: p.exitCode, errors: parsed?.errors || [], fatal: parsed?.fatal, page: parsed?.page, logs: parsed?.logs });
    });
  });
}

const list = ONLY ? GAMES.filter(g => ONLY.includes(g.n)) : GAMES;
const results = [];
for (let i = 0; i < list.length; i += 5) {
  const batch = list.slice(i, i + 5);
  results.push(...await Promise.all(batch.map(run)));
}
fs.writeFileSync(`${OUT}\\_report_${TAG}.json`, JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.n} ${r.name}: exit=${r.code} errors=${r.errors.length}${r.fatal ? ' FATAL=' + r.fatal.slice(0, 200) : ''}`);
  for (const e of r.errors.slice(0, 4)) console.log('   ! ' + String(e).slice(0, 220));
}
