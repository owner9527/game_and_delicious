// ===== “改动前”复现:工人优先级导致生产建筑空转 =====
(() => {
  const R = {};
  localStorage.setItem('tc_tut_off', '1');
  G.main.newGame(777, 'sandbox');
  G.sim.speed = 0;
  const s = G.sim.state;
  const hall = G.builds.find(b => b.def.key === 'hall');
  const hx = hall.x, hy = hall.y, ry = hy + 3;
  for (let x = hx - 8; x <= hx + 9; x++) G.B.place('road', x, ry);
  const plan = [
    ['cottage', hx - 6, ry + 1], ['cottage', hx - 4, ry + 1], ['cottage', hx - 2, ry + 1],
    ['tavern', hx + 3, ry + 1], ['herbalist', hx + 5, ry + 1],
  ];
  const fail = [];
  for (const [t, x, y] of plan) { const r = G.B.place(t, x, y); if (!r.ok) fail.push(t + ':' + r.reason); }
  for (const t of ['farm', 'lumber', 'quarry']) {
    const p = __T.findBest(t, (x, y, d) => t === 'lumber' ? G.M.adjForest(x, y, d.w, d.h) : (t === 'quarry' ? G.M.rockNear(x, y, d.w, d.h, 2) : 0));
    if (p) { const r = G.B.place(t, p.x, p.y); if (!r.ok) fail.push(t + ':' + r.reason); } else fail.push(t + ':no-spot');
  }
  R.建造失败 = fail;
  R.人口 = G.res.length;
  R.用工需求 = G.builds.filter(b => b.def.workers > 0).map(b => b.type + '(' + b.def.workers + '人)');
  __T.run(3);
  R.第4天 = {
    人口: G.res.length,
    各建筑用工: G.builds.filter(b => b.def.workers > 0).map(b => b.type + ':' + b.staff.length + '/' + b.def.workers + ' eff=' + b.eff.toFixed(2)),
    生产建筑: __T.prod().map(b => b.type + ' eff=' + b.eff.toFixed(2) + ' → 日产量 ' + JSON.stringify(Object.keys(b.def.produce).map(k => k + '=' + (b.def.produce[k] * b.eff).toFixed(1)))),
  };
  const w0 = s.wood, st0 = s.stone, f0 = s.food;
  __T.run(20);
  R['20天后'] = {
    木材增量: +(s.wood - w0).toFixed(0), 石料增量: +(s.stone - st0).toFixed(0), 粮食增量: +(s.food - f0).toFixed(0),
    木材上限: s.caps.wood, 石料上限: s.caps.stone,
    人口: G.res.length,
  };
  R.结论 = '娱乐/信仰建筑在用工优先级里排在伐木场/采石场之前,人口不足时生产建筑直接 eff=0 → 玩家花了 70 金币的采石场 0 产出,面板只写“人手不足”';
  G.sim.speed = 1;
  return R;
})()
