// 静态审计：找出 this.X(...) 调用但在同类/同文件里找不到定义的方法 —— 这类"调用了不存在的方法"会直接崩游戏。
// 用法: node _tools/audit-methods.mjs <js文件...>
import fs from 'node:fs';

const files = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { console.log('读不到 ' + f); continue; }

  // 收集所有"定义"位置：X(...) { 、X: function、X = function、function X(、this.X = ...
  const defined = new Set();
  for (const m of txt.matchAll(/(?:^|[\s,{;])([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) defined.add(m[1]);
  for (const m of txt.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*function/g)) defined.add(m[1]);
  for (const m of txt.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\()/g)) defined.add(m[1]);
  for (const m of txt.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const m of txt.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$.]*\s*=>/g)) defined.add(m[1]);
  // this.X = ... （构造函数/初始化里的赋值，属于已定义）
  for (const m of txt.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) defined.add(m[1]);
  // X.prototype.y = ... / Object.assign(X.prototype, {...})
  for (const m of txt.matchAll(/\.prototype\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  for (const m of txt.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:function|\()/gm)) defined.add(m[1]);

  const called = new Map();
  for (const m of txt.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = m[1];
    if (!called.has(n)) called.set(n, 0);
    called.set(n, called.get(n) + 1);
  }

  const missing = [...called.keys()].filter(n => !defined.has(n));
  if (missing.length) {
    bad++;
    console.log(`\n${f}`);
    for (const n of missing) console.log(`  ✘ this.${n}(...) 调用了 ${called.get(n)} 次，但找不到定义`);
  } else {
    console.log(`${f}  ✔ 未发现"调用了不存在的方法"`);
  }
}
process.exit(bad ? 2 : 0);
