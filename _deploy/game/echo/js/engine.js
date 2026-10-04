/* ============================================================
 * 《回声》核心玩法引擎
 * - 声呐视觉：探测音 → 回声延迟/音调/响度/声像 映射（3.1 声音物理映射表）
 * - 录音/回放/叠加（和弦）/诱饵投掷
 * - 机关状态机 + 声音匹配判定；静默者 AI；声之碎片；共鸣晶石
 * - 渲染：暗灰蓝世界，声纹光点为唯一彩色（琥珀=环境，青绿=玩家）
 * ============================================================ */
(function () {
  const AU = () => window.EchoAudio;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const COL = {
    bg: '#0b111a', void: '#04060a', base: '#2A3B4C',
    amber: '#F5A623', teal: '#43C6AC', orange: '#ff8a3d',
    danger: '#b48cff', white: '#e8f1f8',
    /* 美术新增：材质色（仅用于渲染） */
    steel: '#9fd4ff', glass: '#a8ecff', dread: '#c0304f', dread2: '#9250d8', dust: '#cfe9ff'
  };
  const THEMES = [
    { env: '#F5A623', me: '#43C6AC', hi: '#ff8a3d' },
    { env: '#43C6AC', me: '#F5A623', hi: '#7dd6ff' },
    { env: '#c58cff', me: '#7dd6ff', hi: '#ff8ab0' },
    { env: '#ff8ab0', me: '#ffd27d', hi: '#c58cff' }
  ];

  /* ---------- 渲染资源（模块级缓存：整个会话只生成一次，绝不每帧重建渐变） ---------- */
  const FX = { noise: null, mottle: null, glow: {}, rgb: {} };
  function fxRGB(h) {
    let v = FX.rgb[h];
    if (v) return v;
    const s = h.replace('#', '');
    const n = parseInt(s.length === 3 ? s.replace(/./g, ch => ch + ch) : s, 16);
    v = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    FX.rgb[h] = v; return v;
  }
  /* 128×128 噪点贴图 —— 只生成一次，之后 createPattern 平铺（不做每帧全屏逐像素运算） */
  function fxNoiseTile() {
    if (FX.noise) return FX.noise;
    const n = document.createElement('canvas'); n.width = n.height = 128;
    const c = n.getContext('2d'), img = c.createImageData(128, 128), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 118 + (Math.random() - .5) * 176;
      d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    FX.noise = n; return n;
  }
  /* 256×256 低频斑块 —— 一次生成，缩放到全屏画一遍，给黑暗加"不均匀"的空间层次 */
  function fxMottle() {
    if (FX.mottle) return FX.mottle;
    const S = 256, n = document.createElement('canvas'); n.width = n.height = S;
    const c = n.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 32; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 26 + Math.random() * 78;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(152,198,222,' + (.06 + Math.random() * .10).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(152,198,222,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    FX.mottle = n; return n;
  }
  /* 辉光精灵：径向渐变只做一次，之后用 drawImage 缩放复用（替代昂贵的 shadowBlur） */
  function fxGlow(col) {
    let cv = FX.glow[col];
    if (cv) return cv;
    const S = 128; cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), rgb = fxRGB(col);
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(.14, 'rgba(' + rgb + ',.60)');
    g.addColorStop(.36, 'rgba(' + rgb + ',.23)');
    g.addColorStop(.62, 'rgba(' + rgb + ',.07)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    FX.glow[col] = cv; return cv;
  }

  /* ---------- 几何工具 ---------- */
  function segHitsRect(x1, y1, x2, y2, rc) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy], q = [x1 - rc.x, rc.x + rc.w - x1, y1 - rc.y, rc.y + rc.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }
  function circleRectResolve(px, py, r, rc) { // 返回修正后的位置
    const nx = clamp(px, rc.x, rc.x + rc.w), ny = clamp(py, rc.y, rc.y + rc.h);
    let dx = px - nx, dy = py - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 === 0) { // 圆心在矩形内：推向最近边
      const l = px - rc.x, rr = rc.x + rc.w - px, t = py - rc.y, b = rc.y + rc.h - py;
      const m = Math.min(l, rr, t, b);
      if (m === l) return { x: rc.x - r, y: py };
      if (m === rr) return { x: rc.x + rc.w + r, y: py };
      if (m === t) return { x: px, y: rc.y - r };
      return { x: px, y: rc.y + rc.h + r };
    }
    const d = Math.sqrt(d2), push = (r - d) / d;
    return { x: px + dx * push, y: py + dy * push };
  }

  class Game {
    constructor(canvas, opts) {
      this.cv = canvas; this.cx2 = canvas.getContext('2d');
      this.opts = opts || {};
      this.settings = opts.settings || { viz: true, pure: false, vibe: true, theme: 0 };
      this.mode = opts.mode || 'story';
      this.onComplete = opts.onComplete || (() => { });
      this.onExit = opts.onExit || (() => { });
      this.onEvent = opts.onEvent || (() => { });
      this.load(opts.level);
      this.initFX();
      this.bindInput();
      this.running = true;
      this.lastT = performance.now();
      this.acc = 0;
      this.raf = requestAnimationFrame(t => this.frame(t));
    }

    /* 初始化渲染资源：噪点贴图 / 低频斑块 / 光晕精灵缓存与尘埃粒子池。
       注意：这里必须预烘焙一次，否则首帧会有明显卡顿；
       之前这个方法被调用却没有定义（TypeError: this.initFX is not a function），
       导致"点进关卡就崩"，也就是玩家反馈的"根本进不去"。 */
    initFX() {
      fxNoiseTile();
      fxMottle();
      if (!this._motes) {
        this._motes = [];
        for (let i = 0; i < 48; i++) this._motes.push({
          x: Math.random(), y: Math.random(),
          s: .35 + Math.random() * .85, ph: Math.random() * 7, sp: .05 + Math.random() * .16
        });
      }
    }

    /* ---------- 关卡装载 ---------- */
    load(def) {
      const L = def;
      this.L = L;
      this.W = L.bounds[0]; this.H = L.bounds[1];
      this.player = { x: L.spawn[0], y: L.spawn[1], dx: 1, dy: 0, stepT: 0, moving: false };
      this.spawn = L.spawn.slice();
      this.checkpoint = L.spawn.slice();
      this.walls = (L.walls || []).map(w => ({ x: w[0], y: w[1], w: w[2], h: w[3], reveal: 0, warm: 0, mat: 'stone' }));
      // 采样点（回声命中用）
      for (const w of this.walls) {
        w.pts = [];
        const per = 2 * (w.w + w.h), step = Math.max(1.1, per / 10);
        for (let d = 0; d < per; d += step) {
          let p;
          if (d < w.w) p = [w.x + d, w.y];
          else if (d < w.w + w.h) p = [w.x + w.w, w.y + d - w.w];
          else if (d < 2 * w.w + w.h) p = [w.x + w.w - (d - w.w - w.h), w.y + w.h];
          else p = [w.x, w.y + w.h - (d - 2 * w.w - w.h)];
          w.pts.push(p);
        }
      }
      this.doors = (L.doors || []).map(d => Object.assign({ open: false, anim: 0, hold: 0, denyCd: 0 }, d));
      this.charges = (L.charges || []).map(c => Object.assign({ charged: false, pulse: 0 }, c));
      this.bridges = (L.bridges || []).map(b => Object.assign({ active: false, glow: 0 }, b));
      this.mirrors = (L.mirrors || []).map(m => Object.assign({ reveal: 0, pulse: 0 }, m));
      this.voids = (L.voids || []).map(v => ({ x: v[0], y: v[1], w: v[2], h: v[3] }));
      this.srcs = (L.sources || []).map((s, i) => Object.assign({
        id: i, timer: Math.random() * (s.auto || 0), emitting: 0, cd: 0, reveal: 0, warm: 0, phase: Math.random() * 6
      }, s));
      this.enemies = (L.enemies || []).map(e => ({
        x: e.patrol[0][0], y: e.patrol[0][1], patrol: e.patrol, wp: 1 % e.patrol.length,
        speed: e.speed, state: 'patrol', target: null, scanT: 0, reveal: 0, alertT: 0, home: 0
      }));
      this.frags = (L.frags || []).map(f => ({ x: f[0], y: f[1], got: false, t: 0, shimmerT: Math.random() * 2 }));
      this.pickups = (L.pickups || []).map(p => Object.assign({ got: false }, p));
      this.crystal = L.crystal ? { x: L.crystal[0], y: L.crystal[1], charge: 0, reveal: 0, done: false } : null;
      this.exitZone = L.exit || null;
      this.silence = L.silenceWall ? { x: L.silenceWall.x, speed: L.silenceWall.speed, active: false, hitT: 0 } : null;
      this.bells = (L.doors || []).filter(d => d.bell).map(d => ({ x: d.bell[0], y: d.bell[1], ring: 0, link: d.id }));

      this.rings = []; this.parts = []; this.sched = []; this.noises = []; this.playing = [];
      this.slots = [null, null, null]; this.sel = 0;
      this.rec = null; // {t, ev:{kind,pitch,stable,gain}}
      this.bait = null;
      this.time = 0; this.plays = 0; this.baitsUsed = 0; this.catches = 0;
      this.fragsGot = 0; this.exposure = 0; this.cloakT = 0;
      this.hintT = 0; this.hintOn = 0; this.hintsUsed = false; this.progress = 0;
      this.state = 'play'; this.caughtT = 0; this.completeT = 0; this.flash = 0;
      this.escaped = false; this.demoDone = false; this.demoT = 0; this.demo = null;
      this.shimmerT = 0; this.cam = { x: this.player.x, y: this.player.y };
      this.sight = 0;
      this.keys = {}; this.touch = { jx: 0, jy: 0 };
      this.buttons = []; this.joy = null; this.pIds = {};
      this.wave = new Array(64).fill(0);
      AU() && AU().startMusic();
      AU() && AU().setIntensity(0);
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.unbindInput();
      AU() && AU().stopMusic();
    }

    /* ---------- 输入 ---------- */
    bindInput() {
      this.onKeyDown = e => {
        if (e.repeat) return;
        const k = e.code;
        this.keys[k] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
        if (this.state !== 'play') return;
        if (k === 'Space') this.doPing();
        if (k === 'KeyR') this.startRecord();
        if (k === 'KeyE') this.playSel();
        if (k === 'KeyC') this.doChord();
        if (k === 'KeyF') this.doBait();
        if (k === 'KeyG') this.dropSel();
        if (k === 'Digit1') this.sel = 0;
        if (k === 'Digit2') this.sel = 1;
        if (k === 'Digit3') this.sel = 2;
        if (k === 'KeyQ') this.sight = 1;
      };
      this.onKeyUp = e => {
        this.keys[e.code] = false;
        if (e.code === 'KeyR' && this.rec) this.stopRecord();
        if (e.code === 'KeyQ') this.sight = 0;
      };
      /* 统一 Pointer Events：鼠标与触屏同一路径，pointerdown 即时响应，杜绝点击无效 */
      this.onPointerDown = e => {
        AU() && AU().init();
        if (this.state !== 'play') return;
        const isTouch = e.pointerType === 'touch';
        if (isTouch) {
          e.preventDefault();
          this.isTouchUI = true;
        } else if (e.button !== 0) return;
        if (!this.buttons.length) this.layout();
        const cx = e.clientX, cy = e.clientY;
        // 屏幕功能按钮：鼠标 / 触屏均可点按
        for (const b of this.buttons) {
          if (dist(cx, cy, b.x, b.y) < b.r * 1.4) {
            this.pIds[e.pointerId] = b.id;
            if (b.id === 'ping') this.doPing();
            else if (b.id === 'rec') this.startRecord();
            else if (b.id === 'play') this.playSel();
            else if (b.id === 'chord') this.doChord();
            else if (b.id === 'bait') this.doBait();
            else if (b.id === 'slot') { this.sel = (this.sel + 1) % 3; AU() && AU().playUI('hover'); }
            else if (b.id === 'sight') this.sight = 1;
            else if (b.id === 'pause') this.opts.onPause && this.opts.onPause();
            return;
          }
        }
        if (isTouch) {
          // 左半屏拖动=虚拟摇杆；轻点=探测音
          if (cx < this.vw * .48 && !this.joy) {
            this.joy = { id: e.pointerId, ox: cx, oy: cy, x: cx, y: cy, t0: performance.now() };
            this.pIds[e.pointerId] = 'joy';
          } else this.doPing();
        } else {
          this.doPing();
        }
      };
      this.onPointerMove = e => {
        if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; }
      };
      this.onPointerUp = e => {
        const held = this.pIds[e.pointerId];
        delete this.pIds[e.pointerId];
        if (held === 'rec' && this.rec) this.stopRecord();
        if (held === 'sight') this.sight = 0;
        if (this.joy && e.pointerId === this.joy.id) {
          const dt = performance.now() - this.joy.t0;
          const moved = Math.hypot(this.joy.x - this.joy.ox, this.joy.y - this.joy.oy);
          this.joy = null;
          if (dt < 220 && moved < 12 && this.state === 'play') this.doPing(); // 摇杆区轻点也发声
        }
      };
      this.onCtxMenu = e => e.preventDefault();
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      this.cv.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('pointercancel', this.onPointerUp);
      this.cv.addEventListener('contextmenu', this.onCtxMenu);
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
    }

    unbindInput() {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.cv.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
      this.cv.removeEventListener('contextmenu', this.onCtxMenu);
      window.removeEventListener('resize', this._onResize);
    }
    layout() { // 触屏按钮布局
      const W = this.vw, H = this.vh, u = Math.min(W, H) / 8;
      this.btnU = u;
      this.buttons = [
        { id: 'ping', x: W - u * 1.6, y: H - u * 1.8, r: u * .8 },
        { id: 'rec', x: W - u * 3.6, y: H - u * 1.15, r: u * .58, hold: 'rec' },
        { id: 'play', x: W - u * 1.15, y: H - u * 3.8, r: u * .58 },
        { id: 'chord', x: W - u * 3.7, y: H - u * 2.9, r: u * .46 },
        { id: 'bait', x: W - u * 2.45, y: H - u * 4.7, r: u * .46 },
        { id: 'slot', x: W - u * 5.5, y: H - u * 1.05, r: u * .44 },
        { id: 'sight', x: W - u * 7, y: H - u * 1.05, r: u * .44, hold: 'sight' },
        { id: 'pause', x: W - u * .8, y: u * .8, r: u * .45 }
      ];
    }
    /* ---------- 玩法动作 ---------- */
    panOf(x, y) { return clamp((x - this.player.x) / 9, -1, 1); }
    gainOf(x, y) { const d = dist(x, y, this.player.x, this.player.y); return Math.pow(clamp(1 - d / 20, 0, 1), 1.5); }
    noise(x, y, r) { this.noises.push({ x, y, r, t: .12 }); this.exposure = Math.max(this.exposure, clamp(r / 16, 0, 1)); }

    doPing() {
      if (this.state !== 'play') return;
      const p = this.player;
      this.rings.push({ x: p.x, y: p.y, r: 0, max: 14, speed: 26 });
      AU() && AU().playPing(0);
      this.exposure = Math.max(this.exposure, .08);
      this.vibrate(8);
      // 计划回声命中（含遮挡检测）
      const hits = [];
      const test = (x, y, cb) => {
        const d = dist(x, y, p.x, p.y);
        if (d > 14 || d < .3) return;
        const sx = lerp(p.x, x, .94), sy = lerp(p.y, y, .94);
        for (const w of this.solids()) if (segHitsRect(p.x, p.y, sx, sy, w)) return;
        hits.push({ d, cb });
      };
      for (const w of this.walls) {
        let best = null;
        for (const pt of w.pts) {
          const d = dist(pt[0], pt[1], p.x, p.y);
          if (d > 14) continue;
          const sx = lerp(p.x, pt[0], .94), sy = lerp(p.y, pt[1], .94);
          let blocked = false;
          for (const r of this.solids()) if (segHitsRect(p.x, p.y, sx, sy, r)) { blocked = true; break; }
          if (!blocked && (!best || d < best.d)) best = { d, pt };
        }
        if (best) hits.push({ d: best.d, cb: () => this.revealWall(w, best.pt, 0) });
      }
      for (const s of this.srcs) test(s.x, s.y, () => { s.reveal = 1.4; this.echoSound(s.kind, s.pitch, this.gainOf(s.x, s.y) * .5, s.x, s.y); });
      for (const d of this.doors) if (!d.open) test(d.x + d.w / 2, d.y + d.h / 2, () => {
        d.reveal = 1.2; this.revealRect(d, 0);
        this.echoSound('metal', .2, this.gainOf(d.x, d.y) * .6, d.x, d.y);
      });
      for (const b of this.bridges) test(b.x + b.w / 2, b.y + b.h / 2, () => { b.reveal = 1.2; this.revealRect(b, 0); this.echoSound('glass', .85, this.gainOf(b.x, b.y) * .5, b.x, b.y); });
      for (const e of this.enemies) test(e.x, e.y, () => { e.reveal = 1.6; this.echoSound('stone', .1, this.gainOf(e.x, e.y) * .7, e.x, e.y); });
      for (const f of this.frags) if (!f.got) test(f.x, f.y, () => { f.reveal = 1.2; AU() && AU().playShimmer(this.panOf(f.x, f.y), .6); });
      for (const m of this.mirrors) test(m.x, m.y, () => { m.reveal = 1.3; this.echoSound('glass', .95, this.gainOf(m.x, m.y) * .5, m.x, m.y); });
      for (const pk of this.pickups) if (!pk.got) test(pk.x, pk.y, () => { pk.reveal = 1.2; });
      if (this.crystal) test(this.crystal.x, this.crystal.y, () => {
        this.crystal.reveal = 1.5;
        this.echoSound('bell', .55, this.gainOf(this.crystal.x, this.crystal.y) * .6, this.crystal.x, this.crystal.y);
        // 晶石充能（3.3 通关条件）
        if (dist(this.player.x, this.player.y, this.crystal.x, this.crystal.y) < 3.4 && !this.crystal.done && this.state === 'play') {
          this.crystal.charge++;
          AU() && AU().playCharge(this.crystal.charge - 1);
          this.burst(this.crystal.x, this.crystal.y, 12, 1);
          if (this.crystal.charge >= 3) {
            if (this.silence) { // 终章：静默苏醒，限时逃脱
              this.silence.active = true;
              this.checkpoint = [this.crystal.x, this.crystal.y];
              AU() && AU().playDoorOpen(0);
              AU() && AU().playAlert(0);
              this.burst(this.crystal.x, this.crystal.y, 30, 1);
              this.flash = .6;
            } else this.startComplete();
          }
        }
      });
      // 延迟=距离/声速（声音物理映射：回响延迟→距离）
      hits.sort((a, b) => a.d - b.d);
      hits.slice(0, 14).forEach(h => this.sched.push({ t: h.d / 26, fn: h.cb }));
      if (hits.length > 14) hits.slice(14).forEach(h => this.sched.push({ t: h.d / 26, fn: () => { } }));
    }
    solids() {
      const arr = this.walls.slice();
      for (const d of this.doors) if (!d.open) arr.push(d);
      return arr;
    }
    revealWall(w, pt, warm) {
      w.reveal = Math.max(w.reveal || 0, 1); w.warm = warm;
      for (let i = 0; i < 4; i++) {
        this.parts.push({
          x: pt[0] + (Math.random() - .5) * 1.5, y: pt[1] + (Math.random() - .5) * 1.5,
          vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6,
          life: 1.2 + Math.random() * 1.6, max: 2.8, warm, sz: .06 + Math.random() * .08
        });
      }
      this.echoSound(w.mat || 'stone', clamp(1.15 - (w.w * w.h) / 50, .15, .95), this.gainOf(pt[0], pt[1]) * .55, pt[0], pt[1]);
    }
    revealRect(r, warm) {
      for (let i = 0; i < 6; i++) {
        this.parts.push({
          x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h,
          vx: (Math.random() - .5) * .7, vy: (Math.random() - .5) * .7,
          life: 1 + Math.random() * 1.4, max: 2.4, warm, sz: .07
        });
      }
    }
    echoSound(kind, pitch, gain, x, y) {
      if (gain < .02) return;
      AU() && AU().playEcho(kind, pitch, gain * .9, this.panOf(x, y), 0);
    }

    startRecord() {
      if (this.state !== 'play' || this.rec) return;
      this.rec = { t: 0, kind: null, pitch: .5, stable: false, gain: 0 };
      AU() && AU().playUI('hover');
    }
    stopRecord() {
      const r = this.rec; this.rec = null;
      if (!r) return;
      if (!r.kind || r.t < .3) { AU() && AU().playUI('deny'); return; } // 录到静默
      const dur = clamp(r.t, .5, 5);
      this.slots[this.sel] = { kind: r.kind, pitch: r.pitch, stable: r.stable, dur };
      AU() && AU().playUI('click');
    }
    dropSel() { if (this.slots[this.sel]) { this.slots[this.sel] = null; AU() && AU().playUI('back'); } }

    playDesc(desc, x, y, chordId) {
      const s = {
        desc, x, y, t: 0, dur: desc.dur, chordId: chordId || 0, seqT: 0, seqN: 0, done: false
      };
      this.playing.push(s);
      return s;
    }
    schedDescAudio(desc, x, y, gain, when) { // 回放音色（与被录声源一致）
      const A = AU(); if (!A) return;
      const pan = this.panOf(x, y);
      const g = gain * .75;
      if (desc.kind === 'wind') A.playSound('wind', desc.pitch, g, pan, desc.dur, when);
      else if (desc.kind === 'voice') A.playSound('voice', desc.pitch, g, pan, 0, when);
      else if (desc.kind === 'water') {
        const n = Math.max(1, Math.round(desc.dur / .8));
        for (let i = 0; i < n; i++) A.playSound('water', desc.pitch, g, pan, 0, when + i * .8);
      } else { // 金属/玻璃/木/石：撞击+余响
        A.playSound(desc.kind, desc.pitch, g, pan, 0, when);
        if (desc.dur > 1.6) A.playSound(desc.kind, desc.pitch, g * .7, pan, 0, when + desc.dur * .55);
      }
    }
    playSel() {
      if (this.state !== 'play') return;
      const d = this.slots[this.sel];
      if (!d) { AU() && AU().playUI('deny'); return; }
      this.plays++;
      const s = this.playDesc(d, this.player.x, this.player.y, ++this.chordSeq || (this.chordSeq = 1));
      this.noise(this.player.x, this.player.y, 16); // 回放暴露位置（3.1 规则4）
      this.schedDescAudio(d, this.player.x, this.player.y, 1, AU() ? AU().now() : 0);
      this.checkMachines(true);
    }
    doChord() {
      if (this.state !== 'play') return;
      const ids = this.slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
      if (ids.length < 2) { AU() && AU().playUI('deny'); return; }
      this.plays++;
      const cid = ++this.chordSeq;
      for (const i of ids) this.playDesc(this.slots[i], this.player.x, this.player.y, cid);
      this.noise(this.player.x, this.player.y, 16);
      this.schedDescAudio(this.slots[ids[0]], this.player.x, this.player.y, 1, AU() ? AU().now() : 0);
      this.checkMachines(true);
    }
    doBait() {
      if (this.state !== 'play') return;
      const d = this.slots[this.sel];
      if (!d || this.bait) { AU() && AU().playUI('deny'); return; }
      this.baitsUsed++;
      const p = this.player;
      this.bait = { x: p.x, y: p.y, vx: p.dx * 9, vy: p.dy * 9, t: 0, flying: true, desc: d, plays: 0 };
      AU() && AU().playThrow();
    }

    reqMatch(req, d) {
      if (!req || !d) return false;
      if (req.kind && d.kind !== req.kind) return false;
      if (req.anyKind && !req.anyKind.includes(d.kind)) return false;
      if (req.maxPitch != null && d.pitch > req.maxPitch) return false;
      if (req.minPitch != null && d.pitch < req.minPitch) return false;
      if (req.minDur != null && d.dur < req.minDur) return false;
      if (req.stable && !d.stable) return false;
      return true;
    }
    soundNearDoor(s, d) { // 声音到达机关：近距直达 或 共鸣镜折射
      if (dist(s.x, s.y, d.x + d.w / 2, d.y + d.h / 2) < 4.5) return true;
      for (const m of this.mirrors) {
        if (m.link !== d.id) continue;
        if (dist(s.x, s.y, m.x, m.y) < 4.5 && dist(m.x, m.y, d.x + d.w / 2, d.y + d.h / 2) < 20) return true;
      }
      return false;
    }
    checkMachines(fresh) {
      // 门
      for (const d of this.doors) {
        if (d.open) continue;
        if (d.type === 'auto') {
          if (d.link && d.link.every(id => { const c = this.charges.find(c => c.id === id); return c && c.charged; })) this.openDoor(d);
          continue;
        }
        let ok = false, matched = false;
        if (d.req.needs) { // 和弦（回声叠加）
          const groups = {};
          for (const s of this.playing) if (this.soundNearDoor(s, d)) (groups[s.chordId] = groups[s.chordId] || []).push(s);
          for (const cid in groups) {
            const ss = groups[cid];
            if (d.req.needs.every(nd => ss.some(s => this.reqMatch(nd, s.desc)))) { ok = true; break; }
          }
          matched = ok;
        } else {
          for (const s of this.playing) {
            if (!this.soundNearDoor(s, d)) continue;
            matched = true;
            if (this.reqMatch(d.req, s.desc)) { ok = true; break; }
          }
        }
        if (ok) { d.hold += 1 / 60; if (d.hold > .15) this.openDoor(d); }
        else {
          d.hold = 0;
          if (fresh && matched && d.denyCd <= 0) { // 不匹配弱反馈
            d.denyCd = 1.5;
            AU() && AU().playLocked(this.panOf(d.x, d.y) * this.gainOf(d.x, d.y));
          }
        }
      }
      // 共鸣柱
      for (const c of this.charges) {
        if (c.charged) continue;
        for (const s of this.playing) {
          if (dist(s.x, s.y, c.x, c.y) > (c.r || 6)) continue;
          if (this.reqMatch(c.req, s.desc)) { this.chargePillar(c); break; }
        }
      }
      // 玻璃桥：匹配声音持续期间实体化
      for (const b of this.bridges) {
        let on = false;
        for (const s of this.playing) {
          if (dist(s.x, s.y, b.x + b.w / 2, b.y + b.h / 2) < (b.radius || 12) && this.reqMatch(b.req, s.desc)) { on = true; break; }
        }
        b.active = on;
        if (on) b.glow = 1;
      }
    }
    openDoor(d) {
      d.open = true; d.anim = 0;
      AU() && AU().playDoorOpen(this.panOf(d.x, d.y));
      const g = this.gainOf(d.x, d.y);
      this.burst(d.x + d.w / 2, d.y + d.h / 2, 16, 1);
      this.noise(d.x, d.y, 12);
      this.progress++;
      this.onEvent('door');
      const bell = this.bells.find(b => b.link === d.id);
      if (bell) { bell.ring = 1; AU() && AU().playSound('bell', .5, clamp(g + .15, .1, 1), this.panOf(bell.x, bell.y)); }
    }
    chargePillar(c) {
      c.charged = true; c.pulse = 1;
      AU() && AU().playCharge(this.charges.filter(x => x.charged).length - 1);
      this.burst(c.x, c.y, 14, 1);
      this.progress++;
      this.onEvent('charge');
    }

    burst(x, y, n, warm) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = .5 + Math.random() * 2;
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .8 + Math.random() * .9, max: 1.7, warm, sz: .08 + Math.random() * .07 });
      }
    }
    vibrate(ms) {
      if (this.settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { }
    }

    /* ---------- 主循环 ---------- */
    frame(t) {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tt => this.frame(tt));
      let dt = (t - this.lastT) / 1000; this.lastT = t;
      dt = Math.min(dt, .05);
      if (this.state === 'play' || this.state === 'complete') {
        this.acc += dt;
        let n = 0;
        while (this.acc > 1 / 120 && n++ < 8) { this.update(1 / 120); this.acc -= 1 / 120; }
      }
      this.render();
    }
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.vw = innerWidth; this.vh = innerHeight;
      this.cv.width = this.vw * dpr; this.cv.height = this.vh * dpr;
      this.cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.scale = clamp(Math.min(this.vw / 24, this.vh / 15), 25, 110); // px/单位（1单位≈36px基准）
      this.layout(); // 屏幕功能按钮常显（鼠标/触屏均可点按）
    }

    update(dt) {
      if (this.state === 'complete') {
        this.completeT += dt;
        this.updateParts(dt);
        if (this.completeT > 1.6 && !this.finished) { this.finished = true; this.finishLevel(); }
        return;
      }
      if (this.state === 'caught') {
        this.caughtT -= dt;
        if (this.caughtT <= 0) this.respawn();
        return;
      }
      this.time += dt;
      const p = this.player;

      /* 移动（虚拟摇杆/WASD） */
      let mx = 0, my = 0;
      if (this.keys.KeyW || this.keys.ArrowUp) my -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) my += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
      if (this.joy) {
        const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) { mx = dx / d; my = dy / d; }
      }
      const ml = Math.hypot(mx, my);
      p.moving = ml > .01;
      if (p.moving) {
        mx /= ml; my /= ml;
        p.dx = mx; p.dy = my;
        const sp = 5;
        p.x += mx * sp * dt; p.y += my * sp * dt;
        // 脚步声（静音披风期间无声）
        p.stepT -= dt;
        if (p.stepT <= 0) {
          p.stepT = .34;
          const silent = this.cloakT > 0;
          AU() && AU().playStep(silent);
          if (!silent) { this.noise(p.x, p.y, 2.6); this.stepReveal(); }
          else this.noise(p.x, p.y, .6);
        }
      }
      // 碰撞
      for (let pass = 0; pass < 2; pass++)
        for (const r of this.solids()) {
          const fx = circleRectResolve(p.x, p.y, .38, r);
          if (fx) { p.x = fx.x; p.y = fx.y; this.tryBump(r); }
        }
      p.x = clamp(p.x, .5, this.W - .5); p.y = clamp(p.y, .5, this.H - .5);

      /* 声源发射（自动声源） */
      for (const s of this.srcs) {
        s.cd -= dt; s.timer -= dt; s.reveal = Math.max(0, (s.reveal || 0) - dt * .5);
        if (s.struck) continue;
        if (s.emitting > 0) {
          s.emitting -= dt;
          if (this.rec) {
            const d = dist(s.x, s.y, p.x, p.y);
            if (d < 7.5) {
              const g = this.gainOf(s.x, s.y) + .2;
              if (!this.rec.kind || g > this.rec.gain) {
                this.rec.kind = s.kind; this.rec.pitch = s.pitch; this.rec.stable = !!s.stable; this.rec.gain = g;
              }
            }
          }
          if (s.emitting <= 0) s.timer = s.auto;
        } else if (s.timer <= 0) {
          s.emitting = s.gustDur || .45;
          s.timer = 9999;
          // 发声可视化 + 附近可听
          const g = this.gainOf(s.x, s.y);
          if (g > .02) {
            if (s.kind === 'wind') AU() && AU().playSound('wind', s.pitch, g * .5, this.panOf(s.x, s.y), s.gustDur || .45);
            else if (s.kind === 'voice') AU() && AU().playSound('voice', s.pitch, g * .55, this.panOf(s.x, s.y));
            else AU() && AU().playSound(s.kind, s.pitch, g * .5, this.panOf(s.x, s.y));
          }
          for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            this.parts.push({ x: s.x, y: s.y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, life: 1 + Math.random(), max: 2, warm: 1, sz: .07 });
          }
          s.reveal = 1.2;
        }
      }
      // 录音时撞击声源也会录入
      if (this.rec) { this.rec.t += dt; if (this.rec.t >= 5) this.stopRecord(); }

      /* 撞击发声源 */
      for (const s of this.srcs) {
        s.cd -= dt;
        if (s.struck && s.cd <= 0) {
          const d = dist(s.x, s.y, p.x, p.y);
          if (d < .95) {
            s.cd = .8; s.reveal = 1.4;
            const g = .9;
            AU() && AU().playSound(s.kind, s.pitch, g, this.panOf(s.x, s.y));
            this.noise(s.x, s.y, s.kind === 'metal' ? 11 : 7);
            this.burst(s.x, s.y, 8, 1);
            if (this.rec) {
              if (!this.rec.kind || true) { this.rec.kind = s.kind; this.rec.pitch = s.pitch; this.rec.stable = false; this.rec.gain = 2; }
            }
          }
        }
      }

      /* 录音/回放/机关 */
      this.checkMachines(false);
      for (const s of this.playing) {
        s.t += dt;
        // 声音可视化涟漪（跟随声源）
        if (this.settings.viz && Math.random() < dt * 14) {
          this.parts.push({ x: s.x + (Math.random() - .5) * .8, y: s.y + (Math.random() - .5) * .8, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5, life: .5, max: .5, warm: 0, sz: .05 });
        }
      }
      this.playing = this.playing.filter(s => s.t < s.dur + .1);
      for (const d of this.doors) d.denyCd -= dt;
      for (const c of this.charges) c.pulse = Math.max(0, c.pulse - dt * .7);
      for (const b of this.bells) b.ring = Math.max(0, b.ring - dt * .5);

      /* 诱饵 */
      if (this.bait) {
        const b = this.bait;
        if (b.flying) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.vx *= .9; b.vy *= .9;
          if (Math.hypot(b.vx, b.vy) < .6) { b.flying = false; b.playT = 0; }
          for (const r of this.solids()) {
            const fx = circleRectResolve(b.x, b.y, .25, r);
            if (fx) { b.x = fx.x; b.y = fx.y; b.vx *= -.4; b.vy *= -.4; }
          }
        } else {
          b.playT += dt;
          const cyc = Math.max(.6, b.desc.dur);
          if (b.playT > b.plays * cyc) {
            b.plays++;
            this.schedDescAudio(b.desc, b.x, b.y, .85, AU() ? AU().now() : 0);
            this.noise(b.x, b.y, 15);
            this.checkMachines(true);
          }
          if (b.plays >= 3) this.bait = null;
        }
      }

      /* 静默者 */
      for (const e of this.enemies) {
        e.reveal = Math.max(0, e.reveal - dt);
        e.alertT = Math.max(0, e.alertT - dt);
        let tx, ty, sp = e.speed;
        if (e.state === 'investigate') {
          tx = e.target[0]; ty = e.target[1]; sp = e.speed * 1.45;
          if (dist(e.x, e.y, tx, ty) < .7) { e.scanT -= dt; sp = 0; if (e.scanT <= 0) e.state = 'patrol'; }
        } else if (e.state === 'return') {
          tx = e.patrol[e.home][0]; ty = e.patrol[e.home][1];
          if (dist(e.x, e.y, tx, ty) < .7) e.state = 'patrol';
        } else {
          const wp = e.patrol[e.wp];
          tx = wp[0]; ty = wp[1];
          if (dist(e.x, e.y, tx, ty) < .6) e.wp = (e.wp + 1) % e.patrol.length;
        }
        if (sp > 0 && tx != null) {
          const dd = Math.max(.001, dist(e.x, e.y, tx, ty));
          e.x += (tx - e.x) / dd * sp * dt; e.y += (ty - e.y) / dd * sp * dt;
        }
        // 听觉
        for (const n of this.noises) {
          if (n.heard) continue;
          if (dist(e.x, e.y, n.x, n.y) < n.r) {
            n.heard = true;
            e.state = 'investigate'; e.target = [n.x, n.y]; e.scanT = 2.4; e.alertT = 3;
            AU() && AU().playAlert(this.panOf(e.x, e.y) * .5);
            this.exposure = 1;
            if (!this.demoDone && this.mode === 'story' && this.L.id === 'l5' && n.r >= 15) {
              // 15秒系统示范：诱饵录音引开（7.3）
              this.demoDone = true; this.demo = { t: 0, x: e.x - 6, y: e.y + 5 };
              e.target = [this.demo.x, this.demo.y];
            }
          }
        }
        // 捕捉
        if (dist(e.x, e.y, p.x, p.y) < .95) this.doCatch();
      }
      for (const n of this.noises) n.t -= dt;
      this.noises = this.noises.filter(n => n.t > 0);
      if (this.demo) {
        this.demo.t += dt;
        if (this.demo.t > 4) this.demo = null;
      }

      /* 碎片 / 拾取 / 深渊 */
      for (const f of this.frags) {
        if (f.got) continue;
        f.t += dt;
        const d = dist(f.x, f.y, p.x, p.y);
        f.shimmerT -= dt;
        if (d < 6 && f.shimmerT <= 0) { f.shimmerT = 2; AU() && AU().playShimmer(this.panOf(f.x, f.y), (f.x + f.y) / 40); }
        if (d < 1) {
          f.got = true; this.fragsGot++;
          AU() && AU().playFragment(this.panOf(f.x, f.y));
          this.burst(f.x, f.y, 14, 1); this.progress++;
          this.onEvent('frag');
        }
      }
      for (const pk of this.pickups) {
        if (!pk.got && dist(pk.x, pk.y, p.x, p.y) < 1) {
          pk.got = true; this.cloakT = 30;
          AU() && AU().playUI('open'); this.burst(pk.x, pk.y, 10, 0);
        }
      }
      this.cloakT = Math.max(0, this.cloakT - dt);
      // 深渊坠落（玻璃桥未实体化）
      let inVoid = false;
      for (const v of this.voids) if (p.x > v.x && p.x < v.x + v.w && p.y > v.y && p.y < v.y + v.h) inVoid = true;
      if (inVoid) {
        let safe = false;
        for (const b of this.bridges) if (b.active && p.x > b.x - .1 && p.x < b.x + b.w + .1 && p.y > b.y - .1 && p.y < b.y + b.h + .1) safe = true;
        if (!safe) {
          AU() && AU().playFall();
          this.flash = 1;
          this.respawn(false);
          return;
        }
      }

      /* 大静默之墙（终章限时逃脱） */
      if (this.silence && this.silence.active) {
        this.silence.x -= this.silence.speed * dt;
        if (p.x > this.silence.x - .4) {
          this.silence.hitT = 1;
          AU() && AU().playCatch();
          this.flash = 1;
          p.x = this.crystal.x; p.y = this.crystal.y;
          this.silence.x = this.L.silenceWall.x;
          this.checkpoint = [this.crystal.x, this.crystal.y];
          return;
        }
        if (this.exitZone && dist(p.x, p.y, this.exitZone[0], this.exitZone[1]) < 2.2) {
          this.escaped = true;
          this.startComplete();
          return;
        }
      }

      /* 暴露度 / 提示 / 相机 */
      // 声呐视野（按住 Q / 触屏◎）：近距持续显形
      if (this.sight) {
        const p2 = this.player;
        for (const w of this.walls) {
          const nx = clamp(p2.x, w.x, w.x + w.w), ny = clamp(p2.y, w.y, w.y + w.h);
          if (dist(nx, ny, p2.x, p2.y) < 6) w.reveal = Math.max(w.reveal, .5);
        }
        for (const e of this.enemies) if (dist(e.x, e.y, p2.x, p2.y) < 7) e.reveal = Math.max(e.reveal, .4);
        if (this.crystal && dist(this.crystal.x, this.crystal.y, p2.x, p2.y) < 7) this.crystal.reveal = Math.max(this.crystal.reveal, .5);
        if (this.settings.viz && Math.random() < dt * 20)
          this.parts.push({ x: p2.x + (Math.random() - .5) * 8, y: p2.y + (Math.random() - .5) * 8, vx: 0, vy: 0, life: .6, max: .6, warm: 0, sz: .05 });
      }
      this.exposure = Math.max(0, this.exposure - dt * .5);
      for (const w of this.walls) { w.reveal = Math.max(0, w.reveal - dt * .22); }
      for (const d of this.doors) if (!d.open) d.reveal = Math.max(0, (d.reveal || 0) - dt * .28);
      for (const b of this.bridges) b.reveal = Math.max(0, (b.reveal || 0) - dt * .28);
      for (const m of this.mirrors) { m.reveal = Math.max(0, m.reveal - dt * .3); m.pulse = Math.max(0, m.pulse - dt); }
      for (const pk of this.pickups) pk.reveal = Math.max(0, (pk.reveal || 0) - dt * .3);
      if (this.crystal) this.crystal.reveal = Math.max(0, this.crystal.reveal - dt * .3);
      this.flash = Math.max(0, this.flash - dt * 2);

      // 卡关提示（3.5/7.3：180 秒无进展 → 声纹路径）
      if (this.progress !== this.lastProg) { this.lastProg = this.progress; this.hintT = 0; }
      else {
        this.hintT += dt;
        if (this.hintT > 180 && this.hintOn <= 0) { this.hintOn = 6; this.hintsUsed = true; AU() && AU().playHint(); this.hintT = -90; }
      }
      this.hintOn = Math.max(0, this.hintOn - dt);

      // 沙盒波形
      if (this.L.sandbox) {
        const an = AU() && AU().analyser();
        if (an) {
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteFrequencyData(data);
          for (let i = 0; i < this.wave.length; i++) this.wave[i] = lerp(this.wave[i], data[i * 2] / 255, .3);
        }
      }
      // 音乐强度随进度（5.4.2 交互式分层）
      const total = (this.doors.length + this.charges.length) || 1;
      const done = this.doors.filter(d => d.open).length + this.charges.filter(c => c.charged).length;
      AU() && AU().setIntensity(clamp(done / total, 0, 1));

      this.updateParts(dt);
      // 相机
      this.cam.x = lerp(this.cam.x, p.x, 1 - Math.pow(.001, dt));
      this.cam.y = lerp(this.cam.y, p.y, 1 - Math.pow(.001, dt));

      // 计划事件
      for (const s of this.sched) s.t -= dt;
      const fire = this.sched.filter(s => s.t <= 0);
      this.sched = this.sched.filter(s => s.t > 0);
      fire.forEach(s => s.fn());
    }
    updateParts(dt) {
      for (const pt of this.parts) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; pt.vx *= .98; pt.vy *= .98; }
      this.parts = this.parts.filter(pt => pt.life > 0);
      if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
      for (const r of this.rings) r.r += r.speed * dt;
      this.rings = this.rings.filter(r => r.r < r.max);
    }
    stepReveal() { // 听见自己的脚步：近处微光
      const p = this.player;
      for (const w of this.walls) {
        const nx = clamp(p.x, w.x, w.x + w.w), ny = clamp(p.y, w.y, w.y + w.h);
        if (dist(nx, ny, p.x, p.y) < 2.8) w.reveal = Math.max(w.reveal, .4);
      }
      for (const s of this.srcs) if (dist(s.x, s.y, p.x, p.y) < 2.8) s.reveal = Math.max(s.reveal, .5);
    }
    tryBump(r) {
      const p = this.player;
      for (const s of this.srcs) {
        if (!s.struck || s.cd > 0) continue;
        if (dist(s.x, s.y, p.x, p.y) < .95 && p.moving) {
          s.cd = .8; s.reveal = 1.4;
          AU() && AU().playSound(s.kind, s.pitch, .9, this.panOf(s.x, s.y));
          this.noise(s.x, s.y, s.kind === 'metal' ? 11 : 7);
          this.burst(s.x, s.y, 8, 1);
          if (this.rec) { this.rec.kind = s.kind; this.rec.pitch = s.pitch; this.rec.stable = false; this.rec.gain = 2; }
        }
      }
    }
    doCatch() {
      if (this.state !== 'play') return;
      this.state = 'caught'; this.caughtT = 1.4; this.catches++;
      this.flash = 1;
      AU() && AU().playCatch();
      this.vibrate(120);
      this.playing = [];
      if (this.bait) this.bait = null;
    }
    respawn(full) {
      const toStart = full === undefined ? this.catches >= 3 : full;
      if (toStart) { this.checkpoint = this.spawn.slice(); this.catches = 0; }
      const p = this.player;
      p.x = this.checkpoint[0]; p.y = this.checkpoint[1];
      for (const e of this.enemies) { e.x = e.patrol[0][0]; e.y = e.patrol[0][1]; e.state = 'patrol'; e.wp = 1 % e.patrol.length; e.alertT = 0; }
      this.playing = []; this.bait = null; this.rec = null;
      this.state = 'play';
    }
    startComplete() {
      if (this.state === 'complete') return;
      this.state = 'complete'; this.completeT = 0;
      AU() && AU().playComplete();
      const cx = this.player.x, cy = this.player.y;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 1.4, max: 1.4, warm: 1, sz: .1 });
      }
    }
    finishLevel() {
      this.onComplete({
        time: this.time, plays: this.plays, frags: this.fragsGot, fragsMax: this.frags.length,
        catches: this.catches, baits: this.baitsUsed, hints: this.hintsUsed,
        pure: this.opts.musicOff || false, escaped: this.escaped
      });
    }

    /* ================= 渲染 ================= */
    render() {
      const c = this.cx2, W = this.vw || innerWidth, H = this.vh || innerHeight;
      if (!this.vw) this.resize();
      const th = THEMES[this.settings.theme || 0] || THEMES[0];
      const S = this.scale, cam = this.cam;
      c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
      const pure = this.settings.pure;
      const wx = x => (x - cam.x) * S + W / 2, wy = y => (y - cam.y) * S + H / 2;

      // 环境层：不均匀的黑暗（低频斑块，随相机视差）+ 极细颗粒
      // 目的：大面积纯黑会让画面"什么都没有"，加一层几乎看不见的层次，黑暗才有空气感
      const mot = fxMottle();
      if (mot) {
        const cell = 340;
        const mox = -(((cam.x * 26) % cell) + cell) % cell;
        const moy = -(((cam.y * 26) % cell) + cell) % cell;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .30;
        for (let i = -1; i * cell + mox < W; i++)
          for (let j = -1; j * cell + moy < H; j++)
            c.drawImage(mot, mox + i * cell, moy + j * cell, cell, cell);
        c.restore();
        c.globalAlpha = 1;
      }
      c.save();
      c.globalAlpha = .022;
      c.fillStyle = c.createPattern(fxNoiseTile(), 'repeat');
      c.fillRect(0, 0, W, H);
      c.restore();

      if (pure) {
        this.renderPlayer(c, wx, wy, th, true);
        this.renderHUD(c, W, H, th);
        this.renderPost(c, W, H, th);
        return;
      }

      // 深渊
      for (const v of this.voids) {
        c.fillStyle = COL.void;
        c.fillRect(wx(v.x), wy(v.y), v.w * S, v.h * S);
      }
      // 出口传送点（终章逃脱）
      if (this.exitZone && this.silence && this.silence.active) {
        const ex = wx(this.exitZone[0]), ey = wy(this.exitZone[1]);
        const rr = (1.6 + Math.sin(this.time * 3) * .2) * S;
        c.strokeStyle = th.me; c.globalAlpha = .8; c.lineWidth = 2;
        c.beginPath(); c.arc(ex, ey, rr, 0, 7); c.stroke();
        c.beginPath(); c.arc(ex, ey, rr * .55, 0, 7); c.stroke();
        c.globalAlpha = 1;
      }
      // 共鸣镜
      for (const m of this.mirrors) {
        const a = Math.max(m.reveal, m.pulse * .8, .12);
        c.save(); c.translate(wx(m.x), wy(m.y));
        c.strokeStyle = th.env; c.globalAlpha = a; c.lineWidth = 2.5;
        c.beginPath(); c.arc(0, 0, m.r * S, -2.2, .9); c.stroke();
        c.globalAlpha = a * .5;
        c.beginPath(); c.arc(0, 0, m.r * S * .7, -1.8, .5); c.stroke();
        c.globalAlpha = 1; c.restore();
      }
      // 玻璃桥
      for (const b of this.bridges) {
        const rev = Math.max(b.reveal || 0, b.active ? .9 : 0);
        if (rev <= 0) continue;
        c.save();
        c.globalAlpha = b.active ? .9 * (.6 + .4 * Math.sin(this.time * 6)) : rev * .5;
        c.strokeStyle = b.active ? COL.white : th.env;
        c.lineWidth = b.active ? 3 : 1.5;
        c.strokeRect(wx(b.x), wy(b.y), b.w * S, b.h * S);
        if (b.active) {
          c.globalAlpha = .25; c.fillStyle = th.me;
          c.fillRect(wx(b.x), wy(b.y), b.w * S, b.h * S);
        }
        c.restore();
      }
      // 墙体（回声显形）：柔和外辉光 + 内部微填充 + 亮边，替代生硬描边
      for (const w of this.walls) {
        if (w.reveal <= .02) continue;
        const col = w.warm ? th.env : th.me;
        const a = Math.min(1, w.reveal);
        const rx = wx(w.x), ry = wy(w.y), rw = w.w * S, rh = w.h * S;
        // 外辉光（用缓存精灵拉伸成椭圆光晕，避免每帧建渐变）
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = a * .5;
        const pad = Math.max(rw, rh) * .55 + 10;
        c.drawImage(fxGlow(col),
          rx + rw / 2 - (rw / 2 + pad), ry + rh / 2 - (rh / 2 + pad),
          rw + pad * 2, rh + pad * 2);
        c.restore();
        // 内部微弱填充 —— 让墙体有体积而不是空心框
        c.globalAlpha = a * .10;
        c.fillStyle = col;
        c.fillRect(rx, ry, rw, rh);
        // 亮边 + 外侧柔边
        c.globalAlpha = a * .95;
        c.lineWidth = 2;
        c.strokeStyle = col;
        c.strokeRect(rx, ry, rw, rh);
        c.globalAlpha = a * .16;
        c.lineWidth = 6;
        c.strokeRect(rx, ry, rw, rh);
        c.globalAlpha = 1;
      }
      // 门（机关）
      for (const d of this.doors) {
        const cx = wx(d.x + d.anim * (d.w > d.h ? d.w : 0)), cy = wy(d.y + d.anim * (d.h > d.w ? d.h : 0));
        if (d.open) {
          d.anim = Math.min(1, d.anim + .02);
          if (d.anim < 1) {
            c.globalAlpha = 1 - d.anim;
            c.strokeStyle = COL.orange; c.lineWidth = 3;
            c.strokeRect(wx(d.x), wy(d.y), d.w * S, d.h * S);
            c.globalAlpha = 1;
          }
          continue;
        }
        const rev = Math.max(d.reveal || 0, .06);
        c.globalAlpha = Math.min(1, rev);
        c.fillStyle = '#3a4b5c';
        c.fillRect(wx(d.x), wy(d.y), d.w * S, d.h * S);
        c.strokeStyle = th.env; c.lineWidth = 2;
        c.strokeRect(wx(d.x), wy(d.y), d.w * S, d.h * S);
        // 机关纹：同心弧
        const mx = wx(d.x + d.w / 2), my = wy(d.y + d.h / 2), mr = Math.min(d.w, d.h) * S * .3;
        c.beginPath(); c.arc(mx, my, mr, 0, 7); c.stroke();
        c.beginPath(); c.arc(mx, my, mr * .5, 0, 7); c.stroke();
        c.globalAlpha = 1;
      }
      // 共鸣柱
      for (const cc of this.charges) {
        const x = wx(cc.x), y = wy(cc.y);
        const pulse = cc.pulse > 0 ? cc.pulse : 0;
        c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
        c.globalAlpha = .35 + pulse * .65;
        c.strokeStyle = cc.charged ? COL.orange : th.env;
        c.lineWidth = 2;
        const s0 = (.4 + pulse * .3) * S;
        c.strokeRect(-s0, -s0, s0 * 2, s0 * 2);
        if (cc.charged) {
          c.globalAlpha = .2 + .18 * Math.sin(this.time * 4);
          c.fillStyle = COL.orange;
          c.fillRect(-s0 * 1.6, -s0 * 1.6, s0 * 3.2, s0 * 3.2);
        }
        c.restore(); c.globalAlpha = 1;
      }
      // 声源
      for (const s of this.srcs) {
        const a = Math.max(s.reveal, s.emitting > 0 ? .85 : 0);
        if (a <= 0) continue;
        const x = wx(s.x), y = wy(s.y);
        const col = s.kind === 'voice' ? th.me : th.env;
        c.strokeStyle = col; c.globalAlpha = a;
        c.fillStyle = col;
        c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill();
        if (s.emitting > 0 || s.struck) {
          const pr = ((this.time * 2 + s.phase) % 1);
          c.globalAlpha = a * (1 - pr) * .8;
          c.beginPath(); c.arc(x, y, (4 + pr * 12) * S * .2, 0, 7); c.stroke();
        }
        c.globalAlpha = 1;
      }
      // 钟
      for (const b of this.bells) {
        const x = wx(b.x), y = wy(b.y);
        c.strokeStyle = COL.orange; c.globalAlpha = .5 + b.ring * .5; c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y, (.5 + b.ring * .3) * S, 0, 7); c.stroke();
        c.beginPath(); c.moveTo(x - .35 * S, y + .3 * S); c.lineTo(x + .35 * S, y + .3 * S); c.stroke();
        c.globalAlpha = 1;
      }
      // 拾取（静音披风）
      for (const pk of this.pickups) {
        if (pk.got) continue;
        const a = Math.max(pk.reveal || 0, .1);
        c.globalAlpha = a;
        c.strokeStyle = th.me; c.lineWidth = 2;
        c.beginPath(); c.arc(wx(pk.x), wy(pk.y), .45 * S, 0, 7); c.stroke();
        c.beginPath(); c.arc(wx(pk.x), wy(pk.y), .2 * S, 0, 7); c.stroke();
        c.globalAlpha = 1;
      }
      // 晶石
      if (this.crystal) {
        const cr = this.crystal;
        const a = Math.max(cr.reveal, cr.charge > 0 ? .8 : 0, .08);
        const x = wx(cr.x), y = wy(cr.y);
        c.save(); c.translate(x, y);
        c.globalAlpha = a;
        c.rotate(this.time * .8);
        c.fillStyle = cr.done ? COL.orange : COL.white;
        c.shadowColor = cr.done ? COL.orange : th.me; c.shadowBlur = 18;
        const s0 = .55 * S;
        c.fillRect(-s0 / 2, -s0 / 2, s0, s0);
        c.shadowBlur = 0;
        c.restore();
        // 充能弧
        for (let i = 0; i < cr.charge; i++) {
          c.strokeStyle = COL.orange; c.globalAlpha = .85; c.lineWidth = 2.5;
          c.beginPath(); c.arc(x, y, (.9 + i * .3) * S, -1.2 + this.time, 1.2 + this.time); c.stroke();
        }
        c.globalAlpha = 1;
      }
      // 碎片
      for (const f of this.frags) {
        if (f.got) continue;
        const a = Math.max(f.reveal || 0, .15);
        c.save(); c.translate(wx(f.x), wy(f.y)); c.rotate(f.t * 1.5);
        c.globalAlpha = a;
        c.fillStyle = COL.amber;
        c.shadowColor = COL.amber; c.shadowBlur = 10;
        const s0 = .22 * S;
        c.fillRect(-s0, -s0, s0 * 2, s0 * 2);
        c.shadowBlur = 0;
        c.restore(); c.globalAlpha = 1;
      }
      // 静默者
      for (const e of this.enemies) {
        const a = Math.max(e.reveal, e.alertT > 0 ? .5 : 0, dist(e.x, e.y, this.player.x, this.player.y) < 2 ? .3 : 0);
        if (a <= 0) continue;
        const x = wx(e.x), y = wy(e.y);
        c.save();
        c.globalAlpha = a;
        c.fillStyle = '#0a0612';
        c.beginPath(); c.arc(x, y, .62 * S, 0, 7); c.fill();
        c.strokeStyle = COL.danger; c.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) {
          const pr = ((this.time * 1.4 + i / 3) % 1);
          c.globalAlpha = a * (1 - pr) * .7;
          c.beginPath(); c.arc(x, y, (.62 + pr * 1.5) * S, 0, 7); c.stroke();
        }
        if (e.alertT > 0) {
          c.globalAlpha = a; c.strokeStyle = COL.danger; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x - .8 * S, y - .8 * S); c.lineTo(x + .8 * S, y + .8 * S);
          c.moveTo(x + .8 * S, y - .8 * S); c.lineTo(x - .8 * S, y + .8 * S); c.stroke();
        }
        c.restore(); c.globalAlpha = 1;
      }
      // 诱饵
      if (this.bait) {
        const b = this.bait;
        const x = wx(b.x), y = wy(b.y);
        c.fillStyle = th.me; c.globalAlpha = .9;
        c.beginPath(); c.arc(x, y, .18 * S, 0, 7); c.fill();
        const pr = (this.time * 2.4) % 1;
        c.strokeStyle = th.me; c.globalAlpha = (1 - pr) * .7;
        c.beginPath(); c.arc(x, y, (pr * 2.4) * S, 0, 7); c.stroke();
        c.globalAlpha = 1;
      }
      // 示范虚线（新手引导：诱饵弧线）
      if (this.demo) {
        c.strokeStyle = th.me; c.globalAlpha = .5 * (1 - this.demo.t / 4);
        c.setLineDash([6, 6]);
        c.beginPath();
        c.moveTo(wx(this.player.x), wy(this.player.y));
        c.quadraticCurveTo(wx((this.player.x + this.demo.x) / 2), wy(Math.min(this.player.y, this.demo.y) - 2), wx(this.demo.x), wy(this.demo.y));
        c.stroke(); c.setLineDash([]);
        c.globalAlpha = 1;
      }
      // 回声环：多层辉光（宽而淡的外晕 + 亮芯），而不是单根细线
      if (this.settings.viz) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (const r of this.rings) {
          const k = clamp(1 - r.r / r.max, 0, 1);
          const rr = r.r * S;
          const x = wx(r.x), y = wy(r.y);
          c.globalAlpha = k * .10;
          c.lineWidth = 9;
          c.strokeStyle = th.me;
          c.beginPath(); c.arc(x, y, rr, 0, 7); c.stroke();
          c.globalAlpha = k * .38;
          c.lineWidth = 3;
          c.beginPath(); c.arc(x, y, rr, 0, 7); c.stroke();
          c.globalAlpha = k * .85;
          c.lineWidth = 1.2;
          c.strokeStyle = COL.white;
          c.beginPath(); c.arc(x, y, rr, 0, 7); c.stroke();
        }
        c.restore();
        c.globalAlpha = 1;
      }
      // 声纹粒子
      if (this.settings.viz) {
        c.globalCompositeOperation = 'lighter';
        for (const pt of this.parts) {
          const a = clamp(pt.life / pt.max, 0, 1);
          c.globalAlpha = a * .9;
          c.fillStyle = pt.warm ? th.env : th.me;
          const s0 = pt.sz * S * (0.5 + a);
          c.fillRect(wx(pt.x) - s0, wy(pt.y) - s0, s0 * 2, s0 * 2);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
      // 大静默之墙
      if (this.silence && this.silence.active) {
        const x = wx(this.silence.x);
        const g = c.createLinearGradient(x - 60, 0, x + 30, 0);
        g.addColorStop(0, 'rgba(2,2,6,.98)'); g.addColorStop(1, 'rgba(2,2,6,0)');
        c.fillStyle = 'rgba(2,2,6,.98)';
        c.fillRect(x + 30, 0, W - x, H);
        c.fillStyle = g;
        c.fillRect(x - 60, 0, 90, H);
        c.strokeStyle = COL.danger; c.globalAlpha = .5 + .3 * Math.sin(this.time * 8);
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
        c.globalAlpha = 1;
      }
      // 提示路径（声纹箭头）
      if (this.hintOn > 0) {
        const tgt = this.hintTarget();
        if (tgt) {
          const dx = tgt[0] - this.player.x, dy = tgt[1] - this.player.y, dl = Math.hypot(dx, dy) || 1;
          for (let i = 1; i <= 3; i++) {
            const t0 = clamp(i * 1.6 / dl, 0, .8);
            const px = this.player.x + dx * t0, py = this.player.y + dy * t0;
            const ang = Math.atan2(dy, dx);
            c.save(); c.translate(wx(px), wy(py)); c.rotate(ang);
            c.strokeStyle = COL.amber; c.globalAlpha = .4 + .3 * Math.sin(this.time * 5 - i);
            c.lineWidth = 2.5;
            c.beginPath(); c.moveTo(-6, -7); c.lineTo(5, 0); c.lineTo(-6, 7); c.stroke();
            c.restore();
          }
          c.globalAlpha = 1;
        }
      }
      // 漂浮尘埃：让黑暗中有"空气"，靠近玩家时更亮，给玩家立足感
      if (!this._motes) {
        this._motes = [];
        for (let i = 0; i < 48; i++) this._motes.push({
          x: Math.random(), y: Math.random(),
          s: .35 + Math.random() * .85, ph: Math.random() * 7, sp: .05 + Math.random() * .16
        });
      }
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const m of this._motes) {
        m.y -= m.sp * .014;
        if (m.y < -.04) { m.y = 1.04; m.x = Math.random(); }
        const nx = ((m.x + Math.sin(this.time * .28 + m.ph) * .012) % 1 + 1) % 1;
        const sx = nx * W, sy = m.y * H;
        const wxp = (sx - W / 2) / S + cam.x, wyp = (sy - H / 2) / S + cam.y;
        const near = clamp(1 - dist(wxp, wyp, this.player.x, this.player.y) / 9, 0, 1);
        c.globalAlpha = (.05 + near * .32) * (.45 + .55 * Math.abs(Math.sin(this.time * 1.5 + m.ph)));
        c.fillStyle = COL.dust;
        const r0 = m.s * (1 + near * .9);
        c.beginPath(); c.arc(sx, sy, r0, 0, 7); c.fill();
      }
      c.restore();
      c.globalAlpha = 1;

      // 玩家周围极淡的环境光（声呐主角自带的一点"存在感"）
      {
        const px = wx(this.player.x), py = wy(this.player.y);
        const R0 = 4.6 * S;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .22;
        c.drawImage(fxGlow(th.me), px - R0, py - R0, R0 * 2, R0 * 2);
        c.restore();
      }

      this.renderPlayer(c, wx, wy, th, false);
      this.renderHUD(c, W, H, th);
      this.renderPost(c, W, H, th);
      if (this.flash > 0) {
        c.fillStyle = `rgba(2,3,6,${this.flash * .8})`;
        c.fillRect(0, 0, W, H);
      }
    }

    /* 后处理：暗角 + 主题色彩分级（放在最后，压在所有元素之上才有效果） */
    renderPost(c, W, H, th) {
      const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .22, W / 2, H / 2, Math.max(W, H) * .74);
      vg.addColorStop(0, 'rgba(11,17,26,0)');
      vg.addColorStop(.62, 'rgba(6,9,15,.30)');
      vg.addColorStop(1, 'rgba(3,5,9,.90)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);

      // 轻色彩分级：上冷（我的声纹）下暖（环境声），把画面统一成一个"场景"
      const grade = c.createLinearGradient(0, 0, 0, H);
      grade.addColorStop(0, 'rgba(' + fxRGB(th.me) + ',.055)');
      grade.addColorStop(.5, 'rgba(0,0,0,0)');
      grade.addColorStop(1, 'rgba(' + fxRGB(th.env) + ',.05)');
      c.fillStyle = grade; c.fillRect(0, 0, W, H);
    }
    hintTarget() {
      let best = null, bd = 1e9;
      for (const d of this.doors) if (!d.open && d.type !== 'auto') {
        const dd = dist(this.player.x, this.player.y, d.x, d.y);
        if (dd < bd) { bd = dd; best = [d.x + d.w / 2, d.y + d.h / 2]; }
      }
      if (!best) for (const cc of this.charges) if (!cc.charged) {
        const dd = dist(this.player.x, this.player.y, cc.x, cc.y);
        if (dd < bd) { bd = dd; best = [cc.x, cc.y]; }
      }
      if (!best) for (const d of this.doors) if (!d.open) {
        const dd = dist(this.player.x, this.player.y, d.x, d.y);
        if (dd < bd) { bd = dd; best = [d.x + d.w / 2, d.y + d.h / 2]; }
      }
      if (!best && this.crystal && !this.crystal.done) best = [this.crystal.x, this.crystal.y];
      if (!best && this.exitZone) best = this.exitZone;
      return best;
    }
    renderPlayer(c, wx, wy, th, pure) {
      const p = this.player;
      const x = wx(p.x), y = wy(p.y);
      c.save();
      c.fillStyle = th.me;
      c.shadowColor = th.me; c.shadowBlur = 16;
      c.beginPath(); c.arc(x, y, .34 * this.scale, 0, 7); c.fill();
      c.shadowBlur = 0;
      // 朝向
      c.strokeStyle = th.me; c.lineWidth = 2; c.globalAlpha = .8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + p.dx * .8 * this.scale, y + p.dy * .8 * this.scale); c.stroke();
      // 静音披风
      if (this.cloakT > 0) {
        c.globalAlpha = .4 + .2 * Math.sin(this.time * 5);
        c.beginPath(); c.arc(x, y, .7 * this.scale, 0, 7); c.stroke();
      }
      // 录音进度环
      if (this.rec) {
        c.globalAlpha = .9;
        c.strokeStyle = COL.amber; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, .9 * this.scale, -Math.PI / 2, -Math.PI / 2 + (this.rec.t / 5) * Math.PI * 2); c.stroke();
      }
      c.restore(); c.globalAlpha = 1;
    }
    renderHUD(c, W, H, th) {
      const u = Math.min(W, H) / 9;
      // 暴露度指示条（7.1 右侧）
      if (!this.L.sandbox) {
        const bw = 5, bh = H * .26, bx = W - 18, by = H * .18;
        c.fillStyle = 'rgba(201,214,226,.12)';
        c.fillRect(bx, by, bw, bh);
        const eh = bh * clamp(this.exposure, 0, 1);
        c.fillStyle = this.exposure > .7 ? COL.danger : th.me;
        c.fillRect(bx, by + bh - eh, bw, eh);
      }
      // 声纹槽（底部中央）
      const n = 3, gap = u * .62;
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - 1) * gap, y = H - u * .55;
        const s = this.slots[i];
        c.beginPath(); c.arc(x, y, u * .22, 0, 7);
        c.fillStyle = s ? (s.kind === 'wind' ? th.env : s.kind === 'voice' ? th.me : COL.amber) : 'rgba(201,214,226,.14)';
        if (s && i === this.sel) { c.shadowColor = COL.white; c.shadowBlur = 10; }
        c.fill(); c.shadowBlur = 0;
        if (i === this.sel) {
          c.strokeStyle = COL.white; c.lineWidth = 1.5; c.globalAlpha = .9;
          c.beginPath(); c.arc(x, y, u * .3, 0, 7); c.stroke();
          c.globalAlpha = 1;
        }
      }
      // 沙盒波形（听音训练场 4.2）
      if (this.L.sandbox) {
        const bw = Math.min(W * .5, 380), bx = W / 2 - bw / 2, by = u * 1.1;
        c.fillStyle = th.env;
        for (let i = 0; i < this.wave.length; i++) {
          const h = this.wave[i] * u * .8;
          c.globalAlpha = .25 + this.wave[i] * .75;
          c.fillRect(bx + i * (bw / this.wave.length), by - h, bw / this.wave.length - 1, h * 2);
        }
        c.globalAlpha = 1;
      }
      // 屏幕功能按钮（鼠标 / 触屏均可点按）
      {
        for (const b of this.buttons) {
          c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7);
          c.fillStyle = 'rgba(16,24,34,.55)'; c.fill();
          c.strokeStyle = 'rgba(201,214,226,.3)'; c.lineWidth = 1.5; c.stroke();
          c.strokeStyle = b.id === 'rec' && this.rec ? COL.amber : 'rgba(232,241,248,.85)';
          c.fillStyle = 'rgba(232,241,248,.85)';
          c.lineWidth = 2;
          const r = b.r * .45;
          c.save(); c.translate(b.x, b.y);
          switch (b.id) {
            case 'ping': c.beginPath(); c.arc(0, 0, r * .5, 0, 7); c.fill();
              c.globalAlpha = .5; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); c.globalAlpha = 1; break;
            case 'rec': c.beginPath(); c.arc(0, 0, r * .6, 0, 7); c.fillStyle = this.rec ? COL.amber : c.fillStyle; c.fill(); break;
            case 'play': c.beginPath(); c.moveTo(-r * .4, -r * .55); c.lineTo(r * .6, 0); c.lineTo(-r * .4, r * .55); c.closePath(); c.fill(); break;
            case 'chord': [-.45, 0, .45].forEach(o => { c.beginPath(); c.arc(o * r, 0, r * .16, 0, 7); c.fill(); }); break;
            case 'bait': c.beginPath(); c.arc(r * .2, 0, r * .3, 0, 7); c.fill();
              c.beginPath(); c.moveTo(-r * .6, 0); c.lineTo(r * -.1, 0); c.stroke(); break;
            case 'slot': this.slots.forEach((s, i) => { c.beginPath(); c.arc((i - 1) * r * .7, 0, r * .18, 0, 7); s ? c.fill() : c.stroke(); }); break;
            case 'sight': c.beginPath(); c.arc(0, 0, r * .55, .6, 2.5); c.stroke(); c.beginPath(); c.arc(0, 0, r * .25, 0, 7); c.fill(); break;
            case 'pause': c.fillRect(-r * .5, -r * .6, r * .3, r * 1.2); c.fillRect(r * .2, -r * .6, r * .3, r * 1.2); break;
          }
          c.restore();
        }
        // 摇杆
        if (this.joy) {
          c.strokeStyle = 'rgba(201,214,226,.35)'; c.lineWidth = 2;
          c.beginPath(); c.arc(this.joy.ox, this.joy.oy, this.btnU * .9, 0, 7); c.stroke();
          const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy), m = Math.min(d, this.btnU * .7);
          c.fillStyle = 'rgba(67,198,172,.5)';
          c.beginPath(); c.arc(this.joy.ox + (d ? dx / d * m : 0), this.joy.oy + (d ? dy / d * m : 0), this.btnU * .35, 0, 7); c.fill();
        }
      }
    }
  }

  window.EchoGame = Game;
  window.EchoThemes = THEMES;
})();
