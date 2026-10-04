// 拓城记 体验修复 —— 共用测试工具(注入到页面里执行的辅助函数)
window.__T = (function () {
  function halls() { return G.builds.filter(b => b.def.key === 'hall'); }
  function terrCount(t) { let n = 0; for (let i = 0; i < G.map.terr.length; i++) if (G.map.terr[i] === t) n++; return n; }
  function terrHash() { let h = 0; for (let i = 0; i < G.map.terr.length; i++) h = (Math.imul(h, 31) + G.map.terr[i]) | 0; return h; }

  // 在中央区块里找第一个合法放置点
  function findSpot(type) { return findBest(type, null); }

  // 在中央区块里找“评分最高”的合法放置点(临时补钱,只判断位置,不判断买不买得起)
  function findBest(type, scoreFn) {
    const def = G.CFG.BUILDS[type];
    const s = G.sim.state;
    const save = { g: s.gold, w: s.wood, st: s.stone };
    s.gold = 1e6; s.wood = 1e6; s.stone = 1e6;
    let best = null, bs = -Infinity;
    for (let y = 24; y < 48 - (def.h - 1); y++) {
      for (let x = 24; x < 48 - (def.w - 1); x++) {
        if (!G.B.canPlace(type, x, y).ok) continue;
        const sc = scoreFn ? scoreFn(x, y, def) : 0;
        if (sc > bs) { bs = sc; best = { x, y, score: sc }; }
      }
    }
    s.gold = save.g; s.wood = save.w; s.stone = save.st;
    return best;
  }

  // 生产建筑优先的村镇规划:金币不足就推进几天攒税再建
  function buildTown() {
    const s = G.sim.state;
    const out = { built: [], fail: [], daysSpent: 0 };
    const hall = halls()[0];
    const hx = hall ? hall.x : 35, hy = hall ? hall.y : 35;
    const ry = hy + 3;

    const tryPlace = (type, x, y) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = G.B.place(type, x, y);
        if (r.ok) { out.built.push(type); return true; }
        if (r.reason === '金币不足' || r.reason === '木材不足' || r.reason === '石料不足') {
          run(4); out.daysSpent += 4; continue;
        }
        out.fail.push(type + '@' + x + ',' + y + ':' + r.reason);
        return false;
      }
      out.fail.push(type + ':gold-timeout');
      return false;
    };

    // 1) 生产建筑(伐木场贴森林、采石场贴岩石)
    const lp = findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
    if (lp) tryPlace('lumber', lp.x, lp.y); else out.fail.push('lumber:no-spot');
    const qp = findBest('quarry', (x, y, d) => G.M.rockNear(x, y, d.w, d.h, 2));
    if (qp) tryPlace('quarry', qp.x, qp.y); else out.fail.push('quarry:no-spot');

    // 2) 路 + 农田
    for (let x = hx - 8; x <= hx + 9; x++) {
      const r = G.B.place('road', x, ry);
      if (r.ok) out.built.push('road');
    }
    const fp = findBest('farm', (x, y, d) => G.M.waterNear(x, y, d.w, d.h, 1) ? 1 : 0);
    if (fp) tryPlace('farm', fp.x, fp.y); else out.fail.push('farm:no-spot');

    // 3) 住房 / 服务(沿路)
    for (const [t, x, y] of [
      ['cottage', hx - 6, ry + 1], ['cottage', hx - 4, ry + 1], ['cottage', hx - 2, ry + 1],
      ['tavern', hx + 3, ry + 1], ['herbalist', hx + 5, ry + 1],
    ]) tryPlace(t, x, y);

    // 4) 猎人小屋(改动后新增的可再生食物来源;旧版本没有,自动跳过)
    if (G.NAT && G.NAT.isGame) {
      const hp = findBest('hunter', (x, y, d) => {
        let n = 0; const r = G.CFG.NAT.game.ring;
        for (let yy = y - r; yy <= y + d.h - 1 + r; yy++)
          for (let xx = x - r; xx <= x + d.w - 1 + r; xx++)
            if (G.M.inB(xx, yy) && G.NAT.isGame(G.M.idx(xx, yy))) n++;
        return n;
      });
      if (hp) tryPlace('hunter', hp.x, hp.y); else out.fail.push('hunter:no-spot');
    }
    return out;
  }

  function prod() { return G.builds.filter(b => b.def.produce); }
  function workers() { return G.builds.filter(b => b.def.workers > 0); }
  function isWorking(b) { return b.def.workers > 0 ? b.eff > 0 : true; }
  function employed() { return G.res.filter(r => r.job).length; }

  function run(days) { G.sim.speed = 0; for (let i = 0; i < days; i++) G.sim.dayTick(); return days; }

  function snap() {
    const s = G.sim.state;
    return { day: s.day, gold: Math.round(s.gold), wood: Math.round(s.wood), stone: Math.round(s.stone), food: Math.round(s.food), pop: G.res.length };
  }

  function walkers() {
    const w = G.walkers || [];
    const byPurpose = {};
    for (const x of w) { const p = x.purpose || (x.roundTrip ? 'service?' : 'stroller'); byPurpose[p] = (byPurpose[p] || 0) + 1; }
    return {
      total: w.length, pop: G.res.length,
      uniqueRes: new Set(w.map(x => x.resId)).size,
      byPurpose,
      '无目的游走占比': G.res.length ? +((w.filter(x => !x.purpose || x.purpose === 'stroll').length) / Math.max(1, w.length) * 100).toFixed(0) + '%' : 'n/a',
    };
  }

  return { terrCount, terrHash, findSpot, findBest, buildTown, prod, workers, isWorking, employed, run, snap, walkers, halls };
})();
