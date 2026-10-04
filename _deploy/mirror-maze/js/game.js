/* ============================================================
   游戏核心引擎
   表现层 / 逻辑层分离：固定 1/60 步长模拟 + 渲染插值
   镜像输入映射器：原始输入 → 按镜像模式变换 → 双角色状态机
   ============================================================ */
(function () {
  "use strict";
  const TS = 48;                 // 格子尺寸（世界单位 = 像素）
  const CW = 34, CH = 44;        // 角色碰撞盒
  const GRAV = 2400, JUMP_V = 780, SPEED = 340;
  const ACC = 2800, FRICTION = 2600, AIRCTL = 0.78;
  const COYOTE = 0.09, JBUF = 0.12, TERM = 1300;

  const G = {
    canvas: null, ctx: null,
    level: null, levelIdx: 0,
    chars: [],
    mode: "mirror",
    brokenTriggered: false,
    state: "idle",               // idle | playing | won
    time: 0, steps: 0,
    shardsGot: new Set(),
    latched: new Set(),          // 已保持踩下的板/水晶 "x,y"
    receiverLit: new Set(),
    beatT: 0, lastBeatPhase: -1,
    leftBuf: [],                 // 延迟镜像的输入历史
    particles: [],
    trails: [[], []],
    cam: { x: 0, y: 0, zoom: 1, shake: 0 },
    slowmo: 0, flash: 0,
    cracks: null,
    undoStack: [],
    noProgressT: 0,
    hintShown: false,
    deathCooldown: 0,
    settings: { shapes: true, reduce: false, zen: false, vibro: true },
    onEvent: null,
    _raf: 0, _last: 0, _acc: 0,
    _seed: 1,
  };

  const MODE_NAME = { mirror: "完全镜像", delay: "延迟镜像", reverse: "反向镜像", partial: "局部镜像", broken: "碎镜独立" };
  const DELAY_FRAMES = () => (G.settings.zen ? 90 : 30);

  function emit(type, data) { if (G.onEvent) G.onEvent(type, data); }
  function rnd() { G._seed = (G._seed * 1664525 + 1013904223) >>> 0; return G._seed / 4294967296; }

  /* ============================================================
     美术表现层：离屏纹理 / 渐变 / 光晕缓存
     —— 全部只参与绘制，不读写任何玩法状态；每帧不新建 canvas
     ============================================================ */
  const ART = {
    ready: false, theme: null,
    tiles: [], plate: null, litTop: null, emitter: null,
    shadow: null, spark: null, mote: null, cloud: null,
    sil: null, silKey: "",
    amb: [], ambW: 0, ambH: 0,
    vignette: null, vw: 0, vh: 0,
    glow: new Map(), grad: new Map(),
  };
  let _vs = 20140707;                                  // 视觉专用伪随机，独立于玩法随机序列
  function vrand() { _vs = (_vs * 1664525 + 1013904223) >>> 0; return _vs / 4294967296; }
  function vseed(s) { _vs = (s * 2654435761) >>> 0; }
  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function hex2rgb(h) {
    h = String(h);
    if (h.charAt(0) === "#") {
      h = h.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = h.match(/\d+(\.\d+)?/g) || ["0", "0", "0"];
    return [Math.round(+m[0]) || 0, Math.round(+m[1]) || 0, Math.round(+m[2]) || 0];
  }
  function shade(hex, amt) {
    const c = hex2rgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v + v * amt)));
    return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
  }
  function withA(hex, a) { const c = hex2rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function mixHex(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b), m = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
    return `rgb(${m(0)},${m(1)},${m(2)})`;
  }
  // 渐变缓存：只在参数变化时重建（位置相关的渐变一律用局部坐标创建后 translate）
  function cgrad(key, make) { let g = ART.grad.get(key); if (!g) { g = make(); ART.grad.set(key, g); } return g; }

  // 光晕精灵：单一径向渐变，按颜色缓存复用
  function glowSprite(color) {
    let s = ART.glow.get(color);
    if (s) return s;
    const S = 96, c = mkCanvas(S, S), g = c.getContext("2d");
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, withA(color, 0.95));
    rg.addColorStop(0.26, withA(color, 0.42));
    rg.addColorStop(0.6, withA(color, 0.12));
    rg.addColorStop(1, withA(color, 0));
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    ART.glow.set(color, c);
    return c;
  }
  function glowAt(ctx, color, x, y, r, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // 基础精灵：软阴影 / 星芒 / 尘埃光点
  function buildBaseArt() {
    if (ART.ready) return;
    { // 接触阴影（软椭圆）
      const W = 96, H = 52, c = mkCanvas(W, H), g = c.getContext("2d");
      g.translate(W / 2, H / 2); g.scale(1, 0.52);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, W / 2);
      rg.addColorStop(0, "rgba(0,0,0,0.62)");
      rg.addColorStop(0.5, "rgba(0,0,0,0.26)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, W / 2, 0, 6.2832); g.fill();
      ART.shadow = c;
    }
    { // 反射星芒（十字 + 斜向短芒）
      const S = 128, c = mkCanvas(S, S), g = c.getContext("2d");
      g.translate(S / 2, S / 2);
      g.globalCompositeOperation = "lighter";
      const spikes = [[58, 3.4], [30, 2.2], [46, 1.5], [22, 1.2]];
      for (let i = 0; i < spikes.length; i++) {
        const len = spikes[i][0], wdt = spikes[i][1];
        g.save(); g.rotate((i * Math.PI) / 4);
        const lg = g.createLinearGradient(0, 0, len, 0);
        lg.addColorStop(0, "rgba(255,255,255,0.95)");
        lg.addColorStop(0.3, "rgba(215,245,255,0.42)");
        lg.addColorStop(1, "rgba(170,225,255,0)");
        g.fillStyle = lg;
        for (const sgn of [1, -1]) {
          g.save(); g.scale(sgn, 1);
          g.beginPath(); g.moveTo(0, -wdt); g.lineTo(len, 0); g.lineTo(0, wdt); g.closePath(); g.fill();
          g.restore();
        }
        g.restore();
      }
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, 12);
      cg.addColorStop(0, "rgba(255,255,255,1)"); cg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = cg; g.beginPath(); g.arc(0, 0, 12, 0, 6.2832); g.fill();
      ART.spark = c;
    }
    { // 尘埃光点
      const S = 16, c = mkCanvas(S, S), g = c.getContext("2d");
      const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      rg.addColorStop(0, "rgba(255,255,255,1)");
      rg.addColorStop(0.45, "rgba(255,255,255,0.45)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.fillRect(0, 0, S, S);
      ART.mote = c;
    }
    ART.ready = true;
  }
  function buildClouds() {
    if (ART.cloud) return;
    const mk = (seed, dark) => {
      const W = 512, H = 128, c = mkCanvas(W, H), g = c.getContext("2d");
      vseed(seed);
      for (let i = 0; i < 30; i++) {
        const x = vrand() * W, y = H * (0.18 + vrand() * 0.64), r = 30 + vrand() * 96;
        const light = vrand() < 0.58;
        const a = 0.06 + vrand() * 0.11;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        // 亮部与暗部并存：云带才有体积与明暗层次
        rg.addColorStop(0, light ? `rgba(255,255,255,${a.toFixed(3)})`
          : dark ? `rgba(4,8,20,${(a * 1.5).toFixed(3)})` : `rgba(20,34,66,${a.toFixed(3)})`);
        rg.addColorStop(0.55, `rgba(${light ? "255,255,255" : "10,16,34"},${(a * 0.4).toFixed(3)})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
      return c;
    };
    ART.cloud = [mk(4242, false), mk(9090, true)];
  }
  // 胶片颗粒（128×128 平铺，低幅度但能破除大面积同色）
  function buildGrain() {
    if (ART.grain) return;
    const S = 128, c = mkCanvas(S, S), g = c.getContext("2d");
    vseed(777);
    const img = g.createImageData(S, S), d = img.data;
    for (let i = 0; i < S * S; i++) {
      const v = vrand();
      const l = Math.round(128 + (v - 0.5) * 112);
      d[i * 4] = l; d[i * 4 + 1] = l; d[i * 4 + 2] = l; d[i * 4 + 3] = 34;
    }
    g.putImageData(img, 0, 0);
    ART.grain = c;
  }

  // 石砖材质（4 种错缝变体，2 倍超采样后缩放，边缘更干净）
  function buildTileArt(base, top, accent, v) {
    const S = TS * 2, c = mkCanvas(S, S), g = c.getContext("2d"), r = 15;
    vseed(700 + v * 31);
    g.save();
    roundRect(g, 1, 1, S - 2, S - 2, r); g.clip();
    const lg = g.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0, shade(top, 0.18));
    lg.addColorStop(0.30, base);
    lg.addColorStop(0.74, shade(base, -0.30));
    lg.addColorStop(1, shade(base, -0.52));
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    // 错缝砖纹
    const rows = [S * 0.34, S * 0.68];
    g.strokeStyle = "rgba(0,0,0,0.32)"; g.lineWidth = 2.6;
    for (const y of rows) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.strokeStyle = "rgba(0,0,0,0.20)"; g.lineWidth = 2.2;
    const ax1 = S * (v % 2 ? 0.52 : 0.27), ax2 = S * (v % 2 ? 0.24 : 0.63), ax3 = S * (v % 2 ? 0.62 : 0.36);
    g.beginPath();
    g.moveTo(ax1, 0); g.lineTo(ax1, rows[0]);
    g.moveTo(ax2, rows[0]); g.lineTo(ax2, rows[1]);
    g.moveTo(ax3, rows[1]); g.lineTo(ax3, S);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 1.2;
    for (const y of rows) { g.beginPath(); g.moveTo(0, y + 2.2); g.lineTo(S, y + 2.2); g.stroke(); }
    // 颗粒噪点
    for (let i = 0; i < 460; i++) {
      const x = vrand() * S, y = vrand() * S, a = (0.03 + vrand() * 0.075).toFixed(3);
      g.fillStyle = vrand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(x, y, 1.5 + vrand() * 2, 1.5 + vrand() * 2);
    }
    // 明暗斑块（手绘感）
    for (let i = 0; i < 5; i++) {
      const x = vrand() * S, y = vrand() * S, rad = S * (0.14 + vrand() * 0.24), dark = vrand() < 0.55;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, dark ? "rgba(0,0,0,0.17)" : "rgba(255,255,255,0.10)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // 顶面受光
    const tg = g.createLinearGradient(0, 0, 0, S * 0.24);
    tg.addColorStop(0, withA(top, 0.62)); tg.addColorStop(1, withA(top, 0));
    g.fillStyle = tg; g.fillRect(0, 0, S, S * 0.24);
    // 底部环境遮蔽
    const bg2 = g.createLinearGradient(0, S * 0.66, 0, S);
    bg2.addColorStop(0, "rgba(0,0,0,0)"); bg2.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = bg2; g.fillRect(0, S * 0.66, S, S * 0.34);
    // 左右边缘 AO
    for (const side of [0, 1]) {
      const sg = side === 0 ? g.createLinearGradient(0, 0, S * 0.16, 0) : g.createLinearGradient(S, 0, S * 0.84, 0);
      sg.addColorStop(0, "rgba(0,0,0,0.30)"); sg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sg; g.fillRect(side === 0 ? 0 : S * 0.84, 0, S * 0.16, S);
    }
    g.restore();
    // 描边（主题色菲涅尔）
    g.save();
    roundRect(g, 1.2, 1.2, S - 2.4, S - 2.4, r);
    g.strokeStyle = withA(accent, 0.22); g.lineWidth = 2.4; g.stroke();
    g.restore();
    // 顶部亮边
    g.strokeStyle = withA(top, 0.8); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(13, 1.8); g.lineTo(S - 13, 1.8); g.stroke();
    return c;
  }
  // 顶面受光叠加层（上方为空时使用）
  function buildLitTop(top) {
    const S = TS * 2, c = mkCanvas(S, S), g = c.getContext("2d");
    const lg = g.createLinearGradient(0, 0, 0, S * 0.5);
    lg.addColorStop(0, "rgba(255,255,255,0.26)");
    lg.addColorStop(0.32, withA(top, 0.20));
    lg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lg; g.fillRect(0, 0, S, S * 0.5);
    return c;
  }
  // 薄板（金属格栅平台）
  function buildPlateArt(base, top, accent) {
    const S = TS * 2, H = 40, c = mkCanvas(S, H), g = c.getContext("2d"), r = 11;
    vseed(31337);
    g.save();
    roundRect(g, 1, 1, S - 2, H - 2, r); g.clip();
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, shade(top, 0.34));
    lg.addColorStop(0.42, base);
    lg.addColorStop(1, shade(base, -0.5));
    g.fillStyle = lg; g.fillRect(0, 0, S, H);
    for (let i = 0; i < 120; i++) {
      const a = (0.03 + vrand() * 0.06).toFixed(3);
      g.fillStyle = vrand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(vrand() * S, vrand() * H, 1.6, 1.6);
    }
    for (let i = 0; i < 7; i++) {   // 铆钉
      const x = 10 + (i * (S - 20)) / 6;
      g.fillStyle = "rgba(0,0,0,0.38)"; g.beginPath(); g.arc(x, H - 7, 3.4, 0, 6.2832); g.fill();
      g.fillStyle = withA(top, 0.6); g.beginPath(); g.arc(x, H - 8.4, 1.8, 0, 6.2832); g.fill();
    }
    g.restore();
    g.save();
    roundRect(g, 1.2, 1.2, S - 2.4, H - 2.4, r);
    g.strokeStyle = withA(accent, 0.30); g.lineWidth = 2; g.stroke();
    g.restore();
    g.fillStyle = "rgba(255,255,255,0.34)"; g.fillRect(8, 2.4, S - 16, 2.6);
    return c;
  }
  // 发射器外壳（石+金属，含散热槽与镜片座）
  function buildEmitter(base, top, accent) {
    const S = TS * 2, c = mkCanvas(S, S), g = c.getContext("2d"), r = 16;
    vseed(9182);
    g.save();
    roundRect(g, 3, 6, S - 6, S - 12, r); g.clip();
    const lg = g.createLinearGradient(0, 6, 0, S - 6);
    lg.addColorStop(0, shade(top, 0.10));
    lg.addColorStop(0.45, shade(base, -0.25));
    lg.addColorStop(1, shade(base, -0.62));
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      const x = 16 + (i * (S - 32)) / 4;
      g.beginPath(); g.moveTo(x, 12); g.lineTo(x, S - 12); g.stroke();
    }
    for (let i = 0; i < 160; i++) {
      const a = (0.03 + vrand() * 0.07).toFixed(3);
      g.fillStyle = vrand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(vrand() * S, vrand() * S, 1.6, 1.6);
    }
    g.restore();
    g.save();
    roundRect(g, 3.5, 6.5, S - 7, S - 13, r);
    g.strokeStyle = withA(accent, 0.35); g.lineWidth = 2.4; g.stroke();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.28)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(16, 8.5); g.lineTo(S - 16, 8.5); g.stroke();
    return c;
  }

  // 主题相关素材：只在换章节主题时重建
  function buildThemeArt(th) {
    if (ART.theme === th) return;
    ART.theme = th;
    ART.grad.clear();
    ART.tiles = [];
    for (let v = 0; v < 4; v++) ART.tiles.push(buildTileArt(th.tile, th.tileTop, th.accent, v));
    ART.litTop = buildLitTop(th.tileTop);
    ART.plate = buildPlateArt(th.tile, th.tileTop, th.accent);
    ART.emitter = buildEmitter(th.tile, th.tileTop, th.accent);
    ART.silKey = "";
  }

  // 远景剪影：3 层浮空山/城塔，越远越淡越冷（大气透视）
  function buildSilhouettes(lv) {
    const key = lv.def.name + "|" + lv.H + "|" + lv.FW;
    if (ART.silKey === key && ART.sil) return;
    ART.silKey = key;
    const th = lv.theme;
    const cfg = [
      { par: 0.10, y: 0.70, amp: 0.17, n: 5, t: 0.30, alpha: 0.62, spire: 3 },
      { par: 0.22, y: 0.79, amp: 0.21, n: 4, t: 0.55, alpha: 0.56, spire: 5 },
      { par: 0.40, y: 0.87, amp: 0.26, n: 6, t: 0.78, alpha: 0.52, spire: 4 },
    ];
    ART.sil = cfg.map((cf, li) => {
      vseed(1301 + li * 97);
      const p = new Path2D();
      const pts = [];
      for (let i = 0; i <= cf.n; i++) pts.push({ x: -0.25 + (1.5 * i) / cf.n, y: cf.y - vrand() * cf.amp });
      p.moveTo(-0.25, 1.3);
      p.lineTo(-0.25, pts[0].y);
      for (let i = 0; i < cf.n; i++) {
        const a = pts[i], b = pts[i + 1];
        p.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - cf.amp * (0.30 + vrand() * 0.75), b.x, b.y);
      }
      p.lineTo(1.25, 1.3);
      p.closePath();
      // 城塔 / 浮岛尖刺
      for (let i = 0; i < cf.spire; i++) {
        const x = -0.15 + vrand() * 1.3, base = cf.y - vrand() * cf.amp * 0.6;
        const hgt = 0.06 + vrand() * 0.16, wdt = 0.008 + vrand() * 0.018;
        p.moveTo(x - wdt, base + 0.03);
        p.lineTo(x - wdt * 0.5, base - hgt);
        p.lineTo(x + wdt * 0.5, base - hgt);
        p.lineTo(x + wdt, base + 0.03);
        p.closePath();
      }
      return { path: p, par: cf.par, alpha: cf.alpha, color: mixHex(th.bg, th.tileTop, cf.t), y: cf.y, amp: cf.amp, li };
    });
  }

  // 中景浮空城天际线（打破雾带的大面积单色，补足层次与门窗灯火）
  function buildSkyline(lv) {
    const key = lv.def.name + "|city";
    if (ART.cityKey === key && ART.city) return;
    ART.cityKey = key;
    const th = lv.theme;
    vseed(hashStr(lv.def.name) + 17);
    const p = new Path2D();
    const wins = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = -0.12 + (1.24 * i) / n + vrand() * 0.02;
      const w = 0.016 + vrand() * 0.032;
      const top = 0.60 + vrand() * 0.22;
      p.moveTo(x, 1.06);
      p.lineTo(x, top);
      p.lineTo(x + w * 0.5, top - 0.018 - vrand() * 0.032);
      p.lineTo(x + w, top + 0.004 + vrand() * 0.012);
      p.lineTo(x + w, 1.06);
      p.closePath();
      const wn = 2 + Math.floor(vrand() * 5);
      for (let k = 0; k < wn; k++) {
        wins.push({
          x: x + w * (0.18 + vrand() * 0.6),
          y: top + 0.03 + vrand() * Math.max(0.02, 1.0 - top),
          w: 0.0018 + vrand() * 0.0016, h: 0.0032 + vrand() * 0.0026,
        });
      }
    }
    ART.city = { path: p, wins, color: mixHex(th.bg, th.tileTop, 0.70), par: 0.5 };
  }
  // 近景地平框（最外侧暗色剪影，强化纵深）
  function buildFrame(lv) {
    const key = lv.def.name + "|frame";
    if (ART.frameKey === key && ART.frame) return;
    ART.frameKey = key;
    vseed(hashStr(lv.def.name) + 91);
    const p = new Path2D();
    p.moveTo(-0.3, 1.4);
    p.lineTo(-0.3, 1.02);
    for (let i = 0; i <= 12; i++) {
      const x = -0.3 + (1.6 * i) / 12;
      p.lineTo(x, 0.985 - vrand() * 0.085);
    }
    p.lineTo(1.3, 1.4);
    p.closePath();
    ART.frame = p;
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  // 背景尘埃（解析式运动，无需逐帧状态更新）
  function ambient(vw, vh) {
    if (ART.amb.length && ART.ambW === vw && ART.ambH === vh) return ART.amb;
    ART.ambW = vw; ART.ambH = vh; ART.amb = [];
    if (G.settings.reduce) return ART.amb;
    vseed(606);
    for (let i = 0; i < 74; i++) ART.amb.push({
      x: vrand() * vw, y: vrand() * vh, r: 0.8 + vrand() * 2.1,
      z: 0.15 + vrand() * 0.85, sp: 5 + vrand() * 18, ph: vrand() * 6.283,
      a: 0.10 + vrand() * 0.30,
    });
    return ART.amb;
  }

  /* ================= 关卡装载 ================= */
  function startLevel(idx, settings) {
    const def = MMLevels.LEVELS[idx];
    const theme = MMLevels.CHAPTERS[def.ch - 1].theme;
    G.levelIdx = idx;
    G.level = MMLevels.parseLevel(def, theme);
    if (settings) G.settings = Object.assign(G.settings, settings);
    G.mode = def.mode;
    G.brokenTriggered = def.mode === "broken";
    G.state = "playing";
    G.time = 0; G.steps = 0;
    G.shardsGot = new Set();
    G.latched = new Set();
    G.receiverLit = new Set();
    G.leftBuf = [];
    G.particles = []; G.trails = [[], []];
    G.undoStack = [];
    G.noProgressT = 0; G.hintShown = false;
    G.slowmo = 0; G.flash = 0; G.cracks = null;
    G.deathCooldown = 0;
    G._seed = 1234 + idx * 77;
    G.beatPhaseHistory = [];

    const lv = G.level;
    const mk = (cell, side, colorIdx) => ({
      x: cell.x * TS + (TS - CW) / 2, y: cell.y * TS + TS - CH,
      vx: 0, vy: 0, side,
      gravityDir: 1, onGround: false, coyote: 0, jumpBuf: 0, prevJump: false,
      portalCd: 0, flipCd: 0,
      dead: false, deathT: 0, respawn: null,
      checkpoint: null, lastCp: null,
      squash: 0, stretch: 0, face: 1, blink: rnd() * 4,
      colorIdx,
    });
    const lSpawn = lv.spawns.find((s) => s.x < lv.W) || lv.spawns[0];
    const rSpawn = lv.spawns.find((s) => s.x >= lv.W) || lv.spawns[lv.spawns.length - 1];
    const c0 = mk(lSpawn, -1, 0); c0.checkpoint = { x: c0.x, y: c0.y, g: 1, side: -1 };
    const c1 = mk(rSpawn, 1, 1); c1.checkpoint = { x: c1.x, y: c1.y, g: 1, side: 1 };
    G.chars = [c0, c1];

    MMInput.setBrokenMode(G.mode === "broken");
    emit("mode", { mode: G.mode, name: MODE_NAME[G.mode] });
    emit("hud");
    resize();
    G._last = performance.now();
    G._acc = 0;
    if (!G._raf) G._raf = requestAnimationFrame(frame);
  }

  function restart() { startLevel(G.levelIdx, null); }

  /* ================= 地图查询 ================= */
  function cellChar(x, y) {
    const lv = G.level;
    if (y < 0 || y >= lv.H || x < 0 || x >= lv.FW) return ".";
    return lv.grid[y][x];
  }
  const key = (x, y) => x + "," + y;

  function doorOpen(group) {
    const lv = G.level;
    if (group === "G") return lv.plates.g.every((c) => G.latched.has(key(c.x, c.y)));
    if (group === "S") return lv.plates.s.every((c) => G.latched.has(key(c.x, c.y)));
    if (group === "H") {
      const pOk = lv.plates.h.length === 0 || lv.plates.h.every((c) => G.latched.has(key(c.x, c.y)));
      const rOk = lv.receivers.length === 0 || lv.receivers.every((c) => G.receiverLit.has(key(c.x, c.y)));
      return pOk && rOk;
    }
    return true;
  }
  const doorMap = (() => { let m = null, lvRef = null; return (lv) => { if (m === null || lvRef !== lv) { m = new Map(); for (const g of ["G", "H", "S"]) for (const c of lv.doors[g]) m.set(key(c.x, c.y), g); lvRef = lv; } return m; }; })();

  function beatSolid(phase0) {
    const b = G.level.beat;
    if (!b) return true;
    const ph = ((G.time / b.period) + phase0) % 1;
    return ph < b.duty;
  }
  function beatWarn(phase0) { // 即将切换的预警（闪烁）
    const b = G.level.beat;
    if (!b) return 0;
    const ph = ((G.time / b.period) + phase0) % 1;
    if (ph >= b.duty && ph < b.duty + 0.1) return 1;      // 将虚化
    if (ph >= 1 - 0.1) return -1;                          // 将实心
    return 0;
  }

  function isSolid(tx, ty) {
    const c = cellChar(tx, ty);
    if (MMLevels.SOLID.has(c)) return true;
    const g = doorMap(G.level).get(key(tx, ty));
    if (g && !doorOpen(g)) return true;
    if (c === "b") return beatSolid(0);
    if (c === "B") return beatSolid(0.5);
    return false;
  }

  function aabbHitsSolid(x, y) {
    const x0 = Math.floor(x / TS), x1 = Math.floor((x + CW - 0.01) / TS);
    const y0 = Math.floor(y / TS), y1 = Math.floor((y + CH - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
    return false;
  }

  /* ================= 输入映射（镜像核心） ================= */
  function computeInputs() {
    const raw = MMInput.poll();
    const li = { dx: raw.left.dx, jump: raw.left.jump > 0 };
    let ri;
    if (G.mode === "broken") {
      ri = { dx: raw.right.dx, jump: raw.right.jump > 0 };
    } else if (G.mode === "mirror") {
      ri = { dx: -li.dx, jump: li.jump };
    } else if (G.mode === "reverse") {
      ri = { dx: li.dx, jump: li.jump };
    } else if (G.mode === "partial") {
      ri = { dx: -li.dx, jump: false };       // 仅 X 镜像：右侧无跳跃
    } else if (G.mode === "delay") {
      G.leftBuf.push({ dx: li.dx, jump: li.jump });
      if (G.leftBuf.length > 200) G.leftBuf.shift();
      const f = G.leftBuf[Math.max(0, G.leftBuf.length - 1 - DELAY_FRAMES())] || { dx: 0, jump: false };
      ri = { dx: -f.dx, jump: f.jump };
    }
    // 步数：一次新的方向输入或一次跳跃记 1 步（以主输入为准）
    const prev = G._prevIn || { dx: 0, jump: false, rdx: 0, rjump: false };
    let stepped = false;
    if (li.dx !== 0 && prev.dx === 0) stepped = true;
    if (li.jump && !prev.jump) stepped = true;
    if (G.mode === "broken") {
      if (raw.right.dx !== 0 && prev.rdx === 0) stepped = true;
      if (raw.right.jump > 0 && !prev.rjump) stepped = true;
    }
    if (stepped && G.state === "playing") {
      G.steps++;
      pushUndo();
    }
    G._prevIn = { dx: li.dx, jump: li.jump, rdx: raw.right.dx, rjump: raw.right.jump > 0 };
    return { li, ri };
  }

  /* ================= 角色物理 ================= */
  function stepChar(ch, input, dt) {
    if (ch.dead) {
      ch.deathT -= dt;
      if (ch.deathT <= 0) respawnChar(ch);
      return;
    }
    const dir = input.dx;
    if (dir !== 0) {
      ch.face = dir;
      const ctl = ch.onGround ? 1 : AIRCTL;
      ch.vx += dir * ACC * ctl * dt;
      ch.vx = Math.max(-SPEED, Math.min(SPEED, ch.vx));
      if (ch.onGround && rnd() < 0.18) MMGame.footstep(ch.side < 0 ? -0.7 : 0.7);
    } else {
      const f = (ch.onGround ? FRICTION : FRICTION * 0.4) * dt;
      if (Math.abs(ch.vx) <= f) ch.vx = 0; else ch.vx -= Math.sign(ch.vx) * f;
    }
    // 跳跃（缓冲 + 土狼时间）
    if (input.jump && !ch.prevJump) ch.jumpBuf = JBUF;
    ch.prevJump = input.jump;
    if (ch.jumpBuf > 0 && (ch.onGround || ch.coyote > 0)) {
      ch.vy = -JUMP_V * ch.gravityDir;
      ch.jumpBuf = 0; ch.coyote = 0; ch.onGround = false; ch.stretch = 1;
      MMGame.sfxJump(ch.side < 0 ? -0.7 : 0.7);
      dust(ch.x + CW / 2, ch.gravityDir > 0 ? ch.y + CH : ch.y, 5, ch.side);
    }
    ch.jumpBuf -= dt; ch.coyote -= dt; ch.portalCd -= dt; ch.flipCd -= dt;

    // 重力
    ch.vy += GRAV * ch.gravityDir * dt;
    ch.vy = Math.max(-TERM, Math.min(TERM, ch.vy));

    // X 轴移动与碰撞
    ch.x += ch.vx * dt;
    if (aabbHitsSolid(ch.x, ch.y)) {
      const sign = Math.sign(ch.vx) || 1;
      while (aabbHitsSolid(ch.x, ch.y)) ch.x -= sign * 1;
      ch.vx = 0;
    }
    // Y 轴移动与碰撞
    ch.y += ch.vy * dt;
    let landed = false;
    if (aabbHitsSolid(ch.x, ch.y)) {
      const sign = Math.sign(ch.vy) || 1;
      while (aabbHitsSolid(ch.x, ch.y)) ch.y -= sign * 1;
      if ((ch.vy > 0 && ch.gravityDir > 0) || (ch.vy < 0 && ch.gravityDir < 0)) {
        if (!ch.onGround && Math.abs(ch.vy) > 250) {
          ch.squash = 1;
          MMGame.sfxLand(ch.side < 0 ? -0.7 : 0.7);
          dust(ch.x + CW / 2, ch.gravityDir > 0 ? ch.y + CH : ch.y, 6, ch.side);
        }
        landed = true;
      }
      ch.vy = 0;
    }
    ch.onGround = landed;
    if (landed) ch.coyote = COYOTE;

    // 镜轴限位（角色不能徒步越过镜面，只能经传送门）
    const axisX = G.level.W * TS;
    if (ch.side < 0) ch.x = Math.min(ch.x, axisX - CW - 0.01);
    else ch.x = Math.max(ch.x, axisX + 0.01);

    // 世界边界（左右墙外为实心由地图保证；这里防越界）
    ch.x = Math.max(0, Math.min(G.level.FW * TS - CW, ch.x));
  }

  function killChar(ch) {
    if (ch.dead || G.state !== "playing") return;
    G.lastKill = { x: Math.round(ch.x), y: Math.round(ch.y), side: ch.side, t: +G.time.toFixed(2), at: new Error().stack.split("\n")[2] || "" };
    ch.dead = true; ch.deathT = 0.9;
    shatter(ch.x + CW / 2, ch.y + CH / 2, ch.side === -1 ? "#1FA2FF" : "#FF8A3D");
    MMGame.sfxDeath(ch.side < 0 ? -0.7 : 0.7);
    vibrate(60);
    if (G.mode !== "broken") {
      const other = G.chars[0] === ch ? G.chars[1] : G.chars[0];
      if (!other.dead) { other.dead = true; other.deathT = 0.9; shatter(other.x + CW / 2, other.y + CH / 2, other.side === -1 ? "#1FA2FF" : "#FF8A3D"); }
      emit("toast", { text: "镜像同步重置", short: true });
    }
  }

  function respawnChar(ch) {
    const cp = ch.checkpoint;
    ch.dead = false;
    ch.x = cp.x; ch.y = cp.y;
    ch.vx = 0; ch.vy = 0;
    ch.gravityDir = cp.g; ch.side = cp.side;
    ch.portalCd = 0.6; ch.flipCd = 0.4;
    sparkle(ch.x + CW / 2, ch.y + CH / 2, ch.side === -1 ? "#1FA2FF" : "#FF8A3D", 10);
  }

  /* ================= 机关更新 ================= */
  function overlapsCell(ch, cell, inset) {
    const i = inset || 6;
    const cx = cell.x * TS, cy = cell.y * TS;
    return ch.x + CW - i > cx && ch.x + i < cx + TS && ch.y + CH - i > cy && ch.y + i < cy + TS;
  }

  function updateMechanisms(dt) {
    const lv = G.level;
    for (const ch of G.chars) {
      if (ch.dead) continue;
      // 碎镜结界
      if (!G.brokenTriggered && G.mode !== "broken") {
        for (const z of lv.breakCells) {
          if (overlapsCell(ch, z, 4)) { breakMirror(); break; }
        }
      }
      // 重力幕帘
      if (ch.flipCd <= 0) {
        for (const wcell of lv.grav) {
          if (overlapsCell(ch, wcell, 2)) {
            ch.gravityDir *= -1; ch.flipCd = 0.5; ch.vy = 0;
            MMGame.sfxPortal(ch.side < 0 ? -0.6 : 0.6);
            ringFX(wcell.x * TS + TS / 2, wcell.y * TS + TS / 2, "#9fe8ff");
            break;
          }
        }
      }
      // 传送门
      if (ch.portalCd <= 0) {
        for (const p of lv.portals) {
          if (overlapsCell(ch, p.in, 4)) {
            const out = p.out;
            portalFX(ch.x + CW / 2, ch.y + CH / 2);
            ch.x = out.x * TS + (TS - CW) / 2;
            ch.y = out.y * TS + TS - CH;
            ch.side = out.x < lv.W ? -1 : 1;
            ch.vx = -ch.vx; ch.portalCd = 0.7;
            ch.checkpoint = { x: ch.x, y: ch.y, g: ch.gravityDir, side: ch.side };
            ch.lastCp = null;
            portalFX(ch.x + CW / 2, ch.y + CH / 2);
            MMGame.sfxPortal(ch.side < 0 ? -0.7 : 0.7);
            markProgress();
            break;
          }
        }
      }
      // 检查点
      for (const c of lv.checkpoints) {
        if (ch.lastCp === key(c.x, c.y)) continue;
        if (overlapsCell(ch, c, 4)) {
          ch.lastCp = key(c.x, c.y);
          ch.checkpoint = { x: c.x * TS + (TS - CW) / 2, y: c.y * TS + TS - CH, g: ch.gravityDir, side: ch.side };
          MMGame.sfxCheckpoint(ch.side < 0 ? -0.7 : 0.7);
          sparkle(c.x * TS + TS / 2, c.y * TS + TS / 2, "#ffe9a3", 8);
        }
      }
      // 压力板（保持型）
      const groups = ["g", "h", "s"];
      for (const gr of groups) {
        for (const c of lv.plates[gr]) {
          if (G.latched.has(key(c.x, c.y))) continue;
          if (overlapsCell(ch, c, 2)) {
            G.latched.add(key(c.x, c.y));
            MMGame.sfxPlate(ch.side < 0 ? -0.7 : 0.7);
            ringFX(c.x * TS + TS / 2, c.y * TS + TS / 2, "#ffd76a");
            markProgress();
            const all = lv.plates[gr].every((cc) => G.latched.has(key(cc.x, cc.y)));
            if (all) MMGame.sfxDoor(0);
          }
        }
      }
      // 碎片
      for (const id of Object.keys(lv.shards)) {
        if (G.shardsGot.has(id)) continue;
        for (const c of lv.shards[id]) {
          if (overlapsCell(ch, c, 2)) {
            G.shardsGot.add(id);
            MMGame.sfxShard(ch.side < 0 ? -0.5 : 0.5);
            sparkle(c.x * TS + TS / 2, c.y * TS + TS / 2, "#ffe9a3", 14);
            markProgress();
            emit("hud");
            break;
          }
        }
      }
      // 坠落 / 顶出世界
      if (ch.gravityDir > 0 && ch.y > lv.H * TS + 140) killChar(ch);
      if (ch.gravityDir < 0 && ch.y < -500) killChar(ch);
      // 地刺
      if (!ch.dead) {
        const x0 = Math.floor((ch.x + 6) / TS), x1 = Math.floor((ch.x + CW - 6) / TS);
        const y0 = Math.floor((ch.y + 8) / TS), y1 = Math.floor((ch.y + CH - 4) / TS);
        outer:
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (MMLevels.DEADLY.has(cellChar(tx, ty))) { killChar(ch); break outer; }
        }
      }
    }
    // 光束与水晶
    if (lv.hasBeams) updateBeams();
    // 节拍音
    if (lv.beat) {
      const b = lv.beat;
      const idx = Math.floor(G.time / b.period * 2);
      if (idx !== G.lastBeatPhase) {
        G.lastBeatPhase = idx;
        MMGame.sfxBeat(idx % 2 === 0);
      }
    }
  }

  /* ---------- 光束 ---------- */
  function updateBeams() {
    const lv = G.level;
    const held = G.chars.some((ch) => !ch.dead && lv.pads.some((p) => overlapsCell(ch, p, 4)));
    G.prismHeld = held;
    G.beamPaths = [];
    const MIRROR_R = { "1,0": [0, -1], "-1,0": [0, 1], "0,-1": [1, 0], "0,1": [-1, 0] };   // '/'
    const MIRROR_L = { "1,0": [0, 1], "-1,0": [0, -1], "0,-1": [-1, 0], "0,1": [1, 0] };   // '\'
    for (const em of lv.emitters) {
      let x = em.x, y = em.y, dx = em.dir, dy = 0;
      const pts = [{ x: x + 0.5, y: y + 0.5 }];
      for (let i = 0; i < 200; i++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= lv.FW || y >= lv.H) break;
        const c = cellChar(x, y);
        if (MMLevels.SOLID.has(c) || MMLevels.DEADLY.has(c)) break;
        const gdoor = doorMap(lv).get(key(x, y));
        if (gdoor && !doorOpen(gdoor)) break;
        if (c === "b" && beatSolid(0)) break;
        if (c === "B" && beatSolid(0.5)) break;
        let mirror = null;
        if (c === "/") mirror = MIRROR_R;
        else if (c === "\\") mirror = MIRROR_L;
        else if (c === "q") mirror = held ? MIRROR_R : MIRROR_L;
        if (mirror) {
          const nd = mirror[dx + "," + dy];
          if (!nd) break;
          dx = nd[0]; dy = nd[1];
        }
        pts.push({ x: x + 0.5, y: y + 0.5 });
        if (c === "*") {
          const k = key(x, y);
          if (!G.receiverLit.has(k)) {
            G.receiverLit.add(k);
            MMGame.sfxBeam(0);
            sparkle(x * TS + TS / 2, y * TS + TS / 2, "#9fe8ff", 12);
            markProgress();
            emit("hud");
          }
          break;
        }
      }
      G.beamPaths.push(pts);
    }
  }

  function breakMirror() {
    G.brokenTriggered = true;
    G.mode = "broken";
    G.slowmo = 0.35; G.flash = 1;
    MMInput.setBrokenMode(true);
    const lv = G.level;
    G.cracks = [];
    for (let i = 0; i <= 8; i++) G.cracks.push({ x: lv.W * TS + (rnd() - 0.5) * 26, y: (i / 8) * lv.H * TS });
    for (let i = 0; i < 40; i++) {
      G.particles.push({
        x: lv.W * TS + (rnd() - 0.5) * 30, y: rnd() * lv.H * TS,
        vx: (rnd() - 0.5) * 500, vy: (rnd() - 0.5) * 500 - 100,
        life: 0.9 + rnd() * 0.5, max: 1.4, size: 3 + rnd() * 5,
        color: rnd() < 0.5 ? "#ffffff" : "#ff6a6a", grav: 300, type: "shard", rot: rnd() * 6.28,
      });
    }
    MMGame.sfxBreak();
    vibrate([80, 40, 80]);
    emit("mode", { mode: "broken", name: MODE_NAME.broken, broke: true });
    emit("toast", { text: "镜面破碎！<span class='t-key'>WASD</span> 控制左侧的<span class='t-cyan'>棱</span>，<span class='t-key'>方向键</span>控制右侧的<span class='t-orange'>镜</span>", sticky: true });
    markProgress();
  }

  /* ================= 胜利 ================= */
  function checkWin() {
    if (G.state !== "playing") return;
    const lv = G.level;
    // 每一岸至少有一扇门被任一存活角色覆盖（支持多格宽的大门）
    const covered = (e) => G.chars.some((ch) => !ch.dead && overlapsCell(ch, e, 10));
    const leftExits = lv.exits.filter((e) => e.x < lv.W);
    const rightExits = lv.exits.filter((e) => e.x >= lv.W);
    if (!leftExits.length || !rightExits.length) return;
    if (leftExits.some(covered) && rightExits.some(covered) && G.chars.every((c) => !c.dead)) {
      G.state = "won";
      const shardsAll = Object.keys(lv.shards).length > 0 && Object.keys(lv.shards).every((k) => G.shardsGot.has(k));
      const stars = 1 + (shardsAll ? 1 : 0) + (G.steps <= lv.par ? 1 : 0);
      MMGame.sfxWin();
      for (let i = 0; i < 36; i++) {
        G.particles.push({
          x: lv.W * TS + (rnd() - 0.5) * 60, y: lv.H * TS * 0.35,
          vx: (rnd() - 0.5) * 420, vy: -rnd() * 380 - 60,
          life: 1 + rnd() * 0.7, max: 1.7, size: 3 + rnd() * 4,
          color: rnd() < 0.5 ? "#1FA2FF" : "#FF8A3D", grav: 500, type: "shard", rot: rnd() * 6.28,
        });
      }
      vibrate([40, 60, 40]);
      emit("win", {
        stars, steps: G.steps, par: lv.par, time: G.time,
        shards: Object.keys(lv.shards).map((k) => G.shardsGot.has(k)),
      });
    }
  }

  /* ================= 撤销 ================= */
  function pushUndo() {
    if (G.undoStack.length >= 3) G.undoStack.shift();
    G.undoStack.push({
      chars: G.chars.map((c) => ({
        x: c.x, y: c.y, vx: c.vx, vy: c.vy, side: c.side, gravityDir: c.gravityDir,
        dead: false, deathT: 0,
        checkpoint: Object.assign({}, c.checkpoint), lastCp: c.lastCp, portalCd: 0, flipCd: 0,
      })),
      shards: [...G.shardsGot], latched: [...G.latched], receivers: [...G.receiverLit],
      mode: G.mode, broken: G.brokenTriggered, steps: G.steps, time: G.time,
      bufLen: G.leftBuf.length,
    });
    emit("hud");
  }
  function undo() {
    const s = G.undoStack.pop();
    if (!s || G.state !== "playing") return;
    G.chars.forEach((c, i) => {
      const o = s.chars[i];
      Object.assign(c, o, { dead: false, deathT: 0, squash: 0, stretch: 0, prevJump: true });
      c.checkpoint = Object.assign({}, o.checkpoint);
    });
    G.shardsGot = new Set(s.shards);
    G.latched = new Set(s.latched);
    G.receiverLit = new Set(s.receivers);
    if (G.mode !== s.mode) {
      G.mode = s.mode; G.brokenTriggered = s.broken;
      MMInput.setBrokenMode(G.mode === "broken");
      emit("mode", { mode: G.mode, name: MODE_NAME[G.mode] });
    }
    G.steps = s.steps; G.time = s.time;
    G.leftBuf.length = Math.min(G.leftBuf.length, s.bufLen);
    emit("hud");
    MMGame.sfxUI();
  }

  /* ================= 粒子 / 表现 ================= */
  function dust(x, y, n, side) {
    for (let i = 0; i < n; i++) G.particles.push({
      x, y, vx: (rnd() - 0.5) * 160, vy: -rnd() * 90,
      life: 0.3 + rnd() * 0.2, max: 0.5, size: 2 + rnd() * 3,
      color: "rgba(255,255,255,0.5)", grav: 160, type: "dot",
    });
  }
  function sparkle(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, s = 60 + rnd() * 180;
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + rnd() * 0.4, max: 0.9, size: 2 + rnd() * 3, color, grav: 60, type: "dot" });
    }
  }
  function shatter(x, y, color) {
    for (let i = 0; i < 22; i++) {
      const a = rnd() * 6.28, s = 80 + rnd() * 320;
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 + rnd() * 0.4, max: 1, size: 3 + rnd() * 4, color, grav: 700, type: "shard", rot: rnd() * 6.28 });
    }
  }
  function portalFX(x, y) { ringFX(x, y, "#9fe8ff"); sparkle(x, y, "#9fe8ff", 8); }
  function ringFX(x, y, color) {
    G.particles.push({ x, y, life: 0.45, max: 0.45, size: 6, color, type: "ring" });
  }
  function vibrate(pat) { if (G.settings.vibro && navigator.vibrate) try { navigator.vibrate(pat); } catch (e) { } }

  function markProgress() { G.noProgressT = 0; G.hintShown = G.hintShown; emit("hud"); }

  /* ================= 主循环 ================= */
  function frame(now) {
    G._raf = requestAnimationFrame(frame);
    if (G.state === "idle") return;
    if (!G._last) G._last = now;
    let dt = Math.min(0.05, (now - G._last) / 1000);
    G._last = now;
    if (G.state === "paused") { render(); return; }
    if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.25; }
    G._acc += dt;
    const FIXED = 1 / 60;
    let n = 0;
    while (G._acc >= FIXED && n < 5) {
      G._acc -= FIXED; n++;
      fixedStep(FIXED);
    }
    render();
  }

  function fixedStep(dt) {
    if (G.state === "idle") return;
    G.time += dt;
    G.flash = Math.max(0, G.flash - dt * 3);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 3);

    if (G.state === "playing") {
      const { li, ri } = computeInputs();
      stepChar(G.chars[0], li, dt);
      stepChar(G.chars[1], ri, dt);
      updateMechanisms(dt);
      checkWin();
      // 卡关检测
      G.noProgressT += dt;
      if (G.noProgressT > 90 && !G.hintShown) {
        G.hintShown = true;
        emit("hint");
      }
    } else {
      // 胜利演出：小跳
      for (const ch of G.chars) {
        if (!ch.dead && ch.onGround && rnd() < 0.05) { ch.vy = -300 * ch.gravityDir; ch.onGround = false; }
        stepCharPhysicsOnly(ch, dt);
      }
    }
    // 粒子
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      if (p.type !== "ring") {
        p.vy += (p.grav || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rot !== undefined) p.rot += dt * 6;
      }
    }
    // 拖尾
    if (!G.settings.reduce) {
      for (let i = 0; i < 2; i++) {
        const ch = G.chars[i];
        if (!ch || ch.dead) continue;
        G.trails[i].push({ x: ch.x, y: ch.y, t: 0 });
        if (G.trails[i].length > 12) G.trails[i].shift();
        for (const t of G.trails[i]) t.t += dt;
      }
    }
    // 角色动画状态
    for (const ch of G.chars) {
      ch.squash = Math.max(0, ch.squash - dt * 5);
      ch.stretch = Math.max(0, ch.stretch - dt * 5);
      ch.blink += dt;
    }
    updateCamera(dt);
  }

  function stepCharPhysicsOnly(ch, dt) {
    ch.vy += GRAV * ch.gravityDir * dt;
    ch.y += ch.vy * dt;
    if (aabbHitsSolid(ch.x, ch.y)) {
      const sign = Math.sign(ch.vy) || 1;
      while (aabbHitsSolid(ch.x, ch.y)) ch.y -= sign;
      if (Math.abs(ch.vy) < 350) { ch.onGround = true; } 
      ch.vy = 0;
    }
  }

  function updateCamera(dt) {
    const alive = G.chars.filter((c) => !c.dead);
    const cs = alive.length ? alive : G.chars;
    const mx = cs.reduce((s, c) => s + c.x + CW / 2, 0) / cs.length;
    const my = cs.reduce((s, c) => s + c.y + CH / 2, 0) / cs.length;
    const canvas = G.canvas;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    let spanX = 0, spanY = 0;
    if (cs.length > 1) {
      spanX = Math.max(...cs.map((c) => c.x)) - Math.min(...cs.map((c) => c.x));
      spanY = Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y));
    }
    const pad = 340;
    let zoom = Math.min(vw / (spanX + pad), vh / (spanY + pad + 120));
    zoom = Math.max(0.55, Math.min(1.35, zoom));
    const k = 1 - Math.pow(0.0018, dt);
    G.cam.zoom += (zoom - G.cam.zoom) * k;
    const worldW = G.level.FW * TS, worldH = G.level.H * TS;
    const halfW = vw / 2 / G.cam.zoom, halfH = vh / 2 / G.cam.zoom;
    let tx = Math.max(halfW, Math.min(worldW - halfW, mx));
    let ty = Math.max(halfH - 60, Math.min(Math.max(worldH - halfH, halfH), my));
    if (worldW < vw / G.cam.zoom) tx = worldW / 2;
    if (worldH < vh / G.cam.zoom) ty = worldH / 2;
    G.cam.x += (tx - G.cam.x) * k;
    G.cam.y += (ty - G.cam.y) * k;
  }

  function resize() {
    const canvas = G.canvas;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
  }

  /* ================= 渲染 ================= */
  function render() {
    const cv = G.canvas, ctx = G.ctx;
    if (!cv || !G.level) return;
    resize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vw = cv.clientWidth, vh = cv.clientHeight;
    const th = G.level.theme;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBaseArt();
    buildThemeArt(th);

    // 背景（多段渐变天空 + 多层远景剪影 + 雾气 + 漂浮尘埃）
    drawParallax(ctx, vw, vh, th);

    // 世界变换
    ctx.save();
    const shx = (Math.random() - 0.5) * G.cam.shake * 22;
    const shy = (Math.random() - 0.5) * G.cam.shake * 22;
    ctx.translate(vw / 2 + shx, vh / 2 + shy);
    ctx.scale(G.cam.zoom, G.cam.zoom);
    ctx.translate(-G.cam.x, -G.cam.y);

    drawAxis(ctx, th);
    drawTiles(ctx, th);
    drawDevices(ctx, th);
    drawBeams(ctx);
    drawShardsAndGates(ctx, th);
    drawChars(ctx, th);
    drawParticles(ctx);
    ctx.restore();

    // 镜面倒影错觉（镜轴两侧的玻璃反光带）
    drawMirrorSheen(ctx, vw, vh, th);
    // 前景浮尘（景深）
    drawForegroundDust(ctx, vw, vh);
    // 破镜红晕 / 慢动作闪白 / 分控染色
    if (G.mode === "broken") {
      const grd = ctx.createLinearGradient(0, 0, vw, 0);
      grd.addColorStop(0, "rgba(255,60,60,0.10)");
      grd.addColorStop(0.5, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(255,60,60,0.10)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, vw, vh);
    }
    // 后处理（暗角 + 色彩分级）交由 #postfx 层做 CSS 合成，避免每帧全屏逐像素开销
    if (G.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.75})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---------- 背景：半分辨率离屏层（按需重建）+ 动态尘埃 ---------- */
  function bgLayer(vw, vh) {
    const w = Math.max(2, Math.ceil(vw * 0.5)), h = Math.max(2, Math.ceil(vh * 0.5));
    if (!ART.bg || ART.bg.width !== w || ART.bg.height !== h) {
      ART.bg = mkCanvas(w, h);
      ART.bgKey = "";
      ART.bgCamX = NaN;
      ART.bgFrame = -99;
    }
    return ART.bg;
  }

  function drawParallax(ctx, vw, vh, th) {
    const t = G.time;
    ART.fc = (ART.fc || 0) + 1;
    const cv = bgLayer(vw, vh);
    const key = th.skyTop + th.skyBot + th.accent;
    // 只在主题/尺寸变化、镜头移动超过 3 世界像素、或间隔 3 帧（云在飘）时重建
    const need = ART.bgKey !== key || !(Math.abs(G.cam.x - ART.bgCamX) < 3) || ART.fc - ART.bgFrame >= 3;
    if (need) {
      ART.bgKey = key;
      ART.bgCamX = G.cam.x;
      ART.bgFrame = ART.fc;
      renderBackdrop(cv, vw, vh, th);
    }
    ctx.drawImage(cv, 0, 0, vw, vh);

    // 动态尘埃（缓慢上浮 + 左右轻摆）
    if (!G.settings.reduce) {
      const list = ambient(vw, vh);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const m of list) {
        if (m.z > 0.82) continue;
        const y = (((m.y - t * m.sp * m.z) % vh) + vh) % vh;
        const x = (((m.x + Math.sin(t * 0.35 + m.ph) * 22 * m.z - G.cam.x * 0.05 * m.z) % vw) + vw) % vw;
        ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 1.1 + m.ph));
        const r = m.r * (2.6 + m.z * 3.4);
        ctx.drawImage(ART.mote, x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  }

  // 背景合成（写入半分辨率层）：天空 → 地平线辉光 → 云带 → 远景剪影 → 雾气 → 左右镜像色差
  function renderBackdrop(cv, vw, vh, th) {
    const g = cv.getContext("2d");
    const t = G.time;
    const S = cv.width / vw;
    g.setTransform(S, 0, 0, S, 0, 0);
    // 天顶→地平线→地面辉光的多段渐变
    g.fillStyle = cgrad("sky|" + th.skyTop + th.skyBot + th.accent + vw + "x" + vh, () => {
      const gr = g.createLinearGradient(0, 0, 0, vh);
      gr.addColorStop(0, shade(th.skyTop, -0.58));
      gr.addColorStop(0.16, shade(th.skyTop, -0.34));
      gr.addColorStop(0.36, shade(th.skyTop, -0.06));
      gr.addColorStop(0.56, shade(mixHex(th.skyTop, th.skyBot, 0.55), -0.18));
      gr.addColorStop(0.72, shade(mixHex(th.skyTop, th.skyBot, 0.9), -0.06));
      gr.addColorStop(0.88, shade(th.skyBot, -0.10));
      gr.addColorStop(1, mixHex(th.skyBot, th.accent, 0.18));
      return gr;
    });
    g.fillRect(0, 0, vw, vh);
    // 地平线辉光（主题色）
    g.fillStyle = cgrad("horizon|" + th.accent + vw + "x" + vh, () => {
      const gr = g.createRadialGradient(vw * 0.5, vh * 0.8, 0, vw * 0.5, vh * 0.8, Math.max(vw, vh) * 0.66);
      gr.addColorStop(0, withA(th.accent, 0.10));
      gr.addColorStop(0.42, withA(th.accent, 0.035));
      gr.addColorStop(1, withA(th.accent, 0));
      return gr;
    });
    g.fillRect(0, 0, vw, vh);

    // 缓慢漂移的云带（亮部 + 暗部，产生体积感与明暗层次）
    if (!G.settings.reduce) {
      buildClouds();
      const t = G.time;
      for (let i = 0; i < 2; i++) {
        const cl = ART.cloud[i];
        const par = i === 0 ? 0.05 : 0.13, sp = i === 0 ? 8 : 15;
        const w = vw * (i === 0 ? 1.3 : 1.7), hh = vh * (i === 0 ? 0.40 : 0.32);
        const yy = vh * (i === 0 ? 0.10 : 0.33);
        const off = -((((t * sp + G.cam.x * par) % w) + w) % w);
        g.save();
        g.globalAlpha = i === 0 ? 0.62 : 0.46;
        for (let k = 0; k < 3 && off + k * w < vw + w; k++) g.drawImage(cl, off + k * w, yy, w, hh);
        g.restore();
      }
    }

    // 宽阔的斜向光轴（大尺度明暗变化）
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const wid = vw * 0.17;
      const gr = cgrad("shaft|" + i + "|" + vw, () => {
        const q = g.createLinearGradient(-wid, 0, wid, 0);
        q.addColorStop(0, withA(th.accent, 0));
        q.addColorStop(0.5, withA(th.accent, 0.085 - i * 0.02));
        q.addColorStop(1, withA(th.accent, 0));
        return q;
      });
      const x = vw * (0.16 + i * 0.34) - ((G.cam.x * 0.04) % (vw * 1.2));
      g.save();
      g.translate(x, vh * 0.46);
      g.rotate(-0.20 - i * 0.06);
      g.fillStyle = gr;
      g.fillRect(-wid, -vh, wid * 2, vh * 2);
      g.restore();
    }
    g.restore();

    // 横向雾霭带（交替明暗，破除大面积同色）
    for (let i = 0; i < 4; i++) {
      const yy = vh * (0.20 + i * 0.16);
      const hh = vh * (0.055 + (i % 2) * 0.03);
      g.save();
      g.globalAlpha = i % 2 ? 0.10 : 0.07;
      g.fillStyle = i % 2 ? shade(th.skyBot, 0.35) : shade(th.skyTop, -0.4);
      g.beginPath();
      g.ellipse(vw * (0.28 + i * 0.19), yy, vw * 0.46, hh, 0, 0, 6.2832);
      g.fill();
      g.restore();
    }

    // 远景剪影：多层大气透视（含剪影上的万家灯火）
    buildSilhouettes(G.level);
    if (ART.sil) {
      for (const L of ART.sil) {
        const shift = (-((G.cam.x * L.par) % (vw * 1.5))) / vw;
        g.save();
        g.globalAlpha = L.alpha;
        g.scale(vw, vh);
        g.translate(shift, 0);
        g.fillStyle = L.color;
        for (let i = -1; i <= 1; i++) { g.save(); g.translate(i * 1.5, 0); g.fill(L.path); g.restore(); }
        g.restore();
        // 剪影上的窗火（小面积高亮点，补足中景层次）
        if (!G.settings.reduce && L.li > 0) {
          g.save();
          g.globalCompositeOperation = "lighter";
          g.scale(vw, vh);
          g.translate(shift, 0);
          vseed(2200 + L.li * 41);
          for (let i = 0; i < 90; i++) {
            const wx = -0.2 + vrand() * 1.4;
            const wy = L.y - vrand() * L.amp * 0.62;
            const ww = 0.0016 + vrand() * 0.0034, wh = 0.003 + vrand() * 0.0055;
            g.globalAlpha = 0.14 + vrand() * 0.5;
            g.fillStyle = vrand() < 0.58 ? "#ffd9a0" : "#bfe6ff";
            g.fillRect(wx, wy, ww, wh);
          }
          g.restore();
        }
      }
    }

    // 高空极光带（给上部天空增加色彩与明暗层次）
    if (!G.settings.reduce) {
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let k = 0; k < 2; k++) {
        const baseY = vh * (0.15 + k * 0.10);
        g.beginPath();
        for (let i = 0; i <= 18; i++) {
          const xx = (vw * i) / 18 - vw * 0.02;
          const yy = baseY + Math.sin(i * 0.66 + t * 0.32 + k * 2.1) * vh * 0.04;
          if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
        }
        g.strokeStyle = k ? "#9fe8ff" : th.accent;
        g.lineCap = "round";
        for (let s = 0; s < 3; s++) {
          g.globalAlpha = 0.055 - k * 0.012;
          g.lineWidth = 34 - s * 10;
          g.stroke();
        }
      }
      g.restore();
    }
    // 空中浮岛（小面积，补足天空层次：主体 + 受光顶面 + 底部阴影）
    if (!G.settings.reduce) {
      g.save();
      const ox = -G.cam.x * 0.14;
      for (let i = 0; i < 10; i++) {
        const x = ((i * 331 + ox) % (vw + 460) + vw + 460) % (vw + 460) - 230;
        const y = vh * (0.08 + ((i * 53) % 46) / 100) + Math.sin(t * 0.4 + i * 2.1) * 7;
        const s = 13 + ((i * 29) % 26);
        g.globalAlpha = 0.34;
        g.fillStyle = mixHex(th.bg, th.tileTop, 0.42);
        g.beginPath();
        g.moveTo(x - s, y); g.lineTo(x, y - s * 0.46); g.lineTo(x + s, y);
        g.lineTo(x + s * 0.5, y + s * 0.36); g.lineTo(x - s * 0.42, y + s * 0.42);
        g.closePath(); g.fill();
        // 受光顶面
        g.globalAlpha = 0.5;
        g.fillStyle = withA(th.accent, 0.55);
        g.beginPath();
        g.moveTo(x - s, y); g.lineTo(x, y - s * 0.46); g.lineTo(x + s, y);
        g.lineTo(x + s * 0.4, y + s * 0.06); g.lineTo(x - s * 0.3, y + s * 0.04);
        g.closePath(); g.fill();
        // 底部阴影
        g.globalAlpha = 0.28;
        g.fillStyle = "rgba(0,0,0,0.8)";
        g.beginPath();
        g.moveTo(x - s * 0.42, y + s * 0.42); g.lineTo(x + s * 0.5, y + s * 0.36);
        g.lineTo(x + s * 0.2, y + s * 0.6); g.lineTo(x - s * 0.2, y + s * 0.62);
        g.closePath(); g.fill();
      }
      // 高空微光尘埃/星辰
      g.globalAlpha = 1;
      g.globalCompositeOperation = "lighter";
      vseed(4242);
      for (let i = 0; i < 46; i++) {
        const x = vrand() * vw, y = vrand() * vh * 0.55;
        const a = 0.10 + vrand() * 0.35;
        const r = 0.9 + vrand() * 1.6;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + i);
        g.fillStyle = `rgba(255,255,255,${(a * tw).toFixed(3)})`;
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
      g.globalCompositeOperation = "source-over";
      g.restore();
    }

    // 中景浮空城天际线 + 窗火
    buildSkyline(G.level);
    if (ART.city) {
      const shift = (-((G.cam.x * ART.city.par) % (vw * 1.4))) / vw;
      g.save();
      g.globalAlpha = 0.9;
      g.scale(vw, vh);
      g.translate(shift, 0);
      g.fillStyle = ART.city.color;
      for (let i = -1; i <= 1; i++) { g.save(); g.translate(i * 1.4, 0); g.fill(ART.city.path); g.restore(); }
      // 窗火
      g.globalCompositeOperation = "lighter";
      for (let i = -1; i <= 1; i++) {
        g.save();
        g.translate(i * 1.4, 0);
        for (let k = 0; k < ART.city.wins.length; k++) {
          const w = ART.city.wins[k];
          g.globalAlpha = 0.20 + ((k * 37) % 45) / 100;
          g.fillStyle = k % 3 ? "#ffd9a0" : "#bfe6ff";
          g.fillRect(w.x, w.y, w.w, w.h);
        }
        g.restore();
      }
      g.restore();
    }

    // 近景地平框（最外侧暗色剪影，强化纵深）
    buildFrame(G.level);
    if (ART.frame) {
      const shift = (-((G.cam.x * 0.72) % (vw * 1.6))) / vw;
      g.save();
      g.globalAlpha = 0.78;
      g.scale(vw, vh);
      g.translate(shift, 0);
      g.fillStyle = shade(th.bg, -0.35);
      for (let i = -1; i <= 1; i++) { g.save(); g.translate(i * 1.6, 0); g.fill(ART.frame); g.restore(); }
      g.restore();
    }

    // 雾带：分层交替明暗，把远景压进空气里
    g.fillStyle = cgrad("fog|" + th.skyBot + th.accent + vh, () => {
      const gr = g.createLinearGradient(0, vh * 0.40, 0, vh);
      gr.addColorStop(0, withA(th.skyBot, 0));
      gr.addColorStop(0.22, withA(th.skyBot, 0.22));
      gr.addColorStop(0.38, withA(th.skyBot, 0.08));
      gr.addColorStop(0.56, withA(th.accent, 0.20));
      gr.addColorStop(0.70, withA(th.skyBot, 0.10));
      gr.addColorStop(0.86, withA(th.skyBot, 0.28));
      gr.addColorStop(1, withA(th.skyBot, 0.40));
      return gr;
    });
    g.fillRect(0, 0, vw, vh);

    // 左青 / 右橙的镜像色差（背景层内合成，成本极低）
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.20;
    g.fillStyle = cgrad("mirrorL|" + vw + "x" + vh, () => {
      const gr = g.createLinearGradient(0, 0, vw * 0.5, 0);
      gr.addColorStop(0, "#1FA2FF");
      gr.addColorStop(0.88, "rgba(31,162,255,0)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      return gr;
    });
    g.fillRect(0, 0, vw * 0.5, vh);
    g.fillStyle = cgrad("mirrorR|" + vw + "x" + vh, () => {
      const gr = g.createLinearGradient(vw, 0, vw * 0.5, 0);
      gr.addColorStop(0, "#FF8A3D");
      gr.addColorStop(0.88, "rgba(255,138,61,0)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      return gr;
    });
    g.fillRect(vw * 0.5, 0, vw * 0.5, vh);
    g.restore();

    // 胶片颗粒：低幅度平铺噪声，破除大面积同色（pattern 一次填充，成本极低）
    if (!G.settings.reduce) {
      buildGrain();
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = g.createPattern(ART.grain, "repeat");
      g.fillRect(0, 0, vw, vh);
      g.restore();
    }
  }

  /* ---------- 镜面：轴两侧倒影 + 青/橙镜像色差 ---------- */
  function drawMirrorSheen(ctx, vw, vh, th) {
    const lv = G.level;
    const axisScreenX = vw / 2 + (lv.W * TS - G.cam.x) * G.cam.zoom;
    if (G.mode !== "broken" && axisScreenX > -140 && axisScreenX < vw + 140) {
      // 镜轴两侧的玻璃反光带 + 被拉长的倒影光带（合成倒影感，成本极低）
      const bw = Math.min(150, vw * 0.16);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const sgn of [-1, 1]) {
        const key = "sheen|" + sgn + "|" + bw.toFixed(0) + "|" + th.accent;
        ctx.save();
        ctx.translate(axisScreenX, 0);
        ctx.fillStyle = cgrad(key, () => {
          const g = ctx.createLinearGradient(0, 0, sgn * bw, 0);
          g.addColorStop(0, withA(th.accent, 0.18));
          g.addColorStop(0.35, withA(th.accent, 0.05));
          g.addColorStop(1, withA(th.accent, 0));
          return g;
        });
        ctx.fillRect(0, 0, sgn * bw, vh);
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = withA(th.accent, 0.9);
        for (let i = 0; i < 7; i++) {
          const yy = vh * (0.16 + i * 0.115) + Math.sin(G.time * 0.7 + i * 1.9) * 12;
          const hh2 = 1.4 + 2.6 * Math.abs(Math.sin(G.time * 0.5 + i));
          ctx.fillRect(0, yy, sgn * bw * 0.72, hh2);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawAxis(ctx, th) {
    const lv = G.level;
    const ax = lv.W * TS;
    const h = lv.H * TS;
    const HW = 5.5;                       // 镜面半宽（世界单位）
    const y0 = -70, y1 = h + 70;
    ctx.save();

    if (G.mode === "broken") {
      // 碎裂的镜轴：红热裂纹 + 火花辉光 + 残片
      const pulse = 0.72 + 0.28 * Math.sin(G.time * 7);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(glowSprite("#ff5a5a"), ax - 70, y0, 140, y1 - y0);
      ctx.restore();
      ctx.lineCap = "round";
      ctx.beginPath();
      if (G.cracks) {
        for (let i = 0; i < G.cracks.length - 1; i++) {
          ctx.moveTo(G.cracks[i].x, G.cracks[i].y);
          ctx.lineTo(G.cracks[i + 1].x, G.cracks[i + 1].y);
        }
      } else { ctx.moveTo(ax, 0); ctx.lineTo(ax, h); }
      ctx.strokeStyle = "rgba(255,60,60,0.35)"; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = "rgba(255,120,90,0.85)"; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,220,${0.75 + 0.25 * pulse})`; ctx.lineWidth = 1.6; ctx.stroke();
      // 沿裂纹飘散的火星
      if (G.cracks) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < G.cracks.length; i++) {
          const c = G.cracks[i];
          const fy = ((G.time * 90 + i * 53) % (h + 60)) - 30;
          ctx.globalAlpha = 0.5 * (1 - Math.abs(fy - c.y) / (h + 60));
          const rr = 16 + 8 * Math.sin(G.time * 4 + i);
          ctx.drawImage(glowSprite("#ffb08a"), c.x - rr, fy - rr, rr * 2, rr * 2);
        }
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    // -------- 真实镜面材质 --------
    let alpha = 0.92, dash = null;
    if (G.mode === "delay") dash = [14, 10];
    if (G.mode === "partial") { alpha = 0.58; dash = [4, 8]; }
    let beatGlow = 0;
    if (lv.beat) {
      const b = lv.beat;
      const ph = (G.time / b.period) % 1;
      beatGlow = Math.max(0, 1 - ph * 4);
      alpha = 0.55 + 0.42 * beatGlow;
    }

    const key = "axis|" + th.accent + "|" + ax + "|" + h;
    // 横向：冷缘 → 白核 → 暖缘（左右两侧色差）
    const gx = cgrad(key + "|x", () => {
      const g = ctx.createLinearGradient(ax - HW, 0, ax + HW, 0);
      g.addColorStop(0, withA("#63c8ff", 0));
      g.addColorStop(0.16, withA("#7fd0ff", 0.34));
      g.addColorStop(0.42, withA("#dff4ff", 0.85));
      g.addColorStop(0.5, "rgba(255,255,255,0.98)");
      g.addColorStop(0.58, withA("#ffe6cf", 0.85));
      g.addColorStop(0.84, withA("#ff9a52", 0.34));
      g.addColorStop(1, withA("#ff8a3d", 0));
      return g;
    });
    // 纵向：上冷下暖（镜面镀膜的垂直渐变）
    const gy = cgrad(key + "|y", () => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, "rgba(150,215,255,0.55)");
      g.addColorStop(0.42, "rgba(255,255,255,0.26)");
      g.addColorStop(0.68, "rgba(255,226,196,0.32)");
      g.addColorStop(1, "rgba(255,163,96,0.55)");
      return g;
    });
    // 纵向高光扫过（缓慢上行的镜面反射带）
    const sweepY = ((G.time * 62) % (y1 - y0 + 200)) + y0 - 100;
    const gs = cgrad(key + "|s", () => {
      const g = ctx.createLinearGradient(0, -90, 0, 90);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.45, "rgba(255,255,255,0.55)");
      g.addColorStop(0.5, "rgba(255,255,255,0.8)");
      g.addColorStop(0.55, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      return g;
    });

    // 1) 外侧体积光
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.30 + 0.30 * beatGlow;
    ctx.drawImage(glowSprite(th.accent), ax - 78, y0, 156, y1 - y0);
    ctx.restore();

    // 2) 镜体：横向材质 + 纵向镀膜
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gx; ctx.fillRect(ax - HW, y0, HW * 2, y1 - y0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6 * alpha;
    ctx.fillStyle = gy; ctx.fillRect(ax - HW, y0, HW * 2, y1 - y0);
    ctx.restore();

    // 3) 镜面内的高光扫过（裁剪在镜体里）
    ctx.save();
    ctx.beginPath(); ctx.rect(ax - HW, y0, HW * 2, y1 - y0); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 * alpha;
    ctx.translate(0, sweepY);
    ctx.fillStyle = gs; ctx.fillRect(ax - HW, -90, HW * 2, 180);
    ctx.translate(0, -sweepY);
    // 4) 微微扭曲的倒影条纹（玻璃质感）
    ctx.globalAlpha = 0.16 * alpha;
    for (let i = 0; i < 26; i++) {
      const yy = y0 + ((i * 47 + G.time * 14) % (y1 - y0));
      const wq = 1.2 + 2.6 * Math.abs(Math.sin(G.time * 0.8 + i * 1.7));
      ctx.fillStyle = i % 2 ? "rgba(200,235,255,0.8)" : "rgba(255,215,180,0.8)";
      ctx.fillRect(ax - wq, yy, wq * 2, 2.2);
    }
    ctx.restore();

    // 5) 菲涅尔边缘（两侧各一条亮边，镜面轮廓）
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.setLineDash(dash || []);
    if (dash) ctx.lineDashOffset = -G.time * 40;
    ctx.lineCap = "round";
    for (const sgn of [-1, 1]) {
      const ex = ax + sgn * HW * 0.92;
      ctx.strokeStyle = sgn < 0 ? withA("#8fe0ff", 0.75 * alpha) : withA("#ffcaa0", 0.75 * alpha);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ex, y0); ctx.lineTo(ex, y1); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * alpha})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(ax, y0); ctx.lineTo(ax, y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 6) 端点的镜面星芒（镜轴与天地交界处）
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * alpha;
    const sr = 26 + 6 * Math.sin(G.time * 2.2);
    ctx.drawImage(ART.spark, ax - sr, -sr * 0.4, sr * 2, sr * 2);
    ctx.drawImage(ART.spark, ax - sr, h + 40 - sr, sr * 2, sr * 2);
    ctx.restore();

    // 7) 模式专属语义：延迟=时钟残影 / 反向=流动箭头
    if (G.mode === "reverse") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let y = ((G.time * 60) % 96) - 96; y < h; y += 96) {
        ctx.beginPath();
        ctx.moveTo(ax - 7, y); ctx.lineTo(ax + 7, y + 8); ctx.lineTo(ax - 7, y + 16);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (G.mode === "delay") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const echo = 1 - (DELAY_FRAMES() / 60) * 0.5;
      for (let y = 40; y < h; y += 240) {
        const r = 5;
        ctx.globalAlpha = 0.5 * echo;
        ctx.drawImage(glowSprite("#b28bff"), ax - r * 4, y - r * 4, r * 8, r * 8);
        ctx.globalAlpha = 0.9 * echo;
        ctx.fillStyle = "#c9a8ff";
        ctx.beginPath(); ctx.arc(ax, y, r, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTiles(ctx, th) {
    const lv = G.level;
    const x0 = Math.max(0, Math.floor((G.cam.x - G.canvas.clientWidth / G.cam.zoom) / TS) - 1);
    const x1 = Math.min(lv.FW - 1, Math.ceil((G.cam.x + G.canvas.clientWidth / G.cam.zoom) / TS) + 1);
    const y0 = Math.max(0, Math.floor((G.cam.y - G.canvas.clientHeight / G.cam.zoom) / TS) - 1);
    const y1 = Math.min(lv.H - 1, Math.ceil((G.cam.y + G.canvas.clientHeight / G.cam.zoom) / TS) + 1);
    const doors = doorMap(lv);
    const blockAt = (x, y) => {
      if (y < 0 || y >= lv.H || x < 0 || x >= lv.FW) return false;
      const cc = lv.grid[y][x];
      if (cc === "#" || cc === "=") return true;
      return !!doors.get(key(x, y));
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = lv.grid[y][x];
        const px = x * TS, py = y * TS;
        if (c === "#") {
          // 石砖材质（4 变体错缝）
          const art = ART.tiles[(x * 7 + y * 13) & 3];
          ctx.drawImage(art, px, py, TS, TS);
          // 上方为空 → 顶面受光 + 悬空投下的接触阴影
          if (!blockAt(x, y - 1)) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.42;
            ctx.drawImage(ART.litTop, px, py, TS, TS);
            ctx.restore();
          }
          if (!blockAt(x, y + 1)) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.drawImage(ART.shadow, px - 7, py + TS - 8, TS + 14, 30);
            ctx.restore();
          }
        } else if (c === "=") {
          // 金属格栅薄板
          if (!blockAt(x, y - 1)) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.drawImage(ART.shadow, px - 4, py + TS * 0.3 - 8, TS + 8, 24);
            ctx.restore();
          }
          ctx.drawImage(ART.plate, px, py + TS * 0.3, TS, TS * 0.4);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = withA(th.tileTop, 0.5);
          ctx.fillRect(px + 2, py + TS * 0.3, TS - 4, 3);
          ctx.restore();
        } else if (c === "^" || c === "!") {
          const up = c === "^";
          // 地刺：暗色底座 + 金属渐变尖刺 + 尖端高光 + 危险辉光
          ctx.save();
          ctx.globalAlpha = 0.45;
          if (up) ctx.drawImage(ART.shadow, px - 4, py + TS - 10, TS + 8, 18);
          else ctx.drawImage(ART.shadow, px - 4, py + TS * 0.4, TS + 8, 18);
          ctx.restore();
          for (let k = 0; k < 3; k++) {   // 三根刺，更有层次
            const ox = px + 6 + k * 15;
            ctx.save();
            ctx.translate(ox, up ? py + TS : py);
            if (!up) ctx.scale(1, -1);
            ctx.beginPath();
            ctx.moveTo(-6, 0); ctx.lineTo(0, -TS + 8); ctx.lineTo(6, 0);
            ctx.closePath();
            ctx.save(); ctx.translate(0, -TS + 8);
            const lg = ctx.createLinearGradient(0, 0, 0, TS - 8);
            lg.addColorStop(0, "#ffe6de"); lg.addColorStop(0.3, "#ff8a78");
            lg.addColorStop(0.85, "#b8321f"); lg.addColorStop(1, "#4d0f08");
            ctx.fillStyle = lg; ctx.fill();
            ctx.restore();
            ctx.strokeStyle = "rgba(255,180,150,0.5)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -TS + 8); ctx.lineTo(-2.5, -2); ctx.stroke();
            ctx.restore();
          }
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.35 + 0.2 * Math.sin(G.time * 5);
          const gr = 30;
          ctx.drawImage(glowSprite("#ff6a5e"), px + TS / 2 - gr, (up ? py + TS - 6 : py + 6) - gr, gr * 2, gr * 2);
          ctx.restore();
        } else if (c === "w") {
          // 重力幕帘：竖向能量帘 + 流动条带 + 边缘辉光
          ctx.save();
          const wg = cgrad("grav", () => {
            const g = ctx.createLinearGradient(0, 0, 0, 48);
            g.addColorStop(0, "rgba(120,220,255,0.05)");
            g.addColorStop(0.5, "rgba(150,235,255,0.22)");
            g.addColorStop(1, "rgba(120,220,255,0.05)");
            return g;
          });
          ctx.translate(px, py);
          ctx.fillStyle = wg; ctx.fillRect(0, 0, TS, TS);
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = cgrad("grav-edge", () => {
            const g = ctx.createLinearGradient(0, 0, TS, 0);
            g.addColorStop(0, "rgba(140,230,255,0.55)");
            g.addColorStop(0.12, "rgba(140,230,255,0)");
            g.addColorStop(0.88, "rgba(140,230,255,0)");
            g.addColorStop(1, "rgba(140,230,255,0.55)");
            return g;
          });
          const dir = Math.sin(G.time * 1.6) > 0 ? 1 : -1;
          ctx.fillRect(0, 0, TS, TS);
          ctx.globalAlpha = 0.75;
          const ph = (G.time * 46 * dir) % 24;
          ctx.strokeStyle = "rgba(190,245,255,0.7)";
          ctx.lineWidth = 2;
          for (let i = -1; i < 3; i++) {
            const yy = ((i * 24 + ph) % (TS + 24) + TS + 24) % (TS + 24) - 12;
            ctx.beginPath();
            ctx.moveTo(11, yy + 7); ctx.lineTo(TS / 2, yy); ctx.lineTo(TS - 11, yy + 7);
            ctx.stroke();
          }
          ctx.restore();
        } else if (c === "z") {
          // 碎镜结界：红色裂缝 + 玻璃闪光
          const pulse = 0.5 + 0.3 * Math.sin(G.time * 6);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.28 * (0.6 + pulse);
          ctx.drawImage(glowSprite("#ff5a5a"), px - 12, py - 12, TS + 24, TS + 24);
          ctx.restore();
          ctx.strokeStyle = `rgba(255,90,90,${pulse + 0.2})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(px + TS / 2, py);
          ctx.lineTo(px + TS / 2 - 8, py + TS * 0.33);
          ctx.lineTo(px + TS / 2 + 7, py + TS * 0.6);
          ctx.lineTo(px + TS / 2 - 5, py + TS);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,220,210,0.65)"; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + TS / 2 - 8, py + TS * 0.33); ctx.lineTo(px + 6, py + TS * 0.2);
          ctx.moveTo(px + TS / 2 + 7, py + TS * 0.6); ctx.lineTo(px + TS - 5, py + TS * 0.78);
          ctx.stroke();
        }
        // 门
        const g = doors.get(key(x, y));
        if (g && y === doorTop(lv, x, y)) {
          const open = doorOpen(g);
          const cells = doorCells(lv, x, y);
          const hpx = cells * TS;
          ctx.save();
          // 门框接触阴影
          ctx.globalAlpha = 0.45;
          ctx.drawImage(ART.shadow, px - 6, py + hpx - 10, TS + 12, 26);
          ctx.globalAlpha = 1;
          if (!open) {
            const dg = ctx.createLinearGradient(px, py, px + TS, py + hpx);
            dg.addColorStop(0, "#2c3a56"); dg.addColorStop(0.45, "#1b2438"); dg.addColorStop(1, "#111726");
            ctx.fillStyle = dg;
            roundRect(ctx, px + 3, py + 3, TS - 6, hpx - 6, 9); ctx.fill();
            // 能量锁纹
            ctx.strokeStyle = "rgba(255,215,106,0.32)"; ctx.lineWidth = 1.6;
            for (let k = 1; k <= 3; k++) {
              const yy = py + (hpx * k) / 4;
              ctx.beginPath(); ctx.moveTo(px + 8, yy); ctx.lineTo(px + TS - 8, yy); ctx.stroke();
            }
            ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 2;
            roundRect(ctx, px + 3.5, py + 3.5, TS - 7, hpx - 7, 9); ctx.stroke();
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.55 + 0.25 * Math.sin(G.time * 4);
            const gr = 14;
            ctx.drawImage(glowSprite("#ffd76a"), px + TS / 2 - gr, py + hpx / 2 - gr, gr * 2, gr * 2);
            ctx.fillStyle = "#ffe9a3";
            ctx.beginPath(); ctx.arc(px + TS / 2, py + hpx / 2, 4, 0, 6.28); ctx.fill();
            ctx.restore();
          } else {
            const dg = ctx.createLinearGradient(0, py, 0, py + hpx);
            dg.addColorStop(0, "rgba(120,255,170,0.22)");
            dg.addColorStop(1, "rgba(120,255,170,0.06)");
            ctx.fillStyle = dg;
            roundRect(ctx, px + 3, py + 3, TS - 6, hpx - 6, 9); ctx.fill();
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = "rgba(150,255,190,0.75)";
            ctx.lineWidth = 2.2;
            roundRect(ctx, px + 3, py + 3, TS - 6, hpx - 6, 9); ctx.stroke();
            ctx.globalAlpha = 0.35;
            ctx.drawImage(glowSprite("#7dffa8"), px - 8, py - 8, TS + 16, hpx + 16);
            ctx.restore();
          }
          ctx.restore();
        }
      }
    }
  }
  function doorTop(lv, x, y) {
    let ty = y;
    while (ty > 0 && doorMap(lv).get(key(x, ty - 1))) ty--;
    return ty;
  }
  function doorCells(lv, x, y) {
    const top = doorTop(lv, x, y);
    let n = 0, ty = top;
    while (doorMap(lv).get(key(x, ty))) { n++; ty++; }
    return n;
  }

  function drawDevices(ctx, th) {
    const lv = G.level;
    // 压力板
    for (const gr of ["g", "h", "s"]) {
      for (const c of lv.plates[gr]) {
        const latched = G.latched.has(key(c.x, c.y));
        const px = c.x * TS, py = c.y * TS;
        // 接触阴影
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(ART.shadow, px + 1, py + TS - 12, TS - 2, 20);
        ctx.restore();
        // 金属底座
        ctx.save();
        const bg = cgrad("plateBase", () => {
          const g = ctx.createLinearGradient(0, py + TS - 18, 0, py + TS - 2);
          g.addColorStop(0, "#6d7c96"); g.addColorStop(0.4, "#3d4a63"); g.addColorStop(1, "#212a3d");
          return g;
        });
        ctx.fillStyle = bg;
        roundRect(ctx, px + 5, py + TS - 14, TS - 10, 12, 4); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
        roundRect(ctx, px + 5.5, py + TS - 13.5, TS - 11, 11, 4); ctx.stroke();
        ctx.restore();
        // 踩板本体
        const off = latched ? 4 : 0;
        ctx.save();
        if (latched) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.55;
          const gr2 = 24;
          ctx.drawImage(glowSprite("#ffd76a"), px + TS / 2 - gr2, py + TS - 8 - gr2, gr2 * 2, gr2 * 2);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        const cg = ctx.createLinearGradient(px, py + TS - 14 + off, px + TS, py + TS - 2 + off);
        if (latched) { cg.addColorStop(0, "#fff2c0"); cg.addColorStop(0.5, "#ffd76a"); cg.addColorStop(1, "#b98b1e"); }
        else { cg.addColorStop(0, "#aab6c9"); cg.addColorStop(0.5, "#8b97ad"); cg.addColorStop(1, "#4a5468"); }
        ctx.fillStyle = cg;
        roundRect(ctx, px + 8, py + TS - 12 + off, TS - 16, 10 - off, 3); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
        roundRect(ctx, px + 8.5, py + TS - 11.5 + off, TS - 17, 9 - off, 3); ctx.stroke();
        ctx.restore();
      }
    }
    // 节拍平台
    for (const b of lv.beats) {
      const solid = b.phase === 0 ? beatSolid(0) : beatSolid(0.5);
      const warn = b.phase === 0 ? beatWarn(0) : beatWarn(0.5);
      const px = b.x * TS, py = b.y * TS;
      const bl = 0.5 + 0.5 * Math.sin(G.time * 20);
      ctx.save();
      if (solid) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(ART.shadow, px + 1, py + TS - 12, TS - 2, 20);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.30 + 0.2 * bl;
        const gr = 24;
        ctx.drawImage(glowSprite(warn === 1 ? "#ffbe5a" : "#b28bff"), px + TS / 2 - gr, py + TS / 2 - 4 - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      if (solid) {
        const g = ctx.createLinearGradient(px, py + 6, px, py + TS - 8);
        if (warn === 1) {
          g.addColorStop(0, `rgba(255,240,200,${0.85 + 0.15 * bl})`);
          g.addColorStop(0.5, `rgba(255,190,90,${0.8 + 0.2 * bl})`);
          g.addColorStop(1, "rgba(150,95,20,0.95)");
        } else {
          g.addColorStop(0, "#e6dcff"); g.addColorStop(0.45, "#b28bff"); g.addColorStop(1, "#4d3585");
        }
        ctx.fillStyle = g;
        roundRect(ctx, px + 2, py + 6, TS - 4, TS - 14, 7); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2;
        roundRect(ctx, px + 2.6, py + 6.6, TS - 5.2, TS - 15.2, 7); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(px + 5, py + 8.5, TS - 10, 2.6);
        // 内部能量纹理
        ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
        for (let k = 1; k <= 2; k++) {
          const yy = py + 6 + ((TS - 14) * k) / 3;
          ctx.beginPath(); ctx.moveTo(px + 6, yy); ctx.lineTo(px + TS - 6, yy); ctx.stroke();
        }
      } else {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = warn === -1 ? `rgba(178,139,255,${0.5 + 0.5 * bl})` : "rgba(178,139,255,0.32)";
        ctx.lineWidth = 2;
        roundRect(ctx, px + 2, py + 6, TS - 4, TS - 14, 7); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(178,139,255,${0.06 + 0.06 * bl})`;
        roundRect(ctx, px + 2, py + 6, TS - 4, TS - 14, 7); ctx.fill();
      }
      ctx.restore();
      // 相位环
      const bk = lv.beat;
      if (bk) {
        const ph = ((G.time / bk.period) + b.phase) % 1;
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(178,139,255,0.25)";
        ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2 - 2, 15, 0, 6.28); ctx.stroke();
        ctx.strokeStyle = "rgba(214,190,255,0.85)";
        ctx.beginPath();
        ctx.arc(px + TS / 2, py + TS / 2 - 2, 15, -Math.PI / 2, -Math.PI / 2 + (1 - ph) * 6.28);
        ctx.stroke();
        ctx.restore();
      }
    }
    // 传送门
    for (const p of lv.portals) {
      drawPortal(ctx, p.in, "#9fe8ff", true);
      drawPortal(ctx, p.out, "#9fe8ff", false);
    }
    // 棱镜平台 j
    for (const p of lv.pads) {
      const px = p.x * TS, py = p.y * TS;
      const on = G.prismHeld;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(ART.shadow, px + 1, py + TS - 12, TS - 2, 20);
      ctx.globalAlpha = 1;
      if (on) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55;
        const gr = 30;
        ctx.drawImage(glowSprite("#8ff7ff"), px + TS / 2 - gr, py + TS / 2 - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      // 三棱镜台体
      const g = ctx.createLinearGradient(px + 8, py + 10, px + TS - 12, py + TS - 12);
      if (on) { g.addColorStop(0, "#e8ffff"); g.addColorStop(0.5, "#8ff7ff"); g.addColorStop(1, "#2f7f9c"); }
      else { g.addColorStop(0, "#93a6c4"); g.addColorStop(0.5, "#5d7ba6"); g.addColorStop(1, "#2b3b52"); }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px + TS / 2, py + 10); ctx.lineTo(px + TS - 12, py + TS - 12); ctx.lineTo(px + 12, py + TS - 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + TS / 2, py + 10); ctx.lineTo(px + TS / 2, py + TS - 12);
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.stroke();
      ctx.restore();
    }
    // 折光镜 / q
    for (const m of lv.mirrors) drawMirror(ctx, m.x, m.y, m.o === "/", "#cfe8ff");
    for (const m of lv.switchMirrors) drawMirror(ctx, m.x, m.y, !!G.prismHeld, G.prismHeld ? "#8ff7ff" : "#5d7ba6");
    // 发射器
    for (const em of lv.emitters) {
      const px = em.x * TS, py = em.y * TS;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(ART.shadow, px + 4, py + TS - 14, TS - 8, 18);
      ctx.restore();
      ctx.drawImage(ART.emitter, px, py, TS, TS);
      // 镜片座 + 光口
      const lx = em.dir > 0 ? px + TS - 9 : px + 9;
      const ly = py + TS / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85;
      const gr = 17 + 3 * Math.sin(G.time * 5);
      ctx.drawImage(glowSprite("#ffd76a"), lx - gr, ly - gr, gr * 2, gr * 2);
      ctx.fillStyle = "#fff6d8";
      roundRect(ctx, lx - 4.5, ly - 4.5, 9, 9, 2.5); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.2;
      roundRect(ctx, lx - 4.5, ly - 4.5, 9, 9, 2.5); ctx.stroke();
      ctx.restore();
    }
    // 接收水晶
    for (const r of lv.receivers) {
      const lit = G.receiverLit.has(key(r.x, r.y));
      const px = r.x * TS + TS / 2, py = r.y * TS + TS / 2;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(ART.shadow, px - 16, py + 14, 32, 14);
      ctx.restore();
      if (lit) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.6;
        const gr = 34 + 4 * Math.sin(G.time * 3);
        ctx.drawImage(glowSprite("#8ff7ff"), px - gr, py - gr, gr * 2, gr * 2);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(G.time * (lit ? 1.1 : 0.5));
      if (lit) { ctx.shadowColor = "#8ff7ff"; ctx.shadowBlur = 16; }
      const cg2 = ctx.createLinearGradient(-9, -13, 9, 13);
      if (lit) { cg2.addColorStop(0, "#ffffff"); cg2.addColorStop(0.45, "#aef4ff"); cg2.addColorStop(1, "#2b8fb5"); }
      else { cg2.addColorStop(0, "rgba(200,220,245,0.6)"); cg2.addColorStop(0.5, "rgba(160,190,220,0.35)"); cg2.addColorStop(1, "rgba(90,120,155,0.3)"); }
      ctx.fillStyle = cg2;
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(9.5, 0); ctx.lineTo(0, 14); ctx.lineTo(-9.5, 0);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = lit ? "rgba(255,255,255,0.85)" : "rgba(220,235,255,0.35)";
      ctx.lineWidth = 1.1; ctx.stroke();
      // 宝石切面
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(4.6, 0); ctx.lineTo(0, 14);
      ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.stroke();
      ctx.restore();
      if (lit) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.time * 4);
        const sr = 22 + 4 * Math.sin(G.time * 5);
        ctx.drawImage(ART.spark, px - sr, py - sr, sr * 2, sr * 2);
        ctx.restore();
      }
    }
  }
  function drawMirror(ctx, tx, ty, active, color) {
    const px = tx * TS, py = ty * TS;
    ctx.save();
    // 镜面玻璃板
    const g = ctx.createLinearGradient(px + 8, py + 8, px + TS - 8, py + TS - 8);
    g.addColorStop(0, withA(color, 0.30));
    g.addColorStop(0.5, withA(color, 0.12));
    g.addColorStop(1, withA(color, 0.03));
    ctx.fillStyle = g;
    ctx.fillRect(px + 3, py + 3, TS - 6, TS - 6);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = active ? 0.5 : 0.22;
    const gr = 30;
    ctx.drawImage(glowSprite(color), px + TS / 2 - gr, py + TS / 2 - gr, gr * 2, gr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // 镜面本体（粗描边 + 细亮芯）
    ctx.lineCap = "round";
    const x1 = active ? px + 8 : px + 8, y1 = active ? py + TS - 8 : py + 8;
    const x2 = active ? px + TS - 8 : px + TS - 8, y2 = active ? py + 8 : py + TS - 8;
    ctx.strokeStyle = withA(color, 0.85); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // 端点反光
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath(); ctx.arc(x1, y1, 2.4, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, 2.4, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawPortal(ctx, cell, color, isIn) {
    const px = cell.x * TS + TS / 2, py = cell.y * TS + TS / 2;
    ctx.save();
    ctx.translate(px, py);
    const r = 15 + Math.sin(G.time * 3 + (isIn ? 0 : 2)) * 2;
    // 内芯旋涡
    const vg = cgrad("portalCore", () => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.4, withA(color, 0.30));
      g.addColorStop(1, withA(color, 0));
      return g;
    });
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = isIn ? 0.9 : 0.45;
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, 6.28); ctx.fill();
    const gr = r * 2.1;
    ctx.globalAlpha = isIn ? 0.55 : 0.28;
    ctx.drawImage(glowSprite(color), -gr, -gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = "source-over";
    // 多层门框
    ctx.globalAlpha = isIn ? 0.95 : 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.55, G.time * (isIn ? 2 : -2), 0, 6.28); ctx.stroke();
    ctx.restore();
  }

  function drawBeams(ctx) {
    if (!G.beamPaths) return;
    const t = G.time;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pts of G.beamPaths) {
      if (pts.length < 2) continue;
      // 世界坐标折线
      const wp = pts.map((p) => ({ x: p.x * TS, y: p.y * TS }));
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(wp[0].x, wp[0].y);
        for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x, wp[i].y);
      };
      // ---- 多层叠加辉光：宽淡外晕 → 中芯 → 极亮细芯 ----
      ctx.globalCompositeOperation = "lighter";
      path(); ctx.strokeStyle = "rgba(90,205,255,0.10)"; ctx.lineWidth = 26; ctx.stroke();
      path(); ctx.strokeStyle = "rgba(120,225,255,0.16)"; ctx.lineWidth = 15; ctx.stroke();
      path(); ctx.strokeStyle = "rgba(165,240,255,0.34)"; ctx.lineWidth = 7.5; ctx.stroke();
      path(); ctx.strokeStyle = "rgba(220,252,255,0.72)"; ctx.lineWidth = 3.4; ctx.stroke();
      path(); ctx.strokeStyle = "rgba(255,255,255,0.98)"; ctx.lineWidth = 1.4; ctx.stroke();
      // ---- 流动的光点粒子 ----
      const dashLen = 3, gapLen = 15;
      ctx.save();
      ctx.setLineDash([dashLen, gapLen]);
      ctx.lineDashOffset = -t * 110;
      path(); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.lineDashOffset = -t * 110 + 9;
      path(); ctx.strokeStyle = "rgba(190,245,255,0.55)"; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";

      // ---- 反射点星芒（折角处的高光） ----
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < wp.length - 1; i++) {
        const p = wp[i];
        // 只有方向变化的顶点才是反射点
        const a0 = Math.atan2(p.y - wp[i - 1].y, p.x - wp[i - 1].x);
        const a1 = Math.atan2(wp[i + 1].y - p.y, wp[i + 1].x - p.x);
        if (Math.abs(a0 - a1) < 0.05) continue;
        const tw = 0.75 + 0.25 * Math.sin(t * 6 + i);
        const sr = 20 * tw;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(ART.spark, p.x - sr, p.y - sr, sr * 2, sr * 2);
        const gr = 26 * tw;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(glowSprite("#bfefff"), p.x - gr, p.y - gr, gr * 2, gr * 2);
      }
      // 端点（发射器 / 接收器）光斑
      for (const p of [wp[0], wp[wp.length - 1]]) {
        const gr = 16 + 3 * Math.sin(t * 5);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(glowSprite("#dffaff"), p.x - gr, p.y - gr, gr * 2, gr * 2);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawShardsAndGates(ctx, th) {
    const lv = G.level;
    // 碎片
    for (const id of Object.keys(lv.shards)) {
      if (G.shardsGot.has(id)) continue;
      for (const c of lv.shards[id]) {
        const px = c.x * TS + TS / 2, py = c.y * TS + TS / 2 + Math.sin(G.time * 2.4 + c.x) * 4;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55 + 0.2 * Math.sin(G.time * 3 + c.x);
        const hg = 30 + 3 * Math.sin(G.time * 2.6 + c.x);
        ctx.drawImage(glowSprite("#ffd76a"), px - hg, py - hg, hg * 2, hg * 2);
        ctx.restore();
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.sin(G.time * 1.3 + c.x * 0.7) * 0.35);
        ctx.shadowColor = "#ffe9a3"; ctx.shadowBlur = 14;
        const grd = ctx.createLinearGradient(-10, -10, 10, 10);
        grd.addColorStop(0, "#fff8dc"); grd.addColorStop(0.45, "#ffe08a"); grd.addColorStop(1, "#e0a020");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(-8, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // 检查点
    for (const c of lv.checkpoints) {
      const active = G.chars.some((ch) => ch.lastCp === key(c.x, c.y));
      const px = c.x * TS + TS / 2, py = c.y * TS + TS;
      ctx.save();
      // 旗杆 + 底座阴影
      ctx.globalAlpha = 0.45;
      ctx.drawImage(ART.shadow, px - 14, py - 8, 28, 14);
      ctx.globalAlpha = 1;
      if (active) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45;
        const gr = 26 + 4 * Math.sin(G.time * 3);
        ctx.drawImage(glowSprite("#ffe9a3"), px - gr, py - 26 - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      const pole = ctx.createLinearGradient(px - 1.5, 0, px + 1.5, 0);
      pole.addColorStop(0, active ? "#8a6a1e" : "#5c6577");
      pole.addColorStop(0.5, active ? "#ffe9a3" : "rgba(200,210,230,0.7)");
      pole.addColorStop(1, active ? "#8a6a1e" : "#4a5263");
      ctx.fillStyle = pole;
      ctx.fillRect(px - 1.5, py - 28, 3, 28);
      const fg = ctx.createLinearGradient(px, py - 26, px + 16, py - 14);
      if (active) { fg.addColorStop(0, "#fff4c8"); fg.addColorStop(1, "#ffbf3d"); }
      else { fg.addColorStop(0, "rgba(215,225,240,0.55)"); fg.addColorStop(1, "rgba(140,155,180,0.35)"); }
      ctx.fillStyle = fg;
      const wob = active ? Math.sin(G.time * 4) * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(px + 1.5, py - 27);
      ctx.quadraticCurveTo(px + 9, py - 24 + wob, px + 16, py - 20);
      ctx.quadraticCurveTo(px + 9, py - 17 + wob, px + 1.5, py - 14);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    // 镜像之门
    for (const e of lv.exits) {
      const occupied = G.chars.some((ch) => !ch.dead && overlapsCell(ch, e, 10));
      const px = e.x * TS, py = e.y * TS;
      ctx.save();
      // 门内能量场
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = occupied ? 0.75 : 0.4;
      const gr = occupied ? 44 : 32;
      ctx.drawImage(glowSprite(occupied ? "#ffe9a3" : "#7fb4ff"), px + TS / 2 - gr, py + TS / 2 - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const grd = ctx.createLinearGradient(px, py, px, py - TS);
      if (occupied) { grd.addColorStop(0, "rgba(255,233,163,0.48)"); grd.addColorStop(0.55, "rgba(255,255,255,0.22)"); grd.addColorStop(1, "rgba(255,255,255,0.10)"); }
      else { grd.addColorStop(0, "rgba(31,162,255,0.22)"); grd.addColorStop(0.5, "rgba(255,255,255,0.10)"); grd.addColorStop(1, "rgba(255,138,61,0.18)"); }
      ctx.fillStyle = grd;
      roundRect(ctx, px + 2, py - 4, TS - 4, TS + 4, 11); ctx.fill();
      // 门框（亮边 + 内侧描边）
      ctx.strokeStyle = occupied ? "rgba(255,240,190,0.95)" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2.5;
      roundRect(ctx, px + 2, py - 4, TS - 4, TS + 4, 11); ctx.stroke();
      ctx.strokeStyle = occupied ? "rgba(255,255,255,0.5)" : "rgba(160,200,255,0.35)";
      ctx.lineWidth = 1;
      roundRect(ctx, px + 4, py - 2, TS - 8, TS, 9); ctx.stroke();
      // 上下跑动的能量线
      if (occupied) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.4;
        const ly = py + ((G.time * 70) % (TS + 8));
        ctx.beginPath(); ctx.moveTo(px + 6, ly); ctx.lineTo(px + TS - 6, ly); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      // 双色纹章
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#1FA2FF";
      ctx.beginPath(); ctx.arc(px + TS / 2 - 6, py + TS / 2, 3.2, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#FF8A3D";
      ctx.beginPath(); ctx.arc(px + TS / 2 + 6, py + TS / 2, 3.2, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(ART.spark, px + TS / 2 - 20, py + TS / 2 - 20, 40, 40);
      ctx.restore();
      ctx.restore();
    }
  }

  function drawChars(ctx, th) {
    for (let i = 0; i < 2; i++) {
      const ch = G.chars[i];
      if (!ch) continue;
      const color = i === 0 ? "#1FA2FF" : "#FF8A3D";
      const lite = i === 0 ? "#7fd0ff" : "#ffc39a";
      // 拖尾
      if (!G.settings.reduce && !ch.dead) {
        for (const t of G.trails[i]) {
          const a = Math.max(0, 1 - t.t * 2.2);
          if (a <= 0) continue;
          ctx.globalAlpha = a * 0.16;
          ctx.fillStyle = color;
          roundRect(ctx, t.x + 4, t.y + 4, CW - 8, CH - 8, 12); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (ch.dead) continue;
      const gy = ch.gravityDir > 0 ? ch.y + CH : ch.y;
      // 脚下软阴影（接触阴影）
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.translate(ch.x + CW / 2, gy + 3);
      ctx.scale(1, 0.42);
      ctx.drawImage(ART.shadow, -26, -26, 52, 52);
      ctx.restore();
      ctx.save();
      const cx = ch.x + CW / 2, cy = ch.y + CH / 2;
      // 走动起伏（仅在地面且水平移动时）
      const speed = Math.min(1, Math.abs(ch.vx) / SPEED);
      const bob = ch.onGround ? Math.sin(ch.x * 0.085) * 2.0 * speed : 0;
      ctx.translate(cx, cy + bob);
      if (ch.gravityDir < 0) ctx.scale(1, -1);
      ctx.rotate(Math.max(-0.12, Math.min(0.12, (ch.vx / SPEED) * 0.09)));
      const sq = ch.squash * 0.25, st = ch.stretch * 0.22;
      const w = CW * (1 + sq - st), h = CH * (1 - sq + st);
      // 主题色外发光
      glowAt(ctx, color, 0, 1, Math.max(w, h) * 1.05, 0.55);
      // 轮廓描边（深色外形，让角色从背景里跳出来）
      ctx.fillStyle = i === 0 ? "#0a2f4d" : "#5a2508";
      roundRect(ctx, -w / 2 - 2.4, -h / 2 - 2.4, w + 4.8, h + 4.8, 15.4); ctx.fill();
      // 身体：斜向渐变
      const grd = ctx.createLinearGradient(-w * 0.35, -h * 0.55, w * 0.35, h * 0.55);
      grd.addColorStop(0, lite); grd.addColorStop(0.42, color); grd.addColorStop(1, shade(color, -0.45));
      ctx.fillStyle = grd;
      roundRect(ctx, -w / 2, -h / 2, w, h, 13); ctx.fill();
      // 受光面高光 / 底部反射光
      ctx.save();
      roundRect(ctx, -w / 2, -h / 2, w, h, 13); ctx.clip();
      const hl = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.1, h * 0.15);
      hl.addColorStop(0, "rgba(255,255,255,0.46)");
      hl.addColorStop(0.5, "rgba(255,255,255,0.06)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl; ctx.fillRect(-w / 2, -h / 2, w, h);
      const rl = ctx.createLinearGradient(0, h * 0.2, 0, h / 2);
      rl.addColorStop(0, "rgba(255,255,255,0)");
      rl.addColorStop(1, "rgba(255,255,255,0.18)");
      ctx.fillStyle = rl; ctx.fillRect(-w / 2, 0, w, h / 2);
      ctx.restore();
      // 1px 菲涅尔边缘
      ctx.strokeStyle = withA(lite, 0.6); ctx.lineWidth = 1.2;
      roundRect(ctx, -w / 2 + 0.9, -h / 2 + 0.9, w - 1.8, h - 1.8, 12.3); ctx.stroke();
      // 朝向细节：背向的披风飘带
      ctx.save();
      ctx.strokeStyle = withA(lite, 0.85);
      ctx.lineWidth = 2.2; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-ch.face * (w * 0.42), -h * 0.14);
      ctx.quadraticCurveTo(
        -ch.face * (w * 0.42 + 7), h * 0.02 - bob * 0.5,
        -ch.face * (w * 0.42 + 4.5), h * 0.3
      );
      ctx.stroke();
      ctx.restore();
      // 眼睛
      const look = ch.face * 4;
      const blinkNow = (ch.blink % 3.4) > 3.25;
      ctx.fillStyle = "#0b1222";
      if (!blinkNow) {
        ctx.beginPath(); ctx.ellipse(-6 + look, -8, 3.4, 4.6, 0, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(7 + look, -8, 3.4, 4.6, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(-5 + look, -9.5, 1.2, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(8 + look, -9.5, 1.2, 0, 6.28); ctx.fill();
      } else {
        ctx.strokeStyle = "#0b1222"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9 + look, -8); ctx.lineTo(-3 + look, -8);
        ctx.moveTo(4 + look, -8); ctx.lineTo(10 + look, -8); ctx.stroke();
      }
      // 腮红
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath(); ctx.arc(-10 + look * 0.5, 0, 2.2, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(11 + look * 0.5, 0, 2.2, 0, 6.28); ctx.fill();
      // 天线
      ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.quadraticCurveTo(3 * ch.face, -h / 2 - 7, 6 * ch.face, -h / 2 - 9);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ar = 9;
      ctx.drawImage(glowSprite(color), 6 * ch.face - ar, -h / 2 - 10 - ar, ar * 2, ar * 2);
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(6 * ch.face, -h / 2 - 10, 2.6, 0, 6.28); ctx.fill();
      // 形状徽章（色盲双编码：左=圆 右=三角）
      if (G.settings.shapes) {
        const by = -h / 2 - (G.settings.shapes ? 0 : 0) - 20;
        if (i === 0) {
          ctx.strokeStyle = color; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(0, -h / 2 - 14, 5.4, 0, 6.28); ctx.stroke();
        } else {
          ctx.strokeStyle = color; ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(0, -h / 2 - 20); ctx.lineTo(5.4, -h / 2 - 10); ctx.lineTo(-5.4, -h / 2 - 10);
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    // 先画发光类（叠加混合），再画碎片，最后画实心点
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.type === "ring") {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a * 0.9;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - a) * 40, 0, 6.28);
        ctx.stroke();
      } else if (p.type === "dot") {
        const r = p.size * (1.4 + 1.6 * (1 - a));
        ctx.globalAlpha = a * 0.85;
        ctx.drawImage(ART.mote, p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.type === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 0.35, p.size * 0.6);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 前景浮尘（世界之上，营造景深） ---------- */
  function drawForegroundDust(ctx, vw, vh) {
    if (G.settings.reduce || !ART.amb.length) return;
    const t = G.time;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of ART.amb) {
      if (m.z <= 0.86) continue;
      const y = (((m.y - t * m.sp * m.z) % vh) + vh) % vh;
      const x = (((m.x + Math.sin(t * 0.3 + m.ph) * 30 * m.z - G.cam.x * 0.14 * m.z) % vw) + vw) % vw;
      ctx.globalAlpha = m.a * 0.75 * (0.55 + 0.45 * Math.sin(t * 0.9 + m.ph));
      const r = m.r * 6;
      ctx.drawImage(ART.mote, x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 音效转发（带声像） ---------- */
  function forward(n) { return (...a) => MMAudio.play(n, a[0] || 0); }

  window.MMGame = {
    get canvas() { return G.canvas; },
    init(canvas) { G.canvas = canvas; G.ctx = canvas.getContext("2d"); },
    startLevel, restart, undo,
    stop() { G.state = "idle"; },
    pause() { G.state = G.state === "won" ? "won" : "paused"; },
    resume() { if (G.state === "paused") { G.state = "playing"; G._last = performance.now(); } },
    get state() { return G.state; },
    get mode() { return G.mode; },
    get levelIdx() { return G.levelIdx; },
    get steps() { return G.steps; },
    get time() { return G.time; },
    get canUndo() { return G.undoStack.length > 0; },
    get shardSet() { return G.shardsGot; },
    onResize() { resize(); },
    // 调试/自动化冒烟：手动推进固定步长模拟（输入序列回放的基础）
    debugStep(frames) { for (let i = 0; i < frames; i++) fixedStep(1 / 60); },
    debugChars() { return G.chars.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), side: c.side, dead: c.dead, g: c.gravityDir, og: c.onGround, jb: +c.jumpBuf.toFixed(2) })); },
    debugKill() { return G.lastKill || null; },
    debugInfo() { return { state: G.state, mode: G.mode, steps: G.steps, time: +G.time.toFixed(2), shards: [...G.shardsGot] }; },
    setSettings(s) { Object.assign(G.settings, s); },
    set onEvent(fn) { G.onEvent = fn; },
    MODE_NAME,
    sfxJump: forward("jump"), sfxLand: forward("land"), sfxDeath: forward("death"),
    sfxShard: forward("shard"), sfxPortal: forward("portal"), sfxPlate: forward("plate"),
    sfxDoor: forward("door"), sfxCheckpoint: forward("checkpoint"), sfxBeam: forward("beam"),
    sfxBreak: forward("breakMirror"), sfxWin: forward("win"), sfxUI: forward("ui"),
    footstep: forward("step"),
    // 节拍器：accent = 重拍
    sfxBeat(accent) { MMAudio.play("beatTick", accent, 0); },
  };
})();
