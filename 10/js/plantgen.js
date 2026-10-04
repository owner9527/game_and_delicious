/* ============================================================
   情绪花园 — 程序化植物生成与绘制
   玩家的情绪输入决定种子 → 形态参数（花瓣数/弧度/渐变/斑点），
   没有两株完全相同的植物。绘制为水彩手绘质感。
   ============================================================ */
window.EG = window.EG || {};

/* 由物种模板 + 随机种子 + 变异生成形态参数 */
EG.plantParams = function (speciesId, seedStr, variant = 0) {
  const sp = EG.PLANT_BY_ID[speciesId];
  const rnd = EG.RNG(seedStr + '|' + speciesId);
  const jit = (v, r) => v + (rnd() * 2 - 1) * r;
  const p = {
    species: speciesId, variant,
    hue: jit(sp.hue, 10), sat: EG.clamp(jit(sp.sat, 8), 8, 96), lit: EG.clamp(jit(sp.lit, 6), 30, 90),
    hue2: jit(sp.hue, 10) + 22 + rnd() * 14,
    petals: Math.max(3, Math.min(36, Math.round(jit(sp.petals, sp.petals > 12 ? 3 : 1.5)))),
    petalW: EG.clamp(jit(sp.petalW, 0.08), 0.15, 1),
    layers: sp.layers || 1,
    petalLen: 0.85 + rnd() * 0.4,
    stemH: jit(sp.stemH, sp.stemH * 0.09),
    bend: jit(sp.stemBend || 8, 5),
    leaves: Math.max(2, Math.round(sp.leaves + (rnd() * 2 - 1))),
    leafSize: 0.8 + rnd() * 0.5,
    curl: rnd() * Math.PI * 2,
    spots: rnd() < 0.42 ? { n: 2 + Math.floor(rnd() * 5), r: 0.06 + rnd() * 0.08 } : null,
    phase: rnd() * Math.PI * 2,
    size: sp.size || 1,
    shape: sp.shape, thorn: sp.thorn || 0, droop: sp.droop || 0, glow: sp.glow || 0, mist: sp.mist || 0,
    emo: sp.emo,
  };
  if (variant === 1) { p.layers = Math.min(3, p.layers + 2); p.petals = Math.round(p.petals * 1.4); p.petalLen *= 1.08; }
  if (variant === 2) { p.sat = EG.clamp(p.sat + 8, 0, 98); p.lit = EG.clamp(p.lit + 6, 0, 94); p.spots = { n: 5, r: 0.09 }; }
  /* 表现层附加量（纯派生，不消耗随机数，不影响既有花的形态） */
  p.windAmp = 0.72 + (p.stemH / 90) * 0.6;          /* 高株摆幅更大 */
  p.leafPhase = p.phase * 1.7;                       /* 叶片独立相位 */
  p.headPhase = p.phase * 0.6 + 1.1;                 /* 花头独立相位 */
  return p;
};

/* 形态参数缓存：同一株每帧复用同一对象（算法与随机数序列完全不变），
   同时作为「花头离屏纹理」的挂载点，避免每帧重新烘焙。 */
EG._paramCache = new Map();
EG.plantParamsRaw = EG.plantParams;
EG.plantParams = function (speciesId, seedStr, variant = 0) {
  const key = speciesId + '|' + seedStr + '|' + variant;
  let p = EG._paramCache.get(key);
  if (!p) {
    p = EG.plantParamsRaw(speciesId, seedStr, variant);
    if (EG._paramCache.size > 500) EG._paramCache.clear();
    EG._paramCache.set(key, p);
  }
  return p;
};

function wc(h, s, l, a = 1) { return `hsla(${((h % 360) + 360) % 360},${EG.clamp(s, 0, 100)}%,${EG.clamp(l, 0, 100)}%,${a})`; }
/* 萎靡褪色 */
function wiltMix(l, wilt) { return l + (78 - l) * wilt * 0.7; }

/* ============================================================
   离屏纹理缓存
   花瓣 / 叶片 / 花头都是「预生成离屏 canvas」，
   运行时只做 drawImage + 变换，不逐帧重建路径与渐变。
   （植物数量多时这是性能关键）
   ============================================================ */
function newCv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function cachedTex(map, key, build, cap = 300) {
  let v = map.get(key);
  if (v) return v;
  if (map.size >= cap) map.clear();
  v = build(); map.set(key, v); return v;
}
const _texPetal = new Map(), _texLeaf = new Map();

/* 花瓣精灵：基准长度 112，基点在 (32,116)，实际包围盒 (4,4,56,112) */
const PET = { L0: 112, W: 64, H: 120, bx: 32, by: 116, sx: 4, sy: 4, sw: 56, sh: 112 };
/* 叶片精灵：基准长度 112，基点在 (72,116)，实际包围盒 (48,4,80,112) */
const LEAF = { L0: 112, W: 136, H: 122, bx: 72, by: 116, sx: 48, sy: 4, sw: 80, sh: 112 };

