/* ============================================================
   输入系统 — 键盘 / 触屏 / 手柄 归一化
   同步模式：一套输入（AD/←→ + 空格/W/↑ 跳）
   碎镜模式：WASD = 棱(左) · 方向键 = 镜(右)，触屏双摇杆
   ============================================================ */
(function () {
  "use strict";
  const I = {
    keys: {},
    // 触屏摇杆
    touchLeft: { active: false, id: -1, cx: 0, cy: 0, dx: 0 },
    touchRight: { active: false, id: -1, cx: 0, cy: 0, dx: 0 },
    jumpQueue: [0, 0],          // [左, 右] 跳跃按下事件（poll 时消费）
    doubleTap: { t: 0, x: 0 },
    brokenMode: false,
    touchEnabled: false,
    onAnyInput: null,           // 音频解锁回调
  };

  const LEFT_KEYS_SYNC = { a: -1, d: 1, arrowleft: -1, arrowright: 1 };
  const JUMP_SYNC_KEYS = [" ", "w", "arrowup"];

  function fireInput() { if (I.onAnyInput) I.onAnyInput(); }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    if (!I.keys[k]) {
      if (I.brokenMode) {
        if (k === " " || k === "w") I.jumpQueue[0]++;       // 碎镜：空格/W = 棱跳
        if (k === "arrowup") I.jumpQueue[1]++;               // 碎镜：↑ = 镜跳
      } else if (JUMP_SYNC_KEYS.includes(k)) {
        I.jumpQueue[0]++;                                    // 同步：任一跳键 = 双方
      }
    }
    I.keys[k] = true;
    fireInput();
  });
  window.addEventListener("keyup", (e) => { I.keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { I.keys = {}; });

  /* ---------- 触屏 ---------- */
  function setupTouch(layer, zoneL, zoneR, btnJL, btnJR) {
    const canTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    if (!canTouch) return;
    I.touchEnabled = true;
    layer.classList.remove("hidden");
    btnJL.classList.remove("hidden");

    function stickFor(zone) { return zone === zoneL ? I.touchLeft : I.touchRight; }

    function zoneStart(zone, stick, e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      stick.active = true; stick.id = t.identifier;
      const r = zone.getBoundingClientRect();
      stick.cx = t.clientX; stick.cy = t.clientY;
      const el = zone.querySelector(".stick");
      el.style.left = (t.clientX - r.left) + "px";
      el.style.top = (t.clientY - r.top) + "px";
      el.classList.add("active");
      fireInput();
    }
    function zoneMove(e) {
      for (const t of e.changedTouches) {
        for (const stick of [I.touchLeft, I.touchRight]) {
          if (stick.active && stick.id === t.identifier) {
            const dx = t.clientX - stick.cx;
            const dead = 14, full = 46;
            stick.dx = Math.abs(dx) < dead ? 0 : Math.max(-1, Math.min(1, (dx - Math.sign(dx) * dead) / full));
            const el = (stick === I.touchLeft ? zoneL : zoneR).querySelector(".stick");
            el.querySelector(".stick-knob").style.transform =
              `translate(calc(-50% + ${Math.max(-46, Math.min(46, dx))}px), -50%)`;
          }
        }
      }
      e.preventDefault();
    }
    function zoneEnd(e) {
      for (const t of e.changedTouches) {
        for (const [stick, zone] of [[I.touchLeft, zoneL], [I.touchRight, zoneR]]) {
          if (stick.active && stick.id === t.identifier) {
            stick.active = false; stick.dx = 0; stick.id = -1;
            const el = zone.querySelector(".stick");
            el.classList.remove("active");
            el.querySelector(".stick-knob").style.transform = "translate(-50%, -50%)";
          }
        }
      }
    }
    [zoneL, zoneR].forEach((zone, i) => {
      zone.addEventListener("touchstart", (e) => {
        if (i === 1 && !I.brokenMode) return; // 右摇杆区仅碎镜模式启用
        zoneStart(zone, stickFor(zone), e);
      }, { passive: false });
    });
    document.addEventListener("touchmove", zoneMove, { passive: false });
    document.addEventListener("touchend", zoneEnd);
    document.addEventListener("touchcancel", zoneEnd);

    btnJL.addEventListener("touchstart", (e) => { e.preventDefault(); I.jumpQueue[0]++; fireInput(); }, { passive: false });
    btnJR.addEventListener("touchstart", (e) => { e.preventDefault(); I.jumpQueue[1]++; fireInput(); }, { passive: false });

    // 同步模式：右半屏双击 = 跳跃（策划案 3.2）
    layer.addEventListener("touchstart", (e) => {
      if (I.brokenMode) return;
      const t = e.changedTouches[0];
      const now = performance.now();
      if (t.clientX > window.innerWidth * 0.4) {
        if (now - I.doubleTap.t < 300 && Math.abs(t.clientX - I.doubleTap.x) < 60) {
          I.jumpQueue[0]++; I.doubleTap.t = 0; fireInput();
        } else { I.doubleTap.t = now; I.doubleTap.x = t.clientX; }
      }
    }, { passive: true });
  }

  function setBrokenMode(b) {
    I.brokenMode = b;
    const zr = document.getElementById("stick-zone-right");
    const bj = document.getElementById("btn-jump-right");
    if (I.touchEnabled) {
      zr.classList.toggle("hidden", !b);
      bj.classList.toggle("hidden", !b);
    }
  }

  /* ---------- 手柄 ---------- */
  let padPrev = { a: false, rb: false, rsy: false };
  function pollGamepad(out) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!I.brokenMode) {
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.35) out.left.dx = ax > 0 ? 1 : -1;
        const a = p.buttons[0] && p.buttons[0].pressed;
        if (a && !padPrev.a) out.left.jump++;
        padPrev.a = a;
      } else {
        const lax = p.axes[0] || 0, rax = p.axes[2] || 0;
        if (Math.abs(lax) > 0.35) out.left.dx = lax > 0 ? 1 : -1;
        if (Math.abs(rax) > 0.35) out.right.dx = rax > 0 ? 1 : -1;
        const a = p.buttons[0] && p.buttons[0].pressed;
        const rb = p.buttons[5] && p.buttons[5].pressed;
        const rsy = (p.axes[3] || 0) < -0.55;
        if (a && !padPrev.a) out.left.jump++;
        if ((rb && !padPrev.rb) || (rsy && !padPrev.rsy)) out.right.jump++;
        padPrev = { a, rb, rsy };
      }
      break;
    }
  }

  /* ---------- 每帧轮询：输出归一化输入 ---------- */
  function poll() {
    const out = {
      left: { dx: 0, jump: 0 },
      right: { dx: 0, jump: 0 },
    };
    const k = I.keys;
    if (!I.brokenMode) {
      for (const key in LEFT_KEYS_SYNC) if (k[key]) out.left.dx = LEFT_KEYS_SYNC[key];
      // 跳跃走事件队列（边沿触发），按住键不重复跳
      out.left.jump = I.jumpQueue[0];
      if (I.touchLeft.active && Math.abs(I.touchLeft.dx) > 0.01) out.left.dx = Math.sign(I.touchLeft.dx);
    } else {
      if (k["a"]) out.left.dx = -1; else if (k["d"]) out.left.dx = 1;
      if (k["arrowleft"]) out.right.dx = -1; else if (k["arrowright"]) out.right.dx = 1;
      out.left.jump = I.jumpQueue[0];
      out.right.jump = I.jumpQueue[1];
      if (I.touchLeft.active && Math.abs(I.touchLeft.dx) > 0.01) out.left.dx = Math.sign(I.touchLeft.dx);
      if (I.touchRight.active && Math.abs(I.touchRight.dx) > 0.01) out.right.dx = Math.sign(I.touchRight.dx);
    }
    pollGamepad(out);
    I.jumpQueue[0] = 0; I.jumpQueue[1] = 0;
    return out;
  }

  window.MMInput = { poll, setupTouch, setBrokenMode, fireInput: () => fireInput(), get touchEnabled() { return I.touchEnabled; }, debugState: () => ({ keys: Object.assign({}, I.keys), q: [I.jumpQueue[0], I.jumpQueue[1]], broken: I.brokenMode }) };
})();
