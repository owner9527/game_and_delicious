/* 星穹拓荒 — 渲染层：Canvas 2D，低多边形 + 霓虹光晕 */
window.SF = window.SF || {};
SF.render = (function () {
  'use strict';
  let cv, ctx, W, H, dpr = 1;
  let facetsCache = null, facetsKey = '';
  const parts = [];           // 粒子池（≤200）
  let stars = [];
  let t = 0;
  const perf = () => document.body.classList.contains('perfname');

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    // 以窗口尺寸为唯一真值；绝不用 clientWidth 反馈定尺寸（会正反馈膨胀）
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* 星野：三层视差 + 色温差异 + 少量亮星（十字星芒） */
  function starfield(n) {
    stars = [];
    const TINT = ['#CFE0FF', '#FFFFFF', '#FFE9C8', '#C9D8FF', '#A8C4FF', '#FFD9D0'];
    for (let i = 0; i < n; i++) {
      const layer = i % 3;                       // 0 远 / 1 中 / 2 近
      stars.push({
        x: Math.random() * 2400, y: Math.random() * 1600,
        s: (layer === 2 ? 1.1 : layer === 1 ? 0.8 : 0.55) * (0.6 + Math.random() * 1.1),
        tw: Math.random() * 6.28,
        d: 0.25 + layer * 0.35,
        c: TINT[(Math.random() * TINT.length) | 0],
        bright: Math.random() < 0.035,             // 亮星，画十字星芒
        layer,
      });
    }
  }

  /* ============ 深空背景层（一次性烘焙，避免每帧重算） ============ */
  let spaceLayer = null, spaceKey = '';
  function bakeSpace(w, h, salt) {
    const key = w + 'x' + h + '|' + salt;
    if (spaceLayer && spaceKey === key) return spaceLayer;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d');

    // 1) 深空底色：多段渐变，避免大片纯色
    const base = c.createLinearGradient(0, 0, w * 0.35, h);
    base.addColorStop(0, '#05060F');
    base.addColorStop(0.42, '#0B1026');
    base.addColorStop(0.72, '#0A0E22');
    base.addColorStop(1, '#04060E');
    c.fillStyle = base; c.fillRect(0, 0, w, h);

    // 2) 银河带：倾斜亮带 + 内部细密星点 + 暗尘
    c.save();
    c.translate(w * 0.5, h * 0.5); c.rotate(-0.42);
    const bh = h * 0.34;
    const band = c.createLinearGradient(0, -bh, 0, bh);
    band.addColorStop(0, 'rgba(120,150,255,0)');
    band.addColorStop(0.32, 'rgba(150,165,255,.10)');
    band.addColorStop(0.5, 'rgba(220,230,255,.18)');
    band.addColorStop(0.68, 'rgba(150,165,255,.10)');
    band.addColorStop(1, 'rgba(120,150,255,0)');
    c.fillStyle = band; c.fillRect(-w, -bh, w * 2, bh * 2);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 1100; i++) {
      const x = (Math.random() * 2 - 1) * w, y = (Math.random() * 2 - 1) * bh * 0.9;
      const a = (1 - Math.abs(y) / bh) * Math.random() * 0.55;
      if (a <= 0.02) continue;
      c.fillStyle = 'rgba(232,240,255,' + a.toFixed(3) + ')';
      const s = Math.random() < 0.86 ? 1 : 1.7;
      c.fillRect(x, y, s, s);
    }
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 46; i++) {
      const x = (Math.random() * 2 - 1) * w, y = (Math.random() * 2 - 1) * bh * 0.7, r = h * (0.02 + Math.random() * 0.09);
      const dg = c.createRadialGradient(x, y, 0, x, y, r);
      dg.addColorStop(0, 'rgba(4,6,16,.55)'); dg.addColorStop(1, 'rgba(4,6,16,0)');
      c.fillStyle = dg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.restore();

    // 3) 星云团：多层柔光叠加
    c.globalCompositeOperation = 'lighter';
    const NEB = [
      [0.16, 0.20, 0.60, '53,224,214', 0.11],
      [0.82, 0.28, 0.66, '140,105,200', 0.14],
      [0.62, 0.84, 0.74, '255,120,180', 0.075],
      [0.30, 0.72, 0.52, '90,140,255', 0.10],
      [0.50, 0.46, 0.40, '190,150,255', 0.05],
    ];
    for (const [fx, fy, fr, rgb, al] of NEB) {
      const R = Math.max(w, h) * fr;
      const g2 = c.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, R);
      g2.addColorStop(0, 'rgba(' + rgb + ',' + al + ')');
      g2.addColorStop(0.42, 'rgba(' + rgb + ',' + (al * 0.44).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g2; c.fillRect(0, 0, w, h);
    }
    // 4) 一层极细颗粒，消除渐变色带
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      c.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035).toFixed(3) + ')';
      c.fillRect(x, y, 1, 1);
    }
    spaceLayer = off; spaceKey = key;
    return off;
  }

  /* 柔和接触阴影：让物件"落"在地面上而不是浮着（用缓存精灵，避免每帧重建渐变） */
  let shadowSprite = null;
  function getShadowSprite() {
    if (shadowSprite) return shadowSprite;
    const S = 128;
    const cv2 = document.createElement('canvas');
    cv2.width = cv2.height = S;
    const c2 = cv2.getContext('2d');
    const g2 = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g2.addColorStop(0, 'rgba(0,0,0,1)');
    g2.addColorStop(0.52, 'rgba(0,0,0,.46)');
    g2.addColorStop(0.78, 'rgba(0,0,0,.14)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    c2.fillStyle = g2; c2.fillRect(0, 0, S, S);
    shadowSprite = cv2;
    return cv2;
  }
  function softShadow(x, y, rx, ry, a) {
    if (rx <= 0.4 || ry <= 0.4) return;
    ctx.save();
    ctx.globalAlpha = (a === undefined ? 0.34 : a);
    ctx.drawImage(getShadowSprite(), x - rx, y - ry, rx * 2, ry * 2);
    ctx.restore();
  }

  /* 暗角 + 冷色调分级：让画面像"一个场景"而不是拼贴 */
  let vigCache = null, vigKey = '';
  function vignette(w, h) {
    const key = w + 'x' + h;
    if (!vigCache || vigKey !== key) {
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const c = off.getContext('2d');
      const g2 = c.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.30, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(0.62, 'rgba(3,5,14,.20)');
      g2.addColorStop(1, 'rgba(2,3,10,.56)');
      c.fillStyle = g2; c.fillRect(0, 0, w, h);
      vigCache = off; vigKey = key;
    }
    ctx.drawImage(vigCache, 0, 0, w, h);
  }

  /* ============ 粒子 ============ */
  function burst(x, y, color, n, speed) {
    const cap = perf() ? 40 : 200;
    n = Math.min(n, cap - parts.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random()) * speed;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, max: 1, color, size: 1.5 + Math.random() * 2.5 });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  /* ============ 相机变换 ============ */
  function applyCam(g) {
    const cam = g.cam;
    ctx.save();
    let sx = 0, sy = 0;
    if (g.shake > 0) { sx = (Math.random() - 0.5) * g.shake * 16; sy = (Math.random() - 0.5) * g.shake * 16; }
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  }
  function screenToWorld(g, sx, sy) {
    const cam = g.cam;
    return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
  }

  /* ============ 地表缓存 ============ */
  /* ============ 地表缓存（含光照着色 / 纹理 / 陨石坑 / 边缘压暗） ============ */
  function hexRGB(col) {
    if (typeof col !== 'string') return null;
    let s = col.trim();
    if (s[0] === '#') {
      s = s.slice(1);
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      if (s.length < 6) return null;
      const n = parseInt(s.slice(0, 6), 16);
      if (isNaN(n)) return null;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(v => parseFloat(v)); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    return null;
  }
  const mixC = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgbC = (c, al) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (al === undefined ? 1 : al) + ')';

  let noisePat = null;
  function noisePattern(c) {
    if (noisePat) return noisePat;
    const nc = document.createElement('canvas');
    nc.width = nc.height = 128;
    const nx = nc.getContext('2d');
    const img = nx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() * 2 - 1) * 46;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 20 + Math.random() * 26;
    }
    nx.putImageData(img, 0, 0);
    noisePat = c.createPattern(nc, 'repeat');
    return noisePat;
  }

  function facetCanvas(g) {
    const key = g.seed + '|' + g.station;
    if (facetsCache && facetsKey === key) return facetsCache;
    const M = g.map;
    const off = document.createElement('canvas');
    const SC = 0.5;
    off.width = M.w * SC; off.height = M.h * SC;
    const c = off.getContext('2d');
    c.scale(SC, SC);

    // 统一光源方向：左上（与建筑高光方向一致）
    const LX = -0.55, LY = -0.84;
    for (const f of M.facets) {
      const p0 = f.pts[0], p1 = f.pts[1], p2 = f.pts[2];
      c.beginPath();
      c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y);
      c.closePath();

      const col = hexRGB(f.color);
      if (!col) { c.fillStyle = f.color; c.fill(); continue; }

      // 用三角形"面朝向"近似决定明暗，制造低多边形棱面体积感
      const ex = (p1.x - p0.x + p2.x - p0.x) * 0.5, ey = (p1.y - p0.y + p2.y - p0.y) * 0.5;
      const el = Math.hypot(ex, ey) || 1;
      const dot = (ex / el) * LX + (ey / el) * LY;
      const lit = 0.5 + dot * 0.5;
      const hi = mixC(col, [255, 255, 255], 0.06 + lit * 0.30);
      const lo = mixC(col, [0, 0, 0], 0.06 + (1 - lit) * 0.30);

      const cx = (p0.x + p1.x + p2.x) / 3, cy = (p0.y + p1.y + p2.y) / 3;
      const R = Math.max(6, Math.max(Math.abs(p1.x - p0.x), Math.abs(p2.y - p0.y)) * 0.9);
      const gr = c.createLinearGradient(cx + LX * R, cy + LY * R, cx - LX * R, cy - LY * R);
      gr.addColorStop(0, rgbC(hi));
      gr.addColorStop(0.55, rgbC(col));
      gr.addColorStop(1, rgbC(lo));
      c.fillStyle = gr;
      c.fill();

      // 面与面之间的细缝，强化棱面质感
      c.strokeStyle = rgbC(mixC(col, [0, 0, 0], 0.42), 0.30);
      c.lineWidth = 0.7;
      c.stroke();
    }

    // 地表噪点纹理
    const pat = noisePattern(c);
    if (pat) {
      c.save();
      c.globalCompositeOperation = 'overlay';
      c.fillStyle = pat;
      c.fillRect(0, 0, M.w, M.h);
      c.restore();
    }

    // 陨石坑 / 暗斑，避免地表过于均匀
    const nBlob = Math.min(90, Math.round(M.w * M.h / 26000) + 24);
    for (let i = 0; i < nBlob; i++) {
      const x = Math.random() * M.w, y = Math.random() * M.h, r = 14 + Math.random() * 46;
      const dg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      dg.addColorStop(0, 'rgba(0,0,0,.20)');
      dg.addColorStop(0.55, 'rgba(0,0,0,.08)');
      dg.addColorStop(0.72, 'rgba(255,255,255,.05)');
      dg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = dg;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }

    // 上下边缘压暗，让地表像一块"浮空陆地"
    const vg = c.createLinearGradient(0, 0, 0, M.h);
    vg.addColorStop(0, 'rgba(4,6,16,.40)');
    vg.addColorStop(0.22, 'rgba(4,6,16,.05)');
    vg.addColorStop(0.8, 'rgba(4,6,16,0)');
    vg.addColorStop(0.94, 'rgba(4,6,16,.30)');
    vg.addColorStop(1, 'rgba(4,6,16,.60)');
    c.fillStyle = vg; c.fillRect(0, 0, M.w, M.h);

    facetsCache = off; facetsKey = key;
    return off;
  }

  /* ============ 建筑绘制 ============ */
  function neon(x0, y0, x1, y1, x2, y2, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }
  function box(x, y, w, h, fill, stroke, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, r || 3);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function glowDot(x, y, r, color) {
    if (!perf()) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawBuilding(g, b, isNight) {
    const x = b.x, y = b.y, d = b.def;
    const cy = '#35E0D6', dim = 'rgba(53,224,214,.5)';
    if (!b.built) {
      // 施工虚影
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,224,102,.75)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, d.size * 30, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const p = b.progress / d.buildTime;
      ctx.fillStyle = 'rgba(255,224,102,.16)';
      ctx.beginPath(); ctx.arc(x, y, d.size * 30 * p, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFE066'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.floor(p * 100) + '%', x, y - d.size * 30 - 6);
      return;
    }
    const R = d.size * 30;
    // 接触阴影：让建筑"落"在地表上而不是浮着
    softShadow(x, y + R * 0.30, R * 1.55, R * 0.62, 0.42);
    // 主体用渐变而非纯色块（统一左上光源），每个案例里的 fillStyle=body 都会自动受益
    const bg2 = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
    bg2.addColorStop(0, 'rgba(52,78,126,.96)');
    bg2.addColorStop(0.42, 'rgba(24,38,72,.95)');
    bg2.addColorStop(1, 'rgba(10,16,34,.95)');
    let body = bg2, line = cy;
    if (g.sel === b.id) { line = '#FFFFFF'; }
    switch (b.type) {
      case 'command': {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          const px = x + Math.cos(a) * R * 1.15, py = y + Math.sin(a) * R * 1.15;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fillStyle = body; ctx.fill();
        ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
        glowDot(x, y, R * 0.32, isNight ? '#7FE8FF' : cy);
        ctx.strokeStyle = line; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, y - R * 1.1); ctx.lineTo(x, y - R * 1.7); ctx.stroke();
        glowDot(x, y - R * 1.75, 2.4, '#FF8A3D');
        break;
      }
      case 'housing': box(x, y, R * 1.7, R * 1.25, body, line, 4); box(x, y - R * 0.2, R * 1.2, R * 0.4, 'rgba(53,224,214,.16)', null, 2); break;
      case 'mine': neon(x, y - R * 0.8, x - R * 0.85, y + R * 0.7, x + R * 0.85, y + R * 0.7, body, line); glowDot(x, y + R * 0.28, R * 0.2, '#FFB05C'); break;
      case 'farm': {
        ctx.beginPath(); ctx.arc(x, y, R * 0.95, Math.PI, 0); ctx.closePath();
        ctx.fillStyle = 'rgba(125,216,113,.14)'; ctx.fill();
        ctx.strokeStyle = line; ctx.stroke();
        ctx.strokeStyle = 'rgba(125,216,113,.8)'; ctx.lineWidth = 1.2;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * R * 0.45, y); ctx.lineTo(x + i * R * 0.45, y - R * 0.7 + Math.abs(i) * R * 0.18); ctx.stroke(); }
        break;
      }
      case 'solar': box(x, y, R * 1.8, R * 1.1, 'rgba(53,110,224,.2)', line, 2);
        ctx.strokeStyle = dim; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - R * 0.6, y); ctx.lineTo(x + R * 0.6, y); ctx.moveTo(x, y - R * 0.45); ctx.lineTo(x, y + R * 0.45); ctx.stroke(); break;
      case 'generator': {
        ctx.beginPath(); ctx.arc(x, y, R * 0.85, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
        ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
        const rot = t * 2.2;
        ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a = rot + i * Math.PI * 2 / 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6); ctx.stroke();
        }
        break;
      }
      case 'lab': box(x, y, R * 1.6, R * 1.15, body, line, 3);
        ctx.beginPath(); ctx.arc(x + R * 0.55, y - R * 0.55, R * 0.42, -0.6, 2.2); ctx.strokeStyle = '#7FB4FF'; ctx.lineWidth = 1.6; ctx.stroke(); break;
      case 'medbay': box(x, y, R * 1.5, R * 1.3, body, line, 3);
        ctx.fillStyle = '#E8465A'; box(x, y, R * 0.9, R * 0.28, '#E8465A'); box(x, y, R * 0.28, R * 0.9, '#E8465A'); break;
      case 'warehouse': box(x, y, R * 1.85, R * 1.3, body, line, 2);
        ctx.strokeStyle = dim; ctx.beginPath(); ctx.moveTo(x - R * 0.3, y - R * 0.6); ctx.lineTo(x - R * 0.3, y + R * 0.6); ctx.moveTo(x + R * 0.3, y - R * 0.6); ctx.lineTo(x + R * 0.3, y + R * 0.6); ctx.stroke(); break;
      case 'rec': box(x, y, R * 1.6, R * 1.25, body, line, 6); ctx.fillStyle = '#F0A6FF'; ctx.font = (R * 0.9) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♪', x, y + 1); ctx.textBaseline = 'alphabetic'; break;
      case 'shield': {
        ctx.beginPath(); ctx.arc(x, y, R * 0.7, 0, Math.PI * 2); ctx.fillStyle = 'rgba(53,224,214,.12)'; ctx.fill();
        ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
        ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(53,224,214,.28)';
        ctx.beginPath(); ctx.arc(x, y, d.shield.radius * 34, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        break;
      }
      case 'turret': {
        neon(x, y + R * 0.6, x - R * 0.8, y + R * 0.6, x + R * 0.8, y + R * 0.6, body, line);
        box(x, y - R * 0.1, R * 1.1, R * 0.85, body, line, 3);
        const tgt = b.targetId && g._entById ? g._entById(b.targetId) : null;
        let a = -Math.PI / 2;
        if (tgt) a = Math.atan2(tgt.y - y, tgt.x - x);
        ctx.strokeStyle = line; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * R * 1.05, y + Math.sin(a) * R * 1.05); ctx.stroke();
        if (b.laserT > 0 && tgt) {
          ctx.strokeStyle = 'rgba(53,224,214,.9)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
        }
        break;
      }
      case 'radtower': {
        ctx.strokeStyle = line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - R * 0.5, y + R * 0.7); ctx.lineTo(x, y - R * 0.9); ctx.lineTo(x + R * 0.5, y + R * 0.7); ctx.stroke();
        const rr = R * (1.2 + 0.5 * Math.sin(t * 3));
        ctx.strokeStyle = 'rgba(125,216,113,.5)';
        ctx.beginPath(); ctx.arc(x, y - R * 0.9, rr, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'beacon': {
        neon(x, y + R * 0.75, x - R * 0.5, y + R * 0.75, x + R * 0.5, y + R * 0.75, body, line);
        ctx.beginPath(); ctx.moveTo(x - R * 0.34, y + R * 0.7); ctx.lineTo(x, y - R * 1.8); ctx.lineTo(x + R * 0.34, y + R * 0.7);
        ctx.closePath(); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
        const p = b.charged ? 1 : (b.charge / (d.chargeTime * g.mods.beaconCharge));
        glowDot(x, y - R * 1.8, 3 + p * 3, p >= 1 ? '#FFFFFF' : '#7FE8FF');
        if (!b.charged) {
          ctx.strokeStyle = 'rgba(127,232,255,.5)';
          ctx.beginPath(); ctx.arc(x, y - R * 1.8, 6 + (t * 30 % 22), 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,.5)';
          ctx.beginPath(); ctx.arc(x, y - R * 1.8, 8 + (t * 40 % 30), 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
    }
    // 夜景：建筑窗户暖光与整体辉光
    if (isNight && !perf()) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wg = ctx.createRadialGradient(x, y, 0, x, y, R * 2.1);
      wg.addColorStop(0, 'rgba(255,206,130,.20)');
      wg.addColorStop(0.5, 'rgba(255,180,110,.08)');
      wg.addColorStop(1, 'rgba(255,180,110,0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(x, y, R * 2.1, 0, Math.PI * 2); ctx.fill();
      // 几扇亮着的窗
      const nWin = 3;
      for (let i = 0; i < nWin; i++) {
        const wx = x + (i - (nWin - 1) / 2) * R * 0.46;
        const wy = y - R * 0.18 + Math.sin(t * 1.3 + i * 2 + b.id) * R * 0.06;
        ctx.fillStyle = 'rgba(255,222,150,' + (0.45 + 0.25 * Math.sin(t * 2 + i + b.id)) + ')';
        ctx.fillRect(wx - R * 0.10, wy - R * 0.12, R * 0.20, R * 0.24);
      }
      ctx.restore();
    }
    // 血条
    if (b.hp < b.maxHp) {
      const w = R * 1.6, yy = y + R + 7;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - w / 2, yy, w, 3.5);
      const ratio = b.hp / b.maxHp;
      ctx.fillStyle = ratio > 0.5 ? '#7DD871' : ratio > 0.25 ? '#FF8A3D' : '#E8465A';
      ctx.fillRect(x - w / 2, yy, w * ratio, 3.5);
    }
    // 护盾受击闪光
    if (b.def.shield && b.shield < b.shieldMax * 0.999) {
      ctx.strokeStyle = 'rgba(53,224,214,' + (0.15 + 0.25 * (b.shield / (b.shieldMax || 1))) + ')';
      ctx.beginPath(); ctx.arc(x, y, d.shield.radius * 34, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* ============ 主渲染 ============ */
  function frame(g, dt) {
    t += dt;
    // 视口尺寸自愈（浏览器面板缩放/窗口变化后保持点击映射与清晰度）
    if (cv.clientWidth !== W || cv.clientHeight !== H) resize();
    updateParts(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景：烘焙深空层（星云/银河/颗粒）+ 视差星野
    const bgW = Math.max(900, Math.min(1600, W)), bgH = Math.max(600, Math.min(1000, H));
    const sp = bakeSpace(bgW, bgH, 0);
    const camX = g ? g.cam.x : 0, camY = g ? g.cam.y : 0, camZ = g ? g.cam.zoom : 1;
    const ox = -(((camX * 0.05 * camZ) % W) + W) % W;
    const oy = -(((camY * 0.05 * camZ) % H) + H) % H;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.drawImage(sp, ox + i * W, oy + j * H, W, H);
    }

    if (!stars.length) starfield(200);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      const par = 0.10 + s.layer * 0.14;
      const sx = (s.x - camX * par * camZ * 0.3) % 2400, sy = (s.y - camY * par * camZ * 0.3) % 1600;
      const px = ((sx + 2400) % 2400) * (W / 2400), py = ((sy + 1600) % 1600) * (H / 1600);
      const a = (0.30 + 0.45 * Math.abs(Math.sin(t * (0.5 + s.layer * 0.35) + s.tw))) * (0.55 + s.layer * 0.22);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.c;
      const sz = s.s * (0.8 + s.layer * 0.25);
      ctx.fillRect(px, py, sz, sz);
      if (s.bright) {
        // 亮星：柔光晕 + 十字星芒
        const R = 5 + s.s * 4;
        const g3 = ctx.createRadialGradient(px, py, 0, px, py, R);
        g3.addColorStop(0, 'rgba(255,255,255,.55)');
        g3.addColorStop(0.4, 'rgba(190,215,255,.20)');
        g3.addColorStop(1, 'rgba(190,215,255,0)');
        ctx.fillStyle = g3;
        ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(226,238,255,.42)'; ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(px - R * 1.9, py); ctx.lineTo(px + R * 1.9, py);
        ctx.moveTo(px, py - R * 1.9); ctx.lineTo(px, py + R * 1.9);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (!g) return;

    applyCam(g);
    const cam = g.cam;
    const vx0 = cam.x - W / 2 / cam.zoom, vy0 = cam.y - H / 2 / cam.zoom;
    const vx1 = cam.x + W / 2 / cam.zoom, vy1 = cam.y + H / 2 / cam.zoom;
    const isNight = g.dayPhase >= 0.62;

    // 地表
    ctx.drawImage(facetCanvas(g), 0, 0, g.map.w, g.map.h);
    // 地表边界
    ctx.strokeStyle = 'rgba(53,224,214,.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, g.map.w, g.map.h);

    // 岩石：接触阴影 + 受光渐变 + 棱面高光
    for (const r of g.map.rocks) {
      if (r.x < vx0 - 40 || r.x > vx1 + 40 || r.y < vy0 - 40 || r.y > vy1 + 40) continue;
      softShadow(r.x, r.y + r.s * 0.45, r.s * 1.15, r.s * 0.5, 0.30);
      const rg = ctx.createRadialGradient(r.x - r.s * 0.38, r.y - r.s * 0.42, r.s * 0.08, r.x, r.y, r.s * 0.9);
      if (r.c) {
        rg.addColorStop(0, 'rgba(216,206,238,.46)');
        rg.addColorStop(0.6, 'rgba(168,156,200,.32)');
        rg.addColorStop(1, 'rgba(92,84,120,.34)');
      } else {
        rg.addColorStop(0, 'rgba(178,168,196,.40)');
        rg.addColorStop(0.6, 'rgba(128,118,150,.32)');
        rg.addColorStop(1, 'rgba(64,58,84,.34)');
      }
      ctx.beginPath(); ctx.arc(r.x, r.y, r.s * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = rg; ctx.fill();
      ctx.strokeStyle = 'rgba(226,220,255,.20)'; ctx.lineWidth = 0.9; ctx.stroke();
      // 棱面高光
      ctx.beginPath();
      ctx.arc(r.x - r.s * 0.22, r.y - r.s * 0.26, r.s * 0.34, Math.PI * 0.9, Math.PI * 1.9);
      ctx.strokeStyle = 'rgba(255,255,255,.26)'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // 资源节点
    for (const n of g.map.nodes) {
      if (n.amount <= 0) continue;
      if (n.x < vx0 - 60 || n.x > vx1 + 60 || n.y < vy0 - 60 || n.y > vy1 + 60) continue;
      const amount = n.amount / n.max;
      if (n.type === 'ore') {
        const s = 10 + amount * 9 + (n.rich ? 6 : 0);
        glowDot(n.x, n.y, s * 0.42, n.rich ? '#FFD53D' : '#B87A3A');
        ctx.strokeStyle = n.rich ? '#FFE066' : '#FFB05C'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s * 0.75, n.y); ctx.lineTo(n.x, n.y + s * 0.8); ctx.lineTo(n.x - s * 0.75, n.y);
        ctx.closePath(); ctx.stroke();
      } else {
        const s = 9 + amount * 8 + (n.rich ? 5 : 0);
        const wob = Math.sin(t * 2 + n.id) * 1.5;
        glowDot(n.x, n.y + wob, s * 0.5, n.rich ? '#A8F0A0' : 'rgba(125,216,113,.55)');
        ctx.strokeStyle = '#7DD871'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(n.x, n.y + wob, s, 0.4, Math.PI - 0.4); ctx.stroke();
      }
      if (n.rich) {
        ctx.strokeStyle = 'rgba(255,224,102,.4)';
        ctx.beginPath(); ctx.arc(n.x, n.y, 22 + (t * 20 % 16), 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 降落区光环
    if (g.site) {
      ctx.strokeStyle = 'rgba(53,224,214,.35)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(g.site.x, g.site.y, 60, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 建筑
    for (const b of g.buildings) drawBuilding(g, b, isNight);

    // 星兽：接触阴影 + 体积渐变 + 双眼辉光 + 呼吸脉动
    for (const k of g.beasts) {
      const wob = Math.sin(t * 6 + k.wob) * 2;
      const breathe = 1 + Math.sin(t * 3.4 + k.wob) * 0.05;
      softShadow(k.x, k.y + 9, 15, 6, 0.42);
      ctx.save();
      ctx.translate(k.x, k.y + wob); ctx.scale(breathe, breathe);
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(-10, 8); ctx.lineTo(0, 3); ctx.lineTo(10, 8);
      ctx.closePath();
      const bgr = ctx.createLinearGradient(-9, -11, 9, 8);
      bgr.addColorStop(0, 'rgba(168,44,62,.95)');
      bgr.addColorStop(0.5, 'rgba(96,20,34,.95)');
      bgr.addColorStop(1, 'rgba(38,8,16,.96)');
      ctx.fillStyle = bgr; ctx.fill();
      ctx.strokeStyle = 'rgba(255,110,132,.9)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      // 双眼
      glowDot(k.x - 3.4, k.y - 2 + wob, 1.5, '#FF6A80');
      glowDot(k.x + 3.4, k.y - 2 + wob, 1.5, '#FF6A80');
      const w = 24, yy = k.y + 14;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(k.x - w / 2, yy, w, 3);
      const kr = Math.max(0, k.hp / k.maxHp);
      const kg = ctx.createLinearGradient(k.x - w / 2, 0, k.x + w / 2, 0);
      kg.addColorStop(0, '#FF8A9E'); kg.addColorStop(1, '#C41E3A');
      ctx.fillStyle = kg; ctx.fillRect(k.x - w / 2, yy, w * kr, 3);
    }

    // 海盗：体积渐变 + 引擎尾焰
    for (const p of g.pirates) {
      softShadow(p.x, p.y + 10, 13, 5, 0.40);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(p.phase === 'flee' ? -0.6 : 0.5);
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-9, 9); ctx.lineTo(9, 9); ctx.closePath();
      const pgr = ctx.createLinearGradient(-8, -12, 8, 9);
      pgr.addColorStop(0, 'rgba(172,134,255,.96)');
      pgr.addColorStop(0.5, 'rgba(88,50,150,.95)');
      pgr.addColorStop(1, 'rgba(32,16,64,.96)');
      ctx.fillStyle = pgr; ctx.fill();
      ctx.strokeStyle = '#C9A6FF'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      // 引擎辉光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(p.x, p.y + 11, 0, p.x, p.y + 11, 9);
      eg.addColorStop(0, 'rgba(206,160,255,.55)');
      eg.addColorStop(1, 'rgba(160,110,255,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(p.x, p.y + 11, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      glowDot(p.x, p.y + 10, 2, '#D9B8FF');
      const w = 24, yy = p.y + 16;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(p.x - w / 2, yy, w, 3);
      const pg2 = ctx.createLinearGradient(p.x - w / 2, 0, p.x + w / 2, 0);
      pg2.addColorStop(0, '#D9B8FF'); pg2.addColorStop(1, '#8A5CFF');
      ctx.fillStyle = pg2;
      ctx.fillRect(p.x - w / 2, yy, w * Math.max(0, p.hp / (70 + g.threat * 18)), 3);
    }

    // 陨石
    for (const m of g.meteors) {
      const p = Math.min(1, m.t / m.dur);
      const ease = p * p;
      const x = m.sx + (m.tx - m.sx) * ease, y = m.sy + (m.ty - m.sy) * ease;
      ctx.strokeStyle = 'rgba(255,138,61,.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (m.tx - m.sx) * 0.12, y - (m.ty - m.sy) * 0.12); ctx.stroke();
      glowDot(x, y, 5, '#FF8A3D');
      // 落点预警圈
      ctx.strokeStyle = 'rgba(232,70,90,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(m.tx, m.ty, 2.4 * 34 * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 殖民者：接触阴影 + 体积渐变 + 高光
    for (const c of g.colonists) {
      if (c.x < vx0 - 30 || c.x > vx1 + 30 || c.y < vy0 - 30 || c.y > vy1 + 30) continue;
      softShadow(c.x, c.y + 4.6, 6.5, 3, 0.38);
      const base = c.infected ? [125, 216, 113] : [128, 152, 224];
      const cg = ctx.createRadialGradient(c.x - 1.8, c.y - 2, 0.6, c.x, c.y, 5.4);
      cg.addColorStop(0, 'rgba(255,255,255,.85)');
      cg.addColorStop(0.42, 'rgba(' + base[0] + ',' + base[1] + ',' + base[2] + ',1)');
      cg.addColorStop(1, 'rgba(' + (base[0] * 0.36 | 0) + ',' + (base[1] * 0.36 | 0) + ',' + (base[2] * 0.42 | 0) + ',1)');
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.stroke();
      const ratio = c.hp / c.maxHp;
      if (ratio < 0.999) {
        ctx.beginPath(); ctx.arc(c.x, c.y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.strokeStyle = ratio > 0.5 ? '#7DD871' : ratio > 0.25 ? '#FF8A3D' : '#E8465A';
        ctx.lineWidth = 1.8; ctx.stroke();
      }
      if (c.infected) {
        ctx.strokeStyle = 'rgba(125,216,113,' + (0.4 + 0.3 * Math.sin(t * 5)) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 粒子
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // 浮字
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    for (const f of g.floaters) {
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 放置虚影
    if (this_ && this_.ghost) drawGhost(g);

    // 教程标记
    if (this_ && this_.marker) {
      const mk = this_.marker;
      ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 2.4;
      const rr = 26 + Math.sin(t * 4) * 5;
      ctx.beginPath(); ctx.arc(mk.x, mk.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mk.x, mk.y - rr - 16); ctx.lineTo(mk.x - 7, mk.y - rr - 5); ctx.lineTo(mk.x + 7, mk.y - rr - 5);
      ctx.closePath(); ctx.fillStyle = '#FFE066'; ctx.fill();
    }

    ctx.restore(); // 相机结束

    /* ---- 全屏氛围叠加 ---- */
    // 昼夜
    const nightA = isNight ? Math.min(0.42, (g.dayPhase - 0.62) / 0.38 * 0.42 + 0.1) : Math.max(0, 0.18 - g.dayPhase * 0.9);
    ctx.fillStyle = 'rgba(8,12,40,' + nightA.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);

    if (g.aura.storm > 0) {
      ctx.fillStyle = 'rgba(30,20,70,.28)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(150,120,255,.16)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 8; i++) {
        const yy = ((t * 260 + i * 170) % (H + 200)) - 100;
        const xx = (i * 337 + t * 60) % W;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 26, yy + 42); ctx.stroke();
      }
    }
    if (g.aura.flare > 0) { ctx.fillStyle = 'rgba(255,140,60,.13)'; ctx.fillRect(0, 0, W, H); }
    if (g.aura.radburst > 0) { ctx.fillStyle = 'rgba(125,216,113,.09)'; ctx.fillRect(0, 0, W, H); }

    // 事件边缘光效
    const crisis = g.activeEvt && ['beast', 'pirate', 'quake'].includes(g.activeEvt.def.id);
    const warn = g.warnEvt || g.activeEvt;
    if (warn && !perf()) {
      const col = crisis ? '232,70,90' : '255,138,61';
      const a = 0.12 + 0.07 * Math.sin(t * 5);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, 'rgba(' + col + ',0)');
      gr.addColorStop(1, 'rgba(' + col + ',' + a.toFixed(3) + ')');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }

    /* ---- 色彩分级 + 暗角：统一画面氛围 ---- */
    if (!perf()) {
      // 轻微的冷暖分离（上冷下暖），让地表与天幕层次分开
      const grade = ctx.createLinearGradient(0, 0, 0, H);
      grade.addColorStop(0, 'rgba(58,86,168,.10)');
      grade.addColorStop(0.5, 'rgba(0,0,0,0)');
      grade.addColorStop(1, 'rgba(150,86,40,.08)');
      ctx.fillStyle = grade; ctx.fillRect(0, 0, W, H);
      vignette(W, H);
    }
  }

  /* 放置虚影状态由 ui 写入 */
  let this_ = null;

  function drawGhost(g) {
    const gh = this_.ghost;
    if (!gh) return;
    const d = SF.data.BUILDINGS[gh.typeId];
    const ok = gh.ok;
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(gh.x, gh.y, d.size * 30, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(53,224,214,.2)' : 'rgba(232,70,90,.22)'; ctx.fill();
    ctx.strokeStyle = ok ? '#35E0D6' : '#E8465A'; ctx.lineWidth = 2; ctx.stroke();
    if (d.adjRange) {
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(gh.x, gh.y, d.adjRange * 34, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d.shield) {
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(gh.x, gh.y, d.shield.radius * 34, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = ok ? '#7DD871' : '#FF9AA8';
    ctx.fillText(ok ? d.name : (gh.why || '不可建造'), gh.x, gh.y - d.size * 30 - 8);
  }

  /* ============ 小地图 ============ */
  function minimap(g, mcv) {
    const c = mcv.getContext('2d');
    const mw = mcv.width, mh = mcv.height;
    c.clearRect(0, 0, mw, mh);
    const M = g.map;
    const sx = mw / M.w, sy = mh / M.h;

    // 底：深空渐变 + 细网格，替代纯色块
    const mg = c.createLinearGradient(0, 0, mw, mh);
    mg.addColorStop(0, 'rgba(8,12,32,.94)');
    mg.addColorStop(0.5, 'rgba(12,18,44,.92)');
    mg.addColorStop(1, 'rgba(6,9,24,.94)');
    c.fillStyle = mg; c.fillRect(0, 0, mw, mh);
    c.strokeStyle = 'rgba(53,224,214,.07)'; c.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      c.beginPath(); c.moveTo(mw * i / 6, 0); c.lineTo(mw * i / 6, mh); c.stroke();
      c.beginPath(); c.moveTo(0, mh * i / 6); c.lineTo(mw, mh * i / 6); c.stroke();
    }

    // 资源节点：带光晕的菱形/圆点
    for (const n of M.nodes) {
      if (n.amount <= 0) continue;
      const x = n.x * sx, y = n.y * sy;
      const col = n.type === 'ore' ? (n.rich ? '#FFE066' : '#FFB05C') : (n.rich ? '#A8F0A0' : '#7DD871');
      const rg = c.createRadialGradient(x, y, 0, x, y, 4.5);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
    }

    // 建筑：方块 + 上沿高光
    for (const b of g.buildings) {
      const x = b.x * sx, y = b.y * sy;
      const bg = c.createLinearGradient(x - 2, y - 2, x + 2, y + 2);
      bg.addColorStop(0, '#9DF3EC'); bg.addColorStop(1, '#1E8E92');
      c.fillStyle = bg;
      c.beginPath(); c.roundRect ? c.roundRect(x - 1.9, y - 1.9, 3.8, 3.8, 1) : c.rect(x - 1.9, y - 1.9, 3.8, 3.8);
      c.fill();
    }

    // 威胁：红色脉冲光点
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 3));
    for (const k of g.beasts.concat(g.pirates)) {
      const x = k.x * sx, y = k.y * sy;
      const rg = c.createRadialGradient(x, y, 0, x, y, 6);
      rg.addColorStop(0, 'rgba(255,90,110,' + (0.75 * pulse).toFixed(2) + ')');
      rg.addColorStop(1, 'rgba(232,70,90,0)');
      c.fillStyle = rg;
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#E8465A';
      c.beginPath(); c.arc(x, y, 1.5, 0, Math.PI * 2); c.fill();
    }

    // 陨石落点
    c.fillStyle = '#FF8A3D';
    for (const mte of g.meteors) {
      const x = mte.tx * sx, y = mte.ty * sy;
      c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,138,61,.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, 3.4 + (t * 6 % 4), 0, Math.PI * 2); c.stroke();
    }

    // 降落场
    const stx = g.site.x * sx, sty = g.site.y * sy;
    c.fillStyle = '#9FB4FF';
    c.beginPath(); c.arc(stx, sty, 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(159,180,255,.7)'; c.lineWidth = 1;
    c.beginPath(); c.arc(stx, sty, 4 + Math.sin(t * 2.4) * 1.2, 0, Math.PI * 2); c.stroke();

    // 视口框
    const vw = W / g.cam.zoom * sx, vh = H / g.cam.zoom * sy;
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.2;
    c.strokeRect(g.cam.x * sx - vw / 2, g.cam.y * sy - vh / 2, vw, vh);
    c.strokeStyle = 'rgba(53,224,214,.35)';
    c.strokeRect(g.cam.x * sx - vw / 2 - 1, g.cam.y * sy - vh / 2 - 1, vw + 2, vh + 2);

    // 内描边 + 暗角
    c.strokeStyle = 'rgba(96,150,220,.45)'; c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, mw - 1, mh - 1);
    const vgn = c.createRadialGradient(mw / 2, mh / 2, Math.min(mw, mh) * 0.3, mw / 2, mh / 2, Math.max(mw, mh) * 0.7);
    vgn.addColorStop(0, 'rgba(0,0,0,0)');
    vgn.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vgn; c.fillRect(0, 0, mw, mh);
  }

  /* ============ 菜单背景 ============ */
  function menuBg(canvas, dt) {
    const c = canvas.getContext('2d');
    const w = canvas.width = Math.max(1, window.innerWidth), h = canvas.height = Math.max(1, window.innerHeight);
    if (!stars.length) starfield(220);
    // 烘焙深空层（星云/银河/颗粒）
    c.drawImage(bakeSpace(Math.max(900, Math.min(1600, w)), Math.max(600, Math.min(1000, h)), 1), 0, 0, w, h);
    // 视差星野
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      s.x += s.d * 4 * dt;
      const a = (0.3 + 0.5 * Math.abs(Math.sin(t * 0.9 + s.tw))) * (0.55 + s.layer * 0.22);
      c.globalAlpha = a;
      c.fillStyle = s.c;
      c.fillRect(s.x % w, s.y % h, s.s, s.s);
      if (s.bright) {
        const R = 6 + s.s * 4;
        const g3 = c.createRadialGradient(s.x % w, s.y % h, 0, s.x % w, s.y % h, R);
        g3.addColorStop(0, 'rgba(255,255,255,.5)');
        g3.addColorStop(1, 'rgba(200,220,255,0)');
        c.fillStyle = g3; c.beginPath(); c.arc(s.x % w, s.y % h, R, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(226,238,255,.35)'; c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(s.x % w - R * 1.8, s.y % h); c.lineTo(s.x % w + R * 1.8, s.y % h);
        c.moveTo(s.x % w, s.y % h - R * 1.8); c.lineTo(s.x % w, s.y % h + R * 1.8);
        c.stroke();
      }
    }
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // 远景行星：受光半球 + 大气边缘光 + 纹理环带 + 投影环
    const pr = Math.min(w, h) * 0.10, pcx = w * 0.80, pcy = h * 0.26;
    c.save();
    // 行星投影
    const sh = c.createRadialGradient(pcx, pcy, pr * 0.6, pcx, pcy, pr * 2.3);
    sh.addColorStop(0, 'rgba(0,0,0,.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.beginPath(); c.arc(pcx, pcy, pr * 2.3, 0, Math.PI * 2); c.fill();
    // 球体：受光面在左上
    const pg = c.createRadialGradient(pcx - pr * 0.42, pcy - pr * 0.48, pr * 0.1, pcx, pcy, pr * 1.06);
    pg.addColorStop(0, '#8E7BC8');
    pg.addColorStop(0.45, '#5B4C8C');
    pg.addColorStop(0.8, '#2C2547');
    pg.addColorStop(1, '#150F26');
    c.beginPath(); c.arc(pcx, pcy, pr, 0, Math.PI * 2); c.fillStyle = pg; c.fill();
    // 表面环带纹理（裁剪在球内）
    c.save();
    c.beginPath(); c.arc(pcx, pcy, pr, 0, Math.PI * 2); c.clip();
    for (let i = -5; i <= 5; i++) {
      const yy = pcy + i * pr * 0.19 + Math.sin(i * 1.7) * 2;
      c.strokeStyle = 'rgba(255,255,255,' + (0.030 + (i % 2 ? 0.030 : 0)) + ')';
      c.lineWidth = pr * 0.09;
      c.beginPath(); c.ellipse(pcx, yy, pr * 1.05, pr * 0.11, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    // 大气边缘光（rim light）
    c.beginPath(); c.arc(pcx, pcy, pr, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(150,210,255,.42)'; c.lineWidth = 1.6; c.stroke();
    const rim = c.createRadialGradient(pcx, pcy, pr * 0.92, pcx, pcy, pr * 1.22);
    rim.addColorStop(0, 'rgba(120,190,255,.20)');
    rim.addColorStop(1, 'rgba(120,190,255,0)');
    c.fillStyle = rim; c.beginPath(); c.arc(pcx, pcy, pr * 1.22, 0, Math.PI * 2); c.fill();
    c.restore();

    // 行星环：分层 + 背光遮蔽
    c.save();
    c.translate(pcx, pcy); c.rotate(-0.42);
    const rg = c.createLinearGradient(-pr * 1.9, 0, pr * 1.9, 0);
    rg.addColorStop(0, 'rgba(53,224,214,0)');
    rg.addColorStop(0.25, 'rgba(53,224,214,.30)');
    rg.addColorStop(0.5, 'rgba(190,240,255,.45)');
    rg.addColorStop(0.75, 'rgba(53,224,214,.30)');
    rg.addColorStop(1, 'rgba(53,224,214,0)');
    c.strokeStyle = rg; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(0, 0, pr * 1.85, pr * 0.5, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(180,220,255,.16)'; c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(0, 0, pr * 1.62, pr * 0.44, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(0, 0, pr * 2.05, pr * 0.56, 0, 0, Math.PI * 2); c.stroke();
    // 环在行星前方的一段重画（制造穿插立体感）
    c.save();
    c.beginPath(); c.ellipse(0, 0, pr * 2.6, pr * 0.72, 0, 0, Math.PI);
    c.clip();
    c.strokeStyle = rg; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(0, 0, pr * 1.85, pr * 0.5, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
    c.restore();

    // 暗角
    if (!perf()) vignette(w, h);
  }

  /* ============ 星图界面 ============ */
  function galaxyBg(canvas, galaxy, dt, selectedIdx, hoveredIdx) {
    const c = canvas.getContext('2d');
    const w = canvas.width = Math.max(1, window.innerWidth), h = canvas.height = Math.max(1, window.innerHeight);
    c.fillStyle = '#0B1026'; c.fillRect(0, 0, w, h);
    if (!stars.length) starfield(140);
    for (const s of stars) {
      const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.9 + s.tw));
      c.globalAlpha = a; c.fillStyle = '#CFE0FF';
      c.fillRect(s.x % w, s.y % h, s.s, s.s);
    }
    c.globalAlpha = 1;
    if (!galaxy) return;
    const cx = w * 0.5, cy = h * 0.5;
    // 恒星：多层日冕 + 耀斑 + 脉动
    const st = galaxy.star;
    const pulse = 1 + Math.sin(t * 1.6) * 0.035;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const corona = [[5.4, .10], [3.6, .16], [2.4, .26], [1.6, .40]];
    for (const [k, al] of corona) {
      const R = 34 * k * pulse;
      const g4 = c.createRadialGradient(cx, cy, 0, cx, cy, R);
      g4.addColorStop(0, hexA(st.color, al));
      g4.addColorStop(0.5, hexA(st.color, al * 0.42));
      g4.addColorStop(1, hexA(st.color, 0));
      c.fillStyle = g4;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    }
    // 核心
    const core = c.createRadialGradient(cx - 8, cy - 9, 2, cx, cy, 34 * pulse);
    core.addColorStop(0, '#FFFFFF');
    core.addColorStop(0.35, hexA(st.color, .95));
    core.addColorStop(1, hexA(st.color, .18));
    c.fillStyle = core;
    c.beginPath(); c.arc(cx, cy, 34 * pulse, 0, Math.PI * 2); c.fill();
    // 耀斑：几道随机的日珥
    for (let i = 0; i < 7; i++) {
      const a = t * 0.28 + i * 0.9;
      const L = 40 + 20 * Math.abs(Math.sin(t * 0.7 + i * 1.7));
      c.strokeStyle = hexA(st.color, 0.18 + 0.10 * Math.sin(t * 2 + i));
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      c.quadraticCurveTo(cx + Math.cos(a + 0.3) * (30 + L * 0.7), cy + Math.sin(a + 0.3) * (30 + L * 0.7),
        cx + Math.cos(a + 0.15) * (30 + L), cy + Math.sin(a + 0.15) * (30 + L));
      c.stroke();
    }
    c.restore();
    c.font = '13px sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(221,230,255,.80)';
    c.fillText(st.name + ' · ' + galaxy.sysName, cx, cy - 60);

    // 轨道与行星
    for (const p of galaxy.planets) {
      const r = p.orbit * Math.min(1.35, Math.max(0.62, h / 760));
      // 轨道：虚线 + 淡光带
      c.strokeStyle = 'rgba(53,224,214,.13)';
      c.beginPath(); c.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2); c.stroke();
      c.setLineDash([3, 7]);
      c.strokeStyle = 'rgba(150,220,255,.16)';
      c.beginPath(); c.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);

      const a = p.phase + t * p.speed;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.42;
      const sel = p.idx === selectedIdx, hov = p.idx === hoveredIdx;
      const R = p.size * (sel ? 1.25 : 1);
      c.save();
      if (sel || hov) { c.shadowColor = p.accent; c.shadowBlur = perf() ? 0 : 26; }
      // 球体：受光半球 + 背光半球（明暗交界线）
      const gr = c.createRadialGradient(px - R * 0.42, py - R * 0.44, R * 0.12, px, py, R * 1.05);
      gr.addColorStop(0, p.pal[2]);
      gr.addColorStop(0.48, p.pal[1] || p.pal[0]);
      gr.addColorStop(0.78, p.pal[0]);
      gr.addColorStop(1, 'rgba(6,8,20,.92)');
      c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2);
      c.fillStyle = gr; c.fill();
      // 表面纹理（裁剪在球内）
      c.save();
      c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2); c.clip();
      for (let i = -3; i <= 3; i++) {
        c.strokeStyle = 'rgba(255,255,255,' + (i % 2 ? 0.030 : 0.055) + ')';
        c.lineWidth = R * 0.16;
        c.beginPath();
        c.ellipse(px, py + i * R * 0.24, R * 1.1, R * 0.13, 0.2, 0, Math.PI * 2);
        c.stroke();
      }
      // 夜面加深
      const night = c.createRadialGradient(px + R * 0.5, py + R * 0.5, R * 0.1, px, py, R * 1.02);
      night.addColorStop(0, 'rgba(0,0,0,.55)');
      night.addColorStop(0.6, 'rgba(0,0,0,.18)');
      night.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = night;
      c.beginPath(); c.arc(px, py, R * 1.02, 0, Math.PI * 2); c.fill();
      c.restore();
      // 高光点
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath(); c.ellipse(px - R * 0.38, py - R * 0.40, R * 0.17, R * 0.12, -0.6, 0, Math.PI * 2); c.fill();
      // 大气边缘光
      c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2);
      c.strokeStyle = sel ? 'rgba(255,255,255,.95)' : hov ? p.accent : hexA(p.accent, .34);
      c.lineWidth = sel ? 2.4 : 1.4; c.stroke();
      if (!perf()) {
        const rim = c.createRadialGradient(px, py, R * 0.92, px, py, R * 1.28);
        rim.addColorStop(0, hexA(p.accent, .20));
        rim.addColorStop(1, hexA(p.accent, 0));
        c.fillStyle = rim;
        c.beginPath(); c.arc(px, py, R * 1.28, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      if (p.main) {
        c.fillStyle = sel ? '#FFF' : 'rgba(221,230,255,.85)';
        c.font = 'bold 13px sans-serif';
        c.fillText('★ ' + p.name, px, py - R - 12);
      }
      if (hov || sel) {
        c.fillStyle = 'rgba(221,230,255,.70)'; c.font = '11px sans-serif';
        c.fillText(p.typeName, px, py + R + 18);
      }
    }
    if (!perf()) vignette(w, h);
  }

  /* 颜色 + 透明度 → rgba()，支持 #rgb / #rrggbb / rgb() */
  function hexA(col, al) {
    const c = hexRGB(col);
    if (!c) return 'rgba(160,190,255,' + al + ')';
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')';
  }

  function bindSelf(self) { this_ = self; }

  return {
    init, frame, minimap, menuBg, galaxyBg, burst, screenToWorld,
    get canvas() { return cv; }, bindSelf,
  };
})();
