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

  // 伐木场当前生效的"毗邻森林"加成(满额值)。
  // 原实现只在放置那一刻把格数存进 b.forest,经济结算里从未使用(玩家反馈"基建建好了没什么收入")。
  // 现在按放置时的毗邻格数算出满额加成,再在 tick 里受周边林地实际蓄积的限制:
  // 砍狠了 → 交付打折;停采 → 林子长回来 → 加成恢复。面板同时展示"满额"与"当前交付"。
  function forestBonusOf(b, pm) {
    if (!b.def.forestBonus || !G.NAT.ready) return 0;
    const n = Math.min(b.forest || 0, 8);
    return n * b.def.forestBonus * b.eff * pm;
  }

  // 周边林地健康度(等效满格数 0~8),用于显示"加成现在能拿到几成"
  function forestEqOf(b) {
    if (!b.def.forestBonus || !G.NAT.ready) return 0;
    return G.NAT.effective(b, 'wood', 8);
  }

  // 生产建筑 → 自然资源类型
  function resKeyOf(b) {
    if (b.def.forestBonus) return 'wood';
    if (b.def.rockReq) return 'ore';
    if (b.def.gameReq) return 'game';
    return null;
  }

  // 某生产建筑"想要"的日产量(未受自然资源蓄积限制)
  function wantOf(b) {
    const pm = prodMult();
    const seasonF = b.def.farm ? farmFactor(b) : 1;
    const out = {};
    let bonus = 0;
    for (const k in b.def.produce) {
      out[k] = b.def.produce[k] * b.eff * seasonF * pm;
      if (k === 'wood') { bonus = forestBonusOf(b, pm); out[k] += bonus; }
    }
    return { out, pm, bonus };
  }

  // 每日结算(在居民吃饭之前调用:先生产后消耗)
  function tick() {
    const s = G.sim.state;
    const caps = G.B.caps();
    const pm = prodMult();
    const prod = { wood: 0, stone: 0, food: 0, gold: 0 };
    const want = { wood: 0, stone: 0, food: 0 };
    const overflow = { wood: 0, stone: 0, food: 0 };

    // 1) 生产(先算"想要多少",再受仓储上限与自然资源蓄积限制)
    for (const b of G.B.producers()) {
      const wanted = wantOf(b);
      const out = {};
      b.outNote = '';
      for (const k in wanted.out) {
        let amount = wanted.out[k];
        want[k] += amount;
        if (b.eff <= 0) { out[k] = 0; b.outNote = '无人上工,停产'; continue; }
        const rk = resKeyOf(b);
        if (rk && G.NAT.ready) {
          const info = G.NAT.near(b, rk);
          if (info.tiles > 0) {
            // 伐木场即使四周无林也照常按基础产量采运;森林加成部分才受林地蓄积约束
            const guaranteed = Math.max(0, amount - wanted.bonus);
            const drawWanted = amount - guaranteed;
            const got = G.NAT.draw(b, rk, drawWanted);
            b.lastYield = drawWanted > 0 ? got / drawWanted : 1;
            amount = guaranteed + got;
            if (b.lastYield < 0.85) b.outNote = `${G.CFG.NAT[rk].name}蓄积不足,产量下降`;
          }
        }
        out[k] = amount;
      }
      b.lastOut = out;
      // 落账(受仓储上限限制;被上限吃掉的部分计入 overflow 并可见)
      for (const k in out) {
        const room = Math.max(0, caps[k] - s[k]);
        const added = Math.min(room, out[k]);
        s[k] += added;
        prod[k] += added;
        if (out[k] - added > 0.05) overflow[k] += out[k] - added;
      }
    }

    // 2) 税收:人口 × 税率 × 幸福系数 × 教育加成
    const pop = G.res.length;
    const hap = G.sim.hap();
    if (pop > 0) {
      const tax = pop * G.CFG.ECON.taxPer * (0.4 + (hap / 100) * 1.1) * (1 + G.B.eduBonus()) * (G.sim.mods.taxMult || 1);
      s.gold += tax;
      s.lastTax = tax;
      prod.gold = tax;
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

    // 5) 统计快照(HUD / 面板 / 日报用)
    s.caps = caps;
    s.lastProd = prod;
    s.lastWant = want;
    s.lastOverflow = overflow;
    const ovAny = overflow.wood + overflow.stone + overflow.food;
    s.overflowDays = ovAny > 1 ? (s.overflowDays || 0) + 1 : 0;
    return { prod, want, overflow };
  }

  return { tick, farmFactor, prodMult, wantOf, forestBonusOf, forestEqOf, resKeyOf };
})();
