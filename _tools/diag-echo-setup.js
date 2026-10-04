window.__diag = { step: 'start', log: [] };
window.__diag.log.push('EchoApp=' + (typeof EchoApp) + ' EchoLevels=' + (typeof EchoLevels));
setTimeout(function () {
  try {
    var L = window.EchoLevels && window.EchoLevels.LEVELS;
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
var __n = 0, __t0 = performance.now();
(function tick() {
  __n++;
  if (performance.now() - __t0 < 2600) requestAnimationFrame(tick);
  else { window.__diag.frames = __n; window.__diag.raf = 'done'; }
})();
'armed'
