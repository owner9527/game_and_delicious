// ===== 展示 + 压力测试:把城镇养起来,并让画面处于"可读状态"以便截图 =====
(() => {
  const R = {};
  localStorage.setItem('tc_tut_off', '1');
  const T = G.CFG.TERR;

  // ---- 1) 养一座城镇 ----
  G.main.newGame(20240930, 'sandbox');
  G.sim.speed = 0;
  const s = G.sim.state;
  __T.buildTown();
  s.gold = 4000; s.wood = 900; s.stone = 500; s.food = 900;
  __T.run(120);

  // 再补几座生产建筑,让画面里有资源采集的样子
  for (const t of ['lumber', 'lumber', 'quarry', 'hunter', 'farm', 'well', 'tavern', 'granary']) {
    const p = __T.findBest(t, (x, y, d) => t === 'lumber' ? G.M.adjForest(x, y, d.w, d.h)
      : t === 'quarry' ? G.M.rockNear(x, y, d.w, d.h, 2)
        : t === 'hunter' ? 1 : (G.M.waterNear(x, y, d.w, d.h, 1) ? 1 : 0));
    if (p) G.B.place(t, p.x, p.y);
  }
  s.gold = 4000; s.wood = 900; s.stone = 500; s.food = 900;
  __T.run(45);

  R['城镇'] = {
    第几天: s.day,
    人口: G.res.length,
    住房: G.R.housingCap() + '',
    建筑: G.builds.length,
    同屏walker: G.walkers.length,
    幸福度: Math.round(G.sim.hap()) + '%',
    昨日产出: { wood: +s.lastProd.wood.toFixed(1), stone: +s.lastProd.stone.toFixed(1), food: +s.lastProd.food.toFixed(1) },
  };
  R['可再生资源'] = (function () {
    const sum = G.NAT.summary();
    const o = {};
    for (const k of ['wood', 'ore', 'game']) {
      o[sum[k].name] = Math.round(sum[k].total) + '/' + Math.round(sum[k].cap) + ' 生长+' + sum[k].grow.toFixed(1) + ' 采集-' + sum[k].harvest.toFixed(1);
    }
    return o;
  })();

  // ---- 2) 压力:直接塞满人口(越过住房限制)后生成行走单位,测渲染帧耗时 ----
  // 说明:这里绕过了"无家可归会迁出"的模拟规则,只为了压渲染路径
  G.R.spawn(Math.max(0, 220 - G.res.length));
  G.RD.newDay();
  G.sim.speed = 3;
  const N = 40;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) G.RD.draw(16);
  const frameMs = (performance.now() - t0) / N;
  R['压力测试'] = {
    人口: G.res.length, walker: G.walkers.length, 建筑: G.builds.length,
    'walker 是否不超过人口一半': G.walkers.length <= Math.max(1, Math.ceil(G.res.length * G.CFG.ECON.maxWalkFrac)),
    'walker 是否不超过 maxWalkers': G.walkers.length <= G.CFG.ECON.maxWalkers,
    'walker 是否都有目的': G.walkers.every(x => ['service', 'commute', 'stroll'].indexOf(x.purpose) >= 0),
    '平均单帧渲染耗时(ms)': +frameMs.toFixed(2),
    '估算 FPS': Math.round(1000 / frameMs),
    未处理重绘队列: G.NAT.dirtyCount(),
  };

  // ---- 3) 把界面摆成便于截图的状态:选中一名居民 + 悬浮一座伐木场 ----
  G.sim.speed = 0;
  __T.run(1);
  const camp = G.builds.find(b => b.type === 'lumber');
  if (camp) { G.RD.centerOn(camp.x, camp.y); }
  const wk = G.walkers[0];
  if (wk) {
    const a = wk.path[wk.seg], b = wk.path[Math.min(wk.seg + 1, wk.path.length - 1)];
    const TSZ = G.CFG.TS;
    const p = G.RD.worldToScreen(G.U.lerp(a.x, b.x, wk.t) * TSZ + TSZ / 2, G.U.lerp(a.y, b.y, wk.t) * TSZ + TSZ / 2);
    G.UI.onCanvasClick(p.x, p.y);
    R['截图状态'] = { 选中居民: G.UI.selectedResident ? G.UI.selectedResident.name : '无', 任务: G.UI.selectedResident ? G.R.taskOf(G.UI.selectedResident).text : '' };
  }
  // 悬浮到伐木场上,让 #tooltip 出现
  if (camp) {
    const TSZ = G.CFG.TS;
    const sc = G.RD.worldToScreen((camp.x + 0.5) * TSZ, (camp.y + 0.5) * TSZ);
    G.UI.hoverAt(sc.x, sc.y, G.RD.tileAt(sc.x, sc.y));
    R['悬浮提示可见'] = !G.U.$('tooltip').classList.contains('hidden');
    R['悬浮提示内容'] = G.U.$('tooltip').textContent.slice(0, 90);
  }
  return R;
})()
