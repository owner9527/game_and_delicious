/* ============================================================
 * render.js — Canvas 2D 网格化渲染:地形 / 资源 / 建筑 / 实体 /
 *             灯光遮罩 / 天气 / 粒子 / 小地图(俯视视角)
 *
 * 美术层说明(全部为程序化生成,零外部资源):
 *   - 地表:基色 + 离屏 canvas 噪点 pattern + 大尺度明暗斑块 + 岸线/群系不规则过渡
 *   - 水体:深度渐变 + 双层滚动波形 pattern + 高光带 + 岸边浪花
 *   - 建筑:木质/石质/金属材质区分 + 接触阴影 + 受光面高光 + 轮廓描边
 *   - 实体:轮廓 + 发光眼睛 + 朝向细节 + 行走上下浮动
 *   - 光照:火光/工厂灯光光晕(预生成精灵 + lighter 混合)
 *   - 氛围:昼夜色彩分级 + 大气透视雾带 + 屏幕暗角 + 环境粒子(≤64)
 *
 * 性能约束:所有纹理均在初始化时预生成到离屏 canvas 并 createPattern,
 *           每帧只做矩形/精灵绘制,绝不做全屏逐像素运算。
 * ============================================================ */
'use strict';

const Render = {
  cv: null, ctx: null,
  lcv: null, lctx: null,
  mini: null, mctx: null,
  W: 0, H: 0,
  cam: { x: 0, y: 0, zoom: 1 },
  miniT: 0,
  time: 0,

  /* 帧率统计(便于性能验证) */
  fps: 60, _fpsAcc: 0, _fpsN: 0,
  /* 各阶段耗时 EMA(毫秒,仅诊断用,代价极低) */
  prof: {},

  _mark(k, t0){ this.prof[k] = (this.prof[k] || 0) * 0.88 + (performance.now() - t0) * 0.12; },

  /* 材质明暗色板(每格直接取字符串,避免逐格拼色串) */
  pal: {},
  /* 预生成纹理:canvas 源 + pattern 对象 */
  tex: {}, texRef: [],

  /* 地形查询跨帧缓存(地形确定性且永不改变) */
  _terrCache: new Map(), _terrSeed: -1, _terrKeyWarn: false,
  /* 逐帧视口地形缓冲区 */
  _terr: null, _mo: null, _ore: null, _wet: null, _shore: null,
  _cw: 0, _ch: 0,
  /* 本帧灯光列表(避免重复 ECS 查询) */
  _lights: [],
  /* 环境粒子池 */
  amb: [],
  /* 行走浮动动画状态(纯表现,不参与玩法) */
  _anim: new Map(),

  init(){
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
    this.lcv = document.createElement('canvas');
    this.lctx = this.lcv.getContext('2d');
    this.mini = document.getElementById('mini');
    this.mctx = this.mini.getContext('2d');
    this.buildPalette();
    this.buildTextures();
    this.resize();
    this.initAmbient();
    window.addEventListener('resize', () => this.resize());
    /* 手机浏览器地址栏收放会改可视高度:visualViewport 比 window.resize 更可靠 */
    if(window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    /* 独立于 RAF 的兜底轮询:后台标签页/被节流的页面也能在视口变化后收敛 */
    setInterval(() => {
      if(this.W !== window.innerWidth || this.H !== window.innerHeight || this.dpr !== this.dprOf()) this.resize();
    }, 800);
    this._rectT = 0;
  },
  /* 高DPI:位图按 devicePixelRatio 放大(上限2,避免高分屏手机过载),
   * W/H 保持 CSS 逻辑像素,所有既有坐标计算与事件换算均不变 */
  dprOf(){
    const d = window.devicePixelRatio || 1;
    return Math.max(1, Math.min(2, d));
  },
  /* 屏幕空间(逻辑 CSS 像素)变换:screenToWorld/worldToScreen 全以 CSS 像素为单位 */
  scrTransform(){
    const d = this.dpr || 1;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  },
  resize(){
    this.dpr = this.dprOf();
    this.W = Math.max(1, window.innerWidth);
    this.H = Math.max(1, window.innerHeight);
    /* 关键:画布是"替换元素",#cv 只有 inset:0 而 height:auto —— 绝对定位替换元素的
       使用高度=位图内在高度(高DPI下=innerHeight×dpr 的像素数),画布盒子会被放大到
       位图级,渲染与点击全面错位(手机2~3倍屏/系统缩放必现)。必须显式钉死 CSS 尺寸,
       再把位图设为 CSS×dpr,二者解耦。 */
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.cv.width = Math.max(1, Math.round(this.W * this.dpr));
    this.cv.height = Math.max(1, Math.round(this.H * this.dpr));
    this.lcv.width = this.cv.width; this.lcv.height = this.cv.height;
    this.buildOverlay();
  },
  /* 尺寸自愈:每帧由主循环无条件调用(不依赖开局),窗口/DPR 变化立即重建;
     每 0.4s 额外量一次画布盒子,兜住手机地址栏收放与启动瞬间的退化视口。 */
  checkResize(dt){
    this._rectT = (this._rectT || 0) + dt;
    const needRect = this._rectT > 0.4;
    if(needRect) this._rectT = 0;
    if(this.W !== window.innerWidth || this.H !== window.innerHeight ||
       this.W === 0 || this.H === 0 || this.dpr !== this.dprOf()){
      this.resize();
    } else if(needRect){
      const r = this.cv.getBoundingClientRect();
      if((Math.abs(r.width - this.W) > 1 || Math.abs(r.height - this.H) > 1) && r.width > 0 && r.height > 0) this.resize();
    }
  },
  /* 大气透视雾带 + 暗角:与内容无关,预烘焙成一层,每帧只做一次 blit */
  buildOverlay(){
    if(!this.W || !this.H) return;
    const cv = this.mkCanvas(this.W, this.H), g = cv.getContext('2d');
    const cx = this.W / 2, cy = this.H / 2, rr = Math.hypot(cx, cy);
    /* 白昼的轻微暖调(恒定) */
    g.fillStyle = 'rgba(255,240,204,0.03)';
    g.fillRect(0, 0, this.W, this.H);
    /* 大气透视:保持通透,过强会把画面洗灰(削弱色彩丰富度) */
    const haze = g.createRadialGradient(cx, cy, rr * 0.24, cx, cy, rr * 1.02);
    haze.addColorStop(0, 'rgba(170,196,216,0)');
    haze.addColorStop(0.58, 'rgba(170,196,216,0.030)');
    haze.addColorStop(0.84, 'rgba(178,202,222,0.068)');
    haze.addColorStop(1, 'rgba(188,210,230,0.105)');
    g.fillStyle = haze;
    g.fillRect(0, 0, this.W, this.H);
    const vig = g.createRadialGradient(cx, cy, rr * 0.42, cx, cy, rr * 1.05);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,0.20)');
    vig.addColorStop(1, 'rgba(0,0,0,0.50)');
    g.fillStyle = vig;
    g.fillRect(0, 0, this.W, this.H);
    this.texRef.push(cv);
    this.ovl = cv;
  },

  /* ---------- 色板:每种材质 = 明暗渐变带 × 若干色相微差 ----------
   * 只用一维明暗带时,噪点扰动后的合成色会沿同一条 RGB 直线互相重叠,
   * 使"某个合成色"占比偏高;叠加色相微差把合成色摊到二维区域,
   * 单色占比因此显著下降(画面不再像色块)。 */
  HUE_N: 6,
  HUE_MUL: [
    [1.00, 1.00, 1.00], [1.07, 1.00, 0.91], [0.93, 1.02, 1.09],
    [1.04, 0.95, 1.03], [0.96, 1.04, 0.94], [1.01, 0.97, 1.08],
  ],
  buildPalette(){
    const hx = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const to = (r, g, b) => '#' + [r, g, b].map(v => Util.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => { const A = hx(a), B = hx(b); return to(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
    const ramp = (lo, hi, n) => { const a = []; for(let i = 0; i < n; i++) a.push(mix(lo, hi, i / (n - 1))); return a; };
    /* 一维明暗带 → 二维(明暗 × 色相) */
    const ramp2 = (lo, hi, n) => ramp(lo, hi, n).map(hex => {
      const c = hx(hex);
      return this.HUE_MUL.map(h => to(c[0] * h[0], c[1] * h[1], c[2] * h[2]));
    });
    const P = this.pal;
    P.grass   = ramp2('#2c6118', '#b0de68', 56);  // 草原:深绿→嫩绿
    P.forest  = ramp2('#153c0f', '#74b042', 56);  // 林地:更暗更冷
    P.sand    = ramp2('#9c7c34', '#fbeaa8', 56);  // 干沙
    P.wetSand = ramp2('#5f5429', '#cfb471', 56);  // 湿沙(贴水)
    P.gravel  = ramp2('#413d38', '#c2bbac', 56);  // 砾石(矿脉群系)
    P.water   = ramp2('#082f5e', '#7fdcf5', 56);  // 深水(idx0)→浅滩(idx55)
    P.rock    = ramp2('#565b62', '#b8bec6', 32);  // 石料
    P.wood    = ramp2('#5a3b1e', '#a5763f', 32);  // 木料
    P.metal   = ramp2('#3f444b', '#aab2bd', 32);  // 金属
    /* 兼容旧字段 */
    P.grassDry = P.sand;
  },

  /* ---------- 纹理工具 ---------- */
  mkCanvas(w, h){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },
  mkPattern(cv){
    this.texRef.push(cv); // 保活,避免被 GC 回收后 pattern 失效
    return this.ctx.createPattern(cv, 'repeat');
  },
  /* 无缝平铺:一个点画 9 份(含四周环绕副本) */
  dot9(g, s, x, y, r, fill){
    g.fillStyle = fill;
    for(let ox = -1; ox <= 1; ox++){
      for(let oy = -1; oy <= 1; oy++){
        g.beginPath(); g.arc(x + ox * s, y + oy * s, r, 0, 6.29); g.fill();
      }
    }
  },
  stroke9(g, s, x, y, fn){
    for(let ox = -1; ox <= 1; ox++){
      for(let oy = -1; oy <= 1; oy++){
        g.beginPath();
        fn(x + ox * s, y + oy * s);
        g.stroke();
      }
    }
  },
  /* 径向光晕精灵(替代每帧 createRadialGradient) */
  mkGlow(rgb, c0, c1, c2){
    const cv = this.mkCanvas(128, 128), g = cv.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 63);
    rg.addColorStop(0, `rgba(${rgb},${c0})`);
    rg.addColorStop(0.42, `rgba(${rgb},${c1})`);
    rg.addColorStop(1, `rgba(${rgb},${c2})`);
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    this.texRef.push(cv);
    return cv;
  },

  buildTextures(){
    const T = this.tex = {};
    /* 柔光椭圆接触阴影 */
    {
      const cv = this.mkCanvas(128, 64), g = cv.getContext('2d');
      const rg = g.createRadialGradient(64, 32, 2, 64, 32, 62);
      rg.addColorStop(0, 'rgba(0,0,0,0.62)');
      rg.addColorStop(0.5, 'rgba(0,0,0,0.34)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 64);
      this.texRef.push(cv);
      T.shadow = cv;
    }
    /* 光照遮罩用的硬核光晕(保留原有可读半径手感) */
    {
      const cv = this.mkCanvas(128, 128), g = cv.getContext('2d');
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 63);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      this.texRef.push(cv);
      T.mask = cv;
    }
    /* 各类光晕 */
    T.glowFire  = this.mkGlow('255,142,54', 0.95, 0.42, 0);
    T.glowWarm  = this.mkGlow('255,196,120', 0.85, 0.34, 0);
    T.glowCool  = this.mkGlow('120,228,255', 0.9, 0.34, 0);
    T.glowBlue  = this.mkGlow('130,178,255', 0.9, 0.34, 0);
    T.glowGreen = this.mkGlow('170,255,150', 0.85, 0.3, 0);
    /* 树冠受光高光(替代每棵树的 createRadialGradient) */
    T.canopy = this.mkGlow('164,214,120', 0.9, 0.5, 0);

    /* 地表材质噪点 pattern */
    T.grass  = this.mkPattern(this.texGrass());
    T.forest = this.mkPattern(this.texForest());
    T.sand   = this.mkPattern(this.texSand());
    T.gravel = this.mkPattern(this.texGravel());
    T.wave   = [this.mkPattern(this.texWave(0)), this.mkPattern(this.texWave(1))];
    this.buildSprites();
  },
  /* ---------- 资源节点精灵 ----------
   * 把"树干 + 树冠 + 受光高光 + 轮廓"整棵烘焙成一张图,
   * 渲染时每个节点只需一次 drawImage,大幅削减绘制调用数。 */
  SPR: 36, SPRS: 2,
  mkSprite(drawFn){
    const S = this.SPR * this.SPRS;
    const cv = this.mkCanvas(S, S), g = cv.getContext('2d');
    g.scale(this.SPRS, this.SPRS);
    g.translate(this.SPR / 2, this.SPR / 2);
    drawFn(g);
    this.texRef.push(cv);
    return cv;
  },
  buildSprites(){
    const T = this.tex;
    /* 树木 */
    T.tree = this.mkSprite(g => {
      g.fillStyle = '#523618';
      g.beginPath(); g.moveTo(-3.2, 12); g.lineTo(-2, -2); g.lineTo(2, -2); g.lineTo(3.4, 12); g.closePath(); g.fill();
      g.fillStyle = '#6f4c26';
      g.beginPath(); g.moveTo(-2.2, 12); g.lineTo(-1.2, -2); g.lineTo(0.4, -2); g.lineTo(0.6, 12); g.closePath(); g.fill();
      g.fillStyle = '#1f3d1a';
      g.beginPath(); g.arc(0, -1, 11, 0, 6.29); g.fill();
      g.fillStyle = '#2f5c26';
      g.beginPath(); g.arc(-1.5, -4, 9, 0, 6.29); g.fill();
      const rg = g.createRadialGradient(-4, -8, 0, -1.5, -4, 11);
      rg.addColorStop(0, 'rgba(150,206,108,0.95)');
      rg.addColorStop(0.55, 'rgba(74,124,58,0.72)');
      rg.addColorStop(1, 'rgba(30,58,26,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(-1.5, -4.5, 10.5, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(12,22,10,0.6)';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, -1, 11, 0, 6.29); g.stroke();
    });
    /* 石块 / 铁矿 / 煤矿(矿点直接烘焙,省一层动态填充) */
    for(const kind of ['rock', 'iron', 'coal']){
      T[kind] = this.mkSprite(g => {
        g.fillStyle = '#5b6168';
        g.beginPath(); g.moveTo(-9, 8); g.lineTo(-6, -5); g.lineTo(2, -8); g.lineTo(9, -1); g.lineTo(7, 8); g.closePath(); g.fill();
        g.fillStyle = '#7d848c';
        g.beginPath(); g.moveTo(-6, -5); g.lineTo(2, -8); g.lineTo(4, -2); g.lineTo(-3, 0); g.closePath(); g.fill();
        g.fillStyle = '#aab2ba';
        g.beginPath(); g.moveTo(2, -8); g.lineTo(9, -1); g.lineTo(4, -2); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(18,20,24,0.62)';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(-9, 8); g.lineTo(-6, -5); g.lineTo(2, -8); g.lineTo(9, -1); g.lineTo(7, 8); g.closePath(); g.stroke();
        const cnt = kind === 'iron' ? 3 : (kind === 'coal' ? 4 : 0);
        g.fillStyle = kind === 'iron' ? '#c96f3f' : '#22222a';
        for(let k = 0; k < cnt; k++){
          const a = hash2i(k, 11, 3) * 6.28, d = 2 + hash2i(k, 11, 5) * 2;
          g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.7, kind === 'iron' ? 2.4 : 2.2, 0, 6.29); g.fill();
        }
      });
    }
    /* 浆果丛叶片(浆果数量会变,动态绘制) */
    T.berry = this.mkSprite(g => {
      g.fillStyle = '#254a22'; g.beginPath(); g.arc(0, 2, 8, 0, 6.29); g.fill();
      g.fillStyle = '#3d7038'; g.beginPath(); g.arc(-2, 0, 6.4, 0, 6.29); g.fill();
      g.fillStyle = '#5d9450'; g.beginPath(); g.arc(-3.4, -2.4, 3.6, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(14,30,12,0.6)';
      g.lineWidth = 1.1;
      g.beginPath(); g.arc(0, 2, 8, 0, 6.29); g.stroke();
    });
    /* 水晶簇本体(光晕动态叠加) */
    T.crystal = this.mkSprite(g => {
      g.fillStyle = '#2c8f8c';
      g.beginPath(); this.diaPath(g, -4, 2, 5, 8); this.diaPath(g, 4, 3, 4, 6); this.diaPath(g, 0, -2, 3, 5); g.fill();
      g.fillStyle = '#57d7d0';
      g.beginPath(); this.diaPath(g, -4, 2, 4, 6.5); this.diaPath(g, 4, 3, 3.2, 4.8); g.fill();
      g.fillStyle = '#d8fff9';
      g.beginPath(); this.diaPath(g, -4.4, 1.4, 1.8, 2.6); g.fill();
      g.strokeStyle = 'rgba(220,255,252,0.75)';
      g.lineWidth = 1;
      g.beginPath(); this.diaPath(g, -4, 2, 5, 8); g.stroke();
    });
  },

  /* 全幅细颗粒:初始化时用 ImageData 生成一次(非每帧),让地表不存在"纯色像素"。
   * cell 为颗粒边长(像素),取 2 以兼顾"消除色块"与"不显噪"。 */
  grainFill(g, s, dark, light, amp, seed, cell){
    cell = cell || 2;
    const img = g.createImageData(s, s), d = img.data, rnd = mulberry32(seed);
    for(let y = 0; y < s; y += cell){
      for(let x = 0; x < s; x += cell){
        const v = rnd();
        const c = v < 0.5 ? dark : light;
        const a = Math.round((v < 0.5 ? (0.5 - v) : (v - 0.5)) * 2 * amp * 255);
        for(let dy = 0; dy < cell && y + dy < s; dy++){
          for(let dx = 0; dx < cell && x + dx < s; dx++){
            const o = ((y + dy) * s + (x + dx)) * 4;
            d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
  },

  /* 草原:细颗粒 + 短草叶 + 明暗斑点 */
  texGrass(){
    const s = 256, cv = this.mkCanvas(s, s), g = cv.getContext('2d'), rnd = mulberry32(1201);
    this.grainFill(g, s, [14, 36, 10], [206, 240, 150], 0.15, 4111, 3);
    for(let i = 0; i < 820; i++){
      const dark = rnd() < 0.55;
      this.dot9(g, s, rnd() * s, rnd() * s, 0.6 + rnd() * 1.9,
        dark ? `rgba(22,44,16,${0.08 + rnd() * 0.16})` : `rgba(178,214,128,${0.06 + rnd() * 0.13})`);
    }
    for(let i = 0; i < 300; i++){
      const x = rnd() * s, y = rnd() * s, len = 3 + rnd() * 5, a = -1.35 + rnd() * 0.95;
      g.lineWidth = 0.9;
      g.strokeStyle = rnd() < 0.5 ? `rgba(26,50,18,${0.12 + rnd() * 0.16})` : `rgba(196,226,146,${0.07 + rnd() * 0.12})`;
      this.stroke9(g, s, x, y, (px, py) => {
        g.moveTo(px, py);
        g.quadraticCurveTo(px + Math.cos(a) * len * 0.6 + 1.4, py + Math.sin(a) * len * 0.6, px + Math.cos(a) * len + 2.4, py + Math.sin(a) * len);
      });
    }
    return cv;
  },
  /* 林地:细颗粒 + 落叶 + 苔痕 + 更深的斑驳 */
  texForest(){
    const s = 256, cv = this.mkCanvas(s, s), g = cv.getContext('2d'), rnd = mulberry32(3307);
    this.grainFill(g, s, [8, 24, 8], [150, 196, 106], 0.16, 4222, 3);
    for(let i = 0; i < 520; i++){
      this.dot9(g, s, rnd() * s, rnd() * s, 1.2 + rnd() * 3.4, `rgba(14,30,12,${0.09 + rnd() * 0.18})`);
    }
    for(let i = 0; i < 170; i++){
      const x = rnd() * s, y = rnd() * s, r = 1.6 + rnd() * 2.6, a = rnd() * 6.28;
      const col = rnd() < 0.5 ? `rgba(120,88,44,${0.16 + rnd() * 0.2})` : `rgba(96,132,70,${0.14 + rnd() * 0.16})`;
      this.dot9(g, s, x, y, r, col);
      g.lineWidth = 0.7; g.strokeStyle = 'rgba(0,0,0,0.18)';
      this.stroke9(g, s, x, y, (px, py) => { g.moveTo(px - Math.cos(a) * r, py - Math.sin(a) * r); g.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); });
    }
    return cv;
  },
  /* 沙地:细颗粒 + 细砂 + 风纹 */
  texSand(){
    const s = 256, cv = this.mkCanvas(s, s), g = cv.getContext('2d'), rnd = mulberry32(5501);
    this.grainFill(g, s, [120, 96, 44], [255, 246, 208], 0.14, 4333, 3);
    for(let i = 0; i < 1400; i++){
      const dark = rnd() < 0.45;
      this.dot9(g, s, rnd() * s, rnd() * s, 0.5 + rnd() * 1.3,
        dark ? `rgba(108,88,48,${0.07 + rnd() * 0.13})` : `rgba(255,246,214,${0.08 + rnd() * 0.15})`);
    }
    for(let i = 0; i < 26; i++){
      const y = rnd() * s, amp = 3 + rnd() * 6, ph = rnd() * 6.28;
      g.lineWidth = 1 + rnd() * 1.4;
      g.strokeStyle = rnd() < 0.5 ? `rgba(120,100,58,${0.1 + rnd() * 0.1})` : `rgba(255,250,226,${0.09 + rnd() * 0.1})`;
      for(let oy = -1; oy <= 1; oy++){
        g.beginPath();
        for(let x = 0; x <= s; x += 8) g.lineTo(x, y + oy * s + Math.sin(x * 0.03 + ph) * amp);
        g.stroke();
      }
    }
    return cv;
  },
  /* 砾石/矿脉:细颗粒 + 碎石子 + 深色裂缝 */
  texGravel(){
    const s = 256, cv = this.mkCanvas(s, s), g = cv.getContext('2d'), rnd = mulberry32(7703);
    this.grainFill(g, s, [40, 38, 34], [214, 210, 198], 0.17, 4444, 3);
    for(let i = 0; i < 420; i++){
      const x = rnd() * s, y = rnd() * s, r = 1 + rnd() * 3.2;
      const lite = rnd() < 0.5;
      g.fillStyle = lite ? `rgba(206,200,186,${0.12 + rnd() * 0.16})` : `rgba(48,44,40,${0.14 + rnd() * 0.2})`;
      for(let ox = -1; ox <= 1; ox++){
        for(let oy = -1; oy <= 1; oy++){
          const cx = x + ox * s, cy = y + oy * s;
          g.beginPath();
          g.moveTo(cx - r, cy + r * 0.4);
          g.lineTo(cx - r * 0.3, cy - r);
          g.lineTo(cx + r, cy - r * 0.2);
          g.lineTo(cx + r * 0.6, cy + r * 0.8);
          g.closePath(); g.fill();
        }
      }
    }
    for(let i = 0; i < 90; i++){
      const x = rnd() * s, y = rnd() * s, a = rnd() * 6.28, len = 5 + rnd() * 12;
      g.lineWidth = 0.8; g.strokeStyle = `rgba(24,22,20,${0.1 + rnd() * 0.16})`;
      this.stroke9(g, s, x, y, (px, py) => { g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); });
    }
    return cv;
  },
  /* 水体波纹:横向亮色细纹(用 lighter 叠加 + 平移模拟流动) */
  texWave(k){
    const s = 256, cv = this.mkCanvas(s, s), g = cv.getContext('2d'), rnd = mulberry32(2200 + k * 137);
    const rows = k === 0 ? 22 : 34;
    for(let i = 0; i < rows; i++){
      const y = (i + rnd() * 0.6) * (s / rows);
      const amp = 2 + rnd() * 5, ph = rnd() * 6.28, seg = 26 + rnd() * 40;
      g.lineWidth = k === 0 ? 1.6 + rnd() * 1.6 : 1 + rnd() * 1.1;
      g.strokeStyle = `rgba(196,238,255,${0.16 + rnd() * 0.26})`;
      for(let oy = -1; oy <= 1; oy++){
        g.beginPath();
        let x = 0;
        while(x <= s + seg){
          g.lineTo(x, y + oy * s + Math.sin(x * 0.05 + ph) * amp);
          x += seg;
        }
        g.stroke();
      }
    }
    return cv;
  },

  /* ---------- 世界/屏幕坐标 ---------- */
  worldToScreen(x, y){
    const z = this.cam.zoom;
    return { x: (x - this.cam.x) * z + this.W / 2, y: (y - this.cam.y) * z + this.H / 2 };
  },
  screenToWorld(sx, sy){
    const z = this.cam.zoom;
    return { x: (sx - this.W / 2) / z + this.cam.x, y: (sy - this.H / 2) / z + this.cam.y };
  },

  /* ---------- 主绘制 ---------- */
  draw(dt){
    if(!G || !G.player) return;
    // 视口尺寸自愈(嵌入/自动化环境可能初始为 0;含 devicePixelRatio 变化,如跨屏拖动/系统缩放)
    /* 自愈检查:窗口尺寸/DPR 变化时重建;每 0.4s 量一次画布盒子,
       兜住手机地址栏收放(100vh/100dvh 与 innerHeight 脱节)这类场景。 */
    this.checkResize(dt);
    this.time += dt;
    /* 帧率统计 */
    this._fpsAcc += dt; this._fpsN++;
    if(this._fpsAcc >= 0.5){ this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    const ctx = this.ctx;
    // 相机平滑跟随
    const pp = G.player.pos;
    const f = Math.min(1, dt * 6);
    this.cam.x = Util.lerp(this.cam.x, pp.x, f);
    this.cam.y = Util.lerp(this.cam.y, pp.y, f);
    const z = this.cam.zoom;

    // 本帧灯光一次性收集(渲染多处复用)
    this._lights = Systems.getLights();

    this.scrTransform();
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, this.W, this.H);

    // 世界坐标系(乘 dpr:逻辑坐标不变,位图更精细)
    const d = this.dpr || 1;
    ctx.setTransform(z * d, 0, 0, z * d, (this.W / 2 - this.cam.x * z) * d, (this.H / 2 - this.cam.y * z) * d);

    const halfW = this.W / 2 / z, halfH = this.H / 2 / z;
    const tx0 = Math.floor((this.cam.x - halfW) / TILE) - 1, tx1 = Math.floor((this.cam.x + halfW) / TILE) + 1;
    const ty0 = Math.floor((this.cam.y - halfH) / TILE) - 1, ty1 = Math.floor((this.cam.y + halfH) / TILE) + 1;

    let _t0 = performance.now();
    this.drawTerrain(tx0, ty0, tx1, ty1); this._mark('terrain', _t0);
    _t0 = performance.now(); this.drawHover(); this.drawNodes(tx0, ty0, tx1, ty1); this._mark('nodes', _t0);
    _t0 = performance.now(); this.drawBuildings(dt); this._mark('bld', _t0);
    _t0 = performance.now(); this.drawActors(dt); this._mark('actors', _t0);
    _t0 = performance.now(); this.drawGhost(); this.drawParticles(); this.drawAmbient(dt, false); this._mark('parts', _t0);

    _t0 = performance.now(); this.drawLighting(); this._mark('lightmask', _t0);
    _t0 = performance.now(); this.drawLightGlow(); this._mark('lightglow', _t0);
    _t0 = performance.now(); this.drawRain(); this._mark('rain', _t0);
    _t0 = performance.now(); this.drawAmbient(dt, true); this.drawFloats(); this._mark('parts2', _t0);

    _t0 = performance.now(); this.drawAtmosphere(); this._mark('atmo', _t0);

    this.scrTransform();

    // 小地图
    this.miniT -= dt;
    if(this.miniT <= 0){ this.miniT = 0.4; this.drawMini(); }
  },

  /* ============================================================
   * 地形
   * ============================================================ */

  /* 地形查询缓存:terr(2bit) | moisture(8bit) | oreField(8bit) */
  tileInfo(tx, ty){
    if(this._terrSeed !== World.seed){ this._terrCache.clear(); this._terrSeed = World.seed; }
    const key = (tx + 32768) * 65536 + (ty + 32768);
    let v = this._terrCache.get(key);
    if(v === undefined){
      if(this._terrCache.size > 400000) this._terrCache.clear();
      const m = World.moistureAt(tx, ty), o = World.oreFieldAt(tx, ty);
      v = World.terrainAt(tx, ty) | (Math.round(m * 255) << 2) | (Math.round(o * 255) << 10);
      this._terrCache.set(key, v);
    }
    return v;
  },
  ensureCache(w, h){
    if(this._cw < w || this._ch < h){
      this._cw = Math.max(w, this._cw); this._ch = Math.max(h, this._ch);
      const n = this._cw * this._ch;
      this._terr = new Uint8Array(n);
      this._mo = new Uint8Array(n);
      this._ore = new Uint8Array(n);
      this._wet = new Uint8Array(n);
      this._shore = new Uint8Array(n);
    }
  },
  /* 八邻域偏移(岸线分析用) */
  _D8X: [1, 1, 0, -1, -1, -1, 0, 1],
  _D8Y: [0, 1, 1, 1, 0, -1, -1, -1],
  /* 水格离岸距离(环扫,最多 3 环,超出记 4) */
  shoreDist(terr, W, H, i, j){
    for(let r = 1; r <= 3; r++){
      for(let dy = -r; dy <= r; dy++){
        for(let dx = -r; dx <= r; dx++){
          if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ni = i + dx, nj = j + dy;
          if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          if(terr[nj * W + ni] !== 0) return r;
        }
      }
    }
    return 4;
  },

  drawTerrain(tx0, ty0, tx1, ty1){
    const ctx = this.ctx, t = this.time, P = this.pal;
    const W = tx1 - tx0 + 1, H = ty1 - ty0 + 1;
    this.ensureCache(W, H);
    const terr = this._terr, mo = this._mo, ore = this._ore, wet = this._wet, shore = this._shore;

    /* 1) 采样地形(带跨帧缓存:地形确定性,永不改变) */
    for(let j = 0; j < H; j++){
      for(let i = 0; i < W; i++){
        const v = this.tileInfo(tx0 + i, ty0 + j);
        const k = j * W + i;
        terr[k] = v & 3; mo[k] = (v >> 2) & 255; ore[k] = (v >> 10) & 255;
      }
    }
    /* 2) 岸线分析:wet 位标记(1=邻水 2=邻沙),水格记录离岸距离 */
    for(let j = 0; j < H; j++){
      for(let i = 0; i < W; i++){
        const k = j * W + i;
        if(terr[k] === 0){ shore[k] = this.shoreDist(terr, W, H, i, j); wet[k] = 0; continue; }
        shore[k] = 0;
        let f = 0;
        for(let d = 0; d < 8; d++){
          const ni = i + this._D8X[d], nj = j + this._D8Y[d];
          if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          const nt = terr[nj * W + ni];
          if(nt === 0) f |= 1;
          else if(nt === 1 && terr[k] === 2) f |= 2;
        }
        wet[k] = f;
      }
    }

    const vx = tx0 * TILE, vy = ty0 * TILE, vw = W * TILE, vh = H * TILE;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* 3) 陆地基底色(纯色填充,便宜) */
    for(let j = 0; j < H; j++){
      const ty = ty0 + j;
      for(let i = 0; i < W; i++){
        const k = j * W + i;
        if(terr[k] === 0) continue;
        const tx = tx0 + i;
        const m = mo[k] / 255, o = ore[k] / 255, hsh = hash2i(tx, ty, 1337);
        /* 大尺度明暗斑块:低频值噪声直接揉进基色,免去一整层全屏 pattern 采样 */
        const mott = (vnoise(tx * 0.023, ty * 0.023, 811) - 0.5) * 0.9;
        const hueI = (hash2i(tx, ty, 2027) * this.HUE_N) | 0;
        let ramp, idx;
        if(terr[k] === 1){
          /* 沙滩:贴水一圈用湿沙(更暗更冷),形成干湿过渡 */
          ramp = (wet[k] & 1) ? P.wetSand : P.sand;
          idx = Util.clamp(hsh * 0.50 + m * 0.20 + 0.08 + mott * 0.34, 0, 1) * (ramp.length - 1);
        } else {
          const g = Util.clamp((o - 0.60) / 0.24, 0, 1);   // 矿脉群系 → 砾石带
          ramp = g > 0.55 ? P.gravel : (m > 0.56 ? P.forest : P.grass);
          /* hsh 权重较高 → 逐格微差,单色占比显著下降;m/o/mott 保留大尺度结构 */
          idx = Util.clamp(m * 0.32 + o * 0.14 + hsh * 0.36 + mott * 0.34, 0, 1) * (ramp.length - 1);
        }
        ctx.fillStyle = ramp[Util.clamp(Math.round(idx), 0, ramp.length - 1)][hueI];
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.6, TILE + 0.6);
      }
    }

    /* 3b) 材质噪点 pattern:按 3×3 格为一块填充(pattern 世界锚定,无缝),
     *     比逐格贴纹理少约 8/9 的采样像素;水面稍后会被整体重绘覆盖。 */
    ctx.globalAlpha = 0.62;
    for(let j = 0; j < H; j += 3){
      const ty = ty0 + j;
      for(let i = 0; i < W; i += 3){
        const k = j * W + i;
        let pat = null;
        for(let q = 0; q < 9 && !pat; q++){
          const qx = q % 3, qy = (q - qx) / 3;
          if(i + qx >= W || j + qy >= H) continue;
          const kk = k + qx + qy * W;
          if(terr[kk] === 0) continue;
          if(terr[kk] === 1) pat = this.tex.sand;
          else {
            const o = ore[kk] / 255, m = mo[kk] / 255;
            const g = Util.clamp((o - 0.60) / 0.24, 0, 1);
            pat = g > 0.55 ? this.tex.gravel : (m > 0.56 ? this.tex.forest : this.tex.grass);
          }
        }
        if(!pat) continue;
        ctx.fillStyle = pat;
        ctx.fillRect((tx0 + i) * TILE, ty * TILE, TILE * 3 + 0.6, TILE * 3 + 0.6);
      }
    }
    ctx.globalAlpha = 1;

    /* 4) 大尺度明暗斑块已并入上一步的基色(低频噪声),不再单独铺一层全屏 pattern */

    /* 5) 水体:裁剪 → 深度渐变 → 双层滚动波 → 高光带 */
    let anyWater = false;
    let wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
    ctx.save();
    ctx.beginPath();
    for(let j = 0; j < H; j++){
      for(let i = 0; i < W; i++){
        if(terr[j * W + i] !== 0) continue;
        anyWater = true;
        if(i < wx0) wx0 = i;
        if(i > wx1) wx1 = i;
        if(j < wy0) wy0 = j;
        if(j > wy1) wy1 = j;
        ctx.rect((tx0 + i) * TILE, (ty0 + j) * TILE, TILE + 0.6, TILE + 0.6);
      }
    }
    if(anyWater){
      ctx.clip();
      /* 水体外接矩形:波形填充只覆盖这里,避免整屏 pattern 采样 */
      const bx = (tx0 + wx0) * TILE - 32, by = (ty0 + wy0) * TILE - 32;
      const bw = (wx1 - wx0 + 1) * TILE + 64, bh = (wy1 - wy0 + 1) * TILE + 64;
      for(let j = wy0; j <= wy1; j++){
        const ty = ty0 + j;
        for(let i = wx0; i <= wx1; i++){
          const k = j * W + i;
          if(terr[k] !== 0) continue;
          const tx = tx0 + i, hsh = hash2i(tx, ty, 4242);
          const deep = Util.clamp((shore[k] - 0.6) / 3, 0, 1);   // 0 贴岸 → 1 深海
          const shallow = 1 - deep;
          const mott = (vnoise(tx * 0.023, ty * 0.023, 811) - 0.5) * 0.5;
          const idx = Util.clamp(Math.round((shallow * 0.68 + hsh * 0.32 + mott) * (P.water.length - 1)), 0, P.water.length - 1);
          ctx.fillStyle = P.water[idx][(hash2i(tx, ty, 2027) * this.HUE_N) | 0];
          ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.6, TILE + 0.6);
        }
      }
      /* 波纹:两层不同速度/尺度的 pattern 平移(限制在水体外接矩形内) */
      ctx.globalCompositeOperation = 'lighter';
      for(let L = 0; L < 2; L++){
        ctx.save();
        ctx.translate(Math.sin(t * 0.22 + L * 2.1) * 16, t * (L === 0 ? 15 : 27));
        ctx.globalAlpha = L === 0 ? 0.42 : 0.26;
        ctx.fillStyle = this.tex.wave[L];
        ctx.fillRect(bx, by, bw, bh);
        ctx.restore();
      }
      /* 高光条:缓慢起伏,模拟水面反射 */
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = 'rgba(206,242,255,0.95)';
      for(let b = 0; b < 3; b++){
        ctx.lineWidth = 1.6 + b * 0.7;
        ctx.beginPath();
        const yb = by + bh * (0.18 + b * 0.31) + Math.sin(t * 0.5 + b * 1.7) * 16;
        for(let x = bx; x <= bx + bw; x += 26){
          const y = yb + Math.sin(x * 0.021 + t * 1.15 + b * 2.1) * 5.5;
          if(x === bx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    /* 6) 岸线过渡:湿沙暗边 + 不规则浪花 + 草沙交融 */
    this.drawShore(tx0, ty0, W, H, terr, shore, wet);

    /* 7) 地面细节:草丛 / 碎石(稀疏,打散网格感) */
    this.drawGroundDetail(tx0, ty0, W, H, terr, ore);
  },

  drawShore(tx0, ty0, W, H, terr, shore, wet){
    const ctx = this.ctx, t = this.time, P = this.pal;
    const DX = this._D8X, DY = this._D8Y;
    /* 湿沙暗边:所有临水陆地合并成一条路径,一次填充 */
    ctx.fillStyle = 'rgba(38,68,84,0.20)';
    ctx.beginPath();
    let anyWet = false;
    for(let j = 0; j < H; j++){
      const ty = ty0 + j;
      for(let i = 0; i < W; i++){
        const k = j * W + i;
        if(terr[k] === 0 || !(wet[k] & 1)) continue;
        const tx = tx0 + i, px = tx * TILE, py = ty * TILE, hsh = hash2i(tx, ty, 909);
        for(let d = 0; d < 8; d++){
          const dx = DX[d], dy = DY[d];
          const ni = i + dx, nj = j + dy;
          if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          if(terr[nj * W + ni] !== 0) continue;
          anyWet = true;
          const jx = (hash2i(tx, ty, 911 + d) - 0.5) * 8, jy = (hash2i(tx, ty, 941 + d) - 0.5) * 8;
          ctx.ellipse(px + TILE / 2 + dx * TILE * 0.44 + jx, py + TILE / 2 + dy * TILE * 0.44 + jy,
            9 + hsh * 5, 7 + hsh * 4, 0, 0, 6.29);
          ctx.moveTo(px + TILE / 2 + dx * TILE * 0.44 + jx + 9 + hsh * 5, py + TILE / 2 + dy * TILE * 0.44 + jy);
        }
      }
    }
    if(anyWet) ctx.fill();

    /* 贴岸浪花:统一脉冲亮度,路径合并成一次叠加填充 */
    const foamA = Math.max(0.05, 0.14 + 0.11 * Math.sin(t * 2.6));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(228,248,255,${foamA})`;
    ctx.beginPath();
    let anyFoam = false;
    for(let j = 0; j < H; j++){
      const ty = ty0 + j;
      for(let i = 0; i < W; i++){
        const k = j * W + i;
        if(terr[k] !== 0 || shore[k] > 1) continue;
        const tx = tx0 + i, px = tx * TILE, py = ty * TILE;
        for(let d = 0; d < 8; d++){
          const dx = DX[d], dy = DY[d];
          const ni = i + dx, nj = j + dy;
          if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          if(terr[nj * W + ni] === 0) continue;
          anyFoam = true;
          const rx = 5 + hash2i(tx, ty, 71 + d) * 6.5, ry = 3.2 + hash2i(tx, ty, 73 + d) * 3.4;
          const cx = px + TILE / 2 + dx * TILE * 0.46 + (hash2i(tx, ty, 31 + d) - 0.5) * 9;
          const cy = py + TILE / 2 + dy * TILE * 0.46 + (hash2i(tx, ty, 57 + d) - 0.5) * 9;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.29);
          ctx.moveTo(cx + rx, cy);
        }
      }
    }
    if(anyFoam) ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    /* 草原与沙滩的交界:不规则草甸蔓延(打破矩形接缝),按 3 档透明度批量绘制 */
    for(let lvl = 0; lvl < 3; lvl++){
      ctx.globalAlpha = 0.6 + lvl * 0.14;
      let any = false;
      ctx.beginPath();
      for(let j = 0; j < H; j++){
        const ty = ty0 + j;
        for(let i = 0; i < W; i++){
          const k = j * W + i;
          if(terr[k] !== 2 || !(wet[k] & 2)) continue;
          const tx = tx0 + i, px = tx * TILE, py = ty * TILE;
          for(let d = 0; d < 8; d++){
            const dx = DX[d], dy = DY[d];
            const ni = i + dx, nj = j + dy;
            if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            if(terr[nj * W + ni] !== 1) continue;
            if(hash2i(tx, ty, 1200 + d) > 0.55) continue;   // 约一半的边会伸出草甸
            const m = (tx * 7 + ty * 13 + d * 31) & 255;
            if((m % 3) !== lvl) continue;
            any = true;
            ctx.ellipse(px + TILE / 2 + dx * TILE * 0.42 + (hash2i(tx, ty, 1300 + d) - 0.5) * 10,
              py + TILE / 2 + dy * TILE * 0.42 + (hash2i(tx, ty, 1400 + d) - 0.5) * 10,
              6 + m % 7, 5 + m % 5, m * 0.02, 0, 6.29);
            ctx.moveTo(px + TILE / 2 + dx * TILE * 0.42 + 6 + m % 7, py + TILE / 2 + dy * TILE * 0.42);
          }
        }
      }
      ctx.fillStyle = P.grass[12 + lvl * 14][lvl % this.HUE_N];
      if(any) ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawGroundDetail(tx0, ty0, W, H, terr, ore){
    const ctx = this.ctx, t = this.time;
    /* 草丛:按深浅两色批量描边,整屏只两次 stroke */
    for(let shade = 0; shade < 2; shade++){
      ctx.strokeStyle = shade === 0 ? 'rgba(30,56,22,0.55)' : 'rgba(150,190,104,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      let any = false;
      for(let j = 0; j < H; j++){
        const ty = ty0 + j;
        for(let i = 0; i < W; i++){
          const k = j * W + i;
          if(terr[k] !== 2 || ore[k] / 255 >= 0.6) continue;
          const r = hash2i(tx0 + i, ty, 6001);
          if(r > 0.16 || (r > 0.09) !== (shade === 0)) continue;
          any = true;
          const m = hash2i(tx0 + i, ty, 6002);
          const bx = (tx0 + i) * TILE + 6 + m * 20, by = ty * TILE + 8 + hash2i(tx0 + i, ty, 6003) * 18;
          for(let b = 0; b < 3; b++){
            const sway = Math.sin(t * 1.6 + tx0 + i + ty + b) * 1.4;
            ctx.moveTo(bx + b * 2.4, by + 4);
            ctx.quadraticCurveTo(bx + b * 2.4 + sway, by - 3, bx + b * 2.4 + sway * 1.7, by - 7 - b);
          }
        }
      }
      if(any) ctx.stroke();
    }
    /* 碎石 / 枝桠:明暗两色批量填充 */
    for(let shade = 0; shade < 2; shade++){
      ctx.fillStyle = shade === 0 ? 'rgba(58,52,44,0.5)' : 'rgba(216,208,190,0.42)';
      ctx.beginPath();
      let any = false;
      for(let j = 0; j < H; j++){
        const ty = ty0 + j;
        for(let i = 0; i < W; i++){
          const k = j * W + i;
          if(terr[k] === 0) continue;
          const r = hash2i(tx0 + i, ty, 6001);
          if(r > 0.16) continue;
          if(terr[k] === 2 && ore[k] / 255 < 0.6) continue;   // 草地走草丛分支
          const m = hash2i(tx0 + i, ty, 6002);
          if((m < 0.5) !== (shade === 0)) continue;
          any = true;
          const cx = (tx0 + i) * TILE + 6 + m * 20, cy = ty * TILE + 8 + hash2i(tx0 + i, ty, 6003) * 16;
          const rx = 1.6 + m * 2.4, ry = 1.2 + m * 1.6;
          ctx.ellipse(cx, cy, rx, ry, m * 3, 0, 6.29);
          ctx.moveTo(cx + rx, cy);
        }
      }
      if(any) ctx.fill();
    }
  },

  /* ---------- 光标高亮 ---------- */
  drawHover(){
    const h = Game.hoverTile;
    if(!h) return;
    const ctx = this.ctx;
    // 右键框选标记矩形 / 放置模式直线预览
    if(Game.dragging){
      const d = Game.dragging;
      if(d.build){
        // 放置模式:直线批量放置预览(Bresenham 格点 + 端点连线)
        const tiles = Game.lineTiles(d);
        ctx.strokeStyle = 'rgba(255,206,120,0.9)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo((d.x0 + 0.5) * TILE, (d.y0 + 0.5) * TILE);
        ctx.lineTo((d.x1 + 0.5) * TILE, (d.y1 + 0.5) * TILE);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,206,120,0.26)';
        for(const t of tiles) ctx.fillRect(t.tx * TILE + 2, t.ty * TILE + 2, TILE - 4, TILE - 4);
        return;
      }
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
      const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      const rx = x0 * TILE, ry = y0 * TILE, rw = (x1 - x0 + 1) * TILE, rh = (y1 - y0 + 1) * TILE;
      const g = ctx.createLinearGradient(rx, ry, rx, ry + rh);
      g.addColorStop(0, 'rgba(255,190,90,0.22)');
      g.addColorStop(1, 'rgba(232,161,60,0.10)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(255,206,120,0.95)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      ctx.setLineDash([]);
      return;
    }
    /* 悬停格:四角括号 + 微弱填充,比方框更精致 */
    const rx = h.tx * TILE, ry = h.ty * TILE;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(rx + 1, ry + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(255,244,214,0.62)';
    ctx.lineWidth = 1.6;
    const c = 7;
    ctx.beginPath();
    ctx.moveTo(rx + 1, ry + 1 + c); ctx.lineTo(rx + 1, ry + 1); ctx.lineTo(rx + 1 + c, ry + 1);
    ctx.moveTo(rx + TILE - 1 - c, ry + 1); ctx.lineTo(rx + TILE - 1, ry + 1); ctx.lineTo(rx + TILE - 1, ry + 1 + c);
    ctx.moveTo(rx + TILE - 1, ry + TILE - 1 - c); ctx.lineTo(rx + TILE - 1, ry + TILE - 1); ctx.lineTo(rx + TILE - 1 - c, ry + TILE - 1);
    ctx.moveTo(rx + 1 + c, ry + TILE - 1); ctx.lineTo(rx + 1, ry + TILE - 1); ctx.lineTo(rx + 1, ry + TILE - 1 - c);
    ctx.stroke();
  },

  /* ---------- 资源节点 ----------
   * 性能:按"材质 + 图层"批处理。整屏数百个节点只产生几十次绘制调用,
   * 全部使用绝对坐标(不再逐个 save/translate/restore)。 */
  _nb: [],
  poly(ctx, px, py, s, pts){
    for(let i = 0; i < pts.length; i += 2){
      const x = px + pts[i] * s, y = py + pts[i + 1] * s;
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  diaPath(ctx, x, y, w, h){
    ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h * 0.4); ctx.lineTo(x - w, y);
    ctx.closePath();
  },
  drawNodes(tx0, ty0, tx1, ty1){
    const ctx = this.ctx, t = this.time, T = this.tex;
    const buf = this._nb;
    buf.length = 0;
    World.eachNodeInRect(tx0, ty0, tx1, ty1, (tx, ty, node) => { buf.push(tx, ty, node); });
    const n = buf.length;
    if(!n) return;
    const px = (i) => buf[i] * TILE + TILE / 2;
    const py = (i) => buf[i + 1] * TILE + TILE / 2;
    const sOf = (i) => buf[i + 2].rich ? 1.18 : 1;
    const hOf = (i) => hash2i(buf[i], buf[i + 1], 7) * 6.28;

    /* 1) 接触阴影:两层同心椭圆,批量成两次填充(软边等效) */
    for(let pass = 0; pass < 2; pass++){
      ctx.fillStyle = pass === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      for(let i = 0; i < n; i += 3){
        const s = sOf(i), bx = px(i), by = py(i) + 7 * s;
        const rx = (pass === 0 ? 19 : 11.5) * s, ry = (pass === 0 ? 8.6 : 5.2) * s;
        ctx.ellipse(bx, by, rx, ry, 0, 0, 6.29);
        ctx.moveTo(bx + rx, by);
      }
      ctx.fill();
    }

    /* 2) 节点本体:每个节点一次 drawImage(树干/树冠/受光/描边已烘焙) */
    const H2 = this.SPR / 2;
    for(let i = 0; i < n; i += 3){
      const nd = buf[i + 2];
      const s = sOf(i);
      const bx = px(i) + (nd.t === 'tree' ? Math.sin(t * 0.8 + hOf(i)) * 1.2 : 0);
      const by = py(i);
      const spr = nd.t === 'tree' ? T.tree : (nd.t === 'berry' ? T.berry : (nd.t === 'crystal' ? T.crystal : T[nd.t]));
      ctx.drawImage(spr, bx - H2 * s, by - H2 * s, this.SPR * s, this.SPR * s);
    }

    /* 3) 水晶光晕(在节点下方/上方叠加,用 lighter) */
    ctx.globalCompositeOperation = 'lighter';
    for(let i = 0; i < n; i += 3){
      if(buf[i + 2].t !== 'crystal') continue;
      const s = sOf(i), glow = 0.6 + Math.sin(t * 2 + hOf(i)) * 0.4;
      ctx.globalAlpha = 0.32 + glow * 0.34;
      ctx.drawImage(T.glowCool, px(i) - 22 * s, py(i) - 22 * s, 44 * s, 44 * s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* 4) 浆果:数量随剩余量变化,批量两层填充 */
    for(let pass = 0; pass < 2; pass++){
      ctx.fillStyle = pass === 0 ? '#b33224' : '#e8685a';
      ctx.beginPath();
      let any = false;
      for(let i = 0; i < n; i += 3){
        const nd = buf[i + 2];
        if(nd.t !== 'berry') continue;
        const sd = hOf(i), bx = px(i), by = py(i);
        const cnt = Math.max(1, Math.round(nd.amt));
        for(let k = 0; k < cnt; k++){
          const a = hash2i(k, Math.round(sd * 10), 3) * 6.28;
          const d = 2 + hash2i(k, Math.round(sd * 10), 5) * 4;
          const ox = Math.cos(a) * d, oy = Math.sin(a) * d * 0.7;
          const r = pass === 0 ? 2.4 : 1;
          const fx = bx + ox + (pass === 0 ? 0 : -0.7), fy = by + oy + (pass === 0 ? 0 : -0.8);
          ctx.arc(fx, fy, r, 0, 6.29);
          ctx.moveTo(fx + r, fy);
        }
        any = true;
      }
      if(any) ctx.fill();
    }

    /* 5) 富集光圈 */
    ctx.globalCompositeOperation = 'lighter';
    for(let i = 0; i < n; i += 3){
      if(!buf[i + 2].rich) continue;
      const pulse = 0.5 + Math.sin(t * 3 + hOf(i)) * 0.25;
      ctx.globalAlpha = pulse * 0.5;
      ctx.drawImage(T.glowWarm, px(i) - 18, py(i) - 18, 36, 36);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* 7) 剩余量条(圆角矩形批处理,用 arc 拐角近似) */
    for(let pass = 0; pass < 3; pass++){
      ctx.fillStyle = ['rgba(6,8,10,0.75)', '#8fd05a', 'rgba(255,255,255,0.35)'][pass];
      ctx.beginPath();
      let any = false;
      for(let i = 0; i < n; i += 3){
        const nd = buf[i + 2];
        const full = Math.round(NODES[nd.t].amount * (nd.rich ? RICH_MULT : 1));
        if(nd.amt >= full) continue;
        const pct = nd.amt / full;
        const bx = px(i), by = py(i);
        if(pass === 0) this.rrPath(ctx, bx - 10.5, by - 16.5, 21, 4.5, 2.2);
        else if(pass === 1) this.rrPath(ctx, bx - 9.5, by - 15.6, 19 * pct, 2.6, 1.3);
        else this.rrPath(ctx, bx - 9.5, by - 15.6, 19 * pct, 1.1, 0.55);
        any = true;
      }
      if(any) ctx.fill();
    }

    /* 8) 标记旗:旗杆 + 旗面(批量两次调用) */
    ctx.strokeStyle = '#8a5f22';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    let anyFlag = false;
    for(let i = 0; i < n; i += 3){
      if(!buf[i + 2].marked) continue;
      const bob = Math.sin(t * 5 + hOf(i)) * 1.5;
      ctx.moveTo(px(i) + 8, py(i) - 6);
      ctx.lineTo(px(i) + 8, py(i) - 18 + bob);
      anyFlag = true;
    }
    if(anyFlag) ctx.stroke();
    ctx.fillStyle = '#f0b64a';
    ctx.beginPath();
    for(let i = 0; i < n; i += 3){
      if(!buf[i + 2].marked) continue;
      const bob = Math.sin(t * 5 + hOf(i)) * 1.5;
      const bx = px(i), by = py(i);
      ctx.moveTo(bx + 8, by - 18 + bob);
      ctx.quadraticCurveTo(bx + 11.5, by - 16.6 + bob, bx + 15, by - 15 + bob);
      ctx.quadraticCurveTo(bx + 11.5, by - 13.4 + bob, bx + 8, by - 12 + bob);
      ctx.closePath();
    }
    if(anyFlag) ctx.fill();
  },
  /* 追加圆角矩形子路径(不 beginPath,便于批处理) */
  rrPath(ctx, x, y, w, h, r){
    r = Math.max(0.01, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },
  diamond(ctx, x, y, w, h){
    ctx.beginPath();
    this.diaPath(ctx, x, y, w, h);
    ctx.fill();
  },
  roundRect(ctx, x, y, w, h, r){
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },
  /* 材质板材:底色 + 顶部受光 + 底部阴影 + 描边 */
  plate(ctx, x, y, w, h, base, top, bottom, outline, r){
    this.roundRect(ctx, x, y, w, h, r || 2);
    ctx.fillStyle = base; ctx.fill();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, top);
    g.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fill();
    if(outline){
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.2;
      this.roundRect(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r || 2);
      ctx.stroke();
    }
  },

  /* ---------- 建筑 ---------- */
  drawBuildings(dt){
    const ctx = this.ctx, t = this.time;
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      const x = b.pos.x, y = b.pos.y;
      ctx.save();
      ctx.translate(x, y);
      /* 接触阴影(脚下椭圆软阴影) */
      ctx.globalAlpha = bd.state === 'blueprint' ? 0.24 : 0.55;
      ctx.drawImage(this.tex.shadow, -TILE * 0.56, TILE * 0.10, TILE * 1.12, TILE * 0.52);
      ctx.globalAlpha = 1;

      if(bd.state === 'blueprint'){
        this.drawBlueprint(ctx, b, bd, t);
      } else {
        this.drawBuildingBody(ctx, bd.def, bd, t, b);
        // 受击闪白
        if(b.hitFlash > 0){
          b.hitFlash -= dt;
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, b.hitFlash * 3)})`;
          ctx.fillRect(-TILE / 2, -TILE / 2, TILE, TILE);
        }
        // 血条
        const def = BUILDINGS[bd.def];
        if(bd.hp < def.hp){
          ctx.fillStyle = 'rgba(6,8,10,0.8)';
          this.roundRect(ctx, -12.5, -TILE / 2 - 7.5, 25, 5, 2.5); ctx.fill();
          const g = ctx.createLinearGradient(-11, 0, 11, 0);
          g.addColorStop(0, '#a8342a'); g.addColorStop(1, '#e0725c');
          ctx.fillStyle = g;
          this.roundRect(ctx, -11, -TILE / 2 - 6.6, 22 * Math.max(0, bd.hp / def.hp), 3.2, 1.6); ctx.fill();
        }
      }
      ctx.restore();
    }
  },
  drawBlueprint(ctx, b, bd, t){
    const pulse = 0.5 + Math.sin(t * 4) * 0.3;
    ctx.globalAlpha = 0.38;
    this.drawBuildingBody(ctx, bd.def, bd, t, b);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(150,208,255,${pulse})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    this.roundRect(ctx, -TILE / 2 + 1, -TILE / 2 + 1, TILE - 2, TILE - 2, 3);
    ctx.stroke();
    ctx.setLineDash([]);
    // 施工进度
    ctx.fillStyle = 'rgba(6,8,10,0.8)';
    this.roundRect(ctx, -12.5, -TILE / 2 - 7.5, 25, 5, 2.5); ctx.fill();
    const g = ctx.createLinearGradient(-11, 0, 11, 0);
    g.addColorStop(0, '#4a7ab0'); g.addColorStop(1, '#9fd0ff');
    ctx.fillStyle = g;
    this.roundRect(ctx, -11, -TILE / 2 - 6.6, 22 * (bd.progress / bd.work), 3.2, 1.6); ctx.fill();
  },
  drawBuildingBody(ctx, defId, bd, t, b){
    const T = this.tex;
    const GA = ctx.globalAlpha;   // 兼容蓝图半透明绘制
    switch(defId){
      case 'campfire': {
        /* 石圈 */
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 4, 12, 8, 0, 0, 6.29); ctx.fill();
        for(let i = 0; i < 8; i++){
          const a = i / 8 * 6.28;
          const px = Math.cos(a) * 10, py = Math.sin(a) * 7.5 + 2;
          ctx.fillStyle = '#4e545c';
          ctx.beginPath(); ctx.ellipse(px, py, 3.2, 2.6, a, 0, 6.29); ctx.fill();
          ctx.fillStyle = '#8d949c';
          ctx.beginPath(); ctx.ellipse(px - 0.7, py - 0.9, 1.6, 1.2, a, 0, 6.29); ctx.fill();
        }
        /* 交叉柴薪 */
        ctx.strokeStyle = '#4a3018';
        ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(7, -1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(7, 4); ctx.stroke();
        ctx.strokeStyle = '#7a5230';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-6, 3.4); ctx.lineTo(6, -1.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -0.6); ctx.lineTo(6, 3.4); ctx.stroke();
        /* 火焰(渐变焰心) */
        const fl = Math.sin(t * 9) * 1.5, fl2 = Math.sin(t * 13 + 2) * 1.2;
        const fg = ctx.createLinearGradient(0, -14, 0, 3);
        fg.addColorStop(0, '#ffe9a0');
        fg.addColorStop(0.35, '#f7a63a');
        fg.addColorStop(1, '#c8451a');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(-5.5, 2); ctx.quadraticCurveTo(-3 + fl, -9, 0 + fl, -14 + fl2);
        ctx.quadraticCurveTo(3.4 - fl2, -8, 5.5, 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,246,190,0.95)';
        ctx.beginPath();
        ctx.moveTo(-2.4, 2); ctx.quadraticCurveTo(0 + fl2, -6, 1.4, 2);
        ctx.closePath(); ctx.fill();
        /* 火星 */
        for(let i = 0; i < 4; i++){
          const a = t * 2.4 + i * 1.7;
          const ey = -6 - ((t * 22 + i * 13) % 18);
          ctx.globalAlpha = GA * Math.max(0, 1 + ey / 18) * 0.9;
          ctx.fillStyle = i % 2 ? '#ffd070' : '#ff8a2a';
          ctx.beginPath(); ctx.arc(Math.sin(a) * 3.4, ey, 1.1, 0, 6.29); ctx.fill();
        }
        ctx.globalAlpha = GA;
        break;
      }
      case 'stockpile': {
        /* 木箱堆:木纹 + 受光面 */
        this.plate(ctx, -12, -8, 24, 18, '#7a5230', 'rgba(255,226,178,0.32)', 'rgba(28,18,8,0.4)', 'rgba(40,26,10,0.85)', 2);
        for(let i = 0; i < 4; i++){
          const bx = i % 2 ? 1 : -10, by = i < 2 ? -6 : 2;
          this.plate(ctx, bx, by, 9, 6.5, '#8f6238', 'rgba(255,232,190,0.34)', 'rgba(30,18,8,0.35)', 'rgba(48,30,12,0.7)', 1.5);
          ctx.strokeStyle = 'rgba(60,38,16,0.6)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(bx + 1.5, by + 1.4); ctx.lineTo(bx + 7.5, by + 1.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx + 1.5, by + 3.6); ctx.lineTo(bx + 7.5, by + 3.6); ctx.stroke();
        }
        ctx.fillStyle = '#a06a3a';
        ctx.fillRect(-12, -9.5, 24, 2.5);
        ctx.fillStyle = 'rgba(255,236,196,0.3)';
        ctx.fillRect(-12, -9.5, 24, 1);
        break;
      }
      case 'torch': {
        /* 木杆 + 缠布 + 火焰 */
        ctx.strokeStyle = 'rgba(20,14,8,0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 10.5); ctx.lineTo(0, -6.5); ctx.stroke();
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -6); ctx.stroke();
        ctx.strokeStyle = '#9a7040';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(-0.8, 9); ctx.lineTo(-0.8, -5); ctx.stroke();
        ctx.fillStyle = '#54402a';
        ctx.beginPath(); ctx.ellipse(0, -5, 3.4, 2.4, 0, 0, 6.29); ctx.fill();
        const fl = Math.sin(t * 11 + (b ? b.id : 0)) * 1;
        const fg = ctx.createLinearGradient(0, -14, 0, -4);
        fg.addColorStop(0, '#ffeeb0');
        fg.addColorStop(0.45, '#f7ac3c');
        fg.addColorStop(1, '#d4561c');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.ellipse(fl * 0.4, -9.5, 3.2, 5.4 + fl * 0.5, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,214,0.95)';
        ctx.beginPath(); ctx.ellipse(fl * 0.3, -8.4, 1.5, 2.6, 0, 0, 6.29); ctx.fill();
        break;
      }
      case 'wallWood': {
        const x0 = -TILE / 2, y0 = -TILE / 2 + 2, w = TILE, h = TILE - 2;
        this.plate(ctx, x0, y0, w, h, '#6f4a2b', 'rgba(255,226,178,0.28)', 'rgba(26,16,6,0.42)', 'rgba(38,24,10,0.9)', 2);
        /* 木板缝 */
        ctx.strokeStyle = 'rgba(48,30,12,0.75)';
        ctx.lineWidth = 1.1;
        for(let i = 1; i < 4; i++){
          ctx.beginPath();
          ctx.moveTo(x0 + i * 8, y0 + 1);
          ctx.lineTo(x0 + i * 8, y0 + h - 1);
          ctx.stroke();
        }
        /* 木纹 */
        ctx.strokeStyle = 'rgba(30,18,6,0.35)';
        ctx.lineWidth = 0.8;
        for(let i = 0; i < 5; i++){
          const yy = y0 + 4 + ((i * 11) % 22);
          ctx.beginPath();
          ctx.moveTo(x0 + 1, yy);
          ctx.quadraticCurveTo(0, yy + 1.6, x0 + w - 1, yy - 0.6);
          ctx.stroke();
        }
        /* 加固横梁 + 顶部受光 */
        ctx.fillStyle = '#8a5f33';
        ctx.fillRect(x0 + 1, y0 + h * 0.44, w - 2, 3);
        ctx.fillStyle = 'rgba(255,236,196,0.18)';
        ctx.fillRect(x0 + 1, y0 + h * 0.44, w - 2, 1);
        break;
      }
      case 'workbench': {
        this.plate(ctx, -12, -6, 24, 14, '#8a5a2b', 'rgba(255,228,180,0.34)', 'rgba(28,18,8,0.4)', 'rgba(46,28,12,0.85)', 2);
        this.plate(ctx, -12, -9, 24, 5, '#a06a3a', 'rgba(255,238,198,0.4)', 'rgba(30,18,8,0.3)', 'rgba(50,32,14,0.8)', 1.5);
        /* 台面工具:金属高光 */
        this.plate(ctx, -8, -12, 5, 3, '#7c828a', 'rgba(255,255,255,0.5)', 'rgba(20,22,26,0.4)', 'rgba(24,26,30,0.8)', 1);
        this.plate(ctx, 3, -12, 6, 2.5, '#a8b0ba', 'rgba(255,255,255,0.62)', 'rgba(20,22,26,0.35)', 'rgba(30,34,40,0.8)', 1);
        ctx.strokeStyle = 'rgba(40,26,12,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.stroke();
        break;
      }
      case 'farm': {
        /* 翻耕的土垄 */
        this.plate(ctx, -TILE / 2 + 1, -TILE / 2 + 1, TILE - 2, TILE - 2, '#5c3d20', 'rgba(255,220,168,0.22)', 'rgba(22,14,6,0.4)', 'rgba(40,26,12,0.85)', 2);
        for(let i = 0; i < 4; i++){
          const yy = -TILE / 2 + 4 + i * 7;
          ctx.fillStyle = '#4a3018';
          ctx.fillRect(-TILE / 2 + 3, yy, TILE - 6, 3.2);
          ctx.fillStyle = 'rgba(180,142,90,0.35)';
          ctx.fillRect(-TILE / 2 + 3, yy, TILE - 6, 1.1);
        }
        if(bd && bd.farm && bd.farm.crop === 1){
          const g = bd.farm.growth;
          for(let i = 0; i < 4; i++){
            for(let j = 0; j < 3; j++){
              const px = -10 + j * 9 + ((i * 5) % 4), py = -10 + i * 7;
              const sway = Math.sin(t * 1.5 + i + j) * 1.2 * g;
              ctx.strokeStyle = g < 0.5 ? '#6ea85c' : '#c9ab48';
              ctx.lineWidth = 1.7;
              ctx.beginPath();
              ctx.moveTo(px, py + 3);
              ctx.quadraticCurveTo(px + sway, py - 3 * g, px + sway * 1.5, py - 7 * g);
              ctx.stroke();
              if(g >= 1){
                ctx.fillStyle = '#e2c666';
                ctx.beginPath(); ctx.ellipse(px + sway * 1.5, py - 8 * g, 1.5, 2.6, 0, 0, 6.29); ctx.fill();
              }
            }
          }
        }
        break;
      }
      case 'kitchen': {
        /* 石砌灶体 + 屋顶瓦楞 */
        this.plate(ctx, -11, -6, 22, 16, '#8a8f96', 'rgba(255,240,214,0.3)', 'rgba(24,26,30,0.4)', 'rgba(38,40,46,0.85)', 2);
        ctx.strokeStyle = 'rgba(48,50,56,0.45)';
        ctx.lineWidth = 0.9;
        for(let i = 0; i < 6; i++){
          ctx.beginPath(); ctx.moveTo(-11, -6 + i * 2.7); ctx.lineTo(11, -6 + i * 2.7); ctx.stroke();
        }
        const rg = ctx.createLinearGradient(-14, -15, 14, -6);
        rg.addColorStop(0, '#c9663f');
        rg.addColorStop(0.5, '#a84a32');
        rg.addColorStop(1, '#7c3222');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(-14, -6); ctx.lineTo(0, -15); ctx.lineTo(14, -6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,18,10,0.8)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-14, -6); ctx.lineTo(0, -15); ctx.lineTo(14, -6);
        ctx.stroke();
        /* 灶门 + 火光 */
        ctx.fillStyle = '#3a2a18';
        this.roundRect(ctx, -4, -1, 8, 11, 2); ctx.fill();
        ctx.globalAlpha = GA * 0.55;
        ctx.fillStyle = 'rgba(240,160,60,0.9)';
        this.roundRect(ctx, -3, 2, 6, 6, 1.5); ctx.fill();
        ctx.globalAlpha = GA;
        /* 烟囱 + 炊烟 */
        this.plate(ctx, 5, -14, 3.5, 6, '#5a5f66', 'rgba(255,255,255,0.3)', 'rgba(20,22,26,0.4)', null, 1);
        const sm = Math.sin(t * 2) * 2;
        ctx.fillStyle = 'rgba(206,208,214,0.34)';
        ctx.beginPath(); ctx.arc(6.8, -17 + sm, 2.4, 0, 6.29); ctx.fill();
        ctx.beginPath(); ctx.arc(7.5, -21.5 + sm * 1.4, 1.8, 0, 6.29); ctx.fill();
        break;
      }
      case 'furnace': {
        /* 金属炉体 + 铆钉 + 炉口红光 */
        this.plate(ctx, -11, -10, 22, 20, '#5f646b', 'rgba(255,246,222,0.24)', 'rgba(18,20,24,0.45)', 'rgba(30,32,36,0.9)', 3);
        this.plate(ctx, -11, -10, 22, 5, '#767c84', 'rgba(255,250,232,0.36)', 'rgba(20,22,26,0.3)', 'rgba(36,38,42,0.8)', 2);
        ctx.fillStyle = '#454a51';
        for(let i = 0; i < 4; i++){
          ctx.beginPath(); ctx.arc(-8 + i * 5.4, -7.6, 0.9, 0, 6.29); ctx.fill();
        }
        const hot = bd && bd.timer > 0.2;
        ctx.fillStyle = '#22252a';
        ctx.beginPath(); ctx.arc(0, 3, 5.6, 0, 6.29); ctx.fill();
        ctx.fillStyle = hot ? `rgba(248,${120 + Math.sin(t * 12) * 40},44,0.98)` : '#33363c';
        ctx.beginPath(); ctx.arc(0, 3, 4.6, 0, 6.29); ctx.fill();
        if(hot){
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = GA * (0.5 + Math.sin(t * 10) * 0.16);
          ctx.drawImage(T.glowFire, -12, -9, 24, 24);
          ctx.globalAlpha = GA;
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'turret': {
        /* 基座 + 转塔 + 金属炮管 */
        const bg = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
        bg.addColorStop(0, '#7d848c');
        bg.addColorStop(1, '#3f444b');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, 6.29); ctx.fill();
        ctx.strokeStyle = 'rgba(20,22,26,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, 6.29); ctx.stroke();
        ctx.fillStyle = '#5f646b';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,232,0.28)';
        ctx.beginPath(); ctx.arc(-2, -2.4, 4.4, 0, 6.29); ctx.fill();
        const a = (bd && bd.aimA !== undefined) ? bd.aimA : -1.57;
        ctx.save();
        ctx.rotate(a);
        this.plate(ctx, 0, -2.4, 13, 4.8, '#3a3e44', 'rgba(255,255,255,0.22)', 'rgba(10,12,16,0.4)', 'rgba(16,18,22,0.85)', 1.5);
        this.plate(ctx, 10, -1.3, 4, 2.6, '#c8ccd4', 'rgba(255,255,255,0.7)', 'rgba(30,34,40,0.35)', 'rgba(30,34,40,0.8)', 1);
        ctx.restore();
        if(bd && bd.tracer > 0){
          bd.tracer -= 0.016;
          ctx.strokeStyle = `rgba(255,232,150,${Math.min(1, bd.tracer * 6)})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
          ctx.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
          ctx.stroke();
        }
        break;
      }
      case 'autominer': {
        /* 工业机箱:金属拉丝 + 警示条 + 指示灯 */
        this.plate(ctx, -11, -11, 22, 22, '#454b54', 'rgba(255,250,236,0.22)', 'rgba(14,16,20,0.45)', 'rgba(26,30,36,0.9)', 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.7;
        for(let i = 0; i < 7; i++){
          ctx.beginPath(); ctx.moveTo(-10, -9 + i * 3); ctx.lineTo(10, -9 + i * 3); ctx.stroke();
        }
        /* 黄黑警示条 */
        for(let i = 0; i < 6; i++){
          ctx.fillStyle = i % 2 ? '#e0b53c' : '#26282e';
          ctx.fillRect(-11 + i * 3.7, 8.4, 3.7, 2.6);
        }
        const bob = Math.abs(Math.sin(t * 6)) * 4;
        this.plate(ctx, -4, -8 + bob, 8, 8, '#8a929e', 'rgba(255,255,255,0.4)', 'rgba(20,24,30,0.35)', 'rgba(30,34,40,0.85)', 1.5);
        ctx.fillStyle = '#c8ccd4';
        ctx.beginPath();
        ctx.moveTo(-4, -8 + bob); ctx.lineTo(0, -12 + bob); ctx.lineTo(4, -8 + bob);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(24,28,34,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, -8 + bob); ctx.lineTo(0, -12 + bob); ctx.lineTo(4, -8 + bob);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#2e3238';
        ctx.fillRect(-3, 4, 6, 5);
        ctx.globalAlpha = GA * (0.5 + Math.sin(t * 5) * 0.45);
        ctx.fillStyle = 'rgba(130,255,180,0.95)';
        ctx.beginPath(); ctx.arc(-8, -8, 1.4, 0, 6.29); ctx.fill();
        ctx.globalAlpha = GA;
        if(Math.random() < 0.1) FX.burst(b ? b.pos.x : 0, (b ? b.pos.y : 0) + 8, '#9aa0a6', 1, 20);
        break;
      }
      case 'lab': {
        /* 穹顶建筑 + 玻璃高光 + 天线 */
        const dg = ctx.createRadialGradient(-4, -3, 1, 0, 2, 12);
        dg.addColorStop(0, '#eef2f8');
        dg.addColorStop(0.6, '#c8ccd4');
        dg.addColorStop(1, '#8b9199');
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(0, 2, 11, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.ellipse(-4, -2, 4.4, 3.2, -0.5, 0, 6.29); ctx.fill();
        ctx.strokeStyle = 'rgba(30,34,40,0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 2, 11, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-11, 2); ctx.lineTo(11, 2); ctx.stroke();
        ctx.strokeStyle = '#8a929e';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(6, -14); ctx.stroke();
        const pulse = 0.5 + Math.sin(t * 4) * 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GA * pulse * 0.8;
        ctx.drawImage(T.glowCool, -6, -21, 12, 12);
        ctx.globalAlpha = GA;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(150,240,235,${0.55 + pulse * 0.45})`;
        ctx.beginPath(); ctx.arc(6, -15, 2.4, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#57d7d0';
        ctx.fillRect(-7, 6, 14, 3);
        break;
      }
      case 'dronebay': {
        /* 起降平台:金属圆盘 + 发光环 + 舷号 */
        const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 12);
        g.addColorStop(0, '#545c68');
        g.addColorStop(1, '#2b3038');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.29); ctx.fill();
        ctx.strokeStyle = 'rgba(87,215,208,0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.29); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.29); ctx.stroke();
        ctx.globalAlpha = GA;
        ctx.fillStyle = '#57d7d0';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H', 0, 4);
        const pulse = 0.3 + Math.sin(t * 3) * 0.2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GA * (0.4 + pulse);
        ctx.drawImage(T.glowCool, -20, -20, 40, 40);
        ctx.globalAlpha = GA;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(120,232,226,${pulse + 0.25})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 15 + Math.sin(t * 3) * 2, 0, 6.29); ctx.stroke();
        break;
      }
      case 'beacon': {
        /* 奇观:石台 + 晶柱 + 强光晕 */
        const pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GA * (0.3 + pulse * 0.4);
        ctx.drawImage(T.glowBlue, -30, -34, 60, 60);
        ctx.globalAlpha = GA;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(20,26,40,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 14, 12, 5, 0, 0, 6.29); ctx.fill();
        const tg = ctx.createLinearGradient(-8, 14, 8, -6);
        tg.addColorStop(0, '#2c3a56');
        tg.addColorStop(0.5, '#495f88');
        tg.addColorStop(1, '#7f9ed0');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(-8, 14); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.lineTo(8, 14);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(16,22,36,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-8, 14); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.lineTo(8, 14);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#5f86c8';
        this.diamond(ctx, 0, -12, 5, 14);
        ctx.fillStyle = '#a8d8ff';
        this.diamond(ctx, -1, -13, 3.4, 9);
        ctx.fillStyle = `rgba(220,244,255,${0.55 + pulse * 0.45})`;
        this.diamond(ctx, 0, -12, 2.2, 7);
        break;
      }
    }
  },

  /* ---------- 实体 ---------- */
  /* 行走动画状态(纯表现层,不回写实体数据) */
  walkAnim(e, dt){
    const m = this._anim;
    let a = m.get(e.id);
    const p = e.pos;
    if(!a){ a = { x: p.x, y: p.y, ph: Math.random() * 6.28, mv: 0, bob: 0, tick: 0 }; m.set(e.id, a); }
    const moved = Math.hypot(p.x - a.x, p.y - a.y);
    a.mv = Util.lerp(a.mv, moved > 0.06 ? 1 : 0, Math.min(1, dt * 9));
    a.ph += dt * 11 * a.mv;
    a.bob = Math.sin(a.ph) * 1.7 * a.mv;
    a.x = p.x; a.y = p.y; a.tick = this.time;
    return a;
  },
  pruneAnim(){
    if(this._anim.size < 400) return;
    for(const [id, a] of this._anim){ if(this.time - a.tick > 5) this._anim.delete(id); }
  },

  drawActors(dt){
    const ctx = this.ctx, t = this.time, T = this.tex;
    this.pruneAnim();
    // 阴影层(接触阴影)
    ctx.globalAlpha = 0.55;
    for(const e of ECS.query('pos', 'body')){
      ctx.drawImage(T.shadow, e.pos.x - 9, e.pos.y + 3, 18, 9);
    }
    ctx.globalAlpha = 1;
    // 怪物(蚀影兽)
    for(const m of ECS.query('monster')){
      const p = m.pos;
      let alpha = 1;
      if(m.spawnT > 0){ m.spawnT -= 0.016; alpha = 1 - m.spawnT / 0.6; }
      const puls = 1 + Math.sin(t * 6 + m.id) * 0.08;
      const a = this.walkAnim(m, dt);
      ctx.save();
      ctx.translate(p.x, p.y + a.bob);
      /* 暗雾环 */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (0.3 + Math.sin(t * 3 + m.id) * 0.1);
      ctx.drawImage(T.glowCool, -17, -17, 34, 34);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      /* 本体:暗影团 + 受光面 */
      const bg = ctx.createRadialGradient(-m.dir * 2, -3, 1, 0, 0, 10 * puls);
      bg.addColorStop(0, '#6a4a8c');
      bg.addColorStop(0.6, '#3d2a52');
      bg.addColorStop(1, '#211532');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, 8.5 * puls, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#55396e';
      ctx.beginPath(); ctx.arc(-m.dir * 2.2, -2.4, 5.6 * puls, 0, 6.29); ctx.fill();
      /* 尖刺/触须:朝向细节 */
      ctx.strokeStyle = 'rgba(30,18,44,0.9)';
      ctx.lineWidth = 1.5;
      for(let i = 0; i < 5; i++){
        const ang = -1.9 + i * 0.75 + Math.sin(t * 5 + i + m.id) * 0.12;
        const len = 8 + (i % 2) * 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 6 * puls, Math.sin(ang) * 6 * puls);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(12,6,20,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, 8.5 * puls, 0, 6.29); ctx.stroke();
      /* 发光眼睛 */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (0.6 + Math.sin(t * 7 + m.id) * 0.3);
      ctx.drawImage(T.glowFire, -9, -11, 18, 18);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff6a4a';
      ctx.beginPath(); ctx.arc(-3 + m.dir * 1.6, -2.4, 1.9, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.arc(3 + m.dir * 1.6, -2.4, 1.9, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath(); ctx.arc(-3 + m.dir * 1.6, -2.4, 0.8, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.arc(3 + m.dir * 1.6, -2.4, 0.8, 0, 6.29); ctx.fill();
      /* 血条 */
      if(m.body.hp < m.body.maxHp){
        ctx.fillStyle = 'rgba(6,8,10,0.8)';
        this.roundRect(ctx, -10, -15, 20, 4, 2); ctx.fill();
        const hg = ctx.createLinearGradient(-9, 0, 9, 0);
        hg.addColorStop(0, '#8a2b22'); hg.addColorStop(1, '#e0725c');
        ctx.fillStyle = hg;
        this.roundRect(ctx, -9, -14.2, 18 * Math.max(0, m.body.hp / m.body.maxHp), 2.4, 1.2); ctx.fill();
      }
      if(m.hitFlash > 0){ m.hitFlash -= 0.016; ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, m.hitFlash * 4)})`; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.29); ctx.fill(); }
      ctx.restore();
    }
    // 工人
    for(const w of ECS.query('worker')){
      const p = w.pos;
      const a = this.walkAnim(w, dt);
      ctx.save();
      ctx.translate(p.x, p.y + a.bob);
      /* 身体:渐变球 + 轮廓 + 受光 */
      const bg = ctx.createRadialGradient(-w.dir * 1.6, -3, 1, 0, 0, 8);
      bg.addColorStop(0, '#f5c078');
      bg.addColorStop(0.55, '#d8913c');
      bg.addColorStop(1, '#8a5520');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, 7.2, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#f0b060';
      ctx.beginPath(); ctx.arc(-w.dir * 1.2, -2.4, 4.6, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(56,34,10,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7.2, 0, 6.29); ctx.stroke();
      /* 朝向:帽子 */
      ctx.fillStyle = '#a8451e';
      ctx.beginPath(); ctx.arc(-w.dir * 1.2, -5.2, 3.1, Math.PI, 0); ctx.fill();
      /* 眼睛 */
      ctx.fillStyle = '#2a1a0a';
      ctx.beginPath(); ctx.arc(w.dir * 2.2, -2.8, 1.15, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(w.dir * 2.5, -3.2, 0.45, 0, 6.29); ctx.fill();
      /* 摆动的手臂 */
      const swing = Math.sin(a.ph) * 2.4 * a.mv;
      ctx.strokeStyle = '#c07c2c';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5.6, 0.6); ctx.lineTo(-6.6, 2.6 + swing); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5.6, 0.6); ctx.lineTo(6.6, 2.6 - swing); ctx.stroke();
      /* 携带物 */
      const carry = w.comps.carry;
      if(carry && carry.n > 0 && carry.item){
        for(let i = 0; i < Math.min(3, carry.n); i++){
          this.plate(ctx, -6 + i * 5, -15.5, 4.5, 4.5, ITEMS[carry.item].color, 'rgba(255,255,255,0.45)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)', 1);
        }
      }
      ctx.restore();
      /* 名字 */
      if(this.cam.zoom > 0.75){
        ctx.font = '9px "Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(w.comps.worker.name, p.x, p.y - 18);
        ctx.fillStyle = 'rgba(255,248,228,0.9)';
        ctx.fillText(w.comps.worker.name, p.x, p.y - 18);
      }
      /* 状态点(工作中) */
      if(w.ai && w.ai.state !== 'idle' && w.ai.state !== 'goto' && w.ai.state !== 'flee'){
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.3;
        ctx.drawImage(T.glowGreen, p.x + 2, p.y - 12, 8, 8);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#8fd05a';
        ctx.beginPath(); ctx.arc(p.x + 6, p.y - 8, 1.8, 0, 6.29); ctx.fill();
      }
      if(w.hitFlash > 0){ w.hitFlash -= 0.016; ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, w.hitFlash * 4)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.29); ctx.fill(); }
    }
    // 无人机
    for(const d of ECS.query('drone')){
      const p = d.pos, dr = d.drone;
      const bob = Math.sin(dr.hover) * 2.5;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(0, 11 - bob, 5.5, 2.2, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#8a929e';
      ctx.fillRect(-4, -2, 8, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-4, -2, 8, 1.2);
      ctx.strokeStyle = 'rgba(20,24,30,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-4, -2, 8, 4);
      ctx.fillStyle = '#c8ccd4';
      ctx.fillRect(-6, -3.5, 3, 2);
      ctx.fillRect(3, -3.5, 3, 2);
      ctx.fillStyle = `rgba(190,228,255,${0.42 + Math.sin(t * 40) * 0.2})`;
      ctx.beginPath(); ctx.ellipse(-4.5, -4, 4, 1, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4.5, -4, 4, 1, 0, 0, 6.29); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      ctx.drawImage(T.glowCool, -5, -5, 10, 10);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#57d7d0';
      ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, 6.29); ctx.fill();
      if(dr.carry > 0 && dr.item){
        this.plate(ctx, -2.5, 3, 5, 5, ITEMS[dr.item].color, 'rgba(255,255,255,0.4)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.5)', 1);
      }
      ctx.restore();
    }
    // 玩家
    const pl = G.player;
    if(pl && !pl.dead){
      const p = pl.pos;
      const a = this.walkAnim(pl, dt);
      ctx.save();
      ctx.translate(p.x, p.y + a.bob);
      /* 披风(朝向拖尾) */
      ctx.fillStyle = 'rgba(28,58,110,0.85)';
      ctx.beginPath();
      ctx.ellipse(-pl.dir * 3.6, 1.4, 6.4, 4.6, pl.dir * 0.25, 0, 6.29);
      ctx.fill();
      /* 身体 */
      const bg = ctx.createRadialGradient(-pl.dir * 1.8, -3.4, 1, 0, 0, 8.6);
      bg.addColorStop(0, '#9dc8ff');
      bg.addColorStop(0.5, '#3c78c8');
      bg.addColorStop(1, '#1c3f74');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#5c98e8';
      ctx.beginPath(); ctx.arc(-pl.dir * 1, -2.6, 4.9, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(12,28,56,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 6.29); ctx.stroke();
      /* 兜帽 */
      ctx.fillStyle = '#2b5e9e';
      ctx.beginPath(); ctx.arc(-pl.dir * 1, -5.4, 3.6, Math.PI, 0); ctx.fill();
      /* 眼睛(朝向) */
      ctx.fillStyle = '#0e1f3a';
      ctx.beginPath(); ctx.arc(pl.dir * 2.4, -3, 1.25, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(pl.dir * 2.7, -3.4, 0.5, 0, 6.29); ctx.fill();
      /* 手臂摆动 */
      const swing = Math.sin(a.ph) * 2.6 * a.mv;
      ctx.strokeStyle = '#3f7ac4';
      ctx.lineWidth = 2.1;
      ctx.beginPath(); ctx.moveTo(-5.8, 0.8); ctx.lineTo(-6.8, 2.8 + swing); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5.8, 0.8); ctx.lineTo(6.8, 2.8 - swing); ctx.stroke();
      ctx.restore();
      /* 目标标记 */
      if(pl.comps.auto && pl.comps.auto.kind === 'harvest'){
        const am = pl.comps.auto;
        const rx = am.tx * TILE, ry = am.ty * TILE;
        ctx.strokeStyle = 'rgba(255,232,150,0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rx + 2, ry + 2, TILE - 4, TILE - 4);
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22 + Math.sin(t * 4) * 0.1;
        ctx.drawImage(T.glowWarm, rx - 2, ry - 2, TILE + 4, TILE + 4);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if(pl.hitFlash > 0){ pl.hitFlash -= 0.016; ctx.fillStyle = `rgba(255,80,60,${Math.min(0.8, pl.hitFlash * 4)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, 6.29); ctx.fill(); }
    }
  },

  /* ---------- 放置预览 ---------- */
  drawGhost(){
    const defId = Game.placing;
    if(!defId) return;
    const h = Game.hoverTile;
    if(!h) return;
    const ctx = this.ctx;
    const ok = Buildings.canPlace(defId, h.tx, h.ty);
    const afford = Pool.hasAll(BUILDINGS[defId].cost);
    const cx = Util.tCenter(h.tx), cy = Util.tCenter(h.ty);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(this.tex.shadow, cx - TILE * 0.5, cy + TILE * 0.1, TILE, TILE * 0.45);
    ctx.globalAlpha = 0.55;
    ctx.translate(cx, cy);
    this.drawBuildingBody(ctx, defId, null, this.time, null);
    ctx.restore();
    const tint = ok && afford ? 'rgba(150,240,128,' : 'rgba(240,110,90,';
    ctx.fillStyle = tint + '0.12)';
    ctx.fillRect(h.tx * TILE + 1, h.ty * TILE + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = tint + '0.95)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, h.tx * TILE + 1, h.ty * TILE + 1, TILE - 2, TILE - 2, 3);
    ctx.stroke();
    // 范围提示
    const def = BUILDINGS[defId];
    if(def.range || def.light){
      const r = (def.range || def.light) * TILE;
      ctx.strokeStyle = def.range ? 'rgba(238,132,100,0.5)' : 'rgba(255,224,140,0.42)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.29);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 范围柔和填充,强化"光圈"感 */
      const g = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
      g.addColorStop(0, def.range ? 'rgba(238,132,100,0)' : 'rgba(255,214,130,0.07)');
      g.addColorStop(1, def.range ? 'rgba(238,132,100,0.1)' : 'rgba(255,214,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.29); ctx.fill();
    }
  },

  /* ---------- 玩法粒子与飘字 ---------- */
  drawParticles(){
    const ctx = this.ctx;
    for(const p of FX.parts){
      const a = Math.min(1, p.life / 0.35);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      /* 火花叠加光,让爆点更有质感 */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.1, 0, 6.29); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  },
  drawFloats(){
    const ctx = this.ctx;
    this.scrTransform();
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    for(const f of FX.floats){
      const s = this.worldToScreen(f.x, f.y);
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.lineWidth = 3.2;
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  },

  /* ============================================================
   * 光照 / 天气 / 氛围
   * ============================================================ */

  /* 遮罩层:夜色 + 挖出灯光孔洞 */
  drawLighting(){
    const dayFrac = G.time.dayFrac;
    const dark = Systems.darknessAt(dayFrac);
    const ctx = this.lctx;
    if(dark > 0.02){
      const ld = this.dpr || 1;
      ctx.setTransform(ld, 0, 0, ld, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.W, this.H);
      /* 夜色用竖直渐变(天顶偏紫、近处偏蓝)而非纯色,并保留一点地表色彩,
       * 避免整屏压成一块死色 */
      const ng = ctx.createLinearGradient(0, 0, 0, this.H);
      ng.addColorStop(0, `rgba(11,9,38,${Math.min(1, dark * 0.82)})`);
      ng.addColorStop(0.55, `rgba(12,14,42,${Math.min(1, dark * 0.74)})`);
      ng.addColorStop(1, `rgba(17,13,34,${Math.min(1, dark * 0.68)})`);
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'destination-out';
      for(const L of this._lights){
        const s = this.worldToScreen(L.x, L.y);
        const r = (L.r + Math.sin(this.time * 9 + L.x) * L.r * L.flicker) * this.cam.zoom;
        if(s.x < -r || s.x > this.W + r || s.y < -r || s.y > this.H + r) continue;
        ctx.drawImage(this.tex.mask, s.x - r, s.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      this.scrTransform();
      this.ctx.drawImage(this.lcv, 0, 0, this.W, this.H);
    }
  },
  /* 火光/工厂灯光光晕:预生成 radialGradient 精灵 + lighter 叠加 */
  drawLightGlow(){
    const dark = Systems.darknessAt(G.time.dayFrac);
    const ctx = this.ctx, z = this.cam.zoom;
    this.scrTransform();
    ctx.globalCompositeOperation = 'lighter';
    for(const L of this._lights){
      const s = this.worldToScreen(L.x, L.y);
      const fl = 1 + Math.sin(this.time * 9 + L.x * 0.7) * L.flicker;
      const r = L.r * z * fl * 1.45;
      if(s.x < -r || s.x > this.W + r || s.y < -r || s.y > this.H + r) continue;
      const kind = L.kind || 'fire';
      const spr = kind === 'cool' ? this.tex.glowCool : kind === 'beacon' ? this.tex.glowBlue : this.tex.glowFire;
      /* 白天几乎不可见;夜里随黑暗度增强 */
      ctx.globalAlpha = (0.05 + dark * 0.62) * (kind === 'fire' ? 1 : 0.8);
      ctx.drawImage(spr, s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  /* 雨天:分层雨丝 + 地面溅射 + 湿润反光 */
  drawRain(){
    if(G.rain <= 0) return;
    const ctx = this.ctx, t = this.time, W = this.W, H = this.H;
    const amt = Util.clamp(G.rain / 4, 0, 1);
    this.scrTransform();
    /* 雨幕压色:阴雨整体偏冷灰 */
    ctx.fillStyle = `rgba(46,62,86,${0.16 * amt})`;
    ctx.fillRect(0, 0, W, H);
    /* 三层雨丝(近处更长更亮更快) */
    for(let layer = 0; layer < 3; layer++){
      const n = [70, 90, 60][layer];
      const spd = [900, 640, 430][layer];
      const len = [26, 18, 11][layer];
      ctx.strokeStyle = `rgba(${180 + layer * 12},${210 + layer * 10},255,${(0.14 + layer * 0.1) * amt})`;
      ctx.lineWidth = 1.6 - layer * 0.35;
      ctx.beginPath();
      for(let i = 0; i < n; i++){
        const seed = i * 997 + layer * 131;
        const x = ((seed * 7.3 + t * spd * 0.22) % (W + 180)) - 90;
        const y = ((seed * 3.1 + t * spd) % (H + 90)) - 45;
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.30, y + len);
      }
      ctx.stroke();
    }
    /* 地面溅射扩散环 */
    ctx.strokeStyle = `rgba(196,226,255,${0.26 * amt})`;
    ctx.lineWidth = 1;
    for(let i = 0; i < 26; i++){
      const seed = i * 613;
      const x = ((seed * 11.7) % (W + 60)) - 30;
      const y = ((seed * 7.9) % (H + 60)) - 30;
      const ph = ((t * 1.5 + i * 0.37) % 1);
      const r = 2 + ph * 11;
      ctx.globalAlpha = (1 - ph) * 0.85 * amt;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, 0, 0, 6.29);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* 湿地反光:下半屏一道柔和高光带 */
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, 'rgba(150,190,240,0)');
    g.addColorStop(0.65, `rgba(150,190,240,${0.07 * amt})`);
    g.addColorStop(1, `rgba(190,220,255,${0.13 * amt})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  },

  /* ---------- 环境粒子(浮尘/落叶/萤火/火星,总数 ≤ 64) ---------- */
  AMB_MAX: 64,
  initAmbient(){
    this.amb = [];
    for(let i = 0; i < this.AMB_MAX; i++) this.amb.push(this.spawnAmb(null));
  },
  spawnAmb(p){
    const z = this.cam.zoom || 1;
    const hw = this.W / 2 / z + 60, hh = this.H / 2 / z + 60;
    const x = this.cam.x + (Math.random() * 2 - 1) * hw;
    const y = this.cam.y + (Math.random() * 2 - 1) * hh;
    const dark = (typeof G !== 'undefined' && G && G.time) ? Systems.darknessAt(G.time.dayFrac) : 0;
    let near = null;
    let kind;
    if(dark > 0.42){
      /* 夜晚:靠近火光 → 火星,否则萤火 */
      let nd = 1e9;
      for(const L of this._lights){
        if(L.kind !== 'fire') continue;
        const d = Util.dist(x, y, L.x, L.y);
        if(d < L.r * 1.4 && d < nd){ nd = d; near = L; }
      }
      kind = (near && Math.random() < 0.62) ? 'ember' : 'firefly';
    } else {
      kind = Math.random() < 0.34 ? 'leaf' : 'dust';
    }
    const o = p || {};
    o.kind = kind;
    o.x = x; o.y = y;
    o.vx = (Math.random() * 2 - 1) * (kind === 'dust' ? 9 : 14);
    o.vy = kind === 'leaf' ? 16 + Math.random() * 12 : (kind === 'ember' ? -26 - Math.random() * 22 : (Math.random() * 2 - 1) * 8);
    o.r = kind === 'leaf' ? 2.2 + Math.random() * 1.6 : 0.8 + Math.random() * 1.5;
    o.life = 3 + Math.random() * 7;
    o.max = o.life;
    o.ph = Math.random() * 6.28;
    o.rot = Math.random() * 6.28;
    o.hue = Math.random();
    /* 火星从火光位置升起 */
    if(kind === 'ember' && near){
      o.x = near.x + (Math.random() * 2 - 1) * 14;
      o.y = near.y + (Math.random() * 2 - 1) * 10;
      o.life = 1.1 + Math.random() * 1.8; o.max = o.life;
    }
    return o;
  },
  drawAmbient(dt, glowPass){
    if(!this.amb.length) return;
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const hw = this.W / 2 / z + 90, hh = this.H / 2 / z + 90;
    for(let i = 0; i < this.amb.length; i++){
      const p = this.amb[i];
      if(!glowPass){
        /* 世界空间那一趟负责推进生命周期,避免双倍推进 */
        p.life -= dt;
        p.ph += dt * (p.kind === 'ember' ? 6 : 1.6);
        p.rot += dt * 1.4;
        p.x += (p.vx + Math.sin(p.ph) * 11) * dt;
        p.y += p.vy * dt;
        if(p.kind === 'leaf') p.vy = Math.min(26, p.vy + dt * 4);
        const out = Math.abs(p.x - this.cam.x) > hw || Math.abs(p.y - this.cam.y) > hh;
        if(p.life <= 0 || out) this.amb[i] = this.spawnAmb(null);
        else if(p.kind === 'dust' || p.kind === 'leaf') this.paintAmb(ctx, p, 1);
      } else {
        if(p.kind !== 'firefly' && p.kind !== 'ember') continue;
        const s = this.worldToScreen(p.x, p.y);
        if(s.x < -40 || s.x > this.W + 40 || s.y < -40 || s.y > this.H + 40) continue;
        this.paintAmb(ctx, p, 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
  /* mode 1 = 世界空间绘制(非发光), mode 2 = 屏幕空间叠加发光 */
  paintAmb(ctx, p, mode){
    const fade = Math.min(1, p.life / 1.2) * Math.min(1, (p.max - p.life) / 0.7);
    if(mode === 2){
      const s = this.worldToScreen(p.x, p.y);
      const pulse = 0.55 + Math.sin(p.ph * 1.6) * 0.45;
      const r = (p.kind === 'ember' ? 7 : 9) * (1 + pulse * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (p.kind === 'ember' ? 0.85 : 0.7) * pulse;
      ctx.drawImage(p.kind === 'ember' ? this.tex.glowFire : this.tex.glowGreen, s.x - r, s.y - r, r * 2, r * 2);
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = p.kind === 'ember' ? '#ffd58a' : '#e6ffc4';
      ctx.beginPath(); ctx.arc(s.x, s.y, p.r * 0.55, 0, 6.29); ctx.fill();
      return;
    }
    if(p.kind === 'dust'){
      ctx.globalAlpha = fade * 0.4;
      ctx.fillStyle = '#fff4d8';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29); ctx.fill();
    } else {
      ctx.globalAlpha = fade * 0.72;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.hue < 0.4 ? '#a8691f' : (p.hue < 0.75 ? '#c08a2c' : '#7f9a35');
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.5, p.r * 0.8, 0, 0, 6.29);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,40,10,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-p.r * 1.4, 0); ctx.lineTo(p.r * 1.4, 0); ctx.stroke();
      ctx.restore();
    }
  },

  /* ---------- 后处理:色彩分级 + 大气透视 + 暗角 ---------- */
  drawAtmosphere(){
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    this.scrTransform();
    const df = G.time.dayFrac;
    const dark = Systems.darknessAt(df);
    /* 黄昏 / 黎明权重 */
    const dusk1 = (df > 0.20 && df < 0.34) ? 1 - Math.abs(df - 0.27) / 0.07 : 0;
    const dusk2 = (df > 0.68 && df < 0.84) ? 1 - Math.abs(df - 0.76) / 0.08 : 0;
    const dusk = Util.clamp(Math.max(dusk1, dusk2), 0, 1);

    /* 1) 色彩分级:把白天/黄昏/夜晚拉开(尽量合并为少量整屏填充) */
    if(dark > 0.01){
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(16,20,58,${dark * 0.30})`);
      g.addColorStop(1, `rgba(30,24,66,${dark * 0.20})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if(dusk > 0){
      /* 黄昏暖光:一次竖直渐变同时承担"整体染色 + 顶部辉光" */
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(255,178,96,${dusk * 0.30})`);
      g.addColorStop(0.6, `rgba(255,140,60,${dusk * 0.19})`);
      g.addColorStop(1, `rgba(255,132,48,${dusk * 0.13})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    /* 白昼的轻微暖调已烘焙进静态叠加层,此处不再多铺一层全屏提亮 */

    /* 2)+3) 大气透视雾带与屏幕暗角:预烘焙层,一次 blit */
    ctx.drawImage(this.ovl, 0, 0);
  },

  /* ---------- 小地图 ---------- */
  drawMini(){
    const m = this.mctx, size = 164, half = 41;
    if(!G.player) return;
    const ptx = Math.floor(G.player.pos.x / TILE), pty = Math.floor(G.player.pos.y / TILE);
    const img = m.createImageData(size, size);
    const data = img.data;
    const terrCol = [[36, 84, 138], [203, 184, 122], [72, 110, 56]];
    for(let py = 0; py < size; py++){
      for(let px = 0; px < size; px++){
        const tx = ptx + px - half, ty = pty + py - half;
        const c = terrCol[World.terrainAt(tx, ty)];
        const i = (py * size + px) * 4;
        const v = 0.86 + hash2i(tx, ty, 4) * 0.28;
        data[i] = c[0] * v; data[i + 1] = c[1] * v; data[i + 2] = c[2] * v; data[i + 3] = 255;
      }
    }
    // 资源点
    World.eachNodeInRect(ptx - half, pty - half, ptx + half, pty + half, (tx, ty, node) => {
      const px = tx - ptx + half, py = ty - pty + half;
      if(px < 0 || py < 0 || px >= size || py >= size) return;
      const col = node.t === 'tree' ? [38, 84, 38] : node.t === 'crystal' ? [87, 215, 208] :
                  node.t === 'iron' ? [201, 111, 63] : node.t === 'coal' ? [30, 30, 38] :
                  node.t === 'berry' ? [180, 60, 50] : [130, 136, 142];
      const i = (py * size + px) * 4;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2];
    });
    m.putImageData(img, 0, 0);
    // 建筑
    for(const b of ECS.query('building')){
      const px = Math.round(b.pos.x / TILE) - ptx + half, py = Math.round(b.pos.y / TILE) - pty + half;
      if(px < 0 || py < 0 || px >= size || py >= size) continue;
      m.fillStyle = b.comps.building.state === 'done' ? '#ffd060' : 'rgba(140,200,255,0.7)';
      m.fillRect(px - 1.5, py - 1.5, 3.5, 3.5);
    }
    // 怪物
    m.fillStyle = '#ff4838';
    for(const mo of ECS.query('monster')){
      const px = Math.round(mo.pos.x / TILE) - ptx + half, py = Math.round(mo.pos.y / TILE) - pty + half;
      if(px < 0 || py < 0 || px >= size || py >= size) continue;
      m.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    // 玩家
    m.fillStyle = '#ffffff';
    m.fillRect(half - 1.5, half - 1.5, 4, 4);
    m.strokeStyle = 'rgba(255,255,255,0.4)';
    m.strokeRect(0.5, 0.5, size - 1, size - 1);
  },
};
