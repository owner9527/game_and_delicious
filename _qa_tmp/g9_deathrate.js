/* Compare survival rate current vs backup for the headless scenario */
'use strict';
const path = require('path');
const which = process.argv[2] || 'D:/游戏/9';
const N = Number(process.argv[3] || 12);
global.window = global;
const root = path.join(which);
require(path.join(root, 'js/rng.js'));
require(path.join(root, 'js/data.js'));
require(path.join(root, 'js/gen.js'));
require(path.join(root, 'js/audio.js'));
require(path.join(root, 'js/game.js'));
SF.audio = { init(){}, setEnabled(){}, click(){}, err(){}, build(){}, done(){}, tech(){}, alarm(){}, crisis(){}, boom(){}, hit(){}, shoot(){}, good(){}, death(){}, warp(){}, startAmbient(){}, stopAmbient(){} };
SF.render = { burst(){} };
SF.meta = { data:{playCount:0,lossStreak:0,settings:{},stats:{}}, pityFactor(){return 1;}, legacyFx(){return{};}, unlock(){}, addStat(){}, getStat(){return 0;}, saveRunSnapshot(){}, save(){}, noteLoss(){}, clearRun(){} };

let survivedCount = 0; const deaths = [];
for (let run = 0; run < N; run++) {
  let g = null, survived = false;
  for (let life = 0; life < 3 && !survived; life++) {
    g = new SF.Game({ mode: 'campaign', seed: 'TEST-1', station: 1, difficulty: 1 });
    g.setSite(0);
    const node = g.map.nodes.find(n => n.type === 'ore');
    let placed = false;
    for (let a = 0; a < 6.28 && !placed; a += 0.5) {
      for (let r = 3; r < 4.4 && !placed; r += 0.4) {
        const x = node.x + Math.cos(a) * r * 34, y = node.y + Math.sin(a) * r * 34;
        if (g.canPlace('mine', x, y).ok) { placed = g.place('mine', x, y); }
      }
    }
    g.setSpeed(1);
    for (let i = 0; i < 700; i++) { if (g.pendingChoice) g.resolveChoice(-1); g.update(0.1); }
    g.place('farm', g.site.x + 5 * 34, g.site.y + 3 * 34);
    g.place('housing', g.site.x + 7 * 34, g.site.y - 6 * 34);
    for (let i = 0; i < 1500; i++) { if (g.pendingChoice) g.resolveChoice(-1); g.update(0.1); }
    let genPlaced = false;
    for (let a = 0; a < 6.28 && !genPlaced; a += 0.5) {
      genPlaced = g.place('generator', g.site.x + Math.cos(a) * 6.5 * 34, g.site.y + Math.sin(a) * 6.5 * 34);
    }
    for (let i = 0; i < 60 * 18 * 10; i++) {
      if (g.pendingChoice) g.resolveChoice(-1);
      g.update(0.1);
    }
    survived = !g.gameOver;
    if (!survived) deaths.push(g.loseReason + '@' + Math.round(g.time));
  }
  if (survived) survivedCount++;
}
console.log(which, '=> survived', survivedCount + '/' + N, '| deaths:', deaths.join(' ; ') || 'none');
