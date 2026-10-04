// ===== 可再生自然资源层:森林蓄积 / 矿脉 / 猎物 =====
// 玩家反馈"资源不会再生,采完就没了"。原本地图上的森林与岩石只是静态贴图:
// 既不会被采伐消耗,也永远不会长回来,伐木场的"毗邻森林 +1.2"更是写死在放置那一刻的常量。
// 这里把三类自然资源变成有"蓄积(stock)"的格子:
//   · 生产建筑(伐木场/采石场/猎人小屋)每天从附近的资源格抽取蓄积 → 产量受蓄积限制;
//   · 每个资源格按季节生长(越接近满蓄积长得越慢),所以采伐后能长回来;
//   · 每 probeDays 天有一次"矿脉勘探刷新",给最贫的几处矿脉补蓄积;
//   · 蓄积等级变化会记入 dirty 队列,交给渲染层增量重绘那一格(树林真的会变稀/变密)。
G.NAT = (() => {
  const T = G.CFG.TERR;

  let wood = null, ore = null, game = null;   // Float32Array:每格蓄积
  let forestIdx = [], oreIdx = [], gameIdx = [];
  let gameMask = null;                        // 猎场格掩码
  let dirty = new Set();                      // 视觉等级变化的格索引
  let ready = false;

  const today = { wood: 0, ore: 0, game: 0 }; // 今日实际采集量
  const growth = { wood: 0, ore: 0, game: 0 }; // 今日生长量
  let lastProbeDay = 1;

  // 资源蓄积 → 视觉等级(0..4),等级变化才需要重绘地形
  function tier(v, max) { return Math.min(4, Math.floor(v / max * 4.999)); }

  function arrOf(key) { return key === 'wood' ? wood : key === 'ore' ? ore : game; }
  function listOf(key) { return key === 'wood' ? forestIdx : key === 'ore' ? oreIdx : gameIdx; }

  // ---- 猎场:林缘或水边的草地/沃土,再按 hash 稀疏取样,形成"兽径"而不是满地猎物 ----
  function isGameHabitat(x, y) {
    const t = G.M.terr(x, y);
    if (t !== T.GRASS && t !== T.FERTILE) return false;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tt = G.M.terr(x + dx, y + dy);
        if (tt === T.FOREST || tt === T.WATER) return true;
      }
    }
    return false;
  }

  // ---- 生成 / 重置 ----
  function init() {
    const W = G.CFG.MAPW, H = G.CFG.MAPH;
    const n = W * H;
    const C = G.CFG.NAT;
    wood = new Float32Array(n); ore = new Float32Array(n); game = new Float32Array(n);
    gameMask = new Uint8Array(n);
    forestIdx = []; oreIdx = []; gameIdx = [];
    dirty.clear();
    const seed = (G.map.seed >>> 0);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = G.M.idx(x, y);
        const t = G.map.terr[i];
        if (t === T.FOREST) {
          // 开局不是满蓄积:老林/疏林混杂,才有"长回来"的空间
          wood[i] = C.wood.max * (0.45 + 0.55 * G.U.hash2(x, y, seed + 71));
          forestIdx.push(i);
        } else if (t === T.ROCK) {
          ore[i] = C.ore.max * (0.5 + 0.5 * G.U.hash2(x, y, seed + 137));
          oreIdx.push(i);
        }
        if (isGameHabitat(x, y) && G.U.hash2(x, y, seed + 211) < C.game.sparse) {
          game[i] = C.game.max * (0.35 + 0.65 * G.U.hash2(x, y, seed + 313));
          gameMask[i] = 1;
          gameIdx.push(i);
        }
      }
    }
    for (const k in today) { today[k] = 0; growth[k] = 0; }
    lastProbeDay = G.sim && G.sim.state ? G.sim.state.day : 1;
    ready = true;
  }

  // ---- 每日:按季节生长 + 勘探刷新 + 统计 ----
  // 统计只覆盖"已解锁领地":全图 5000 多格荒野的蓄积对玩家没有指导意义,
  // 面板要显示的是"我手上这片地还能砍多少、长得回来多快"。
  function openTile(i) {
    const x = i % G.CFG.MAPW, y = (i / G.CFG.MAPW) | 0;
    return G.M.zoneOpenAt(x, y);
  }

  function daily() {
    if (!ready) init();
    const s = G.sim.state;
    const C = G.CFG.NAT;
    const si = G.sim.seasonIdx();
    for (const k in today) { today[k] = 0; growth[k] = 0; }

    for (const key of ['wood', 'ore', 'game']) {
      const def = C[key], arr = arrOf(key), list = listOf(key);
      const rate = def.rate[si], max = def.max;
      let g = 0;
      for (let n = 0; n < list.length; n++) {
        const i = list[n];
        const v = arr[i];
        if (v < max) {
          // logistic 生长:越接近满蓄积越慢,配合 floor 让荒林也能慢慢回绿
          const nv = Math.min(max, v + rate * (1 - v / max) + C.floor);
          if (tier(v, max) !== tier(nv, max)) dirty.add(i);
          arr[i] = nv;
          if (openTile(i)) g += nv - v;
        }
      }
      growth[key] = g;
    }

    // 矿脉勘探刷新(约半年一次):给最贫的几处矿脉补蓄积,让"石料收入"不会永久枯竭
    if (s && s.day - lastProbeDay >= C.probeDays) {
      lastProbeDay = s.day;
      const cand = oreIdx.filter(i => ore[i] < C.ore.max * 0.5)
        .sort((a, b) => ore[a] - ore[b])
        .slice(0, C.probeTiles);
      for (const i of cand) {
        const nv = Math.max(ore[i], C.ore.max * C.probeFrac);
        if (tier(ore[i], C.ore.max) !== tier(nv, C.ore.max)) dirty.add(i);
        ore[i] = nv;
      }
      if (cand.length && G.UI) {
        G.UI.log(`⛏ 勘探队探明了 ${cand.length} 处浅层矿脉,石料蓄积回升。`, 'good');
      }
    }
  }

  // ---- 采集:从建筑周围 ring 格内的资源格按蓄积比例抽取,返回实际获得的量 ----
  function nearby(b, key) {
    const C = G.CFG.NAT[key];
    const ring = C.ring;
    const out = [];
    for (let yy = b.y - ring; yy <= b.y + b.h - 1 + ring; yy++) {
      for (let xx = b.x - ring; xx <= b.x + b.w - 1 + ring; xx++) {
        if (!G.M.inB(xx, yy)) continue;
        const i = G.M.idx(xx, yy);
        if (key === 'wood' && G.map.terr[i] === T.FOREST) out.push(i);
        else if (key === 'ore' && G.map.terr[i] === T.ROCK) out.push(i);
        else if (key === 'game' && gameMask[i]) out.push(i);
      }
    }
    return out;
  }

  function draw(b, key, desired) {
    if (!ready || desired <= 0) return 0;
    const C = G.CFG.NAT[key], max = C.max, arr = arrOf(key);
    const floor = max * (C.floorFrac === undefined ? 0 : C.floorFrac);
    // 只采到 floor 以上:留下种树/矿柱,资源永远不会被剃光
    const idx = nearby(b, key).filter(i => arr[i] > floor);
    if (!idx.length) return 0;
    let avail = 0;
    for (const i of idx) avail += Math.max(0, arr[i] - floor);
    if (avail <= 0) return 0;
    const take = Math.min(desired, avail);
    // 按可用蓄积比例分配,避免总啃同一格
    let taken = 0;
    for (const i of idx) {
      const room = Math.max(0, arr[i] - floor);
      const cut = Math.min(room, take * (room / avail));
      if (cut <= 0) continue;
      if (tier(arr[i], max) !== tier(arr[i] - cut, max)) dirty.add(i);
      arr[i] -= cut; taken += cut;
    }
    // 浮点残差补齐
    let left = take - taken;
    for (const i of idx) {
      if (left <= 1e-6) break;
      const room = Math.max(0, arr[i] - floor);
      const cut = Math.min(room, left);
      if (cut <= 0) continue;
      if (tier(arr[i], max) !== tier(arr[i] - cut, max)) dirty.add(i);
      arr[i] -= cut; taken += cut; left -= cut;
    }
    today[key] += taken;
    return taken;
  }

  // ---- 查询接口(UI / 模拟用) ----
  // 建筑周围资源:格数 / 当前蓄积 / 满蓄积 / 蓄积率
  function near(b, key) {
    const C = G.CFG.NAT[key], arr = arrOf(key);
    const idx = nearby(b, key);
    let total = 0;
    for (const i of idx) total += arr[i];
    const cap = idx.length * C.max;
    return { tiles: idx.length, total, cap, ratio: cap > 0 ? total / cap : 0, max: C.max };
  }

  // 周边"等效满格数" —— 伐木场森林加成用(半枯的林只算半格,与原 adjForest 上限 8 格一致)
  function effective(b, key, capTiles) {
    const C = G.CFG.NAT[key], arr = arrOf(key);
    const idx = nearby(b, key);
    let eq = 0;
    for (const i of idx) eq += arr[i] / C.max;
    return Math.min(eq, capTiles === undefined ? 8 : capTiles);
  }

  function total(key) {
    const list = listOf(key), arr = arrOf(key);
    let t = 0;
    for (const i of list) if (openTile(i)) t += arr[i];
    return t;
  }
  function capacity(key) {
    const list = listOf(key);
    let c = 0;
    for (const i of list) if (openTile(i)) c += G.CFG.NAT[key].max;
    return c;
  }
  // 全图总量(测试/调试用)
  function totalAll(key) {
    const list = listOf(key), arr = arrOf(key);
    let t = 0;
    for (const i of list) t += arr[i];
    return t;
  }

  // 汇总:总量 / 上限 / 今日生长 / 今日采集 / 净变化
  function summary() {
    const out = {};
    for (const key of ['wood', 'ore', 'game']) {
      const t = total(key), c = capacity(key);
      out[key] = {
        name: G.CFG.NAT[key].name, icon: G.CFG.NAT[key].icon,
        total: t, cap: c, ratio: c > 0 ? t / c : 0,
        grow: growth[key], harvest: today[key], net: growth[key] - today[key],
      };
    }
    return out;
  }

  function ratioAt(i, key) {
    if (!ready) return 0;
    const max = G.CFG.NAT[key].max;
    return max > 0 ? arrOf(key)[i] / max : 0;
  }
  function stockAt(i, key) { return ready ? arrOf(key)[i] : 0; }
  function isGame(i) { return !!gameMask && gameMask[i] === 1; }
  function gameNodes() { return gameIdx; }

  // 渲染层取走一批待重绘的格(每帧限量,避免卡顿)
  function takeDirty(n) {
    if (!dirty.size) return null;
    const out = [];
    for (const i of dirty) {
      out.push(i);
      dirty.delete(i);
      if (out.length >= n) break;
    }
    return out;
  }
  function dirtyCount() { return dirty.size; }
  function markAllDirty() { if (!ready) return; for (const i of forestIdx) dirty.add(i); for (const i of oreIdx) dirty.add(i); }

  // ---- 存档 ----
  function serialize() {
    if (!ready) return null;
    const r2 = v => Math.round(v * 100) / 100;
    return {
      w: forestIdx.map(i => r2(wood[i])),
      o: oreIdx.map(i => r2(ore[i])),
      g: gameIdx.map(i => r2(game[i])),
    };
  }
  function restore(data) {
    init();
    if (!data) return;
    if (data.w) data.w.forEach((v, n) => { if (n < forestIdx.length) wood[forestIdx[n]] = v; });
    if (data.o) data.o.forEach((v, n) => { if (n < oreIdx.length) ore[oreIdx[n]] = v; });
    if (data.g) data.g.forEach((v, n) => { if (n < gameIdx.length) game[gameIdx[n]] = v; });
    markAllDirty();
  }

  // ---- 调试/测试用:直接把某建筑周围蓄积灌满 ----
  function fill(b, key, frac) {
    const C = G.CFG.NAT[key], arr = arrOf(key);
    for (const i of nearby(b, key)) arr[i] = C.max * (frac === undefined ? 1 : frac);
  }

  // ---- 读档后补出来的岩石格:登记进矿脉索引并给一份蓄积 ----
  // 存档存的是"整张地形 + 按岩石下标顺序排列的蓄积数组"，读档时如果地形被
  // ensureQuarryRock 补了新的岩石格，这些格子不在这份数组里 —— 不登记的话
  // 它们既画不出蓄积也采不到矿(看起来就是"一堆没用的石头")。
  function adoptTile(i) {
    if (!ready || i < 0 || i >= ore.length) return;
    if (G.map.terr[i] !== T.ROCK) return;
    if (ore[i] <= 0) {
      const x = i % G.CFG.MAPW, y = (i / G.CFG.MAPW) | 0;
      ore[i] = G.CFG.NAT.ore.max * (0.6 + 0.4 * G.U.hash2(x, y, (G.map.seed >>> 0) + 137));
      if (oreIdx.indexOf(i) < 0) oreIdx.push(i);
    }
    // 岩石上不该有猎物
    if (gameMask[i]) {
      game[i] = 0; gameMask[i] = 0;
      const k = gameIdx.indexOf(i);
      if (k >= 0) gameIdx.splice(k, 1);
    }
    dirty.add(i);
  }

  return {
    init, daily, draw, near, effective, nearby, summary, total, totalAll, capacity,
    ratioAt, stockAt, isGame, gameNodes, isGameHabitat, openTile,
    takeDirty, dirtyCount, markAllDirty, serialize, restore, fill, tier, adoptTile,
    get ready() { return ready; },
    get today() { return today; },
    get growth() { return growth; },
  };
})();
