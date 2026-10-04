// ===== “改动前”复现脚本 =====
// 用法: --evalFile=lib.js --evalFile=before_repro.js
(() => {
  const R = { phase: 'BEFORE' };
  localStorage.setItem('tc_tut_off', '1');
  G.uiPaused = false;

  let logN = 0; const logTexts = [];
  const origLog = G.UI.log;
  G.UI.log = function (t) { logN++; logTexts.push(String(t)); return origLog.apply(this, arguments); };

  // ---------- 阶段 A:正常村镇跑 60 天 ----------
  G.main.newGame(1337, 'sandbox');
  G.sim.speed = 0;
  const s = G.sim.state;
  const T = G.CFG.TERR;
  const t0 = __T.terrHash();

  R.Q1_a_资源可再生 = {
    '存在可再生资源层 G.NAT': typeof G.NAT,
    '地图森林格数': __T.terrCount(T.FOREST),
    '地图岩石格数': __T.terrCount(T.ROCK),
    '地形哈希(第1天)': t0,
  };
  R.Q2_a_速度 = {
    'CFG.ECON.dayMs(1倍速一天的现实毫秒)': G.CFG.ECON.dayMs,
    '速度档位': [...document.querySelectorAll('.speed-group button')].map(b => b.dataset.speed),
    '速度接口 G.sim.speed 可写': (function () { const o = G.sim.speed; G.sim.speed = 3; const ok = G.sim.speed === 3; G.sim.speed = o; return ok; })(),
    '1年(80天)在1倍速下秒数': +(G.CFG.ECON.dayMs * 80 / 1000).toFixed(1),
  };

  R.建造 = __T.buildTown(420);
  const before = __T.snap();
  R.Q3_a_建完开局 = before;
  R.Q3_a_开局限额caps = Object.assign({}, s.caps);

  __T.run(60);
  const after = __T.snap();
  R.Q3_a_60天后 = after;
  R.Q3_a_净收入 = { gold: after.gold - before.gold, wood: after.wood - before.wood, stone: after.stone - before.stone, food: after.food - before.food };
  R.Q3_a_生产建筑 = __T.prod().map(b => ({
    type: b.type, 员工: b.staff.length + '/' + b.def.workers, eff: +b.eff.toFixed(2),
    显示毗邻森林格: b.forest, 配置森林加成: b.def.forestBonus || 0,
    '面板承诺的木材/日': b.def.produce && b.def.produce.wood ? +(b.def.produce.wood * b.eff + (b.forest || 0) * (b.def.forestBonus || 0)).toFixed(1) : 0,
    'economy.js 实际产量公式': b.def.produce ? JSON.stringify(b.def.produce) + ' × eff × 季节 × prodMult' : '',
  }));
  R.Q3_a_用工建筑 = __T.workers().map(b => b.type + ':' + b.staff.length + '/' + b.def.workers + '(eff ' + b.eff.toFixed(2) + ')');
  R.Q3_a_就业 = __T.employed() + '/' + G.res.length;

  R.Q1_a_60天后 = {
    '存在可再生资源层 G.NAT': typeof G.NAT,
    '地形哈希(第61天)': __T.terrHash(),
    '地形哈希是否变化': __T.terrHash() !== t0,
    '森林格数': __T.terrCount(T.FOREST), '岩石格数': __T.terrCount(T.ROCK),
    '伐木场毗邻森林(静态常量,永不变化)': __T.prod().filter(b => b.def.forestBonus).map(b => b.forest),
  };
  R.Q4_a_居民游走 = __T.walkers();
  R.Q4_a_居民身份 = {
    '真实人口': G.res.length, '同屏walker数': (G.walkers || []).length,
    'walker/人口 倍数': +((G.walkers || []).length / Math.max(1, G.res.length)).toFixed(1),
    'walker唯一居民数': new Set((G.walkers || []).map(w => w.resId)).size,
    'walker有 purpose 字段': (G.walkers || []).every(w => typeof w.purpose === 'string'),
    '能点选居民看职业/任务(G.RD.walkerAt)': typeof G.RD.walkerAt,
    '每阶段人口硬上限 CFG.ECON.popCap': G.CFG.ECON.popCap,
    '住房容量': G.R.housingCap(),
  };
  R.反馈 = {
    '60天日志条数': logN,
    '含生产/收入说明的日志条数': logTexts.filter(t => /生产|产出|收入|\+\d+/.test(t)).length,
    '含居民行为说明的日志条数': logTexts.filter(t => /上班|上工|前往|返家|停工/.test(t)).length,
    '日志样例': logTexts.slice(0, 10),
  };

  // ---------- 阶段 B:单独测“伐木场森林加成是否生效” ----------
  G.main.newGame(4242, 'sandbox');
  G.sim.speed = 0;
  const s2 = G.sim.state;
  s2.caps.food = 9999; s2.caps.wood = 9999; s2.caps.stone = 9999; // 排除仓储上限干扰
  const lp = __T.findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
  const lum = lp ? G.B.place('lumber', lp.x, lp.y) : null;
  const lumB = lum && lum.ok ? lum.b : null;
  __T.run(1); // 分配员工
  const wood0 = s2.wood;
  __T.run(10);
  R.Q3_b_伐木场微测 = {
    '放置': lumB ? ('(' + lumB.x + ',' + lumB.y + ') 毗邻森林 ' + lumB.forest + ' 格') : '失败',
    '员工/效率': lumB ? lumB.staff.length + '/' + lumB.def.workers + ' eff=' + lumB.eff : '',
    '面板显示的每日产量(ui.js 291行)': lumB ? lumB.def.produce.wood : '',
    '面板显示的毗邻森林加成(ui.js 294行)': lumB ? '+' + (lumB.forest * lumB.def.forestBonus).toFixed(1) : '',
    '配置 desc 承诺': '每格毗邻森林 +1.2 产量',
    '10天木材增量(实测)': +(s2.wood - wood0).toFixed(1),
    '若加成生效应有的增量': lumB ? +((lumB.def.produce.wood + lumB.forest * lumB.def.forestBonus) * 10).toFixed(1) : '',
    '结论': lumB ? ((s2.wood - wood0) < (lumB.def.produce.wood) * 10 + 0.5 ? '森林加成未生效(实际只有基础产量)' : '加成生效') : '',
  };

  // ---------- 阶段 C:开局木材 150/160 上限吞噬产量 ----------
  G.main.newGame(4242, 'sandbox');
  G.sim.speed = 0;
  const s3 = G.sim.state;
  const lc = __T.findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
  if (lc) G.B.place('lumber', lc.x, lc.y);
  R.Q3_c_上限吞噬 = {
    '开局木材/上限': s3.wood + '/' + s3.caps.wood,
    '可增长空间': s3.caps.wood - s3.wood,
    '伐木场日产量': 6,
    '塞满上限需要天数': +((s3.caps.wood - s3.wood) / 6).toFixed(1),
  };
  const seq = [];
  for (let i = 0; i < 12; i++) { __T.run(1); seq.push(Math.round(s3.wood)); }
  R.Q3_c_上限吞噬.木材逐日 = seq;
  R.Q3_c_上限吞噬.结论 = '开局木材 150/160,伐木场只产出 10 点就顶到上限,之后木材数字完全不动 → 玩家看到“建了伐木场没有收入”';

  G.UI.log = origLog;
  G.sim.speed = 1;
  return R;
})()
