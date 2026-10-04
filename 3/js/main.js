// ===== 主入口:初始化、新游戏、主循环 =====
G.main = {

  newGame(seed, difficulty) {
    G.M.genWorld(seed);
    G.sim.state = G.sim.newState(difficulty, seed);
    G.NAT.init();                       // 可再生自然资源层(依赖 map 与 state.day;必须在 prerender 之前)
    G.sim.started = true;
    G.sim.dayT = 0;
    G.sim.speed = G.CFG.ECON.defaultSpeed || 1;
    G.builds.length = 0; G._bid = 1;
    G.res.length = 0; G._rid = 1;
    G.walkers = [];
    G.EV.reset();

    const cx = G.CFG.MAPW >> 1, cy = G.CFG.MAPH >> 1;
    G.B.place('hall', cx - 1, cy - 1, true);   // 市政厅免费落地
    G.R.spawn(G.CFG.START.pop);

    G.RD.prerender(0);
    G.RD.centerOn(cx, cy);
    G.RD.newDay();
    G.UI.resetForGame();
    // 进入游戏主页面时打开游戏说明(除非玩家勾选了不再自动打开)
    if (!G.U.store.get('tc_tut_off')) G.UI.showTutorial(0);
    G.UI.toast('🌾 欢迎来到拓城记!先铺道路,再沿路建木屋与农田', 'good');
    G.UI.log('拓荒队抵达新大陆,一切的传奇从这里开始。', 'info');
  },

  boot() {
    G.RD.init();
    G.UI.init();
    G.walkers = [];

    // 启动画背后的背景世界(开始界面遮罩之下)
    G.M.genWorld((Math.random() * 4294967296) >>> 0);
    G.sim.state = G.sim.newState('normal', 1);
    G.NAT.init();
    G.sim.started = false;
    G.sim.speed = 0;
    G.RD.prerender(0);
    G.RD.centerOn(G.CFG.MAPW >> 1, G.CFG.MAPH >> 1);
    G.uiPaused = true;

    // 主循环:模拟时钟与渲染解耦(页面被节流时模拟照常推进)
    let lastSim = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(4000, now - lastSim);
      lastSim = now;
      if (!G.uiPaused) G.sim.update(dt);
    }, 100);

    let lastDraw = performance.now();
    const loop = ts => {
      const dt = Math.min(120, ts - lastDraw);
      lastDraw = ts;
      G.RD.draw(dt);
      G.UI.updateHUD();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // 关页前自动存档
    window.addEventListener('beforeunload', () => { if (G.SV.ready()) G.SV.save('auto', true); });

    G.UI.showStart();
  },
};

document.addEventListener('DOMContentLoaded', () => G.main.boot());