/* 烘焙一片花瓣：多层渐变 + 基部暗部 + 侧向高光 + 中脉/羽脉 + 轮廓 */
function bakePetal(h, s, l) {
  const cv = newCv(PET.W, PET.H), g = cv.getContext('2d');
  g.translate(PET.bx, PET.by);
  const len = PET.L0, w = len * 0.5;
  const shape = () => {
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(w, -len * 0.38, 0, -len);
    g.quadraticCurveTo(-w, -len * 0.38, 0, 0);
    g.closePath();
  };
  /* 主渐变：基部柔亮 → 中段饱和 → 尖端更深更暖 */
  const grad = g.createLinearGradient(0, 10, 0, -len);
  grad.addColorStop(0, wc(h, s * 0.5, l + 18, 1));
  grad.addColorStop(0.34, wc(h + 4, s * 0.9, l + 4, 1));
  grad.addColorStop(0.72, wc(h + 12, s, l - 2, 1));
  grad.addColorStop(1, wc(h + 22, s * 0.95, l - 11, 1));
  g.fillStyle = grad; shape(); g.fill();
  g.save(); shape(); g.clip();
  /* 基部环境遮蔽（花心处的暗部） */
  const ao = g.createRadialGradient(0, -len * 0.03, 1, 0, -len * 0.03, len * 0.52);
  ao.addColorStop(0, wc(h + 8, s, l - 30, 0.34)); ao.addColorStop(1, wc(h + 8, s, l - 30, 0));
  g.fillStyle = ao; g.fillRect(-PET.W, -PET.H, PET.W * 2.2, PET.H * 2.2);
  /* 侧向高光条（左上方受光） */
  const hl = g.createLinearGradient(-w * 0.7, 0, w * 0.7, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.3, 'rgba(255,255,255,.36)');
  hl.addColorStop(0.46, 'rgba(255,255,255,.10)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.fillRect(-PET.W, -PET.H, PET.W * 2.2, PET.H * 2.2);
  /* 尖端一点透光 */
  const tip = g.createRadialGradient(0, -len * 0.94, 1, 0, -len * 0.94, len * 0.26);
  tip.addColorStop(0, 'rgba(255,255,255,.22)'); tip.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = tip; g.fillRect(-PET.W, -PET.H, PET.W * 2.2, PET.H * 2.2);
  /* 中脉 + 羽状侧脉 */
  g.strokeStyle = wc(h + 10, s * 0.85, l + 24, 0.32); g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -len * 0.06); g.lineTo(0, -len * 0.9); g.stroke();
  g.lineWidth = 0.9;
  for (let i = 1; i <= 4; i++) {
    const t = i / 5.2, y = -len * t, sp = w * 0.4 * (1 - t * 0.72);
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(sp * 0.55, y - len * 0.07, sp, y - len * 0.14); g.stroke();
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(-sp * 0.55, y - len * 0.07, -sp, y - len * 0.14); g.stroke();
  }
  g.restore();
  shape(); g.strokeStyle = wc(h + 12, s, l - 22, 0.26); g.lineWidth = 1; g.stroke();
  return cv;
}

/* 花瓣：画出时对精灵做非等比缩放，等价于原来的 wid 参数 */
function drawPetal(ctx, len, wid, h, s, l, rot, alpha = 0.88) {
  if (!(len > 0.4) || !(wid > 0.02)) return;
  const spr = cachedTex(_texPetal, `${Math.round(h)}_${Math.round(s)}_${Math.round(l)}`, () => bakePetal(h, s, l));
  const dw = len * wid * 0.5, dh = len;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.rotate(rot);
  ctx.drawImage(spr, PET.sx, PET.sy, PET.sw, PET.sh, -dw / 2, -dh, dw, dh);
  ctx.restore();
}

/* 烘焙一片叶子：双色渐变 + 主脉侧脉 + 受光高光 + 叶缘描边 */
function bakeLeaf(h, s, l) {
  const cv = newCv(LEAF.W, LEAF.H), g = cv.getContext('2d');
  g.translate(LEAF.bx, LEAF.by);
  const len = LEAF.L0, wid = 1;
  const shape = () => {
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(len * wid, -len * 0.45, 0, -len);
    g.quadraticCurveTo(-len * wid * 0.4, -len * 0.45, 0, 0);
    g.closePath();
  };
  const grad = g.createLinearGradient(-len * 0.2, 0, len * 0.3, -len);
  grad.addColorStop(0, wc(h - 10, s, l - 8, 1));
  grad.addColorStop(0.5, wc(h - 2, s, l + 2, 1));
  grad.addColorStop(1, wc(h + 10, s, l + 11, 1));
  g.fillStyle = grad; shape(); g.fill();
  g.save(); shape(); g.clip();
  /* 左半片的暗部（体积感） */
  const sh = g.createLinearGradient(-len * 0.25, 0, len * 0.5, 0);
  sh.addColorStop(0, 'rgba(28,52,26,.28)'); sh.addColorStop(0.55, 'rgba(28,52,26,0)');
  g.fillStyle = sh; g.fillRect(-LEAF.W, -LEAF.H, LEAF.W * 2.2, LEAF.H * 2.2);
  /* 右上受光面 */
  const hl = g.createLinearGradient(len * 0.05, 0, len * 0.55, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.5, 'rgba(255,255,255,.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.fillRect(-LEAF.W, -LEAF.H, LEAF.W * 2.2, LEAF.H * 2.2);
  /* 主脉 */
  g.strokeStyle = wc(h, s * 0.7, l + 26, 0.5); g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.02, -len * 0.5, 0, -len * 0.96); g.stroke();
  /* 侧脉 */
  g.strokeStyle = wc(h, s * 0.7, l + 20, 0.3); g.lineWidth = 0.85;
  for (let i = 1; i <= 5; i++) {
    const t = i / 6.2, y = -len * t;
    const e = len * 0.34 * (1 - t * 0.6);
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(e * 0.6, y - len * 0.05, e, y - len * 0.1); g.stroke();
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(-e * 0.45, y - len * 0.05, -e * 0.72, y - len * 0.1); g.stroke();
  }
  g.restore();
  shape(); g.strokeStyle = wc(h - 6, s, l - 18, 0.3); g.lineWidth = 1; g.stroke();
  return cv;
}

function drawLeaf(ctx, len, wid, h, s, l, rot, alpha = 0.85) {
  if (!(len > 0.4)) return;
  const spr = cachedTex(_texLeaf, `${Math.round(h)}_${Math.round(s)}_${Math.round(l)}`, () => bakeLeaf(h, s, l));
  const dw = len * wid * (LEAF.sw / LEAF.L0), dh = len;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.rotate(rot);
  ctx.drawImage(spr, LEAF.sx, LEAF.sy, LEAF.sw, LEAF.sh, -dw * 0.3, -dh, dw, dh);
  ctx.restore();
}

