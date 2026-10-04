// 把 _artblock.js 的内容替换进游戏 HTML 的 /*==ART==*/ … /*==END-ART==*/ 之间。
import fs from 'node:fs';

const htmlPath = 'D:\\游戏\\1\\余烬之城.html';
const blockPath = 'D:\\游戏\\_tools\\_artblock.js';

const A = '/*==ART==*/';
const B = '/*==END-ART==*/';

const html = fs.readFileSync(htmlPath, 'utf8');
const block = fs.readFileSync(blockPath, 'utf8');

const i = html.indexOf(A);
const j = html.indexOf(B);
if (i < 0 || j < 0 || j < i) { console.error('哨兵未找到'); process.exit(1); }
if (html.indexOf(A, i + 1) >= 0 || html.indexOf(B, j + 1) >= 0) { console.error('哨兵重复'); process.exit(1); }

const before = html.slice(0, i);
const after = html.slice(j + B.length);
const out = before + block.trimEnd() + '\n' + after;

fs.writeFileSync(htmlPath, out, 'utf8');
fs.writeFileSync('D:\\游戏\\_tools\\_splice_report.json', JSON.stringify({
  htmlBytesBefore: html.length, htmlBytesAfter: out.length,
  replacedFrom: i, replacedTo: j + B.length, newBlockBytes: block.length,
}, null, 2), 'utf8');
console.log('SPLICE_OK');
