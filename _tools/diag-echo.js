// 排空 rAF、检查回声游戏是否能真正进入关卡
(() => {
  window.__diag = { step: 'start', log: [] };
  window.__diag.log.push('EchoApp=' + (typeof EchoApp) + ' EchoLevels=' + (typeof EchoLevels));

  setTimeout(function () {
    try {
      const L = window.EchoLevels && window.EchoLevels.LEVELS;
      window.__diag.log.push('levels=' + (L ? L.length : 'none'));
      if (!L || !L.length) { window.__diag.step = 'no-levels'; return; }
      EchoApp.startLevel(L[0], 'story');
      window.__diag.step = 'started';
      window.__diag.game = !!EchoApp.game;
    } catch (e) {
      window.__diag.step = 'error';
      window.__diag.err = String((e && e.message) || e);
    }
  }, 60);

  // 记录 2 秒内的 rAF 帧数，判断主循环是否在跑
  let n = 0;
  const t0 = performance.now();
  (function tick() {
    n++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else {
      window.__diag.frames = n;
      window.__diag.step2 = 'raf-done';
    }
  })();

  return JSON.stringify(window.__diag);
})()
