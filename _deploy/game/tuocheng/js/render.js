// ===== 渲染系统:Canvas 2D 自上而下网格城市视角 =====
G.RD = (() => {
  const TS = () => G.CFG.TS;
  let cv, ctx, mini, miniCtx;
  let terrainCv = null;      // 预渲染地形层
  const cam = { x: 0, y: 0, zoom: 1 };  // 世界像素原点在屏幕左上
  let lastSeason = -1;
  let miniTerr = null;
  let hover = { tx: -1, ty: -1 };       // 悬停格
  let dragPan = null;
  const smoke = [];

  // ===== 美术层状态(纯表现,不参与任何模拟) =====
  let pat = null;            // 各地形的预生成噪点 pattern
  let cloudPat = null;       // 云影/大气雾 pattern
  let fogPat = null;         // 未解锁领地的浓雾 pattern
  let vignetteCv = null;     // 屏幕暗角
  let nightK = 0, duskK = 0; // 昼夜强度(每帧刷新,供窗光/粒子使用)
  const motes = [];          // 大气浮尘 / 落叶 / 萤火
  let moteSeason = -1, moteNight = -1;

  // ---- 初始化 ----
  function init() {
    cv = G.U.$('game');
    ctx = cv.getContext('2d');
    mini = G.U.$('minimap');
    miniCtx = mini.getContext('2d');
    resize();
    buildVignette();
    buildCloudPattern();
    window.addEventListener('resize', resize);
    bindInput();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- 屏幕暗角(vignette):预生成一次,每帧仅一次 drawImage ----
  function buildVignette() {
    const w = 256, h = 160;
    vignetteCv = document.createElement('canvas');
    vignetteCv.width = w; vignetteCv.height = h;
    const g = vignetteCv.getContext('2d');
    const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.72);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0.46)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }

  // ---- 云影/大气雾:预生成可平铺柔云 pattern(初始化一次) ----
  function buildCloudPattern() {
    const n = 256, cn = document.createElement('canvas');
    cn.width = n; cn.height = n;
    const g = cn.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
    // 四周环绕绘制,保证平铺无缝
    for (let i = 0; i < 26; i++) {
      const x = G.U.hash2(i, 3, 77) * n, y = G.U.hash2(i, 9, 88) * n;
      const r = 34 + G.U.hash2(i, 11, 99) * 64;
      const a = 0.10 + G.U.hash2(i, 13, 111) * 0.18;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cx2 = x + ox * n, cy2 = y + oy * n;
          const gr = g.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
          gr.addColorStop(0, `rgba(118,130,150,${a})`);
          gr.addColorStop(1, 'rgba(118,130,150,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(cx2, cy2, r, 0, 7); g.fill();
        }
      }
    }
    cloudPat = ctx.createPattern(cn, 'repeat');

    // 未解锁领地用的"浓雾"贴图:深蓝灰底 + 亮雾团,乘算后既有质感又有纵深
    const fn = document.createElement('canvas');
    fn.width = n; fn.height = n;
    const fg = fn.getContext('2d');
    fg.fillStyle = '#3a4370'; fg.fillRect(0, 0, n, n);
    for (let i = 0; i < 60; i++) {
      const x = G.U.hash2(i, 21, 131) * n, y = G.U.hash2(i, 27, 141) * n;
      const r = 12 + G.U.hash2(i, 31, 151) * 40;
      const a = 0.22 + G.U.hash2(i, 37, 161) * 0.50;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cx2 = x + ox * n, cy2 = y + oy * n;
          const gr = fg.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
          gr.addColorStop(0, `rgba(186,196,222,${a})`);
          gr.addColorStop(1, 'rgba(206,214,236,0)');
          fg.fillStyle = gr;
          fg.beginPath(); fg.arc(cx2, cy2, r, 0, 7); fg.fill();
        }
      }
    }
    fogPat = ctx.createPattern(fn, 'repeat');
  }

  // ---- 颜色小工具(统一色调/明暗处理) ----
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function css(c, a) { return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // k>1 提亮,k<1 压暗(模拟统一光源下的受光面/背光面)
  function shade(hex, k) { const c = hexRgb(hex); return css([G.U.clamp(c[0] * k, 0, 255), G.U.clamp(c[1] * k, 0, 255), G.U.clamp(c[2] * k, 0, 255)]); }
  function shadeA(hex, k, a) { const c = hexRgb(hex); return css([G.U.clamp(c[0] * k, 0, 255), G.U.clamp(c[1] * k, 0, 255), G.U.clamp(c[2] * k, 0, 255)], a); }

  // ---- 坐标换算 ----
  function worldToScreen(wx, wy) { return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom }; }
  function screenToWorld(sx, sy) { return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y }; }
  function tileAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    return { tx: Math.floor(w.x / TS()), ty: Math.floor(w.y / TS()) };
  }
  function centerOn(tx, ty) {
    cam.x = (tx + 0.5) * TS() - cv.clientWidth / (2 * cam.zoom);
    cam.y = (ty + 0.5) * TS() - cv.clientHeight / (2 * cam.zoom);
    clampCam();
  }
  function clampCam() {
    const W = G.CFG.MAPW * TS(), H = G.CFG.MAPH * TS();
    const vw = cv.clientWidth / cam.zoom, vh = cv.clientHeight / cam.zoom;
    cam.x = G.U.clamp(cam.x, -vw * 0.15, W - vw * 0.85);
    cam.y = G.U.clamp(cam.y, -vh * 0.15, H - vh * 0.85);
  }

  // ---- 地形调色板(随季节换色,供低分辨率底色层使用) ----
  function terrainPalette(si) {
    const winter = si === 3, autumn = si === 2, T = G.CFG.TERR;
    const P = {};
    // 草地:基色 + 亮斑 + 暗斑(基色保持较高饱和度以获得色彩丰富度)
    P[T.GRASS] = winter
      ? { base: [186, 194, 202], light: [232, 240, 246], dark: [142, 154, 164] }
      : autumn
        ? { base: [152, 128, 44], light: [196, 164, 66], dark: [104, 84, 28] }
        : { base: [76, 146, 36], light: [150, 202, 62], dark: [40, 86, 26] };
    // 森林地表:整体压暗,亮部留给树冠
    P[T.FOREST] = winter
      ? { base: [158, 170, 178], light: [204, 214, 222], dark: [118, 130, 140] }
      : { base: [50, 96, 40], light: [96, 146, 60], dark: [26, 58, 32] };
    // 水域:深水 / 亮水
    P[T.WATER] = { base: [34, 92, 140], light: [104, 176, 208], dark: [16, 52, 96] };
    // 岩石
    P[T.ROCK] = winter
      ? { base: [148, 152, 156], light: [202, 206, 210], dark: [100, 104, 110] }
      : { base: [134, 130, 118], light: [186, 182, 170], dark: [88, 86, 78] };
    // 沃土 / 泥地
    P[T.FERTILE] = winter
      ? { base: [152, 136, 116], light: [192, 178, 156], dark: [110, 98, 84] }
      : { base: [110, 74, 42], light: [150, 110, 64], dark: [68, 46, 26] };
    // 岸边沙色(水陆过渡)
    P.sand = winter ? [200, 198, 192] : [204, 180, 122];
    return P;
  }

  // ---- 预生成可平铺噪点纹理(createPattern 使用;全程零每帧逐像素运算) ----
  function makePattern(t, sd, si) {
    const n = 64, cn = document.createElement('canvas');
    cn.width = n; cn.height = n;
    const g = cn.getContext('2d');
    const img = g.createImageData(n, n), d = img.data;
    const T = G.CFG.TERR;
    const winter = si === 3, autumn = si === 2;
    // 周期值噪声:格子数整除 64,四周环绕 → 平铺无缝
    const pn = (x, y, sc, s2) => {
      const C = n / sc;
      const fx = x / sc, fy = y / sc;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sm = u => u * u * (3 - 2 * u);
      const hh = (a, b) => G.U.hash2(((a % C) + C) % C, ((b % C) + C) % C, sd + s2);
      const a = hh(ix, iy), b = hh(ix + 1, iy), c2 = hh(ix, iy + 1), e = hh(ix + 1, iy + 1);
      const u = sm(tx), v = sm(ty);
      return G.U.lerp(G.U.lerp(a, b, u), G.U.lerp(c2, e, u), v);
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        let r = 0, gg = 0, b = 0, a = 0;
        const fine = G.U.hash2(x, y, sd + 9);
        if (t === T.GRASS) {
          const e = pn(x, y, 8, 1) * 0.55 + pn(x, y, 4, 2) * 0.45 + (fine - 0.5) * 0.35;
          if (e > 0.5) { const k = (e - 0.5) * 2.0; r = winter ? 255 : (autumn ? 214 : 168); gg = winter ? 255 : (autumn ? 190 : 208); b = winter ? 255 : (autumn ? 110 : 118); a = k * 0.62; }
          else { const k = (0.5 - e) * 2.0; r = winter ? 120 : (autumn ? 92 : 44); gg = winter ? 130 : (autumn ? 84 : 84); b = winter ? 140 : (autumn ? 38 : 40); a = k * 0.68; }
          if (fine > 0.985) { r = winter ? 255 : 236; gg = winter ? 255 : 224; b = winter ? 255 : 140; a = 0.5; } // 零星小花
        } else if (t === T.FOREST) {
          const e = pn(x, y, 8, 3) * 0.6 + pn(x, y, 16, 4) * 0.4;
          // 针叶碎屑:细密条纹
          const needle = ((x * 5 + y * 11) % 17 < 3) ? 0.22 : 0;
          if (e + needle > 0.55) { r = 118; gg = 158; b = 96; a = (e - 0.45) * 0.5; }
          else { r = 18; gg = 34; b = 22; a = (0.55 - e) * 0.6; }
        } else if (t === T.WATER) {
          // 正弦波纹(周期整除 64 → 无缝) + 细噪声
          const wv = Math.sin((y * 2 * Math.PI) / 16 + pn(x, y, 16, 5) * 4.0);
          const wv2 = Math.sin((x * 2 * Math.PI) / 32 + pn(x, y, 8, 6) * 3.0);
          const e = (wv * 0.6 + wv2 * 0.4 + 1) / 2;
          if (e > 0.5) { r = 214; gg = 236; b = 246; a = (e - 0.5) * 0.55; }
          else { r = 16; gg = 44; b = 78; a = (0.5 - e) * 0.6; }
          if (fine > 0.99) { r = 255; gg = 255; b = 255; a = 0.35; }
        } else if (t === T.ROCK) {
          const vein = Math.abs(pn(x, y, 8, 7) * 2 - 1);
          const facet = pn(x, y, 4, 8);
          if (vein < 0.07) { r = 46; gg = 44; b = 42; a = (0.07 - vein) * 6; }
          else if (facet > 0.5) { r = 232; gg = 230; b = 224; a = (facet - 0.5) * 0.7; }
          else { r = 42; gg = 40; b = 38; a = (0.5 - facet) * 0.6; }
        } else {
          // 沃土:土块 + 小石子 + 犁沟
          const clod = pn(x, y, 8, 10) * 0.7 + pn(x, y, 4, 11) * 0.3;
          const furrow = Math.sin((x * 2 * Math.PI) / 16) * 0.5 + 0.5;
          if (clod > 0.52) { r = 168; gg = 132; b = 92; a = (clod - 0.52) * 1.3; }
          else { r = 40; gg = 28; b = 18; a = (0.52 - clod) * 1.3; }
          if (furrow > 0.86) { r = 30; gg = 22; b = 14; a = 0.22; }
          if (fine > 0.975) { r = 176; gg = 172; b = 164; a = 0.45; }
        }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = G.U.clamp(a, 0, 1) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cn;
  }

  // ---- 低分辨率地形底色层:采样坐标加抖动 → 地块边界不规则(手绘地图感) ----
  function buildTerrainBase(si) {
    const W = G.CFG.MAPW, H = G.CFG.MAPH, T = G.CFG.TERR;
    const SC = 8, lw = W * SC, lh = H * SC;
    const lc = document.createElement('canvas');
    lc.width = lw; lc.height = lh;
    const g = lc.getContext('2d');
    const img = g.createImageData(lw, lh), dat = img.data;
    const P = terrainPalette(si);
    const winter = si === 3;
    const isWater = (x, y) => G.M.terr(x, y) === T.WATER;
    for (let py = 0; py < lh; py += 2) {
      for (let px = 0; px < lw; px += 2) {
        // 低频扭曲 + 高频抖动 = 不规则自然边界
        const jx = (G.U.vnoise(px, py, 91, 7) - 0.5) * 6.4 + (G.U.hash2(px >> 1, py >> 1, 17) - 0.5) * 2.0;
        const jy = (G.U.vnoise(px, py, 53, 7) - 0.5) * 6.4 + (G.U.hash2(px >> 1, py >> 1, 29) - 0.5) * 2.0;
        const tx = G.U.clamp(Math.floor((px + jx) / SC), 0, W - 1);
        const ty = G.U.clamp(Math.floor((py + jy) / SC), 0, H - 1);
        const t = G.map.terr[ty * W + tx];
        let c = P[t].base;
        // 水陆交界:水侧补亮水色,陆侧混入沙色 → 自然岸线
        if (t === T.WATER) {
          if (!isWater(tx - 1, ty) || !isWater(tx + 1, ty) || !isWater(tx, ty - 1) || !isWater(tx, ty + 1)) {
            c = mixc(P[t].base, P[t].light, 0.55);
          }
        } else if (isWater(tx - 1, ty) || isWater(tx + 1, ty) || isWater(tx, ty - 1) || isWater(tx, ty + 1)) {
          c = mixc(c, P.sand, 0.45);
        }
        // 草地大尺度"枯黄斑块"与"潮绿斑块":提升色相层次(纯表现)
        if (t !== T.WATER && !winter) {
          const dry = G.U.vnoise(tx, ty, 2468, 13);
          if (dry > 0.575) c = mixc(c, t === T.FERTILE ? [176, 148, 92] : [162, 146, 68], Math.min(0.55, (dry - 0.575) * 2.4));
          else if (dry < 0.415) c = mixc(c, [40, 96, 96], Math.min(0.45, (0.415 - dry) * 2.0));
        }
        // 逐格随机明暗 + 分通道低频色彩分级(三个独立噪声 → 色相/明度真正散开)
        const v = 1 + (G.U.hash2(tx * 5 + 3, ty * 3 + 7, 41) - 0.5) * 0.22
          + (G.U.vnoise(tx, ty, 5, 3) - 0.5) * 0.16;
        const n1 = (G.U.vnoise(tx, ty, 1234, 9) - 0.5) * 2;
        const n2 = (G.U.vnoise(tx, ty, 4312, 7) - 0.5) * 2;
        const n3 = (G.U.vnoise(tx, ty, 8765, 11) - 0.5) * 2;
        const mr = 1 + n1 * 0.36 + n3 * 0.15;
        const mg = 1 + n2 * 0.31 + n1 * 0.10;
        const mb = 1 + n3 * 0.40 + n2 * 0.12;
        const r = G.U.clamp(c[0] * v * mr, 0, 255) | 0;
        const gg = G.U.clamp(c[1] * v * mg, 0, 255) | 0;
        const b = G.U.clamp(c[2] * v * mb, 0, 255) | 0;
        for (let oy = 0; oy < 2; oy++) {
          const yy = py + oy; if (yy >= lh) break;
          for (let ox = 0; ox < 2; ox++) {
            const xx = px + ox; if (xx >= lw) break;
            const i = (yy * lw + xx) * 4;
            dat[i] = r; dat[i + 1] = gg; dat[i + 2] = b; dat[i + 3] = 255;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    return lc;
  }

  // ---- 逐格装饰细节(树/岩石/草丛/波纹),位置抖动以打破网格感 ----
  function drawTileDetail(c, t, x, y, TSZ, si) {
    const T = G.CFG.TERR;
    const winter = si === 3, autumn = si === 2;
    const h1 = G.U.hash2(x, y, 7), h2 = G.U.hash2(x * 3, y * 5, 13), h3 = G.U.hash2(x * 7, y * 11, 19);
    const px = x * TSZ, py = y * TSZ;

    if (t === T.FOREST) {
      const n = 2 + Math.floor(h1 * 3);
      for (let k = 0; k < n; k++) {
        const jx = G.U.hash2(x * 3 + k, y * 5, 13), jy = G.U.hash2(x * 7, y * 11 + k, 17);
        const tx = px + 5 + jx * (TSZ - 10), ty = py + 7 + jy * (TSZ - 14);
        const rad = 5.5 + jy * 3.5;
        if (winter) {
          c.strokeStyle = '#5d4a33'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(tx, ty + 8); c.lineTo(tx, ty - 2); c.stroke();
          c.beginPath(); c.moveTo(tx, ty + 2); c.lineTo(tx - 4, ty - 4); c.stroke();
          c.beginPath(); c.moveTo(tx, ty + 3); c.lineTo(tx + 4, ty - 5); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.75)';
          c.beginPath(); c.arc(tx, ty - 3, 3.5, 0, 7); c.fill();
        } else {
          // 接触阴影 + 三层树冠(受光面偏左上)
          c.fillStyle = 'rgba(10,22,12,0.28)';
          c.beginPath(); c.ellipse(tx + 2.5, ty + rad * 0.9, rad * 1.05, rad * 0.5, 0, 0, 7); c.fill();
          const cDeep = autumn ? (jx > 0.5 ? '#8f5b1c' : '#6f6a1e') : (jx > 0.5 ? '#245c2a' : '#2f6b30');
          const cMid = autumn ? (jx > 0.5 ? '#c47f2e' : '#9c8a2a') : (jx > 0.5 ? '#357a36' : '#428540');
          const cTop = autumn ? '#e0b055' : '#5fa04a';
          c.fillStyle = cDeep;
          c.beginPath(); c.arc(tx, ty, rad, 0, 7); c.fill();
          c.fillStyle = cMid;
          c.beginPath(); c.arc(tx - rad * 0.22, ty - rad * 0.22, rad * 0.78, 0, 7); c.fill();
          c.fillStyle = cTop;
          c.globalAlpha = 0.55;
          c.beginPath(); c.arc(tx - rad * 0.38, ty - rad * 0.4, rad * 0.36, 0, 7); c.fill();
          c.globalAlpha = 1;
        }
      }
    } else if (t === T.ROCK) {
      const n = 2 + Math.floor(h1 * 2);
      for (let k = 0; k < n; k++) {
        const jx = G.U.hash2(x * 5 + k, y * 9, 23), jy = G.U.hash2(x * 11, y * 3 + k, 31);
        const tx = px + 6 + jx * (TSZ - 12), ty = py + 8 + jy * (TSZ - 16);
        const w = 6 + jx * 8, hh = 5 + jy * 6;
        c.fillStyle = 'rgba(20,18,14,0.30)';
        c.beginPath(); c.ellipse(tx + 2, ty + hh * 0.7, w * 0.62, hh * 0.34, 0, 0, 7); c.fill();
        c.fillStyle = winter ? '#b9bcc0' : '#8e8c84';
        c.beginPath();
        c.moveTo(tx - w * 0.5, ty + hh * 0.45);
        c.lineTo(tx - w * 0.28, ty - hh * 0.5);
        c.lineTo(tx + w * 0.22, ty - hh * 0.55);
        c.lineTo(tx + w * 0.5, ty + hh * 0.4);
        c.closePath(); c.fill();
        c.fillStyle = winter ? '#e2e6ea' : '#c3c0b6';
        c.beginPath();
        c.moveTo(tx - w * 0.28, ty - hh * 0.5);
        c.lineTo(tx + w * 0.22, ty - hh * 0.55);
        c.lineTo(tx - w * 0.02, ty - hh * 0.05);
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(tx - w * 0.5, ty + hh * 0.45); c.lineTo(tx + w * 0.5, ty + hh * 0.4); c.stroke();
      }
    } else if (t === T.GRASS) {
      if (h1 > 0.42) {
        const gx = px + 4 + h2 * (TSZ - 10), gy = py + 6 + h3 * (TSZ - 12);
        c.strokeStyle = winter ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.16)';
        c.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          const o = (k - 1) * 3;
          c.beginPath();
          c.moveTo(gx + o, gy + 5);
          c.quadraticCurveTo(gx + o + 1.5, gy + 1, gx + o + (k - 1) * 1.6, gy - 3 - h3 * 2);
          c.stroke();
        }
        c.strokeStyle = winter ? 'rgba(120,132,140,0.45)' : 'rgba(28,52,24,0.28)';
        c.beginPath(); c.moveTo(gx - 2, gy + 5); c.lineTo(gx - 1, gy - 1); c.stroke();
      }
      if (h2 > 0.70) { // 野花点缀,提升色彩丰富度
        const fx = px + 6 + h3 * (TSZ - 12), fy = py + 8 + h1 * (TSZ - 14);
        const pal = winter ? ['#e8eef2', '#dfe8ee', '#f2f6fa']
          : h3 > 0.72 ? ['#f0dc6a', '#e8c94e', '#f6e88a']
            : h3 > 0.44 ? ['#e08ab4', '#d9708f', '#f0a8c8'] : ['#f2f0e4', '#e6e0f2', '#dcd4f0'];
        c.fillStyle = pal[Math.floor(h1 * 3) % 3];
        c.beginPath(); c.arc(fx, fy, 1.9, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.65)';
        c.beginPath(); c.arc(fx - 0.6, fy - 0.6, 0.8, 0, 7); c.fill();
      }
    } else if (t === T.FERTILE && !winter) {
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1.4;
      for (let r = 6; r < TSZ; r += 9) {
        c.beginPath();
        c.moveTo(px + 3, py + r + 2);
        c.quadraticCurveTo(px + TSZ / 2, py + r - 2, px + TSZ - 3, py + r + 2);
        c.stroke();
      }
    }
    if (t === T.WATER) {
      // 波纹高光条 + 岸线泡沫
      c.fillStyle = 'rgba(255,255,255,0.10)';
      if (h1 > 0.55) c.fillRect(px + 3 + h2 * 6, py + 6 + h3 * (TSZ - 12), TSZ * 0.5, 1.6);
      const nearLand = G.M.terr(x, y - 1) !== T.WATER || G.M.terr(x - 1, y) !== T.WATER
        || G.M.terr(x + 1, y) !== T.WATER || G.M.terr(x, y + 1) !== T.WATER;
      if (nearLand) {
        c.fillStyle = 'rgba(236,246,250,0.28)';
        c.beginPath();
        c.moveTo(px, py + 2 + h1 * 4);
        c.quadraticCurveTo(px + TSZ * 0.5, py + h1 * 6, px + TSZ, py + 2 + h2 * 4);
        c.lineTo(px + TSZ, py + 6 + h2 * 4);
        c.quadraticCurveTo(px + TSZ * 0.5, py + 4 + h1 * 6, px, py + 6 + h1 * 4);
        c.closePath(); c.fill();
      }
    }
  }

  // ---- 地形预渲染(随季节重绘) ----
  function prerender(seasonIdx) {
    const TSZ = TS();
    const W = G.CFG.MAPW, H = G.CFG.MAPH;
    const T = G.CFG.TERR;
    if (!terrainCv) terrainCv = document.createElement('canvas');
    terrainCv.width = W * TSZ; terrainCv.height = H * TSZ;
    const c = terrainCv.getContext('2d');

    // 1) 低分辨率不规则底色层 → 放大:摆脱直角网格与纯色矩形
    const base = buildTerrainBase(seasonIdx);
    c.imageSmoothingEnabled = true;
    c.drawImage(base, 0, 0, W * TSZ, H * TSZ);

    // 2) 预生成噪点 pattern 平铺(每格一次 fillRect,无逐像素运算)
    pat = {};
    for (const k in T) {
      const cvp = makePattern(T[k], 100 + T[k] * 17, seasonIdx);
      pat[T[k]] = c.createPattern(cvp, 'repeat');
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = pat[G.map.terr[y * W + x]];
        if (!p) continue;
        c.globalAlpha = 0.8;
        c.fillStyle = p;
        c.fillRect(x * TSZ, y * TSZ, TSZ, TSZ);
      }
    }
    c.globalAlpha = 1;

    // 3) 逐格装饰细节
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        drawTileDetail(c, G.map.terr[y * W + x], x, y, TSZ, seasonIdx);
      }
    }
    miniTerr = makeMiniTerrain();
  }

  function makeMiniTerrain() {
    const W = G.CFG.MAPW, H = G.CFG.MAPH, T = G.CFG.TERR;
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    const c = mc.getContext('2d');
    const img = c.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const t = G.map.terr[i];
      let r, g, b;
      if (t === T.WATER) { r = 46; g = 84; b = 130; }
      else if (t === T.FOREST) { r = 34; g = 74; b = 40; }
      else if (t === T.ROCK) { r = 110; g = 110; b = 104; }
      else if (t === T.FERTILE) { r = 96; g = 70; b = 44; }
      else { r = 74; g = 110; b = 56; }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return mc;
  }

  // ================= 建筑绘制:每种建筑独立剪影 =================
  // 统一光源约定:光从左上打来 → 左上受光(提亮) / 右下背光(压暗)
  const BWALL = {
    cottage: '#b0894f', stoneHouse: '#c2bbad', manor: '#e2d1a6', lumber: '#96754c',
    quarry: '#a8a294', granary: '#cfa862', warehouse: '#a6895c', herbalist: '#9aae7c',
    clinic: '#eae4d3', guard: '#949ba9', school: '#d6c48f', tavern: '#c4934f',
    theater: '#c9795f', church: '#e2dac4', cathedral: '#eae1c8', trade: '#bd9f66',
    university: '#d8c69a', hall: '#cbb083', well: '#b0aa9c',
  };
  const BROOF = {
    cottage: '#b8894a', stoneHouse: '#a8503a', manor: '#4f6f9e', lumber: '#6b5335',
    quarry: '#5f5b52', granary: '#9c7a34', warehouse: '#75613f', herbalist: '#4e7a44',
    clinic: '#4e8a56', guard: '#4a5060', school: '#7a6a9c', tavern: '#8a4a2e',
    theater: '#8a3a3a', church: '#6f7f96', cathedral: '#8fa0b6', trade: '#8a7434',
    university: '#5a5a8c', hall: '#8a3a3a', well: '#7a5c3e',
  };

  // 接触阴影:脚下软阴影(ellipse 低透明度 + 径向扩散 + 右下方向偏移)
  function contactShadow(x, y, w, h) {
    const cx = x + w * 0.5, cy = y + h * 0.9;
    const rx = w * 0.56, ry = Math.max(3, h * 0.17);
    ctx.fillStyle = 'rgba(12,14,10,0.24)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(cx + w * 0.05, cy + h * 0.04);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.3);
    g.addColorStop(0, 'rgba(10,12,8,0.30)');
    g.addColorStop(0.55, 'rgba(10,12,8,0.15)');
    g.addColorStop(1, 'rgba(10,12,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.3, 0, 7); ctx.fill();
    ctx.restore();
  }

  // 光晕(夜晚灯/窗/火):radialGradient + lighter 混合
  function glowDot(x, y, rad, rgb, a) {
    if (a <= 0.012 || rad <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.45, `rgba(${rgb},${a * 0.34})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    ctx.restore();
  }

  // 墙体:竖向渐变 + 左上受光高光 + 右下暗面 + 描边
  function wallBox(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(col, 1.24));
    g.addColorStop(0.55, shade(col, 1.0));
    g.addColorStop(1, shade(col, 0.70));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,246,214,0.20)';
    ctx.fillRect(x, y, w, Math.max(1, h * 0.14));
    ctx.fillRect(x, y, Math.max(1, w * 0.10), h);
    ctx.fillStyle = 'rgba(24,18,12,0.20)';
    ctx.fillRect(x + w - Math.max(1.5, w * 0.12), y, Math.max(1.5, w * 0.12), h);
    ctx.strokeStyle = 'rgba(28,20,12,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0.5, w - 1), Math.max(0.5, h - 1));
  }

  // 双坡屋顶(带屋檐、瓦垄、屋脊高光)
  function roofGable(x, y, w, h, col) {
    const ov = w * 0.05;
    const x0 = x - ov, x1 = x + w + ov, ry = y, by = y + h;
    const rx0 = x + w * 0.22, rx1 = x + w * 0.78;
    const g = ctx.createLinearGradient(x0, ry, x1, by);
    g.addColorStop(0, shade(col, 1.30));
    g.addColorStop(0.45, shade(col, 1.02));
    g.addColorStop(1, shade(col, 0.64));
    ctx.beginPath();
    ctx.moveTo(x0, by); ctx.lineTo(rx0, ry); ctx.lineTo(rx1, ry); ctx.lineTo(x1, by);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(26,18,10,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(G.U.lerp(x0, rx0, t), G.U.lerp(by, ry, t));
      ctx.lineTo(G.U.lerp(x1, rx1, t), G.U.lerp(by, ry, t));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,242,206,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(rx0, ry + 0.6); ctx.lineTo(rx1, ry + 0.6); ctx.stroke();
  }

  // 四坡屋顶(城楼 / 剧院 / 大学)
  function roofHip(x, y, w, h, col) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(col, 1.28));
    g.addColorStop(0.55, shade(col, 1.0));
    g.addColorStop(1, shade(col, 0.66));
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.87, y + h * 0.58);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w * 0.13, y + h * 0.58);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(26,18,10,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // 尖塔 + 十字(教堂)
  function spire(x, y, w, h, col, cross) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(col, 1.32)); g.addColorStop(1, shade(col, 0.60));
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,8,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    // 塔身受光边
    ctx.fillStyle = 'rgba(255,246,214,0.18)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.5, y + h); ctx.lineTo(x, y + h);
    ctx.closePath(); ctx.fill();
    if (cross) {
      ctx.strokeStyle = '#f0e0ac'; ctx.lineWidth = Math.max(1.2, w * 0.09);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y - h * 0.10); ctx.lineTo(x + w * 0.5, y + h * 0.24);
      ctx.moveTo(x + w * 0.35, y + h * 0.03); ctx.lineTo(x + w * 0.65, y + h * 0.03);
      ctx.stroke();
    }
  }

  // 圆顶(谷仓筒仓)
  function dome(x, y, w, h, col) {
    const g = ctx.createRadialGradient(x + w * 0.36, y + h * 0.3, w * 0.05, x + w * 0.5, y + h * 0.5, w * 0.6);
    g.addColorStop(0, shade(col, 1.34)); g.addColorStop(1, shade(col, 0.64));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(26,18,10,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // 窗(夜晚点暖光)
  function winGlass(x, y, w, h, lit) {
    if (w <= 0 || h <= 0) return;
    if (lit && nightK > 0.05) {
      glowDot(x + w / 2, y + h / 2, Math.max(w, h) * 1.7, '255,196,96', 0.55 * nightK);
      ctx.fillStyle = `rgba(255,${200 + 40 * (1 - nightK) | 0},${120 + 60 * (1 - nightK) | 0},0.95)`;
    } else {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, 'rgba(150,180,196,0.95)');
      g.addColorStop(0.45, 'rgba(70,92,108,0.95)');
      g.addColorStop(1, 'rgba(44,60,74,0.95)');
      ctx.fillStyle = g;
    }
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(34,24,14,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0.5, w - 1), Math.max(0.5, h - 1));
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  }

  // 拱门
  function doorArch(x, y, w, h, lit) {
    if (w <= 0 || h <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + h * 0.38);
    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.14, x + w, y + h * 0.38);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#6b4a24'); g.addColorStop(1, '#37240f');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(22,14,8,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    if (lit && nightK > 0.05) glowDot(x + w / 2, y + h * 0.62, w * 1.5, '255,186,84', 0.42 * nightK);
    ctx.fillStyle = 'rgba(255,230,160,0.55)';
    ctx.beginPath(); ctx.arc(x + w * 0.78, y + h * 0.68, Math.max(0.7, w * 0.07), 0, 7); ctx.fill();
  }

  // 烟囱
  function chimney(x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#c0aa92'); g.addColorStop(1, '#6d5c4a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#9a9186';
    ctx.fillRect(x - 1, y - 2, w + 2, Math.max(2, h * 0.16));
    ctx.fillStyle = 'rgba(255,246,214,0.25)';
    ctx.fillRect(x - 1, y - 2, w + 2, 1);
    ctx.strokeStyle = 'rgba(20,14,8,0.45)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0.5, w - 1), Math.max(0.5, h - 1));
  }

  // 通用小屋(墙 + 门 + 双窗 + 双坡顶)
  function drawHouse(b, x, y, w, h, o) {
    o = o || {};
    const wall = o.wall || BWALL[b.type] || '#a89a80';
    const roof = o.roof || BROOF[b.type] || '#7a5c3e';
    const wallTop = y + h * (o.wallTop === undefined ? 0.44 : o.wallTop);
    const wh = (y + h) - wallTop;
    wallBox(x + w * 0.08, wallTop, w * 0.84, wh * 0.97, wall);
    const ww = Math.max(2.2, w * 0.13), whh = Math.max(2.2, wh * 0.30);
    const wy = wallTop + wh * 0.16;
    winGlass(x + w * 0.145, wy, ww, whh, true);
    winGlass(x + w * 0.72, wy, ww, whh, true);
    doorArch(x + w * 0.37, y + h * 0.62, w * 0.26, h * 0.36, true);
    roofGable(x, y + h * (o.roofY === undefined ? 0.06 : o.roofY), w * 0.98, h * (o.roofH === undefined ? 0.44 : o.roofH), roof);
    if (o.chimney) chimney(x + w * 0.68, y + h * 0.02, Math.max(2.6, w * 0.11), h * 0.28);
  }

  // ---- 小道具 ----
  function woodPile(x, y, w, h) {
    for (let i = 0; i < 3; i++) {
      const yy = y - i * h * 0.5;
      ctx.fillStyle = i % 2 ? '#8a6a44' : '#75593a';
      ctx.fillRect(x, yy, w, h * 0.55);
      ctx.fillStyle = 'rgba(255,240,200,0.18)';
      ctx.fillRect(x, yy, w, 1);
    }
    ctx.fillStyle = '#c8a86a';
    ctx.beginPath(); ctx.arc(x + w * 0.5, y - h * 0.62, Math.max(1.1, w * 0.16), 0, 7); ctx.fill();
  }
  function barrel(x, y, w, h) {
    ctx.fillStyle = '#8a6034';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,12,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,236,190,0.22)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.38, y + h * 0.36, w * 0.2, h * 0.18, 0, 0, 7); ctx.fill();
  }
  function crate(x, y, w, h) {
    ctx.fillStyle = '#b08a52'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(50,34,16,0.65)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0.5, w - 1), Math.max(0.5, h - 1));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
  }
  function lampPost(x, y, s, hgt) {
    ctx.strokeStyle = '#3e352c'; ctx.lineWidth = Math.max(1.1, s * 0.045);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - hgt); ctx.stroke();
    ctx.fillStyle = '#5a4a38';
    ctx.beginPath(); ctx.arc(x, y - hgt, Math.max(1.5, s * 0.07), 0, 7); ctx.fill();
    glowDot(x, y - hgt, s * 0.55, '255,206,120', 0.6 * nightK);
  }
  function banner(x, y, s, col) {
    ctx.strokeStyle = '#5a4a33'; ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.55); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x + s * 0.34, y - s * 0.47);
    ctx.lineTo(x, y - s * 0.36);
    ctx.closePath(); ctx.fill();
  }
  // 石塔城垛
  function battlement(x, y, w, n) {
    const bw = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) {
      const bx = x + i * bw * 2;
      ctx.fillStyle = '#c9c3b6';
      ctx.fillRect(bx, y - bw * 1.1, bw, bw * 1.1);
      ctx.fillStyle = 'rgba(255,250,230,0.35)';
      ctx.fillRect(bx, y - bw * 1.1, bw, 1);
    }
  }
  function stoneRows(x, y, w, h, n) {
    ctx.strokeStyle = 'rgba(40,34,26,0.28)'; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const yy = y + h * i / n;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    }
  }
  function logRows(x, y, w, h, n) {
    for (let i = 0; i < n; i++) {
      const yy = y + h * i / n;
      ctx.fillStyle = i % 2 ? 'rgba(255,236,196,0.14)' : 'rgba(30,20,10,0.16)';
      ctx.fillRect(x, yy, w, h / n * 0.55);
    }
  }

  // ---- 各建筑专属剪影 ----
  const HOUSE_DRAW = {
    // 木屋:茅草顶小屋 + 柴堆 + 篱笆
    cottage(b, x, y, w, h, s) {
      drawHouse(b, x, y, w, h, { chimney: true });
      woodPile(x + w * 0.74, y + h * 0.94, w * 0.22, h * 0.13);
      ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.02, y + h * 0.88); ctx.lineTo(x + w * 0.02, y + h * 0.99);
      ctx.moveTo(x + w * 0.06, y + h * 0.88); ctx.lineTo(x + w * 0.06, y + h * 0.99);
      ctx.stroke();
    },
    // 石屋:石砌墙 + 石板顶 + 烟囱
    stoneHouse(b, x, y, w, h, s) {
      drawHouse(b, x, y, w, h, { wallTop: 0.42, chimney: true, roofH: 0.42 });
      stoneRows(x + w * 0.08, y + h * 0.42, w * 0.84, h * 0.55, 4);
      ctx.fillStyle = 'rgba(255,250,230,0.10)';
      ctx.fillRect(x + w * 0.08, y + h * 0.42, w * 0.84, 1.5);
    },
    // 宅邸:两层 + 蓝顶 + 角楼旗 + 双烟囱
    manor(b, x, y, w, h, s) {
      drawHouse(b, x, y, w, h, { roof: BROOF.manor, chimney: true, roofH: 0.40, wallTop: 0.40 });
      chimney(x + w * 0.20, y + h * 0.04, Math.max(2.4, w * 0.09), h * 0.26);
      // 角楼
      ctx.fillStyle = BROOF.manor;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.86, y + h * 0.28);
      ctx.lineTo(x + w * 1.0, y + h * 0.46);
      ctx.lineTo(x + w * 0.72, y + h * 0.46);
      ctx.closePath(); ctx.fill();
      wallBox(x + w * 0.76, y + h * 0.44, w * 0.2, h * 0.34, '#e6d6ac');
      winGlass(x + w * 0.80, y + h * 0.50, w * 0.12, h * 0.14, true);
      banner(x + w * 0.86, y + h * 0.28, s * 0.9, '#c94040');
      ctx.fillStyle = '#4a7a3a';   // 修剪整齐的灌木
      ctx.beginPath(); ctx.arc(x + w * 0.06, y + h * 0.86, w * 0.08, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.06, y + h * 0.96, w * 0.07, 0, 7); ctx.fill();
    },
    // 伐木场:原木屋 + 锯木架 + 大木堆
    lumber(b, x, y, w, h, s) {
      wallBox(x + w * 0.10, y + h * 0.46, w * 0.80, h * 0.50, BWALL.lumber);
      logRows(x + w * 0.10, y + h * 0.46, w * 0.80, h * 0.50, 5);
      doorArch(x + w * 0.38, y + h * 0.64, w * 0.24, h * 0.32, true);
      roofGable(x, y + h * 0.08, w, h * 0.44, BROOF.lumber);
      chimney(x + w * 0.70, y + h * 0.04, Math.max(2.4, w * 0.10), h * 0.24);
      woodPile(x + w * 0.04, y + h * 0.96, w * 0.26, h * 0.11);
      woodPile(x + w * 0.66, y + h * 0.96, w * 0.28, h * 0.11);
      // 锯(斜置,带齿)
      ctx.strokeStyle = '#d8d4cc'; ctx.lineWidth = Math.max(1.2, s * 0.05);
      ctx.beginPath(); ctx.moveTo(x + w * 0.30, y + h * 0.30); ctx.lineTo(x + w * 0.80, y + h * 0.22); ctx.stroke();
    },
    // 采石场:露天石坑 + 吊架 + 石料堆 + 矿车
    quarry(b, x, y, w, h, s) {
      ctx.fillStyle = '#8e8a80';
      ctx.beginPath();
      const j = i => (G.U.hash2(b.x * 7 + i, b.y * 5, 9) - 0.5) * s * 0.22;
      ctx.moveTo(x + j(0), y + j(1));
      ctx.lineTo(x + w + j(2), y + j(3));
      ctx.lineTo(x + w + j(4), y + h + j(5));
      ctx.lineTo(x + j(6), y + h + j(7));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,18,14,0.35)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.55, y + h * 0.62, w * 0.30, h * 0.22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(30,28,24,0.45)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.55, y + h * 0.62, w * 0.20, h * 0.14, 0, 0, 7); ctx.fill();
      // 石料堆
      for (let i = 0; i < 3; i++) {
        const rx2 = x + w * (0.14 + i * 0.20), ry2 = y + h * (0.90 - i * 0.06);
        ctx.fillStyle = '#b6b2a6';
        ctx.beginPath();
        ctx.moveTo(rx2 - w * 0.09, ry2 + h * 0.06);
        ctx.lineTo(rx2 - w * 0.02, ry2 - h * 0.06);
        ctx.lineTo(rx2 + w * 0.07, ry2 + h * 0.01);
        ctx.lineTo(rx2 + w * 0.09, ry2 + h * 0.06);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,252,240,0.35)';
        ctx.beginPath();
        ctx.moveTo(rx2 - w * 0.02, ry2 - h * 0.06);
        ctx.lineTo(rx2 + w * 0.07, ry2 + h * 0.01);
        ctx.lineTo(rx2 - w * 0.01, ry2 + h * 0.01);
        ctx.closePath(); ctx.fill();
      }
      // 吊架(A 字木架 + 绳 + 吊钩)
      ctx.strokeStyle = '#6b5335'; ctx.lineWidth = Math.max(1.4, s * 0.055);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h * 0.72); ctx.lineTo(x + w * 0.46, y + h * 0.18);
      ctx.lineTo(x + w * 0.64, y + h * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * 0.30, y + h * 0.52); ctx.lineTo(x + w * 0.62, y + h * 0.52); ctx.stroke();
      ctx.strokeStyle = '#3a3128'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w * 0.46, y + h * 0.18); ctx.lineTo(x + w * 0.46, y + h * 0.46); ctx.stroke();
      ctx.fillStyle = '#5a5248';
      ctx.fillRect(x + w * 0.42, y + h * 0.46, w * 0.08, h * 0.07);
    },
    // 谷仓:圆形筒仓 + 圆锥顶 + 粮袋
    granary(b, x, y, w, h, s) {
      ctx.fillStyle = '#9a8256';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.82, w * 0.44, h * 0.16, 0, 0, 7); ctx.fill();
      // 筒仓
      const g = ctx.createLinearGradient(x + w * 0.2, y, x + w * 0.8, y + h);
      g.addColorStop(0, shade(BWALL.granary, 1.22));
      g.addColorStop(0.5, BWALL.granary);
      g.addColorStop(1, shade(BWALL.granary, 0.68));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.56, w * 0.36, h * 0.36, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(30,22,12,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = -1; i <= 1; i++) {   // 铁箍
        ctx.strokeStyle = 'rgba(60,52,40,0.45)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * (0.56 + i * 0.14), w * 0.36, h * 0.07, 0, 0, 7);
        ctx.stroke();
      }
      dome(x + w * 0.14, y + h * 0.02, w * 0.72, h * 0.46, BROOF.granary);
      // 粮袋
      for (let i = 0; i < 3; i++) {
        const bx = x + w * (0.08 + i * 0.14), by = y + h * 0.88;
        ctx.fillStyle = i % 2 ? '#d8c08a' : '#c8ae78';
        ctx.beginPath(); ctx.ellipse(bx, by, w * 0.07, h * 0.07, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,246,214,0.3)';
        ctx.beginPath(); ctx.ellipse(bx - w * 0.02, by - h * 0.02, w * 0.03, h * 0.03, 0, 0, 7); ctx.fill();
      }
    },
    // 仓库:宽体坡顶 + 大门 + 货箱酒桶
    warehouse(b, x, y, w, h, s) {
      wallBox(x + w * 0.06, y + h * 0.42, w * 0.88, h * 0.54, BWALL.warehouse);
      // 大门(双开)
      ctx.fillStyle = '#5e4526';
      ctx.fillRect(x + w * 0.34, y + h * 0.56, w * 0.32, h * 0.40);
      ctx.strokeStyle = 'rgba(24,16,8,0.7)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + w * 0.34, y + h * 0.56, w * 0.32, h * 0.40);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.56); ctx.lineTo(x + w * 0.5, y + h * 0.96);
      ctx.moveTo(x + w * 0.34, y + h * 0.56); ctx.lineTo(x + w, y + h * 0.30);
      ctx.stroke();
      winGlass(x + w * 0.12, y + h * 0.50, w * 0.13, h * 0.13, true);
      winGlass(x + w * 0.76, y + h * 0.50, w * 0.13, h * 0.13, true);
      roofGable(x, y + h * 0.04, w, h * 0.42, BROOF.warehouse);
      crate(x + w * 0.02, y + h * 0.82, w * 0.16, h * 0.14);
      barrel(x + w * 0.80, y + h * 0.80, w * 0.18, h * 0.16);
    },
    // 水井:石圈 + 木架 + 吊桶
    well(b, x, y, w, h, s) {
      const cx = x + w * 0.5, cy = y + h * 0.66, r = w * 0.30;
      ctx.fillStyle = 'rgba(10,12,8,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.5, r * 1.25, r * 0.5, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 8; i++) {   // 石圈
        const a = i / 8 * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#b6b0a2' : '#a49e90';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62, r * 0.30, r * 0.22, 0, 0, 7);
        ctx.fill();
      }
      // 水面(带反光)
      const wg = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r * 0.9);
      wg.addColorStop(0, '#8fd0e8'); wg.addColorStop(0.6, '#3f7fa8'); wg.addColorStop(1, '#1d4a6e');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.72, r * 0.44, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.2, cy - r * 0.12, r * 0.22, r * 0.09, 0, 0, 7); ctx.fill();
      // 木架 + 小顶 + 桶
      ctx.strokeStyle = '#6b5335'; ctx.lineWidth = Math.max(1.4, s * 0.055);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy - r * 0.4); ctx.lineTo(cx - r * 0.95, cy - r * 1.5);
      ctx.moveTo(cx + r * 0.95, cy - r * 0.4); ctx.lineTo(cx + r * 0.95, cy - r * 1.5);
      ctx.stroke();
      ctx.fillStyle = BROOF.well;
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.3, cy - r * 1.4);
      ctx.lineTo(cx, cy - r * 2.1);
      ctx.lineTo(cx + r * 1.3, cy - r * 1.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3a3128'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx, cy - r * 0.9); ctx.stroke();
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(cx - r * 0.16, cy - r * 0.95, r * 0.32, r * 0.28);
      glowDot(cx, cy - r * 1.45, r * 1.6, '255,208,130', 0.35 * nightK);
    },
    // 药草屋:绿顶小屋 + 药圃 + 晾晒药草
    herbalist(b, x, y, w, h, s) {
      drawHouse(b, x, y, w, h, { roofH: 0.42 });
      // 门前药圃(成排小苗)
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 4; k++) {
          const gx = x + w * (0.08 + k * 0.16), gy = y + h * (0.86 + r * 0.10);
          ctx.fillStyle = k % 2 ? '#5fa04a' : '#4a8a3e';
          ctx.beginPath(); ctx.ellipse(gx, gy, w * 0.045, h * 0.035, 0, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,246,214,0.25)';
          ctx.beginPath(); ctx.ellipse(gx - w * 0.012, gy - h * 0.012, w * 0.016, h * 0.012, 0, 0, 7); ctx.fill();
        }
      }
    },
    // 诊疗所:白墙 + 红十字牌 + 附属房
    clinic(b, x, y, w, h, s) {
      drawHouse(b, x, y, w, h, { roof: BROOF.clinic, roofH: 0.42 });
      // 红十字标识
      ctx.fillStyle = 'rgba(250,250,245,0.95)';
      ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.60, w * 0.13, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,40,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#c93a30';
      ctx.fillRect(x + w * 0.47, y + h * 0.53, w * 0.06, h * 0.14);
      ctx.fillRect(x + w * 0.43, y + h * 0.57, w * 0.14, h * 0.06);
      glowDot(x + w * 0.5, y + h * 0.60, w * 0.5, '255,120,110', 0.25 * nightK);
    },
    // 治安所:石砌碉楼 + 城垛 + 箭窗 + 旗
    guard(b, x, y, w, h, s) {
      const bx = x + w * 0.18, bw = w * 0.64, by = y + h * 0.26, bh = h * 0.70;
      wallBox(bx, by, bw, bh, BWALL.guard);
      stoneRows(bx, by, bw, bh, 5);
      battlement(bx, by, bw, 4);
      ctx.fillStyle = 'rgba(20,16,12,0.6)';   // 箭窗
      ctx.fillRect(bx + bw * 0.28, by + bh * 0.22, bw * 0.12, bh * 0.22);
      ctx.fillRect(bx + bw * 0.60, by + bh * 0.22, bw * 0.12, bh * 0.22);
      doorArch(bx + bw * 0.32, by + bh * 0.58, bw * 0.36, bh * 0.42, true);
      banner(bx + bw, by, s * 1.0, '#3f6fb0');
      ctx.fillStyle = 'rgba(10,12,8,0.25)';   // 基座阴影
      ctx.fillRect(x + w * 0.12, y + h * 0.95, w * 0.76, h * 0.05);
    },
    // 学堂:两进房屋 + 钟塔 + 一排窗
    school(b, x, y, w, h, s) {
      wallBox(x + w * 0.06, y + h * 0.46, w * 0.88, h * 0.50, BWALL.school);
      stoneRows(x + w * 0.06, y + h * 0.46, w * 0.88, h * 0.50, 4);
      for (let i = 0; i < 4; i++) winGlass(x + w * (0.12 + i * 0.19), y + h * 0.54, w * 0.12, h * 0.16, true);
      doorArch(x + w * 0.44, y + h * 0.70, w * 0.16, h * 0.26, true);
      roofGable(x + w * 0.04, y + h * 0.10, w * 0.92, h * 0.40, BROOF.school);
      // 钟塔
      const tx = x + w * 0.74, tw = w * 0.22;
      wallBox(tx, y + h * 0.16, tw, h * 0.52, shade(BWALL.school, 0.94));
      spire(tx - tw * 0.06, y - h * 0.06, tw * 1.12, h * 0.26, BROOF.school, false);
      ctx.fillStyle = '#c9a04e';   // 钟
      ctx.beginPath(); ctx.arc(tx + tw * 0.5, y + h * 0.34, tw * 0.22, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,0.5)';
      ctx.beginPath(); ctx.arc(tx + tw * 0.42, y + h * 0.32, tw * 0.08, 0, 7); ctx.fill();
    },
    // 酒馆:两层挑出 + 招牌 + 酒桶 + 灯笼
    tavern(b, x, y, w, h, s) {
      wallBox(x + w * 0.08, y + h * 0.46, w * 0.84, h * 0.50, BWALL.tavern);
      logRows(x + w * 0.08, y + h * 0.46, w * 0.84, h * 0.50, 3);
      winGlass(x + w * 0.14, y + h * 0.54, w * 0.14, h * 0.14, true);
      winGlass(x + w * 0.70, y + h * 0.54, w * 0.14, h * 0.14, true);
      doorArch(x + w * 0.40, y + h * 0.66, w * 0.22, h * 0.30, true);
      // 二层挑檐
      ctx.fillStyle = shade(BWALL.tavern, 0.86);
      ctx.fillRect(x + w * 0.02, y + h * 0.30, w * 0.96, h * 0.18);
      ctx.fillStyle = 'rgba(255,246,214,0.16)';
      ctx.fillRect(x + w * 0.02, y + h * 0.30, w * 0.96, 1.5);
      roofGable(x, y + h * 0.04, w * 0.98, h * 0.30, BROOF.tavern);
      chimney(x + w * 0.72, y + h * 0.02, Math.max(2.4, w * 0.10), h * 0.22);
      // 招牌
      ctx.strokeStyle = '#4a3a26'; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(x + w * 0.86, y + h * 0.50); ctx.lineTo(x + w * 1.02, y + h * 0.50); ctx.stroke();
      ctx.fillStyle = '#7a5a2e';
      ctx.fillRect(x + w * 0.88, y + h * 0.50, w * 0.16, h * 0.16);
      ctx.fillStyle = '#e8c46a';
      ctx.beginPath(); ctx.arc(x + w * 0.96, y + h * 0.58, w * 0.04, 0, 7); ctx.fill();
      barrel(x + w * 0.02, y + h * 0.80, w * 0.17, h * 0.16);
      glowDot(x + w * 0.96, y + h * 0.58, w * 0.5, '255,190,90', 0.5 * nightK);
    },
    // 剧院:拱形立面 + 立柱 + 三角楣 + 面具浮雕
    theater(b, x, y, w, h, s) {
      wallBox(x + w * 0.06, y + h * 0.40, w * 0.88, h * 0.56, BWALL.theater);
      stoneRows(x + w * 0.06, y + h * 0.40, w * 0.88, h * 0.56, 3);
      // 三个拱门
      for (let i = 0; i < 3; i++) doorArch(x + w * (0.12 + i * 0.28), y + h * 0.54, w * 0.16, h * 0.34, true);
      // 立柱
      ctx.fillStyle = 'rgba(255,250,230,0.35)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.06 + i * 0.29), y + h * 0.46, w * 0.035, h * 0.46);
      // 三角楣
      ctx.beginPath();
      ctx.moveTo(x + w * 0.02, y + h * 0.42);
      ctx.lineTo(x + w * 0.5, y + h * 0.06);
      ctx.lineTo(x + w * 0.98, y + h * 0.42);
      ctx.closePath();
      const g = ctx.createLinearGradient(x, y, x + w, y + h * 0.42);
      g.addColorStop(0, shade(BWALL.theater, 1.3)); g.addColorStop(1, shade(BWALL.theater, 0.78));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,10,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      // 两枚面具浮雕(圆牌 + 简单五官,不用 emoji)
      for (let k = 0; k < 2; k++) {
        const mx = x + w * (0.36 + k * 0.28), my = y + h * 0.56;
        ctx.fillStyle = k ? '#e8d9a8' : '#d8b98a';
        ctx.beginPath(); ctx.arc(mx, my, w * 0.075, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(40,28,16,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(40,28,16,0.75)';
        ctx.beginPath(); ctx.arc(mx - w * 0.025, my - h * 0.02, w * 0.012, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + w * 0.025, my - h * 0.02, w * 0.012, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(40,28,16,0.75)'; ctx.lineWidth = Math.max(1, s * 0.035);
        ctx.beginPath();
        if (k) ctx.arc(mx, my + h * 0.01, w * 0.035, 0, Math.PI);
        else ctx.arc(mx, my + h * 0.06, w * 0.035, Math.PI, 0);
        ctx.stroke();
      }
      glowDot(x + w * 0.5, y + h * 0.62, w * 0.75, '255,196,110', 0.35 * nightK);
    },
    // 市集广场:石板铺地 + 喷泉 + 长椅 + 路灯
    plaza(b, x, y, w, h, s) {
      ctx.fillStyle = b.eff > 0 ? '#c2b596' : '#9a9384';
      ctx.fillRect(x, y, w, h);
      // 不规则石板缝
      const N = 6, cw = w / N;
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) {
          const jx = (G.U.hash2(b.x * 31 + i, b.y * 17 + k, 3) - 0.5) * cw * 0.24;
          const jy = (G.U.hash2(b.x * 13 + i, b.y * 29 + k, 4) - 0.5) * cw * 0.24;
          const v = G.U.hash2(i * 7 + b.x, k * 5 + b.y, 6);
          ctx.fillStyle = `rgba(${v > 0.5 ? '255,248,226' : '40,34,24'},${0.05 + Math.abs(v - 0.5) * 0.16})`;
          ctx.fillRect(x + i * cw + jx + 1, y + k * cw + jy + 1, cw - 2, cw - 2);
        }
      }
      ctx.strokeStyle = 'rgba(30,24,16,0.22)'; ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * cw, y); ctx.lineTo(x + i * cw, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + i * cw); ctx.lineTo(x + w, y + i * cw); ctx.stroke();
      }
      // 中央喷泉
      const cx = x + w / 2, cy = y + h / 2, r = w * 0.22;
      ctx.fillStyle = 'rgba(10,12,8,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.7, r * 1.2, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#b0aa9c';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      // 池水
      const wg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      wg.addColorStop(0, '#a8dcee'); wg.addColorStop(0.55, '#4a90b8'); wg.addColorStop(1, '#1f4f70');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.2, r * 0.3, r * 0.12, 0, 0, 7); ctx.fill();
      // 水柱
      ctx.strokeStyle = 'rgba(220,244,255,0.65)'; ctx.lineWidth = Math.max(1.2, s * 0.05);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.9); ctx.stroke();
      ctx.fillStyle = 'rgba(230,248,255,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy - r * 1.0, r * 0.14, 0, 7); ctx.fill();
      // 长椅
      ctx.fillStyle = '#7a5c38';
      ctx.fillRect(x + w * 0.06, y + h * 0.40, w * 0.16, h * 0.05);
      ctx.fillRect(x + w * 0.78, y + h * 0.40, w * 0.16, h * 0.05);
      ctx.fillRect(x + w * 0.06, y + h * 0.72, w * 0.16, h * 0.05);
      ctx.fillRect(x + w * 0.78, y + h * 0.72, w * 0.16, h * 0.05);
      // 路灯 ×2(夜间发光)
      lampPost(x + w * 0.10, y + h * 0.20, s, s * 0.55);
      lampPost(x + w * 0.90, y + h * 0.86, s, s * 0.55);
    },
    // 教堂:中殿 + 钟塔尖顶 + 十字 + 玫瑰窗 + 扶壁
    church(b, x, y, w, h, s) {
      wallBox(x + w * 0.10, y + h * 0.44, w * 0.66, h * 0.52, BWALL.church);
      stoneRows(x + w * 0.10, y + h * 0.44, w * 0.66, h * 0.52, 5);
      doorArch(x + w * 0.16, y + h * 0.64, w * 0.16, h * 0.32, true);
      // 玫瑰窗
      const rx = x + w * 0.44, ry = y + h * 0.60, rr = w * 0.10;
      const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, 0, rx, ry, rr);
      rg.addColorStop(0, '#f0dca0'); rg.addColorStop(0.5, '#6f8fb8'); rg.addColorStop(1, '#2e4a6e');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(60,44,26,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr); ctx.stroke();
      }
      glowDot(rx, ry, rr * 2.2, '255,214,140', 0.45 * nightK);
      roofGable(x + w * 0.08, y + h * 0.10, w * 0.70, h * 0.40, BROOF.church);
      // 钟塔 + 尖顶
      const tx = x + w * 0.68, tw = w * 0.26;
      wallBox(tx, y + h * 0.24, tw, h * 0.72, BWALL.church);
      stoneRows(tx, y + h * 0.24, tw, h * 0.72, 6);
      ctx.fillStyle = 'rgba(24,18,12,0.55)';
      ctx.fillRect(tx + tw * 0.3, y + h * 0.32, tw * 0.4, h * 0.10);
      spire(tx - tw * 0.10, y - h * 0.22, tw * 1.20, h * 0.50, BROOF.cathedral, true);
      // 扶壁
      ctx.fillStyle = 'rgba(255,250,230,0.22)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.14 + i * 0.20), y + h * 0.46, w * 0.04, h * 0.46);
    },
    // 大圣堂:十字平面 + 双塔 + 尖顶 + 玫瑰窗
    cathedral(b, x, y, w, h, s) {
      // 十字主殿
      wallBox(x + w * 0.26, y + h * 0.10, w * 0.48, h * 0.82, BWALL.cathedral);
      wallBox(x + w * 0.08, y + h * 0.40, w * 0.84, h * 0.26, BWALL.cathedral);
      stoneRows(x + w * 0.26, y + h * 0.10, w * 0.48, h * 0.82, 8);
      // 中殿坡顶
      roofGable(x + w * 0.28, y + h * 0.12, w * 0.44, h * 0.50, BROOF.cathedral);
      // 玫瑰窗
      const rx = x + w * 0.5, ry = y + h * 0.34, rr = w * 0.075;
      const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, 0, rx, ry, rr);
      rg.addColorStop(0, '#f6e2ac'); rg.addColorStop(0.5, '#6f8fb8'); rg.addColorStop(1, '#27405f');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(60,44,26,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr); ctx.stroke();
      }
      glowDot(rx, ry, rr * 2.2, '255,216,148', 0.5 * nightK);
      // 大门
      doorArch(x + w * 0.44, y + h * 0.58, w * 0.12, h * 0.34, true);
      // 双塔
      for (let k = 0; k < 2; k++) {
        const tx = x + w * (k ? 0.80 : 0.02), tw = w * 0.18;
        wallBox(tx, y + h * 0.22, tw, h * 0.72, shade(BWALL.cathedral, 1.02));
        stoneRows(tx, y + h * 0.22, tw, h * 0.72, 7);
        winGlass(tx + tw * 0.3, y + h * 0.34, tw * 0.4, h * 0.12, true);
        spire(tx - tw * 0.12, y - h * 0.14, tw * 1.24, h * 0.40, BROOF.cathedral, false);
      }
      // 扶壁
      ctx.fillStyle = 'rgba(255,250,230,0.20)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.12 + i * 0.22), y + h * 0.42, w * 0.03, h * 0.5);
    },
    // 交易所:条纹凉棚 + 货箱 + 天平招牌
    trade(b, x, y, w, h, s) {
      wallBox(x + w * 0.10, y + h * 0.44, w * 0.80, h * 0.52, BWALL.trade);
      doorArch(x + w * 0.42, y + h * 0.66, w * 0.16, h * 0.30, true);
      winGlass(x + w * 0.16, y + h * 0.52, w * 0.12, h * 0.14, true);
      winGlass(x + w * 0.72, y + h * 0.52, w * 0.12, h * 0.14, true);
      roofGable(x + w * 0.08, y + h * 0.14, w * 0.84, h * 0.34, BROOF.trade);
      // 条纹凉棚
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#e8dcc0' : '#b8543e';
        ctx.fillRect(x + w * (0.06 + i * 0.15), y + h * 0.86, w * 0.15, h * 0.10);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + w * 0.06, y + h * 0.96, w * 0.90, h * 0.04);
      // 天平招牌(圆牌 + 横梁 + 两个托盘)
      const mx = x + w * 0.5, my = y + h * 0.30;
      ctx.fillStyle = '#e0c88a';
      ctx.beginPath(); ctx.arc(mx, my, w * 0.09, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(50,36,18,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#4a3a26'; ctx.lineWidth = Math.max(1.1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(mx - w * 0.055, my); ctx.lineTo(mx + w * 0.055, my); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx - w * 0.05, my + h * 0.03, w * 0.02, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + w * 0.05, my + h * 0.03, w * 0.02, 0, Math.PI); ctx.stroke();
      crate(x + w * 0.02, y + h * 0.80, w * 0.14, h * 0.14);
      barrel(x + w * 0.84, y + h * 0.78, w * 0.16, h * 0.16);
    },
    // 大学:拱廊庭院 + 钟塔 + 旗
    university(b, x, y, w, h, s) {
      wallBox(x + w * 0.06, y + h * 0.30, w * 0.88, h * 0.20, BWALL.university);
      wallBox(x + w * 0.06, y + h * 0.50, w * 0.26, h * 0.44, BWALL.university);
      wallBox(x + w * 0.68, y + h * 0.50, w * 0.26, h * 0.44, BWALL.university);
      stoneRows(x + w * 0.06, y + h * 0.50, w * 0.26, h * 0.44, 5);
      stoneRows(x + w * 0.68, y + h * 0.50, w * 0.26, h * 0.44, 5);
      // 中央庭院(草地 + 小径 + 树)
      ctx.fillStyle = '#7ba354';
      ctx.fillRect(x + w * 0.34, y + h * 0.52, w * 0.32, h * 0.40);
      ctx.fillStyle = '#c8bda0';
      ctx.fillRect(x + w * 0.47, y + h * 0.52, w * 0.06, h * 0.40);
      ctx.fillStyle = 'rgba(10,22,12,0.25)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.42, y + h * 0.86, w * 0.05, h * 0.025, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3f7d3a';
      ctx.beginPath(); ctx.arc(x + w * 0.42, y + h * 0.80, w * 0.045, 0, 7); ctx.fill();
      // 拱廊(一排拱窗)
      for (let i = 0; i < 5; i++) doorArch(x + w * (0.10 + i * 0.17), y + h * 0.54, w * 0.10, h * 0.22, true);
      roofGable(x + w * 0.04, y + h * 0.06, w * 0.92, h * 0.26, BROOF.university);
      // 钟塔
      const tx = x + w * 0.40, tw = w * 0.20;
      wallBox(tx, y + h * 0.02, tw, h * 0.34, shade(BWALL.university, 1.04));
      spire(tx - tw * 0.14, y - h * 0.20, tw * 1.28, h * 0.30, BROOF.university, false);
      ctx.fillStyle = '#f2e6c0';   // 钟面
      ctx.beginPath(); ctx.arc(tx + tw * 0.5, y + h * 0.16, tw * 0.24, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(50,36,18,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx + tw * 0.5, y + h * 0.16);
      ctx.lineTo(tx + tw * 0.5, y + h * 0.11); ctx.stroke();
      banner(x + w * 0.96, y + h * 0.10, s * 1.4, '#4a6a9c');
    },
    // 市政厅:钟楼 + 大台阶 + 立柱 + 旗
    hall(b, x, y, w, h, s) {
      wallBox(x + w * 0.06, y + h * 0.40, w * 0.88, h * 0.56, BWALL.hall);
      stoneRows(x + w * 0.06, y + h * 0.40, w * 0.88, h * 0.56, 4);
      // 台阶
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#cbbfa2' : '#b8ac90';
        ctx.fillRect(x + w * 0.28, y + h * (0.88 + i * 0.04), w * 0.44, h * 0.04);
      }
      for (let i = 0; i < 3; i++) doorArch(x + w * (0.24 + i * 0.19), y + h * 0.56, w * 0.14, h * 0.32, true);
      ctx.fillStyle = 'rgba(255,250,230,0.42)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.16 + i * 0.21), y + h * 0.44, w * 0.04, h * 0.44);
      // 三角楣
      ctx.beginPath();
      ctx.moveTo(x + w * 0.04, y + h * 0.44);
      ctx.lineTo(x + w * 0.5, y + h * 0.16);
      ctx.lineTo(x + w * 0.96, y + h * 0.44);
      ctx.closePath();
      const g = ctx.createLinearGradient(x, y, x + w, y + h * 0.44);
      g.addColorStop(0, shade(BWALL.hall, 1.3)); g.addColorStop(1, shade(BWALL.hall, 0.8));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,10,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      // 钟楼
      const tx = x + w * 0.42, tw = w * 0.16;
      wallBox(tx, y - h * 0.12, tw, h * 0.36, shade(BWALL.hall, 1.06));
      roofHip(tx - tw * 0.12, y - h * 0.32, tw * 1.24, h * 0.22, BROOF.hall);
      ctx.fillStyle = '#f5ecc8';
      ctx.beginPath(); ctx.arc(tx + tw * 0.5, y + h * 0.02, tw * 0.26, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(50,36,18,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#4a3a26'; ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(tx + tw * 0.5, y + h * 0.02);
      ctx.lineTo(tx + tw * 0.5, y - h * 0.03); ctx.stroke();
      banner(x + w * 0.94, y + h * 0.30, s * 1.6, '#c94040');
    },
  };

  function drawBuilding(b, wx, wy, s) {
    if (b.type === 'road') { drawRoad(b, wx, wy, s); return; }
    const x = wx, y = wy, w = b.w * s, h = b.h * s;
    contactShadow(x, y, w, h);
    if (b.type === 'farm') { drawFarm(b, x, y, s); return; }
    if (b.type === 'pasture') { drawPasture(b, x, y, s); return; }
    if (b.type === 'plaza') { drawPlaza(b, x, y, s); return; }
    const f = HOUSE_DRAW[b.type] || HOUSE_DRAW.cottage;
    f(b, x, y, w, h, s);
  }

  function drawRoad(b, x, y, s) {
    // 路面 = 中心块 + 朝相邻道路的延伸,周围地形透出;逐格抖动色 + 车辙 + 边缘高光
    const j = G.U.hash2(b.x, b.y, 3), j2 = G.U.hash2(b.x * 3, b.y * 5, 11);
    const base = css([160 + j * 26, 138 + j2 * 22, 96 + j2 * 20]);
    ctx.fillStyle = base;
    if (G.M.isRoad(b.x + 1, b.y)) ctx.fillRect(x + s * 0.5, y + s * 0.3, s * 0.5, s * 0.4);
    if (G.M.isRoad(b.x - 1, b.y)) ctx.fillRect(x, y + s * 0.3, s * 0.5, s * 0.4);
    if (G.M.isRoad(b.x, b.y + 1)) ctx.fillRect(x + s * 0.3, y + s * 0.5, s * 0.4, s * 0.5);
    if (G.M.isRoad(b.x, b.y - 1)) ctx.fillRect(x + s * 0.3, y, s * 0.4, s * 0.5);
    ctx.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, s * 0.44);
    // 受光边(上/左) 与背光边(下/右)
    ctx.fillStyle = 'rgba(255,246,214,0.16)';
    ctx.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, 1.4);
    ctx.fillRect(x + s * 0.28, y + s * 0.28, 1.4, s * 0.44);
    ctx.fillStyle = 'rgba(30,22,12,0.18)';
    ctx.fillRect(x + s * 0.28, y + s * 0.70, s * 0.44, 1.4);
    ctx.fillRect(x + s * 0.70, y + s * 0.28, 1.4, s * 0.44);
    // 车辙 + 碎石 + 草籽
    ctx.fillStyle = 'rgba(60,44,26,0.18)';
    ctx.fillRect(x + s * 0.34, y + s * 0.34, s * 0.32, 1.2);
    ctx.fillRect(x + s * 0.36, y + s * 0.64, s * 0.28, 1.2);
    ctx.fillStyle = 'rgba(255,250,232,0.35)';
    ctx.fillRect(x + s * (0.36 + j * 0.18), y + s * (0.38 + j2 * 0.18), 2, 2);
    ctx.fillStyle = 'rgba(40,30,16,0.30)';
    ctx.fillRect(x + s * (0.52 + j2 * 0.16), y + s * (0.52 + j * 0.16), 2.4, 2.4);
    if (j2 > 0.86) {
      ctx.fillStyle = 'rgba(110,150,70,0.5)';
      ctx.fillRect(x + s * (0.30 + j * 0.3), y + s * (0.72 + j * 0.16), 2, 2.6);
    }
  }

  function drawFarm(b, x, y, s) {
    const si = G.sim.seasonIdx(), winter = si === 3, autumn = si === 2;
    const W2 = s * 2, ripe = b.eff > 0;
    // 田地(带不规则边)
    const jig = i => (G.U.hash2(b.x * 13 + i, b.y * 7, 5) - 0.5) * s * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + jig(0), y + jig(1));
    ctx.lineTo(x + W2 + jig(2), y + jig(3));
    ctx.lineTo(x + W2 + jig(4), y + W2 + jig(5));
    ctx.lineTo(x + jig(6), y + W2 + jig(7));
    ctx.closePath();
    ctx.fillStyle = winter ? '#a4947a' : (autumn ? '#7d5c36' : '#6d5030');
    ctx.fill();
    ctx.strokeStyle = 'rgba(36,26,14,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 犁沟 + 作物
    for (let r = 0; r < 6; r++) {
      const ry = y + 4 + r * (W2 - 8) / 6;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 3, ry + 3.4, W2 - 6, 1.6);
      ctx.fillStyle = winter ? 'rgba(255,255,255,0.34)'
        : (ripe ? (autumn ? '#d4ab3e' : '#8ab845') : '#5f6f3c');
      for (let k = 0; k < 7; k++) {
        const cxx = x + 5 + k * (W2 - 10) / 7;
        ctx.beginPath(); ctx.ellipse(cxx, ry, 2.1, 2.9, 0, 0, 7); ctx.fill();
      }
      ctx.fillStyle = winter ? 'rgba(200,210,220,0.3)' : 'rgba(255,246,200,0.20)';
      ctx.fillRect(x + 3, ry - 1.6, W2 - 6, 1);
    }
    // 稻草人
    const scx = x + W2 * 0.22, scy = y + W2 * 0.34;
    ctx.strokeStyle = '#6b5335'; ctx.lineWidth = Math.max(1.2, s * 0.055);
    ctx.beginPath(); ctx.moveTo(scx, scy + s * 0.42); ctx.lineTo(scx, scy - s * 0.30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(scx - s * 0.26, scy - s * 0.10); ctx.lineTo(scx + s * 0.26, scy - s * 0.10); ctx.stroke();
    ctx.fillStyle = '#d8b96a';
    ctx.beginPath(); ctx.arc(scx, scy - s * 0.32, s * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = '#a8843e';
    ctx.beginPath();
    ctx.moveTo(scx - s * 0.18, scy - s * 0.36);
    ctx.lineTo(scx, scy - s * 0.54);
    ctx.lineTo(scx + s * 0.18, scy - s * 0.36);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,30,16,0.7)';
    ctx.fillRect(scx - s * 0.07, scy - s * 0.34, s * 0.04, s * 0.03);
    ctx.fillRect(scx + s * 0.03, scy - s * 0.34, s * 0.04, s * 0.03);
    // 田边小屋
    const bx = x + W2 * 0.68, by = y + W2 * 0.70, bw = W2 * 0.26;
    ctx.fillStyle = 'rgba(10,12,8,0.24)';
    ctx.beginPath(); ctx.ellipse(bx + bw * 0.5, by + bw * 0.95, bw * 0.62, bw * 0.22, 0, 0, 7); ctx.fill();
    wallBox(bx, by, bw, bw * 0.8, '#a8834f');
    ctx.fillStyle = '#4a3218';
    ctx.fillRect(bx + bw * 0.38, by + bw * 0.42, bw * 0.24, bw * 0.38);
    roofGable(bx - bw * 0.06, by - bw * 0.34, bw * 1.12, bw * 0.42, '#b8894a');
  }

  function drawPasture(b, x, y, s) {
    const W2 = s * 2;
    // 草场(带色调变化)
    ctx.fillStyle = '#7ea350';
    ctx.beginPath();
    const jig = i => (G.U.hash2(b.x * 17 + i, b.y * 11, 8) - 0.5) * s * 0.14;
    ctx.moveTo(x + jig(0), y + jig(1));
    ctx.lineTo(x + W2 + jig(2), y + jig(3));
    ctx.lineTo(x + W2 + jig(4), y + W2 + jig(5));
    ctx.lineTo(x + jig(6), y + W2 + jig(7));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,210,0.10)';
    ctx.fillRect(x + 2, y + 2, W2 - 4, W2 * 0.22);
    // 木栅栏(桩 + 横杆)
    ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = Math.max(1.3, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 5); ctx.lineTo(x + W2 - 3, y + 5);
    ctx.moveTo(x + 3, y + W2 - 5); ctx.lineTo(x + W2 - 3, y + W2 - 5);
    ctx.moveTo(x + 5, y + 3); ctx.lineTo(x + 5, y + W2 - 3);
    ctx.moveTo(x + W2 - 5, y + 3); ctx.lineTo(x + W2 - 5, y + W2 - 3);
    ctx.stroke();
    ctx.fillStyle = '#6b5335';
    for (let i = 0; i <= 4; i++) {
      ctx.fillRect(x + 3 + i * (W2 - 6) / 4 - 1, y + 2, 2.4, 5);
      ctx.fillRect(x + 3 + i * (W2 - 6) / 4 - 1, y + W2 - 7, 2.4, 5);
    }
    // 羊(白色蓬松 + 黑头黑腿 + 朝向)
    if (b.eff > 0) {
      sheepAt(x + s * 0.55, y + s * 0.85, s * 0.20, 1);
      sheepAt(x + s * 1.36, y + s * 1.40, s * 0.22, -1);
      sheepAt(x + s * 1.52, y + s * 0.62, s * 0.17, 1);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x + s, y + s, s * 0.10, 0, 7); ctx.fill();
    }
    // 水槽
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(x + W2 - s * 0.42, y + s * 0.10, s * 0.30, s * 0.16);
    ctx.fillStyle = '#5c9ec4';
    ctx.fillRect(x + W2 - s * 0.39, y + s * 0.13, s * 0.24, s * 0.10);
  }

  // 牧场小羊(纯图形,不用 emoji)
  function sheepAt(x, y, r, dir) {
    const d = dir || 1;
    ctx.fillStyle = 'rgba(10,12,8,0.24)';
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + r * 0.9, r * 1.15, r * 0.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a3630'; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y + r * 0.5); ctx.lineTo(x - r * 0.42, y + r * 1.05);
    ctx.moveTo(x + r * 0.34, y + r * 0.5); ctx.lineTo(x + r * 0.34, y + r * 1.05);
    ctx.stroke();
    ctx.fillStyle = '#f2ece0';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.78, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ddd5c4';
    ctx.beginPath(); ctx.ellipse(x - r * 0.15, y + r * 0.24, r * 0.65, r * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.42, r * 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a3630';
    ctx.beginPath(); ctx.ellipse(x + r * 0.85 * d, y - r * 0.18, r * 0.32, r * 0.26, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.66 * d, y - r * 0.34, r * 0.14, r * 0.09, 0, 0, 7); ctx.fill();
  }

  function drawPlaza(b, x, y, s) {
    HOUSE_DRAW.plaza(b, x, y, s * 2, s * 2, s);
  }

  // ---- 可见居民(walker) ----
  function newDay() {
    // 每天按当日服务分配生成行走居民
    G.walkers = [];
    const max = G.CFG.ECON.maxWalkers;
    const visiting = G.res.filter(r => r.servedJoy || r.servedFaith);
    G.U.shuffle(visiting);
    for (const r of visiting) {
      if (G.walkers.length >= max * 0.7) break;
      const dest = G.B.byId(r.servedJoy || r.servedFaith);
      spawnWalker(r, dest);
    }
    // 补充闲逛者
    fillStrollers(max - G.walkers.length);
  }

  function spawnWalker(r, dest) {
    const home = G.B.byId(r.home) || G.builds.find(b => b.def.key === 'hall');
    if (!home || !dest) return;
    const hd = G.P.doors(home), dd = G.P.doors(dest);
    if (!hd.length || !dd.length) return;
    const a = hd[Math.floor(Math.random() * hd.length)];
    const bdoor = dd[Math.floor(Math.random() * dd.length)];
    const path = G.P.path(a.x, a.y, bdoor.x, bdoor.y);
    if (!path || path.length < 2) return;
    G.walkers.push({
      path, seg: 0, t: 0, resId: r.id,
      speed: 2.6 + Math.random() * 1.4,
      color: jobColor(r),
      hap: r.hap,
      roundTrip: true,
    });
  }

  function fillStrollers(n) {
    const roads = G.builds.filter(b => b.type === 'road');
    if (!roads.length) return;
    for (let i = 0; i < n; i++) {
      const r = G.res.length ? G.U.pick(G.res) : null;
      const from = G.U.pick(roads);
      const targets = roads.filter(o => Math.abs(o.x - from.x) + Math.abs(o.y - from.y) < 14);
      if (!targets.length) continue;
      const to = G.U.pick(targets);
      const path = G.P.path(from.x, from.y, to.x, to.y);
      if (path && path.length > 3) {
        G.walkers.push({
          path, seg: 0, t: 0, resId: r ? r.id : 0,
          speed: 1.8 + Math.random() * 1.2,
          color: r ? jobColor(r) : '#cdbfa4',
          hap: r ? r.hap : 60,
          roundTrip: false,
        });
      }
    }
  }

  function hapColor(h) {
    if (h >= 65) return '#7ec868';
    if (h >= 45) return '#d8c84e';
    return '#d86a4e';
  }

  // 职业配色:按雇主建筑的分类区分(纯表现,只读居民数据)
  const JOB_COLOR = {
    med: '#eef2f5', faith: '#c8a6e6', joy: '#eab35c',
    food: '#93c45c', prod: '#c08d52', civic: '#7db2dc', house: '#d9a878',
  };
  function jobColor(r) {
    if (!r) return '#cdbfa4';
    if (r.sick) return '#9fa6ae';
    const b = r.job ? G.B.byId(r.job) : null;
    return (b && JOB_COLOR[b.def.cat]) || '#cdbfa4';
  }

  function updateWalkers(dtMs) {
    const dt = dtMs / 1000 * (G.sim.speed || 1);
    for (let i = G.walkers.length - 1; i >= 0; i--) {
      const wk = G.walkers[i];
      wk.t += wk.speed * dt;
      while (wk.t >= 1) {
        wk.t -= 1; wk.seg++;
        if (wk.seg >= wk.path.length - 1) {
          if (wk.roundTrip) {
            wk.path.reverse(); wk.seg = 0; wk.t = 0;
            wk.roundTrip = false;
          } else {
            G.walkers.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  // 居民:轮廓描边 + 朝向 + 行走起伏 + 职业配色 + 幸福度围巾
  function drawWalkers() {
    const s = TS(), z = cam.zoom;
    for (const wk of G.walkers) {
      const a = wk.path[wk.seg], b = wk.path[Math.min(wk.seg + 1, wk.path.length - 1)];
      const wx = G.U.lerp(a.x, b.x, wk.t) * s + s / 2;
      const wy = G.U.lerp(a.y, b.y, wk.t) * s + s / 2;
      const p = worldToScreen(wx, wy);
      if (p.x < -20 || p.y < -20 || p.x > cv.clientWidth + 20 || p.y > cv.clientHeight + 20) continue;

      const r = Math.max(2.4, s * 0.155) * z;
      // 行走相位:由所在路段 + 段内进度推出(暂停时自然静止)
      const ph = (wk.seg + wk.t) * 7.5;
      const bob = Math.abs(Math.sin(ph)) * r * 0.20;
      const dir = (b.x !== a.x) ? (b.x > a.x ? 1 : -1) : (wk.dir || 1);
      wk.dir = dir;
      const cx = p.x, cy = p.y - bob;
      const legSw = Math.sin(ph) * r * 0.5;
      const armSw = -Math.sin(ph) * r * 0.45;

      // 接触阴影
      ctx.fillStyle = 'rgba(10,12,8,0.32)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.55, r * 0.85, r * 0.36, 0, 0, 7); ctx.fill();

      // 腿
      ctx.strokeStyle = 'rgba(28,22,16,0.9)'; ctx.lineWidth = Math.max(1, r * 0.30);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy + r * 0.45); ctx.lineTo(cx - r * 0.12 + legSw, cy + r * 0.95);
      ctx.moveTo(cx + r * 0.12, cy + r * 0.45); ctx.lineTo(cx + r * 0.12 - legSw, cy + r * 0.95);
      ctx.stroke();

      // 身体(带受光渐变的圆角躯干)
      const bg = ctx.createLinearGradient(cx - r * 0.5, cy - r * 0.2, cx + r * 0.5, cy + r * 0.7);
      bg.addColorStop(0, shade(wk.color, 1.28));
      bg.addColorStop(1, shade(wk.color, 0.78));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.46, cy + r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.56, cy - r * 0.25, cx, cy - r * 0.28);
      ctx.quadraticCurveTo(cx + r * 0.56, cy - r * 0.25, cx + r * 0.46, cy + r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(24,18,12,0.75)'; ctx.lineWidth = Math.max(1, r * 0.16); ctx.stroke();

      // 手臂(摆动)
      ctx.strokeStyle = shade(wk.color, 0.82); ctx.lineWidth = Math.max(1, r * 0.26);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.40, cy + r * 0.05); ctx.lineTo(cx - r * 0.46 + armSw * 0.8, cy + r * 0.55);
      ctx.moveTo(cx + r * 0.40, cy + r * 0.05); ctx.lineTo(cx + r * 0.46 - armSw * 0.8, cy + r * 0.55);
      ctx.stroke();

      // 头(朝向偏移) + 头发/帽子
      const hx = cx + dir * r * 0.16, hy = cy - r * 0.52;
      ctx.fillStyle = '#e8c49c';
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.36, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(24,18,12,0.7)'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.stroke();
      ctx.fillStyle = '#4a3626';
      ctx.beginPath(); ctx.arc(hx, hy - r * 0.10, r * 0.34, Math.PI * 1.05, Math.PI * 2.0); ctx.fill();

      // 幸福度围巾(小色块)
      ctx.fillStyle = hapColor(wk.hap === undefined ? 60 : wk.hap);
      ctx.fillRect(cx - r * 0.30, cy - r * 0.30, r * 0.60, r * 0.18);
    }
  }

  // ---- 粒子系统:炊烟 / 浮尘 / 落叶 / 萤火 / 雪(固定池,不逐帧重建) ----
  let smokeT = 0;
  function updateSmoke(dtMs) {
    smokeT += dtMs;
    if (smokeT > 320) {
      smokeT = 0;
      const homes = G.builds.filter(b => ['cottage', 'tavern', 'hall', 'stoneHouse', 'lumber', 'clinic'].includes(b.type));
      if (homes.length && smoke.length < 48) {
        const b = G.U.pick(homes);
        smoke.push({
          x: b.x + b.w * 0.72, y: b.y + 0.05,
          vx: (Math.random() - 0.5) * 0.10 + 0.05,
          vy: -0.30 - Math.random() * 0.22,
          life: 1, r: 0.8 + Math.random() * 0.7, sd: Math.random() * 6.28,
        });
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.x += p.vx * dtMs / 100; p.y += p.vy * dtMs / 100;
      p.vx += (Math.random() - 0.5) * 0.004;
      p.life -= dtMs / 4200;
      if (p.life <= 0) smoke.splice(i, 1);
    }
  }
  function drawSmoke() {
    const s = TS(), z = cam.zoom;
    for (const p of smoke) {
      const sc = worldToScreen(p.x * s, p.y * s);
      if (sc.x < -40 || sc.y < -40 || sc.x > cv.clientWidth + 40 || sc.y > cv.clientHeight + 40) continue;
      const age = 1 - p.life;
      const rad = s * (0.10 + age * 0.30) * z * p.r;
      const a = 0.30 * p.life;
      const g = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, rad);
      g.addColorStop(0, `rgba(240,240,244,${a})`);
      g.addColorStop(0.55, `rgba(212,214,222,${a * 0.5})`);
      g.addColorStop(1, 'rgba(198,202,212,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sc.x, sc.y, rad, 0, 7); ctx.fill();
    }
  }

  // 大气粒子(屏幕空间,固定池):春/夏浮尘+萤火、秋落叶、冬雪
  function ensureMotes(kind) {
    const count = kind === 'firefly' ? 26 : kind === 'leaf' ? 30 : kind === 'snow' ? 48 : 40;
    if (motes.length === count && motes.kind === kind) return;
    motes.length = 0;
    motes.kind = kind;
    for (let i = 0; i < count; i++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.010,
        vy: kind === 'leaf' ? 0.016 + Math.random() * 0.018
          : kind === 'snow' ? 0.012 + Math.random() * 0.012
            : (Math.random() - 0.5) * 0.008,
        r: 0.5 + Math.random() * 1.6,
        ph: Math.random() * 6.28,
        sw: 0.5 + Math.random(),
      });
    }
  }
  function updateMotes(dtMs) {
    const si = G.sim.seasonIdx();
    const night = nightK > 0.45;
    const kind = night ? 'firefly' : si === 2 ? 'leaf' : si === 3 ? 'snow' : 'dust';
    ensureMotes(kind);
    const k = dtMs / 1000;
    for (const m of motes) {
      m.ph += k * (kind === 'firefly' ? 2.2 : 1.2) * m.sw;
      m.x += (m.vx + Math.sin(m.ph) * 0.006 * m.sw) * k * 60;
      m.y += m.vy * k * 60;
      if (m.x < -0.05) m.x += 1.1; else if (m.x > 1.05) m.x -= 1.1;
      if (m.y < -0.05) m.y += 1.1; else if (m.y > 1.05) m.y -= 1.1;
    }
  }
  function drawMotes() {
    if (!motes.length) return;
    const w = cv.clientWidth, h = cv.clientHeight, kind = motes.kind;
    for (const m of motes) {
      const x = m.x * w, y = m.y * h;
      if (kind === 'firefly') {
        const pulse = 0.35 + 0.65 * Math.abs(Math.sin(m.ph * 0.8));
        glowDot(x, y, 9 * m.sw, '190,255,150', 0.45 * pulse * nightK);
        ctx.fillStyle = `rgba(232,255,196,${0.75 * pulse})`;
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill();
      } else if (kind === 'leaf') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(m.ph);
        ctx.fillStyle = m.sw > 1 ? 'rgba(196,116,40,0.65)' : 'rgba(158,132,42,0.62)';
        ctx.beginPath(); ctx.ellipse(0, 0, m.r * 1.5, m.r * 0.75, 0, 0, 7); ctx.fill();
        ctx.restore();
      } else if (kind === 'snow') {
        ctx.fillStyle = `rgba(238,246,252,${0.30 + 0.35 * Math.abs(Math.sin(m.ph))})`;
        ctx.beginPath(); ctx.arc(x, y, m.r * 0.85, 0, 7); ctx.fill();
      } else {
        // 浮尘:极低对比的微光颗粒(只加不减整体亮度)
        ctx.fillStyle = `rgba(255,246,214,${0.05 + 0.06 * Math.abs(Math.sin(m.ph))})`;
        ctx.beginPath(); ctx.arc(x, y, m.r * 0.7, 0, 7); ctx.fill();
      }
    }
  }

  // ---- 覆盖层 ----
  function drawOverlay(mode) {
    if (mode === 'none') return;
    const s = TS();
    if (mode === 'hap') {
      for (const h of G.B.houses()) {
        const residents = (h.resIds || []).map(id => G.res.find(r => r.id === id)).filter(Boolean);
        const hap = residents.length ? residents.reduce((a, r) => a + r.hap, 0) / residents.length : null;
        if (hap === null) tint(h, 'rgba(120,120,130,0.45)');
        else if (hap >= 60) tint(h, 'rgba(80,200,80,0.4)');
        else if (hap >= 40) tint(h, 'rgba(220,200,60,0.4)');
        else tint(h, 'rgba(220,70,50,0.45)');
      }
      return;
    }
    const need = mode === 'joy' ? 'joy' : mode === 'medical' ? 'medical' : 'faith';
    // 服务范围圈 + 未覆盖住宅标红
    for (const b of G.B.servicesOf(need)) {
      if (b.eff <= 0) continue;
      const cx = (b.x + b.w / 2) * s, cy = (b.y + b.h / 2) * s;
      const p = worldToScreen(cx, cy);
      ctx.strokeStyle = 'rgba(120,220,140,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.def.service.radius * s * cam.zoom, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const r of G.res) {
      const ok = need === 'joy' ? r.coveredJoy : need === 'medical' ? r.coveredMed : r.coveredFaith;
      if (ok) continue;
      const home = G.B.byId(r.home);
      if (home) tint(home, 'rgba(220,70,50,0.45)');
    }
  }

  function tint(b, color) {
    const s = TS();
    const p = worldToScreen(b.x * s, b.y * s);
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, b.w * s * cam.zoom, b.h * s * cam.zoom);
  }

  // ---- 放置预览 ----
  function drawPreview() {
    const tool = G.UI.tool;
    if (hover.tx < 0 || !G.M.inB(hover.tx, hover.ty)) return;
    const s = TS();
    if (tool.mode === 'place') {
      const def = G.CFG.BUILDS[tool.key];
      if (!def) return;
      const chk = G.B.canPlace(tool.key, hover.tx, hover.ty);
      for (let yy = 0; yy < def.h; yy++) {
        for (let xx = 0; xx < def.w; xx++) {
          const p = worldToScreen((hover.tx + xx) * s, (hover.ty + yy) * s);
          ctx.fillStyle = chk.ok ? 'rgba(120,220,120,0.45)' : 'rgba(220,70,50,0.45)';
          ctx.fillRect(p.x, p.y, s * cam.zoom - 1, s * cam.zoom - 1);
        }
      }
      const r = def.service ? def.service.radius : (def.aura ? def.aura.radius : 0);
      if (r > 0) {
        const p = worldToScreen((hover.tx + def.w / 2) * s, (hover.ty + def.h / 2) * s);
        ctx.strokeStyle = 'rgba(255,220,120,0.9)';
        ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r * s * cam.zoom, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (tool.mode === 'bulldoze') {
      const b = G.M.bAt(hover.tx, hover.ty);
      if (b) tint(b, 'rgba(220,70,50,0.5)');
      else {
        const p = worldToScreen(hover.tx * s, hover.ty * s);
        ctx.strokeStyle = 'rgba(220,70,50,0.8)';
        ctx.strokeRect(p.x, p.y, s * cam.zoom, s * cam.zoom);
      }
    } else {
      // 选择模式:淡格线
      const p = worldToScreen(hover.tx * s, hover.ty * s);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(p.x, p.y, s * cam.zoom, s * cam.zoom);
    }
  }

  // ---- 小地图 ----
  let miniT = 0;
  function drawMinimap(dtMs) {
    miniT += dtMs;
    if (miniT < 400) return;
    miniT = 0;
    const W = G.CFG.MAPW, H = G.CFG.MAPH;
    const sc = mini.width / W;
    miniCtx.imageSmoothingEnabled = false;
    miniCtx.clearRect(0, 0, mini.width, mini.height);
    if (miniTerr) miniCtx.drawImage(miniTerr, 0, 0, mini.width, mini.height);
    // 未解锁区块罩黑
    const zpx = G.CFG.ZSIZE * sc;
    for (let zy = 0; zy < 3; zy++) for (let zx = 0; zx < 3; zx++) {
      if (!G.map.zones[zy * 3 + zx].open) {
        miniCtx.fillStyle = 'rgba(10,10,14,0.78)';
        miniCtx.fillRect(zx * zpx, zy * zpx, zpx, zpx);
      }
    }
    // 建筑
    for (const b of G.builds) {
      miniCtx.fillStyle = b.type === 'road' ? '#d8c090' : '#ffe9b0';
      miniCtx.fillRect(b.x * sc - 0.5, b.y * sc - 0.5, Math.max(1.5, b.w * sc), Math.max(1.5, b.h * sc));
    }
    // 视野框
    miniCtx.strokeStyle = '#ffffff';
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(cam.x / TS() * sc, cam.y / TS() * sc,
      cv.clientWidth / cam.zoom / TS() * sc, cv.clientHeight / cam.zoom / TS() * sc);
  }

  // ---- 昼夜 / 季节色调(纯表现层:只读"游戏第几天",不改任何模拟数值) ----
  function updateDayNight() {
    const CYCLE = 8;                              // 8 个游戏日完成一次昼夜轮回
    const day = (G.sim.state && G.sim.state.day) || 1;
    const ph = ((day - 1) % CYCLE) / CYCLE;       // 0=黎明 0.25=正午 0.5=黄昏 0.75=午夜
    const dayLit = ph <= 0.5 ? Math.sin(Math.PI * ph * 2) : 0;
    nightK = G.U.clamp(1 - dayLit * 1.45, 0, 1);
    duskK = ph > 0.34 && ph < 0.62 ? G.U.clamp(1 - Math.abs(ph - 0.48) / 0.14, 0, 1) : 0;
  }

  // 大气:云影/雾缓缓飘过地面(预生成 pattern + multiply,单次 fillRect)
  let cloudT = 0;
  function drawClouds(dtMs) {
    if (!cloudPat) return;
    cloudT += dtMs * 0.0016;
    const w = cv.clientWidth, h = cv.clientHeight;
    const ox = -(cloudT % 512), oy = -((cloudT * 0.32) % 512);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.11 + 0.05 * nightK;
    ctx.translate(ox, oy);
    ctx.fillStyle = cloudPat;
    ctx.fillRect(0, 0, w + 512, h + 512);
    ctx.restore();
  }

  // 全局光照方向:左上暖光 → 右下冷影(单次 multiply 全屏填充)
  let sunGrad = null, sunW = 0, sunH = 0;
  function drawSunRamp() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!sunGrad || sunW !== w || sunH !== h) {
      sunW = w; sunH = h;
      sunGrad = ctx.createLinearGradient(0, 0, w * 0.92, h);
      sunGrad.addColorStop(0, 'rgb(255,251,236)');
      sunGrad.addColorStop(0.42, 'rgb(248,247,244)');
      sunGrad.addColorStop(1, 'rgb(198,206,228)');
    }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 后期合成:季节/昼夜色调 + 黄昏暖光 + 日光晕 + 屏幕暗角
  // 先在 256×160 小画布上合成,再一次性放大贴回 → 把 3 次全屏混合压成 1 次
  const PW = 256, PH = 160;
  let postCv = null, postCtx = null;
  function drawPost() {
    if (!postCv) {
      postCv = document.createElement('canvas');
      postCv.width = PW; postCv.height = PH;
      postCtx = postCv.getContext('2d');
    }
    const g = postCtx, si = G.sim.seasonIdx();
    let r = 0, gg = 0, b = 0, a = 0;
    const add = (cr, cg, cb, ca) => {
      const na = a + ca - a * ca;
      if (na <= 0) return;
      r = (r * a + cr * ca * (1 - a)) / na;
      gg = (gg * a + cg * ca * (1 - a)) / na;
      b = (b * a + cb * ca * (1 - a)) / na;
      a = na;
    };
    if (si === 3) add(190, 214, 255, 0.08);
    else if (si === 2) add(255, 172, 62, 0.09);
    else if (si === 1) add(255, 214, 118, 0.07);
    else add(255, 206, 98, 0.09);
    if (nightK > 0.02) add(24, 36, 74, 0.32 * nightK);

    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, PW, PH);
    if (a > 0.004) {
      g.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${a.toFixed(3)})`;
      g.fillRect(0, 0, PW, PH);
    }
    // 黄昏暖光 + 左上日光晕(叠加)
    g.globalCompositeOperation = 'lighter';
    if (duskK > 0.02) {
      g.fillStyle = `rgba(122,56,12,${(0.16 * duskK).toFixed(3)})`;
      g.fillRect(0, 0, PW, PH);
    }
    const gl = g.createRadialGradient(PW * 0.22, -PH * 0.05, 0, PW * 0.22, -PH * 0.05, Math.max(PW, PH) * 0.95);
    gl.addColorStop(0, `rgba(255,206,116,${(0.34 - 0.18 * nightK).toFixed(3)})`);
    gl.addColorStop(0.5, 'rgba(255,198,120,0.06)');
    gl.addColorStop(1, 'rgba(255,196,120,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, PW, PH);
    // 屏幕暗角(预生成的径向渐变)
    g.globalCompositeOperation = 'source-over';
    if (vignetteCv) g.drawImage(vignetteCv, 0, 0, PW, PH);
    ctx.drawImage(postCv, 0, 0, cv.clientWidth, cv.clientHeight);
  }

  // ---- 主绘制 ----
  function draw(dtMs) {
    if (!G.map) return;
    const seasonIdx = G.sim.seasonIdx();
    if (seasonIdx !== lastSeason) { lastSeason = seasonIdx; prerender(seasonIdx); }
    updateDayNight();

    const s = TS();
    ctx.fillStyle = '#101318';
    ctx.fillRect(0, 0, cv.clientWidth, cv.clientHeight);

    // 地形
    const tp = worldToScreen(0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainCv, tp.x, tp.y, G.CFG.MAPW * s * cam.zoom, G.CFG.MAPH * s * cam.zoom);

    // 未解锁领地罩浓雾(带纹理的雾 + 冷色偏移,而不是一整片纯色板)
    for (let zy = 0; zy < 3; zy++) for (let zx = 0; zx < 3; zx++) {
      if (!G.map.zones[zy * 3 + zx].open) {
        const p = worldToScreen(zx * G.CFG.ZSIZE * s, zy * G.CFG.ZSIZE * s);
        const zw = G.CFG.ZSIZE * s * cam.zoom;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.94;
        ctx.fillStyle = fogPat || 'rgba(120,132,150,1)';
        ctx.fillRect(p.x, p.y, zw, zw);
        ctx.restore();
        ctx.fillStyle = 'rgba(22,28,66,0.22)';
        ctx.fillRect(p.x, p.y, zw, zw);
        // 边缘描一层淡淡的光边,像地图未探索区域
        ctx.strokeStyle = 'rgba(150,170,210,0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, zw - 1, zw - 1);
        if (cam.zoom > 0.6) {
          ctx.fillStyle = 'rgba(226,218,192,0.42)';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('未解锁领地', p.x + zw / 2, p.y + zw / 2);
        }
      }
    }

    // 建筑(按 y 排序获得伪立体感)
    const x0 = Math.max(0, Math.floor(cam.x / s) - 2), x1 = Math.min(G.CFG.MAPW, Math.ceil((cam.x + cv.clientWidth / cam.zoom) / s) + 2);
    const y0 = Math.max(0, Math.floor(cam.y / s) - 2), y1 = Math.min(G.CFG.MAPH, Math.ceil((cam.y + cv.clientHeight / cam.zoom) / s) + 3);
    const vis = G.builds.filter(b => b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 - 1 && b.y <= y1);
    vis.sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const b of vis) {
      const p = worldToScreen(b.x * s, b.y * s);
      drawBuilding(b, p.x, p.y, s * cam.zoom);
    }

    drawSmoke();
    drawWalkers();
    drawOverlay(G.UI ? G.UI.overlay : 'none');
    drawPreview();

    // 选中建筑高亮
    const sel = G.UI ? G.UI.selected : null;
    if (sel && G.builds.includes(sel)) {
      const p = worldToScreen(sel.x * s, sel.y * s);
      ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 1, p.y - 1, sel.w * s * cam.zoom + 2, sel.h * s * cam.zoom + 2);
    }

    // ---- 氛围层 ----
    drawMotes();          // 浮尘 / 落叶 / 萤火 / 雪
    drawClouds(dtMs);     // 云影缓缓飘过
    drawSunRamp();        // 统一光源方向(左上暖光 → 右下冷影)
    drawPost();           // 昼夜/季节分级 + 暖光晕 + 屏幕暗角(单次合成)

    updateSmoke(dtMs);
    updateMotes(dtMs);
    updateWalkers(dtMs);
    drawMinimap(dtMs);
  }

  // ---- 输入 ----
  let painting = false;
  let lastPaint = null;
  function bindInput() {
    cv.addEventListener('mousedown', e => {
      const t = G.UI.tool;
      if (e.button === 0 && (t.mode === 'place' || t.mode === 'bulldoze')) {
        painting = true;
        lastPaint = null;
        const tile = tileAt(e.clientX - cv.getBoundingClientRect().left, e.clientY - cv.getBoundingClientRect().top);
        paintTile(tile);
      } else if (e.button === 2 || e.button === 1 || t.mode === 'select') {
        dragPan = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      }
    });
    window.addEventListener('mousemove', e => {
      const rect = cv.getBoundingClientRect();
      const tile = tileAt(e.clientX - rect.left, e.clientY - rect.top);
      hover = tile;
      if (painting && e.buttons & 1) {
        paintTile(tile);
      } else if (dragPan) {
        const dx = e.clientX - dragPan.sx, dy = e.clientY - dragPan.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) dragPan.moved = true;
        cam.x = dragPan.cx - dx / cam.zoom;
        cam.y = dragPan.cy - dy / cam.zoom;
        clampCam();
      }
    });
    window.addEventListener('mouseup', e => {
      if (painting) { painting = false; return; }
      if (dragPan && !dragPan.moved && e.button === 0) {
        G.UI.onCanvasClick(e.clientX - cv.getBoundingClientRect().left, e.clientY - cv.getBoundingClientRect().top);
      }
      dragPan = null;
    });
    cv.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (G.UI.tool.mode !== 'select') G.UI.setTool('select', null);
    });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const oldZoom = cam.zoom;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      cam.zoom = G.U.clamp(cam.zoom * factor, 0.45, 2.6);
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const w = screenToWorld(mx, my);
      cam.x = w.x - mx / cam.zoom;
      cam.y = w.y - my / cam.zoom;
      clampCam();
    }, { passive: false });

    // 键盘
    const keys = {};
    window.addEventListener('keydown', e => {
      keys[e.key] = true;
      if (e.key === ' ') { e.preventDefault(); G.UI.togglePause(); }
      if (e.key === 'Escape') G.UI.setTool('select', null);
      if (e.key === 'b' || e.key === 'B') G.UI.setTool('bulldoze');
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    setInterval(() => {
      if (!G.map) return;
      const v = 14;
      if (keys['w'] || keys['ArrowUp']) { cam.y -= v; clampCam(); }
      if (keys['s'] || keys['ArrowDown']) { cam.y += v; clampCam(); }
      if (keys['a'] || keys['ArrowLeft']) { cam.x -= v; clampCam(); }
      if (keys['d'] || keys['ArrowRight']) { cam.x += v; clampCam(); }
    }, 16);
  }

  // 拖动连画时避免在同一格重复结算
  function paintTile(tile) {
    if (!tile) return;
    const key = tile.tx + ',' + tile.ty;
    if (key === lastPaint) return;
    lastPaint = key;
    G.UI.paintAt(tile.tx, tile.ty);
  }

  // 小地图点击跳转
  function bindMinimap() {
    G.U.$('minimap-wrap').addEventListener('mousedown', e => {
      const rect = mini.getBoundingClientRect();
      const tx = (e.clientX - rect.left) / mini.width * G.CFG.MAPW;
      const ty = (e.clientY - rect.top) / mini.height * G.CFG.MAPH;
      centerOn(tx, ty);
    });
  }

  function onBuildingRemoved(b) {
    for (let i = G.walkers.length - 1; i >= 0; i--) {
      const wk = G.walkers[i];
      const a = wk.path[0];
      if (a && Math.abs(a.x - b.x) <= b.w && Math.abs(a.y - b.y) <= b.h) G.walkers.splice(i, 1);
    }
  }

  return {
    init, draw, prerender, centerOn, bindMinimap, onBuildingRemoved,
    worldToScreen, screenToWorld, tileAt,
    newDay,
  };
})();
