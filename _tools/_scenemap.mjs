// 列出每个 scene key 对应的可用 story 节点 id(第一个作为代表),用于截图验证。
import fs from 'node:fs';
const s = fs.readFileSync('D:\\游戏\\1\\余烬之城.html', 'utf8');
const m = s.match(/<script>([\s\S]*)<\/script>/)[1];
const st = m.slice(m.indexOf('const STORY'), m.indexOf('/*==END-STORY==*/'));
const lines = st.split('\n');
let cur = null; const map = {};
for (const l of lines) {
  const idm = l.match(/^\s{4}"([a-z0-9_]+)"\s*:\s*\{/);
  if (idm) cur = idm[1];
  const scm = l.match(/scene:"([a-z_]+)"/);
  if (scm && cur) (map[scm[1]] = map[scm[1]] || []).push(cur);
}
fs.writeFileSync('D:\\游戏\\_tools\\_scenemap.json', JSON.stringify(map, null, 2), 'utf8');
console.log(JSON.stringify(map, null, 1));
