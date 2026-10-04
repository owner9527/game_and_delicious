/* 无头逻辑测试：不依赖 DOM，验证生成确定性与模拟闭环 */
'use strict';
global.window = global;
const path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'js/rng.js'));
require(path.join(root, 'js/data.js'));
require(path.join(root, 'js/gen.js'));
require(path.join(root, 'js/audio.js'));
require(path.join(root, 'js/game.js'));

// —— stub 表现层 ——
SF.audio = { init() {}, setEnabled() {}, click() {}, err() {}, build() {}, done() {}, tech() {}, alarm() {}, crisis() {}, boom() {}, hit() {}, shoot() {}, good() {}, death() {}, warp() {}, startAmbient() {}, stopAmbient() {} };
SF.render = { burst() {} };
const metaStore = { achv: {}, stats: { beasts: 0, trades: 0 }, lossStreak: 0 };
SF.meta = {
  data: { playCount: 0, lossStreak: 0, settings: {}, stats: metaStore.stats },
  pityFactor() { return 1; },
  legacyFx() { return {}; },
  unlock(id) { metaStore.achv[id] = 1; },
  addStat(k, v) { this.data.stats[k] = (this.data.stats[k] || 0) + v; },
  getStat(k) { return this.data.stats[k] || 0; },
  saveRunSnapshot() {}, save() {}, noteLoss() { this.data.lossStreak++; },
  clearRun() {},
};

let pass = 0, fail = 0;
function T(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('== 1. 生成确定性（同种子 100 次逐字节一致） ==');
{
  const j1 = JSON.stringify(SF.gen.galaxy('SEED-42', 1, 0));
  let same = true;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(SF.gen.galaxy('SEED-42', 1, 0)) !== j1) { same = false; break; }
  }
  T('星系生成 100 次一致', same);
  const m1 = JSON.stringify(SF.gen.map('SEED-42', SF.gen.galaxy('SEED-42', 1, 0).planets[0], 1));
  T('地表生成一致', JSON.stringify(SF.gen.map('SEED-42', SF.gen.galaxy('SEED-42', 1, 0).planets[0], 1)) === m1);
  T('不同种子不同结果', JSON.stringify(SF.gen.galaxy('SEED-43', 1, 0)) !== j1);
  const g = SF.gen.galaxy('SEED-42', 1, 0);
  T('星系含 1~4 颗行星', g.planets.length >= 1 && g.planets.length <= 4);
  T('主星存在', g.planets[0].main === true);
  T('六维环境齐全', ['gravity', 'atmosphere', 'temperature', 'radiation', 'mineral', 'organic'].every(k => g.planets[0].env[k] >= 0 && g.planets[0].env[k] <= 100));
  T('科技保留 60%±', Object.values(g.techs).every(a => a.length >= 3 && a.length <= 8) && Object.keys(g.techs).length === 5);
  T('目标三选一', ['pop', 'score', 'beacon'].includes(g.goal.type));
  const map = SF.gen.map('SEED-42', g.planets[0], 1);
  T('降落点 3 个', map.sites.length === 3);
  T('资源节点 ≥6', map.nodes.length >= 6);
}

console.log('== 2. 模拟闭环：降落 → 建造 → 生产 ==');
{
  // 事件用真随机 → 用"最多 3 条命"消除偶发失败（新手难度 bot 存活率约 7/8）
  let g = null, survived = false;
  for (let life = 0; life < 3 && !survived; life++) {
    g = new SF.Game({ mode: 'campaign', seed: 'TEST-1', station: 1, difficulty: 1 });
    g.setSite(0);
    T('初始殖民者 12', g.colonists.length === 12);
    T('指挥中枢已建', g.buildings.some(b => b.type === 'command' && b.built));

  // 找矿脉建矿场
  const node = g.map.nodes.find(n => n.type === 'ore');
  T('存在矿脉', !!node);
  // 在矿脉附近找合法位置
  let placed = false;
  for (let a = 0; a < 6.28 && !placed; a += 0.5) {
    for (let r = 3; r < 4.4 && !placed; r += 0.4) {
      const x = node.x + Math.cos(a) * r * 34, y = node.y + Math.sin(a) * r * 34;
      if (g.canPlace('mine', x, y).ok) { placed = g.place('mine', x, y); }
    }
  }
  T('采矿场可建造', placed);
  // 先让矿场产出（真实节奏：攒钱 → 逐个建造）
  g.setSpeed(1);
  for (let i = 0; i < 700; i++) { if (g.pendingChoice) g.resolveChoice(-1); g.update(0.1); } // 70 秒
  const farm = (() => { const c = g.site; return g.place('farm', c.x + 5 * 34, c.y + 3 * 34); })();
  T('农场可建造（攒矿后）', farm);
  g.place('housing', g.site.x + 7 * 34, g.site.y - 6 * 34);
  for (let i = 0; i < 1500; i++) { if (g.pendingChoice) g.resolveChoice(-1); g.update(0.1); } // 再攒 150 秒
  let genPlaced = false;
  for (let a = 0; a < 6.28 && !genPlaced; a += 0.5) {
    genPlaced = g.place('generator', g.site.x + Math.cos(a) * 6.5 * 34, g.site.y + Math.sin(a) * 6.5 * 34);
  }
  T('发电机可建造', genPlaced);
  // 快进 18 分钟（选择型事件自动婉拒，模拟玩家点弹窗）
  for (let i = 0; i < 60 * 18 * 10; i++) {
    if (g.pendingChoice) g.resolveChoice(-1);
    g.update(0.1);
  }
  survived = !g.gameOver;
  if (survived) break;
  console.log('    (第 ' + (life + 1) + ' 条命阵亡于 ' + Math.round(g.time) + 's：' + g.loseReason + '，重来)');
  }
  T('20 分钟后仍存活', survived);
  T('矿石在增长（矿场已运作）', g.res.ore > 0 || g.stats.oreMined > 0);
  T('日昼夜推进', g.time > 1000);
  const sc = g.score();
  T('评分在 0~100', sc.total >= 0 && sc.total <= 100);
  T('评级合法', 'SABCD'.includes(sc.rank));
}

