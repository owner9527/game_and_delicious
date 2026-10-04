// ===== 寻路系统:多源 Dijkstra(服务范围) + A*(居民行走) =====
// 设计书:居民 AI 用轻量寻路(BFS/A*)。道路代价 1、野地代价 4,
// 因此服务半径本质上"沿路丈量",鼓励玩家规划路网。
G.P = (() => {
  const W = () => G.CFG.MAPW, H = () => G.CFG.MAPH;

  // 通行代价表:0=不可通行。随道路变化重建。
  function rebuild() {
    const cost = new Uint8Array(W() * H());
    const T = G.CFG.TERR;
    for (let i = 0; i < cost.length; i++) {
      const t = G.map.terr[i];
      if (t === T.WATER || t === T.ROCK || t === T.FOREST) continue;
      cost[i] = G.CFG.ECON.walkGrass;
    }
    for (const b of G.builds) {
      if (b.type === 'road') {
        cost[G.M.idx(b.x, b.y)] = G.CFG.ECON.walkRoad;
      }
    }
    G.pathCost = cost;
    // 建筑门位缓存失效
    for (const b of G.builds) b._doors = null;
  }

  // 建筑的"门位":紧邻建筑边缘的可通行格
  function doors(b) {
    if (b._doors) return b._doors;
    const d = [];
    const cost = G.pathCost;
    for (let yy = b.y - 1; yy <= b.y + b.h; yy++) {
      for (let xx = b.x - 1; xx <= b.x + b.w; xx++) {
        const onEdge = (xx === b.x - 1 || xx === b.x + b.w || yy === b.y - 1 || yy === b.y + b.h);
        if (!onEdge || !G.M.inB(xx, yy)) continue;
        if (cost[G.M.idx(xx, yy)] > 0) d.push({ x: xx, y: yy });
      }
    }
    b._doors = d;
    return d;
  }

  // 建筑是否毗邻道路(提供服务的前提;市政厅豁免)
  function connected(b) {
    if (b.def.key === 'hall') return true;
    for (let yy = b.y - 1; yy <= b.y + b.h; yy++)
      for (let xx = b.x - 1; xx <= b.x + b.w; xx++) {
        const onEdge = (xx === b.x - 1 || xx === b.x + b.w || yy === b.y - 1 || yy === b.y + b.h);
        if (onEdge && G.M.isRoad(xx, yy)) return true;
      }
    return false;
  }

  // 多源 Dijkstra:从一组门位出发,返回全图距离数组(单位:代价)
  function reach(sources, maxDist) {
    const n = W() * H();
    const dist = new Float32Array(n).fill(Infinity);
    const cost = G.pathCost;
    // 小顶堆
    const heap = [];
    const push = (i, d) => { heap.push({ i, d }); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p].d <= heap[c].d) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let l = c * 2 + 1, r = l + 1, m = c; if (l < heap.length && heap[l].d < heap[m].d) m = l; if (r < heap.length && heap[r].d < heap[m].d) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    for (const s of sources) {
      const i = G.M.idx(s.x, s.y);
      if (cost[i] > 0 && dist[i] > 0) { dist[i] = 0; push(i, 0); }
    }
    while (heap.length) {
      const { i, d } = pop();
      if (d > dist[i]) continue;
      if (d > maxDist) continue;
      const x = i % W(), y = (i / W()) | 0;
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nb) {
        if (!G.M.inB(nx, ny)) continue;
        const ni = ny * W() + nx;
        const c = cost[ni];
        if (c === 0) continue;
        const nd = d + c;
        if (nd < dist[ni] && nd <= maxDist) { dist[ni] = nd; push(ni, nd); }
      }
    }
    return dist;
  }

  // 建筑(家)到距离场的最近门位距离;Infinity 表示不通
  function distOf(dist, b) {
    let m = Infinity;
    for (const d of doors(b)) {
      const v = dist[G.M.idx(d.x, d.y)];
      if (v < m) m = v;
    }
    return m;
  }

  // A* 寻路(供可见居民行走),返回路径点数组或 null
  function path(sx, sy, tx, ty) {
    const cost = G.pathCost;
    if (!G.M.inB(sx, sy) || !G.M.inB(tx, ty)) return null;
    if (cost[G.M.idx(sx, sy)] === 0 || cost[G.M.idx(tx, ty)] === 0) return null;
    const n = W() * H();
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const open = [];
    const fScore = new Float32Array(n).fill(Infinity);
    const h = i => {
      const x = i % W(), y = (i / W()) | 0;
      return (Math.abs(x - tx) + Math.abs(y - ty)) * G.CFG.ECON.walkRoad;
    };
    const start = G.M.idx(sx, sy), goal = G.M.idx(tx, ty);
    gScore[start] = 0; fScore[start] = h(start);
    open.push(start);
    const inOpen = new Uint8Array(n); inOpen[start] = 1;
    let guard = 0;
    while (open.length && guard++ < 20000) {
      // 取 f 最小
      let mi = 0;
      for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[mi]]) mi = k;
      const cur = open[mi];
      open[mi] = open[open.length - 1]; open.pop();
      inOpen[cur] = 0;
      if (cur === goal) {
        const out = [];
        let c = cur;
        while (c !== -1) { out.push({ x: c % W(), y: (c / W()) | 0 }); c = came[c]; }
        return out.reverse();
      }
      const cx = cur % W(), cy = (cur / W()) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (!G.M.inB(nx, ny)) continue;
        const ni = ny * W() + nx;
        const c = cost[ni];
        if (c === 0) continue;
        const tg = gScore[cur] + c;
        if (tg < gScore[ni]) {
          came[ni] = cur; gScore[ni] = tg; fScore[ni] = tg + h(ni);
          if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
        }
      }
    }
    return null;
  }

  return { rebuild, doors, connected, reach, distOf, path };
})();
