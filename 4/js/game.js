'use strict';
// ================================================================
// 游戏核心: 局内循环 / 战斗结算 / Boss / 渲染
// ================================================================

// ================================================================
// 美术资源层(全部程序化生成, 零外部文件)
//  · 地牢材质: 预生成离屏 canvas → createPattern 平铺, 不做每帧逐像素运算
//  · 光晕/阴影: 预生成径向渐变精灵, 供 lighter 叠光与软阴影反复复用
// ================================================================
// 颜色加减亮度(用于石板/砖块的随机明暗)
function shadeHex(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + d, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) + d, 0, 255) | 0;
  const b = clamp((n & 255) + d, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
// 颜色加减亮度 + 冷暖偏移(让相邻石板有色相差异, 避免地面成为单一色块)
function slabHex(hex, d, warm) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + d + warm, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) + d + (warm >> 2), 0, 255) | 0;
  const b = clamp((n & 255) + d - warm, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
// 在 3×3 偏移上重复绘制, 保证平铺纹理无接缝
function wrapDraw(c, S, fn) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    c.save(); c.translate(dx * S, dy * S); fn(c); c.restore();
  }
}

// 线段(上一帧位置 → 这一帧位置)与圆的相交测试。
// 弹丸命中判定用它替代"只看当前帧落点"的点测试:
// 低帧率(本作有光照层/后处理, dt 最大 0.033s)时弓 620px/s 单帧位移 20px,
// 小体型敌人(r+size 可低至 18px)会被整帧跨过 → 玩家看到"打了没反应"。
function segCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0.0001 ? ((cx - x1) * dx + (cy - y1) * dy) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = x1 + dx * t, py = y1 + dy * t;
  const ex = cx - px, ey = cy - py;
  return ex * ex + ey * ey <= r * r;
}

// 房间类型 → 配色主题(地面 / 墙体 / 氛围光 / 后处理色调)
const THEME = {
  combat:   { floor: '#3b4256', mortar: '#1c2130', wall: '#2c3348', wallTop: '#556182', wallDark: '#0f131e',
              amb: '176,196,240', dark: 'rgba(5,8,17,.83)',  grade: 'rgba(92,138,226,.04)',   fog: 'rgba(120,150,215,.026)' },
  start:    { floor: '#46424f', mortar: '#232130', wall: '#312f3e', wallTop: '#5c5676', wallDark: '#131220',
              amb: '240,208,158', dark: 'rgba(6,7,15,.81)',  grade: 'rgba(255,186,110,.035)', fog: 'rgba(255,196,130,.024)' },
  treasure: { floor: '#4b4432', mortar: '#282216', wall: '#3a321f', wallTop: '#6e603a', wallDark: '#161108',
              amb: '255,216,132', dark: 'rgba(8,6,3,.81)',   grade: 'rgba(255,196,88,.045)',  fog: 'rgba(255,206,110,.03)' },
  shrine:   { floor: '#33414f', mortar: '#1a2431', wall: '#27323f', wallTop: '#4a6380', wallDark: '#0d141c',
              amb: '142,216,255', dark: 'rgba(3,7,14,.82)',  grade: 'rgba(110,205,255,.045)', fog: 'rgba(120,210,255,.028)' },
  boss:     { floor: '#452f34', mortar: '#231316', wall: '#3b242a', wallTop: '#71424a', wallDark: '#150a0c',
              amb: '255,124,102', dark: 'rgba(8,2,4,.86)',   grade: 'rgba(255,72,58,.05)',    fog: 'rgba(255,90,70,.034)' },
  stairs:   { floor: '#37423c', mortar: '#1b231e', wall: '#2b342d', wallTop: '#4e6354', wallDark: '#0e1310',
              amb: '152,255,192', dark: 'rgba(3,8,6,.82)',   grade: 'rgba(120,255,180,.042)', fog: 'rgba(130,255,190,.03)' },
};
const themeOf = t => THEME[t] || THEME.combat;

