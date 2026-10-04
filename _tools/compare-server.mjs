// 对比：服务器现有文件 vs 本地「改造前备份」 vs 本地「当前版本」
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SERVER_TXT = 'D:\\游戏\\_shots\\_server_md5.txt';
const MAP = {
  '1': 'game/yujin', '2': 'game/xinghuo', '3': 'game/tuocheng', '4': 'game/shenyuan',
  '5': 'game/zhanqi', '6': 'game/echo', '7': 'mirror-maze', '8': 'game/shijian',
  '9': 'game/xingqiong', '10': 'game/huayuan',
};
// 本地文件夹里的入口文件名 → 服务器上的文件名
const RENAME = { '余烬之城.html': 'index.html' };

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

// 解析服务器清单
const server = {};
let cur = null;
for (const line of fs.readFileSync(SERVER_TXT, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^###\s+(\d+)\s+->\s+(.+)$/);
  if (m) { cur = m[1]; server[cur] = {}; continue; }
  const f = line.match(/^([0-9a-f]{32})\s+(.+)$/);
  if (f && cur) server[cur][f[2].trim()] = f[1];
}

// 收集本地文件（相对路径 → md5），忽略 README/工具
function collect(root) {
  const out = {};
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (/^(tools|tests?|gui-test-screenshots|_)/i.test(e.name)) continue;
        walk(path.join(dir, e.name), r);
      } else if (/\.(js|css|html)$/i.test(e.name)) {
        const name = RENAME[e.name] || e.name;
        const key = rel ? rel + '/' + name : name;
        out[key] = md5(path.join(dir, e.name));
      }
    }
  };
  walk(root, '');
  return out;
}

const before = {}, after = {};
for (const n of Object.keys(MAP)) {
  before[n] = collect(path.join('D:\\游戏\\_backup_before_art', n));
  after[n] = collect(path.join('D:\\游戏', n));
}

let totalSame = 0, totalDiff = 0, totalNew = 0, totalMissing = 0;
const report = [];
for (const n of Object.keys(MAP)) {
  const s = server[n] || {};
  const keys = new Set([...Object.keys(s), ...Object.keys(before[n] || {}), ...Object.keys(after[n] || {})]);
  const rows = [];
  for (const k of [...keys].sort()) {
    const sv = s[k], bv = before[n]?.[k], av = after[n]?.[k];
    let status;
    if (sv === undefined) { status = '服务器没有'; totalNew++; }
    else if (sv === bv && sv === av) { status = '三方一致'; totalSame++; }
    else if (sv === bv) { status = '服务器=改前(可安全覆盖)'; totalDiff++; }
    else if (sv === av) { status = '服务器=改后(已是最新)'; totalSame++; }
    else { status = '⚠ 服务器版本与本地都不同'; totalMissing++; }
    rows.push({ k, status });
  }
  report.push({ n, dir: MAP[n], rows });
}

console.log('编号  服务器目录            文件数  服务器=改前  服务器=改后/一致  服务器独有  ⚠差异');
for (const r of report) {
  const c = (p) => r.rows.filter(x => x.status.includes(p)).length;
  console.log(
    `${r.n.padEnd(5)} ${r.dir.padEnd(22)} ${String(r.rows.length).padStart(5)} ` +
    `${String(c('可安全覆盖')).padStart(11)} ${String(c('改后') + c('三方一致')).padStart(17)} ` +
    `${String(c('服务器没有')).padStart(10)} ${String(c('⚠')).padStart(7)}`
  );
}
console.log(`\n合计：一致/已最新 ${totalSame}，服务器=改前 ${totalDiff}，服务器没有 ${totalNew}，⚠本地与服务器都不同 ${totalMissing}`);

const warn = report.flatMap(r => r.rows.filter(x => x.status.includes('⚠')).map(x => `${r.dir}/${x.k}`));
if (warn.length) {
  console.log('\n需要人工确认的文件：');
  for (const w of warn) console.log('  ' + w);
}