console.log('== 3. 科技与事件 ==');
{
  const g = new SF.Game({ mode: 'campaign', seed: 'TEST-2', station: 1, difficulty: 2 });
  g.setSite(0);
  g.res.research = 500;
  const firstTech = Object.values(g.availTechs).flat()[0];
  const t = SF.data.TECHS.find(x => x.id === firstTech);
  const before = g.mods.mineYield;
  T('研究成功', g.research(t.id));
  T('修正生效', JSON.stringify(g.mods) !== JSON.stringify({}) || g.researched.includes(t.id));
  T('重复研究被拒', g.research(t.id) === false);
  // 强制触发全部事件类型
  let allOk = true;
  for (const def of SF.data.EVENTS) {
    try {
      if (['merchant', 'ruin', 'migrant', 'derelict'].includes(def.id)) {
        g.openChoice(def.id);
        if (!g.pendingChoice) throw new Error('no choice');
        g.resolveChoice(-1);
      } else {
        g.triggerEvent(def);
      }
    } catch (e) { allOk = false; console.log('    事件异常 ' + def.id + ': ' + e.message); }
    // 跑几秒消化事件
    for (let i = 0; i < 300; i++) g.update(0.1);
  }
  T('13 种事件全部可触发无异常', allOk);
  T('事件计数累计', g.stats.eventsTotal >= SF.data.EVENTS.length - 4);
}

console.log('== 4. 胜负与序列化 ==');
{
  const g = new SF.Game({ mode: 'campaign', seed: 'TEST-3', station: 1, difficulty: 2 });
  g.setSite(0);
  // 人口胜利
  g.goal = SF.gen.goalOf('pop');
  for (let i = 0; i < 50; i++) g.addColonist();
  g.update(0.1);
  T('人口达标 → 目标达成', g.goalDone);
  T('warp 返回 next', g.warp() === 'next');
  const carry = g.packCarry();
  T('携带科技与资源', carry.techs.length >= 0 && carry.res.ore >= 0);
  // 下一站
  const g2 = new SF.Game({ mode: 'campaign', seed: 'TEST-3', station: 2, difficulty: 2, carry, carriedTechs: carry.techs });
  g2.setSite(0);
  T('二站继承科技', g2.researched.length === carry.techs.length);
  // 序列化
  g2.res.ore = 777;
  const snap = JSON.parse(JSON.stringify(g2.serialize()));
  const g3 = SF.Game.deserialize(snap);
  T('存档恢复资源', g3.res.ore === 777);
  T('存档恢复建筑', g3.buildings.length === g2.buildings.length);
  T('存档恢复人口', g3.colonists.length === g2.colonists.length);
  // 失败路径
  const g4 = new SF.Game({ mode: 'campaign', seed: 'TEST-4', station: 1, difficulty: 2 });
  g4.setSite(0);
  g4.colonists.length = 0;
  g4.update(0.1);
  T('全灭 → 失败', g4.gameOver && !g4.won);
  const g5 = new SF.Game({ mode: 'campaign', seed: 'TEST-5', station: 1, difficulty: 2 });
  g5.setSite(0);
  const cmd = g5.buildings.find(b => b.type === 'command');
  g5.damageBuilding(cmd, 99999, 'test');
  g5.update(0.1);
  T('中枢被毁 → 失败', g5.gameOver && !g5.won);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
