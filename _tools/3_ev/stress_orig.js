// 原版渲染压力对照(只测渲染耗时,不依赖任何新接口)
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
  const t0 = performance.now();
  for (let i = 0; i < N; i++) G.RD.draw(16);
  const f = (performance.now() - t0) / N;
  return {
    人口: G.res.length, walker: G.walkers.length, 建筑: G.builds.length,
    '单帧渲染耗时(ms)': +f.toFixed(2), '估算FPS': Math.round(1000 / f),
  };
})()
