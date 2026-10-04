// ===== 建筑系统:放置/拆除/员工调配/需求-供给网络 =====
G.builds = [];
G._bid = 1;

G.B = (() => {

  function byId(id) { return G.builds.find(b => b.id === id) || null; }
  function count(type) { let n = 0; for (const b of G.builds) if (b.type === type) n++; return n; }
  function houses() { return G.builds.filter(b => b.def.housing > 0); }
  function producers() { return G.builds.filter(b => b.def.produce); }
  function storages() { return G.builds.filter(b => b.def.storage); }
  function servicesOf(need) {
    return G.builds.filter(b => b.def.service && b.def.service.need === need);
  }
  function auras(kind) {
    return G.builds.filter(b => b.def.aura && b.def.aura.kind === kind && b.eff > 0);
  }

  // ---- 放置合法性 ----
  function canPlace(type, x, y) {
    const def = G.CFG.BUILDS[type];
    if (!def || def.noBuild) return { ok: false, reason: '无法建造' };
    if (def.stage > G.sim.state.stage) return { ok: false, reason: `需要达到「${G.CFG.STAGES[def.stage - 1].name}」阶段` };
    const s = G.sim.state;
    for (let yy = y; yy < y + def.h; yy++) {
      for (let xx = x; xx < x + def.w; xx++) {
        if (!G.M.inB(xx, yy)) return { ok: false, reason: '超出世界边界' };
        if (!G.M.zoneOpenAt(xx, yy)) return { ok: false, reason: '该领地尚未解锁' };
        if (G.M.bAt(xx, yy)) return { ok: false, reason: '地块已被占用' };
        if (!G.M.terrOk(G.M.terr(xx, yy), def)) return { ok: false, reason: '地形不适合(需草地/沃土)' };
      }
    }
    if (def.rockReq && G.M.rockNear(x, y, def.w, def.h, 2) < def.rockReq) {
      return { ok: false, reason: `附近岩石不足(需 ${def.rockReq} 块)` };
    }
    if (def.gameReq && G.NAT.ready && huntTiles(x, y, def) < def.gameReq) {
      return { ok: false, reason: `附近没有猎场(需 ${def.gameReq} 处兽径,找林缘或水边)` };
    }
    if ((def.cost.gold || 0) > s.gold) return { ok: false, reason: '金币不足' };
    if ((def.cost.wood || 0) > s.wood) return { ok: false, reason: '木材不足' };
    if ((def.cost.stone || 0) > s.stone) return { ok: false, reason: '石料不足' };
    return { ok: true };
  }

  // ---- 放置 ----
  // 猎人小屋周围的猎场格数(与 G.NAT 的 ring 一致,不消耗土地)
  function huntTiles(x, y, def) {
    let n = 0;
    const r = G.CFG.NAT.game.ring;
    for (let yy = y - r; yy <= y + def.h - 1 + r; yy++)
      for (let xx = x - r; xx <= x + def.w - 1 + r; xx++)
        if (G.M.inB(xx, yy) && G.NAT.isGame(G.M.idx(xx, yy))) n++;
    return n;
  }

  function place(type, x, y, free = false) {
    const def = G.CFG.BUILDS[type];
    const chk = canPlace(type, x, y);
    if (!chk.ok && !free) return chk;
    if (!free) {
      const s = G.sim.state;
      s.gold -= def.cost.gold || 0;
      s.wood -= def.cost.wood || 0;
      s.stone -= def.cost.stone || 0;
    }
    const b = {
      id: G._bid++, type, def, x, y, w: def.w, h: def.h,
      staff: [], eff: 0, day: G.sim ? G.sim.state.day : 1,
      servedToday: 0,
      // 落地加成
      fertileTiles: 0, water: false, forest: 0, gameTiles: 0,
      // 上一日结算快照(UI 展示用)
      lastOut: null, lastYield: 1, outNote: '',
    };
    if (def.farm && def.fertileBonus) {
      const T = G.CFG.TERR;
      for (let yy = y; yy < y + h0(def); yy++)
        for (let xx = x; xx < x + w0(def); xx++)
          if (G.M.terr(xx, yy) === T.FERTILE) b.fertileTiles++;
      b.water = G.M.waterNear(x, y, def.w, def.h, 1);
    }
    if (def.forestBonus) b.forest = G.M.adjForest(x, y, def.w, def.h);
    if (def.gameReq) b.gameTiles = huntTiles(x, y, def);
    for (let yy = y; yy < y + b.h; yy++)
      for (let xx = x; xx < x + b.w; xx++)
        G.map.bmap[G.M.idx(xx, yy)] = b.id;
    G.builds.push(b);
    G.P.rebuild(); // 通行表与门位缓存可能已变化
    return { ok: true, b };
  }
  function w0(def) { return def.w; }
  function h0(def) { return def.h; }

  // ---- 拆除 ----
  function remove(b, silent = false) {
    const i = G.builds.indexOf(b);
    if (i < 0) return;
    // 退款 50%
    if (!silent) {
      const s = G.sim.state;
      s.gold += Math.floor((b.def.cost.gold || 0) * 0.5);
      s.wood += Math.floor((b.def.cost.wood || 0) * 0.5);
      s.stone += Math.floor((b.def.cost.stone || 0) * 0.5);
    }
    for (let yy = b.y; yy < b.y + b.h; yy++)
      for (let xx = b.x; xx < b.x + b.w; xx++)
        G.map.bmap[G.M.idx(xx, yy)] = -1;
    G.builds.splice(i, 1);
    // 居民善后
    for (const r of G.res) {
      if (r.home === b.id) r.home = 0;
      if (r.job === b.id) r.job = 0;
      if (r.servedJoy === b.id) r.servedJoy = 0;
    }
    G.RD.onBuildingRemoved(b);
    G.P.rebuild();
    if (!silent) G.UI.log(`拆除了 ${b.def.name}`, 'info');
  }

  // ---- 存储上限 ----
  function caps() {
    const c = Object.assign({}, G.CFG.BASECAP);
    for (const b of storages()) {
      if (b.eff <= 0 && b.def.workers > 0) { /* 无员工仓库按半效计 */ }
      const mult = b.def.workers > 0 ? (b.eff > 0 ? 1 : 0.5) : 1;
      if (b.def.storage.food) c.food += b.def.storage.food * mult;
      if (b.def.storage.wood) c.wood += b.def.storage.wood * mult;
      if (b.def.storage.stone) c.stone += b.def.storage.stone * mult;
    }
    return c;
  }

  // ---- 员工调配(每日) ----
  // 改动依据:原来是"按分类优先级先到先得" —— 优先级是 医疗>信仰>娱乐>粮食>材料,
  // 于是人口不足时伐木场/采石场直接拿到 0 人、eff=0、当天零产出
  // (实测人口 12 时采石场只有 0.25 效率,20 天只出 23 石料),玩家反馈"基建建好了没什么收入"。
  // 现在改为:① 先按各建筑的用工需求**比例分摊**人手,保证没有建筑被饿死;
  //          ② 剩余名额再按分类优先级补足(医疗 > 粮食 > 材料 > 民生 > 娱乐 > 信仰)。
  const CAT_RANK = { med: 0, food: 1, prod: 2, civic: 3, joy: 4, faith: 5, house: 6 };
  function assignJobs() {
    const pool = G.res.filter(r => !r.sick);
    for (const r of G.res) r.job = 0;
    for (const b of G.builds) { b.staff = []; b.eff = b.def.workers > 0 ? 0 : 1; }
    const need = G.builds.filter(b => b.def.workers > 0);
    need.sort((a, b2) => (CAT_RANK[a.def.cat] - CAT_RANK[b2.def.cat]) || (a.id - b2.id));
    const demand = need.reduce((a, b) => a + b.def.workers, 0);
    const P = pool.length;
    if (!need.length || P <= 0) return { employed: 0, workforce: P };
    const target = Math.min(P, demand);

    const quota = need.map(b => Math.min(b.def.workers, Math.floor(b.def.workers * target / demand)));
    let used = quota.reduce((a, v) => a + v, 0);
    // 余量:按优先级顺序轮转补足,每栋不超过自己的编制
    let guard = 0;
    while (used < target && guard++ < 2000) {
      let progressed = false;
      for (let i = 0; i < need.length && used < target; i++) {
        if (quota[i] < need[i].def.workers) { quota[i]++; used++; progressed = true; }
      }
      if (!progressed) break;
    }

    let pi = 0;
    need.forEach((b, i) => {
      const take = Math.max(0, Math.min(quota[i], pool.length - pi));
      for (let k = 0; k < take; k++) { b.staff.push(pool[pi].id); pool[pi].job = b.id; pi++; }
      b.eff = take / b.def.workers;
    });
    return { employed: pi, workforce: P };
  }

  // 缺工的生产建筑(用于日报/面板把"为什么没收入"讲清楚)
  function stalledProducers() {
    return producers().filter(b => b.def.workers > 0 && b.eff <= 0);
  }
  function stalledServices() {
    return G.builds.filter(b => b.def.service && b.def.workers > 0 && b.eff <= 0);
  }

  // ---- 需求-供给网络:服务分配(每日) ----
  // 返回 { served:Set(resId), covered:Set(resId), assign: Map(resId → bId) }
  function assignServices(need) {
    const served = new Set(), covered = new Set(), assign = new Map();
    const svcs = servicesOf(need).filter(b => b.eff > 0 && G.P.connected(b));
    for (const b of svcs) b.servedToday = 0;
    if (!svcs.length) return { served, covered, assign };
    const homes = houses().filter(h => h.resIds && h.resIds.length);
    for (const b of svcs) {
      const radius = b.def.service.radius;
      const cap = Math.max(1, Math.round(b.def.service.cap * b.eff));
      const dist = G.P.reach(G.P.doors(b), radius);
      const cand = [];
      const resById = {};
      for (const r of G.res) resById[r.id] = r;
      for (const h of homes) {
        const d = G.P.distOf(dist, h);
        if (d <= radius) for (const rid of h.resIds) cand.push({ rid, d });
      }
      // 医疗优先救治病患;其余按最近优先
      if (need === 'medical') {
        cand.sort((a, b2) => ((resById[a.rid].sick ? 0 : 1) - (resById[b2.rid].sick ? 0 : 1)) || (a.d - b2.d));
      } else {
        cand.sort((a, b2) => a.d - b2.d);
      }
      let left = cap;
      for (const c of cand) {
        covered.add(c.rid);
        if (left > 0 && !served.has(c.rid)) {
          served.add(c.rid); assign.set(c.rid, b.id);
          b.servedToday++; left--;
        }
      }
    }
    return { served, covered, assign };
  }

  // ---- 住房分配 ----
  function assignHousing() {
    for (const h of houses()) h.resIds = [];
    for (const r of G.res) {
      const home = byId(r.home);
      if (home && home.def.housing > 0) home.resIds.push(r.id);
      else r.home = 0;
    }
    const homeless = G.res.filter(r => !r.home);
    if (!homeless.length) return;
    // 优先住进舒适度高的房子,同舒适度取更近的
    const hs = houses().map(h => ({ h, free: h.def.housing - (h.resIds ? h.resIds.length : 0) }))
      .filter(o => o.free > 0)
      .sort((a, b2) => (b2.h.def.comfort - a.h.def.comfort) || (a.h.id - b2.h.id));
    for (const r of homeless) {
      let best = null, bd = Infinity;
      for (const o of hs) {
        if (o.free <= 0) continue;
        const d = Math.abs(o.h.x - r.hx) + Math.abs(o.h.y - r.hy);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        r.home = best.h.id;
        if (!best.h.resIds) best.h.resIds = [];
        best.h.resIds.push(r.id);
        best.free--;
      }
    }
  }

  // ---- 全局加成 ----
  function eduBonus() {
    let v = 0;
    const sch = auras('edu').filter(b => b.def.key === 'school').length;
    const uni = auras('edu').filter(b => b.def.key === 'university').length;
    v += Math.min(3, sch) * 0.08 + Math.min(2, uni) * 0.15;
    return v;
  }

  // 某点是否在某类光环(水井/治安所)内
  function inAura(kind, x, y) {
    return auras(kind).some(b => {
      const r = b.def.aura.radius;
      if (r <= 0) return true;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return Math.abs(cx - (x + 0.5)) <= r && Math.abs(cy - (y + 0.5)) <= r;
    });
  }
  function wellCovered(x, y) { return inAura('well', x, y); }
  function guardCovered(x, y) { return inAura('guard', x, y); }

  return {
    byId, count, houses, producers, storages, servicesOf, auras,
    canPlace, place, remove, caps, assignJobs, assignServices, assignHousing,
    eduBonus, wellCovered, guardCovered,
    stalledProducers, stalledServices, huntTiles,
  };
})();
