// 交付前一致性核查:确认本次只改了表现层(CSS + <style> + ART 模块),
// 剧情数据(STORY)、纯逻辑层(LOGIC)、存档写入逻辑与 localStorage 键名一字未动。
import fs from 'node:fs';

const a = fs.readFileSync('D:\\游戏\\_backup_before_art\\余烬之城.html.bak', 'utf8');
const b = fs.readFileSync('D:\\游戏\\1\\余烬之城.html', 'utf8');

const part = (s, tag) => {
  const i = s.indexOf('/*==' + tag + '==*/');
  const j = s.indexOf('/*==END-' + tag + '==*/');
  return s.slice(i, j);
};

for (const t of ['STORY', 'LOGIC']) {
  const A = part(a, t), B = part(b, t);
  console.log(t.padEnd(6) + ' 剧情/逻辑段字节: before=' + A.length + ' after=' + B.length + ' 内容完全一致=' + (A === B));
}

const styleOf = s => { const i = s.indexOf('<style>'), j = s.indexOf('</style>'); return s.slice(i, j); };
console.log('STYLE  样式段: before=' + styleOf(a).length + ' after=' + styleOf(b).length + '(有意改动)');

const bodyOf = s => s.slice(s.indexOf('<body>'), s.indexOf('<script>'));
const ba = bodyOf(a), bb = bodyOf(b);
console.log('BODY   HTML 骨架一致=' + (ba === bb) + ' (before ' + ba.length + ' / after ' + bb.length + ')');

const re = /function saveGame\(\)\{[\s\S]*?\n\}/;
console.log('saveGame() 一致=' + (re.exec(a)[0] === re.exec(b)[0]));
const kre = /const (SAVE_KEY|GAL_KEY|SET_KEY)\s*=\s*[^;]+;/g;
console.log('storage 键名 before: ' + JSON.stringify(a.match(kre)));
console.log('storage 键名 after : ' + JSON.stringify(b.match(kre)));
const nre = /^\s{4}"[a-z0-9_]+":\s*\{/gm;
console.log('STORY 节点数 before/after: ' + (part(a, 'STORY').match(nre) || []).length + ' / ' + (part(b, 'STORY').match(nre) || []).length);
const ere = /"[Ee]\d{2}":\s*\{name:/g;
console.log('结局数 before/after: ' + (a.match(ere) || []).length + ' / ' + (b.match(ere) || []).length);
const gre = /function applySet[\s\S]*?\n\}/;
console.log('applySet() 一致=' + (gre.exec(a)[0] === gre.exec(b)[0]));
const cre = /function cmp\(v, expr\)[\s\S]*?\n\}/;
console.log('cmp() 一致=' + (cre.exec(a)[0] === cre.exec(b)[0]));
const fre = /function freshState\(\)\{[\s\S]*?\n\}/;
console.log('freshState() 一致=' + (fre.exec(a)[0] === fre.exec(b)[0]));
