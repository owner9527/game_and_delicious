'use strict';
// ================================================================
// 启动: 画布适配 / 输入 / 主循环
// ================================================================
(function boot() {
  Meta.load();
  UI.init();
  UI.refreshMenu();

  const cvs = document.getElementById('game');
  const stage = document.getElementById('stage');

  function fitCanvas() {
    const scale = Math.min(window.innerWidth / ROOM_W, window.innerHeight / ROOM_H) * 0.985;
    stage.style.width = Math.floor(ROOM_W * scale) + 'px';
    stage.style.height = Math.floor(ROOM_H * scale) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // ---------- 输入 ----------
  window.addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    Sfx.ensure();
    G.input.keys[e.code] = true;
    if (G.state !== 'play') return;
    if (e.code === 'Space' || e.code === 'ShiftLeft') G.tryDash();
    else if (e.code === 'KeyQ') G.tryNova();
    else if (e.code === 'KeyE') G.tryInteract();
    else if (e.code === 'Tab' || e.code === 'KeyI') {
      if (G.modal === 'inventory') UI.closeModal();
      else if (!G.modal && !G.paused) UI.openInventory();
    } else if (e.code === 'Escape') {
      if (G.modal && G.modal !== 'choices') UI.closeModal();
      else if (G.modal === 'choices') { /* 三选一必须选择 */ }
      else G.togglePause();
    } else if (e.code === 'KeyM') {
      Sfx.enabled = !Sfx.enabled;
      Meta.data.settings.sfx = Sfx.enabled;
      Meta.save();
      UI.updateSfxBtn();
    }
  });
  window.addEventListener('keyup', e => { G.input.keys[e.code] = false; });

  cvs.addEventListener('mousemove', e => {
    const r = cvs.getBoundingClientRect();
    G.input.mx = (e.clientX - r.left) / r.width * ROOM_W;
    G.input.my = (e.clientY - r.top) / r.height * ROOM_H;
  });
  cvs.addEventListener('mousedown', e => { if (e.button === 0) { Sfx.ensure(); G.input.fire = true; } });
  window.addEventListener('mouseup', e => { if (e.button === 0) G.input.fire = false; });
  cvs.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { G.input.fire = false; G.input.keys = {}; });

  window.addEventListener('beforeunload', () => { if (G.state === 'play' && !G.modal) G.saveRun(); });

  // ---------- 主循环 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    G.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
