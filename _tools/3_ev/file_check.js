// ===== file:// 双击打开场景的轻量验证 =====
(() => {
  const R = { phase: 'FILE://' };
  const T = G.CFG.TERR;
  R['页面协议'] = location.protocol;
  R['localStorage 可用'] = G.U.store.ok();
  R['脚本全部加载'] = ['U', 'CFG', 'M', 'P', 'NAT', 'B', 'R', 'E', 'EV', 'sim', 'RD', 'UI', 'SV', 'main']
    .every(k => typeof G[k] !== 'undefined');

  G.main.newGame(20240601, 'sandbox');
  G.sim.speed = 0;
  const s = G.sim.state;
  const t0 = __T.terrHash();
  const built = __T.buildTown();
  R['建造'] = { 成功: built.built.length, 失败: built.fail };

  const w0 = s.wood, st0 = s.stone, f0 = s.food, g0 = s.gold, day0 = s.day;
  __T.run(40);
  R['跑 40 天'] = {
    天数: s.day - day0 + 1,
    木材: +(s.wood - w0).toFixed(0), 石料: +(s.stone - st0).toFixed(0),
    粮食: +(s.food - f0).toFixed(0), 金币: Math.round(s.gold - g0),
    人口: G.res.length,
    '建筑有产出(昨日 lastProd)': { wood: +(s.lastProd.wood || 0).toFixed(1), stone: +(s.lastProd.stone || 0).toFixed(1), food: +(s.lastProd.food || 0).toFixed(1) },
    '没有建筑完全没人上工': G.builds.filter(b => b.def.workers > 0 && b.eff <= 0).length === 0,
  };
  R['资源可再生'] = (function () {
    const sum = G.NAT.summary();
    return {
      可再生资源层: typeof G.NAT,
      已解锁领地森林: Math.round(sum.wood.total) + '/' + Math.round(sum.wood.cap),
      今日生长: +sum.wood.grow.toFixed(1),
      今日采集: +sum.wood.harvest.toFixed(1),
      地图地形未被破坏: __T.terrHash() === t0,
    };
  })();
  // 停采后是否长回来
  R['资源会回来'] = (function () {
    const camp = G.builds.find(b => b.type === 'lumber');
    if (!camp) return '无伐木场';
    const a = G.NAT.near(camp, 'wood').total;
    G.B.remove(camp);
    __T.run(30);
    const b = G.NAT.near(camp, 'wood').total;
    return { 停采时: +a.toFixed(1), '30天后': +b.toFixed(1), 回升: +(b - a).toFixed(1), 通过: b > a + 1 };
  })();
  R['速度'] = { 档位: [...document.querySelectorAll('.speed-group button')].map(b => b.dataset.speed), dayMs: G.CFG.ECON.dayMs, setSpeed3: (G.UI.setSpeed(3), G.sim.speed === 3), setSpeed1: (G.UI.setSpeed(1), G.sim.speed === 1) };
  R['居民'] = (function () {
    const w = __T.walkers();
    return {
      人口: G.res.length, walker数: G.walkers.length,
      走动人数不超过人口一半: G.walkers.length <= Math.max(1, Math.ceil(G.res.length * G.CFG.ECON.maxWalkFrac)),
      全部有目的: G.walkers.every(x => ['service', 'commute', 'stroll'].indexOf(x.purpose) >= 0),
      无目的乱走: G.walkers.filter(x => !x.purpose).length,
    };
  })();
  R['点选居民'] = (function () {
    if (!G.walkers.length) return '当前没有走动居民';
    const w = G.walkers[0];
    const a = w.path[w.seg], b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
    const TSZ = G.CFG.TS;
    const p = G.RD.worldToScreen(G.U.lerp(a.x, b.x, w.t) * TSZ + TSZ / 2, G.U.lerp(a.y, b.y, w.t) * TSZ + TSZ / 2);
    G.UI.onCanvasClick(p.x, p.y);
    const sel = G.UI.selectedResident;
    return { 选中: !!sel, 姓名: sel ? sel.name : '', 职业: sel ? G.R.JobNameOf || G.R.jobNameOf(sel) : '', 任务: sel ? G.R.taskOf(sel).text : '' };
  })();
  R['存档'] = (function () {
    G.SV.save('manual');
    const day = G.sim.state.day, pop = G.res.length;
    const raw = G.U.store.get('tc_save_manual');
    if (!raw) return '此环境下无法写 localStorage(游戏可正常玩,只是不能存档)';
    G.SV.load('manual');
    return { 存档天数: day, 读档后天数: G.sim.state.day, 存档人口: pop, 读档后人口: G.res.length, 通过: G.sim.state.day === day && G.res.length === pop };
  })();
  G.UI.setSpeed(1);
  return R;
})()
