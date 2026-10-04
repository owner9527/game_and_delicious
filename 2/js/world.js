/* ============================================================
 * world.js — 程序化无限世界:分块生成 / 资源节点 / 通行判定 / A*
 * 每块 16×16 格;按种子动态生成,探索即扩张,地图无边界。
 * ============================================================ */
'use strict';

const World = {
  seed: 1,
  chunks: new Map(),      // "cx,cy" -> {nodes: Map(idx->node), dirty}
  savedChunks: new Map(), // 存档恢复:脏块的节点覆盖

  key(cx, cy){ return cx + ',' + cy; },

  init(seed){
    this.seed = seed >>> 0;
    this.chunks.clear();
    this.savedChunks.clear();
  },

  /* ---------- 地形(确定性,可随时重算,不需存储) ---------- */
  terrainAt(tx, ty){
    let e = fbm(tx * 0.042, ty * 0.042, this.seed, 4);
    // 出生点附近强制为陆地
    const d0 = Math.sqrt(tx*tx + ty*ty);
    if(d0 < 7) e = Math.max(e, 0.5 - d0 * 0.02);
    if(e < 0.345) return 0;            // 水域
    if(e < 0.405) return 1;            // 沙滩
    return 2;                          // 草原
  },
  moistureAt(tx, ty){ return fbm(tx * 0.075 + 999, ty * 0.075, this.seed + 7777, 3); },
  oreFieldAt(tx, ty){ return fbm(tx * 0.10 + 555, ty * 0.10, this.seed + 3333, 2); },

  /* ---------- 分块生成 ---------- */
  getChunk(cx, cy){
    const k = this.key(cx, cy);
    let ch = this.chunks.get(k);
    if(ch) return ch;
    ch = { nodes: new Map(), dirty: false };
    const saved = this.savedChunks.get(k);
    if(saved){
      for(const [idx, node] of saved) ch.nodes.set(idx, node);
      ch.dirty = true;
      this.chunks.set(k, ch);
      return ch;
    }
    this.genChunk(cx, cy, ch);
    this.chunks.set(k, ch);
    return ch;
  },

  /* 读档:恢复脏块节点覆盖表(idx -> node) */
  loadSaved(list){
    this.savedChunks.clear();
    for(const c of list){
      const nodes = new Map();
      for(const n of c.nodes){
        nodes.set(n.i, { t: n.t, amt: n.a, rich: !!n.r, marked: !!n.m });
      }
      this.savedChunks.set(this.key(c.cx, c.cy), nodes);
    }
  },

  genChunk(cx, cy, ch){
    const seed = this.seed;
    // 分块资源密度:每块 0.65~1.35,制造贫富差异
    const dens = 0.65 + hash2i(cx * 7 + 3, cy * 11 + 5, seed + 505) * 0.7;
    const far = Math.sqrt(cx*cx + cy*cy) * CHUNK; // 距出生点距离(格)
    for(let ly = 0; ly < CHUNK; ly++){
      for(let lx = 0; lx < CHUNK; lx++){
        const tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
        const terr = this.terrainAt(tx, ty);
        if(terr === 0) continue;
        const r = hash2i(tx, ty, seed + 11);
        const mo = this.moistureAt(tx, ty);
        const of = this.oreFieldAt(tx, ty);
        let node = null;
        if(terr === 2){
          const boost = far < 16 ? 1.5 : 1; // 出生区资源略密集,保证开局
          if(mo > 0.60 && r < 0.30 * dens * boost) node = 'tree';
          else if(of > 0.68 && r < 0.55 * dens * boost) node = 'iron';
          else if(of < 0.26 && r < 0.42 * dens * boost) node = 'coal';
          else if(mo > 0.44 && mo < 0.60 && r > 0.94) node = 'berry';
          else if(r > 0.965) node = 'rock';
          else if(r > 0.95 && r < 0.965) node = 'rock';
        } else { // 沙滩
          if(r > 0.94) node = 'rock';
        }
        // 远方稀有的水晶簇
        if(!node && terr === 2 && far > 45 && hash2i(tx, ty, seed + 99) < 0.028) node = 'crystal';
        if(node){
          const def = NODES[node];
          const rich = node !== 'tree' && node !== 'berry' && hash2i(tx, ty, seed + 66) < 0.08;
          ch.nodes.set(ly * CHUNK + lx, {
            t: node,
            amt: Math.round(def.amount * (rich ? RICH_MULT : 1)),
            rich: rich, marked: false,
          });
        }
      }
    }
  },

  nodeAt(tx, ty){
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const ch = this.getChunk(cx, cy);
    const idx = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    return { ch, idx, node: ch.nodes.get(idx) || null };
  },
  setNode(tx, ty, node){
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const ch = this.getChunk(cx, cy);
    const idx = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    if(node) ch.nodes.set(idx, node); else ch.nodes.delete(idx);
    ch.dirty = true;
  },
  /* 事件:生成富集矿脉 */
  spawnRichNodes(px, py, count, rnd){
    let placed = 0;
    for(let tries = 0; tries < count * 30 && placed < count; tries++){
      const a = rnd() * Math.PI * 2, d = 8 + rnd() * 8;
      const tx = Math.floor(px / TILE + Math.cos(a) * d);
      const ty = Math.floor(py / TILE + Math.sin(a) * d);
      if(this.terrainAt(tx, ty) !== 2) continue;
      const { node } = this.nodeAt(tx, ty);
      if(node) continue;
      if(Buildings.buildingAt(tx, ty)) continue;
      const type = rnd() < 0.45 ? 'iron' : (rnd() < 0.6 ? 'coal' : 'crystal');
      const def = NODES[type];
      this.setNode(tx, ty, { t: type, amt: Math.round(def.amount * RICH_MULT), rich: true, marked: true });
      placed++;
    }
    return placed;
  },

  /* ---------- 通行判定(寻路统一入口) ---------- */
  walkable(tx, ty){
    if(this.terrainAt(tx, ty) === 0) return false;
    if(Buildings.blockAt(tx, ty)) return false;
    return true;
  },

  /* ---------- A* 寻路(限幅,八方向,禁切角) ---------- */
  findPath(sx, sy, tgx, tgy, maxExp){
    maxExp = maxExp || 2600;
    if(sx === tgx && sy === tgy) return [];
    if(Math.abs(tgx - sx) > 64 || Math.abs(tgy - sy) > 64) return null;
    if(!this.walkable(tgx, tgy)){
      // 目标格不可走时,找它旁边可走的替代格
      let alt = null;
      for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        if(this.walkable(tgx + dx, tgy + dy)){ alt = [tgx + dx, tgy + dy]; break; }
      }
      if(!alt) return null;
      tgx = alt[0]; tgy = alt[1];
    }
    const open = [{ x: sx, y: sy, g: 0, f: 0, parent: null }];
    const seen = new Map(); seen.set(sx + ',' + sy, 0);
    let exp = 0;
    const H = (x, y) => {
      const dx = Math.abs(x - tgx), dy = Math.abs(y - tgy);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    while(open.length && exp < maxExp){
      // 取 f 最小(线性扫描,节点量小够用)
      let bi = 0;
      for(let i = 1; i < open.length; i++) if(open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      exp++;
      if(cur.x === tgx && cur.y === tgy){
        const path = [];
        let n = cur;
        while(n.parent){ path.push({ x: n.x, y: n.y }); n = n.parent; }
        path.reverse();
        return path;
      }
      for(let dy = -1; dy <= 1; dy++){
        for(let dx = -1; dx <= 1; dx++){
          if(dx === 0 && dy === 0) continue;
          const nx = cur.x + dx, ny = cur.y + dy;
          if(!this.walkable(nx, ny)) continue;
          if(dx !== 0 && dy !== 0){
            if(!this.walkable(cur.x + dx, cur.y) || !this.walkable(cur.x, cur.y + dy)) continue;
          }
          const ng = cur.g + (dx !== 0 && dy !== 0 ? 1.414 : 1);
          const k = nx + ',' + ny;
          const old = seen.get(k);
          if(old !== undefined && old <= ng) continue;
          seen.set(k, ng);
          open.push({ x: nx, y: ny, g: ng, f: ng + H(nx, ny), parent: cur });
        }
      }
    }
    return null;
  },

  /* ---------- 视野内节点遍历(渲染 / 框选用) ---------- */
  eachNodeInRect(tx0, ty0, tx1, ty1, fn){
    const c0x = Math.floor(tx0 / CHUNK), c1x = Math.floor(tx1 / CHUNK);
    const c0y = Math.floor(ty0 / CHUNK), c1y = Math.floor(ty1 / CHUNK);
    for(let cy = c0y; cy <= c1y; cy++){
      for(let cx = c0x; cx <= c1x; cx++){
        const ch = this.getChunk(cx, cy);
        for(const [idx, node] of ch.nodes){
          const lx = idx % CHUNK, ly = (idx - lx) / CHUNK;
          const tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
          if(tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1) fn(tx, ty, node, ch, idx);
        }
      }
    }
  },
};
