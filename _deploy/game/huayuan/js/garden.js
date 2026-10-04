/* ============================================================
   情绪花园 — 花园场景
   天空（昼夜/四季/天气）、地块网格、植物绘制、粒子氛围、
   命中检测。数据全部来自 EG.G。
   ============================================================ */
window.EG = window.EG || {};

EG.Garden = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  plotRects: [], size: 4,
  mode: 'view',            // view | plant | care | harvest
  selectedPlant: null,     // 照料面板当前植物 id
  pendingSeed: null,       // 待播种的情绪
  hoverPlot: -1,
  particles: [], floats: [],
  stars: [], clouds: [],
  decorPlants: [],
  lowQuality: false, _slow: 0,
  onClick: null,           // (plotIdx) => void
  t0: performance.now(),

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const rnd = EG.RNG('stars');
    for (let i = 0; i < 90; i++) this.stars.push({ x: rnd(), y: rnd() * 0.55, r: 0.5 + rnd() * 1.1, tw: rnd() * 6 });
    for (let i = 0; i < 7; i++) this.clouds.push({ x: rnd(), y: 0.05 + rnd() * 0.2, s: 0.55 + rnd() * 0.95, v: 0.004 + rnd() * 0.007, o: 0.5 + rnd() * 0.4, ph: rnd() * 6 });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const idx = this.plotAt(x, y);
      if (this.onClick) this.onClick(idx, x, y);
    });
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.hoverPlot = this.plotAt(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = this.hoverPlot >= 0 ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => this.hoverPlot = -1);
    this._makeGrain();
    this._makeTextures();
    this._makeDecorPlants();
  },

  _makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 140;
    const g = c.getContext('2d');
    const img = g.createImageData(140, 140);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 245 + Math.floor(Math.random() * 10) - 5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 26;
    }
    g.putImageData(img, 0, 0);
    const el = document.getElementById('grain');
    if (el) el.style.background = `url(${c.toDataURL()})`;
  },

  /* ---------- 预生成纹理（只做一次，之后 createPattern 平铺） ---------- */
  _makeTextures() {
    const ctx = this.ctx;
    /* 泥土：基色 + 多层深浅斑块 + 颗粒噪点 + 小石子 */
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d');
    sg.fillStyle = '#7d5f42'; sg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 128, y = Math.random() * 128, r = 3 + Math.random() * 12;
      const dark = Math.random() < 0.55;
      const gg = sg.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, dark ? 'rgba(56,38,24,.45)' : 'rgba(163,131,96,.40)');
      gg.addColorStop(1, dark ? 'rgba(56,38,24,0)' : 'rgba(163,131,96,0)');
      sg.fillStyle = gg; sg.beginPath(); sg.arc(x, y, r, 0, 6.3); sg.fill();
    }
    const simg = sg.getImageData(0, 0, 128, 128);
    for (let i = 0; i < simg.data.length; i += 4) {
      const n = (Math.random() * 2 - 1) * 13;
      simg.data[i] = EG.clamp(simg.data[i] + n, 0, 255);
      simg.data[i + 1] = EG.clamp(simg.data[i + 1] + n, 0, 255);
      simg.data[i + 2] = EG.clamp(simg.data[i + 2] + n, 0, 255);
    }
    sg.putImageData(simg, 0, 0);
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 128, y = Math.random() * 128, r = 0.8 + Math.random() * 1.7;
      sg.fillStyle = 'rgba(200,180,152,.45)'; sg.beginPath(); sg.arc(x, y, r, 0, 6.3); sg.fill();
      sg.fillStyle = 'rgba(38,26,16,.35)'; sg.beginPath(); sg.arc(x + r * 0.45, y + r * 0.5, r * 0.85, 0, 6.3); sg.fill();
    }
    this.soilPat = ctx.createPattern(sc, 'repeat');
    /* 草地：多层深浅斑块 + 细密草叶噪点 */
    const gc = document.createElement('canvas'); gc.width = gc.height = 160;
    const gg2 = gc.getContext('2d');
    gg2.fillStyle = '#84a95f'; gg2.fillRect(0, 0, 160, 160);
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * 160, y = Math.random() * 160, r = 4 + Math.random() * 16;
      const dark = Math.random() < 0.5;
      const g3 = gg2.createRadialGradient(x, y, 0, x, y, r);
      g3.addColorStop(0, dark ? 'rgba(58,86,44,.34)' : 'rgba(200,222,152,.30)');
      g3.addColorStop(1, dark ? 'rgba(58,86,44,0)' : 'rgba(200,222,152,0)');
      gg2.fillStyle = g3; gg2.beginPath(); gg2.arc(x, y, r, 0, 6.3); gg2.fill();
    }
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 160, y = Math.random() * 160, l = 2 + Math.random() * 4;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
      gg2.strokeStyle = Math.random() < 0.5 ? 'rgba(70,104,48,.30)' : 'rgba(186,214,140,.28)';
      gg2.lineWidth = 0.8;
      gg2.beginPath(); gg2.moveTo(x, y); gg2.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); gg2.stroke();
    }
    this.grassPat = ctx.createPattern(gc, 'repeat');
    /* 柔光点（粒子/光斑通用，避免逐帧建径向渐变） */
    const mk = (r, g, b) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g2 = c.getContext('2d');
      const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(0.35, `rgba(${r},${g},${b},.42)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      return c;
    };
    this.dotWarm = mk(255, 244, 198);
    this.dotPink = mk(255, 214, 224);
    this.dotCool = mk(206, 238, 214);
    /* 云朵精灵：多层柔团 + 顶部受光 + 底部阴影 */
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 128;
    const cg = cc.getContext('2d');
    const blob = (x, y, rx, ry, top, bot, a) => {
      const gr = cg.createLinearGradient(x, y - ry, x, y + ry);
      gr.addColorStop(0, `rgba(${top},${a})`);
      gr.addColorStop(0.55, `rgba(${bot},${a * 0.92})`);
      gr.addColorStop(1, `rgba(${bot},0)`);
      cg.fillStyle = gr;
      cg.beginPath(); cg.ellipse(x, y, rx, ry, 0, 0, 6.3); cg.fill();
    };
    blob(72, 74, 52, 26, '255,255,255', '228,232,238', 0.95);
    blob(128, 62, 62, 32, '255,255,255', '224,229,236', 0.98);
    blob(186, 76, 46, 23, '255,255,255', '230,234,240', 0.9);
    blob(128, 88, 88, 20, '250,250,252', '214,220,230', 0.75);
    this.cloudTex = cc;
  },

  /* 装饰植物：纯表现层，用固定种子生成，不写入存档、不影响玩法 */
  _makeDecorPlants() {
    const rnd = EG.RNG('decor-garden-v2');
    const specs = ['joy_daisy', 'calm_mint', 'sad_forget', 'anx_mimosa', 'att_star', 'calm_sage',
      'joy_bell', 'att_lily', 'sad_iris', 'anx_vine', 'joy_tulip', 'calm_lily'];
    this.decorPlants = specs.map((sp, i) => ({
      species: sp, seed: 'deco' + i + Math.round(rnd() * 1e6), variant: rnd() < 0.25 ? (rnd() < 0.5 ? 1 : 2) : 0,
      side: i % 2, col: Math.floor(i / 2) % 3, row: Math.floor(i / 2) % 2,
      jx: (rnd() - 0.5) * 26, jy: rnd() * 34, wind: 0.32 + rnd() * 0.36, ph: rnd() * 6.28,
    }));
  },


  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
  },

  layout() {
    const N = (EG.G && EG.G.grid.size) || 4;
    this.size = N;
    this.plotRects = [];
    const W = this.W, H = this.H;
    const groundTop = H * 0.30;
    const gridW = Math.min(W * 0.9, 880);
    const cell = gridW / N;
    const cellH = cell * 0.84;
    const gridH = cellH * N;
    const x0 = (W - gridW) / 2;
    const y0 = groundTop + Math.max(14, (H - groundTop - gridH) / 2) - H * 0.02;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      this.plotRects[i] = {
        x: x0 + c * cell + 3, y: y0 + r * cellH + 3,
        w: cell - 6, h: cellH - 6,
        cx: x0 + c * cell + cell / 2, cy: y0 + r * cellH + cellH * 0.72,
        scale: EG.clamp(cell / 96, 0.55, 1.05),
      };
    }
  },

  plotAt(x, y) {
    for (let i = 0; i < this.plotRects.length; i++) {
      const r = this.plotRects[i]; if (!r) continue;
      if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 6) return i;
    }
    return -1;
  },

  plotOfPlant(pid) {
    const p = EG.G.plants[pid]; if (!p) return -1;
    return p.plot;
  },

  /* ---------- 浮动文字与特效 ---------- */
  floatText(plotIdx, text, color = '#fff') {
    const r = this.plotRects[plotIdx]; if (!r) return;
    this.floats.push({ x: r.cx, y: r.cy - 40 * r.scale, text, color, t: 0 });
    if (this.floats.length > 12) this.floats.shift();
  },
  bloomFx(plotIdx) {
    const r = this.plotRects[plotIdx]; if (!r) return;
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8;
      this.particles.push({
        type: 'burst', x: r.cx, y: r.cy - 46 * r.scale,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, life: 1, dec: 0.012 + Math.random() * 0.01,
        hue: 30 + Math.random() * 60, size: 2 + Math.random() * 3,
      });
    }
  },
  plantFx(plotIdx) {
    const r = this.plotRects[plotIdx]; if (!r) return;
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        type: 'soil', x: r.cx + (Math.random() - 0.5) * 20 * r.scale, y: r.cy,
        vx: (Math.random() - 0.5) * 0.8, vy: -0.8 - Math.random(), life: 1, dec: 0.03,
        hue: 28, size: 1.5 + Math.random() * 2,
      });
    }
  },

  /* ---------- 主渲染 ---------- */
  render(now) {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!EG.G) return;
    const time = (now - this.t0) / 1000;
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = this.nightFactor(hour);
    const season = EG.season();
    const eco = EG.G.eco;
    const ev = EG.activeEvents();

    /* 天空 */
    this.drawSky(ctx, W, H, hour, night, season, ev);

    /* 远山与草地 */
    this.drawGround(ctx, W, H, season, eco, night, time);

    /* 装饰 */
    this.drawDecorPlants(ctx, time, night);
    this.drawDecor(ctx, H, time, night, ev);

    /* 地块 */
    const wind = 0.35 + (eco.hum > 70 ? 0.25 : 0) + (ev.some(e => e.id === 'ev_drought') ? 0.15 : 0);
    this.drawPlots(ctx, time);

    /* 植物 */
    let qi = 0;
    for (const id in EG.G.plants) {
      const pl = EG.G.plants[id];
      const rect = this.plotRects[pl.plot];
      if (!rect) continue;
      this.drawPlant(ctx, pl, rect, time, wind);
      qi++;
    }

    /* 粒子 */
    this.updateParticles(ctx, H, time, night, ev, eco);

    /* 浮字 */
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += 0.016;
      if (f.t > 1.6) { this.floats.splice(i, 1); continue; }
      ctx.globalAlpha = EG.clamp(1.4 - f.t, 0, 1);
      ctx.font = '600 15px "Source Han Sans SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - f.t * 34);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 34);
      ctx.globalAlpha = 1;
    }

    /* 模式提示圈 */
    this.drawHighlights(ctx, time);

    /* 夜色层 */
    if (night > 0.05) {
      ctx.fillStyle = `rgba(24,34,58,${night * 0.34})`;
      ctx.fillRect(0, 0, W, H);
    }

    /* 后期：极轻的暖色分级 + 一点点角落柔光（不做厚重暗角） */
    this.drawPostFx(ctx, W, H, night);
  },

  /* 后期处理：暖色分级 + 一点点四周柔光（不做厚重暗角，保持治愈感）
     只用两遍普通混合，避免整屏 blend-mode 带来的填充开销 */
  drawPostFx(ctx, W, H, night) {
    if (EG.G.settings.lowFx || this.lowQuality) return;
    /* 1) 暖色分级（上暖下润，像被夕阳洗过一层） */
    const wg = ctx.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, `rgba(255,238,198,${0.10 - night * 0.06})`);
    wg.addColorStop(0.45, `rgba(255,250,228,${0.055 - night * 0.04})`);
    wg.addColorStop(1, `rgba(226,196,148,${0.075 - night * 0.06})`);
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    /* 2) 极轻的暖色收边（透明度 < 0.06） */
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.44, W * 0.5, H * 0.48, Math.max(W, H) * 0.76);
    vg.addColorStop(0, 'rgba(96,78,50,0)');
    vg.addColorStop(1, `rgba(96,78,50,${0.05 + night * 0.035})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  },

  nightFactor(hour) {
    if (hour >= 20 || hour < 5) return 1;
    if (hour >= 18.5) return (hour - 18.5) / 1.5;
    if (hour < 7) return 1 - (hour - 5) / 2;
    return 0;
  },

  drawSky(ctx, W, H, hour, night, season, ev) {
    const phases = [
      { h: 0, top: [43, 58, 82], bot: [74, 91, 116] },
      { h: 5.5, top: [122, 138, 172], bot: [240, 198, 158] },
      { h: 8, top: [176, 216, 232], bot: [232, 240, 222] },
      { h: 15, top: [168, 210, 230], bot: [236, 240, 224] },
      { h: 18.5, top: [138, 148, 186], bot: [242, 182, 138] },
      { h: 20.5, top: [43, 58, 82], bot: [74, 91, 116] },
      { h: 24, top: [43, 58, 82], bot: [74, 91, 116] },
    ];
    let a = phases[0], b = phases[phases.length - 1];
    for (let i = 0; i < phases.length - 1; i++) {
      if (hour >= phases[i].h && hour <= phases[i + 1].h) { a = phases[i]; b = phases[i + 1]; break; }
    }
    const t = EG.clamp((hour - a.h) / Math.max(0.01, b.h - a.h), 0, 1);
    const mix = (u, v) => Math.round(EG.lerp(u, v, t));
    let top = [mix(a.top[0], b.top[0]), mix(a.top[1], b.top[1]), mix(a.top[2], b.top[2])];
    let bot = [mix(a.bot[0], b.bot[0]), mix(a.bot[1], b.bot[1]), mix(a.bot[2], b.bot[2])];
    /* 四季微调 */
    if (season === 'winter') { top = top.map(c => Math.round(c * 0.82 + 46)); bot = bot.map(c => Math.round(c * 0.85 + 38)); }
    if (season === 'autumn') { bot = [Math.min(255, bot[0] + 14), bot[1], Math.max(0, bot[2] - 16)]; }
    if (season === 'summer') { top = [top[0], Math.min(255, top[1] + 4), Math.max(0, top[2] - 6)]; }
    /* 生态：日照低 → 灰暗 */
    const dim = EG.clamp((55 - EG.G.eco.sun) / 55, 0, 1) * 0.45;
    const dk = (c, k) => Math.round(c * (1 - dim * k));
    const rgb = arr => `rgb(${arr.join(',')})`;
    const topD = top.map(c => dk(c, 0.5)), botD = bot.map(c => dk(c, 0.28));
    /* 天顶 → 中层 → 地平线 → 地面辉光：4 段渐变 */
    const mid = top.map((c, i) => Math.round(EG.lerp(c, botD[i], 0.55)));
    const gloss = bot.map((c, i) => Math.min(255, Math.round(c * 0.92 + 26)));
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    g.addColorStop(0, rgb(topD));
    g.addColorStop(0.42, rgb(mid));
    g.addColorStop(0.78, rgb(botD));
    g.addColorStop(1, rgb(gloss));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.72);

    /* 太阳位置（供光带/光斑复用） */
    const dayT = EG.clamp((hour - 6.2) / 12.4, 0, 1);
    const sx = W * EG.clamp(dayT, 0.06, 0.94);
    const sy = H * 0.30 - Math.sin(Math.PI * dayT) * H * 0.22;
    const isDay = hour > 6.2 && hour < 18.8;

    /* 星星（带柔光，避免死板白点） */
    if (night > 0.2) {
      for (const s of this.stars) {
        const a1 = night * (0.35 + 0.65 * Math.abs(Math.sin(s.tw + performance.now() / 900)));
        ctx.globalAlpha = a1;
        ctx.drawImage(this.dotWarm, s.x * W - s.r * 3, s.y * H - s.r * 3, s.r * 6, s.r * 6);
        ctx.globalAlpha = a1 * 0.9;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* 月亮 */
      const mh = hour >= 20 ? hour - 20 + 6 : hour + 4;
      const mx = W * EG.clamp((mh - 0) / 14, 0.08, 0.92), my = H * 0.30 - Math.sin(Math.PI * EG.clamp((mh) / 14, 0, 1)) * H * 0.2;
      const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 62);
      mg.addColorStop(0, 'rgba(245,240,220,.95)'); mg.addColorStop(0.18, 'rgba(240,236,214,.72)');
      mg.addColorStop(0.5, 'rgba(226,232,244,.18)'); mg.addColorStop(1, 'rgba(226,232,244,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(252,250,238,.85)';
      ctx.beginPath(); ctx.arc(mx - 8, my - 10, 2.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 9, my + 4, 1.8, 0, 7); ctx.fill();
    } else if (isDay) {
      /* 太阳：外辉 + 本体 + 光晕 */
      const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
      sg.addColorStop(0, 'rgba(255,246,214,.95)');
      sg.addColorStop(0.12, 'rgba(255,238,180,.62)');
      sg.addColorStop(0.38, 'rgba(255,232,164,.20)');
      sg.addColorStop(1, 'rgba(255,232,164,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 130, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,252,236,.94)';
      ctx.beginPath(); ctx.arc(sx, sy, 17, 0, Math.PI * 2); ctx.fill();
    }

    /* 斜射阳光光带（丁达尔感）：从太阳斜下散开的柔光楔形 */
    if (isDay && night < 0.35) {
      const strength = (0.05 + 0.055 * Math.sin(Math.PI * dayT)) * (1 - dim);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const dirX = sx < W * 0.5 ? 1 : -1;
      for (let i = 0; i < 5; i++) {
        const k = i / 4;
        const ang = (0.46 + k * 0.6) * dirX;
        const lw = 24 + k * 30;
        const ex = sx + Math.sin(ang) * 1400, ey = sy + Math.cos(ang) * 1400;
        const rg = ctx.createLinearGradient(sx, sy, ex, ey);
        rg.addColorStop(0, `rgba(255,246,206,${strength})`);
        rg.addColorStop(0.35, `rgba(255,242,196,${strength * 0.6})`);
        rg.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.strokeStyle = rg;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.restore();
    }

    /* 云：预生成云朵精灵，缓慢飘动（多层柔团 + 受光/背光） */
    for (const c of this.clouds) {
      const tsec = performance.now() / 1000;
      const cx = ((c.x + tsec * c.v) % 1.4 - 0.2) * W;
      const cy = c.y * H - Math.sin(tsec * 0.12 + c.ph) * 5;
      const cw = 300 * c.s, ch = cw * 0.5;
      ctx.globalAlpha = EG.clamp(c.o * (0.82 - night * 0.45) * (1 - dim * 0.5), 0, 1);
      ctx.drawImage(this.cloudTex, cx - cw / 2, cy - ch / 2, cw, ch);
      ctx.globalAlpha = 1;
    }

    /* 地平线雾气带（大气透视） */
    const hz = H * 0.30;
    const hzg = ctx.createLinearGradient(0, hz - H * 0.09, 0, hz + H * 0.035);
    hzg.addColorStop(0, 'rgba(255,255,255,0)');
    hzg.addColorStop(0.6, `rgba(255,253,242,${0.30 - night * 0.22})`);
    hzg.addColorStop(1, `rgba(255,253,242,${0.42 - night * 0.3})`);
    ctx.fillStyle = hzg; ctx.fillRect(0, hz - H * 0.09, W, H * 0.125);

    /* 极光装饰 */
    if (night > 0.5 && EG.G.inv.decor.deco_aurora) {
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 14) {
          const y = H * (0.14 + k * 0.08) + Math.sin(x / 130 + performance.now() / 2400 + k * 2) * 22;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = k ? 'rgba(140,220,190,.14)' : 'rgba(160,190,235,.16)';
        ctx.lineWidth = 26; ctx.stroke();
      }
    }
  },

  drawGround(ctx, W, H, season, eco, night, time) {
    const horizon = H * 0.30;
    const greens = {
      spring: ['#A8CB86', '#7BA05B', '#5E7F45'],
      summer: ['#8FB263', '#6E9450', '#52713C'],
      autumn: ['#C4B166', '#9C8F4A', '#77703A'],
      winter: ['#CBD3BE', '#AAB79C', '#8B9884'],
    };
    const [g1, g2, g3] = greens[season];
    const nt = time || 0;
    /* 远山三层：越远越淡越偏冷（大气透视） */
    const hills = [
      { y: horizon - 46, amp: 30, f: 1 / 210, c: season === 'winter' ? 'rgba(196,206,214,.62)' : 'rgba(180,204,214,.60)', o: 1 },   /* 最远：偏冷灰蓝 */
      { y: horizon - 22, amp: 24, f: 1 / 150, c: season === 'winter' ? 'rgba(178,192,180,.72)' : 'rgba(158,192,150,.72)', o: 0 },
      { y: horizon - 4, amp: 17, f: 1 / 260, c: season === 'winter' ? 'rgba(160,174,158,.9)' : 'rgba(128,164,116,.92)', o: 0 },
    ];
    hills.forEach((hl, hi) => {
      ctx.beginPath();
      ctx.moveTo(0, horizon + 10);
      for (let x = 0; x <= W; x += 12) {
        const y = hl.y - Math.sin(x * hl.f + hi * 2.1) * hl.amp - Math.sin(x * hl.f * 3.3 + hi) * hl.amp * 0.22;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, horizon + 12); ctx.lineTo(0, horizon + 12); ctx.closePath();
      const hg = ctx.createLinearGradient(0, hl.y - hl.amp, 0, horizon + 10);
      hg.addColorStop(0, hl.c);
      hg.addColorStop(1, hi === 0 ? 'rgba(206,222,214,.28)' : 'rgba(120,150,108,.35)');
      ctx.fillStyle = hg; ctx.fill();
      /* 山脊受光高光 */
      ctx.strokeStyle = 'rgba(255,252,236,.28)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const y = hl.y - Math.sin(x * hl.f + hi * 2.1) * hl.amp - Math.sin(x * hl.f * 3.3 + hi) * hl.amp * 0.22;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    /* 草地：三段渐变 + 预生成草纹理 + 深浅斑块 */
    const gg = ctx.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, g1); gg.addColorStop(0.42, g2); gg.addColorStop(1, g3);
    ctx.fillStyle = gg; ctx.fillRect(0, horizon + 4, W, H - horizon);
    if (this.grassPat && !this.lowQuality) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = this.grassPat;
      ctx.fillRect(0, horizon + 4, W, H - horizon);
      ctx.restore();
      /* 近大远小的明暗斑块，打散大色块 */
      const rnd0 = EG.RNG('gpatch' + this.size);
      for (let i = 0; i < 42; i++) {
        const px = rnd0() * W, py = horizon + 10 + Math.pow(rnd0(), 0.6) * (H - horizon);
        const pr = 34 + rnd0() * 150;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        const dark = rnd0() < 0.5;
        pg.addColorStop(0, dark ? 'rgba(52,80,40,.30)' : 'rgba(224,242,178,.30)');
        pg.addColorStop(1, dark ? 'rgba(52,80,40,0)' : 'rgba(224,242,178,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      /* 横向色带：让草地左右也有颜色变化，而不是一整片 */
      const hg = ctx.createLinearGradient(0, 0, W, 0);
      hg.addColorStop(0, 'rgba(150,186,112,.18)');
      hg.addColorStop(0.28, 'rgba(214,232,158,.14)');
      hg.addColorStop(0.55, 'rgba(120,158,96,.16)');
      hg.addColorStop(0.8, 'rgba(206,228,152,.14)');
      hg.addColorStop(1, 'rgba(138,176,104,.18)');
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hg; ctx.fillRect(0, horizon + 4, W, H - horizon);
      ctx.restore();
    }
    /* 湿度 → 草色偏深 */
    ctx.fillStyle = `rgba(40,70,50,${EG.clamp((eco.hum - 50) / 100, 0, 0.2)})`;
    ctx.fillRect(0, horizon + 4, W, H - horizon);
    /* 草丛：远近两层，近处更大更亮，随风轻摆 */
    if (!this.lowQuality) {
      const rnd = EG.RNG('grass' + this.size);
      const occupied = (x, y, pad) => this.plotRects.some(r => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);
      for (let layer = 0; layer < 2; layer++) {
        const n = layer === 0 ? 90 : 60;
        const baseA = layer === 0 ? 0.16 : 0.26;
        for (let i = 0; i < n; i++) {
          const x = rnd() * W;
          const y = horizon + 10 + Math.pow(rnd(), layer === 0 ? 0.5 : 0.75) * (H - horizon);
          if (occupied(x, y, 4)) continue;
          const hgt = (layer === 0 ? 5 : 9) + rnd() * (layer === 0 ? 5 : 9);
          const sw = Math.sin(nt * 1.3 + x * 0.05 + i) * (0.8 + layer);
          const col = rnd() < 0.5 ? `rgba(74,108,52,${baseA + 0.1})` : `rgba(228,244,200,${baseA})`;
          ctx.strokeStyle = col;
          ctx.lineWidth = layer === 0 ? 1 : 1.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + sw * 0.5 + (rnd() - 0.5) * 2, y - hgt * 0.6, x + sw, y - hgt);
          ctx.stroke();
        }
      }
      /* 草地上零星小野花与石子（细节密度） */
      for (let i = 0; i < 34; i++) {
        const x = rnd() * W, y = horizon + 14 + rnd() * (H - horizon - 20);
        if (occupied(x, y, 6)) continue;
        if (rnd() < 0.45) {
          ctx.fillStyle = 'rgba(150,140,124,.5)';
          ctx.beginPath(); ctx.ellipse(x, y, 1.6 + rnd() * 1.6, 1.1 + rnd(), 0, 0, 6.3); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.28)';
          ctx.beginPath(); ctx.ellipse(x - 0.4, y - 0.5, 0.9, 0.5, 0, 0, 6.3); ctx.fill();
        } else {
          const hue = rnd() < 0.5 ? 46 : rnd() < 0.5 ? 330 : 200;
          ctx.fillStyle = `hsla(${hue},70%,78%,.85)`;
          for (let k = 0; k < 5; k++) {
            const an = k / 5 * Math.PI * 2;
            ctx.beginPath(); ctx.arc(x + Math.cos(an) * 1.6, y + Math.sin(an) * 1.6, 1.15, 0, 6.3); ctx.fill();
          }
          ctx.fillStyle = 'rgba(250,214,120,.95)';
          ctx.beginPath(); ctx.arc(x, y, 0.9, 0, 6.3); ctx.fill();
        }
      }
    }
    /* 中景薄雾：加强大气透视的层次 */
    const mz = ctx.createLinearGradient(0, horizon + 4, 0, horizon + (H - horizon) * 0.55);
    mz.addColorStop(0, `rgba(238,246,236,${0.24 - night * 0.18})`);
    mz.addColorStop(1, 'rgba(238,246,236,0)');
    ctx.fillStyle = mz; ctx.fillRect(0, horizon + 4, W, (H - horizon) * 0.55);
    /* 前景失焦草叶：制造景深，把画面从"平面色块"里拉出来 */
    if (!this.lowQuality) {
      const rnd2 = EG.RNG('fggrass' + this.size);
      ctx.save();
      for (let i = 0; i < 44; i++) {
        const x = rnd2() * W;
        const y = H + 8 + rnd2() * 24;
        const hgt = 58 + rnd2() * 96;
        const sw = Math.sin(nt * 1.05 + x * 0.04 + i) * (6 + rnd2() * 8);
        const c = rnd2() < 0.5 ? '88,122,60' : '136,170,94';
        ctx.strokeStyle = `rgba(${c},${0.28 + rnd2() * 0.22})`;
        ctx.lineWidth = 6 + rnd2() * 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + sw * 0.4, y - hgt * 0.62, x + sw, y - hgt);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  drawDecor(ctx, H, time, night, ev) {
    const inv = EG.G.inv.decor;
    const W = this.W;
    this.drawStonePath(ctx, W, H);
    this.drawFenceAndBushes(ctx, W, H, time, night);
    /* 通用：立式道具的接触阴影 */
    const contact = (x, y, rx, ry, a) => {
      const g = ctx.createRadialGradient(x, y, 1, x, y, rx);
      g.addColorStop(0, `rgba(40,32,20,${a})`);
      g.addColorStop(0.55, `rgba(40,32,20,${a * 0.4})`);
      g.addColorStop(1, 'rgba(40,32,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    /* 风铃架：木柱有圆柱体积感 + 头顶受光 + 挂绳铃铛 */
    if (inv.deco_windbell) {
      const x = this.W * 0.07, y = H * 0.52;
      contact(x, y + 46, 20, 5.5, 0.3);
      const pg = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
      pg.addColorStop(0, 'rgba(154,124,88,.95)');
      pg.addColorStop(0.35, 'rgba(122,96,66,.95)');
      pg.addColorStop(1, 'rgba(74,56,38,.95)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(x - 2.6, y - 18, 5.2, 64, 2.6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,210,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 1.2, y - 16); ctx.lineTo(x - 1.2, y + 44); ctx.stroke();
      /* 横杆 */
      const bg2 = ctx.createLinearGradient(0, y - 20, 0, y - 14);
      bg2.addColorStop(0, 'rgba(170,140,102,.95)');
      bg2.addColorStop(1, 'rgba(88,66,44,.95)');
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.roundRect(x - 17, y - 19, 34, 4.4, 2.2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const sw = Math.sin(time * 1.6 + i) * 3;
        const bx = x - 10 + i * 10;
        ctx.strokeStyle = 'rgba(120,100,80,.65)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, y - 15); ctx.lineTo(bx + sw, y - 4); ctx.stroke();
        const cg = ctx.createRadialGradient(bx + sw - 1.2, y - 1.4, 0.4, bx + sw, y, 4.4);
        cg.addColorStop(0, i === 1 ? '#F0A9A4' : '#FFFFFF');
        cg.addColorStop(1, i === 1 ? '#B8443F' : '#CFC9C4');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(bx + sw, y, 3.4, 4.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.ellipse(bx + sw - 1, y - 1.6, 1, 1.4, 0.4, 0, 7); ctx.fill();
      }
    }
    /* 萤光菌灯：菌柄 + 伞盖受光 + 柔光晕 */
    if (inv.deco_glow) {
      const x = W * 0.93, y = H * 0.6;
      contact(x, y + 12, 34, 8, 0.26);
      for (let i = 0; i < 3; i++) {
        const mx = x + (i - 1) * 14, my = y + Math.abs(i - 1) * 5;
        const stg = ctx.createLinearGradient(mx - 3, 0, mx + 3, 0);
        stg.addColorStop(0, '#E4DACA'); stg.addColorStop(1, '#A2937C');
        ctx.fillStyle = stg;
        ctx.beginPath(); ctx.ellipse(mx, my + 6, 3, 6, 0, 0, 7); ctx.fill();
        const glowA = night > 0.3 ? 0.8 : 0.34;
        const gg = ctx.createRadialGradient(mx, my, 1, mx, my, 20);
        gg.addColorStop(0, `rgba(196,244,206,${glowA})`);
        gg.addColorStop(0.45, `rgba(180,238,196,${glowA * 0.35})`);
        gg.addColorStop(1, 'rgba(190,240,200,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mx, my, 20, 0, 7); ctx.fill();
        const cg = ctx.createRadialGradient(mx - 2, my - 1.6, 0.5, mx, my, 6.4);
        cg.addColorStop(0, '#F0FFF4'); cg.addColorStop(0.55, '#BFE8C8'); cg.addColorStop(1, '#7FAE8C');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(mx, my, 6, 4, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.ellipse(mx - 1.8, my - 1.4, 2, 1, -0.3, 0, 7); ctx.fill();
      }
    }
  },

  /* 石板小径：沿花园两侧铺几块带体积、接触阴影与受光面的石板（纯装饰） */
  drawStonePath(ctx, W, H) {
    const rnd = EG.RNG('path-v1');
    const horizon = H * 0.30;
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? 180 : W - 180;
      for (let i = 0; i < 7; i++) {
        const y = horizon + 56 + i * 60 + (rnd() - 0.5) * 14;
        const x = baseX + (rnd() - 0.5) * 20;
        const rw = 20 + rnd() * 9, rh = 11 + rnd() * 5;
        const sg = ctx.createRadialGradient(x, y + rh * 0.5, 1, x, y + rh * 0.5, rw * 1.35);
        sg.addColorStop(0, 'rgba(40,32,20,.32)'); sg.addColorStop(1, 'rgba(40,32,20,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(x, y + rh * 0.5, rw * 1.35, rh * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(x - rw, y - rh, x + rw, y + rh);
        g.addColorStop(0, 'rgba(206,200,186,.96)');
        g.addColorStop(0.45, 'rgba(170,166,152,.96)');
        g.addColorStop(1, 'rgba(118,116,104,.96)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, rw, rh, (rnd() - 0.5) * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.32)';
        ctx.beginPath(); ctx.ellipse(x - rw * 0.26, y - rh * 0.34, rw * 0.42, rh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(70,72,62,.24)';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(x + (rnd() - 0.5) * rw * 1.3, y + (rnd() - 0.5) * rh * 1.2, 0.6 + rnd() * 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },

  /* 花园左右的木栅栏 + 地平线灌木丛：给侧边草地加体积与层次（纯装饰） */
  drawFenceAndBushes(ctx, W, H, time, night) {
    const horizon = H * 0.30;
    const rnd = EG.RNG('fence-v1');
    /* 地平线灌木：带受光面与接触阴影的圆团 */
    for (let i = 0; i < 14; i++) {
      const bx = (i < 7 ? 12 + i * 26 + rnd() * 10 : W - 12 - (i - 7) * 26 - rnd() * 10);
      const by = horizon + 6 + rnd() * 10;
      const br = 14 + rnd() * 12;
      const sg = ctx.createRadialGradient(bx, by + br * 0.3, 1, bx, by + br * 0.3, br * 1.4);
      sg.addColorStop(0, 'rgba(40,58,30,.30)'); sg.addColorStop(1, 'rgba(40,58,30,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(bx, by + br * 0.3, br * 1.4, br * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const ox = (rnd() - 0.5) * br * 1.1, oy = -rnd() * br * 0.45;
        const rr = br * (0.62 + rnd() * 0.42);
        const g2 = ctx.createRadialGradient(bx + ox - rr * 0.32, by + oy - rr * 0.4, 1, bx + ox, by + oy, rr);
        g2.addColorStop(0, 'rgba(178,212,132,.95)');
        g2.addColorStop(0.55, 'rgba(126,166,92,.95)');
        g2.addColorStop(1, 'rgba(70,102,54,.95)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(bx + ox, by + oy, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.20)';
      ctx.beginPath(); ctx.ellipse(bx - br * 0.3, by - br * 0.55, br * 0.4, br * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    /* 左右木栅栏：立柱有圆柱体积 + 接触阴影 + 顶部受光 */
    const fence = (x0, x1, dir) => {
      const yTop = H * 0.74, yBot = H * 0.745 + 96;
      /* 横向栏杆（两道） */
      [0, 1].forEach(k => {
        const ry = yTop + 16 + k * 40;
        const rg = ctx.createLinearGradient(0, ry - 4, 0, ry + 4);
        rg.addColorStop(0, 'rgba(196,164,120,.95)');
        rg.addColorStop(0.45, 'rgba(150,120,84,.95)');
        rg.addColorStop(1, 'rgba(92,72,50,.95)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.roundRect(x0, ry - 4, x1 - x0, 8, 3); ctx.fill();
      });
      const n = Math.max(3, Math.round((x1 - x0) / 42));
      for (let i = 0; i <= n; i++) {
        const px = x0 + i * ((x1 - x0) / n);
        const pw = 11, ph = 72;
        const sg = ctx.createRadialGradient(px, yBot - 4, 1, px, yBot - 4, pw);
        sg.addColorStop(0, 'rgba(40,32,20,.32)'); sg.addColorStop(1, 'rgba(40,32,20,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(px, yBot - 4, pw, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        const g3 = ctx.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
        g3.addColorStop(0, 'rgba(210,180,136,.96)');
        g3.addColorStop(0.34, 'rgba(164,134,94,.96)');
        g3.addColorStop(1, 'rgba(96,74,50,.96)');
        ctx.fillStyle = g3;
        ctx.beginPath();
        ctx.moveTo(px - pw / 2, yBot);
        ctx.lineTo(px - pw / 2, yTop + 6);
        ctx.lineTo(px, yTop - 6);
        ctx.lineTo(px + pw / 2, yTop + 6);
        ctx.lineTo(px + pw / 2, yBot);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,246,222,.42)';
        ctx.fillRect(px - pw * 0.34, yTop + 8, 2, ph - 10);
      }
      void dir;
    };
    fence(-14, 176, 1);
    fence(W - 176, W + 14, -1);
  },

  drawDecorPlants(ctx, time, night) {
    if (!this.decorPlants.length) return;
    const W = this.W, H = this.H;
    const horizon = H * 0.30;
    const bedTop = horizon + 52, bedBot = H * 0.735;
    /* 地面投影：让每株都有"长在地上"的感觉 */
    for (const d of this.decorPlants) {
      const left = d.side === 0;
      const x = (left ? 30 : W - 30) + (left ? 1 : -1) * (d.col * 46 + d.jx * 0.5);
      const t = (d.row * 0.5 + d.col * 0.16) % 1;
      const y = bedTop + t * (bedBot - bedTop) + d.jy * 0.4;
      if (y > bedBot + 20) continue;
      const sc = 0.62 + t * 0.62;
      const p = EG.plantParams(d.species, d.seed, d.variant);
      const sg = ctx.createRadialGradient(x, y, 1, x, y, 26 * sc);
      sg.addColorStop(0, 'rgba(38,52,26,.30)'); sg.addColorStop(1, 'rgba(38,52,26,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(x, y, 26 * sc, 8 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      EG.drawPlantShape(ctx, p, { growth: 100, time, wind: d.wind, wilt: 0, lowFx: true });
      ctx.restore();
    }
    void night;
  },

  drawPlots(ctx, time) {
    const N = this.size;
    for (let i = 0; i < N * N; i++) {
      const info = EG.G.plots[i];
      const r = this.plotRects[i]; if (!r || !info) continue;
      if (!info.unlocked) {
        /* 未开垦：虚线 + 内部淡淡的土色，不要纯空 */
        ctx.fillStyle = 'rgba(126,104,78,.16)';
        this.roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
        this.roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      /* 泥土：外圈草边 + 立体土地块 */
      ctx.save();
      /* 接触阴影：田块周围的暗边（体积感） */
      const shg = ctx.createLinearGradient(0, r.y + r.h - 6, 0, r.y + r.h + 8);
      shg.addColorStop(0, 'rgba(38,40,24,.30)'); shg.addColorStop(1, 'rgba(38,40,24,0)');
      ctx.fillStyle = shg;
      this.roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 10, 16); ctx.fill();
      /* 基色 */
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, '#9A7A57'); g.addColorStop(0.42, '#836547'); g.addColorStop(1, '#5E472F');
      ctx.fillStyle = g;
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 14); ctx.fill();
      /* 纹理：预生成泥土 pattern 平铺 */
      ctx.save();
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 14); ctx.clip();
      if (this.soilPat) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = this.soilPat;
        ctx.translate((i % 3) * 24, (i * 17) % 48);
        ctx.fillRect(r.x - 48, r.y - 48, r.w + 96, r.h + 96);
        ctx.globalAlpha = 1;
      }
      /* 湿润暗部：底部的湿土带 */
      const wet = ctx.createLinearGradient(0, r.y + r.h * (0.4 - EG.clamp((EG.G.eco.hum - 50) / 100, 0, 0.3)), 0, r.y + r.h);
      wet.addColorStop(0, 'rgba(38,28,18,0)');
      wet.addColorStop(1, `rgba(34,25,16,${0.34 + EG.clamp((EG.G.eco.hum - 50) / 140, 0, 0.26)})`);
      ctx.fillStyle = wet; ctx.fillRect(r.x, r.y, r.w, r.h);
      /* 顶部受光（斜射光从左上来） */
      const top = ctx.createLinearGradient(0, r.y, 0, r.y + r.h * 0.52);
      top.addColorStop(0, 'rgba(255,238,206,.30)');
      top.addColorStop(1, 'rgba(255,238,206,0)');
      ctx.fillStyle = top; ctx.fillRect(r.x, r.y, r.w, r.h * 0.55);
      /* 左右内阴影：让土块像"嵌进地里"而不是贴上去 */
      const el = ctx.createLinearGradient(r.x, 0, r.x + 16, 0);
      el.addColorStop(0, 'rgba(38,26,16,.30)'); el.addColorStop(1, 'rgba(38,26,16,0)');
      ctx.fillStyle = el; ctx.fillRect(r.x, r.y, 16, r.h);
      const er = ctx.createLinearGradient(r.x + r.w, 0, r.x + r.w - 16, 0);
      er.addColorStop(0, 'rgba(38,26,16,.24)'); er.addColorStop(1, 'rgba(38,26,16,0)');
      ctx.fillStyle = er; ctx.fillRect(r.x + r.w - 16, r.y, 16, r.h);
      const et = ctx.createLinearGradient(0, r.y, 0, r.y + 12);
      et.addColorStop(0, 'rgba(255,246,220,.34)'); et.addColorStop(1, 'rgba(255,246,220,0)');
      ctx.fillStyle = et; ctx.fillRect(r.x, r.y, r.w, 12);
      /* 土粒与碎屑 */
      const rnd = EG.RNG('soil' + i);
      for (let k = 0; k < 26; k++) {
        const px = r.x + 4 + rnd() * (r.w - 8), py = r.y + 4 + rnd() * (r.h - 8);
        const rr = 0.6 + rnd() * 1.5;
        ctx.fillStyle = rnd() < 0.55 ? 'rgba(40,28,17,.38)' : 'rgba(214,190,156,.30)';
        ctx.beginPath(); ctx.ellipse(px, py, rr, rr * 0.72, rnd() * 3, 0, 6.3); ctx.fill();
      }
      /* 土面小石子（带高光） */
      for (let k = 0; k < 4; k++) {
        const px = r.x + 8 + rnd() * (r.w - 16), py = r.y + 8 + rnd() * (r.h - 16);
        ctx.fillStyle = 'rgba(198,180,152,.55)';
        ctx.beginPath(); ctx.ellipse(px, py, 2.4, 1.7, rnd(), 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.ellipse(px - 0.5, py - 0.6, 1.1, 0.7, rnd(), 0, 6.3); ctx.fill();
      }
      ctx.restore();
      /* 边框受光 + 草沿 */
      ctx.strokeStyle = 'rgba(255,242,214,.34)'; ctx.lineWidth = 1.2;
      this.roundRect(ctx, r.x + 0.6, r.y + 0.6, r.w - 1.2, r.h - 1.2, 13); ctx.stroke();
      if (!this.lowQuality) {
        const rnd2 = EG.RNG('fringe' + i);
        const per = Math.max(6, Math.round(r.w / 14));
        for (let k = 0; k < per; k++) {
          const px = r.x + (k + 0.5) * (r.w / per);
          const hh = 3 + rnd2() * 5;
          const sw = Math.sin(time * 1.2 + px * 0.08) * 1.2;
          ctx.strokeStyle = 'rgba(124,160,86,.7)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(px, r.y + 1); ctx.quadraticCurveTo(px + sw * 0.5, r.y - hh * 0.6, px + sw, r.y - hh); ctx.stroke();
          ctx.strokeStyle = 'rgba(212,236,170,.5)'; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(px + 1.4, r.y + 1); ctx.quadraticCurveTo(px + 1.4 + sw * 0.6, r.y - hh * 0.5, px + 1.4 + sw * 1.2, r.y - hh * 0.8); ctx.stroke();
        }
      }
      ctx.restore();
    }
  },

  drawPlant(ctx, pl, rect, time, wind) {
    const p = EG.plantParams(pl.species, pl.seed, pl.variant);
    ctx.save();
    ctx.translate(rect.cx, rect.cy);
    ctx.scale(rect.scale, rect.scale);
    /* 花盆在土面上的接触阴影（先画影，再画盆） */
    const shg = ctx.createRadialGradient(0, 2, 1, 0, 2, 22);
    shg.addColorStop(0, 'rgba(38,28,16,.34)');
    shg.addColorStop(0.5, 'rgba(38,28,16,.14)');
    shg.addColorStop(1, 'rgba(38,28,16,0)');
    ctx.fillStyle = shg;
    ctx.beginPath(); ctx.ellipse(0, 2, 22, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    EG.drawPot(ctx, EG.POT_BY_ID[pl.pot] || EG.POT_BY_ID.pot_terra, 1);
    const stage = EG.stageOf(pl.growth);
    const growthDraw = pl.withered ? 100 : pl.growth;
    EG.drawPlantShape(ctx, p, {
      growth: growthDraw, time, wind,
      wilt: EG.clamp(pl.wilt / 100, 0, 1),
      withered: pl.withered,
      lowFx: EG.G.settings.lowFx || this.lowQuality,
    });
    ctx.restore();
    /* 收获高亮：柔光晕 + 呼吸光环 */
    if (this.mode === 'harvest' && stage === 4 && !pl.withered) {
      const pu = 0.5 + 0.5 * Math.sin(time * 4);
      const hg = ctx.createRadialGradient(rect.cx, rect.cy - 30 * rect.scale, 1, rect.cx, rect.cy - 30 * rect.scale, rect.w * 0.6);
      hg.addColorStop(0, `rgba(255,214,120,${0.16 + pu * 0.14})`);
      hg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(rect.cx, rect.cy - 30 * rect.scale, rect.w * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(242,169,59,${0.4 + pu * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(rect.cx, rect.cy - 4, rect.w * 0.4, 0, Math.PI * 2); ctx.stroke();
    }
    /* 萎靡提示 */
    if (!pl.withered && pl.wilt > 45 && stage < 4) {
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3);
      ctx.fillText('🥀', rect.cx + rect.w * 0.3, rect.y + 14);
      ctx.globalAlpha = 1;
    }
    void stage;
  },

  drawHighlights(ctx, time) {
    /* 待播种模式：空地块呼吸虚线 */
    if (this.mode === 'plant') {
      const N = this.size;
      for (let i = 0; i < N * N; i++) {
        const info = EG.G.plots[i], r = this.plotRects[i];
        if (!info || !info.unlocked || info.plantId) continue;
        const a = 0.35 + 0.3 * Math.sin(time * 3 + i);
        ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.4; ctx.setLineDash([7, 7]);
        this.roundRect(ctx, r.x, r.y, r.w, r.h, 14); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    /* 照料选中 */
    if (this.selectedPlant && EG.G.plants[this.selectedPlant]) {
      const pl = EG.G.plants[this.selectedPlant];
      const r = this.plotRects[pl.plot];
      if (r) {
        ctx.strokeStyle = 'rgba(123,160,91,.9)'; ctx.lineWidth = 3;
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -time * 24;
        this.roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 16); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },

  updateParticles(ctx, H, time, night, ev, eco) {
    const W = this.W;
    const lowFx = EG.G.settings.lowFx || this.lowQuality;
    const want = [];
    if (!lowFx) {
      if (night < 0.4) want.push(['dust', 12]);
      /* 花粉 / 光点：白天常驻，缓慢漂浮 */
      if (night < 0.55) want.push(['pollen', 26]);
      if (night > 0.5 && (eco.har >= 60 || ev.some(e => e.id === 'ev_firefly'))) want.push(['fly', 14]);
      if (ev.some(e => e.id === 'ev_rain')) want.push(['rain', 60]);
      if (ev.some(e => e.id === 'ev_snow')) want.push(['snow', 36]);
      if (ev.some(e => e.id === 'ev_mist') || eco.hum >= 78) want.push(['mist', 6]);
      if (ev.some(e => e.id === 'ev_petal')) want.push(['petal', 14]);
    }
    for (const [type, n] of want) {
      const cur = this.particles.filter(p => p.type === type).length;
      for (let i = cur; i < n; i++) this.particles.push(this.spawnP(type, W, H));
    }
    /* 流星 */
    if (EG.G.inv.decor.deco_meteor && Math.random() < 0.004 && !lowFx) {
      this.particles.push({ type: 'meteor', x: Math.random() * W * 0.8, y: H * 0.08, vx: 4.5, vy: 2.2, life: 1, dec: 0.012 });
    }
    /* 更新 */
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx || 0; p.y += p.vy || 0;
      if (p.type === 'burst') { p.vy += 0.05; p.life -= p.dec; }
      else if (p.type === 'soil') { p.vy += 0.06; p.life -= p.dec; }
      else if (p.type === 'dust' || p.type === 'fly') {
        p.x += Math.sin(time * 0.7 + p.ph) * 0.3;
        p.y += Math.cos(time * 0.5 + p.ph) * 0.2;
      } else if (p.type === 'pollen') {
        p.x += Math.sin(time * 0.42 + p.ph) * 0.35 + 0.12;
        p.y -= p.vy * 0.35;
        p.vy += Math.sin(time * 0.6 + p.ph * 1.7) * 0.004;
      } else if (p.type === 'mist') {
        p.x += 0.15;
      }
      if (p.type === 'rain' && p.y > H) { p.y = -10; p.x = Math.random() * W; }
      if (p.type === 'snow' && p.y > H) { p.y = -6; p.x = Math.random() * W; }
      if ((p.type === 'dust' || p.type === 'fly' || p.type === 'pollen') && (p.y < -10 || p.x < -10 || p.x > W + 10)) { Object.assign(p, this.spawnP(p.type, W, H)); }
      if (p.type === 'mist' && p.x > W + 80) { p.x = -80; p.y = H * (0.3 + Math.random() * 0.4); }
      if ((p.life ?? 1) <= 0) { this.particles.splice(i, 1); continue; }
      /* 绘制 */
      switch (p.type) {
        case 'dust':
          ctx.globalAlpha = 0.34;
          ctx.drawImage(this.dotWarm, p.x - p.size * 2.6, p.y - p.size * 2.6, p.size * 5.2, p.size * 5.2);
          ctx.globalAlpha = 1; break;
        case 'pollen': {
          const a = 0.34 + 0.3 * Math.abs(Math.sin(time * 1.3 + p.ph));
          ctx.globalAlpha = a * p.life;
          const tex = p.warm ? this.dotWarm : this.dotPink;
          const r = p.size * 3.2;
          ctx.drawImage(tex, p.x - r, p.y - r, r * 2, r * 2);
          ctx.globalAlpha = 1; break;
        }
        case 'fly': {
          const a = 0.3 + 0.7 * Math.abs(Math.sin(time * 2 + p.ph));
          ctx.globalAlpha = a;
          ctx.drawImage(this.dotCool, p.x - 7, p.y - 7, 14, 14);
          ctx.globalAlpha = 1; break;
        }

        case 'rain':
          ctx.strokeStyle = 'rgba(160,190,220,.4)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.5, p.y + 11); ctx.stroke(); break;
        case 'snow':
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
        case 'mist':
          ctx.fillStyle = 'rgba(235,240,235,.10)';
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 70, 18, 0, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(245,248,244,.06)';
          ctx.beginPath(); ctx.ellipse(p.x + 26, p.y - 5, 46, 12, 0, 0, 7); ctx.fill(); break;
        case 'petal':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(time * 2 + p.ph);
          ctx.fillStyle = `hsla(${p.hue},62%,80%,.85)`;
          ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 2.1, 0, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.3)';
          ctx.beginPath(); ctx.ellipse(-1, -0.5, 1.6, 0.7, 0, 0, 7); ctx.fill();
          ctx.restore(); break;
        case 'burst': {
          const a = EG.clamp(p.life, 0, 1);
          ctx.globalAlpha = a;
          ctx.drawImage(this.dotWarm, p.x - p.size * 5, p.y - p.size * 5, p.size * 10, p.size * 10);
          ctx.globalAlpha = 1; break;
        }
        case 'soil':
          ctx.fillStyle = `rgba(90,65,40,${EG.clamp(p.life, 0, 1)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
        case 'meteor':
          ctx.strokeStyle = `rgba(255,250,220,${EG.clamp(p.life, 0, 1)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 6, p.y - p.vy * 6); ctx.stroke();
          ctx.globalAlpha = EG.clamp(p.life, 0, 1) * 0.6;
          ctx.drawImage(this.dotWarm, p.x - 12, p.y - 12, 24, 24);
          ctx.globalAlpha = 1; break;
      }
      if (p.type === 'burst' || p.type === 'soil' || p.type === 'meteor') {
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }
    if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
  },

  spawnP(type, W, H) {
    const horizon = H * 0.30;
    switch (type) {
      case 'dust': return { type, x: Math.random() * W, y: horizon + Math.random() * (H - horizon), size: 1 + Math.random() * 1.4, ph: Math.random() * 7 };
      case 'pollen': return { type, x: Math.random() * W, y: horizon + Math.random() * (H - horizon) * 0.95, size: 0.9 + Math.random() * 1.5, vy: 0.25 + Math.random() * 0.5, life: 1, dec: 0, warm: Math.random() < 0.6, ph: Math.random() * 7 };
      case 'fly': return { type, x: Math.random() * W, y: horizon + Math.random() * (H - horizon) * 0.8, size: 1.4, ph: Math.random() * 7 };
      case 'rain': return { type, x: Math.random() * W, y: Math.random() * H, vx: -0.6, vy: 7 };
      case 'snow': return { type, x: Math.random() * W, y: Math.random() * H, vx: Math.sin(Math.random() * 7) * 0.3, vy: 0.7 + Math.random() * 0.6, size: 1 + Math.random() * 1.6 };
      case 'mist': return { type, x: Math.random() * W, y: H * (0.3 + Math.random() * 0.4) };
      case 'petal': return { type, x: Math.random() * W, y: H * 0.25, vx: 0.4, vy: 1 + Math.random(), ph: Math.random() * 7, hue: 330 + Math.random() * 40 };
    }
    return { type, x: 0, y: 0 };
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /* 帧率自适应 */
  trackPerf(dt) {
    if (dt > 34) this._slow++; else this._slow = Math.max(0, this._slow - 1);
    if (this._slow > 90) { this.lowQuality = true; }
  },
};
