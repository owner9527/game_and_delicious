// ===== 世界地图:地形生成 + 区块(领地)系统 =====
G.map = null;

G.M = {
  idx(x, y) { return y * G.CFG.MAPW + x; },
  inB(x, y) { return x >= 0 && y >= 0 && x < G.CFG.MAPW && y < G.CFG.MAPH; },
  terr(x, y) { return G.M.inB(x, y) ? G.map.terr[G.M.idx(x, y)] : G.CFG.TERR.WATER; },

  // 生成世界:值噪声决定水域/森林/岩石/沃土
  genWorld(seed) {
    const W = G.CFG.MAPW, H = G.CFG.MAPH, T = G.CFG.TERR;
    const terr = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const elev = G.U.vnoise(x, y, seed, 22);
        const moist = G.U.vnoise(x, y, seed + 777, 14);
        const edge = Math.min(x, y, W - 1 - x, H - 1 - y); // 边缘压水,形成大陆感
        let t = T.GRASS;
        if (elev < 0.30 + Math.max(0, (10 - edge)) * 0.012) t = T.WATER;
        else if (moist > 0.66) t = T.FOREST;
        else if (elev > 0.74) t = T.ROCK;
        else if (moist > 0.52 && elev < 0.45) t = T.FERTILE;
        if (t === T.GRASS && G.U.hash2(x, y, seed + 31) > 0.985) t = T.ROCK;
        if (t === T.GRASS && G.U.hash2(x, y, seed + 55) > 0.975) t = T.FOREST;
        terr[y * W + x] = t;
      }
    }
    // 区块(3×3),中央初始解锁
    const zones = [];
    for (let i = 0; i < 9; i++) zones.push({ open: false });
    zones[4].open = true;

    G.map = { w: W, h: H, seed, terr, zones, bmap: new Int32Array(W * H).fill(-1) };

    // 开局区清理出一片安家地(市政厅周边)
    const cx = W >> 1, cy = H >> 1;
    for (let y = cy - 7; y <= cy + 7; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        if (G.M.inB(x, y)) {
          const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
          if (d <= 5 || G.U.hash2(x, y, seed + 3) > 0.3) terr[y * W + x] = T.GRASS;
        }
      }
    }
  },

  zoneAt(x, y) {
    const z = G.CFG.ZSIZE;
    return { zx: Math.floor(x / z), zy: Math.floor(y / z) };
  },
  zoneOpenAt(x, y) {
    const { zx, zy } = G.M.zoneAt(x, y);
    return G.map.zones[zy * 3 + zx].open;
  },
  zoneRing(zx, zy) { return Math.max(Math.abs(zx - 1), Math.abs(zy - 1)); },
  openZone(zx, zy) {
    const z = G.map.zones[zy * 3 + zx];
    if (!z.open) { z.open = true; return true; }
    return false;
  },
  openCount() { return G.map.zones.reduce((a, z) => a + (z.open ? 1 : 0), 0); },

  isRoad(x, y) {
    const b = G.M.bAt(x, y);
    return !!b && b.type === 'road';
  },
  bAt(x, y) {
    if (!G.M.inB(x, y)) return null;
    const id = G.map.bmap[G.M.idx(x, y)];
    return id >= 0 ? G.B.byId(id) : null;
  },

  // 地形是否可建造该类建筑
  terrOk(t, def) {
    const T = G.CFG.TERR;
    const list = def.terr.map(s => T[s.toUpperCase()]);
    return list.includes(t);
  },

  // 建筑落点周围(含自身矩形外扩2格)的岩石数量
  rockNear(x, y, w, h, r = 2) {
    const T = G.CFG.TERR; let n = 0;
    for (let yy = y - r; yy < y + h + r; yy++)
      for (let xx = x - r; xx < x + w + r; xx++)
        if (G.M.terr(xx, yy) === T.ROCK) n++;
    return n;
  },
  waterNear(x, y, w, h, r = 1) {
    const T = G.CFG.TERR;
    for (let yy = y - r; yy < y + h + r; yy++)
      for (let xx = x - r; xx < x + w + r; xx++)
        if (G.M.terr(xx, yy) === T.WATER) return true;
    return false;
  },
  adjForest(x, y, w, h) {
    const T = G.CFG.TERR; let n = 0;
    for (let yy = y - 1; yy <= y + h; yy++)
      for (let xx = x - 1; xx <= x + w; xx++) {
        const edge = (xx < x || xx >= x + w || yy < y || yy >= y + h);
        if (edge && G.M.terr(xx, yy) === T.FOREST) n++;
      }
    return Math.min(n, 8);
  },
};
