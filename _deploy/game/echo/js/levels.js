/* ============================================================
 * 《回声》关卡数据 —— 数据驱动（策划案 6.2「关卡数据」）
 * 单位：格（1格≈36px）。walls:[x,y,w,h]
 * req 匹配器字段: kind / anyKind / maxPitch / minPitch / minDur / stable
 * needs:[...] 表示需同时回放的和弦（回声叠加）
 * type:'charge' 共鸣柱；type:'auto' 随 link 共鸣柱充能自动开启
 * mirrors: 共鸣镜——镜旁回放视为在 link 目标处发声（声波折射）
 * ============================================================ */
(function () {
  const border = (w, h, t = .6) => [[0, 0, w, t], [0, h - t, w, t], [0, 0, t, h], [w - t, 0, t, h]];

  // 机关条件简写
  const METAL_LOW = { kind: 'metal', maxPitch: .45 };
  const HIGH_TONE = { anyKind: ['water', 'glass'], minPitch: .55 };
  const WIND_LONG = { kind: 'wind', minDur: 2, stable: true };

  const LEVELS = [
    /* ---------- 第一章 · 唤醒（教学期：探测音 / 录音 / 回放） ---------- */
    {
      id: 'l1', ch: 1, name: '初醒', par: { time: 80, plays: 1 },
      bounds: [38, 20], spawn: [4, 10], crystal: [34.5, 10],
      walls: [...border(38, 20),
        [13, .6, .8, 4], [13, 15.4, .8, 4], [25, 6, .8, 3.5], [25, 11, .8, 3.5],
        [10, 4, 1, 1], [10, 15, 1, 1], [16, 9.4, 1.2, 1.2], [22, 4, 1, 1], [22, 15, 1, 1], [28, 9.4, 1.2, 1.2]],
      sources: [{ x: 32, y: 14, kind: 'voice', pitch: .5, auto: 5 }], // 声语NPC
      frags: [[7, 5], [17.5, 13], [27, 7.5]],
      checkpoints: [[4, 10]]
    },
    {
      id: 'l2', ch: 1, name: '涟漪', par: { time: 140, plays: 1 },
      bounds: [42, 22], spawn: [4, 11], crystal: [38.5, 11],
      walls: [...border(42, 22),
        [17, 2, .8, 7], [17, 13, .8, 7],
        [22, 5, 1, 1], [22, 17, 1, 1], [28, 10.4, 1.2, 1.2], [33, 5, 1, 1], [33, 17, 1, 1]],
      doors: [{ id: 'd1', x: 16.85, y: 9, w: 1.1, h: 4, req: METAL_LOW }],
      sources: [
        { x: 7, y: 8, kind: 'metal', pitch: .28, struck: true },   // 金属桶
        { x: 11, y: 16, kind: 'water', pitch: .85, auto: 2.2 },    // 滴水
        { x: 13.5, y: 6, kind: 'glass', pitch: .72, struck: true },// 玻璃瓶
        { x: 5, y: 15, kind: 'wood', pitch: .5, struck: true }],
      frags: [[4, 6], [29.6, 13.5], [36, 17]],
      checkpoints: [[4, 11]]
    },
    {
      id: 'l3', ch: 1, name: '回廊', par: { time: 190, plays: 1 },
      bounds: [46, 26], spawn: [4, 13], crystal: [42, 13],
      walls: [...border(46, 26),
        [8, 4, .8, 9], [8, 17, .8, 7],
        [14, 2, .8, 8], [14, 14, .8, 10],
        [20, .6, .8, 3.4], [20, 8, .8, 17.4],
        [28, .6, .8, 8.8], [37.6, .6, .8, 8.8], [28, 9.4, 3, .8], [35, 9.4, 3, .8],
        [26, 6, 1, 1], [26, 12, 1, 1], [26, 18, 1, 1], [33, 12, 1, 1], [33, 17, 1, 1]],
      doors: [
        { id: 'd1', x: 19.85, y: 4, w: 1.1, h: 4, req: METAL_LOW },
        { id: 'dg', x: 31, y: 9.4, w: 4, h: .8, req: { anyKind: ['water', 'glass'], minPitch: .6 } }],
      sources: [
        { x: 11, y: 21, kind: 'water', pitch: .9, auto: 2.2 },
        { x: 17, y: 23.5, kind: 'glass', pitch: .7, struck: true },
        { x: 33, y: 4, kind: 'wind', pitch: .5, auto: 6, gustDur: 3.2, stable: true }], // 阵风房
      frags: [[35.5, 2.6], [24, 23.5], [40, 22]],
      checkpoints: [[4, 13], [21, 6], [30, 13]]
    },

    /* ---------- 第二章 · 和鸣（入门期：回声叠加 / 诱饵录音 / 玻璃桥） ---------- */
    {
      id: 'l4', ch: 2, name: '和声', par: { time: 200, plays: 2 },
      bounds: [46, 24], spawn: [4, 12], crystal: [42.5, 12],
      walls: [...border(46, 24),
        [24, 2, .8, 8], [24, 16, .8, 6.4],
        [6, 12, 1, 1], [12, 4, 1, 1], [19, 19, 1, 1],
        [30, 6, 1, 1], [30, 17, 1, 1], [37, 11.4, 1.2, 1.2]],
      doors: [{ id: 'df', x: 23.85, y: 10, w: 1.1, h: 6, req: { needs: [HIGH_TONE, { kind: 'metal', maxPitch: .5 }] } }],
      sources: [
        { x: 9, y: 7, kind: 'water', pitch: .85, auto: 2.2 },
        { x: 14, y: 15, kind: 'metal', pitch: .28, struck: true },
        { x: 5, y: 18, kind: 'wood', pitch: .5, struck: true },
        { x: 20, y: 6, kind: 'glass', pitch: .7, struck: true }],
      frags: [[4, 5], [29, 20], [41, 5]],
      checkpoints: [[4, 12]]
    },
    {
      id: 'l5', ch: 2, name: '静默者', par: { time: 230, plays: 2 },
      bounds: [50, 22], spawn: [5, 11], crystal: [46, 11],
      walls: [...border(50, 22),
        [16, .6, 1, 5.4], [16, 16, 1, 5.4],
        [30, .6, 1, 5.4], [30, 16, 1, 5.4],
        [25, 10.4, 1.4, 1.4], [9, 15, 1, 1], [36, 6, 1, 1], [40, 15, 1, 1], [22, 3, 1, 1]],
      doors: [
        { id: 'd1', x: 15.9, y: 6, w: 1.2, h: 10, req: METAL_LOW },
        { id: 'd2', x: 29.9, y: 6, w: 1.2, h: 10, req: METAL_LOW }],
      sources: [{ x: 8, y: 18, kind: 'metal', pitch: .28, struck: true }],
      enemies: [{ patrol: [[10, 11], [44, 11]], speed: 2.4 }],
      frags: [[20, 3], [38, 19], [43, 4]],
      checkpoints: [[5, 11], [20, 11], [34, 11]]
    },
    {
      id: 'l6', ch: 2, name: '玻璃桥', par: { time: 220, plays: 2 },
      bounds: [52, 22], spawn: [5, 11], crystal: [46, 11],
      walls: [...border(52, 22),
        [36, 5, 1, 1], [36, 17, 1, 1], [42, 8, 1, 1]],
      voids: [[14, 2, 16, 18]],
      bridges: [
        { id: 'b1', x: 14.2, y: 10.4, w: 7.8, h: 1.2, req: HIGH_TONE, radius: 12 },
        { id: 'b2', x: 22, y: 10.4, w: 7.8, h: 1.2, req: HIGH_TONE, radius: 12 }],
      sources: [
        { x: 10, y: 6, kind: 'water', pitch: .85, auto: 2.2 },
        { x: 11, y: 15, kind: 'glass', pitch: .72, struck: true }],
      enemies: [{ patrol: [[32, 8], [50, 14]], speed: 2.2 }],
      frags: [[6, 17], [18.5, 11], [40, 4]],
      checkpoints: [[5, 11], [32, 11]]
    },

    /* ---------- 第三章 · 深渊之厅（进阶期：共鸣长音 / 镜像回声） ---------- */
    {
      id: 'l7', ch: 3, name: '共鸣钟', par: { time: 260, plays: 2 },
      bounds: [46, 26], spawn: [23, 22], crystal: [23.5, 4],
      walls: [...border(46, 26),
        [18, .6, .8, 8.8], [28, .6, .8, 8.8], [18, 9.4, 4, .8], [25, 9.4, 3, .8],
        [10, .6, .8, 11.4], [4, 12, 2.4, .8],
        [16, 14, 1, 1], [16, 20, 1, 1], [30, 14, 1, 1], [30, 20, 1, 1], [23, 16.6, 1.4, 1.4],
        [36, 6, 1, 1], [40, 14, 1, 1]],
      doors: [{ id: 'db', x: 22, y: 9.4, w: 3, h: .8, req: WIND_LONG, bell: [23.5, 6.5] }],
      sources: [
        { x: 6, y: 6, kind: 'wind', pitch: .5, auto: 6, gustDur: 3.2, stable: true },
        { x: 36, y: 10, kind: 'glass', pitch: .72, struck: true }],
      enemies: [{ patrol: [[14, 17], [32, 17]], speed: 2.3 }],
      frags: [[40, 4], [40, 22], [7, 21]],
      checkpoints: [[23, 22], [23, 12]]
    },
    {
      id: 'l8', ch: 3, name: '镜厅', par: { time: 280, plays: 3 },
      bounds: [50, 26], spawn: [4, 13], crystal: [45, 13],
      walls: [...border(50, 26),
        [36, .6, 1, 10.4], [36, 15, 1, 10.4],
        [8, 18.6, 4, .8], [16, 18.6, 4, .8], [8, 19.4, .8, 6], [19.2, 19.4, .8, 6],
        [42, 7, 1, 1], [30, 3, 1, 1], [14, 10, 1, 1]],
      voids: [[26, 5.6, 10, 14.4]],
      doors: [
        { id: 'd2', x: 36, y: 11, w: 1, h: 4, req: METAL_LOW },
        { id: 'd3', x: 12, y: 18.6, w: 4, h: .8, req: { anyKind: ['water', 'glass'], minPitch: .6 } }],
      mirrors: [
        { x: 24.5, y: 13, r: 2.2, link: 'd2' },
        { x: 12, y: 16.6, r: 1.8, link: 'd3' }],
      sources: [
        { x: 6, y: 20, kind: 'metal', pitch: .28, struck: true },
        { x: 10, y: 4, kind: 'water', pitch: .85, auto: 2.2 }],
      pickups: [{ x: 21, y: 5, kind: 'cloak' }],
      enemies: [
        { patrol: [[8, 8], [22, 8]], speed: 2.3 },
        { patrol: [[38, 8], [48, 18]], speed: 2.2 }],
      frags: [[14, 22], [42, 4], [4, 4]],
      checkpoints: [[4, 13], [22, 13], [38, 13]]
    },

    /* ---------- 第四章 · 大静默（挑战期：多声轨编排 / 限时逃脱） ---------- */
    {
      id: 'l9', ch: 4, name: '交响', par: { time: 340, plays: 3 },
      bounds: [56, 30], spawn: [5, 15], crystal: [28, 14.2],
      walls: [...border(56, 30),
        [24, 12, 8, .8], [24, 17.2, 3, .8], [29, 17.2, 3, .8],
        [24, 12.8, .8, 4.4], [31.2, 12.8, .8, 4.4],
        [2.6, 21.6, 2.4, .8], [8, 21.6, 3.4, .8], [10.6, 21.6, .8, 7.8],
        [18, 4, 1, 1], [38, 4, 1, 1], [20, 26, 1, 1], [36, 26, 1, 1], [46, 15, 1.2, 1.2], [8, 13, 1, 1]],
      doors: [
        { id: 'dv', x: 5, y: 21.6, w: 3, h: .8, req: { needs: [{ kind: 'metal', maxPitch: .45 }, { kind: 'metal', minPitch: .55 }] } }, // 声音解构
        { id: 'f', x: 27, y: 17.2, w: 2, h: .8, type: 'auto', link: ['p1', 'p2', 'p3'] }],
      charges: [
        { id: 'p1', x: 14, y: 6, r: 6, req: { kind: 'metal' } },
        { id: 'p2', x: 42, y: 6, r: 6, req: { anyKind: ['water', 'glass'], minPitch: .5 } },
        { id: 'p3', x: 28, y: 25, r: 6, req: { kind: 'wind', minDur: 1.2, stable: true } }],
      sources: [
        { x: 8, y: 4, kind: 'metal', pitch: .28, struck: true },
        { x: 12, y: 9, kind: 'metal', pitch: .62, struck: true },
        { x: 48, y: 4, kind: 'water', pitch: .85, auto: 2.2 },
        { x: 44, y: 10, kind: 'glass', pitch: .72, struck: true },
        { x: 28, y: 27, kind: 'wind', pitch: .5, auto: 6, gustDur: 3.2, stable: true }],
      pickups: [{ x: 40, y: 22, kind: 'cloak' }],
      enemies: [
        { patrol: [[20, 10], [36, 10]], speed: 2.4 },
        { patrol: [[38, 20], [20, 20]], speed: 2.4 }],
      frags: [[5, 26], [48, 26], [12, 15]],
      checkpoints: [[5, 15], [20, 15], [28, 20]]
    },
    {
      id: 'l10', ch: 4, name: '大静默的起源', par: { time: 300, plays: 2 },
      bounds: [62, 26], spawn: [4, 13], crystal: [54, 13],
      walls: [...border(62, 26),
        [10, 8, 1, 1], [10, 18, 1, 1], [18, 4, 1, 1], [18, 22, 1, 1],
        [26, 8, 1, 1], [26, 18, 1, 1], [34, 4, 1, 1], [34, 22, 1, 1],
        [42, 8, 1, 1], [42, 18, 1, 1]],
      sources: [
        { x: 14, y: 10, kind: 'metal', pitch: .3, struck: true },
        { x: 22, y: 16, kind: 'metal', pitch: .3, struck: true },
        { x: 30, y: 9, kind: 'metal', pitch: .3, struck: true },
        { x: 38, y: 17, kind: 'metal', pitch: .3, struck: true },
        { x: 46, y: 11, kind: 'metal', pitch: .3, struck: true }],
      enemies: [
        { patrol: [[8, 13], [30, 13]], speed: 2.6 },
        { patrol: [[30, 13], [54, 13]], speed: 2.6 }],
      silenceWall: { x: 57, speed: 3.6 },
      exit: [4, 13],
      frags: [[12, 4], [32, 21], [50, 4]],
      checkpoints: [[4, 13], [54, 13]]
    }
  ];

  /* ---------- 听音训练场（沙盒：自由录制 / 合成 / 波形可视化） ---------- */
  const SANDBOX = {
    id: 'sandbox', ch: 0, name: '听音训练场', par: { time: 9999, plays: 99 },
    bounds: [40, 26], spawn: [20, 13], crystal: null, sandbox: true,
    walls: [...border(40, 26), [14, 9, 1, 1], [26, 9, 1, 1], [14, 17, 1, 1], [26, 17, 1, 1]],
    sources: [
      { x: 8, y: 6, kind: 'metal', pitch: .28, struck: true },
      { x: 10, y: 18, kind: 'metal', pitch: .6, struck: true },
      { x: 20, y: 5, kind: 'water', pitch: .85, auto: 2.2 },
      { x: 30, y: 7, kind: 'glass', pitch: .72, struck: true },
      { x: 32, y: 18, kind: 'wind', pitch: .5, auto: 5, gustDur: 3, stable: true },
      { x: 14, y: 22, kind: 'wood', pitch: .5, struck: true },
      { x: 26, y: 13, kind: 'voice', pitch: .5, auto: 5 }],
    frags: [], checkpoints: [[20, 13]]
  };

  /* ---------- 每日挑战：按日期种子生成（4.2 每日回声谜题） ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function dailyLevel(dateStr) {
    const seed = [...(dateStr || '')].reduce((s, c) => s * 31 + c.charCodeAt(0) | 0, 7);
    const R = mulberry32(seed);
    const pick = arr => arr[Math.floor(R() * arr.length)];
    const kindA = pick(['water', 'glass', 'metal', 'wind']);
    let kindB = pick(['water', 'glass', 'metal', 'wind']);
    if (kindB === kindA) kindB = kindA === 'water' ? 'metal' : 'water';
    const spec = {
      water: { kind: 'water', pitch: .85, auto: 2.2 },
      glass: { kind: 'glass', pitch: .72, struck: true },
      metal: { kind: 'metal', pitch: .28, struck: true },
      wind: { kind: 'wind', pitch: .5, auto: 6, gustDur: 3.2, stable: true }
    };
    const reqOf = k => k === 'metal' ? { kind: 'metal', maxPitch: .5 }
      : k === 'wind' ? { kind: 'wind', minDur: 1.2, stable: true }
        : { anyKind: [k], minPitch: .55 };
    const ry = n => 3 + R() * (n - 6);
    return {
      id: 'daily-' + dateStr, ch: -1, name: '每日谜题', daily: true,
      par: { time: 240, plays: 2 },
      bounds: [40, 22], spawn: [4, 11], crystal: [36, 11],
      walls: [...border(40, 22),
        [19, .6, 1, 7.4], [19, 14, 1, 7.4],
        [10, 4 + R() * 4, 1, 1], [27, 4 + R() * 4, 1, 1], [10, 14 + R() * 4, 1, 1], [27, 14 + R() * 4, 1, 1]],
      doors: [{ id: 'dd', x: 18.9, y: 8, w: 1.2, h: 6, req: { needs: [reqOf(kindA), reqOf(kindB)] } }],
      sources: [
        Object.assign({ x: 7, y: ry(22) }, spec[kindA]),
        Object.assign({ x: 13, y: ry(22) }, spec[kindB])],
      enemies: [{ patrol: [[10, 11], [34, 11]], speed: 2.1 + R() * .6 }],
      frags: [[6 + R() * 10, 3 + R() * 16], [24 + R() * 10, 3 + R() * 16], [8 + R() * 8, 14 + R() * 6]],
      checkpoints: [[4, 11]]
    };
  }

  window.EchoLevels = { LEVELS, SANDBOX, dailyLevel };
})();
