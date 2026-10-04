'use strict';
// ================================================================
// 随机地图生成: 种子驱动的房间连通图(网格放置 + BFS 定位关键房间)
// 同一种子 + 层数 = 完全相同的地图结构 / 敌人配置 / 障碍
// ================================================================
const ROOM_W = 1280, ROOM_H = 832;
const DIRS = [ { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 } ]; // 右 左 下 上
const OPPO = d => d ^ 1; // 0↔1, 2↔3

const MapGen = {
  gen(floor, seed) {
    const rng = new RNG((seed ^ Math.imul(floor, 0x9E3779B9)) >>> 0);
    const bossFloor = floor % 5 === 0;
    const target = bossFloor ? 4 : clamp(5 + Math.floor(floor * 0.7), 5, 11);
    const cells = new Map();
    const key = (x, y) => x + ',' + y;
    const rooms = [];
    const addRoom = (x, y) => {
      const r = { gx: x, gy: y, type: 'combat', cleared: false, visited: false, doors: {}, idx: rooms.length, obstacles: [], guards: [] };
      rooms.push(r); cells.set(key(x, y), r);
      return r;
    };
    addRoom(0, 0);
    let iter = 0;
    while (rooms.length < target && iter++ < 800) {
      const from = rooms[rng.int(0, rooms.length - 1)];
      const d = DIRS[rng.int(0, 3)];
      const nx = from.gx + d.dx, ny = from.gy + d.dy;
      if (cells.has(key(nx, ny))) continue;
      let nb = 0;
      for (const dd of DIRS) if (cells.has(key(nx + dd.dx, ny + dd.dy))) nb++;
      if (nb > 1 && rng.chance(0.72)) continue; // 抑制过于密集,形成走廊式结构
      addRoom(nx, ny);
    }
    // 连通所有相邻房间
    rooms.forEach(r => {
      DIRS.forEach((d, i) => {
        const n = cells.get(key(r.gx + d.dx, r.gy + d.dy));
        if (n) r.doors[i] = n.idx;
      });
    });
    // BFS 距离 → 最远房间作 Boss/出口房
    const distArr = rooms.map(() => -1);
    distArr[0] = 0;
    const q = [0];
    while (q.length) {
      const i = q.shift();
      for (const k in rooms[i].doors) {
        const j = rooms[i].doors[k];
        if (distArr[j] < 0) { distArr[j] = distArr[i] + 1; q.push(j); }
      }
    }
    let far = 0;
    distArr.forEach((d, i) => { if (d > distArr[far]) far = i; });
    rooms[0].type = 'start'; rooms[0].cleared = true;
    rooms[far].type = bossFloor ? 'boss' : 'stairs';
    // 死胡同 → 宝藏房 / 祭坛房
    const deadEnds = rooms.filter(r => Object.keys(r.doors).length === 1 && r.type === 'combat');
    rng.shuffle(deadEnds);
    if (deadEnds[0]) deadEnds[0].type = 'treasure';
    if (deadEnds[1]) deadEnds[1].type = 'shrine';
    else {
      const mids = rooms.filter(r => r.type === 'combat');
      if (mids.length && rng.chance(0.85)) rng.pick(mids).type = 'shrine';
    }
    // 敌人配置(种子决定) + 障碍岩石
    rooms.forEach(r => {
      if (r.type === 'combat' || r.type === 'stairs') {
        const budget = Math.round(4 + floor * 1.4 + rng.range(0, 3) + (r.type === 'stairs' ? -2 : 0));
        r.guards = this.genGuards(rng, floor, budget);
      }
      if (r.type !== 'start') {
        const n = rng.int(2, 7);
        for (let k = 0; k < n; k++) {
          const ox = rng.range(130, ROOM_W - 130), oy = rng.range(120, ROOM_H - 120);
          if (this.nearDoorPath(r, ox, oy)) continue;
          r.obstacles.push({ x: ox, y: oy, r: rng.range(17, 33), seed: rng.int(0, 99999) });
        }
      }
    });
    return { floor, seed, bossFloor, rooms, startIdx: 0, farIdx: far };
  },
  // 用敌人经验值作成本近似, 组合出该房间的怪群
  genGuards(rng, floor, budget) {
    const pool = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].minFloor <= floor);
    const guards = [];
    let spent = 0, n = 0;
    while (spent < budget && n < 22) {
      const k = rng.weighted(pool, id => ENEMY_TYPES[id].w);
      const cost = ENEMY_TYPES[k].xp;
      const elite = floor >= 3 && rng.chance(Math.min(0.30, 0.05 + floor * 0.016));
      guards.push({ type: k, elite: elite ? rng.int(0, ELITE_MODS.length - 1) : -1 });
      spent += Math.max(3, cost * (elite ? 2.5 : 1));
      n++;
    }
    return guards;
  },
  // 保持门到门中央通道无障碍
  nearDoorPath(r, x, y) {
    const cx = ROOM_W / 2, cy = ROOM_H / 2;
    if (r.doors[0] != null && Math.abs(y - cy) < 90 && x > ROOM_W - 210) return true;
    if (r.doors[1] != null && Math.abs(y - cy) < 90 && x < 210) return true;
    if (r.doors[2] != null && Math.abs(x - cx) < 90 && y > ROOM_H - 210) return true;
    if (r.doors[3] != null && Math.abs(x - cx) < 90 && y < 210) return true;
    return false;
  },
};
