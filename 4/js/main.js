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
    // Alt 用于"按住对比地上装备": 阻止浏览器菜单栏聚焦(Firefox/Chrome 默认行为)
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
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
  window.addEventListener('blur', () => { G.input.fire = false; G.input.keys = {}; G.compareHold = null; });

  window.addEventListener('beforeunload', () => { if (G.state === 'play' && !G.modal) G.saveRun(); });

  // ---------- 触屏设备检测(意见书 3.4 P1: 虚拟摇杆 + 开火/冲刺按钮) ----------
  // 只在触屏设备显示: pointer:coarse 命中(手机/平板)或首次 touchstart 命中(外接触屏等)。
  // 纯桌面两者都不会命中 → 控件不显示、不拦截任何事件, 原有键鼠手感完全不变。
  const enableTouch = () => document.body.classList.add('has-touch');
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouch();
  window.addEventListener('touchstart', () => { Sfx.ensure(); enableTouch(); }, { passive: true });

  // 触屏点画布: 只用于"长按对比装备", 不派发兼容鼠标事件(否则会被既有 mousedown 误判为开火)
  cvs.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

  // 长按装备拾取物(~0.45s, 位移 <16px)→ 打开对比浮层; 抬手/移动/失焦即关闭
  let lp = null;
  cvs.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const r = cvs.getBoundingClientRect();
    const wx = (e.clientX - r.left) / r.width * ROOM_W, wy = (e.clientY - r.top) / r.height * ROOM_H;
    const timer = setTimeout(() => {
      let best = null, bd = 110 * 110;
      for (const pk of G.pickups) {
        if (pk.type !== 'item' || !pk.item) continue;
        const d2 = dist2(pk.x, pk.y, wx, wy);
        if (d2 < bd) { bd = d2; best = pk; }
      }
      if (best) { G.compareHold = best; Sfx.play('ui'); }
    }, 450);
    lp = { id: e.pointerId, sx: e.clientX, sy: e.clientY, timer };
  });
  cvs.addEventListener('pointermove', e => {
    if (!lp || e.pointerId !== lp.id || e.pointerType !== 'touch') return;
    if (Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) > 16) { clearTimeout(lp.timer); lp = null; }
  });
  const lpEnd = e => {
    if (lp && e.pointerId !== undefined && e.pointerId !== lp.id) return;
    if (lp) clearTimeout(lp.timer);
    lp = null;
    G.compareHold = null;
  };
  cvs.addEventListener('pointerup', lpEnd);
  cvs.addEventListener('pointercancel', lpEnd);

  // ---------- 虚拟摇杆(左下, 等价 WASD) ----------
  const joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
  if (joy && knob) {
    const JR = 48;              // 摇杆有效行程半径(px)
    let joyId = null, jcx = 0, jcy = 0;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx * JR}px, ${dy * JR}px)`; };
    const joyMove = t => {
      let dx = (t.clientX - jcx) / JR, dy = (t.clientY - jcy) / JR;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      setKnob(dx, dy);
      if (l < 0.18) { G.input.tvx = 0; G.input.tvy = 0; G.input.touchActive = false; }  // 死区
      else { G.input.tvx = dx; G.input.tvy = dy; G.input.touchActive = true; }
    };
    // touch 事件对起始元素有隐式捕获, 手指滑出摇杆也能继续收到 move/end
    joy.addEventListener('touchstart', e => {
      e.preventDefault();
      Sfx.ensure();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const jr = joy.getBoundingClientRect();
      jcx = jr.left + jr.width / 2; jcy = jr.top + jr.height / 2;
      joyMove(t);
    }, { passive: false });
    joy.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t);
    }, { passive: false });
    const joyEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === joyId) {
        joyId = null;
        G.input.tvx = 0; G.input.tvy = 0; G.input.touchActive = false;
        setKnob(0, 0);
      }
    };
    joy.addEventListener('touchend', joyEnd);
    joy.addEventListener('touchcancel', joyEnd);
  }

  // ---------- 开火 / 冲刺 / 互动按钮(右下) ----------
  // 多点触控: 摇杆、各按钮是独立 DOM 元素各自处理自己的 touch, 可同时移动 + 开火 + 冲刺。
  const bFire = document.getElementById('btn-fire-t');
  if (bFire) {
    bFire.addEventListener('touchstart', e => {
      e.preventDefault(); Sfx.ensure();
      G.input.autoAim = true; G.input.fire = true;
      G.tryFire();                       // 冷却就绪时按下立即出弹, 与桌面 mousedown 手感一致
    }, { passive: false });
    const fireOff = e => { e.preventDefault(); G.input.fire = false; G.input.autoAim = false; };
    bFire.addEventListener('touchend', fireOff, { passive: false });
    bFire.addEventListener('touchcancel', fireOff, { passive: false });
  }
  const bDash = document.getElementById('btn-dash-t');
  if (bDash) bDash.addEventListener('touchstart', e => { e.preventDefault(); Sfx.ensure(); G.tryDash(); }, { passive: false });
  const bAct = document.getElementById('btn-act-t');
  if (bAct) bAct.addEventListener('touchstart', e => { e.preventDefault(); Sfx.ensure(); G.tryInteract(); }, { passive: false });

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
