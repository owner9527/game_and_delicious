// 把一个游戏目录同步到服务器（只传有差异的文件，先备份，再校验 MD5）
// 用法: node deploy-game.mjs <本地目录> <服务器目录> [--apply]
//   例: node deploy-game.mjs 3 game/tuocheng --apply
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const HOST = 'root@47.94.215.84';
const KEY = path.join(os.homedir(), '.ssh', 'id_ed25519');
const SITE = '/var/www/site';
const SSH = ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20'];

const [localArg, remoteArg, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
if (!localArg || !remoteArg) { console.error('用法: node deploy-game.mjs <本地目录> <服务器目录> [--apply]'); process.exit(1); }

const localDir = path.resolve('D:\\游戏', localArg);
const remoteDir = remoteArg.replace(/^\/+|\/+$/g, '');

// 只同步运行需要的文件，和最初部署时的范围一致
const ALLOW_TOP = new Set(['index.html', 'style.css', 'README.md', '余烬之城.html']);
const ALLOW_DIR = new Set(['css', 'js']);

function collect(dir) {
  const out = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!ALLOW_DIR.has(e.name)) continue;
      for (const f of fs.readdirSync(p)) out[e.name + '/' + f] = path.join(p, f);
    } else if (ALLOW_TOP.has(e.name)) {
      out[e.name === '余烬之城.html' ? 'index.html' : e.name] = p;
    }
  }
  return out;
}

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const ssh = (cmd) => execFileSync('ssh', [...SSH, HOST, cmd], { encoding: 'utf8' });
const scp = (from, to) => execFileSync('scp', [...SSH, from, `${HOST}:${to}`], { encoding: 'utf8' });

const local = collect(localDir);
if (!Object.keys(local).length) { console.error('本地没有可同步的文件: ' + localDir); process.exit(1); }

const remoteOut = ssh(`cd ${SITE}/${remoteDir} && md5sum $(find . -type f -name '*.js' -o -type f -name '*.css' -o -type f -name '*.html' | sed 's|^\\./||') 2>/dev/null`);
const remote = {};
for (const line of remoteOut.split('\n')) {
  const m = line.match(/^([0-9a-f]{32})\s+(.+)$/);
  if (m) remote[m[2].trim()] = m[1];
}

const changed = [], same = [], missingRemote = [];
for (const [rel, abs] of Object.entries(local)) {
  const h = md5(abs);
  if (!remote[rel]) missingRemote.push(rel);
  else if (remote[rel] !== h) changed.push(rel);
  else same.push(rel);
}
const onlyRemote = Object.keys(remote).filter(r => !local[r]);

console.log(`【${localArg} → ${remoteDir}】`);
console.log(`  本地文件 ${Object.keys(local).length} 个：一致 ${same.length}，有差异 ${changed.length}，服务器缺失 ${missingRemote.length}`);
if (changed.length) console.log('  差异: ' + changed.join(', '));
if (missingRemote.length) console.log('  服务器缺失: ' + missingRemote.join(', '));
if (onlyRemote.length) console.log('  仅服务器有(保留不动): ' + onlyRemote.join(', '));

const todo = [...changed, ...missingRemote];
if (!todo.length) { console.log('  ✔ 已经是最新，无需上传'); process.exit(0); }
if (!APPLY) { console.log('  （加 --apply 才会真的上传）'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bak = `/root/${remoteDir.replace(/\//g, '_')}-backup-${stamp}.tar.gz`;
ssh(`cd ${SITE} && tar czf ${bak} ${remoteDir} && echo ok`);
console.log(`  已备份: ${bak}`);

for (const rel of todo) {
  const tmp = `/tmp/dep_${Math.random().toString(36).slice(2, 8)}_${path.basename(rel)}`;
  scp(local[rel], tmp);
  ssh(`install -o www-data -g www-data -m 644 ${tmp} ${SITE}/${remoteDir}/${rel} && rm -f ${tmp}`);
}
ssh(`chown -R www-data:www-data ${SITE}/${remoteDir}`);
console.log(`  已上传 ${todo.length} 个文件并修正属主`);

const after = ssh(`cd ${SITE}/${remoteDir} && md5sum ${todo.join(' ')}`);
let ok = 0, bad = [];
for (const line of after.split('\n')) {
  const m = line.match(/^([0-9a-f]{32})\s+(.+)$/);
  if (!m) continue;
  if (md5(local[m[2].trim()]) === m[1]) ok++; else bad.push(m[2]);
}
console.log(`  校验: ${ok}/${todo.length} 一致` + (bad.length ? `  ✘ 不一致: ${bad.join(', ')}` : '  ✔'));
