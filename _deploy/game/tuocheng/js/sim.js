// ===== 模拟循环:时钟推进 + 每日结算编排 =====
// 设计书模拟循环:放置建筑 → 居民寻找供给 → 每日结算满足度/税收/消耗
// → 幸福度影响人口增减 → 玩家据反馈调整规划。
G.sim = {
  dayT: 0,
  mods: { prodMult: 1, foodConsMult: 1, joyBonus: 0, taxMult: 1, sickBonus: 0, farmMult: 1 },
  state: null,
  _hudCache: { hap: 50 },

  newState(difficulty, seed) {
    return {
      difficulty, seed,
      day: 1,
      stage: 1,
      gold: G.CFG.START.gold, wood: G.CFG.START.wood,
      stone: G.CFG.START.stone, food: G.CFG.START.food,
      caps: Object.assign({}, G.CFG.BASECAP),
      lastTax: 0, lastUpkeep: 0,
      objIdx: 0, won: false,
      createdAt: Date.now(),
    };
  },

  seasonIdx() { return Math.floor(((this.state.day - 1) % (G.CFG.ECON.daysPerSeason * 4)) / G.CFG.ECON.daysPerSeason); },
  dayOfSeason() { return ((this.state.day - 1) % G.CFG.ECON.daysPerSeason) + 1; },
  year() { return Math.floor((this.state.day - 1) / (G.CFG.ECON.daysPerSeason * 4)) + 1; },

  pop() { return G.res.length; },
  hap() {
    if (!G.res.length) return 50;
    let v = 0;
    for (const r of G.res) v += r.hap;
    const h = v / G.res.length;
    this._hudCache.hap = h;
    return h;
  },

  update(dtMs) {
    const speed = this.speed || 0;
    if (speed <= 0 || !this.state) return;
    this.dayT += dtMs * speed;
    let guard = 0;
    while (this.dayT >= G.CFG.ECON.dayMs && guard++ < 10) {
      this.dayT -= G.CFG.ECON.dayMs;
      this.dayTick();
    }
  },

  // ---- 每日结算(核心循环) ----
  dayTick() {
    const s = this.state;
    s.day++;

    // 1) 事件时限与当日修正
    G.EV.tickExpiry();
    this.mods = G.EV.mods();

    // 2) 员工调配
    G.B.assignJobs();

    // 3) 服务建筑诊所治疗计数复位
    for (const b of G.builds) if (b.def.service && b.def.service.need === 'medical') b.treated = 0;

    // 4) 经济:先生产后消耗
    G.E.tick();

    // 5) 居民:吃饭/服务分配/满足度/健康/迁移
    G.R.daily();

    // 6) 随机事件
    G.EV.roll();

    // 7) 目标推进
    this.checkObjectives();

    // 8) 每 10 天自动存档
    if (s.day % 10 === 0 && G.SV.ready()) {
      G.SV.save('auto', true);
    }

    G.UI.onDayTick();
  },

  checkObjectives() {
    const s = this.state;
    const objs = G.CFG.OBJECTIVES;
    while (s.objIdx < objs.length) {
      const o = objs[s.objIdx];
      let ok = false;
      try { ok = o.check(); } catch (e) { ok = false; }
      if (!ok) break;
      s.objIdx++;
      G.UI.toast(`🎯 目标达成:${o.text}`, 'good');
      G.UI.log(`目标达成:${o.text}`, 'good');
      if (s.objIdx >= objs.length && !s.won) {
        s.won = true;
        G.UI.showWin();
      }
    }
  },

  // 阶段升级条件检查(UI 的"升级"按钮用)
  stageReady() {
    const s = this.state;
    if (s.stage >= G.CFG.STAGES.length) return null;
    const next = G.CFG.STAGES[s.stage]; // 下一阶段(索引从 1 开始)
    const req = next.req;
    if (!req) return null;
    if (G.sim.pop() < (req.pop || 0)) return null;
    if (this.hap() < (req.hap || 0)) return null;
    if (req.school && G.B.count('school') < req.school) return null;
    if (s.gold < next.cost) return null;
    return next;
  },

  stageUp() {
    const s = this.state;
    const next = this.stageReady();
    if (!next) return false;
    s.gold -= next.cost;
    s.stage++;
    G.UI.toast(`${next.icon} 恭喜!聚落晋升为「${next.name}」!`, 'good');
    G.UI.log(`聚落晋升为「${next.name}」,解锁了新的建筑与领地。`, 'good');
    G.UI.refreshPalette();
    return true;
  },
};
