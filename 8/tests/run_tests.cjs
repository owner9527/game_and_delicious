/* ============================================================
 * 时间碎片 — 测试套件（Node 直接运行：node tests/run_tests.cjs）
 * ① 引擎单元测试：传播/衰减/悖论/风暴/撤销树/结算
 * ② 关卡自动验证器：全部主线+BOSS+回响+实验室+裂隙 BFS 可解性（≤标准解步数）
 * ③ 数据完整性：规则槽位越界 / 叙事碎片引用
 * ④ 生成器模糊测试：构造解必胜
 * ============================================================ */
'use strict';
const path = require('path');
const root = globalThis;
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'data_levels.js'));
require(path.join(__dirname, '..', 'js', 'data_levels_b.js'));
require(path.join(__dirname, '..', 'js', 'data_story.js'));

const E = root.TSEngine, LV = root.TSLevels, ST = root.TSStory;
const TRACKS = E.TRACKS;

let pass = 0, fail = 0;
const failures = [];
function T(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

/* ================= ① 引擎单元测试 ================= */
function engineTests() {
  section('引擎单元测试');
  const def = {
    id: 't', par: 2, interactive: ['past', 'present', 'future'],
    slots: { past: 2, present: 2, future: 2 },
    entities: [{ id: 'a', name: '甲', icon: 'A' }, { id: 'b', name: '乙', icon: 'B' }],
    dict: { 'a.bad': '坏', 'a.good': '好', 'b.off': '断', 'b.on': '通' },
    initial: [{ t: 'past', s: 0, e: 'a', st: 'bad' }],
    goals: [{ t: 'present', s: 1, e: 'b', st: 'on' }],
    shards: [
      { kind: 'trigger', id: 'fixa', name: '修甲', icon: 'x', entity: 'a', track: 'past', setState: 'good' },
      { kind: 'trigger', id: 'fixb', name: '通乙', icon: 'y', entity: 'b', track: 'present', setState: 'on' },
    ],
    rules: [
      { id: 'r1', when: { t: 'past', s: 0, e: 'a', st: 'good' }, then: [{ t: 'present', s: 0, e: 'a', st: 'good' }] },
      { id: 'r2', when: { t: 'present', s: 0, e: 'a', st: 'good' }, then: [{ t: 'present', s: 1, e: 'b', st: 'on' }] },
      { id: 'r3', when: { t: 'present', s: 1, e: 'b', st: 'on' }, then: [{ t: 'future', s: 1, e: 'b', st: 'on' }], min: 60 },
    ],
  };

  // 1.1 涟漪传播与衰减
  {
    const g = new E.Game(def);
    g.applyOp({ shardId: 'fixa', target: { t: 'past', s: 0 } });
    T('传播：一跳后现在线乙接通（目标达成）', g.goalsDone());
    const hop1 = g.activeEdges.find(e => e.rule === 'r1');
    const hop2 = g.activeEdges.find(e => e.rule === 'r2');
    T('衰减律：hop1 强度 70', hop1 && hop1.strength === 70, hop1 && hop1.strength);
    T('衰减律：hop2 强度 49', hop2 && hop2.strength === 49, hop2 && hop2.strength);
    const blocked = g.lastWave.find(w => w.type === 'blocked');
    T('衰减律：hop3 低于阈值被阻断（涟漪消散）', !!blocked);
    T('步数计数 = 1', g.steps === 1);
    T('星级 = 3（≤ 标准解）', g.stars() === 3);
    T('得分构成完好度 50 分', g.score().integrity === 50, g.score().integrity);
  }

  // 1.2 无效操作惩罚
  {
    const g = new E.Game(def);
    const ok = g.applyOp({ shardId: 'fixb', target: { t: 'present', s: 0 } });
    T('trigger 可在任意格写入', ok === true);
    const g2 = new E.Game(def);
    g2.applyOp({ shardId: 'fixa', target: { t: 'future', s: 0 } }); // track 限制
    T('碎片线别不符 → 无效并扣 5 完整度', g2.integrity === 95, g2.integrity);
    T('无效操作不计步数', g2.steps === 0);
  }

  // 1.3 单向律：锁定线不可操作
  {
    const d2 = JSON.parse(JSON.stringify(def));
    d2.interactive = ['past'];
    const g = new E.Game(d2);
    g.applyOp({ shardId: 'fixb', target: { t: 'present', s: 0 } });
    T('单向律：非交互线操作被拒', g.integrity === 95 && g.invalidOp && g.invalidOp.code === 'LOCKED');
  }

  // 1.4 悖论风暴：同刻异位
  {
    const d3 = JSON.parse(JSON.stringify(def));
    d3.initial.push({ t: 'past', s: 1, e: 'b', st: 'off' });
    d3.shards.push({ kind: 'trigger', id: 'chaos', name: '乱', icon: 'z', entity: 'b', track: 'past', setState: 'x' });
    d3.rules.push({ id: 'cA', when: { t: 'past', s: 1, e: 'b', st: 'x' }, then: [{ t: 'future', s: 1, e: 'b', st: 'p' }] });
    d3.rules.push({ id: 'cB', when: { t: 'past', s: 1, e: 'b', st: 'x' }, then: [{ t: 'future', s: 1, e: 'b', st: 'q' }] });
    const g = new E.Game(d3);
    g.applyOp({ shardId: 'chaos', target: { t: 'past', s: 1 } });
    T('悖论惩罚律：冲突触发风暴扣 15', g.storms === 1 && g.integrity === 85, `storms=${g.storms} itg=${g.integrity}`);
    T('风暴回退最近 3 步（只有 1 步则回初始）', g.steps === 0);
    g.applyOp({ shardId: 'chaos', target: { t: 'past', s: 1 } });
    g.applyOp({ shardId: 'chaos', target: { t: 'past', s: 1 } });
    T('风暴满 3 次 → 时间崩塌', g.state === 'collapsed');
  }

  // 1.5 悖论护符
  {
    const d3 = JSON.parse(JSON.stringify(def));
    d3.shards.push({ kind: 'trigger', id: 'chaos', name: '乱', icon: 'z', entity: 'b', track: 'past', setState: 'x' });
    d3.rules.push({ id: 'cA', when: { t: 'past', s: 1, e: 'b', st: 'x' }, then: [{ t: 'future', s: 1, e: 'b', st: 'p' }] });
    d3.rules.push({ id: 'cB', when: { t: 'past', s: 1, e: 'b', st: 'x' }, then: [{ t: 'future', s: 1, e: 'b', st: 'q' }] });
    const g = new E.Game(d3);
    g.charmedPending = true;
    g.applyOp({ shardId: 'chaos', target: { t: 'past', s: 1 } });
    T('护符抵消风暴（不扣不退）', g.storms === 1 && g.integrity === 100 && g.steps === 1);
  }

  // 1.6 撤销树（分支）
  {
    const g = new E.Game(def);
    g.applyOp({ shardId: 'fixa', target: { t: 'past', s: 0 } });
    const s1 = g.steps;
    g.undo();
    T('撤销回到初始', g.steps === 0 && !g.goalsDone());
    g.redo();
    T('重做恢复', g.steps === s1 && g.goalsDone());
    g.undo();
    g.applyOp({ shardId: 'fixb', target: { t: 'present', s: 1 } }); // 分支
    T('树状分支：undo 后新操作成为新分支', g.cur.parent.children.length === 2 || g.canRedo() === false);
    T('undoCount 计数', g.undoCount === 2);
    T('完美判定 = 零撤销零风暴（此处 false）', g.perfect() === false);
  }

  // 1.7 同格状态机链（selfLoop 不算悖论）
  {
    const d4 = JSON.parse(JSON.stringify(def));
    d4.rules.push({ id: 'sm1', when: { t: 'present', s: 1, e: 'b', st: 'on' }, then: [{ t: 'present', s: 1, e: 'b', st: 'on2' }] });
    const g = new E.Game(d4);
    g.applyOp({ shardId: 'fixb', target: { t: 'present', s: 1 } });
    T('状态机链：on → on2 正常传播', g.facts.get('present:1:b').st === 'on2' && g.storms === 0);
  }

  // 1.8 plant 预置闭环
  {
    const d5 = JSON.parse(JSON.stringify(def));
    d5.shards.push({ kind: 'plant', id: 'pl', name: '预置', icon: 'p', entity: 'a', track: 'past', setState: 'sent', anchor: { t: 'future', s: 0, st: 'wait' } });
    const g = new E.Game(d5);
    g.applyOp({ shardId: 'pl', target: { t: 'past', s: 0 } });
    T('预置闭环一次落两端', g.facts.get('past:0:a').st === 'sent' && g.facts.get('future:0:a').st === 'wait');
    T('预置只计 1 步', g.steps === 1);
  }

  // 1.9 move 语义
  {
    const d6 = JSON.parse(JSON.stringify(def));
    d6.initial.push({ t: 'past', s: 0, e: 'b', st: 'floor' });
    d6.shards.push({ kind: 'move', id: 'mv', name: '搬', icon: 'm', entity: 'b', track: 'past', setState: 'shelf', fromNeed: 'floor', clearState: 'gone' });
    const g = new E.Game(d6);
    g.applyOp({ shardId: 'mv', target: { t: 'past', s: 1 }, source: { t: 'past', s: 0 } });
    T('move：源头清空 + 目标落位', g.facts.get('past:0:b').st === 'gone' && g.facts.get('past:1:b').st === 'shelf');
    const g2 = new E.Game(d6);
    g2.applyOp({ shardId: 'mv', target: { t: 'past', s: 1 }, source: { t: 'present', s: 0 } });
    T('move：跨线移动被拒', g2.integrity === 95);
  }

  // 1.10 空目标关卡不判定胜利（无限回环）
  {
    const d7 = JSON.parse(JSON.stringify(def));
    d7.goals = [];
    const g = new E.Game(d7);
    g.applyOp({ shardId: 'fixa', target: { t: 'past', s: 0 } });
    T('空目标关卡：操作后不判定胜利', g.state === 'playing' && g.goalsDone() === false);
  }

  // 1.11 simulate 工具
  {
    const g = E.simulate(def, [{ shardId: 'fixa', target: { t: 'past', s: 0 } }]);
    T('simulate：一次性推演获胜', g.state === 'won');
  }
}

/* ================= 关卡自动验证器 ================= */
function cloneGame(g) {
  const n = new E.Game(g.def);
  n.facts = new Map(g.facts);
  n.integrity = g.integrity; n.steps = g.steps; n.storms = g.storms;
  n.hiddenDone = new Set(g.hiddenDone);
  n.activeEdges = g.activeEdges.map(e => ({ ...e }));
  n.root.snap = {
    facts: new Map(g.facts), integrity: g.integrity, steps: g.steps, storms: g.storms,
    edges: n.activeEdges.map(e => ({ ...e })), linearLen: 0, hiddenDone: new Set(g.hiddenDone),
  };
  n.cur = n.root;
  return n;
}
function enumerateOps(def) {
  const ops = [];
  const cells = [];
  for (const t of TRACKS) for (let s = 0; s < def.slots[t]; s++) cells.push({ t, s });
  for (const sh of (def.shards || [])) {
    for (const c of cells) {
      if (sh.kind === 'move') {
        for (const src of cells) if (src.t === c.t && src.s !== c.s) ops.push({ shardId: sh.id, target: c, source: src });
      } else ops.push({ shardId: sh.id, target: c });
    }
  }
  return ops;
}
const sigOf = (g) => [...g.facts.entries()].map(([k, f]) => k + '=' + f.st).sort().join('|') + '#' + g.integrity + '#' + g.storms;

function minStepsToWin(def, maxDepth) {
  const start = new E.Game(def);
  if (start.goalsDone()) return 0;
  const ops = enumerateOps(def);
  const bestSeen = new Map(); // sig -> minDepth
  let best = Infinity;
  const dfs = (g, depth) => {
    if (depth >= best) return;
    const sig = sigOf(g);
    const seenAt = bestSeen.get(sig);
    if (seenAt !== undefined && seenAt <= depth) return;
    bestSeen.set(sig, depth);
    if (depth >= maxDepth) return;
    for (const op of ops) {
      const c = cloneGame(g);
      const ok = c.applyOp(op);
      if (!ok) continue;
      if (c.storms > g.storms) continue;          // 风暴分支永不最优
      if (c.state === 'collapsed') continue;
      if (c.goalsDone()) { if (depth + 1 < best) best = depth + 1; continue; }
      if (depth + 1 < best) dfs(c, depth + 1);
    }
  };
  dfs(start, 0);
  return best;
}

function levelTests() {
  section('关卡自动验证器（BFS/DFS 可解性）');
  let count = 0;
  function checkLevel(def, tag) {
    count++;
    const g0 = new E.Game(def);
    T(`[${tag}] ${def.id} 初始未直接获胜`, !g0.goalsDone());
    const need = minStepsToWin(def, Math.max(2, (def.par || 1) + 2));
    T(`[${tag}] ${def.id} 可解且 ≤ 标准解 ${def.par} 步（实际最优 ${need}）`, need !== Infinity && need <= def.par, `best=${need}`);
    return need;
  }

  // 全部手工主线 + BOSS
  LV.allHandLevels().forEach(def => checkLevel(def, def.kind === 'boss' ? 'BOSS' : '主线'));

  // 回响生成关（每章补足到 12）
  for (let ch = 1; ch <= 8; ch++) {
    LV.levelsOfChapter(ch).filter(l => l.gen).forEach(def => checkLevel(def, '回响'));
  }

  // 悖论实验室 / 时间裂隙
  LV.labDaily('2026-9-30').forEach(def => checkLevel(def, '实验室'));
  checkLevel(LV.riftWeekly('2026-W40'), '裂隙');

  console.log(`  已验证关卡数：${count}`);
}

/* ================= 数据完整性 ================= */
function dataTests() {
  section('数据完整性');
  const all = LV.allHandLevels();
  let totalAll = 0, mainCount = 0, bossCount = 0;
  for (let ch = 1; ch <= 8; ch++) {
    LV.levelsOfChapter(ch).forEach(l => {
      totalAll++;
      if (l.kind === 'boss') bossCount++; else mainCount++;
    });
  }
  T('关卡总数 = 102（8×12 主线 + 6 BOSS）', totalAll === 102 && mainCount === 96 && bossCount === 6, `total=${totalAll} main=${mainCount} boss=${bossCount}`);
  T('BOSS 数量 = 6', bossCount === 6);
  let bad = 0;
  all.forEach(def => {
    for (const t of TRACKS) {
      if (!def.slots[t]) { bad++; console.log('  缺少槽位定义', def.id, t); }
    }
    (def.initial || []).concat(def.goals || []).concat(def.rules ? def.rules.flatMap(r => [r.when, ...r.then]) : []).forEach(f => {
      if (!def.slots[f.t] || f.s < 0 || f.s >= def.slots[f.t]) { bad++; console.log('  槽位越界', def.id, JSON.stringify(f)); }
    });
    ((def.shards) || []).forEach(sh => {
      if (sh.anchor) {
        if (!def.slots[sh.anchor.t] || sh.anchor.s < 0 || sh.anchor.s >= def.slots[sh.anchor.t]) { bad++; console.log('  锚点越界', def.id, sh.id); }
      }
    });
    (def.story || []).forEach(id => {
      if (!ST.get(id)) { bad++; console.log('  叙事碎片缺失', def.id, id); }
    });
    (def.hidden || []).forEach(h => {
      if (!ST.get(h.shardId)) { bad++; console.log('  隐藏碎片缺失', def.id, h.shardId); }
    });
  });
  T('全部关卡槽位/锚点/碎片引用合法', bad === 0, bad + ' 处问题');
  // 每章主线 12 关（BOSS 为额外第 13 关）
  for (let ch = 1; ch <= 8; ch++) {
    const ls = LV.levelsOfChapter(ch);
    T(`第 ${ch} 章 = 12 主线关`, ls.filter(l => l.kind !== 'boss').length === 12, ls.length);
  }
  // 里层碎片可被收集
  const hiddenIds = Object.keys(ST.SHARDS).filter(k => ST.SHARDS[k].hidden);
  const referenced = new Set();
  all.forEach(def => (def.hidden || []).forEach(h => referenced.add(h.shardId)));
  hiddenIds.forEach(id => T(`里层碎片 ${id} 在关卡中有获取途径`, referenced.has(id)));
  // 广播合集
  for (let i = 1; i <= 12; i++) T(`广播合集 b_${String(i).padStart(2, '0')} 存在`, !!ST.get('b_' + String(i).padStart(2, '0')));
}

/* ================= 生成器模糊测试 ================= */
function fuzzTests() {
  section('生成器模糊测试（构造解必胜 + 随机操作不崩）');
  let n = 0;
  for (let ch = 1; ch <= 8; ch++) {
    for (let fam = 0; fam < 4; fam++) {
      for (let seed = 0; seed < 5; seed++) {
        const { def, solution } = LV.genLevel(ch, 900 + n, seed * 7919 + fam * 131 + ch, { family: fam, interactive: ['past', 'present', 'future'] });
        const g = new E.Game(def);
        solution.forEach(op => g.applyOp(op));
        T(`fuzz ch${ch} fam${fam} seed${seed} 构造解获胜`, g.goalsDone(), def.id);
        // 随机乱按不崩（无异常抛出）
        const g2 = new E.Game(def);
        const ops = enumerateOps(def);
        for (let i = 0; i < 30; i++) {
          const op = ops[Math.floor(Math.random() * ops.length)];
          try { g2.applyOp(op); } catch (e) { T(`fuzz ch${ch} 随机操作异常`, false, e.message); break; }
        }
        n++;
      }
    }
  }
  console.log(`  模糊测试组合数：${n}（每组合 2 项断言以上）`);
}

/* ================= 悖论陷阱专项 ================= */
function trapTests() {
  section('悖论陷阱专项（教程关 3-4、5-4、5-9、6-9、7-5 及各 BOSS）');
  function trapWins(id, shardId, target) {
    const def = LV.allHandLevels().find(l => l.id === id);
    const g = new E.Game(def);
    g.applyOp({ shardId, target });
    return g.storms > 0;
  }
  T('c3l04 强行掰闸 → 风暴', trapWins('c3l04', 'force', { t: 'present', s: 0 }));
  T('c5l04 强行增强功率 → 风暴', trapWins('c5l04', 'boost', { t: 'past', s: 0 }));
  T('c5l09 踹发电机 → 风暴', trapWins('c5l09', 'kick', { t: 'present', s: 0 }));
  T('c6l09 两巷齐焊 → 风暴', trapWins('c6l09', 'weldboth', { t: 'past', s: 0 }));
  T('c7l05 加大配重 → 风暴', trapWins('c7l05', 'push', { t: 'present', s: 1 }));
  T('c2boss 举起火把 → 风暴', trapWins('c2boss', 'torchup', { t: 'past', s: 0 }));
  T('c5boss 强行增强功率 → 风暴', trapWins('c5boss', 'boost', { t: 'present', s: 0 }));
  T('回响关 famC 强行撬动 → 风暴', (() => {
    const { def } = LV.genLevel(3, 901, 42, { family: 2 });
    const g = new E.Game(def);
    g.applyOp({ shardId: 'hack', target: { t: 'present', s: 1 } });
    return g.storms > 0;
  })());
}

/* ================= 主流程 ================= */
console.log('时间碎片 Time Shards — 测试套件');
engineTests();
levelTests();
dataTests();
fuzzTests();
trapTests();

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
if (failures.length) {
  console.log('\n失败明细：');
  failures.forEach(f => console.log('  ✕ ' + f));
  process.exit(1);
} else {
  console.log('全部通过 ✔');
}