const Tex = {
  _c: Object.create(null),
  // 通用缓存工厂: 同一 key 只构建一次
  _mk(key, w, h, fn) {
    let t = this._c[key];
    if (!t) {
      t = document.createElement('canvas');
      t.width = w; t.height = h;
      fn(t.getContext('2d'), w, h);
      this._c[key] = t;
    }
    return t;
  },
  rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  },
  // 柔光精灵(lighter 叠加用)
  glow(color, r) {
    return this._mk('glow|' + color + '|' + r, r * 2, r * 2, (c) => {
      const g = c.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, this.rgba(color, 0.95));
      g.addColorStop(0.28, this.rgba(color, 0.5));
      g.addColorStop(0.62, this.rgba(color, 0.16));
      g.addColorStop(1, this.rgba(color, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(r, r, r, 0, TAU); c.fill();
    });
  },
  // 光洞精灵(destination-out 从黑暗中挖出受光区)
  hole() {
    return this._mk('hole', 256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.4, 'rgba(0,0,0,.92)');
      g.addColorStop(0.68, 'rgba(0,0,0,.52)');
      g.addColorStop(0.87, 'rgba(0,0,0,.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    });
  },
  // 脚下软阴影(接触阴影)
  shadow() {
    return this._mk('shadow', 128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,.62)');
      g.addColorStop(0.5, 'rgba(0,0,0,.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
  },
  // 噪点(只生成一次, 用作 overlay 颗粒)
  grain(size) {
    return this._mk('grain|' + size, size, size, (c, w, h) => {
      const img = c.createImageData(w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 120 + (Math.random() * 68 - 34);
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    });
  },
  // 地牢地板: 交错石板 + 砖缝 + 明暗破损 + 噪点, 256×256 无缝平铺
  floorTile(type) {
    const P = themeOf(type), S = 256, sw = 64, sh = 32;
    return this._mk('floor|' + type, S, S, (c) => {
      const rng = new RNG(hashStr('floor:' + type));
      c.fillStyle = P.mortar;                       // 砖缝底色
      c.fillRect(0, 0, S, S);
      for (let row = 0, y = 0; y < S; y += sh, row++) {
        const off = (row % 2) * (sw / 2);
        for (let x = -sw; x < S + sw; x += sw) {
          const bx = x + off + 1.2, by = y + 1.2, bw = sw - 2.4, bh = sh - 2.4;
          c.fillStyle = slabHex(P.floor, rng.int(-26, 26), rng.int(-17, 17));
          c.fillRect(bx, by, bw, bh);
          // 破损/污渍斑块: 打破整齐方格
          if (rng.chance(0.55)) {
            const cx = bx + bw / 2 + rng.range(-14, 14), cy = by + bh / 2 + rng.range(-7, 7);
            c.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.17)})`;
            c.beginPath();
            for (let i = 0; i <= 6; i++) {
              const a = i / 6 * TAU, rr = rng.range(5, 15);
              const px = cx + Math.cos(a) * rr * 1.5, py = cy + Math.sin(a) * rr * 0.65;
              i ? c.lineTo(px, py) : c.moveTo(px, py);
            }
            c.closePath(); c.fill();
          }
          // 左上受光面 + 右下暗面 → 石板厚度
          c.fillStyle = 'rgba(255,255,255,.055)';
          c.fillRect(bx, by, bw, 1.6);
          c.fillStyle = 'rgba(0,0,0,.30)';
          c.fillRect(bx, by + bh - 1.8, bw, 1.8);
          c.fillStyle = 'rgba(0,0,0,.18)';
          c.fillRect(bx + bw - 1.6, by, 1.6, bh);
        }
      }
      // 裂纹(跨石板)
      c.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        const x0 = rng.range(0, S), y0 = rng.range(0, S), a0 = rng.range(0, TAU);
        wrapDraw(c, S, (cc) => {
          cc.strokeStyle = `rgba(6,8,14,${rng.range(0.22, 0.45)})`;
          cc.lineWidth = rng.range(1, 2.2);
          cc.beginPath(); cc.moveTo(x0, y0);
          let cx = x0, cy = y0, a = a0;
          for (let k = 0; k < 4; k++) {
            a += rng.range(-0.9, 0.9);
            cx += Math.cos(a) * rng.range(14, 34); cy += Math.sin(a) * rng.range(8, 22);
            cc.lineTo(cx, cy);
          }
          cc.stroke();
        });
      }
      // 碎石/瓦砾
      for (let i = 0; i < 46; i++) {
        const x0 = rng.range(0, S), y0 = rng.range(0, S), r0 = rng.range(1, 3.2), v0 = rng.int(-24, 26);
        c.fillStyle = shadeHex(P.floor, v0);
        c.beginPath(); c.ellipse(x0, y0, r0, r0 * 0.7, rng.range(0, TAU), 0, TAU); c.fill();
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.beginPath(); c.ellipse(x0, y0 + r0 * 0.7, r0, r0 * 0.35, 0, 0, TAU); c.fill();
      }
      // 颗粒噪点
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = 0.6;
      c.fillStyle = c.createPattern(Tex.grain(128), 'repeat');
      c.fillRect(0, 0, S, S);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    });
  },
  // 墙体砖纹, 128×128 无缝平铺
  wallTile(type) {
    const P = themeOf(type), S = 128, bw = 32, bh = 16;
    return this._mk('wall|' + type, S, S, (c) => {
      const rng = new RNG(hashStr('wall:' + type));
      c.fillStyle = P.wallDark; c.fillRect(0, 0, S, S);
      for (let row = 0, y = 0; y < S; y += bh, row++) {
        const off = (row % 2) * (bw / 2);
        for (let x = -bw; x < S + bw; x += bw) {
          const bx = x + off + 1, by = y + 1;
          c.fillStyle = shadeHex(P.wall, rng.int(-11, 11));
          c.fillRect(bx, by, bw - 2, bh - 2);
          c.fillStyle = 'rgba(255,255,255,.06)';
          c.fillRect(bx, by, bw - 2, 1);
          c.fillStyle = 'rgba(0,0,0,.32)';
          c.fillRect(bx, by + bh - 3, bw - 2, 1.6);
        }
      }
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = 0.5;
      c.fillStyle = c.createPattern(Tex.grain(128), 'repeat');
      c.fillRect(0, 0, S, S);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    });
  },
};

const G = {
  state: 'menu',        // menu | play | dead
  paused: false,
  modal: null,          // choices | pickup | inventory | null
  run: null,            // { seed, floor }
  floorData: null,
  cur: null,            // 当前房间运行时状态
  player: null,
  enemies: [], projs: [], eprojs: [], pickups: [], pendingBooms: [], novas: [],
  time: 0, shake: 0, hurtFlash: 0, hitMarkT: 0,
  fade: 1, fadeDir: -1, afterFade: null,
  interactTarget: null,
  pendingLevels: 0,
  _advancing: false, doorCd: 0,
  tutorial: null,
  // 引导用的行为统计(只读计数, 不影响任何战斗数值)
  stat: { shots: 0, hits: 0, kills: 0, dashes: 0, picks: 0, rooms: 0, tabs: 0, moved: 0 },
  roomBg: null, vignette: null, aberration: null,
  lights: [], torches: [], ambient: [],
  lightStatic: null, lightWork: null, _lightScale: 0.25,
  input: { keys: {}, mx: ROOM_W / 2, my: ROOM_H / 2, fire: false, fireBuf: 0,
           tvx: 0, tvy: 0, touchActive: false, autoAim: false }, // tvx/tvy: 虚拟摇杆向量(移动端)
  compareHold: null,    // 触屏长按的拾取物(装备对比浮层数据源)
  _lastOne: false,      // "只剩最后一个敌人"高亮状态标记
  _lsAcc: 0,

  // ================= 一局开始 =================
  newRun(seedStr) {
    let seed;
    if (seedStr && seedStr.length) seed = isNaN(+seedStr) ? hashStr(seedStr) : (+seedStr >>> 0);
    else seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    Meta.data.stats.runs++;
    Meta.save();
    this.run = { seed, floor: 1 };
    this.player = this.newPlayer();
    Loot.applyStats(this.player);
    this.player.hp = this.player.maxHp;
    this.beginPlay();
    this.startFloor(1);
    // 新手引导: 首次进入深渊自动触发(看过/跳过任意一次后写入存档, 之后不再自动弹)
    if (UI.tutorialShouldAutoStart()) UI.startTutorial('play');
  },

  continueRun() {
    const sv = RunSave.load();
    if (!sv || !sv.p) { this.newRun(null); return; }
    UI.tutorialStop();
    this.run = { seed: sv.seed, floor: sv.floor };
    this.player = this.newPlayer();
    const p = this.player, sp = sv.p;
    p.level = sp.level || 1; p.xp = sp.xp || 0; p.gold = sp.gold || 0; p.souls = sp.souls || 0;
    p.kills = sp.kills || 0; p.blessings = sp.blessings || []; p.revivesUsed = sp.revivesUsed || 0;
    p.weapon = sp.weapon; p.passives = sp.passives || [null, null, null, null, null, null];
    Loot.applyStats(p);
    p.hp = clamp(sp.hp || p.maxHp, 1, p.maxHp);
    this.beginPlay();
    this.startFloor(sv.floor, sv.cleared || []);
  },

  newPlayer() {
    return {
      x: ROOM_W / 2, y: ROOM_H / 2, r: 14, aimA: 0,
      hp: 1, maxHp: 1, speed: 205, pickupR: 95,
      iframes: 0, dashT: 0, dashCd: 0, dashA: 0, fireCd: 0, novaCd: 0, muzzleT: 0, readyT: 0,
      level: 1, xp: 0, gold: 40 + Meta.lvl('startGold') * 40, souls: 0, kills: 0,
      blessings: [], weapon: Loot.starterWeapon(), passives: [null, null, null, null, null, null],
      revivesUsed: 0, shield: false, aegisPeriod: 0, aegisT: 999, orbitA: 0, slowT: 0,
      stats: null, sp: {}, ghosts: [],
    };
  },

  beginPlay() {
    FX.reset();
    this.state = 'play'; this.paused = false; this.modal = null; this.pendingLevels = 0;
    this.enemies = []; this.projs = []; this.eprojs = []; this.pickups = []; this.pendingBooms = []; this.novas = [];
    this.shake = 0; this.hurtFlash = 0; this.fade = 1; this.fadeDir = -1;
    this._advancing = false;
    this.compareHold = null;
    this._lastOne = false;
    this.stat = { shots: 0, hits: 0, kills: 0, dashes: 0, picks: 0, rooms: 0, tabs: 0, moved: 0 };
    UI.showScreen(null);
    document.getElementById('hud').classList.remove('hidden');
  },

  revivesLeft() { return Math.max(0, Meta.lvl('revive') - this.player.revivesUsed); },

  // ================= 楼层与房间 =================
  startFloor(f, clearedList) {
    this.run.floor = f;
    this._advancing = false;
    this.floorData = MapGen.gen(f, this.run.seed);
    if (clearedList) this.floorData.rooms.forEach((r, i) => { r.cleared = clearedList.includes(i); });
    this.enterRoom(this.floorData.startIdx, -1);
    UI.banner(`第 ${f} 层`, this.floorData.bossFloor ? '⚔ 深渊领主盘踞于此 ⚔' : '深渊裂隙 · ' + (f % 5 === 4 ? '领主层将至' : '寻找 ↓ 下一层入口'), 2400);
    this.saveRun();
  },

  nextFloor() {
    if (this._advancing) return;   // 淡出期间重复按 E 会连跳多层, 这里加锁
    this._advancing = true;
    this.player.souls += 10 + 2 * this.run.floor; // 通关该层魂晶
    this.transition(() => {
      this.startFloor(this.run.floor + 1);
      Sfx.play('stairs');
    });
  },

  // 楼梯房的"下一层"入口: 生成一个真正可交互的拾取物
  // 坐标与 setupLights() 里登记的 this.portal(背景裂隙 + 静态光源)完全一致,
  // 保证"看到的光圈"和"能踩的判定"是同一个东西。
  placeStairsExit() {
    const pos = this.portal ? { x: this.portal.x, y: this.portal.y } : { x: ROOM_W / 2, y: ROOM_H * 0.62 };
    const pk = Entities.makePickup('next', pos.x, pos.y, { settle: 0, vx: 0, vy: 0, floorExit: true });
    this.pickups.push(pk);
    this.cur.exitPk = pk;
    return pk;
  },

  // 当前层的目标房间索引(非领主层 = ↓ 楼梯房; 领主层 = 王 领主房)
  objectiveIdx() {
    const fd = this.floorData;
    if (!fd) return -1;
    // farIdx 就是 MapGen 里被设成 stairs / boss 的那个最远房间
    if (fd.rooms[fd.farIdx] && (fd.rooms[fd.farIdx].type === 'stairs' || fd.rooms[fd.farIdx].type === 'boss')) return fd.farIdx;
    const i = fd.rooms.findIndex(r => r.type === 'stairs' || r.type === 'boss');
    return i;
  },

  // 从当前房间走向目标房间的第一步 → { dir, idx }(BFS, 只读, 不改地图)
  nextStepTo(targetIdx) {
    const fd = this.floorData;
    if (!fd || !this.cur) return null;
    const start = this.cur.room.idx;
    if (targetIdx < 0 || start === targetIdx) return null;
    const prev = new Array(fd.rooms.length).fill(-2);
    prev[start] = -1;
    const q = [start];
    let found = false;
    while (q.length) {
      const i = q.shift();
      if (i === targetIdx) { found = true; break; }
      for (const k in fd.rooms[i].doors) {
        const j = fd.rooms[i].doors[k];
        if (prev[j] === -2) { prev[j] = i; q.push(j); }
      }
    }
    if (!found && prev[targetIdx] === -2) return null;
    let node = targetIdx;
    while (node >= 0 && prev[node] !== start) node = prev[node];
    if (node < 0) return null;
    for (const k in fd.rooms[start].doors) if (fd.rooms[start].doors[k] === node) return { dir: +k, idx: node };
    return null;
  },

  // HUD 目标行文案: 始终告诉玩家"现在该干什么、往哪走"
  objectiveText() {
    const cur = this.cur, fd = this.floorData;
    if (!cur || !fd) return '';
    const DIR_TXT = ['右', '左', '下', '上'];
    if (cur.room.type === 'stairs') {
      if (cur.locked) return '目标:清空本房间敌人 → ↓ 下一层入口开启';
      return `目标:走进绿色光圈, 按 E 进入第 ${this.run.floor + 1} 层`;
    }
    if (cur.room.type === 'boss') {
      if (cur.locked) return '目标:击败领主 → 深渊之门开启';
      return `目标:走进紫色漩涡, 按 E 跃迁至第 ${this.run.floor + 1} 层`;
    }
    if (cur.locked) return '目标:清空本房间敌人, 门才会开启';
    const st = this.nextStepTo(this.objectiveIdx());
    if (fd.bossFloor) return '目标:找到 王 领主房' + (st ? ` · 走${DIR_TXT[st.dir]}侧发光的门` : '');
    return '目标:找到 ↓ 楼梯房, 前往下一层' + (st ? ` · 走${DIR_TXT[st.dir]}侧发光的门` : '');
  },

  enterRoom(idx, fromDir) {
    const fd = this.floorData;
    const room = fd.rooms[idx];
    room.visited = true;
    this.cur = { room, locked: false, pending: [], wave1Alive: 0, wave2Out: false };
    this.enemies = []; this.projs = []; this.eprojs = []; this.pickups = []; this.pendingBooms = [];
    this.interactTarget = null;
    this._lastOne = false;   // 换房重置"最后一个敌人"高亮
    const p = this.player;
    // 入口位置
    if (fromDir === -1) { p.x = ROOM_W / 2; p.y = ROOM_H / 2; }
    else {
      const op = OPPO(fromDir);
      if (op === 0) { p.x = ROOM_W - 70; p.y = ROOM_H / 2; }
      else if (op === 1) { p.x = 70; p.y = ROOM_H / 2; }
      else if (op === 2) { p.x = ROOM_W / 2; p.y = ROOM_H - 70; }
      else { p.x = ROOM_W / 2; p.y = 70; }
    }
    this.buildRoomBg();
    // 楼梯房: 生成真实可交互的"下一层"入口
    // (修复卡关: 之前这里只有背景贴图 + 光源 this.portal, 没有任何拾取物/判定,
    //  玩家站在光圈的准确位置上也无法进入下一层 → 永远停在第 1 层)
    if (room.type === 'stairs') this.placeStairsExit();
    // 房间内容
    // 注意: room.cleared 的房间不再刷怪 —— 否则玩家走回头路时房间会重新刷满敌人 + 重新上锁,
    // 反复几次就会以为"一直卡在这一关"(存档里的 cleared 字段本来就代表"已清空")。
    if ((room.type === 'combat' || room.type === 'stairs') && !room.cleared) {
      const guards = room.guards.slice();
      const w1 = Math.max(1, Math.ceil(guards.length * 0.6));
      const wave1 = guards.slice(0, w1);
      cur_pending_to_wave(this, guards.slice(w1));
      wave1.forEach((g, i) => this.spawnGuard(g, i));
      this.cur.wave1Alive = wave1.length;
      this.cur.locked = true;
    } else if (room.type === 'boss' && !room.cleared) {
      const bidx = (Math.floor(fd.floor / 5) - 1) % BOSSES.length;
      const cyc = Math.floor((fd.floor / 5 - 1) / BOSSES.length);
      const boss = Entities.makeBoss(this, BOSSES[bidx], cyc);
      this.enemies.push(boss);
      this.cur.locked = true;
      UI.banner('⚠ ' + boss.name + ' ⚠', cyc > 0 ? `深渊回响 ×${cyc + 1} · 愈发狂暴` : '深渊领主苏醒', 2800);
      Sfx.play('boss');
    } else if (room.type === 'boss' && room.cleared) {
      // 已清空的领主房: 重新放回"深渊之门", 避免玩家出去再回来时出口消失 → 永久卡住
      const ep = room.exitPos || { x: ROOM_W / 2, y: ROOM_H / 2 };
      this.pickups.push(Entities.makePickup('next', ep.x, ep.y, { settle: 0, vx: 0, vy: 0, portal: true }));
    } else if (room.type === 'treasure' && !room.cleared) {
      this.pickups.push(Entities.makePickup('chest', ROOM_W / 2, ROOM_H / 2));
    } else if (room.type === 'shrine' && !room.cleared) {
      this.pickups.push(Entities.makePickup('shrine', ROOM_W / 2, ROOM_H / 2));
    }
    this.doorCd = 0.3;   // 刚进房间时不立即再触发门, 防止来回传送
    if (fromDir >= 0) { this.stat.rooms++; Sfx.play('door'); }
    // 进入楼梯房时给出明确指引(不让玩家"进来了却不知道这里有出口")
    if (room.type === 'stairs' && this.cur.locked) UI.banner('↓ 下一层就在此房间', '清空全部敌人 → 绿色光圈开启 → 按 E', 2600);
  },
  // 第二波敌人暂存
  spawnGuard(g, i) {
    const pos = this.findSpawnPt();
    const e = Entities.makeEnemy(this, g.type, pos.x, pos.y, g.elite);
    e.spawnT = 0.45 + i * 0.08;
    this.enemies.push(e);
    FX.burst(pos.x, pos.y, e.color, 10, 130, 0.5, 4);
  },

  findSpawnPt() {
    const p = this.player;
    let pt = { x: 120, y: 120 };
    for (let i = 0; i < 50; i++) {
      const x = rrange(130, ROOM_W - 130), y = rrange(130, ROOM_H - 130);
      if (dist(x, y, p.x, p.y) < 250) continue;
      let ok = true;
      for (const o of this.cur.room.obstacles) if (dist(x, y, o.x, o.y) < o.r + 42) { ok = false; break; }
      if (ok) { pt = { x, y }; break; }
      pt = { x, y };
    }
    return pt;
  },

  roomCleared(bonus = true) {
    const cur = this.cur;
    if (!cur.locked) return;
    cur.locked = false;
    if (cur.exitPk) cur.exitPk.locked = false;
    cur.room.cleared = true;
    Sfx.play('door');
    // 楼梯房清空 → 明确告知"下一层入口已开启"(不再让玩家自己猜)
    if (cur.room.type === 'stairs' && cur.exitPk) {
      const pk = cur.exitPk;
      this.cur.room.cleared = true;
      FX.ring(pk.x, pk.y, '#9fe8b0', 86, 0.75);
      FX.burst(pk.x, pk.y, '#9fe8b0', 18, 200, 0.6, 4);
      FX.text(pk.x, pk.y - 52, '↓ 下一层已开启', '#c8ffd8', 18, true);
      UI.banner('✦ 下一层入口已开启 ✦', `走进绿色光圈 · 按 E 进入第 ${this.run.floor + 1} 层`, 3200);
    }
    // 领主层: 提示出口在领主尸体上
    if (cur.room.type === 'boss') UI.banner('✦ 深渊之门已开启 ✦', '走到紫色漩涡上 · 按 E 跃迁', 3000);
    if (bonus) {
      if (rchance(0.32)) this.spawnItemPickup(ROOM_W / 2 + rrange(-60, 60), ROOM_H / 2 + rrange(-40, 40));
      if (rchance(0.18)) this.pickups.push(Entities.makePickup('heart', ROOM_W / 2, ROOM_H / 2 - 50));
    }
    this.saveRun();
  },

  // ================= 存档 =================
  saveRun() {
    if (this.state !== 'play' || !this.player) return;
    const p = this.player;
    RunSave.save({
      seed: this.run.seed, floor: this.run.floor,
      p: {
        level: p.level, xp: p.xp, hp: Math.ceil(p.hp), gold: p.gold, souls: p.souls, kills: p.kills,
        blessings: p.blessings, weapon: p.weapon, passives: p.passives, revivesUsed: p.revivesUsed,
      },
      cleared: this.floorData.rooms.map((r, i) => r.cleared ? i : -1).filter(i => i >= 0),
    });
  },

  // ================= 主更新 =================
  tick(dt) {
    this.time += dt;
    // 引导的"强制暂停"步骤(欢迎/结束卡片)期间冻结世界, 只跑渲染与引导自身
    const tutHold = !!(this.tutorial && this.tutorial.hold);
    if (this.state === 'play' && !this.paused && !this.modal && !tutHold) {
      this.update(dt);
      if (this.pendingLevels > 0 && !this.modal) this.openLevelUp();
    }
    if (this.state !== 'menu') UI.updateHUD();
    this.render();
  },

  update(dt) {
    const p = this.player;
    // 玩家
    this.updatePlayer(dt);
    // 敌人
    for (const e of this.enemies) {
      Entities.updateEnemy(this, e, dt);
      if (e.ai === 'boss') this.updateBoss(e, dt);
      if (e.spawnT > 0) { e.spawnT -= dt; if (rchance(0.25)) FX.burst(e.x, e.y, e.color, 1, 60, 0.4, 3); }
      else if (!e.boss) {
        const clamped = this.collideRoom(e);
        if (clamped && e.state === 'charge') { e.state = 'rest'; e.stateT = 0.6; }
        // 接触伤害
        if (!e.dead && e.contactCd <= 0 && dist(e.x, e.y, p.x, p.y) < e.r + p.r - 2) {
          e.contactCd = 0.9;
          this.hitPlayer(e.dmg * (e.state === 'charge' ? 1.25 : 1), e);
        }
      }
    }
    Entities.separate(this.enemies);
    this.enemies = this.enemies.filter(e => !e.dead);
    // 波次
    if (this.cur.locked && !this.cur.pending.length && this.enemies.length === 0) this.roomCleared();
    if (this.cur.locked && this.cur.pending.length && this.enemies.length <= Math.max(1, Math.ceil(this.cur.wave1Alive * 0.4))) {
      const pend = this.cur.pending;
      this.cur.pending = [];
      pend.forEach((g, i) => this.spawnGuard(g, i));
      this.cur.wave1Alive = pend.length;
    }
    // 最后一个敌人提示(意见书 3.4 P1): 房间锁定且只剩 1 只(无待刷波次、非领主 —— 领主自带
    // 血条与全屏存在感)时置位, 渲染层据此画显眼光圈; 从多只 → 1 只的瞬间给一次短促镜头震动 + 飘字。
    if (this.cur.locked && !this.cur.pending.length && this.enemies.length === 1 && !this.enemies[0].boss) {
      if (!this._lastOne) {
        this._lastOne = true;
        const e0 = this.enemies[0];
        if (e0 && e0.spawnT <= 0) {
          this.shake += 3.5;
          FX.text(e0.x, e0.y - e0.r - 30, '最后 1 个敌人!', '#ffe08a', 15, true);
          Sfx.play('ui');
        }
      }
    } else this._lastOne = false;
    // 弹幕
    this.updateProjs(dt);
    this.updateEProjs(dt);
    // 奥术新星
    this.updateNovas(dt);
    // 自爆
    for (let i = this.pendingBooms.length - 1; i >= 0; i--) {
      const b = this.pendingBooms[i];
      b.t -= dt;
      if (b.t <= 0) {
        if (dist(b.x, b.y, p.x, p.y) < b.r + p.r) this.hitPlayer(b.dmg, null);
        for (const e of this.enemies) if (!e.dead && e.spawnT <= 0 && dist(b.x, b.y, e.x, e.y) < b.r + e.r)
          this.hitEnemy(e, b.dmg * 0.5, { noCrit: true, color: '#ff8c4d', noProc: true });
        FX.ring(b.x, b.y, b.color, b.r, 0.3);
        FX.burst(b.x, b.y, b.color, 22, 260, 0.5, 5);
        this.shake += 5;
        Sfx.play('explode');
        this.pendingBooms.splice(i, 1);
      }
    }
    // 拾取物
    for (const pk of this.pickups) Entities.updatePickup(this, pk, dt);
    this.pickups = this.pickups.filter(pk => !pk.gone);
    // 特效
    FX.update(dt);
    // 环境粒子(尘埃/火星/飘灰)
    this.updateAmbient(dt);
    // 互动目标
    this.detectInteract();
    // 门传送
    if (this.doorCd > 0) this.doorCd -= dt;
    if (!this.cur.locked) this.checkDoor();
    // 计时衰减
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.1) this.shake = 0;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 4.5;
      if (this.fade >= 1 && this.fadeDir > 0) { this.fade = 1; this.fadeDir = 0; if (this.afterFade) { const cb = this.afterFade; this.afterFade = null; cb(); this.fadeDir = -1; } }
      if (this.fade <= 0 && this.fadeDir < 0) { this.fade = 0; this.fadeDir = 0; }
    }
  },

  // ---------- 玩家 ----------
  updatePlayer(dt) {
    const p = this.player, k = this.input.keys;
    const wasCd = p.fireCd;
    p.iframes -= dt; p.dashCd -= dt; p.fireCd -= dt; p.slowT -= dt; p.novaCd -= dt;
    if (wasCd > 0 && p.fireCd <= 0) p.readyT = 0.16;   // 冷却结束的一次性提示
    if (p.readyT > 0) p.readyT -= dt;
    if (p.muzzleT > 0) p.muzzleT -= dt;
    if (this.hitMarkT > 0) this.hitMarkT -= dt;
    if (this.input.fireBuf > 0) this.input.fireBuf -= dt;
    p.aimA = angleTo(p.x, p.y, this.input.mx, this.input.my);
    // 触屏"开火"按钮按住期间: 自动瞄准最近的敌人(未出生的优先级最低);
    // 场上没怪时退化为沿摇杆方向瞄准。选择"最近敌人自动瞄准"而非"摇杆方向":
    // 右拇指按住开火时, 左摇杆方向通常在走位躲弹, "指哪打哪"反而违背直觉(见实现报告)。
    if (this.input.autoAim) {
      let best = null, bw = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d2 = dist2(e.x, e.y, p.x, p.y);
        const w = e.spawnT > 0 ? d2 + 1e9 : d2;
        if (w < bw) { bw = w; best = e; }
      }
      if (best) p.aimA = angleTo(p.x, p.y, best.x, best.y);
      else if (this.input.touchActive && (this.input.tvx || this.input.tvy)) p.aimA = Math.atan2(this.input.tvy, this.input.tvx);
    }
    // 移动(键盘 WASD/方向键; 触屏设备且摇杆推动中时以摇杆向量为准)
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (this.input.touchActive && (this.input.tvx || this.input.tvy)) { mx = this.input.tvx; my = this.input.tvy; }
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;
    const spd = p.speed * (p.slowT > 0 ? 0.6 : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += Math.cos(p.dashA) * 660 * dt;
      p.y += Math.sin(p.dashA) * 660 * dt;
      p.ghostT = (p.ghostT || 0) - dt;
      if (p.ghostT <= 0) { p.ghosts.push({ x: p.x, y: p.y, t: 0 }); p.ghostT = 0.024; }
    } else if (mx || my) {
      p.x += mx * spd * dt; p.y += my * spd * dt;
      this.stat.moved += spd * dt;
    }
    for (let i = p.ghosts.length - 1; i >= 0; i--) { p.ghosts[i].t += dt; if (p.ghosts[i].t > 0.3) p.ghosts.splice(i, 1); }
    this.collideRoom(p);
    // 回复
    if (p.stats.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
    // 庇护
    if (p.sp.aegis && !p.shield) {
      p.aegisT -= dt;
      if (p.aegisT <= 0) { p.shield = true; Sfx.play('shield'); FX.ring(p.x, p.y, '#9fd8ff', 30, 0.4); }
    }
    // 环刃
    if (p.sp.orbit) {
      const m = AFFIX.orbit.mech(p.sp.orbit);
      p.orbitA += m.spin * dt;
      for (let i = 0; i < m.count; i++) {
        const a = p.orbitA + i / m.count * TAU;
        const bx = p.x + Math.cos(a) * m.radius, by = p.y + Math.sin(a) * m.radius;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || e.orbitCd > 0) continue;
          if (dist(bx, by, e.x, e.y) < e.r + 13) {
            e.orbitCd = 0.4;
            this.hitEnemy(e, Loot.shotDmg(p) * m.mult, { color: '#d78cff' });
            FX.burst(bx, by, '#d78cff', 4, 100, 0.3, 3);
          }
        }
      }
    }
    // 射击
    // 输入缓冲: 冷却中点击(按下即松开)不再被整帧吞掉 —— 只要在 0.16s 内点过,
    // 冷却一结束就立刻补发, 手感从"点了没反应"变成"跟手连击"。
    // 注意: 缓冲只在"点得比冷却慢"时生效, 持续输出的 DPS 不变。
    if ((this.input.fire || this.input.fireBuf > 0) && p.fireCd <= 0) {
      if (this.shoot()) this.input.fireBuf = 0;
    }
  },

  // 单次开火(含前置校验)。冷却就绪时立即开火, 供 mousedown 直接调用,
  // 把"按下 → 伤害生效"的延迟从"下一次 rAF 帧(最多 1 帧)"缩减到 0。
  tryFire() {
    if (this.state !== 'play' || this.paused || this.modal) return false;
    if (this.tutorial && this.tutorial.hold) return false;
    const p = this.player;
    if (!p || p.fireCd > 0) return false;
    return this.shoot();
  },

  tryDash() {
    const p = this.player;
    if (this.state !== 'play' || this.paused || this.modal || p.dashCd > 0) return;
    if (this.tutorial && this.tutorial.hold) return;
    const k = this.input.keys;
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    // 触屏冲刺按钮: 键盘无输入时沿摇杆方向冲(更符合"逃离/走位"直觉), 否则沿瞄准方向
    if (!mx && !my && this.input.touchActive) { mx = this.input.tvx; my = this.input.tvy; }
    p.dashA = (mx || my) ? Math.atan2(my, mx) : p.aimA;
    p.dashT = 0.17; p.dashCd = 1.6;
    this.stat.dashes++;
    Sfx.play('dash');
    FX.burst(p.x, p.y, '#9fd8ff', 8, 140, 0.3, 3);
  },

  // ---------- 主动技能: 奥术新星(Q) ----------
  tryNova() {
    const p = this.player;
    if (this.state !== 'play' || this.paused || this.modal || !p.sp.nova || p.novaCd > 0) return;
    if (this.tutorial && this.tutorial.hold) return;
    const m = AFFIX.nova.mech(p.sp.nova);
    p.novaCd = m.cd;
    this.novas.push({ x: p.x, y: p.y, r: 20, maxR: m.radius, dmg: Loot.shotDmg(p) * m.dmg, knock: m.knock, hits: new Set() });
    FX.ring(p.x, p.y, '#ffe9b0', m.radius, 0.45);
    FX.burst(p.x, p.y, '#ffe9b0', 18, 260, 0.5, 4);
    this.shake += 5;
    Sfx.play('explode');
  },

  updateNovas(dt) {
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const nv = this.novas[i];
      const r0 = nv.r;
      nv.r += 900 * dt;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || nv.hits.has(e.uid)) continue;
        const d = dist(nv.x, nv.y, e.x, e.y);
        if (d <= nv.r + e.r && d >= r0 - e.r - 30) {
          nv.hits.add(e.uid);
          this.hitEnemy(e, nv.dmg, { color: '#ffe9b0' });
          // 击退(Boss 减免)
          const a = angleTo(nv.x, nv.y, e.x, e.y);
          const kb = (e.boss ? nv.knock * 0.2 : nv.knock);
          e.x += Math.cos(a) * kb; e.y += Math.sin(a) * kb;
        }
      }
      if (nv.r >= nv.maxR) this.novas.splice(i, 1);
    }
  },

  shoot() {
    const p = this.player, w = Loot.itemBase(p.weapon), s = p.stats;
    if (!w) return false;
    // 冷却: 保留上一发的溢出量(最多 50ms), 连射间隔等于标称 interval 而不是
    // "interval 向上取整到帧边界", 长按输出不再比设计值慢(弓 0.32s: 3.00/s → 3.125/s)。
    const iv = Loot.weaponInterval(p);
    p.fireCd = clamp(p.fireCd, -0.05, 0) + iv;
    const count = w.count + s.projExtra;
    const gap = w.spread || 0.14;
    const total = (count - 1) * gap;
    const speed = w.speed * (1 + s.projSpeedPct);
    for (let i = 0; i < count; i++) {
      const ang = p.aimA - total / 2 + i * gap + rrange(-0.015, 0.015);
      this.projs.push({
        x: p.x + Math.cos(p.aimA) * 18, y: p.y + Math.sin(p.aimA) * 18,
        px: p.x, py: p.y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        ang, dmg: Loot.shotDmg(p), pierce: w.wave ? 999 : s.pierce,
        hits: new Set(), life: w.wave ? w.life : 1.7,
        color: w.color, size: w.size, aoe: w.aoe || 0, wave: !!w.wave, canSplit: true, speed,
      });
    }
    // 开火反馈: 枪口闪光 + 极轻微后坐/镜头反馈(纯表现, 不影响数值)
    this.stat && this.stat.shots++;
    p.muzzleT = 0.1;
    FX.burst(p.x + Math.cos(p.aimA) * 22, p.y + Math.sin(p.aimA) * 22, w.color, 3, 130, 0.16, 3);
    if (w.aoe) this.shake += 1.6; else this.shake += 0.5;
    Sfx.play(w.aoe ? 'shootHeavy' : w.wave ? 'shootWave' : 'shoot');
    return true;
  },

  // ---------- 弹丸 ----------
  spawnProj(x, y, ang, speed, dmg, opts) {
    this.projs.push(Object.assign({
      x, y, px: x, py: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      ang, dmg, pierce: 0, hits: new Set(), life: 1.2, color: '#b0e0ff', size: 5, aoe: 0, wave: false, canSplit: false, speed,
    }, opts || {}));
  },

  updateProjs(dt) {
    const room = this.cur.room;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.px = pr.x; pr.py = pr.y;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.life -= dt;
      let dead = pr.life <= 0;
      // 撞墙
      if (pr.x < 30 || pr.x > ROOM_W - 30 || pr.y < 30 || pr.y > ROOM_H - 30) {
        dead = true;
        FX.burst(pr.x, pr.y, pr.color, 3, 90, 0.2, 2);
      }
      // 撞岩石(魂波穿透)
      if (!dead && !pr.wave) {
        for (const o of room.obstacles) {
          if (dist2(pr.x, pr.y, o.x, o.y) < (o.r + pr.size) * (o.r + pr.size)) {
            dead = true;
            FX.burst(pr.x, pr.y, '#8a93ab', 3, 90, 0.2, 2);
            break;
          }
        }
      }
      // 命中敌人(扫掠判定: 上一帧位置 → 这一帧位置的整条线段)
      if (!dead) {
        const rr = pr.size;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || pr.hits.has(e.uid)) continue;
          if (segCircleHit(pr.px, pr.py, pr.x, pr.y, e.x, e.y, e.r + rr)) {
            pr.hits.add(e.uid);
            this.onProjHit(pr, e);
            if (pr.pierce > 0) pr.pierce--;
            else { dead = true; break; }
          }
        }
      }
      if (dead) {
        if (pr.aoe) this.aoe(pr.x, pr.y, pr.aoe, pr.dmg, { color: pr.color, noProc: true });
        this.projs.splice(i, 1);
      }
    }
  },

  onProjHit(pr, e) {
    const p = this.player, sp = p.sp;
    const res = this.hitEnemy(e, pr.dmg, {});
    if (!res) return;
    this.stat && this.stat.hits++;
    this.hitMarkT = 0.14;                       // 准星命中标记
    this.shake += 0.55;                         // 单发命中的极轻微镜头反馈(此前完全没有)
    const base = Loot.shotDmg(p);
    // 击退: 沿弹道方向轻推(领主抵抗), 纯表现位移, 不改变伤害
    if (!e.boss && e.spawnT <= 0) {
      const kb = 5 + Math.min(6, pr.size * 0.25);
      const a = pr.ang;
      e.x += Math.cos(a) * kb; e.y += Math.sin(a) * kb;
      if (this.cur) this.collideRoom(e);
    }
    FX.burst(pr.x, pr.y, pr.color, 4, 120, 0.25, 3);
    if (sp.burn) {
      const m = AFFIX.burn.mech(sp.burn);
      const dps = base * m.dps;
      e.burn = e.burn ? { t: m.dur, dps: Math.min(e.burn.dps + dps, dps * 4) } : { t: m.dur, dps };
    }
    if (sp.poison) {
      const m = AFFIX.poison.mech(sp.poison);
      const dps = base * m.dps;
      e.poison = e.poison ? { t: m.dur, stacks: Math.min(m.maxStacks, e.poison.stacks + 1), dps } : { t: m.dur, stacks: 1, dps };
    }
    if (sp.frost) {
      const m = AFFIX.frost.mech(sp.frost);
      e.frost = e.frost && e.frost.t > 0 ? { slow: m.slow, t: m.dur, stacks: e.frost.stacks + 1 } : { slow: m.slow, t: m.dur, stacks: 1 };
      if (e.frost.stacks >= m.freezeAt && e.frozenT <= 0) {
        e.frozenT = m.freezeDur; e.frost.stacks = 0;
        FX.text(e.x, e.y - e.r - 14, '冻结!', '#8cd8ff', 15, true);
        Sfx.play('freeze');
      }
    }
    if (sp.chain) {
      const m = AFFIX.chain.mech(sp.chain);
      if (Math.random() < m.chance) this.chainZap(e, pr.dmg * m.mult);
    }
    if (pr.canSplit && sp.split) {
      const m = AFFIX.split.mech(sp.split);
      this.spawnProj(e.x, e.y - 6, pr.ang - 0.7, pr.speed * 0.9, pr.dmg * m.mult, { color: '#b0e0ff', size: pr.size * 0.62, canSplit: false, life: 0.8 });
      this.spawnProj(e.x, e.y - 6, pr.ang + 0.7, pr.speed * 0.9, pr.dmg * m.mult, { color: '#b0e0ff', size: pr.size * 0.62, canSplit: false, life: 0.8 });
    }
    if (pr.aoe) this.aoe(pr.x, pr.y, pr.aoe, pr.dmg, { exclude: e.uid, color: pr.color, noProc: true });
  },

  chainZap(from, dmg) {
    const m = AFFIX.chain.mech(this.player.sp.chain);
    let cur = from;
    const hitSet = new Set([cur.uid]);
    let lx = cur.x, ly = cur.y - cur.r;
    Sfx.play('zap');
    for (let j = 0; j < m.jumps; j++) {
      let best = null, bd = 260 * 260;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || hitSet.has(e.uid)) continue;
        const d2 = dist2(cur.x, cur.y, e.x, e.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (!best) break;
      FX.zap(lx, ly, best.x, best.y - best.r * 0.5, '#ffe37e');
      lx = best.x; ly = best.y - best.r * 0.5;
      hitSet.add(best.uid);
      this.hitEnemy(best, dmg, { noCrit: true, color: '#ffe37e' });
      cur = best;
      if (cur.dead) break;
    }
  },

  aoe(x, y, r, dmg, opts = {}) {
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.uid === opts.exclude) continue;
      if (dist(x, y, e.x, e.y) < r + e.r) this.hitEnemy(e, dmg, { noCrit: true, color: opts.color || '#ffb066', noProc: true });
    }
    FX.ring(x, y, opts.color || '#ffb066', r, 0.35);
    FX.burst(x, y, opts.color || '#ffb066', 10, 200, 0.4, 4);
    this.shake += 2;
  },

  // ---------- 伤害结算 ----------
  hitEnemy(e, base, opts = {}) {
    if (!e || e.dead || e.spawnT > 0) return null;
    const p = this.player;
    let dmg = base, crit = false;
    if (!opts.noCrit && Math.random() < p.stats.crit) { crit = true; dmg *= p.stats.critMult; }
    dmg = Math.max(1, Math.round(dmg - (e.armor || 0)));
    e.hp -= dmg;
    e.flashT = 0.09;
    FX.text(e.x, e.y - e.r - 8, dmg, crit ? '#ffd24d' : (opts.color || '#e8ecf5'), crit ? 20 : 13, crit);
    if (crit) Sfx.play('crit'); else if (!opts.silent) Sfx.play('hit');
    // 吸血
    if (p.stats.lifesteal > 0) {
      this._lsAcc += dmg * p.stats.lifesteal;
      if (this._lsAcc >= 1) { this.healPlayer(Math.floor(this._lsAcc), true); this._lsAcc -= Math.floor(this._lsAcc); }
    }
    // 处决
    if (!opts.noProc && p.sp.execute && !e.boss && e.elite < 0 && e.hp > 0) {
      const th = AFFIX.execute.mech(p.sp.execute).th;
      if (e.hp / e.maxHp < th) {
        e.hp = 0;
        FX.text(e.x, e.y - e.r - 22, '处决!', '#ff6b8a', 18, true);
      }
    }
    if (e.hp <= 0) this.killEnemy(e, opts);
    return { dmg, crit };
  },

  killEnemy(e, opts = {}) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    p.kills++; p.souls += 1;
    this.gainXp(Math.round(e.xp * p.stats.xpGain));
    FX.burst(e.x, e.y, e.color, e.boss ? 60 : 12, e.boss ? 340 : 180, 0.6, e.boss ? 7 : 4);
    if (e.boss) { FX.ring(e.x, e.y, e.color, 160, 0.6); this.shake += 12; Sfx.play('explode'); }
    else Sfx.play('kill');
    // 掉落
    const floor = this.run.floor, luck = p.stats.luck;
    if (!e.boss) {
      const coins = e.elite >= 0 ? rint(6, 9) : rint(1, 3);
      for (let i = 0; i < coins; i++)
        this.pickups.push(Entities.makePickup('coin', e.x + rrange(-18, 18), e.y + rrange(-18, 18), { val: Math.max(1, Math.round(rrange(1, 2 + floor * 0.35) * p.stats.goldFind)) }));
      if (rchance(e.elite >= 0 ? 0.25 : 0.04)) this.pickups.push(Entities.makePickup('potion', e.x, e.y));
      else if (rchance(0.03)) this.pickups.push(Entities.makePickup('heart', e.x, e.y));
      const dropC = opts.silentItem ? 0 : (e.elite >= 0 ? 0.62 : 0.035 * (1 + luck));
      if (rchance(dropC)) this.spawnItemPickup(e.x, e.y);
    }
    // 玩家湮灭词条
    if (p.sp.explode && !e.boss) {
      const m = AFFIX.explode.mech(p.sp.explode);
      this.aoe(e.x, e.y, m.radius, Loot.shotDmg(p) * m.mult, { color: '#ffb066', noProc: true });
    }
    // 爆裂孢子亡语
    if (e.type === 'bomber' && !opts.noBoom)
      this.pendingBooms.push({ x: e.x, y: e.y, r: ENEMY_TYPES.bomber.blastR, t: 0.4, maxT: 0.4, dmg: e.dmg * 0.8, color: '#ff8c4d' });
    if (e.boss) this.onBossDeath(e);
  },

  onBossDeath(b) {
    const p = this.player;
    p.souls += 60;
    // 记录出口坐标: 玩家离开领主房再回来时会按这个坐标重新放出"深渊之门"
    if (this.cur && this.cur.room) this.cur.room.exitPos = { x: b.x, y: b.y - 60 };
    this.spawnItemPickup(b.x, b.y, Loot.genItem(this.run.floor, { minRarity: 3, luck: p.stats.luck }));
    for (let i = 0; i < 16; i++)
      this.pickups.push(Entities.makePickup('coin', b.x + rrange(-50, 50), b.y + rrange(-50, 50), { val: Math.max(2, Math.round(rrange(3, 6 + this.run.floor * 0.4) * p.stats.goldFind)) }));
    this.pickups.push(Entities.makePickup('potion', b.x + 40, b.y));
    this.pickups.push(Entities.makePickup('next', b.x, b.y - 60, { portal: true }));
    UI.banner('✦ 领主已被讨伐 ✦', '深渊之门已开启 → 跃迁', 2600);
    this.roomCleared(false);
  },

  hitPlayer(dmg, src) {
    const p = this.player;
    if (p.iframes > 0 || p.dashT > 0 || this.state !== 'play') return;
    if (Math.random() < p.stats.dodge) {
      FX.text(p.x, p.y - 24, '闪避', '#8cd8ff', 14);
      p.iframes = 0.3;
      return;
    }
    if (p.shield) {
      p.shield = false;
      p.aegisT = p.aegisPeriod || 999;
      FX.ring(p.x, p.y, '#9fd8ff', 34, 0.4);
      Sfx.play('shield');
      p.iframes = 0.4;
      return;
    }
    const taken = Math.max(1, Math.round(dmg - p.stats.armor));
    p.hp -= taken;
    p.iframes = 0.7;
    this.shake += 6;
    this.hurtFlash = 1;
    FX.text(p.x, p.y - 26, '-' + taken, '#ff6b6b', 17, true);
    Sfx.play('hurt');
    // 荆棘
    if (src && p.sp.thorns) this.hitEnemy(src, Loot.shotDmg(p) * AFFIX.thorns.mech(p.sp.thorns).mult, { noCrit: true, noProc: true, color: '#7fae6a' });
    // 精英特效
    if (src && src.lifesteal) src.hp = Math.min(src.maxHp, src.hp + taken * src.lifesteal);
    if (src && src.chill) p.slowT = 1.3;
    if (p.hp <= 0) this.onPlayerDown();
  },

  healPlayer(n, quiet) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (!quiet && p.hp > before) {
      FX.text(p.x, p.y - 30, '+' + Math.round(p.hp - before), '#7fd45c', 15);
      FX.burst(p.x, p.y, '#7fd45c', 6, 90, 0.4, 3);
    }
  },

  gainGold(n) { this.player.gold += Math.max(1, Math.round(n)); },

  gainXp(n) {
    const p = this.player;
    p.xp += n;
    while (p.xp >= this.xpNeed(p)) {
      p.xp -= this.xpNeed(p);
      p.level++;
      this.pendingLevels++;
      this.healPlayer(Math.round(p.maxHp * 0.15), true);
      Sfx.play('level');
      FX.ring(p.x, p.y, '#57c8ff', 60, 0.5);
      FX.text(p.x, p.y - 34, 'Lv.' + p.level + '!', '#57c8ff', 18, true);
    }
  },

  xpNeed(p) { return Math.round(16 * Math.pow(1.33, p.level - 1)) + (this.run.floor - 1) * 4; },

  // ---------- 祝福 ----------
  rollBlessings(n = 3) {
    const p = this.player;
    const pool = BLESSING_POOL.filter(b => !(b.special && (p.sp[b.special] || 0) >= 5));
    const out = [], tmp = pool.slice();
    while (out.length < n && tmp.length) {
      let tot = 0;
      tmp.forEach(b => tot += b.w);
      let r = Math.random() * tot, idx = tmp.length - 1;
      for (let i = 0; i < tmp.length; i++) { r -= tmp[i].w; if (r <= 0) { idx = i; break; } }
      out.push(tmp.splice(idx, 1)[0]);
    }
    return out;
  },

  openLevelUp() {
    const choices = this.rollBlessings();
    UI.openChoices('等级提升!', `达到 Lv.${this.player.level} — 选择一项祝福`, choices, b => {
      this.applyBlessing(b);
      this.pendingLevels--;
      if (this.pendingLevels > 0) this.openLevelUp();
      else { UI.closeModal(); this.saveRun(); }
    });
  },

  applyBlessing(b) {
    const p = this.player;
    p.blessings.push({ affix: b.affix || null, special: b.special || null, amount: b.amount || 0 });
    Loot.applyStats(p);
    if (b.heal) this.healPlayer(b.heal);
    if (b.healPct) this.healPlayer(Math.round(p.maxHp * b.healPct));
    if (b.gold) this.gainGold(b.gold);
    FX.ring(p.x, p.y, '#ffd24d', 50, 0.5);
  },

  // ---------- Boss ----------
  ebullet(x, y, ang, speed, dmg, opts = {}) {
    this.eprojs.push({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      dmg, r: opts.r || 7, color: opts.color || '#ff7a5c', life: opts.life || 3.5, homing: opts.homing || 0,
    });
  },

  updateBoss(b, dt) {
    const p = this.player;
    b.t += dt;
    // contactCd / flashT 已在 Entities.updateEnemy 中统一衰减
    if (b.atk) {
      const a = b.atk;
      a.t += dt;
      const fire = (ang, spd, opts) => this.ebullet(b.x, b.y, ang, spd, b.dmg * 0.8, Object.assign({ color: b.color }, opts));
      if (a.kind === 'radial') {
        if (a.stage === 0) {
          a.stage = 1; a.next = 0.55;
          const n = 14 + b.cycle * 4;
          for (let i = 0; i < n; i++) fire(a.base + i / n * TAU, 195);
        } else if (a.stage === 1 && a.t >= a.next) {
          a.stage = 2;
          const n = 14 + b.cycle * 4;
          for (let i = 0; i < n; i++) fire(a.base + (i + 0.5) / n * TAU, 165);
        } else if (a.t > 0.85) a.done = true;
      } else if (a.kind === 'spiral') {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.085;
          a.base += 0.42;
          fire(a.base, 215); fire(a.base + Math.PI, 215);
        }
        if (a.t > 2.2) a.done = true;
      } else if (a.kind === 'homing') {
        a.next -= dt;
        if (a.next <= 0 && a.stage < 3) {
          a.next = 0.28; a.stage++;
          fire(angleTo(b.x, b.y, p.x, p.y), 150, { homing: 1.7, r: 9, life: 4.5 });
        }
        if (a.t > 1.1) a.done = true;
      } else if (a.kind === 'charge') {
        if (a.stage === 0) { a.stage = 1; a.ang = angleTo(b.x, b.y, p.x, p.y); }
        else if (a.stage === 1 && a.t > 0.65) { a.stage = 2; Sfx.play('dash'); }
        else if (a.stage === 2) {
          b.x += Math.cos(a.ang) * 520 * dt;
          b.y += Math.sin(a.ang) * 520 * dt;
          const before = { x: b.x, y: b.y };
          this.collideRoom(b);
          if (dist(before.x, before.y, b.x, b.y) > 6 || a.t > 1.35) a.done = true;
        }
      } else if (a.kind === 'summon') {
        if (a.stage === 0) {
          a.stage = 1;
          const adds = this.enemies.filter(e => !e.boss && !e.dead).length;
          if (adds < 6) {
            for (let i = 0; i < 3; i++) {
              const a2 = rrange(0, TAU);
              const e = Entities.makeEnemy(this, b.summonType, b.x + Math.cos(a2) * 90, b.y + Math.sin(a2) * 90, -1);
              this.enemies.push(e);
              FX.burst(e.x, e.y, e.color, 8, 120, 0.4, 3);
            }
          }
        }
        if (a.t > 0.5) a.done = true;
      } else if (a.kind === 'rings') {
        a.next -= dt;
        if (a.next <= 0 && a.stage < 3) {
          a.next = 0.45; a.stage++;
          const n = 20, gapA = rrange(0, TAU);
          for (let i = 0; i < n; i++) {
            const ang = a.base + i / n * TAU;
            let d = Math.abs(((ang - gapA) % TAU + TAU) % TAU);
            d = Math.min(d, TAU - d);
            if (d < 0.42) continue; // 留出缺口
            fire(ang, 170);
          }
        }
        if (a.t > 1.3) a.done = true;
      } else if (a.kind === 'sweep') {
        a.next -= dt;
        if (a.next <= 0 && a.t < 1.35) {
          a.next = 0.12;
          const k = a.t / 1.35;
          const c = a.base - 1.1 + k * 2.2;
          for (let i = -1; i <= 2; i++) fire(c + i * 0.14, 245);
        }
        if (a.t > 1.5) a.done = true;
      }
      if (a.done) {
        b.atk = null;
        b.cool = (b.hp < b.maxHp * 0.5 ? 1.0 : 1.7) * rrange(0.85, 1.2);
      }
    } else {
      const d = dist(b.x, b.y, p.x, p.y);
      const ang = angleTo(b.x, b.y, p.x, p.y);
      const want = d > 280 ? 1 : (d < 200 ? -1 : 0);
      const spd = b.hp < b.maxHp * 0.5 ? 78 : 55;
      b.x += Math.cos(ang) * spd * want * dt;
      b.y += Math.sin(ang) * spd * want * dt;
      b.cool -= dt;
      if (b.cool <= 0) {
        const kind = b.attacks[b.atkIdx % b.attacks.length];
        b.atkIdx++;
        b.atk = { kind, t: 0, stage: 0, next: 0, base: rrange(0, TAU), ang: 0 };
      }
    }
    this.collideRoom(b);
    // 接触伤害
    if (!b.dead && b.contactCd <= 0 && dist(b.x, b.y, p.x, p.y) < b.r + p.r) {
      b.contactCd = 0.9;
      this.hitPlayer(b.dmg * (b.atk && b.atk.kind === 'charge' && b.atk.stage === 2 ? 1.3 : 1), b);
    }
  },

  // ---------- 互动 ----------
  detectInteract() {
    const p = this.player;
    this.interactTarget = null;
    let bd = Infinity;
    for (const pk of this.pickups) {
      if (pk.type !== 'item' && pk.type !== 'chest' && pk.type !== 'shrine' && pk.type !== 'next') continue;
      // 下一层入口的判定范围放宽到 96px, 避免"站在光圈上差几像素没反应"
      const reach = pk.type === 'next' ? 96 : 64;
      const d2 = dist2(pk.x, pk.y, p.x, p.y);
      if (d2 > reach * reach) continue;
      const w = pk.type === 'next' ? d2 * 0.35 : d2;   // 同一距离下入口优先
      if (w < bd) {
        bd = w;
        const blocked = pk.type === 'next' && this.cur.locked;
        const label = pk.type === 'chest' ? '打开宝箱'
          : pk.type === 'shrine' ? '供奉远古祭坛'
          : pk.type === 'next' ? (blocked ? '下一层入口 · 封印中(清空本房间敌人后开启)'
            : (pk.portal ? '跃迁至更深层' : '进入下一层'))
          : '拾取 ' + Loot.itemName(pk.item);
        this.interactTarget = { pk, label, blocked: !!blocked };
      }
    }
  },

  tryInteract() {
    if (this.state !== 'play' || this.paused || this.modal) return;
    if (this.tutorial && this.tutorial.hold) return;
    const t = this.interactTarget;
    if (!t) return;
    const pk = t.pk, p = this.player;
    if (t.blocked) {   // 入口存在但被封印: 明确说明原因, 不做"静默失败"
      FX.text(p.x, p.y - 36, '入口被封印!', '#ff8a7a', 16, true);
      Sfx.play('ui');
      UI.banner('入口被封印', '清空本房间全部敌人 → ↓ 下一层入口开启', 1900);
      return;
    }
    if (pk.type === 'item') {
      this.stat.picks++;
      UI.openPickup(pk.item, pk);
    } else if (pk.type === 'chest') {
      pk.gone = true;
      Sfx.play('fuse');
      FX.burst(pk.x, pk.y, '#ffd24d', 20, 220, 0.5, 4);
      const luck = p.stats.luck;
      const n = rchance(0.35 + luck * 0.2) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const it = Loot.genItem(this.run.floor, { luck: luck + 0.35 });
        this.pickups.push(Entities.makePickup('item', pk.x + rrange(-40, 40), pk.y + rrange(20, 50), { item: it }));
      }
      for (let i = 0; i < rint(6, 10); i++)
        this.pickups.push(Entities.makePickup('coin', pk.x + rrange(-40, 40), pk.y + rrange(-40, 40), { val: Math.max(2, Math.round(rrange(2, 4 + this.run.floor * 0.3) * p.stats.goldFind)) }));
      this.cur.room.cleared = true;
      this.saveRun();
    } else if (pk.type === 'shrine') {
      const choices = this.rollBlessings();
      const shrinePk = pk;
      UI.openChoices('远古祭坛', '深渊回馈勇敢者 — 选择一项祝福', choices, b => {
        this.applyBlessing(b);
        shrinePk.gone = true;
        this.cur.room.cleared = true;
        UI.closeModal();
        this.saveRun();
      });
    } else if (pk.type === 'next') {
      this.nextFloor();
    }
  },

  checkDoor() {
    if (this.doorCd > 0) return;   // 门触发加冷却(边沿触发), 站在门洞里不会反复穿门
    const p = this.player, room = this.cur.room;
    const cy = ROOM_H / 2, cx = ROOM_W / 2;
    let dir = -1;
    if (p.x > ROOM_W - 46 && Math.abs(p.y - cy) < 52 && room.doors[0] != null) dir = 0;
    else if (p.x < 46 && Math.abs(p.y - cy) < 52 && room.doors[1] != null) dir = 1;
    else if (p.y > ROOM_H - 46 && Math.abs(p.x - cx) < 52 && room.doors[2] != null) dir = 2;
    else if (p.y < 46 && Math.abs(p.x - cx) < 52 && room.doors[3] != null) dir = 3;
    if (dir >= 0) {
      const to = room.doors[dir];
      this.doorCd = 0.3;
      this.transition(() => this.enterRoom(to, dir));
    }
  },

  transition(cb) {
    if (this.fadeDir !== 0 || this.fade >= 1) {
      // 已有过渡在飞行中: 直接执行, 但必须清掉挂起的回调 ——
      // 否则淡出完成时 afterFade 会再执行一次, 同一个房间被 enterRoom 两次
      //(怪物重新刷出、楼梯入口重新上锁), 玩家会以为"关卡被重置 / 卡住了"
      this.afterFade = null;
      cb();
      return;
    }
    this.afterFade = cb;
    this.fadeDir = 1;
  },

  collideRoom(ent) {
    let clamped = false;
    if (ent.x < 40) { ent.x = 40; clamped = true; }
    if (ent.x > ROOM_W - 40) { ent.x = ROOM_W - 40; clamped = true; }
    if (ent.y < 40) { ent.y = 40; clamped = true; }
    if (ent.y > ROOM_H - 40) { ent.y = ROOM_H - 40; clamped = true; }
    const obstacles = this.cur ? this.cur.room.obstacles : [];
    for (const o of obstacles) {
      const d = dist(ent.x, ent.y, o.x, o.y), rr = o.r + (ent.r || 12);
      if (d < rr && d > 0.01) {
        const push = (rr - d) / d;
        ent.x += (ent.x - o.x) * push;
        ent.y += (ent.y - o.y) * push;
      }
    }
    if (ent.x < 40) { ent.x = 40; clamped = true; }
    if (ent.x > ROOM_W - 40) { ent.x = ROOM_W - 40; clamped = true; }
    if (ent.y < 40) { ent.y = 40; clamped = true; }
    if (ent.y > ROOM_H - 40) { ent.y = ROOM_H - 40; clamped = true; }
    return clamped;
  },

  spawnItemPickup(x, y, item) {
    this.pickups.push(Entities.makePickup('item', x, y, { item: item || Loot.genItem(this.run.floor, { luck: this.player.stats.luck }) }));
  },

  // ---------- 死亡与结算 ----------
  onPlayerDown() {
    const p = this.player;
    if (this.revivesLeft() > 0) {
      p.revivesUsed++;
      p.hp = Math.round(p.maxHp * 0.6);
      p.iframes = 2.5;
      this.eprojs = [];
      for (const e of this.enemies) {
        if (!e.dead && dist(e.x, e.y, p.x, p.y) < 240) this.hitEnemy(e, e.maxHp * 0.3, { noCrit: true, noProc: true, silent: true });
      }
      UI.banner('不死鸟羽 · 复活!', `剩余复活:${this.revivesLeft()}`, 2200);
      Sfx.play('revive');
      FX.ring(p.x, p.y, '#ffd24d', 120, 0.7);
      return;
    }
    this.gameOver();
  },

  gameOver() {
    this.state = 'dead';
    UI.tutorialStop();
    const p = this.player;
    const st = Meta.data.stats;
    const record = this.run.floor > st.bestFloor;
    st.bestFloor = Math.max(st.bestFloor, this.run.floor);
    st.kills += p.kills;
    Meta.addSouls(p.souls);
    Meta.save();
    RunSave.clear();
    document.getElementById('hud').classList.add('hidden');
    UI.showDeath({ floor: this.run.floor, kills: p.kills, level: p.level, gold: p.gold, souls: p.souls, record });
  },

  abandonRun() {
    if (this.state !== 'play') return;
    this.gameOver();
  },

  togglePause(v) {
    if (this.state !== 'play' || this.modal) return;
    // 引导进行中: Esc 交给引导做"跳过", 不弹暂停菜单(避免两个界面打架)
    if (this.tutorial && this.tutorial.active) { UI.tutorialKey('Escape'); return; }
    this.paused = v === undefined ? !this.paused : v;
    UI.showPause(this.paused);
  },

  // ================= 渲染 =================
  render() {
    const cvs = document.getElementById('game');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cvs.width !== ROOM_W * dpr) { cvs.width = ROOM_W * dpr; cvs.height = ROOM_H * dpr; }
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ROOM_W, ROOM_H);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);

    if (this.state === 'menu') { this.renderMenuBg(ctx); return; }

    ctx.save();
    if (this.shake > 0) ctx.translate(rrange(-1, 1) * this.shake, rrange(-1, 1) * this.shake);

    if (this.roomBg) ctx.drawImage(this.roomBg, 0, 0);
    this.drawDoors(ctx);
    // 拾取物
    for (const pk of this.pickups) this.drawPickup(ctx, pk);
    // 敌人
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    // 玩家
    this.drawPlayer(ctx);
    // 弹幕
    this.drawProjs(ctx);
    // 自爆预警(地面渐变警示圈 + 转动虚线)
    for (const b of this.pendingBooms) {
      const prog = 1 - b.t / b.maxT;
      const gr = ctx.createRadialGradient(b.x, b.y, b.r * 0.1, b.x, b.y, b.r);
      gr.addColorStop(0, `rgba(255,160,90,${0.10 + prog * 0.20})`);
      gr.addColorStop(0.7, `rgba(255,90,60,${0.06 + prog * 0.12})`);
      gr.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,80,${0.5 + prog * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.3 + 0.7 * prog), 0, TAU); ctx.stroke();
      ctx.setLineDash([9, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, this.time * 1.6, this.time * 1.6 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
    // 奥术新星冲击波(加色光晕 + 双层环)
    for (const nv of this.novas) {
      const k = nv.r / nv.maxR;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * 0.35;
      const gz = nv.r * 0.7;
      ctx.drawImage(Tex.glow('#ffe9b0', 64), nv.x - gz, nv.y - gz, gz * 2, gz * 2);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,233,176,${(1 - k) * 0.9})`;
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(nv.x, nv.y, nv.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,210,77,${(1 - k) * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(nv.x, nv.y, nv.r * 0.85, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1;
    }
    FX.draw(ctx);
    ctx.restore();

    // 光照层(玩家径向光晕 + 静态光源, 远处压暗)
    this.drawLighting(ctx);
    // 光源辉光(火把/火盆/营火/水晶/传送门闪烁 + 玩家光环)
    this.drawGlowPass(ctx);
    // 环境粒子(尘埃 / 火星 / 飘灰)
    this.drawAmbient(ctx);
    // 后处理(强暗角 + 边缘 RGB 色偏 + 色彩分级)
    this.drawPost(ctx);
    // 攻击手感反馈 + 目标指引(后处理之后绘制, 保证清晰)
    this.drawCombatFeedback(ctx);
    this.drawGuidance(ctx);
    this.drawLastEnemyMark(ctx);
    // 新手引导会自己画 DOM 高亮, 这里只负责每帧同步进度
    if (this.tutorial) UI.tutorialFrame();
    // 低血量警示
    const p = this.player;
    if (p && p.hp / p.maxHp < 0.3 && this.state === 'play') {
      const a = 0.12 + Math.sin(this.time * 6) * 0.07;
      const g = ctx.createRadialGradient(ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.4, ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.8);
      g.addColorStop(0, 'rgba(255,40,30,0)');
      g.addColorStop(1, `rgba(255,40,30,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
    // 受击红闪
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,50,40,${this.hurtFlash * 0.16})`;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
    // 起点提示
    if (this.cur && this.cur.room.type === 'start' && this.run.floor === 1) {
      ctx.fillStyle = 'rgba(200,210,230,.6)';
      ctx.font = '15px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText('WASD 移动 · 鼠标左键射击 · 空格冲刺 · 清空房间后门才会开启', ROOM_W / 2, ROOM_H / 2 + 62);
      ctx.fillStyle = 'rgba(159,232,176,.75)';
      ctx.fillText('跟着绿色箭头走 → 找到 ↓ 楼梯房的光圈, 按 E 进入下一层', ROOM_W / 2, ROOM_H / 2 + 88);
      ctx.textAlign = 'left';
    }
    // 淡入淡出
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(3,4,8,${clamp(this.fade, 0, 1)})`;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
  },

  // 主菜单背景: 深渊穹顶 + 两层远景拱廊 + 光柱 + 浮尘火星 + 暗角
  renderMenuBg(ctx) {
    const W = ROOM_W, H = ROOM_H, t = this.time;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070f');
    g.addColorStop(0.42, '#0a1020');
    g.addColorStop(0.72, '#101a2e');
    g.addColorStop(1, '#05080f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W * 0.5, H * 0.58, 20, W * 0.5, H * 0.58, H * 0.78);
    rg.addColorStop(0, 'rgba(90,150,255,.16)');
    rg.addColorStop(0.45, 'rgba(60,90,190,.07)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    // 两层拱廊(越远越淡越冷 → 大气透视)
    this.menuArcade(ctx, H * 0.52, 9, 152, 'rgba(72,112,192,.15)', 1);
    this.menuArcade(ctx, H * 0.64, 7, 212, 'rgba(38,66,124,.30)', 2);
    // 地面反光
    const fg = ctx.createLinearGradient(0, H * 0.7, 0, H);
    fg.addColorStop(0, 'rgba(120,170,255,.05)');
    fg.addColorStop(0.5, 'rgba(60,90,150,.10)');
    fg.addColorStop(1, 'rgba(8,12,22,.55)');
    ctx.fillStyle = fg; ctx.fillRect(0, H * 0.7, W, H * 0.3);
    // 光柱
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.24) + Math.sin(t * 0.25 + i) * 26;
      const lg = ctx.createLinearGradient(x, 0, x + 70, H);
      lg.addColorStop(0, 'rgba(140,190,255,.10)');
      lg.addColorStop(0.55, 'rgba(110,160,240,.045)');
      lg.addColorStop(1, 'rgba(80,120,200,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - 34, 0); ctx.lineTo(x + 34, 0);
      ctx.lineTo(x + 112, H); ctx.lineTo(x + 16, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 浮尘 + 火星(固定池)
    if (!this.menuMotes) {
      this.menuMotes = [];
      for (let i = 0; i < 70; i++) {
        this.menuMotes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - .5) * 10, vy: -(6 + Math.random() * 26),
          s: .8 + Math.random() * 2.4, a: .1 + Math.random() * .5,
          ph: Math.random() * TAU, ember: Math.random() < .5,
        });
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.menuMotes) {
      m.x += m.vx * 0.016 + Math.sin(t * 1.2 + m.ph) * 0.35;
      m.y += m.vy * 0.016;
      if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
      if (m.x < -20) m.x = W + 20; else if (m.x > W + 20) m.x = -20;
      ctx.globalAlpha = m.a * (0.6 + Math.sin(t * 2.4 + m.ph) * 0.4);
      const s = m.s * (m.ember ? 3.4 : 4.2);
      ctx.drawImage(Tex.glow(m.ember ? '#ffab52' : '#a8c2f0', 16), m.x - s, m.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 暗角
    if (!this.menuVig) {
      const v = document.createElement('canvas');
      v.width = W; v.height = H;
      const vc = v.getContext('2d');
      const vg = vc.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.7, 'rgba(2,4,10,.35)');
      vg.addColorStop(1, 'rgba(1,2,6,.85)');
      vc.fillStyle = vg; vc.fillRect(0, 0, W, H);
      this.menuVig = v;
    }
    ctx.drawImage(this.menuVig, 0, 0);
  },

  // 主菜单远景拱廊剪影
  menuArcade(ctx, baseY, n, step, color, layer) {
    const W = ROOM_W;
    const x0 = (W - (n - 1) * step) / 2;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      const w = layer === 1 ? 26 : 42;
      const h = layer === 1 ? 196 : 262;
      ctx.fillRect(x - w / 2, baseY - h, w, h);
      ctx.beginPath();
      ctx.arc(x, baseY - h, w / 2, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(0, baseY - (layer === 1 ? 34 : 46), W, layer === 1 ? 16 : 24);
  },

  // ---------- 房间静态背景: 地面材质 + 装饰 + 伪 3D 墙体 + 障碍 ----------
  buildRoomBg() {
    const r = this.cur.room;
    const P = themeOf(r.type);
    const W = ROOM_W, H = ROOM_H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const rng = new RNG((this.run.seed ^ Math.imul(r.idx + 7, 0x85EBCA6B) ^ Math.imul(this.floorData.floor, 0xC2B2AE35)) >>> 0);

    // ---- 1. 地面: 预生成石板 pattern 平铺(零逐像素开销) ----
    ctx.fillStyle = ctx.createPattern(Tex.floorTile(r.type), 'repeat');
    ctx.fillRect(0, 0, W, H);

    // ---- 1b. 被踩出的土路(门 → 房间中心): 第二种地面材质 ----
    this.drawWornPaths(ctx, r, rng, P);
    // ---- 2. 大面积明暗: 潮湿/落尘/破损(高对比, 拉开地面层次) ----
    for (let i = 0; i < 36; i++) {
      const x = rng.range(30, W - 30), y = rng.range(30, H - 30), rad = rng.range(60, 215);
      const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
      const dark = rng.chance(0.6);
      g.addColorStop(0, dark ? `rgba(4,6,12,${rng.range(0.18, 0.44)})` : `rgba(${P.amb},${rng.range(0.05, 0.13)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    // ---- 2b. 低频大斑块(明/暗两极, 避免整片地面同一色阶) ----
    for (let i = 0; i < 12; i++) {
      const x = rng.range(-60, W + 60), y = rng.range(-60, H + 60), rad = rng.range(210, 430);
      const g = ctx.createRadialGradient(x, y, rad * 0.05, x, y, rad);
      const dark = rng.chance(0.58);
      g.addColorStop(0, dark ? `rgba(2,4,9,${rng.range(0.22, 0.42)})` : `rgba(${P.amb},${rng.range(0.06, 0.12)})`);
      g.addColorStop(0.55, dark ? 'rgba(2,4,9,.10)' : `rgba(${P.amb},.04)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    // ---- 2d. 全屋对角明暗渐变(与左上主光源一致, 大尺度铺开色阶) ----
    const ramp = ctx.createLinearGradient(0, 0, W, H);
    ramp.addColorStop(0, `rgba(${P.amb},.22)`);
    ramp.addColorStop(0.4, 'rgba(0,0,0,0)');
    ramp.addColorStop(1, 'rgba(2,3,7,.52)');
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, W, H);
    // ---- 2e. 烘焙环境遮蔽(离光源/中心越远越暗, 形成大尺度明暗层次) ----
    const ao2 = ctx.createRadialGradient(W * 0.36, H * 0.32, 90, W * 0.36, H * 0.32, W * 0.82);
    ao2.addColorStop(0, `rgba(${P.amb},.14)`);
    ao2.addColorStop(0.45, 'rgba(0,0,0,0)');
    ao2.addColorStop(1, 'rgba(2,4,10,.46)');
    ctx.fillStyle = ao2;
    ctx.fillRect(0, 0, W, H);
    // ---- 2c. 积水/湿渍(冷色, 提供色相变化) ----
    for (let i = 0; i < 7; i++) {
      const x = rng.range(80, W - 80), y = rng.range(80, H - 80);
      const rw = rng.range(34, 96), rh = rw * rng.range(0.42, 0.62), rot = rng.range(-0.3, 0.3);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, rw, rh, rot, 0, TAU); ctx.clip();
      const g = ctx.createRadialGradient(x - rw * 0.2, y - rh * 0.3, 2, x, y, rw);
      g.addColorStop(0, 'rgba(104,158,214,.22)');
      g.addColorStop(0.62, 'rgba(38,78,138,.15)');
      g.addColorStop(1, 'rgba(8,18,38,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rw, y - rh, rw * 2, rh * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(152,212,255,.10)';
      ctx.beginPath(); ctx.ellipse(x - rw * 0.25, y - rh * 0.35, rw * 0.4, rh * 0.22, rot, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(122,182,240,.11)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x, y, rw, rh, rot, 0, TAU); ctx.stroke();
    }
    // ---- 3. 地面裂纹(暗线 + 下缘高光 → 深度感) ----
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const pts = [];
      let cx = rng.range(40, W - 40), cy = rng.range(40, H - 40), a = rng.range(0, TAU);
      for (let k = 0; k < rng.int(3, 6); k++) {
        pts.push([cx, cy]);
        a += rng.range(-0.8, 0.8);
        cx += Math.cos(a) * rng.range(20, 52); cy += Math.sin(a) * rng.range(14, 34);
      }
      const path = () => { ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
      path(); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 3.4; ctx.stroke();
      path(); ctx.strokeStyle = `rgba(6,8,14,${rng.range(0.3, 0.55)})`; ctx.lineWidth = 1.9; ctx.stroke();
    }
    // ---- 4. 苔藓(零散) ----
    this.mossPatch(ctx, rng, P, 42, 6, 22);
    // ---- 5. 碎石瓦砾 ----
    for (let i = 0; i < 90; i++) {
      const x = rng.range(30, W - 30), y = rng.range(30, H - 30), rad = rng.range(1.4, 4.2);
      ctx.fillStyle = shadeHex(P.floor, rng.int(-26, 30));
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 0.7, rng.range(0, TAU), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(x, y + rad * 0.75, rad * 0.95, rad * 0.35, 0, 0, TAU); ctx.fill();
    }
    // ---- 6. 房间类型专属装饰 ----
    this.drawRoomDecor(ctx, r, rng, P);
    // ---- 7. 墙体(顶部受光/侧面暗/墙脚接触阴影) ----
    this.drawWalls(ctx, r, rng, P);
    // ---- 8. 障碍岩石 ----
    for (const o of r.obstacles) this.drawRock(ctx, o, rng, P);

    // ---- 9. 光源登记 + 光照静态层烘焙(每房间只做一次) ----
    this.setupLights(r, rng);
    this.buildLightStatic();
    this.roomBg = c;
  },

  // 被踩出的土路: 门 → 房间中心(第二种地面材质)
  // 做法: 先在离屏 canvas 上用软边带做掩膜, 再用 source-atop 只把"泥土材质"画进掩膜内,
  // 因此路面自带噪点/泥斑/碎石, 不会变成一条纯色带
  drawWornPaths(ctx, r, rng, P) {
    const W = ROOM_W, H = ROOM_H, cx = W / 2, cy = H / 2;
    const exits = [];
    if (r.doors[0] != null) exits.push([W + 10, cy]);
    if (r.doors[1] != null) exits.push([-10, cy]);
    if (r.doors[2] != null) exits.push([cx, H + 10]);
    if (r.doors[3] != null) exits.push([cx, -10]);
    if (!exits.length) exits.push([cx, -10]);

    const pc = document.createElement('canvas');
    pc.width = W; pc.height = H;
    const p = pc.getContext('2d');
    // 1) 掩膜
    p.lineCap = 'round';
    for (const [ex, ey] of exits) {
      const band = (w, a) => {
        p.strokeStyle = `rgba(255,255,255,${a})`;
        p.lineWidth = w;
        p.beginPath(); p.moveTo(ex, ey); p.lineTo(cx, cy); p.stroke();
      };
      band(76, 0.24); band(52, 0.40); band(30, 0.56);
    }
    const cg = p.createRadialGradient(cx, cy, 6, cx, cy, 78);
    cg.addColorStop(0, 'rgba(255,255,255,.44)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    p.fillStyle = cg;
    p.beginPath(); p.arc(cx, cy, 78, 0, TAU); p.fill();

    // 2) 只在掩膜内绘制泥土材质
    p.globalCompositeOperation = 'source-atop';
    const dg = p.createLinearGradient(0, 0, W, H);
    dg.addColorStop(0, '#463a2a');
    dg.addColorStop(0.5, '#5d4a33');
    dg.addColorStop(1, '#3c3023');
    p.fillStyle = dg;
    p.fillRect(0, 0, W, H);
    // 泥斑(明暗两极)
    for (let i = 0; i < 130; i++) {
      const [ex, ey] = exits[rng.int(0, exits.length - 1)];
      const t = rng.next();
      const bx = ex + (cx - ex) * t, by = ey + (cy - ey) * t;
      const ang = angleTo(ex, ey, cx, cy) + Math.PI / 2, off = rng.range(-40, 40);
      const x = bx + Math.cos(ang) * off, y = by + Math.sin(ang) * off;
      const rr = rng.range(6, 30);
      const g2 = p.createRadialGradient(x, y, 1, x, y, rr);
      const dark = rng.chance(0.55);
      g2.addColorStop(0, dark ? `rgba(28,22,14,${rng.range(.25, .55)})` : `rgba(178,152,110,${rng.range(.10, .26)})`);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      p.fillStyle = g2;
      p.beginPath(); p.arc(x, y, rr, 0, TAU); p.fill();
    }
    // 颗粒噪点
    p.globalAlpha = 0.6;
    p.fillStyle = p.createPattern(Tex.grain(128), 'repeat');
    p.fillRect(0, 0, W, H);
    p.globalAlpha = 1;
    // 碎石
    for (let i = 0; i < 320; i++) {
      const [ex, ey] = exits[rng.int(0, exits.length - 1)];
      const t = rng.next();
      const bx = ex + (cx - ex) * t, by = ey + (cy - ey) * t;
      const ang = angleTo(ex, ey, cx, cy) + Math.PI / 2, off = rng.range(-36, 36);
      const x = bx + Math.cos(ang) * off, y = by + Math.sin(ang) * off;
      const dark = rng.chance(0.5);
      p.fillStyle = dark ? `rgba(30,24,16,${rng.range(.25, .5)})` : `rgba(196,178,146,${rng.range(.10, .28)})`;
      const rr = rng.range(1.4, 4.6);
      p.beginPath(); p.ellipse(x, y, rr, rr * rng.range(.55, 1), rng.range(0, TAU), 0, TAU); p.fill();
    }
    p.globalCompositeOperation = 'source-over';
    ctx.drawImage(pc, 0, 0);
  },

  // 苔藓斑块(簇状, 避免规则圆点)
  mossPatch(ctx, rng, P, count, smin, smax) {
    for (let i = 0; i < count; i++) {
      const x = rng.range(22, ROOM_W - 22), y = rng.range(22, ROOM_H - 22), s = rng.range(smin, smax);
      ctx.fillStyle = P.moss;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x + rng.range(-s, s), y + rng.range(-s * 0.55, s * 0.55),
          s * rng.range(0.28, 0.62), s * rng.range(0.18, 0.42), rng.range(0, TAU), 0, TAU);
        ctx.fill();
      }
    }
  },

  // 房间类型专属地面装饰
  drawRoomDecor(ctx, r, rng, P) {
    const W = ROOM_W, H = ROOM_H, cx = W / 2, cy = H / 2;
    if (r.type === 'start') {
      // 营火遗迹: 焦土 + 石圈 + 交叉木柴
      const fx = cx, fy = H * 0.70;
      const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, 96);
      g.addColorStop(0, 'rgba(0,0,0,.55)');
      g.addColorStop(0.45, 'rgba(22,13,6,.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, 96, 0, TAU); ctx.fill();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + rng.range(-0.1, 0.1), rr = rng.range(30, 38);
        const px = fx + Math.cos(a) * rr, py = fy + Math.sin(a) * rr * 0.72;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(px, py + 3, 7.5, 2.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shadeHex(P.wallTop, rng.int(-24, 12));
        ctx.beginPath(); ctx.ellipse(px, py, rng.range(6, 9), rng.range(4.5, 6.5), a, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI + rng.range(-0.2, 0.2);
        ctx.strokeStyle = '#3d2b19'; ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(fx - Math.cos(a) * 23, fy - Math.sin(a) * 15);
        ctx.lineTo(fx + Math.cos(a) * 23, fy + Math.sin(a) * 15);
        ctx.stroke();
        ctx.strokeStyle = '#5d4325'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fx - Math.cos(a) * 21, fy - Math.sin(a) * 13);
        ctx.lineTo(fx + Math.cos(a) * 21, fy + Math.sin(a) * 13);
        ctx.stroke();
      }
      this.floorDebris(ctx, rng, 16, 6);
    } else if (r.type === 'treasure') {
      // 财宝房: 金色台座光晕 + 散落钱币
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 155);
      g.addColorStop(0, 'rgba(255,206,110,.20)');
      g.addColorStop(0.5, 'rgba(255,180,70,.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 155, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,110,.22)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 74, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, 58, 0, TAU); ctx.stroke();
      for (let i = 0; i < 30; i++) {
        const a = rng.range(0, TAU), rr = rng.range(70, 280);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.62;
        ctx.fillStyle = `rgba(255,${rng.int(190, 228)},${rng.int(60, 125)},${rng.range(.18, .5)})`;
        ctx.beginPath(); ctx.ellipse(px, py, rng.range(2.5, 5), rng.range(1.4, 2.4), rng.range(0, TAU), 0, TAU); ctx.fill();
      }
    } else if (r.type === 'shrine') {
      // 祭坛房: 法阵 + 符文刻痕
      const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 165);
      g.addColorStop(0, 'rgba(120,210,255,.18)');
      g.addColorStop(0.55, 'rgba(90,160,255,.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 165, 0, TAU); ctx.fill();
      for (const rr of [52, 74, 96]) {
        ctx.strokeStyle = `rgba(140,216,255,${rr === 74 ? 0.3 : 0.17})`;
        ctx.lineWidth = rr === 74 ? 3 : 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        ctx.save(); ctx.translate(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96); ctx.rotate(a);
        ctx.strokeStyle = 'rgba(160,230,255,.26)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(6, 0); ctx.lineTo(-6, 5); ctx.stroke();
        ctx.restore();
      }
    } else if (r.type === 'boss') {
      // 领主房: 深渊裂缝 + 骨堆
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 270);
      g.addColorStop(0, 'rgba(255,60,40,.22)');
      g.addColorStop(0.4, 'rgba(180,30,30,.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 270, 0, TAU); ctx.fill();
      for (let i = 0; i < 16; i++) {
        const pts = [];
        let px = cx + rng.range(-90, 90), py = cy + rng.range(-70, 70), a = rng.range(0, TAU);
        for (let k = 0; k < 4; k++) {
          pts.push([px, py]);
          a += rng.range(-0.7, 0.7);
          px += Math.cos(a) * rng.range(22, 54); py += Math.sin(a) * rng.range(16, 36);
        }
        const path = () => { ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
        path(); ctx.strokeStyle = `rgba(255,70,45,${rng.range(.2, .5)})`; ctx.lineWidth = rng.range(2, 5.5); ctx.stroke();
        path(); ctx.strokeStyle = `rgba(255,170,120,${rng.range(.15, .38)})`; ctx.lineWidth = 1.2; ctx.stroke();
      }
      for (let i = 0; i < 20; i++) {
        const a = rng.range(0, TAU), rr = rng.range(110, 300);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.66;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rng.range(0, TAU));
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(0, 3, 9, 2.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(226,222,206,.30)';
        ctx.beginPath(); ctx.roundRect(-9, -2, 18, 4, 2); ctx.fill();
        ctx.restore();
      }
    } else if (r.type === 'stairs') {
      // 楼梯房: 绿光裂隙
      const g = ctx.createRadialGradient(cx, H * 0.62, 8, cx, H * 0.62, 225);
      g.addColorStop(0, 'rgba(140,255,180,.18)');
      g.addColorStop(0.5, 'rgba(80,200,140,.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, H * 0.62, 225, 0, TAU); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(150,255,190,${0.22 - i * 0.035})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, H * 0.62, 46 + i * 26, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
    } else {
      // 普通战斗房: 散落骸骨 + 破损木料
      this.floorDebris(ctx, rng, 20, 7);
    }
  },

  // 地面杂项: 骸骨 + 破损木料(纯装饰, 不参与碰撞)
  floorDebris(ctx, rng, nBone, nWood) {
    const W = ROOM_W, H = ROOM_H;
    for (let i = 0; i < nBone; i++) {
      const x = rng.range(80, W - 80), y = rng.range(80, H - 80);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng.range(0, TAU));
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.roundRect(-8, 1.4, 16, 3.2, 1.6); ctx.fill();
      ctx.fillStyle = `rgba(214,210,196,${rng.range(.12, .26)})`;
      ctx.beginPath(); ctx.roundRect(-8, -1.6, 16, 3.2, 1.6); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < nWood; i++) {
      const x = rng.range(90, W - 90), y = rng.range(90, H - 90), a = rng.range(0, TAU), len = rng.range(26, 58);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.beginPath(); ctx.roundRect(-len / 2, 2.6, len, 5, 2); ctx.fill();
      ctx.fillStyle = `rgba(${rng.int(86, 116)},${rng.int(64, 86)},${rng.int(40, 58)},.75)`;
      ctx.beginPath(); ctx.roundRect(-len / 2, 0, len, 5.4, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,236,200,.10)';
      ctx.beginPath(); ctx.roundRect(-len / 2, 0, len, 1.6, 1); ctx.fill();
      ctx.restore();
    }
  },

  // 伪 3D 墙体: 外缘压暗 / 顶部受光面 / 内侧亮棱 / 墙脚接触阴影 / 苔藓裂纹
  drawWalls(ctx, r, rng, P) {
    const W = ROOM_W, H = ROOM_H, T = 26;
    // 砖纹平铺
    ctx.fillStyle = ctx.createPattern(Tex.wallTile(r.type), 'repeat');
    ctx.fillRect(0, 0, W, T);
    ctx.fillRect(0, H - T, W, T);
    ctx.fillRect(0, 0, T, H);
    ctx.fillRect(W - T, 0, T, H);

    // 立体明暗(主光源方向: 左上)
    const lin = (x0, y0, x1, y1, stops) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach(s => g.addColorStop(s[0], s[1]));
      return g;
    };
    ctx.fillStyle = lin(0, 0, 0, T, [[0, 'rgba(0,0,0,.62)'], [0.34, 'rgba(0,0,0,.18)'], [0.76, 'rgba(255,255,255,.09)'], [1, 'rgba(255,255,255,.15)']]);
    ctx.fillRect(0, 0, W, T);
    ctx.fillStyle = lin(0, H - T, 0, H, [[0, 'rgba(255,255,255,.10)'], [0.3, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,.7)']]);
    ctx.fillRect(0, H - T, W, T);
    ctx.fillStyle = lin(0, 0, T, 0, [[0, 'rgba(0,0,0,.6)'], [0.34, 'rgba(0,0,0,.16)'], [0.78, 'rgba(255,255,255,.08)'], [1, 'rgba(255,255,255,.14)']]);
    ctx.fillRect(0, 0, T, H);
    ctx.fillStyle = lin(W - T, 0, W, 0, [[0, 'rgba(255,255,255,.09)'], [0.3, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,.68)']]);
    ctx.fillRect(W - T, 0, T, H);

    // 内侧亮棱: 左/上受光, 右/下压暗
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(214,232,255,.16)';
    ctx.beginPath(); ctx.moveTo(T + 0.5, T + 0.5); ctx.lineTo(W - T - 0.5, T + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(T + 0.5, T + 0.5); ctx.lineTo(T + 0.5, H - T - 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.moveTo(T + 0.5, H - T - 0.5); ctx.lineTo(W - T - 0.5, H - T - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - T - 0.5, T + 0.5); ctx.lineTo(W - T - 0.5, H - T - 0.5); ctx.stroke();

    // 墙脚接触阴影(向房间内渐隐 → 厚度/凹陷感)
    const ao = 30;
    const aoFill = (x0, y0, x1, y1, bx, by, bw, bh) => {
      const g = lin(x0, y0, x1, y1, [[0, 'rgba(0,0,0,.6)'], [0.42, 'rgba(0,0,0,.25)'], [1, 'rgba(0,0,0,0)']]);
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
    };
    aoFill(0, T, 0, T + ao, 0, T, W, ao);
    aoFill(0, H - T, 0, H - T - ao, 0, H - T - ao, W, ao);
    aoFill(T, 0, T + ao, 0, T, 0, ao, H);
    aoFill(W - T, 0, W - T - ao, 0, W - T - ao, 0, ao, H);

    // 墙脚苔藓
    for (let i = 0; i < 130; i++) {
      const side = rng.int(0, 3), s = rng.range(5, 17);
      let x, y;
      if (side === 0) { x = rng.range(20, W - 20); y = T + rng.range(-4, 11); }
      else if (side === 1) { x = rng.range(20, W - 20); y = H - T + rng.range(-11, 4); }
      else if (side === 2) { x = T + rng.range(-4, 11); y = rng.range(20, H - 20); }
      else { x = W - T + rng.range(-11, 4); y = rng.range(20, H - 20); }
      ctx.fillStyle = P.moss;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x + rng.range(-s, s), y + rng.range(-s * 0.6, s * 0.6),
          s * rng.range(0.25, 0.6), s * rng.range(0.18, 0.4), rng.range(0, TAU), 0, TAU);
        ctx.fill();
      }
    }
    // 墙体裂纹
    for (let i = 0; i < 24; i++) {
      const side = rng.int(0, 3);
      let x = side < 2 ? rng.range(40, W - 40) : (side === 2 ? rng.range(2, T) : W - T + rng.range(0, T));
      let y = side < 2 ? (side === 0 ? rng.range(2, T) : H - T + rng.range(0, T)) : rng.range(40, H - 40);
      ctx.strokeStyle = `rgba(0,0,0,${rng.range(.3, .6)})`;
      ctx.lineWidth = rng.range(1, 2.2);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += rng.range(-16, 16); y += rng.range(-9, 9); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // 四角石柱
    for (const [px, py] of [[T + 3, T + 3], [W - T - 3, T + 3], [T + 3, H - T - 3], [W - T - 3, H - T - 3]]) {
      const g2 = ctx.createRadialGradient(px - 9, py - 9, 2, px, py, 34);
      g2.addColorStop(0, shadeHex(P.wallTop, 18));
      g2.addColorStop(0.6, shadeHex(P.wall, 2));
      g2.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(px, py, 24, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.42)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  },

  // 障碍岩石: 接触阴影 + 渐变体块 + 受光高光 + 暗面 + 苔藓
  drawRock(ctx, o, rng, P) {
    const orng = new RNG(o.seed);
    ctx.drawImage(Tex.shadow(), o.x - o.r * 1.5, o.y - o.r * 0.6, o.r * 3, o.r * 1.9);
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, rr = o.r * orng.range(0.76, 1.14);
      pts.push([o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.86]);
    }
    const path = () => {
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
    };
    path();
    ctx.save();
    ctx.clip();
    const bx = o.x - o.r * 1.3, by = o.y - o.r * 1.3, bs = o.r * 2.6;
    const g = ctx.createRadialGradient(o.x - o.r * 0.45, o.y - o.r * 0.55, o.r * 0.1, o.x + o.r * 0.1, o.y + o.r * 0.2, o.r * 1.4);
    g.addColorStop(0, shadeHex(P.wallTop, 24));
    g.addColorStop(0.45, shadeHex(P.wall, 8));
    g.addColorStop(1, '#080b13');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bs, bs);
    // 左上受光高光
    const hg = ctx.createRadialGradient(o.x - o.r * 0.45, o.y - o.r * 0.6, 0, o.x - o.r * 0.3, o.y - o.r * 0.4, o.r * 1.05);
    hg.addColorStop(0, 'rgba(214,232,255,.32)');
    hg.addColorStop(1, 'rgba(214,232,255,0)');
    ctx.fillStyle = hg; ctx.fillRect(bx, by, bs, bs);
    // 右下暗面
    const dg = ctx.createRadialGradient(o.x + o.r * 0.5, o.y + o.r * 0.6, 0, o.x + o.r * 0.4, o.y + o.r * 0.5, o.r * 1.25);
    dg.addColorStop(0, 'rgba(0,0,0,.58)');
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dg; ctx.fillRect(bx, by, bs, bs);
    // 棱线
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = orng.range(0, TAU);
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a) * o.r * 0.15, o.y + Math.sin(a) * o.r * 0.15);
      ctx.lineTo(o.x + Math.cos(a) * o.r * 0.95, o.y + Math.sin(a) * o.r * 0.8);
      ctx.stroke();
    }
    // 苔藓顶盖
    ctx.fillStyle = P.moss;
    ctx.beginPath();
    ctx.ellipse(o.x - o.r * 0.15, o.y - o.r * 0.42, o.r * 0.55, o.r * 0.3, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 外轮廓
    path();
    ctx.strokeStyle = 'rgba(4,6,11,.8)'; ctx.lineWidth = 2.2; ctx.stroke();
    // 周围碎石
    for (let i = 0; i < 7; i++) {
      const a = orng.range(0, TAU), rr = o.r * orng.range(1.05, 1.5);
      const px = o.x + Math.cos(a) * rr, py = o.y + Math.sin(a) * rr * 0.8;
      ctx.fillStyle = shadeHex(P.wall, orng.int(-14, 16));
      ctx.beginPath(); ctx.ellipse(px, py, orng.range(2, 5), orng.range(1.4, 3.2), orng.range(0, TAU), 0, TAU); ctx.fill();
    }
  },

  // 登记静态光源(火把/火盆/营火/水晶/传送门) + 初始化环境粒子池
  setupLights(r, rng) {
    const W = ROOM_W, H = ROOM_H;
    this.lights = [];
    this.flames = [];
    this.campfire = null; this.crystal = null; this.portal = null;
    const addLight = (x, y, rad, color, a, kind) => {
      const L = { x, y, r: rad, color, a, kind, ph: rng.range(0, TAU), sp: rng.range(4.4, 7.6) };
      this.lights.push(L);
      return L;
    };
    // 墙面火把(位置避开四边门洞中央 ±70)
    const spots = [
      [W * 0.24, 14], [W * 0.76, 14],
      [W * 0.24, H - 14], [W * 0.76, H - 14],
      [14, H * 0.32], [14, H * 0.68],
      [W - 14, H * 0.32], [W - 14, H * 0.68],
    ];
    const nTorch = r.type === 'start' ? 2 : 6;
    for (let i = 0; i < spots.length && i < nTorch; i++) {
      const x = spots[i][0], y = spots[i][1];
      this.flames.push({ x, y, ph: rng.range(0, TAU), s: rng.range(0.85, 1.15) });
      addLight(x, y, 142, '#ffb15c', 0.52, 'fire');
    }
    // 房间主光
    if (r.type === 'start') {
      this.campfire = { x: W / 2, y: H * 0.70, ph: rng.range(0, TAU) };
      this.flames.push({ x: W / 2, y: H * 0.70 - 6, ph: this.campfire.ph, s: 1.9 });
      addLight(W / 2, H * 0.70, 186, '#ffab52', 0.6, 'fire');
    } else if (r.type === 'treasure') {
      addLight(W / 2, H / 2, 215, '#ffd24d', 0.44, 'gold');
    } else if (r.type === 'shrine') {
      this.crystal = { x: W / 2, y: H / 2, ph: rng.range(0, TAU) };
      addLight(W / 2, H / 2, 220, '#7ed4ff', 0.48, 'magic');
    } else if (r.type === 'boss') {
      addLight(W / 2, H / 2, 280, '#ff5a46', 0.4, 'magic');
      for (const [px, py] of [[104, 104], [W - 104, 104], [104, H - 104], [W - 104, H - 104]]) {
        this.flames.push({ x: px, y: py, ph: rng.range(0, TAU), s: 1.5 });
        addLight(px, py, 168, '#ff8c3c', 0.52, 'fire');
      }
    } else if (r.type === 'stairs') {
      this.portal = { x: W / 2, y: H * 0.62, ph: rng.range(0, TAU) };
      addLight(W / 2, H * 0.62, 225, '#8cffb4', 0.44, 'magic');
    }
    // 环境粒子固定池(不动态 new; 数量与光照层分辨率一样按性能预算固定)
    if (!this.ambient.length) {
      for (let i = 0; i < 60; i++) this.ambient.push({ x: 0, y: 0, vx: 0, vy: 0, s: 1, a: .1, ph: 0, kind: 'dust', life: 1, t: 0, color: '#a8c2f0' });
    }
    for (let i = 0; i < this.ambient.length; i++) {
      const m = this.ambient[i];
      m.kind = i % 5 === 0 ? 'ember' : (i % 7 === 3 ? 'ash' : 'dust');
      this.respawnAmbient(m, true);
    }
  },

  // 粒子复活(火星优先从火源附近升起)
  respawnAmbient(m, init) {
    const r = Math.random;
    if (m.kind === 'ember') {
      const fires = this.lights.filter(L => L.kind === 'fire');
      const L = fires.length ? fires[Math.floor(r() * fires.length)] : null;
      m.x = L ? L.x + (r() - 0.5) * 46 : r() * ROOM_W;
      m.y = L ? L.y + (r() - 0.5) * 26 : r() * ROOM_H;
      m.vy = -(18 + r() * 36); m.vx = (r() - 0.5) * 16;
      m.s = 1.1 + r() * 2.2; m.a = 0.3 + r() * 0.5;
      m.life = 1.6 + r() * 2.6;
      m.color = r() < 0.5 ? '#ffb45c' : '#ff7a3c';
    } else if (m.kind === 'ash') {
      m.x = r() * ROOM_W; m.y = init ? r() * ROOM_H : -12;
      m.vy = 12 + r() * 26; m.vx = (r() - 0.5) * 26;
      m.s = 0.8 + r() * 1.6; m.a = 0.1 + r() * 0.16;
      m.life = 6 + r() * 8;
      m.color = '#c8c2b4';
    } else {
      m.x = r() * ROOM_W; m.y = r() * ROOM_H;
      m.vy = -(4 + r() * 12); m.vx = (r() - 0.5) * 12;
      m.s = 0.9 + r() * 2.4; m.a = 0.05 + r() * 0.12;
      m.life = 8 + r() * 10;
      m.color = '#a8c2f0';
    }
    m.ph = r() * TAU; m.t = 0;
  },

  updateAmbient(dt) {
    const list = this.ambient;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      m.t += dt;
      m.x += (m.vx + Math.sin(this.time * 1.1 + m.ph) * 9) * dt;
      m.y += m.vy * dt;
      if (m.t > m.life || m.y < -20 || m.y > ROOM_H + 20 || m.x < -20 || m.x > ROOM_W + 20) this.respawnAmbient(m, false);
    }
  },

  // 光照静态层: 1/4 分辨率, 全屏暗色 + 挖出静态光洞; 每房间只烘焙一次
  buildLightStatic() {
    const S = this._lightScale;
    const w = Math.max(1, Math.ceil(ROOM_W * S)), h = Math.max(1, Math.ceil(ROOM_H * S));
    if (!this.lightStatic) this.lightStatic = document.createElement('canvas');
    if (!this.lightWork) this.lightWork = document.createElement('canvas');
    this.lightStatic.width = w; this.lightStatic.height = h;
    this.lightWork.width = w; this.lightWork.height = h;
    const c = this.lightStatic.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.fillStyle = themeOf(this.cur.room.type).dark;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    for (const L of this.lights) {
      const rr = L.r * S;
      c.drawImage(Tex.hole(), L.x * S - rr, L.y * S - rr, rr * 2, rr * 2);
    }
    c.globalCompositeOperation = 'source-over';
  },

  // 每帧光照: 复制静态层 → 挖出玩家光洞(不重建 gradient) → 放大回主画布
  drawLighting(ctx) {
    const work = this.lightWork;
    if (!work || !this.lightStatic) return;
    const S = this._lightScale;
    const w = work.width, h = work.height;
    const c = work.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.drawImage(this.lightStatic, 0, 0);
    const p = this.player;
    if (p && this.state === 'play') {
      // 光晕呼吸/闪烁: 只改绘制尺寸与 alpha, 不重建渐变对象
      const breathe = 0.93 + Math.sin(this.time * 2.6) * 0.035 + Math.sin(this.time * 8.3) * 0.02;
      const R = 300 * breathe * S;
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(Tex.hole(), p.x * S - R, p.y * S - R, R * 2, R * 2);
      c.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(work, 0, 0, ROOM_W, ROOM_H);
  },

  // 光源辉光: 火把/火盆/营火/水晶/传送门闪烁 + 玩家光环, 全部 lighter 叠加
  drawGlowPass(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      const fl = 0.82 + Math.sin(this.time * L.sp + L.ph) * 0.1 + Math.sin(this.time * L.sp * 2.7 + L.ph) * 0.06;
      const r = L.r * 0.78;
      ctx.globalAlpha = L.a * fl;
      ctx.drawImage(Tex.glow(L.color, 64), L.x - r, L.y - r, r * 2, r * 2);
    }
    // 火苗本体(闪烁)
    for (const f of this.flames) {
      const fl = 0.78 + Math.sin(this.time * 9 + f.ph) * 0.15 + Math.sin(this.time * 22 + f.ph) * 0.07;
      const r = 15 * f.s * fl;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(Tex.glow('#fff0c0', 32), f.x - r * 0.7, f.y - r * 0.9, r * 1.4, r * 1.8);
      ctx.globalAlpha = 0.5;
      const r2 = r * 2.1;
      ctx.drawImage(Tex.glow('#ff9a3c', 32), f.x - r2, f.y - r2, r2 * 2, r2 * 2);
    }
    // 玩家光环(冷色, 让角色从地面浮出来)
    const p = this.player;
    if (p && this.state === 'play') {
      ctx.globalAlpha = 0.22 + Math.sin(this.time * 2.6) * 0.03;
      const r = 96;
      ctx.drawImage(Tex.glow('#8fc4ff', 64), p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  // 环境粒子: 尘埃 / 火星 / 飘灰(固定池, lighter 叠加)
  drawAmbient(ctx) {
    const list = this.ambient;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const k = m.t / m.life;
      const fade = k < 0.15 ? k / 0.15 : (k > 0.8 ? (1 - k) / 0.2 : 1);
      const a = m.a * fade * (0.7 + Math.sin(this.time * 3 + m.ph) * 0.3);
      if (a <= 0.012) continue;
      ctx.globalAlpha = a;
      const s = m.s * (m.kind === 'ember' ? 2.8 : 3.4);
      ctx.drawImage(Tex.glow(m.color, 16), m.x - s, m.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  // 后处理层: 按房间类型烘焙一次(暗角 + 边缘色差 + 色彩分级 + 雾),
  // 每帧只做 1 次全屏合成, 避免每帧 4 次全屏叠加带来的掉帧
  buildPostLayer(type) {
    if (!this._postLayers) this._postLayers = Object.create(null);
    const hit = this._postLayers[type];
    if (hit) return hit;
    const P = themeOf(type);
    const c = document.createElement('canvas');
    c.width = ROOM_W; c.height = ROOM_H;
    const p = c.getContext('2d');
    // 1) 强暗角(冷黑 + 边缘偏蓝)
    const g = p.createRadialGradient(ROOM_W * 0.5, ROOM_H * 0.52, ROOM_H * 0.3, ROOM_W * 0.5, ROOM_H * 0.52, ROOM_H * 0.95);
    g.addColorStop(0, 'rgba(2,4,10,0)');
    g.addColorStop(0.52, 'rgba(2,4,10,.13)');
    g.addColorStop(0.78, 'rgba(2,4,10,.44)');
    g.addColorStop(1, 'rgba(1,2,6,.84)');
    p.fillStyle = g;
    p.fillRect(0, 0, ROOM_W, ROOM_H);
    const cg = p.createRadialGradient(ROOM_W * 0.5, ROOM_H * 0.5, ROOM_H * 0.42, ROOM_W * 0.5, ROOM_H * 0.5, ROOM_H);
    cg.addColorStop(0, 'rgba(40,80,160,0)');
    cg.addColorStop(1, 'rgba(52,92,186,.10)');
    p.fillStyle = cg;
    p.fillRect(0, 0, ROOM_W, ROOM_H);
    // 2) 边缘 RGB 色偏(左偏红 / 右偏青, 只保留画面边缘)
    const ab = document.createElement('canvas');
    ab.width = ROOM_W; ab.height = ROOM_H;
    const ac = ab.getContext('2d');
    const lg = ac.createLinearGradient(0, 0, ROOM_W, 0);
    lg.addColorStop(0, 'rgba(255,64,64,.55)');
    lg.addColorStop(0.3, 'rgba(255,64,64,0)');
    lg.addColorStop(0.7, 'rgba(64,146,255,0)');
    lg.addColorStop(1, 'rgba(64,146,255,.55)');
    ac.fillStyle = lg; ac.fillRect(0, 0, ROOM_W, ROOM_H);
    ac.globalCompositeOperation = 'destination-in';
    const mg = ac.createRadialGradient(ROOM_W * 0.5, ROOM_H * 0.5, ROOM_H * 0.34, ROOM_W * 0.5, ROOM_H * 0.5, ROOM_H * 0.84);
    mg.addColorStop(0, 'rgba(0,0,0,0)');
    mg.addColorStop(0.6, 'rgba(0,0,0,.35)');
    mg.addColorStop(1, 'rgba(0,0,0,1)');
    ac.fillStyle = mg; ac.fillRect(0, 0, ROOM_W, ROOM_H);
    p.globalCompositeOperation = 'lighter';
    p.globalAlpha = 0.45;
    p.drawImage(ab, 0, 0);
    p.globalAlpha = 1;
    p.globalCompositeOperation = 'source-over';
    // 3) 色彩分级 + 空气雾(按房间冷暖)
    p.fillStyle = P.grade; p.fillRect(0, 0, ROOM_W, ROOM_H);
    p.fillStyle = P.fog; p.fillRect(0, 0, ROOM_W, ROOM_H);
    this._postLayers[type] = c;
    return c;
  },

  drawPost(ctx) {
    ctx.drawImage(this.buildPostLayer(this.cur ? this.cur.room.type : 'combat'), 0, 0);
  },

  // ---------- 攻击手感反馈(画在后处理之上, 保证清晰可读) ----------
  // 枪口闪光 / 武器冷却环(看得见"什么时候能再开火") / 准星命中标记(打中立刻有反馈)
  drawCombatFeedback(ctx) {
    const p = this.player;
    if (!p || this.state !== 'play') return;
    // 1) 枪口闪光
    if (p.muzzleT > 0) {
      const k = clamp(p.muzzleT / 0.1, 0, 1);
      const w = Loot.itemBase(p.weapon);
      const col = (w && w.color) || '#7ec8ff';
      const mx = p.x + Math.cos(p.aimA) * 24, my = p.y + Math.sin(p.aimA) * 24;
      const gr = 24 + (1 - k) * 18;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * 0.8;
      ctx.drawImage(Tex.glow(col, 64), mx - gr, my - gr, gr * 2, gr * 2);
      ctx.restore();
    }
    // 2) 冷却环
    const iv = Math.max(0.0001, Loot.weaponInterval(p));
    const cd = clamp(p.fireCd / iv, 0, 1);
    const r = p.r + 13;
    ctx.save();
    if (cd > 0.004) {
      ctx.strokeStyle = 'rgba(8,12,20,.5)';
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,215,255,.9)';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + (1 - cd) * TAU); ctx.stroke();
    } else if (p.readyT > 0) {
      const k = clamp(p.readyT / 0.16, 0, 1);
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = '#d8f0ff';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + (1 - k) * 5, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // 3) 准星命中标记
    if (this.hitMarkT > 0) {
      const a = clamp(this.hitMarkT / 0.14, 0, 1);
      const mx = this.input.mx, my = this.input.my;
      const d = 7 + (1 - a) * 5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const s of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(mx + s[0] * d, my + s[1] * d);
        ctx.lineTo(mx + s[0] * (d + 7), my + s[1] * (d + 7));
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  // ---------- 最后一个敌人高亮(画在后处理之上, 不被光照/暗角压暗) ----------
  // 房间只剩 1 只敌人时: 金色脉冲光圈 + 旋转虚线描边 + 上方下坠箭头(程序化绘制)。
  // 本作单房间整屏显示(无镜头滚动), 怪一定在屏内 —— 高亮解决的是"注意到它", 不是"找路";
  // 状态置位瞬间的一次性镜头震动见 update() 中的 _lastOne 过渡检测。
  drawLastEnemyMark(ctx) {
    if (!this._lastOne || this.state !== 'play' || !this.enemies.length) return;
    const e = this.enemies[0];
    if (!e || e.dead) return;
    const pulse = 0.5 + Math.sin(this.time * 5.2) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 地面辉光
    ctx.globalAlpha = 0.26 + pulse * 0.2;
    const gr = e.r + 34 + pulse * 6;
    ctx.drawImage(Tex.glow('#ffe08a', 64), e.x - gr, e.y - gr, gr * 2, gr * 2);
    // 旋转虚线描边圈
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = `rgba(255,224,138,${0.55 + pulse * 0.4})`;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 42;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + pulse * 3, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(255,224,138,${0.3 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 18 + pulse * 5, 0, TAU); ctx.stroke();
    // 上方下坠箭头
    const bob = Math.sin(this.time * 4.6) * 4;
    const ay = e.y - e.r - 34 + bob;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe08a';
    ctx.strokeStyle = 'rgba(30,18,2,.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(e.x - 10, ay - 13); ctx.lineTo(e.x + 10, ay - 13); ctx.lineTo(e.x, ay);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  },

  // ---------- 目标指引(画在后处理之上, 任何地面上都清晰) ----------
  // 1) 楼梯房/领主房里的"下一层"入口: 光圈 + 文字 + 不可用原因
  // 2) 不在目标房间时: 玩家身边的目标方向箭头 + "下一层(方向)"文字
  drawGuidance(ctx) {
    const cur = this.cur, p = this.player;
    if (!cur || !p || this.state !== 'play') return;
    const pk = cur.exitPk || this.pickups.find(q => q.type === 'next');
    if (pk) {
      const locked = cur.locked;
      const portal = !!pk.portal;
      const pulse = 0.5 + Math.sin(this.time * 3.4) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (!locked) {
        ctx.globalAlpha = 0.3 + pulse * 0.3;
        const g1 = 96 + pulse * 14;
        ctx.drawImage(Tex.glow(portal ? '#a98cff' : '#9fe8b0', 64), pk.x - g1, pk.y - g1, g1 * 2, g1 * 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = portal ? `rgba(226,214,255,${0.55 + pulse * 0.4})` : `rgba(200,255,214,${0.55 + pulse * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(pk.x, pk.y, 40 + pulse * 7, 25 + pulse * 5, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = portal ? `rgba(169,140,255,${0.3 + pulse * 0.3})` : `rgba(159,232,176,${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(pk.x, pk.y, 56 + pulse * 9, 35 + pulse * 6, 0, 0, TAU); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.18 + pulse * 0.14;
        const g1 = 82;
        ctx.drawImage(Tex.glow('#ff6b57', 64), pk.x - g1, pk.y - g1, g1 * 2, g1 * 2);
      }
      ctx.restore();
      const bob = Math.sin(this.time * 3.2) * 5;
      const txt = locked ? '↓ 下一层入口 · 封印中(清空敌人后开启)'
        : (portal ? '✦ 深渊之门 · 走上漩涡按 [E] 跃迁' : '↓ 下一层入口 · 走进光圈按 [E]');
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px "Microsoft YaHei", sans-serif';
      const wpx = ctx.measureText(txt).width;
      const bx = pk.x - wpx / 2 - 13, by = pk.y - 96 + bob;
      ctx.fillStyle = 'rgba(4,9,8,.66)';
      ctx.beginPath(); ctx.roundRect(bx, by, wpx + 26, 29, 8); ctx.fill();
      ctx.strokeStyle = locked ? 'rgba(255,140,120,.8)' : (portal ? 'rgba(190,170,255,.85)' : 'rgba(159,232,176,.85)');
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(bx, by, wpx + 26, 29, 8); ctx.stroke();
      ctx.fillStyle = locked ? '#ffb3a4' : (portal ? '#e2d6ff' : '#d6ffe4');
      ctx.fillText(txt, pk.x, by + 20);
      // 指向入口的下坠箭头
      ctx.fillStyle = locked ? '#ff8a7a' : (portal ? '#cfc0ff' : '#c8ffd8');
      const ay = pk.y - 34 + bob;
      ctx.beginPath();
      ctx.moveTo(pk.x - 11, ay - 13); ctx.lineTo(pk.x + 11, ay - 13); ctx.lineTo(pk.x, ay);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // B. 前往目标房间的门方向箭头(就在玩家身边, 一眼能看到往哪走)
    const objIdx = this.objectiveIdx();
    if (cur.room.idx !== objIdx) {
      const st = this.nextStepTo(objIdx);
      if (st) {
        const DIR_ANG = [0, Math.PI, Math.PI / 2, -Math.PI / 2]; // 右 左 下 上
        const DIRV = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const a = DIR_ANG[st.dir];
        if (a !== undefined) {
          // B0. 目标门洞里画一个清晰的绿色箭头(画在后处理之上 → 再黑的门也看得见)
          // 房间还被封着时门不可用, 不画绿色箭头(避免误导), 只保留玩家的灰色方向提示
          // 注意: 必须用整数方向向量, 不能用 cos/sin(π) 判断(浮点近似会得到 1.2e-16 ≠ 0)
          const vx = DIRV[st.dir][0], vy = DIRV[st.dir][1];
          const pulse = 0.5 + Math.sin(this.time * 3.6) * 0.5;
          if (!cur.locked) {
            const gx = vx !== 0 ? (vx > 0 ? ROOM_W - 14 : 14) : ROOM_W / 2;
            const gy = vy !== 0 ? (vy > 0 ? ROOM_H - 14 : 14) : ROOM_H / 2;
            const pulse0 = 0.5 + Math.sin(this.time * 4.2) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.6 + pulse0 * 0.4;
            ctx.fillStyle = '#d6ffe4';
            ctx.strokeStyle = 'rgba(6,24,14,.9)';
            ctx.lineWidth = 1.8;
            // 门洞内圈
            ctx.beginPath();
            if (vx !== 0) ctx.ellipse(gx, gy, 10, 28, 0, 0, TAU);
            else ctx.ellipse(gx, gy, 28, 10, 0, 0, TAU);
            ctx.stroke();
            // 指向门外的三角箭头
            ctx.save();
            ctx.translate(gx + vx * 3, gy + vy * 3);
            ctx.rotate(a);
            ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(10, 0); ctx.lineTo(-8, 11); ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.restore();
            ctx.restore();
          }
          // B1. 玩家身边的方向箭头 + 文字
          const R = 56 + pulse * 6;
          const ax = p.x + vx * R, ay = p.y + vy * R;
          ctx.save();
          ctx.globalAlpha = 0.6 + pulse * 0.4;
          ctx.translate(ax, ay); ctx.rotate(a);
          ctx.fillStyle = cur.locked ? 'rgba(150,160,185,.6)' : '#9fe8b0';
          ctx.strokeStyle = 'rgba(6,20,12,.8)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(9, 0); ctx.lineTo(-7, 9); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.restore();
          const label = cur.locked ? '清空敌人 → 门开启'
            : (this.floorData.bossFloor ? '领主房 →' : '下一层 →');
          const dirTxt = ['右侧', '左侧', '下方', '上方'][st.dir];
          const t2 = label + '(' + dirTxt + ')';
          ctx.save();
          ctx.globalAlpha = 0.85 + pulse * 0.15;
          ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          const w2 = ctx.measureText(t2).width;
          ctx.fillStyle = 'rgba(4,9,8,.7)';
          ctx.beginPath(); ctx.roundRect(ax - w2 / 2 - 8, ay + 15, w2 + 16, 21, 6); ctx.fill();
          ctx.strokeStyle = cur.locked ? 'rgba(150,160,185,.5)' : 'rgba(159,232,176,.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(ax - w2 / 2 - 8, ay + 15, w2 + 16, 21, 6); ctx.stroke();
          ctx.fillStyle = cur.locked ? '#c3cbd8' : '#d6ffe4';
          ctx.fillText(t2, ax, ay + 30);
          ctx.restore();
        }
      }
    }
  },

  // 门洞: 石拱门框 + 铁艺包边 + 锁定符文屏障 / 开启侧的光溢出
  drawDoors(ctx) {
    const room = this.cur.room;
    const locked = this.cur.locked;
    const cy = ROOM_H / 2, cx = ROOM_W / 2;
    // 通往"下一层/领主"目标房间的那扇门 → 绿色脉冲高亮 + 箭头
    const target = this.floorData ? this.nextStepTo(this.objectiveIdx()) : null;
    const rects = [
      [ROOM_W - 26, cy - 55, 26, 110],
      [0, cy - 55, 26, 110],
      [cx - 55, ROOM_H - 26, 110, 26],
      [cx - 55, 0, 110, 26],
    ];
    for (const d in room.doors) {
      const di = +d;
      const [x, y, w, h] = rects[d];
      const vert = h > w;   // 左右门(竖向)
      const mx = x + w / 2, my = y + h / 2;
      ctx.save();
      // 门洞深处(渐变, 不是纯色矩形): 内沿亮 → 外沿全黑
      const depth = vert
        ? ctx.createLinearGradient(di === 0 ? x : x + w, y, di === 0 ? x + w : x, y)
        : ctx.createLinearGradient(x, di === 2 ? y : y + h, x, di === 2 ? y + h : y);
      depth.addColorStop(0, '#0d1119');
      depth.addColorStop(0.5, '#05070c');
      depth.addColorStop(1, '#020306');
      ctx.fillStyle = depth;
      ctx.fillRect(x, y, w, h);
      // 门槛石(内沿受光)
      ctx.fillStyle = 'rgba(150,168,205,.10)';
      if (vert) ctx.fillRect(di === 0 ? x : x + w - 3, y + 3, 3, h - 6);
      else ctx.fillRect(x + 3, di === 2 ? y : y + h - 3, w - 6, 3);
      // 铁艺门框
      ctx.strokeStyle = 'rgba(126,142,178,.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      ctx.strokeStyle = 'rgba(20,26,40,.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
      // 铆钉(嵌在内沿)
      ctx.fillStyle = 'rgba(196,212,240,.35)';
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        const px = vert ? (di === 0 ? x + 6 : x + w - 6) : x + w * t;
        const py = vert ? y + h * t : (di === 2 ? y + 6 : y + h - 6);
        ctx.beginPath(); ctx.arc(px, py, 1.7, 0, TAU); ctx.fill();
      }
      if (locked) {
        // 锁定: 血色符文屏障
        const a = 0.2 + Math.sin(this.time * 7 + di) * 0.09;
        for (let i = 0; i < 3; i++) {
          const t = i / 3;
          ctx.fillStyle = `rgba(220,70,60,${a * (0.5 + t * 0.5)})`;
          if (vert) ctx.fillRect(x + 6, y + 8 + (h - 16) * t, w - 12, (h - 16) / 3 - 2);
          else ctx.fillRect(x + 8 + (w - 16) * t, y + 6, (w - 16) / 3 - 2, h - 12);
        }
        ctx.strokeStyle = `rgba(255,120,96,${0.45 + Math.sin(this.time * 9 + di) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 6 + di) * 0.12;
        const gr = 74;
        ctx.drawImage(Tex.glow('#ff4a3c', 64), mx - gr, my - gr, gr * 2, gr * 2);
        ctx.restore();
      } else {
        // 开启: 暖光溢出 + 光带
        const flow = 0.6 + Math.sin(this.time * 3 + di) * 0.2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 * flow;
        const gr = 92;
        ctx.drawImage(Tex.glow('#ffd98c', 64), mx - gr, my - gr, gr * 2, gr * 2);
        ctx.restore();
        ctx.fillStyle = `rgba(255,222,164,${0.12 + flow * 0.08})`;
        ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
        ctx.strokeStyle = `rgba(255,226,170,${0.4 + flow * 0.25})`;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        // ==== 目标方向的门: 绿色脉冲光 + 外框(氛围层) ====
        // 指向目标的大箭头画在 drawGuidance() 里(后处理之后), 否则会被光照层压暗到看不见
        if (target && target.dir === di) {
          const pulse = 0.55 + Math.sin(this.time * 4.2) * 0.35;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.45 * pulse;
          const tg = 112;
          ctx.drawImage(Tex.glow('#9fe8b0', 64), mx - tg, my - tg, tg * 2, tg * 2);
          ctx.restore();
          ctx.strokeStyle = `rgba(159,232,176,${0.55 + pulse * 0.4})`;
          ctx.lineWidth = 2.4;
          ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        }
      }
      ctx.restore();
    }
  },

  // ---------- 实体绘制 ----------
  // 掉落物: 脚下软阴影 + 立体高光 + 类型辉光, 不再是纯色方块
  drawPickup(ctx, pk) {
    const bob = Math.sin(this.time * 3 + pk.x * 0.1) * 3;
    // 脚下软阴影(所有类型共用)
    ctx.drawImage(Tex.shadow(), pk.x - 15, pk.y + 1, 30, 13);
    ctx.save();
    // 地面辉光(按类型/稀有度上色)
    const halo = { coin: '#ffd24d', potion: '#ff6b57', heart: '#ff6b8a', chest: '#ffc85c', shrine: '#8cd8ff' }[pk.type]
      || (pk.type === 'item' ? RARITIES[pk.item.rarity].color : null)
      || (pk.type === 'next' ? (pk.portal ? '#a98cff' : '#9fe8b0') : null);
    if (halo) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + Math.sin(this.time * 2.6 + pk.x * 0.02) * 0.08;
      // 数量多的金币/药水用小光晕, 只有装备/宝箱才用大光晕(控制每帧填充像素)
      const hr = pk.type === 'item' ? 52 : (pk.type === 'chest' || pk.type === 'shrine' || pk.type === 'next' ? 40 : 26);
      ctx.drawImage(Tex.glow(halo, 64), pk.x - hr, pk.y - hr * 0.7, hr * 2, hr * 1.5);
      ctx.restore();
    }
    if (pk.type === 'coin') {
      const sx = Math.abs(Math.sin(this.time * 4 + pk.y * 0.05));
      ctx.translate(pk.x, pk.y + bob * 0.4);
      ctx.scale(0.35 + sx * 0.65, 1);
      // 币身
      const g = ctx.createLinearGradient(-6, -6, 6, 7);
      g.addColorStop(0, '#fff0b8');
      g.addColorStop(0.42, '#ffcf49');
      g.addColorStop(1, '#a87e22');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 6.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(90,62,10,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
      // 内圈 + 高光
      ctx.strokeStyle = 'rgba(255,247,206,.75)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.ellipse(-2, -2.6, 1.7, 1, -0.6, 0, TAU); ctx.fill();
    } else if (pk.type === 'potion') {
      ctx.translate(pk.x, pk.y + bob * 0.4);
      // 液体
      const lg = ctx.createLinearGradient(0, -6, 0, 8);
      lg.addColorStop(0, '#ff7a63');
      lg.addColorStop(1, '#8e1f18');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-6.5, -3); ctx.quadraticCurveTo(-7.4, 7, 0, 7.6);
      ctx.quadraticCurveTo(7.4, 7, 6.5, -3); ctx.closePath();
      ctx.fill();
      // 玻璃瓶(半透明 + 描边)
      const gg = ctx.createLinearGradient(-6, -4, 6, 6);
      gg.addColorStop(0, 'rgba(255,255,255,.30)');
      gg.addColorStop(0.5, 'rgba(255,255,255,.05)');
      gg.addColorStop(1, 'rgba(255,255,255,.22)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(-6.5, -3); ctx.quadraticCurveTo(-7.4, 7, 0, 7.6);
      ctx.quadraticCurveTo(7.4, 7, 6.5, -3); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(228,238,255,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      // 瓶颈 + 木塞
      ctx.fillStyle = 'rgba(224,234,254,.55)';
      ctx.fillRect(-2.4, -9, 4.8, 6.5);
      ctx.fillStyle = '#c8a064';
      ctx.beginPath(); ctx.roundRect(-3.2, -12.5, 6.4, 4, 1.6); ctx.fill();
      ctx.strokeStyle = 'rgba(60,42,16,.8)'; ctx.lineWidth = 1; ctx.stroke();
      // 高光条
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.ellipse(-2.6, 1, 1.3, 3.2, 0.22, 0, TAU); ctx.fill();
    } else if (pk.type === 'heart') {
      ctx.translate(pk.x, pk.y + bob * 0.4);
      const s = 1.15;
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 1, 13);
      g.addColorStop(0, '#ffc2d4');
      g.addColorStop(0.45, '#ff6b8a');
      g.addColorStop(1, '#a8203f');
      const heart = () => {
        ctx.beginPath();
        ctx.moveTo(0, 7.4 * s);
        ctx.bezierCurveTo(-8.2 * s, 1.4 * s, -7.4 * s, -4.6 * s, -3.4 * s, -3.4 * s);
        ctx.bezierCurveTo(-1.5 * s, -2.8 * s, 0, -1.2 * s, 0, 0);
        ctx.bezierCurveTo(0, -1.2 * s, 1.5 * s, -2.8 * s, 3.4 * s, -3.4 * s);
        ctx.bezierCurveTo(7.4 * s, -4.6 * s, 8.2 * s, 1.4 * s, 0, 7.4 * s);
        ctx.closePath();
      };
      heart(); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(92,10,30,.75)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.beginPath(); ctx.ellipse(-3.2 * s, -2.4 * s, 1.7 * s, 1.1 * s, -0.5, 0, TAU); ctx.fill();
    } else if (pk.type === 'item') {
      const it = pk.item, rc = RARITIES[it.rarity].color;
      // 光柱(渐变 + 加色)
      const g = ctx.createLinearGradient(0, pk.y - 130, 0, pk.y + 10);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, rc + '22');
      g.addColorStop(1, rc + '66');
      ctx.fillStyle = g;
      ctx.fillRect(pk.x - 9, pk.y - 130, 18, 140);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(Tex.glow(rc, 64), pk.x - 60, pk.y - 76, 120, 120);
      ctx.restore();
      ctx.translate(pk.x, pk.y - 10 + bob);
      ctx.rotate(this.time * 1.5);
      // 宝石切面
      const rg = ctx.createLinearGradient(-8, -11, 8, 11);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.35, rc);
      rg.addColorStop(1, 'rgba(20,10,30,.9)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 11); ctx.lineTo(-8, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
      // 内部棱线
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(0, 11);
      ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(3.4, -3.4); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
    } else if (pk.type === 'chest') {
      ctx.translate(pk.x, pk.y);
      // 箱体
      const bg2 = ctx.createLinearGradient(-20, -12, -20, 14);
      bg2.addColorStop(0, '#8a6430');
      bg2.addColorStop(0.5, '#6a4a22');
      bg2.addColorStop(1, '#3d2911');
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.roundRect(-20, -12, 40, 26, 3); ctx.fill();
      // 木纹
      ctx.strokeStyle = 'rgba(40,26,8,.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const yy = -8 + i * 6.5;
        ctx.beginPath(); ctx.moveTo(-18, yy); ctx.lineTo(18, yy + 0.8); ctx.stroke();
      }
      // 弧形箱盖
      const lg2 = ctx.createLinearGradient(-20, -30, 20, -12);
      lg2.addColorStop(0, '#a87c40');
      lg2.addColorStop(1, '#5a3d18');
      ctx.fillStyle = lg2;
      ctx.beginPath();
      ctx.moveTo(-20, -12); ctx.quadraticCurveTo(0, -31, 20, -12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,6,.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      // 金属包边 + 锁扣
      const mtl = ctx.createLinearGradient(0, -14, 0, 14);
      mtl.addColorStop(0, '#f0d489'); mtl.addColorStop(0.5, '#b8973f'); mtl.addColorStop(1, '#6a5220');
      ctx.fillStyle = mtl;
      ctx.fillRect(-22, -13, 5, 28);
      ctx.fillRect(17, -13, 5, 28);
      ctx.fillRect(-3.4, -9, 6.8, 11);
      ctx.fillStyle = 'rgba(255,246,206,.85)';
      ctx.fillRect(-22, -13, 5, 2);
      ctx.beginPath(); ctx.arc(0, -3, 1.6, 0, TAU); ctx.fill();
      // 外描边 + 呼吸金光
      ctx.strokeStyle = 'rgba(20,14,4,.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(-20, -12, 40, 26, 3); ctx.stroke();
      const a = 0.4 + Math.sin(this.time * 4) * 0.2;
      ctx.strokeStyle = `rgba(255,210,77,${a})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-24, -16, 48, 34);
    } else if (pk.type === 'shrine') {
      ctx.translate(pk.x, pk.y);
      // 光环 + 旋转符文环
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(Tex.glow('#7ed4ff', 64), -70, -70, 140, 140);
      ctx.restore();
      ctx.strokeStyle = 'rgba(140,216,255,.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(this.time * 2) * 3, this.time * 0.8, this.time * 0.8 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      // 水晶(多面 + 渐变)
      const cg = ctx.createLinearGradient(-12, -26, 12, 18);
      cg.addColorStop(0, '#eaffff');
      cg.addColorStop(0.4, '#8cd8ff');
      cg.addColorStop(1, '#2a6fa8');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(0, -27); ctx.lineTo(12, -2); ctx.lineTo(0, 19); ctx.lineTo(-12, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(222,246,255,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(0, 19); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(5, -6); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    } else if (pk.type === 'next') {
      if (pk.portal) {
        ctx.translate(pk.x, pk.y);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 2.4) * 0.1;
        ctx.drawImage(Tex.glow('#a98cff', 64), -66, -66, 132, 132);
        ctx.restore();
        // 漩涡底色
        const pg = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
        pg.addColorStop(0, 'rgba(226,214,255,.9)');
        pg.addColorStop(0.35, 'rgba(140,110,255,.55)');
        pg.addColorStop(1, 'rgba(30,16,60,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const a0 = this.time * (2 + i) * 0.9;
          ctx.strokeStyle = `rgba(${170 + i * 20},${140 + i * 20},255,${0.75 - i * 0.2})`;
          ctx.lineWidth = 3 - i * 0.5;
          ctx.beginPath();
          ctx.arc(0, 0, 13 + i * 9 + Math.sin(this.time * 3 + i) * 3, a0 % TAU, a0 % TAU + 4.4);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      } else {
        ctx.translate(pk.x, pk.y);
        // 深坑
        const pg = ctx.createRadialGradient(0, -2, 2, 0, 0, 28);
        pg.addColorStop(0, '#000104');
        pg.addColorStop(0.6, '#050c08');
        pg.addColorStop(1, '#0d1a12');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(0, 0, 27, 17, 0, 0, TAU); ctx.fill();
        // 石阶
        ctx.strokeStyle = 'rgba(150,190,165,.30)'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(0, -1 + i * 3.4, 22 - i * 5.5, 13 - i * 3.4, 0, 0, TAU);
          ctx.stroke();
        }
        // 上升绿光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + Math.sin(this.time * 2.2) * 0.12;
        ctx.drawImage(Tex.glow('#9fe8b0', 64), -52, -64, 104, 104);
        ctx.restore();
        ctx.strokeStyle = `rgba(159,232,176,${0.7 + Math.sin(this.time * 3) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 26, 16, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(200,255,214,.9)';
        ctx.font = 'bold 15px "Microsoft YaHei"'; ctx.textAlign = 'center';
        ctx.fillText('↓', 0, 5);
        ctx.lineWidth = 1;
      }
    }
    ctx.restore();
  },

  drawEnemy(ctx, e) {
    const spawning = e.spawnT > 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (spawning) {
      const s = clamp(1 - e.spawnT / (e.boss ? 1 : 0.6), 0.05, 1);
      ctx.globalAlpha = s;
      ctx.scale(s, s);
      ctx.strokeStyle = e.color;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 12, this.time * 3, this.time * 3 + 5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 脚下软阴影(接触阴影, 用缓存精灵)
    ctx.drawImage(Tex.shadow(), -e.r * 1.5, e.r * 0.1, e.r * 3, e.r * 1.8);
    const wob = Math.sin(e.t * 6 + e.ph) * 0.06;
    ctx.scale(1 + wob, 1 - wob);
    const col = e.flashT > 0 ? '#ffffff' : e.color;
    // 核心辉光(受击时更亮更白) —— 用缓存精灵, 不重建渐变
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = e.flashT > 0 ? 0.75 : 0.26;
    const gr = e.r * 1.9;
    ctx.drawImage(Tex.glow(e.flashT > 0 ? '#ffffff' : e.color, 64), -gr, -gr, gr * 2, gr * 2);
    ctx.restore();
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 2;

    if (e.boss) {
      // Boss: 旋转棘环 + 核心
      ctx.rotate(this.time * 0.7);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.85, Math.sin(a) * e.r * 0.85);
        ctx.lineTo(Math.cos(a + 0.16) * (e.r + 16), Math.sin(a + 0.16) * (e.r + 16));
        ctx.lineTo(Math.cos(a + 0.32) * e.r * 0.85, Math.sin(a + 0.32) * e.r * 0.85);
        ctx.closePath();
        ctx.fill();
      }
      ctx.rotate(-this.time * 0.7);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.85, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
      ctx.fillStyle = e.flashT > 0 ? '#fff' : '#1a0d12';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(Math.cos(angleTo(e.x, e.y, this.player.x, this.player.y)) * 8, Math.sin(angleTo(e.x, e.y, this.player.x, this.player.y)) * 8, e.r * 0.16, 0, TAU); ctx.fill();
    } else {
      switch (e.type) {
        case 'slime': {
          ctx.beginPath();
          ctx.ellipse(0, 0, e.r, e.r * 0.82, 0, 0, TAU);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#12200a';
          ctx.beginPath(); ctx.arc(-5, -3, 2.4, 0, TAU); ctx.arc(5, -3, 2.4, 0, TAU); ctx.fill();
          break;
        }
        case 'bat': {
          const flap = Math.sin(e.t * 16) * 0.7;
          ctx.beginPath();
          ctx.moveTo(-4, 0); ctx.lineTo(-e.r - 7, -6 - flap * 7); ctx.lineTo(-e.r * 0.4, 5);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(4, 0); ctx.lineTo(e.r + 7, -6 - flap * 7); ctx.lineTo(e.r * 0.4, 5);
          ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff5c5c';
          ctx.beginPath(); ctx.arc(-2.4, -1, 1.6, 0, TAU); ctx.arc(2.4, -1, 1.6, 0, TAU); ctx.fill();
          break;
        }
        case 'archer': {
          ctx.beginPath(); ctx.arc(0, 0, e.r * 0.8, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          const aa = angleTo(e.x, e.y, this.player.x, this.player.y);
          ctx.beginPath(); ctx.arc(Math.cos(aa) * 12, Math.sin(aa) * 12, 9, aa - 1.2, aa + 1.2); ctx.stroke();
          ctx.lineWidth = 2;
          if (e.state === 'aim') {
            ctx.strokeStyle = 'rgba(255,120,90,.4)';
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(aa) * 330, Math.sin(aa) * 330);
            ctx.stroke();
          }
          break;
        }
        case 'bomber': {
          const pulse = 1 + Math.sin(e.t * (e.state === 'fuse' ? 30 : 7)) * 0.09;
          ctx.beginPath(); ctx.arc(0, 0, e.r * pulse, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2a1206';
          ctx.beginPath(); ctx.arc(-4, -3, 2, 0, TAU); ctx.arc(4, -3, 2, 0, TAU); ctx.fill();
          if (e.state === 'fuse') {
            ctx.strokeStyle = `rgba(255,${Math.sin(e.t * 40) > 0 ? 230 : 60},60,.9)`;
            ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, TAU); ctx.stroke();
          }
          break;
        }
        case 'charger': {
          ctx.save();
          ctx.rotate(e.state === 'aim' || e.state === 'charge' ? e.aimA : angleTo(e.x, e.y, this.player.x, this.player.y));
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.6, -e.r * 0.5); ctx.lineTo(e.r * 1.15, 0); ctx.lineTo(-e.r * 0.6, e.r * 0.5);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#f0e0c8';
          ctx.beginPath();
          ctx.moveTo(e.r * 0.55, -e.r * 0.55); ctx.lineTo(e.r * 1.35, -e.r * 0.2); ctx.lineTo(e.r * 0.7, -e.r * 0.05);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(e.r * 0.55, e.r * 0.55); ctx.lineTo(e.r * 1.35, e.r * 0.2); ctx.lineTo(e.r * 0.7, e.r * 0.05);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          if (e.state === 'aim') {
            ctx.strokeStyle = 'rgba(255,90,70,.45)';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(e.aimA) * 420, Math.sin(e.aimA) * 420);
            ctx.stroke();
            ctx.lineWidth = 2;
          }
          break;
        }
        case 'mage': {
          ctx.beginPath();
          ctx.moveTo(0, -e.r); ctx.lineTo(e.r * 0.85, e.r * 0.8); ctx.lineTo(-e.r * 0.85, e.r * 0.8);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = col;
          ctx.setLineDash([4, 5]);
          ctx.beginPath(); ctx.arc(0, 0, e.r + 7, this.time * 2, this.time * 2 + 5.5); ctx.stroke();
          ctx.setLineDash([]);
          if (e.state === 'cast') {
            ctx.fillStyle = 'rgba(126,200,255,.5)';
            ctx.beginPath(); ctx.arc(0, -e.r * 0.4, 6 + Math.sin(e.t * 20) * 2, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'knight': {
          ctx.save();
          ctx.rotate(angleTo(e.x, e.y, this.player.x, this.player.y));
          ctx.beginPath();
          ctx.roundRect(-e.r * 0.7, -e.r * 0.7, e.r * 1.4, e.r * 1.4, 5);
          ctx.fill(); ctx.stroke();
          ctx.strokeStyle = col;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(e.r * 0.9, 0, e.r * 0.6, -1.2, 1.2); ctx.stroke();
          ctx.lineWidth = 2;
          ctx.restore();
          break;
        }
        default: {
          ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
    }
    // 左上受光轮廓(与全局主光源方向一致) + 受击闪白描边
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 1.4, Math.PI * 0.72, Math.PI * 1.62);
    ctx.strokeStyle = e.flashT > 0 ? 'rgba(255,255,255,.95)' : 'rgba(226,238,255,.28)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // 眼睛/核心发光
    if (e.type === 'slime' || e.type === 'bat' || e.type === 'bomber') {
      const ex = e.type === 'slime' ? 5 : 4, ey = e.type === 'bat' ? -1 : -3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = e.flashT > 0 ? 1 : 0.8;
      ctx.drawImage(Tex.glow('#ff6b6b', 8), -ex - 3.6, ey - 3.6, 7.2, 7.2);
      ctx.drawImage(Tex.glow('#ff6b6b', 8), ex - 3.6, ey - 3.6, 7.2, 7.2);
      ctx.restore();
    }
    // 冻结表现
    if (e.frozenT > 0) {
      ctx.fillStyle = 'rgba(140,216,255,.35)';
      ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // 精英标记
    if (e.elite >= 0 && !e.boss) {
      ctx.save();
      ctx.strokeStyle = ELITE_MODS[e.elite].color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 5 + Math.sin(this.time * 5) * 1.5, 0, TAU);
      ctx.stroke();
      ctx.font = 'bold 11px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillStyle = ELITE_MODS[e.elite].color;
      ctx.fillText(e.eliteName + '·' + e.name, e.x, e.y - e.r - 16);
      ctx.restore();
    }
    // 血条(受伤的非Boss)
    if (!e.boss && e.hp < e.maxHp && !e.dead) {
      const w = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 4);
      ctx.fillStyle = e.elite >= 0 ? ELITE_MODS[e.elite].color : '#e05c5c';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  },

  drawPlayer(ctx) {
    const p = this.player;
    if (!p) return;
    // 冲刺残影(带加色辉光)
    for (const g of p.ghosts) {
      const a = (1 - g.t / 0.3) * 0.35;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.7;
      const gr = p.r * 1.7;
      ctx.drawImage(Tex.glow('#6fa8ff', 64), g.x - gr, g.y - gr, gr * 2, gr * 2);
      ctx.restore();
      ctx.fillStyle = `rgba(122,170,240,${a})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, p.r * 0.9, 0, TAU);
      ctx.fill();
    }
    // 脚下软阴影
    ctx.drawImage(Tex.shadow(), p.x - 22, p.y + 4, 44, 20);
    ctx.save();
    ctx.translate(p.x, p.y);
    const blink = p.iframes > 0 && Math.sin(this.time * 30) > 0;
    if (blink) ctx.globalAlpha = 0.5;
    // 法杖(指向鼠标)
    const w = Loot.itemBase(p.weapon);
    ctx.strokeStyle = '#6a4d2a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.aimA) * 22, Math.sin(p.aimA) * 22);
    ctx.stroke();
    // 法杖高光
    ctx.strokeStyle = 'rgba(220,190,140,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.aimA) * 4, Math.sin(p.aimA) * 4 - 1);
    ctx.lineTo(Math.cos(p.aimA) * 20, Math.sin(p.aimA) * 20 - 1);
    ctx.stroke();
    ctx.fillStyle = w.color;
    ctx.shadowColor = w.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(Math.cos(p.aimA) * 24, Math.sin(p.aimA) * 24, 4, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 身体(径向渐变 + 受击闪白)
    const bg = ctx.createRadialGradient(-3.5, -4.5, 1.5, 0, 0, 15);
    if (p.iframes > 0 && p.iframes > 0.1) {
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#9fd0ff');
    } else {
      bg.addColorStop(0, '#8fb8f2');
      bg.addColorStop(0.6, '#4d76c8');
      bg.addColorStop(1, '#1e3a72');
    }
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,26,.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 左上受光轮廓
    ctx.beginPath();
    ctx.arc(0, 0, 12.6, Math.PI * 0.75, Math.PI * 1.6);
    ctx.strokeStyle = 'rgba(226,240,255,.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 兜帽(带渐变与描边)
    const hx = -Math.cos(p.aimA) * 4, hy = -Math.sin(p.aimA) * 4;
    const hg = ctx.createRadialGradient(hx - 2, hy - 3, 1, hx, hy, 9);
    hg.addColorStop(0, '#3a5c9e');
    hg.addColorStop(1, '#152447');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,26,.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 兜帽下的目光(朝瞄准方向)
    if (!blink) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      const ex = Math.cos(p.aimA) * 3, ey = Math.sin(p.aimA) * 3;
      ctx.drawImage(Tex.glow('#bfe4ff', 8), hx + ex - 5, hy + ey - 5, 10, 10);
      ctx.restore();
    }
    // 减速表现
    if (p.slowT > 0) {
      ctx.fillStyle = 'rgba(140,216,255,.3)';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
    }
    // 护盾(渐隐光环 + 加色)
    if (p.shield) {
      const sa = 0.7 + Math.sin(this.time * 5) * 0.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = sa * 0.28;
      ctx.drawImage(Tex.glow('#9fd8ff', 64), -30, -30, 60, 60);
      ctx.restore();
      ctx.strokeStyle = `rgba(159,216,255,${sa})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${sa * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 21, -1.1, 0.6);
      ctx.stroke();
    }
    ctx.restore();
    // 环刃
    if (p.sp.orbit) {
      const m = AFFIX.orbit.mech(p.sp.orbit);
      // 轨迹环
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#d78cff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, m.radius, 0, TAU); ctx.stroke();
      ctx.restore();
      for (let i = 0; i < m.count; i++) {
        const a = p.orbitA + i / m.count * TAU;
        const bx = p.x + Math.cos(a) * m.radius, by = p.y + Math.sin(a) * m.radius;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a + Math.PI / 2 + this.time * 6);
        ctx.fillStyle = '#d78cff';
        ctx.shadowColor = '#d78cff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(4, 2); ctx.lineTo(0, 8); ctx.lineTo(-4, 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,236,255,.7)';
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();
      }
    }
  },

  // 弹幕: 拖尾 + 加色光晕 + 白热核心
  drawProjs(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of this.projs) {
      // 拖尾光晕
      ctx.globalAlpha = 0.42;
      const tr = pr.size * 3.4;
      ctx.drawImage(Tex.glow(pr.color, 32), pr.x - tr, pr.y - tr, tr * 2, tr * 2);
      // 拖尾条
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = pr.color;
      ctx.lineWidth = pr.size * 0.85;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pr.px, pr.py);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
      // 弹体
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.size, 0, TAU);
      ctx.fill();
      // 白热核心
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.size * 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const e of this.eprojs) {
      const er = e.r * 3.2;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(Tex.glow(e.color, 32), e.x - er, e.y - er, er * 2, er * 2);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  updateEProjs(dt) {
    const p = this.player;
    for (let i = this.eprojs.length - 1; i >= 0; i--) {
      const e = this.eprojs[i];
      if (e.homing) {
        const cur = Math.atan2(e.vy, e.vx);
        const want = angleTo(e.x, e.y, p.x, p.y);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const a = cur + clamp(diff, -e.homing * dt, e.homing * dt);
        const spd = Math.hypot(e.vx, e.vy);
        e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.life -= dt;
      let dead = e.life <= 0 || e.x < 30 || e.x > ROOM_W - 30 || e.y < 30 || e.y > ROOM_H - 30;
      if (!dead && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 3) * (e.r + p.r - 3)) {
        this.hitPlayer(e.dmg, null);
        dead = true;
      }
      if (dead) {
        FX.burst(e.x, e.y, e.color, 4, 90, 0.25, 3);
        this.eprojs.splice(i, 1);
      }
    }
  },
};

// 辅助: 第二波暂存(避免在对象字面量方法里写 this.pending)
function cur_pending_to_wave(g, list) { g.cur.pending = list; }

// ================================================================
// 攻击输入增强(修复"攻击太呆滞"的输入侧):
//   1) 点击缓冲 —— 冷却中按下即松开也不再被吞掉(0.16s 内补发)
//   2) 按下即开火 —— 冷却就绪时把"按下 → 开火"的延迟降到 0, 不再等下一帧
// 单独挂监听, 不改动 main.js 已有的输入通道(两者互不冲突)。
// ================================================================
(function bindFireBuffer() {
  const cvs = document.getElementById('game');
  if (!cvs) return;
  cvs.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    G.input.fireBuf = 0.16;
    G.tryFire();
  });
})();
