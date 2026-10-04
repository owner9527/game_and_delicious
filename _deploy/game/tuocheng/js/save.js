// ===== 存档系统(localStorage) =====
// 设计书:多阶段解锁 + 存档
G.SV = (() => {
  const KEY = 'tc_save_';

  function ready() { return !!G.sim.state; }

  function save(slot, silent) {
    if (!ready() || !G.sim.started) return; // 背景世界/未开局不写档
    try {
      const data = {
        v: 1,
        seed: G.sim.state.seed,
        difficulty: G.sim.state.difficulty,
        savedAt: Date.now(),
        day: G.sim.state.day,
        state: JSON.parse(JSON.stringify(G.sim.state)),
        terr: Array.from(G.map.terr),
        zones: G.map.zones.map(z => ({ open: z.open })),
        builds: G.builds.map(b => ({
          id: b.id, type: b.type, x: b.x, y: b.y, day: b.day,
          f: b.fertileTiles || 0, w: b.water ? 1 : 0, fo: b.forest || 0,
        })),
        res: G.res.map(r => ({
          id: r.id, name: r.name, home: r.home, hx: r.hx, hy: r.hy,
          sick: r.sick, health: r.health, sat: r.sat, hap: r.hap,
        })),
      };
      localStorage.setItem(KEY + slot, JSON.stringify(data));
      if (!silent) G.UI.toast('💾 进度已保存', 'good');
    } catch (e) {
      G.UI.toast('保存失败:' + e.message, 'bad');
    }
  }

  function load(slot) {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(KEY + slot)); } catch (e) { data = null; }
    if (!data || data.v !== 1) { G.UI.toast('存档损坏或不存在', 'bad'); return false; }
    try {
      restore(data);
      G.UI.toast('📂 已读取存档(第 ' + data.day + ' 天)', 'good');
      return true;
    } catch (e) {
      G.UI.toast('读档失败:' + e.message, 'bad');
      return false;
    }
  }

  function restore(data) {
    G.M.genWorld(data.seed);
    G.map.terr.set(data.terr);
    data.zones.forEach((z, i) => { if (G.map.zones[i]) G.map.zones[i].open = !!z.open; });

    G.builds.length = 0;
    G._bid = 1;
    G.res.length = 0;
    G._rid = 1;
    G.walkers = [];
    G.map.bmap.fill(-1);

    for (const bd of data.builds) {
      const def = G.CFG.BUILDS[bd.type];
      if (!def) continue;
      const b = {
        id: bd.id, type: bd.type, def, x: bd.x, y: bd.y, w: def.w, h: def.h,
        staff: [], eff: def.workers > 0 ? 0 : 1, day: bd.day || 1, servedToday: 0,
        fertileTiles: bd.f || 0, water: !!bd.w, forest: bd.fo || 0, resIds: [],
      };
      for (let yy = b.y; yy < b.y + b.h; yy++)
        for (let xx = b.x; xx < b.x + b.w; xx++)
          G.map.bmap[G.M.idx(xx, yy)] = b.id;
      G.builds.push(b);
      G._bid = Math.max(G._bid, bd.id + 1);
    }

    for (const rd of data.res) {
      G.res.push({
        id: rd.id, name: rd.name, home: rd.home || 0, hx: rd.hx, hy: rd.hy,
        job: 0, servedJoy: 0, servedFaith: 0, coveredMed: false, coveredFaith: false, coveredJoy: false,
        sat: rd.sat, hap: rd.hap, health: rd.health, sick: !!rd.sick,
        joinedDay: 1,
      });
      G._rid = Math.max(G._rid, rd.id + 1);
    }

    G.P.rebuild();
    G.B.assignHousing();
    G.B.assignJobs();

    G.sim.state = data.state;
    G.sim.started = true;
    G.sim.dayT = 0;
    G.sim.speed = 1;
    G.sim.mods = { prodMult: 1, foodConsMult: 1, joyBonus: 0, taxMult: 1, sickBonus: 0, farmMult: 1 };
    G.EV.reset();

    const hall = G.builds.find(b => b.def.key === 'hall');
    G.RD.prerender(G.sim.seasonIdx());
    G.RD.centerOn(hall ? hall.x : G.CFG.MAPW >> 1, hall ? hall.y : G.CFG.MAPH >> 1);
    G.RD.newDay();
    G.UI.resetForGame();
  }

  function hasAny() {
    return !!(localStorage.getItem(KEY + 'manual') || localStorage.getItem(KEY + 'auto'));
  }
  function loadLatest() {
    if (localStorage.getItem(KEY + 'manual')) return load('manual');
    return load('auto');
  }

  return { save, load, hasAny, loadLatest, ready };
})();
