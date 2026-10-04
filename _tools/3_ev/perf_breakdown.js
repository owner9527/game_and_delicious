// 新渲染路径的耗时分解
(() => {
  localStorage.setItem('tc_tut_off', '1');
  G.main.newGame(20240930, 'sandbox');
  G.sim.speed = 0;
  __T.buildTown();
  G.sim.state.gold = 4000;
  __T.run(120);
  G.R.spawn(Math.max(0, 220 - G.res.length));
  G.RD.newDay();
  G.sim.speed = 3;
  const N = 40;
  const bench = () => { const t = performance.now(); for (let i = 0; i < N; i++) G.RD.draw(16); return +((performance.now() - t) / N).toFixed(2); };
  const R = {};
  R['基线(walkers=' + G.walkers.length + ')'] = bench();
  // 关掉野物
  const saveNodes = G.NAT.gameNodes;
  G.NAT.gameNodes = () => [];
  R['关闭野外猎物绘制'] = bench();
  G.NAT.gameNodes = saveNodes;
  // 关掉目的徽标(缩小到不触发)
  const st = G.NAT.summary;
  G.NAT.summary = st;
  // 关掉 walkers
  const saveW = G.walkers;
  G.walkers = [];
  R['关闭全部 walker'] = bench();
  G.walkers = saveW;
  R['野物格数'] = saveNodes.call(G.NAT).length;
  R['人口/walker/建筑'] = G.res.length + '/' + G.walkers.length + '/' + G.builds.length;
  return R;
})()
