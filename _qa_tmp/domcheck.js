const fs = require('fs');
function jsIds(dir, files) {
  const set = new Set();
  for (const f of files) {
    const src = fs.readFileSync(dir + '/' + f, 'utf8');
    // $('id') / getElementById('id') / U.$('id')
    for (const m of src.matchAll(/\$\(\s*'([^']+)'\s*\)/g)) set.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) set.add(m[1]);
  }
  return [...set];
}
function htmlIds(file) {
  const src = fs.readFileSync(file, 'utf8');
  const set = new Set();
  for (const m of src.matchAll(/id="([^"]+)"/g)) set.add(m[1]);
  return set;
}
// game 3
const g3js = jsIds('D:/游戏/3/js', fs.readdirSync('D:/游戏/3/js').filter(f => f.endsWith('.js')));
const g3html = htmlIds('D:/游戏/3/index.html');
console.log('== Game 3 ==');
let miss3 = 0;
for (const id of g3js) {
  // selector-like ids we generate dynamically
  if (!g3html.has(id)) { console.log('  MISSING in index.html:', id); miss3++; }
}
if (!miss3) console.log('  all JS-referenced ids exist (' + g3js.length + ' checked)');

// game 9
const g9js = jsIds('D:/游戏/9/js', fs.readdirSync('D:/游戏/9/js').filter(f => f.endsWith('.js')));
const g9html = htmlIds('D:/游戏/9/index.html');
console.log('== Game 9 ==');
let miss9 = 0;
for (const id of g9js) {
  if (!g9html.has(id)) { console.log('  MISSING in index.html:', id); miss9++; }
}
if (!miss9) console.log('  all JS-referenced ids exist (' + g9js.length + ' checked)');

// also check ids referenced via $('#...') patterns in game9 (uses $ = document.getElementById wrapper?)
const src9 = fs.readdirSync('D:/游戏/9/js').map(f => fs.readFileSync('D:/游戏/9/js/' + f, 'utf8')).join('\n');
for (const m of src9.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) {
  if (!g9html.has(m[1])) console.log('  MISSING(9,$#):', m[1]);
}
// required new ids explicit check
const need3 = ['goal-strip', 'goal-drop', 'panel-body', 'alerts', 'banner', 'toasts', 'tooltip'];
const need9 = ['ns-badge', 'ns-list', 'save-timer', 'save-timer-val', 'ms-banner', 'tut-close', 'tut-title-bar', 'tut-title-txt', 'tut-panel', 'tut-list', 'res-energy', 'res-bar'];
console.log('== Explicit required ==');
for (const id of need3) if (!g3html.has(id)) console.log('  MISSING 3:', id);
for (const id of need9) if (!g9html.has(id)) console.log('  MISSING 9:', id);
console.log('DOM CHECK DONE');
