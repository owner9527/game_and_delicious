// ===== 经济系统:生产、消耗、税收、仓储、交易 =====
G.E = (() => {

  // 农田/牧场的季节与地块加成
  function farmFactor(b) {
    const season = G.CFG.SEASONS[G.sim.seasonIdx()];
    let f = season.farmMult;
    if (season.k === 'winter' && b.def.winterKeep) f = b.def.winterKeep;
    if (b.def.fertileBonus) f *= 1 + b.fertileTiles * b.def.fertileBonus;
    if (b.water && b.def.waterBonus) f *= 1 + b.def.waterBonus;
    f *= (G.sim.mods.farmMult || 1);
    return f;
  }

  function prodMult() {
    return (1 + G.B.eduBonus()) * (G.sim.mods.prodMult || 1);
  }

  // 每日结算(在居民吃饭之前调用:先生产后消耗)
  function tick() {
    const s = G.sim.state;
    const caps = G.B.caps();
    const pm = prodMult();

    // 1) 生产
    for (const b of G.B.producers()) {
      if (b.eff <= 0) continue;
      const base = b.def.produce;
      const seasonF = b.def.farm ? farmFactor(b) : 1;
      for (const k in base) {
        const amount = base[k] * b.eff * seasonF * pm;
        s[k] = Math.min(caps[k], s[k] + amount);
      }
    }

    // 2) 税收:人口 × 税率 × 幸福系数 × 教育加成
    const pop = G.res.length;
    const hap = G.sim.hap();
    if (pop > 0) {
      const tax = pop * G.CFG.ECON.taxPer * (0.4 + (hap / 100) * 1.1) * (1 + G.B.eduBonus()) * (G.sim.mods.taxMult || 1);
      s.gold += tax;
      s.lastTax = tax;
    }

    // 3) 维护费
    let upkeep = 0;
    for (const b of G.builds) {
      if (b.def.upkeep && (b.def.workers === 0 || b.eff > 0)) upkeep += b.def.upkeep;
    }
    s.gold = Math.max(0, s.gold - upkeep);
    s.lastUpkeep = upkeep;

    // 4) 交易所自动贸易
    for (const b of G.builds.filter(x => x.def.trade && x.eff > 0)) {
      const boost = G.EV.merchantBuff ? 2 : 1;
      // 盈余出售
      if (s.food > caps.food * 0.55) {
        const qty = Math.min(25, s.food - caps.food * 0.55);
        s.food -= qty; s.gold += qty * 2.2 * boost;
      }
      if (s.wood > caps.wood * 0.55) {
        const qty = Math.min(20, s.wood - caps.wood * 0.55);
        s.wood -= qty; s.gold += qty * 2.6 * boost;
      }
      // 缺粮回购
      if (s.food < caps.food * 0.15 && s.gold >= 40) {
        const qty = Math.min(30, (s.gold * 0.5) / 4, caps.food - s.food);
        if (qty > 0) { s.food += qty; s.gold -= qty * 4; }
      }
    }
    G.EV.merchantBuff = false;

    // 5) 统计快照(HUD 用)
    s.caps = caps;
  }

  return { tick, farmFactor, prodMult };
})();
