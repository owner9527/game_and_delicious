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

    // 保证开局领地内一定有一处可开采的岩石矿脉(细节见 ensureQuarryRock)
    G.M.ensureQuarryRock();
  },

  // ---- 保证"开局领地内一定能建采石场" ----
  // 采石场要求附近有岩石。天然岩石是值噪声产生的散点，而"安家地清理"又把
  // 中心 7 格的岩石清成了草地 —— 实测 300 个种子里 34.7% 在开局领地里找不到
  // 任何合法落点(8% 连一块石头都没有)，于是玩家造不出采石场 → 石料断供 → 整局卡死。
  // 放宽 rockReq 收效很小(降到 3 仍有 29.7% 失败)，因为问题不是"石头不够多"，
  // 而是"没有成簇的石头"，所以这里在需要时贴着一处外沿补一个 4×4 岩簇。
  //
  // ⚠ 它操作的是 G.map.terr 本身，所以**读档之后必须再调用一次**：
  //   存档里存了整张地形(save.js 的 terr 字段)，读档会用存档覆盖 genWorld 的结果，
  //   如果只在 genWorld 里兜底，老存档永远补不上岩石。
  // 返回新变成岩石的格子下标(供资源层登记)，没做事则返回 null。
  ensureQuarryRock() {
    const W = G.CFG.MAPW, H = G.CFG.MAPH, T = G.CFG.TERR;
    const terr = G.map.terr, bmap = G.map.bmap;
    const ZS = G.CFG.ZSIZE;
    const zx0 = 1 * ZS, zy0 = 1 * ZS;                   // 中央(初始已解锁)领地
    const cx = W >> 1, cy = H >> 1;
    const seed = G.map.seed >>> 0;
    const rockReq = (G.CFG.BUILDS.quarry && G.CFG.BUILDS.quarry.rockReq) || 1;
    // "天然够用"的门槛要比建造成本高一截：rockReq 已放宽到 1，
    // 若直接拿 1 判断，几乎任何地图都算够用，兜底就再也不触发，
    // 于是又会出现整片领地一块石头都没有的局。这里要求至少 3 块的富余。
    const naturalBar = Math.max(rockReq, 3);
    const bw = 4, bh = 4;

    // ① 天然(或存档里已有的)岩石是否已经够用
    //    注意：只认中央领地**内部**的岩石。领地外的岩石虽然也能满足 canPlace
    //    的距离判定，但玩家根本走不过去，拿它当"够用"会让兜底永远不触发。
    let natural = 0;
    for (let y = zy0; y < zy0 + ZS; y++) {
      for (let x = zx0; x < zx0 + ZS; x++) {
        const i0 = y * W + x;
        if (terr[i0] !== T.GRASS || bmap[i0] >= 0) continue;   // 被建筑占的不算
        let n = 0;
        for (let yy = y - 2; yy <= y + 2; yy++)
          for (let xx = x - 2; xx <= x + 2; xx++) {
            if (xx < zx0 || yy < zy0 || xx >= zx0 + ZS || yy >= zy0 + ZS) continue;   // 领地外不算
            if (terr[yy * W + xx] === T.ROCK) n++;
          }
        if (n >= naturalBar) natural++;
      }
    }
    if (natural > 0) return null;                       // 本来就够用，不动它，保留地图多样性

    // ② 把岩簇"贴着安家地外沿"放。
    //    安家地清理保证了 d<=5 的格子一定是草地，所以把 4×4 岩簇的内侧边放在
    //    恰好 d=6 处时，紧贴它的那一格必定是草地 —— 采石场一定放得下。
    //    四个正交方向 × 若干个距离，按种子挑，兼顾"不压建筑"和"不同地图不一样"。
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const cands = [];
    for (const [sx, sy] of dirs) {
      for (let g = 6; g <= 10; g++) {
        const px = sx > 0 ? cx + g : (sx < 0 ? cx - g - bw + 1 : cx - (bw >> 1));
        const py = sy > 0 ? cy + g : (sy < 0 ? cy - g - bh + 1 : cy - (bh >> 1));
        if (px < zx0 || py < zy0 || px + bw > zx0 + ZS || py + bh > zy0 + ZS) continue;
        cands.push({ x: px, y: py, dir: [sx, sy] });
      }
    }
    cands.sort((a, b) => G.U.hash2(a.x, a.y, seed + 4242) - G.U.hash2(b.x, b.y, seed + 4242));
    const fits = (c, allowWater) => {
      let water = 0;
      for (let yy = c.y; yy < c.y + bh; yy++)
        for (let xx = c.x; xx < c.x + bw; xx++) {
          const i = yy * W + xx;
          if (bmap[i] >= 0) return null;                // 压到建筑上：不行
          if (terr[i] === T.WATER) water++;
        }
      if (water && !allowWater) return null;
      return { water };
    };
    let pick = null;
    for (const c of cands) if (fits(c, false)) { pick = c; break; }
    if (!pick) for (const c of cands) if (fits(c, true)) { pick = c; break; }   // 退让:允许填掉几格浅水
    if (!pick) return null;
    const [sx, sy] = pick.dir;

    const changed = [];
    const toRock = (xx, yy) => {
      if (!G.M.inB(xx, yy)) return;
      const i = yy * W + xx;
      if (bmap[i] >= 0) return;                          // 绝不覆盖建筑
      if (terr[i] !== T.ROCK) terr[i] = T.ROCK;
      changed.push(i);
    };
    for (let yy = pick.y; yy < pick.y + bh; yy++)
      for (let xx = pick.x; xx < pick.x + bw; xx++) toRock(xx, yy);

    // 朝向市政厅那一侧留出草地，采石场才有落脚点
    const apron = [];
    if (sx > 0) for (let yy = pick.y; yy < pick.y + bh; yy++) apron.push([pick.x - 1, yy]);
    else if (sx < 0) for (let yy = pick.y; yy < pick.y + bh; yy++) apron.push([pick.x + bw, yy]);
    if (sy > 0) for (let xx = pick.x; xx < pick.x + bw; xx++) apron.push([xx, pick.y - 1]);
    else if (sy < 0) for (let xx = pick.x; xx < pick.x + bw; xx++) apron.push([xx, pick.y + bh]);
    for (const [ax, ay] of apron) {
      if (!G.M.inB(ax, ay)) continue;
      const i = ay * W + ax;
      if (bmap[i] < 0 && terr[i] !== T.GRASS) terr[i] = T.GRASS;
    }

    // 再随机补几块，让它看起来像天然露头而不是一块方砖
    for (let k = 0; k < 5; k++) {
      const ex = pick.x - 1 + Math.floor(G.U.hash2(pick.x + k, pick.y, seed + 71) * (bw + 2));
      const ey = pick.y - 1 + Math.floor(G.U.hash2(pick.x, pick.y + k, seed + 137) * (bh + 2));
      if (G.M.inB(ex, ey) && terr[ey * W + ex] !== T.WATER) toRock(ex, ey);
    }
    return changed.length ? changed : null;
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