/* 花瓣斑点（长在花头上的小色斑） */
function drawSpots(ctx, r, n, seedPhase, h, s, l) {
  for (let i = 0; i < n; i++) {
    const ang = seedPhase + i * 2.399963;
    const rr = r * (0.35 + (i % 3) * 0.28);
    const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr, rad = Math.max(1, r * 0.17);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, wc(h - 20, s, l - 30, 0.5));
    gg.addColorStop(0.6, wc(h - 20, s, l - 28, 0.26));
    gg.addColorStop(1, wc(h - 20, s, l - 26, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

/* 花蕊：花丝 + 花药高光点 + 花心径向渐变与顶光 */
function drawStamen(ctx, r, p, colL) {
  const n = EG.clamp(Math.round(p.petals / 2), 5, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + p.phase * 0.13;
    const l = r * (1.6 + (i % 3) * 0.36);
    const x = Math.cos(a) * l, y = Math.sin(a) * l;
    ctx.strokeStyle = wc(46, 60, Math.min(90, colL + 30), 0.85);
    ctx.lineWidth = Math.max(0.6, r * 0.16);
    ctx.beginPath(); ctx.moveTo(x * 0.18, y * 0.18);
    ctx.quadraticCurveTo(x * 0.62, y * 0.62 - l * 0.22, x, y); ctx.stroke();
    const rad = Math.max(0.9, r * 0.34);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, wc(52, 88, 86, 0.96)); gg.addColorStop(1, wc(42, 82, 60, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  /* 花心本体 */
  const cg = ctx.createRadialGradient(-r * 0.28, -r * 0.32, 1, 0, 0, r);
  cg.addColorStop(0, wc(52, 80, 84, 0.98));
  cg.addColorStop(0.55, wc(44, 72, 63, 0.98));
  cg.addColorStop(1, wc(34, 64, 46, 0.98));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.34, r * 0.2, -0.6, 0, Math.PI * 2); ctx.fill();
}

/* 茎：沿二次贝塞尔采样的锥形带（粗细渐变）+ 受光高光 + 背光暗边 */
function drawStemRibbon(ctx, cx, cy, topX, topY, size, hue, sat, lit) {
  const N = 14;
  const px = [], py = [], hw = [];
  const wBase = 1.9 * size, wTop = 0.72 * size;
  for (let i = 0; i <= N; i++) {
    const t = i / N, it = 1 - t;
    px.push(2 * it * t * cx + t * t * topX);
    py.push(2 * it * t * cy + t * t * topY);
    hw.push(EG.lerp(wBase, wTop, Math.pow(t, 0.8)));
  }
  const nx = [], ny = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
    let dx = px[b] - px[a], dy = py[b] - py[a];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    nx.push(-dy); ny.push(dx);
  }
  const ribbon = (off, k) => {
    ctx.beginPath();
    ctx.moveTo(px[0] + nx[0] * (off + hw[0] * k), py[0] + ny[0] * (off + hw[0] * k));
    for (let i = 1; i <= N; i++) ctx.lineTo(px[i] + nx[i] * (off + hw[i] * k), py[i] + ny[i] * (off + hw[i] * k));
    for (let i = N; i >= 0; i--) ctx.lineTo(px[i] + nx[i] * (off - hw[i] * k), py[i] + ny[i] * (off - hw[i] * k));
    ctx.closePath();
  };
  /* 茎体 */
  const grad = ctx.createLinearGradient(0, 0, topX, topY);
  grad.addColorStop(0, wc(hue - 4, sat, lit - 6, 0.96));
  grad.addColorStop(0.55, wc(hue, sat, lit + 3, 0.96));
  grad.addColorStop(1, wc(hue + 8, sat * 0.9, lit + 12, 0.96));
  ribbon(0, 1); ctx.fillStyle = grad; ctx.fill();
  /* 受光高光条（左上） */
  ribbon(-hw[0] * 0.42, 0.3); ctx.fillStyle = wc(hue + 14, sat * 0.6, lit + 26, 0.4); ctx.fill();
  /* 背光暗边（右下） */
  ribbon(hw[0] * 0.62, 0.26); ctx.fillStyle = wc(hue - 10, sat, Math.max(12, lit - 20), 0.32); ctx.fill();
  return { px, py, hw, nx, ny };
}

/* 取茎上某点的位置（供叶柄/花萼定位） */
function stemPoint(cx, cy, topX, topY, t) {
  const it = 1 - t;
  return [2 * it * t * cx + t * t * topX, 2 * it * t * cy + t * t * topY];
}

/* ---------- 主绘制函数 ----------
   在原点 (0,0)=土面，向上绘制；opts: {growth, time, wilt, wind, withered} */
EG.drawPlantShape = function (ctx, p, opts = {}) {
  const g = opts.growth ?? 100;
  const stage = EG.stageOf(g);
  const time = opts.time || 0;
  const wilt = EG.clamp(opts.wilt || 0, 0, 1);
  const withered = opts.withered;
  const wind = (opts.wind ?? 0.5) + wilt * 0.1;
  /* 风：低频主摆 + 高频细颤，茎/叶/花头各用不同相位与频率 */
  const amp = wind * (p.windAmp || 1);
  const swayMain = Math.sin(time * 1.05 + p.phase) * amp * 4;
  const swayFine = Math.sin(time * 2.15 + p.phase * 1.9) * amp * 1.05;
  const sway = swayMain + swayFine;
  const L = p.petalLen;
  const stemLen = p.stemH * EG.clamp(g / 62, 0.12, 1);

  /* 根部接触阴影（投在土面上的软影，营造"立起来"的体积感） */
  const shadow = (rx, ry, a) => {
    const sg = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
    sg.addColorStop(0, `rgba(46,34,22,${a})`);
    sg.addColorStop(0.55, `rgba(46,34,22,${a * 0.45})`);
    sg.addColorStop(1, 'rgba(46,34,22,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };

  if (stage === 0 && !withered) {
    /* 种子：小土丘 + 种子（带软影与受光高光） */
    shadow(12 * p.size, 5.5 * p.size, 0.3);
    ctx.fillStyle = wc(28, 32, 36, 0.95);
    ctx.beginPath(); ctx.ellipse(0, -2.5 * p.size, 9 * p.size, 4.2 * p.size, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = wc(34, 34, 46, 0.9);
    ctx.beginPath(); ctx.ellipse(0, -5.4 * p.size, 7.4 * p.size, 2.8 * p.size, 0, 0, Math.PI * 2); ctx.fill();
    const seedGrad = ctx.createRadialGradient(-1.2 * p.size, -6.2 * p.size, 0.4, 0, -5 * p.size, 4.6 * p.size);
    seedGrad.addColorStop(0, wc(p.hue, p.sat * 0.5, 62, 0.98));
    seedGrad.addColorStop(1, wc(p.hue, p.sat * 0.45, 34, 0.98));
    ctx.fillStyle = seedGrad;
    ctx.beginPath(); ctx.ellipse(sway * 0.2, -5 * p.size, 3.2 * p.size, 4 * p.size, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(sway * 0.2 - 1.1 * p.size, -6.4 * p.size, 1.1 * p.size, 0.8 * p.size, 0.4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const colS = p.sat * (1 - wilt * 0.55), colL = wiltMix(p.lit, wilt);
  const stemHue = withered ? 42 : 105, stemSat = (p.sat * 0.35 + 18) * (1 - wilt * 0.4), stemLit = (38 + p.lit * 0.08) * (1 - wilt * 0.25);
  const droopBend = p.bend + p.droop * 12 + wilt * 16;

  /* 茎 */
  const topX = sway + droopBend + (withered ? 10 : 0);
  const topY = -stemLen * (withered ? 0.7 : 1);
  const cx = droopBend * 0.25 + sway * 0.3, cy = -stemLen * 0.55;
  shadow(13 * p.size, 5 * p.size, 0.26);
  drawStemRibbon(ctx, cx, cy, topX, topY, p.size, stemHue, stemSat, stemLit);

  /* 刺（愤怒系）*/
  if (p.thorn) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 5, pt = stemPoint(cx, cy, topX, topY, t * 0.82);
      const x = pt[0], y = pt[1];
      ctx.fillStyle = wc(stemHue + 10, stemSat, stemLit - 10, 0.9);
      ctx.beginPath();
      ctx.moveTo(x - 2.4, y); ctx.lineTo(x + 3.4, y - 1.4); ctx.lineTo(x - 1.6, y - 4.6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = wc(stemHue + 18, stemSat * 0.7, stemLit + 22, 0.5);
      ctx.beginPath(); ctx.moveTo(x - 1.2, y - 0.6); ctx.lineTo(x + 2.6, y - 1.5); ctx.lineTo(x - 1.2, y - 2.4); ctx.closePath(); ctx.fill();
    }
  }

  /* 叶：沿茎的二次贝塞尔取点定位，叶柄 + 各自风相位 */
  const nLeaf = Math.min(p.leaves, Math.max(1, Math.floor(g / 16)));
  const leafGrow = EG.clamp(g / 55, 0.3, 1);
  for (let i = 0; i < nLeaf; i++) {
    const t = 0.28 + 0.55 * (nLeaf === 1 ? 0.5 : i / (nLeaf - 1));
    const x = 2 * (1 - t) * t * cx + t * t * topX;
    const y = 2 * (1 - t) * t * cy + t * t * topY;
    const side = i % 2 === 0 ? 1 : -1;
    /* 越靠顶端摆幅越大，相位各不相同 */
    const windLeaf = Math.sin(time * 1.35 + (p.leafPhase || p.phase) + i * 1.7) * wind * (0.05 + 0.07 * t);
    const len = (13 + i * 2.4) * p.leafSize * p.size * leafGrow;
    /* 叶柄 */
    ctx.strokeStyle = wc(withered ? 46 : 104, stemSat * 0.9, stemLit - 4, 0.85);
    ctx.lineWidth = Math.max(0.8, 0.7 * p.size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len * 0.16, y - len * 0.06 + (side > 0 ? -len * 0.05 : len * 0.03));
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    /* 叶下软影 */
    const lg = ctx.createRadialGradient(0, 0, 1, 0, 0, len * 0.9);
    lg.addColorStop(0, 'rgba(30,40,20,.18)'); lg.addColorStop(1, 'rgba(30,40,20,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(0, 1, len * 0.9, len * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    drawLeaf(ctx, len, 0.62,
      withered ? 52 : 100, withered ? 20 : 34, withered ? 55 : 44,
      side * (1.05 + windLeaf) + windLeaf, 0.9);
    ctx.restore();
  }

  if (withered) {
    /* 凋谢：垂头 + 残留花萼 */
    const cg = ctx.createRadialGradient(topX - 1, topY - 1.5, 1, topX, topY, 6);
    cg.addColorStop(0, wc(44, 22, 62, 0.9)); cg.addColorStop(1, wc(36, 20, 40, 0.9));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(topX, topY, 4, 5.5, 0.4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const bloomT = stage >= 4 ? 1 : stage === 3 ? EG.clamp((g - 60) / 20, 0.15, 0.85) : 0;

  if (stage >= 3) {
    const size = 14 * p.size * (0.45 + bloomT * 0.55) * p.petalLen;
    const glowR = (p.glow || p.variant === 2) ? 34 * p.size : 0;
    const R = Math.ceil(Math.max(size * 2.3 + 10, glowR) + 2);
    const S = R * 2;
    /* 花头离屏缓存：绽放度/萎靡度量化，只有状态变化时才重新烘焙一次 */
    const bQ = Math.round(bloomT * 20) / 20, wQ = Math.round(wilt * 20) / 20;
    const key = p.species + '|' + p.variant + '|' + bQ + '|' + wQ + '|' + (colS | 0) + '|' + (colL | 0);
    let spr = p._head;
    if (!spr || p._headKey !== key || p._headS !== S) {
      const cw = Math.max(24, S);
      spr = newCv(cw, cw);
      const hc = spr.getContext('2d');
      hc.translate(cw / 2, cw / 2);
      if (glowR) {
        const gl = hc.createRadialGradient(0, -6, 2, 0, -6, glowR);
        gl.addColorStop(0, wc(p.hue, 45, 94, 0.34));
        gl.addColorStop(0.5, wc(p.hue, 45, 90, 0.13));
        gl.addColorStop(1, wc(p.hue, 45, 90, 0));
        hc.fillStyle = gl;
        hc.beginPath(); hc.arc(0, -6, glowR, 0, Math.PI * 2); hc.fill();
      }
      drawFlowerByShape(hc, p, bloomT, colS, colL, time, wilt);
      p._head = spr; p._headKey = key; p._headS = cw;
    }
    const cs = p._headS || S;
    ctx.save();
    ctx.translate(topX, topY);
    ctx.rotate(swayMain * 0.015 + swayFine * 0.012 + droopBend * 0.006 * (p.droop ? 1 : 0.3));
    ctx.drawImage(spr, -cs / 2, -cs / 2);
    ctx.restore();
  }

  /* 焦虑系薄雾 */
  if (p.mist && stage >= 3 && !(opts.lowFx)) {
    for (let i = 0; i < 3; i++) {
      const mx = topX + Math.sin(time * 0.5 + p.phase + i * 2.1) * 6;
      const my = topY - 8 + Math.cos(time * 0.42 + i * 1.7) * 5;
      const mg = ctx.createRadialGradient(mx, my, 1, mx, my, (13 + i * 4) * p.size);
      mg.addColorStop(0, wc(112, 14, 84, 0.14 + Math.sin(time * 0.8 + p.phase) * 0.03));
      mg.addColorStop(1, wc(112, 14, 84, 0));
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, (13 + i * 4) * p.size, 0, Math.PI * 2); ctx.fill();
    }
  }
};

function drawFlowerByShape(ctx, p, bloomT, colS, colL, time, wilt) {
  const size = 14 * p.size * (0.45 + bloomT * 0.55) * p.petalLen;
  const wiltTilt = wilt * 0.5;
  /* 花瓣依次展开：外圈先开，内圈后开 */
  const openK = (i, n) => EG.clamp((bloomT - (i / Math.max(1, n)) * 0.34) / 0.66, 0.10, 1);
  switch (p.shape) {
    case 'bell': {
      /* 垂挂铃铛：柄 + 钟形花冠 + 内壁阴影 + 唇缘高光 */
      const n = Math.max(3, Math.round(p.petals / 1.2));
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const px = (t - 0.5) * size * 1.5;
        const py = -size * 0.35 + Math.abs(t - 0.5) * size * 0.8 + i * size * 0.12;
        const k = openK(i, n);
        ctx.strokeStyle = wc(105, p.sat * 0.35, 42, 0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px * 0.4, py - size * 0.5); ctx.quadraticCurveTo(px * 0.8, py - size * 0.2, px, py); ctx.stroke();
        const grad = ctx.createLinearGradient(px - size * 0.3, py, px + size * 0.3, py + size * 0.7);
        grad.addColorStop(0, wc(p.hue + 4, colS, colL + 16, 0.95));
        grad.addColorStop(0.45, wc(p.hue, colS, colL + 4, 0.95));
        grad.addColorStop(1, wc(p.hue2, colS, colL - 12, 0.95));
        ctx.fillStyle = grad;
        const bh = size * 0.85 * (0.5 + k * 0.5);
        ctx.beginPath();
        ctx.moveTo(px - size * 0.28, py);
        ctx.quadraticCurveTo(px - size * 0.34, py + bh * 0.88, px, py + bh);
        ctx.quadraticCurveTo(px + size * 0.34, py + bh * 0.88, px + size * 0.28, py);
        ctx.closePath(); ctx.fill();
        /* 内壁暗部 + 唇缘受光 */
        ctx.save(); ctx.clip();
        const ig = ctx.createLinearGradient(px, py, px, py + bh);
        ig.addColorStop(0, 'rgba(30,20,40,.34)'); ig.addColorStop(0.6, 'rgba(30,20,40,0)');
        ctx.fillStyle = ig; ctx.fillRect(px - size * 0.5, py - size * 0.2, size, bh + size * 0.4);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - size * 0.24, py + bh * 0.94);
        ctx.quadraticCurveTo(px, py + bh * 1.06, px + size * 0.24, py + bh * 0.94); ctx.stroke();
      }
      break;
    }
    case 'cluster': {
      /* 小花簇成团：底部柔影 + 由内向外依次开放 */
      const n = p.petals;
      const R = size * 0.95;
      const rnd = EG.RNG(p.phase * 1000 | 0);
      const sg = ctx.createRadialGradient(0, -size * 0.1, size * 0.2, 0, -size * 0.1, R * 1.7);
      sg.addColorStop(0, 'rgba(40,34,24,.20)'); sg.addColorStop(1, 'rgba(40,34,24,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, -size * 0.1, R * 1.7, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2, rr = R * Math.sqrt(rnd()) * (p.droop ? 1.3 : 1);
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr - (p.droop ? size * 0.4 : size * 0.2);
        const k = EG.clamp((bloomT - rr / (R * 2.4)) / 0.7, 0.08, 1);
        drawMini(ctx, px, py, size * 0.27 * (0.55 + k * 0.45), p, colS, colL, 5);
      }
      break;
    }
    case 'spike': {
      /* 穗序：沿茎顶排列，自下而上依次开放 */
      const n = p.petals;
      ctx.strokeStyle = wc(102, p.sat * 0.4, 40, 0.6); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(0, size * 0.1); ctx.lineTo(0, -size * 1.95); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const px = Math.sin(t * 9 + p.phase) * size * 0.4;
        const py = -t * size * 1.9;
        const k = EG.clamp((bloomT - t * 0.5) / 0.5, 0.1, 1);
        const r0 = size * (0.30 - t * 0.12) * (0.5 + k * 0.5);
        drawMini(ctx, px, py, r0, p, colS, colL, 4);
        ctx.strokeStyle = wc(102, p.sat * 0.4, 42, 0.45); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px * 0.2, py + r0 * 0.4); ctx.quadraticCurveTo(px * 0.7, py, px, py + r0 * 0.1); ctx.stroke();
      }
      break;
    }
    case 'rosette': {
      /* 莲座厚叶 + 顶部小花：叶片带厚度与投影 */
      for (let i = 0; i < p.petals; i++) {
        const ang = -Math.PI / 2 + (i - p.petals / 2 + 0.5) * (Math.PI / (p.petals * 0.62));
        const k = openK(i, p.petals);
        ctx.save();
        ctx.translate(0, size * 0.35);
        ctx.strokeStyle = 'rgba(30,44,24,.20)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 2.5);
        ctx.quadraticCurveTo(Math.cos(ang) * size * 0.9, Math.sin(ang) * size * 0.9 + 2.5, Math.cos(ang) * size * 1.7, Math.sin(ang) * size * 1.7 + 2.5);
        ctx.stroke();
        drawPetal(ctx, size * (1.7 + (i % 2) * 0.35) * (0.55 + k * 0.45), 0.30, p.hue, p.sat * 0.5, 40 + (i % 3) * 4, ang, 0.94);
        ctx.restore();
      }
      if (bloomT > 0.6) { drawMini(ctx, 0, -size * 0.4, size * 0.3, p, colS, colL, 5); drawMini(ctx, size * 0.3, -size * 0.3, size * 0.24, p, colS, colL, 5); }
      break;
    }
    case 'spathe': {
      /* 佛焰苞一片 + 肉穗（带颗粒与高光） */
      ctx.save(); ctx.rotate(wiltTilt * 0.4);
      const sg = ctx.createRadialGradient(0, -size * 0.8, size * 0.2, 0, -size * 0.8, size * 1.9);
      sg.addColorStop(0, 'rgba(60,30,26,.18)'); sg.addColorStop(1, 'rgba(60,30,26,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, -size * 0.8, size * 1.9, 0, Math.PI * 2); ctx.fill();
      drawPetal(ctx, size * 1.7 * (0.5 + bloomT * 0.5), 1.05, p.hue, colS, colL, -0.12, 0.95);
      ctx.restore();
      const cg = ctx.createLinearGradient(size * 0.02, -size * 1.7, size * 0.22, -size * 0.4);
      cg.addColorStop(0, wc(52, 34, 72, 0.96)); cg.addColorStop(1, wc(42, 28, 50, 0.96));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(size * 0.12, -size * 1.05, size * 0.09, size * 0.62, 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(size * 0.12 + Math.sin(i * 2.1) * size * 0.05, -size * (0.5 + i * 0.16), size * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'vine': {
      /* 藤蔓卷须 + 沿途小花 */
      const rnd = EG.RNG((p.phase * 997) | 0);
      for (let i = 0; i < 3; i++) {
        const dir = i % 2 ? 1 : -1;
        const k = openK(i, 3);
        const ex = dir * size * (0.9 + rnd() * 0.5), ey = -size * 1.9;
        ctx.strokeStyle = 'rgba(30,48,26,.18)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(1.5, 1.5);
        ctx.bezierCurveTo(dir * size + 1.5, -size * 0.8 + 1.5, dir * size * 0.4 + 1.5, -size * 1.6 + 1.5, ex + 1.5, ey + 1.5);
        ctx.stroke();
        const vg = ctx.createLinearGradient(0, 0, ex, ey);
        vg.addColorStop(0, wc(104, p.sat * 0.4, 40, 0.85)); vg.addColorStop(1, wc(96, p.sat * 0.45, 52, 0.85));
        ctx.strokeStyle = vg; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(dir * size, -size * 0.8, dir * size * 0.4, -size * 1.6, ex, ey);
        ctx.stroke();
        if (i < 2) drawMini(ctx, dir * size * 0.85, -size * 1.5, size * 0.24 * (0.5 + k * 0.5), p, colS, colL, 5);
      }
      drawMini(ctx, 0, -size * 0.9, size * 0.3, p, colS, colL, 6);
      break;
    }
    case 'feather': {
      /* 细羽丝：渐变丝 + 端点亮斑 */
      const n = Math.max(8, p.petals);
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.25;
        const k = openK(i, n);
        const l = size * (1.1 + (i % 3) * 0.25) * (0.45 + k * 0.55);
        const ex = Math.cos(ang) * l, ey = Math.sin(ang) * l;
        const fg = ctx.createLinearGradient(0, 0, ex, ey);
        fg.addColorStop(0, wc(p.hue, colS, colL - 6, 0.5));
        fg.addColorStop(0.6, wc(p.hue, colS, colL + 6, 0.75));
        fg.addColorStop(1, wc(p.hue2, colS, colL + 12, 0.85));
        ctx.strokeStyle = fg; ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ex * 0.6, ey * 0.6 - l * 0.2, ex, ey);
        ctx.stroke();
        const gg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 3.2);
        gg.addColorStop(0, wc(p.hue2, colS * 0.9, colL + 20, 0.9));
        gg.addColorStop(1, wc(p.hue2, colS, colL + 6, 0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: {
      /* flower：放射花瓣 + 多层渐变 + 依次展开 + 花蕊细节 */
      const back = ctx.createRadialGradient(0, -size * 0.05, size * 0.18, 0, -size * 0.05, size * 1.18);
      back.addColorStop(0, wc(p.hue2, colS * 0.7, Math.max(18, colL - 26), 0.5));
      back.addColorStop(1, wc(p.hue2, colS * 0.6, Math.max(18, colL - 18), 0));
      ctx.fillStyle = back;
      ctx.beginPath(); ctx.arc(0, -size * 0.05, size * 1.18, 0, Math.PI * 2); ctx.fill();
      for (let layer = p.layers - 1; layer >= 0; layer--) {
        const n = Math.max(3, Math.round(p.petals * (1 - layer * 0.25)));
        const lr = size * (1 - layer * 0.22);
        for (let i = 0; i < n; i++) {
          const k = openK(i, n);
          const rot = (i / n) * Math.PI * 2 + layer * 0.5 + p.phase * 0.1;
          const droopAng = p.droop ? EG.clamp(Math.sin(rot) * 0.25, -0.3, 0.3) : 0;
          drawPetal(ctx, lr * k, p.petalW * (1 - layer * 0.15),
            p.hue + layer * 8, colS * (1 - layer * 0.12), colL - layer * 5,
            rot + droopAng + wiltTilt, 0.9 - layer * 0.06);
        }
      }
      drawStamen(ctx, Math.max(1.6, size * 0.3), p, colL);
      if (p.spots) drawSpots(ctx, size * 1.15, p.spots.n, p.phase, p.hue, colS, colL);
      break;
    }
  }
  /* 含苞未开：花萼包裹（带厚度与高光） */
  if (bloomT < 0.55) {
    const cg = ctx.createRadialGradient(-size * 0.1, size * 0.02, 1, 0, size * 0.15, size * 0.55);
    cg.addColorStop(0, wc(105, p.sat * 0.4, 54, 0.9));
    cg.addColorStop(1, wc(110, p.sat * 0.35, 36, 0.9));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(0, size * 0.15, size * 0.34, size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.ellipse(-size * 0.1, size * 0.05, size * 0.12, size * 0.2, -0.4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawMini(ctx, x, y, r, p, colS, colL, petals) {
  if (!(r > 0.2)) return;
  /* 花下的柔影，让小花从簇团里"浮"出来 */
  const sg = ctx.createRadialGradient(x, y + r * 0.45, 0, x, y + r * 0.45, r * 2);
  sg.addColorStop(0, 'rgba(46,38,26,.20)'); sg.addColorStop(1, 'rgba(46,38,26,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y + r * 0.45, r * 2, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < petals; i++) {
    drawPetal(ctx, r * 1.7, 0.5, p.hue + (i % 2) * 6, colS * 0.85, colL + 3, (i / petals) * Math.PI * 2 + p.phase * 0.07, 0.9);
  }
  ctx.restore();
  const cg = ctx.createRadialGradient(x - r * 0.2, y - r * 0.26, 0, x, y, r * 0.44);
  cg.addColorStop(0, wc(52, 72, 86, 0.96)); cg.addColorStop(1, wc(40, 66, 52, 0.96));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.42)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.12, y - r * 0.14, r * 0.13, r * 0.08, -0.6, 0, Math.PI * 2); ctx.fill();
}

/* ---------- 花盆 ---------- */
EG.drawPot = function (ctx, pot, scale = 1) {
  ctx.save(); ctx.scale(scale, scale);
  const w = 30, h = 20;
  /* 接触阴影：宽软影 + 紧实暗影，把花盆"钉"在地面上 */
  const gs = ctx.createRadialGradient(0, 1.6, 1, 0, 1.6, w * 0.85);
  gs.addColorStop(0, 'rgba(48,38,26,.34)');
  gs.addColorStop(0.5, 'rgba(48,38,26,.14)');
  gs.addColorStop(1, 'rgba(48,38,26,0)');
  ctx.fillStyle = gs;
  ctx.beginPath(); ctx.ellipse(0, 1.6, w * 0.85, 6.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(42,32,20,.30)';
  ctx.beginPath(); ctx.ellipse(0, 1.2, w * 0.46, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  /* 盆体：左受光、右背光的三段渐变 + 垂直环境遮蔽 */
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, EG.lighten(pot.rim, 6));
  grad.addColorStop(0.22, EG.lighten(pot.body, 18));
  grad.addColorStop(0.55, pot.body);
  grad.addColorStop(1, EG.lighten(pot.body, -26));
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (pot.shape === 'barrel') { ctx.roundRect(-w * 0.48, -h, w * 0.96, h, [3, 3, 6, 6]); }
  else if (pot.shape === 'rock') {
    ctx.moveTo(-w * 0.5, 0); ctx.quadraticCurveTo(-w * 0.55, -h * 0.9, -w * 0.2, -h * 0.95);
    ctx.quadraticCurveTo(0, -h * 1.08, w * 0.24, -h * 0.9);
    ctx.quadraticCurveTo(w * 0.56, -h * 0.8, w * 0.5, 0); ctx.closePath();
  } else if (pot.shape === 'jar') {
    ctx.moveTo(-w * 0.34, -h * 1.15); ctx.lineTo(-w * 0.40, -h * 0.9);
    ctx.quadraticCurveTo(-w * 0.52, -h * 0.4, -w * 0.40, 0); ctx.lineTo(w * 0.40, 0);
    ctx.quadraticCurveTo(w * 0.52, -h * 0.4, w * 0.40, -h * 0.9); ctx.lineTo(w * 0.34, -h * 1.15); ctx.closePath();
  } else {
    ctx.moveTo(-w * 0.44, -h * 0.92); ctx.lineTo(-w * 0.32, 0); ctx.lineTo(w * 0.32, 0); ctx.lineTo(w * 0.44, -h * 0.92); ctx.closePath();
  }
  ctx.fill();
  ctx.save(); ctx.clip();
  /* 盆体底部 AO + 顶部受光 */
  const ao = ctx.createLinearGradient(0, -h, 0, 6);
  ao.addColorStop(0, 'rgba(30,20,10,.06)');
  ao.addColorStop(0.55, 'rgba(30,20,10,0)');
  ao.addColorStop(1, 'rgba(30,20,10,.30)');
  ctx.fillStyle = ao; ctx.fillRect(-w, -h * 1.3, w * 2, h * 1.6);
  /* 左侧高光带 */
  const hlg = ctx.createLinearGradient(-w * 0.42, 0, -w * 0.12, 0);
  hlg.addColorStop(0, 'rgba(255,255,255,0)');
  hlg.addColorStop(0.5, 'rgba(255,255,255,.30)');
  hlg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlg; ctx.fillRect(-w * 0.5, -h * 1.3, w * 0.5, h * 1.6);
  ctx.restore();
  /* 盆口 */
  const rg = ctx.createLinearGradient(-w * 0.45, 0, w * 0.45, 0);
  rg.addColorStop(0, EG.lighten(pot.rim, 8));
  rg.addColorStop(0.4, EG.lighten(pot.rim, -6));
  rg.addColorStop(1, EG.lighten(pot.rim, -26));
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.92, w * (pot.shape === 'jar' ? 0.35 : 0.45), 3.2, 0, 0, Math.PI * 2); ctx.fill();
  /* 盆内土壤：径向暗部 + 颗粒 */
  const soilR = w * (pot.shape === 'jar' ? 0.27 : 0.37);
  const sg2 = ctx.createRadialGradient(-soilR * 0.3, -h * 0.98, 0.5, 0, -h * 0.92, soilR * 1.15);
  sg2.addColorStop(0, '#6b5238'); sg2.addColorStop(1, '#3f2f1e');
  ctx.fillStyle = sg2;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.92, soilR, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  const srnd = EG.RNG(pot.id + 'soil');
  ctx.fillStyle = 'rgba(28,20,12,.4)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc((srnd() - 0.5) * soilR * 1.5, -h * 0.92 + (srnd() - 0.5) * 2, 0.5 + srnd() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 盆口内壁受光弧 */
  ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.94, soilR * 1.12, 2.5, 0, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();
  /* 图案 */
  const pat = pot.pattern;
  if (pat !== 'none') {
    ctx.save();
    ctx.globalAlpha = 0.7;
    const rnd = EG.RNG(pot.id);
    if (pat === 'moss') { ctx.fillStyle = '#7BA05B'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((rnd() - 0.5) * w * 0.7, -h * 0.2 - rnd() * h * 0.5, 1.6 + rnd() * 2, 0, 7); ctx.fill(); } }
    if (pat === 'crackle') { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.7; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo((rnd() - 0.5) * w * 0.7, -rnd() * h); ctx.lineTo((rnd() - 0.5) * w * 0.7, -rnd() * h); ctx.stroke(); } }
    if (pat === 'cloud') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -h * 0.45, w * 0.22, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke(); ctx.beginPath(); ctx.arc(w * 0.16, -h * 0.55, w * 0.13, Math.PI, Math.PI * 2.2); ctx.stroke(); }
    if (pat === 'pebble') { for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#C98D5E', '#8FA06B', '#A8CBBE', '#D8D3E8'][i % 4]; ctx.beginPath(); ctx.arc((rnd() - 0.5) * w * 0.7, -h * 0.15 - rnd() * h * 0.6, 1.4 + rnd() * 1.4, 0, 7); ctx.fill(); } }
    if (pat === 'star') { ctx.fillStyle = '#F2A93B'; for (let i = 0; i < 4; i++) { const x = (rnd() - 0.5) * w * 0.6, y = -h * 0.2 - rnd() * h * 0.55; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); } }
    if (pat === 'sakura') { ctx.fillStyle = '#E8A8B8'; ctx.beginPath(); ctx.ellipse(w * 0.1, -h * 0.5, 3, 2, 0.6, 0, 7); ctx.fill(); }
    if (pat === 'moon') { ctx.fillStyle = '#F2E8B0'; ctx.beginPath(); ctx.arc(0, -h * 0.45, 3.4, 0, 7); ctx.fill(); ctx.fillStyle = pot.body; ctx.beginPath(); ctx.arc(1.6, -h * 0.52, 3, 0, 7); ctx.fill(); }
    if (pat === 'ink') { ctx.fillStyle = 'rgba(180,220,190,.35)'; ctx.beginPath(); ctx.arc(-w * 0.12, -h * 0.4, 2.6, 0, 7); ctx.fill(); }
    if (pat === 'honey') { ctx.fillStyle = 'rgba(255,240,180,.55)'; ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.2, h * 0.28, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
};

EG.lighten = function (col, amt) {
  const m = col.match(/^#([0-9a-f]{6})$/i);
  if (!m) return col;
  let n = parseInt(m[1], 16);
  const f = i => EG.clamp(((n >> i) & 255) + amt, 0, 255);
  return `rgb(${f(16)},${f(8)},${f(0)})`;
};

/* 图鉴缩略图 */
EG.drawPlantThumb = function (canvas, speciesId, seed, variant = 0, growth = 100) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 150, H = canvas.clientHeight || 92;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const p = EG.plantParams(speciesId, seed, variant);
  const sp = EG.PLANT_BY_ID[speciesId];
  ctx.save();
  ctx.translate(W / 2 - 4, H - 10);
  const sc = Math.min(1.15, (H - 24) / Math.max(40, p.stemH + 30));
  ctx.scale(sc, sc);
  EG.drawPot(ctx, EG.POT_BY_ID.pot_terra, 0.72);
  EG.drawPlantShape(ctx, p, { growth, time: 1, wind: 0.25 });
  void sp;
  ctx.restore();
};
