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
      lastProd: { wood: 0, stone: 0, food: 0, gold: 0 },
      lastWant: { wood: 0, stone: 0, food: 0 },
      lastOverflow: { wood: 0, stone: 0, food: 0 },
      overflowDays: 0,
      totalProd: { wood: 0, stone: 0, food: 0, gold: 0 },
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

    // 4) 可再生自然资源:先按季节生长,再被生产建筑采集
    G.NAT.daily();

    // 5) 经济:先生产后消耗
    const econ = G.E.tick();

    // 6) 居民:吃饭/服务分配/满足度/健康/迁移
    G.R.daily();

    // 7) 随机事件
    const ev = G.EV.roll();
    if (ev) {
      G.UI.banner(ev.def.icon, ev.def.name, ev.text, ev.def.good ? 'good' : 'bad');
      if (G.UI.autoPauseOnEvent()) {
        G.UI.setSpeed(0);
        G.UI.toast('⏸ 重大事件已自动暂停,读完再按 ▶ 继续', 'bad');
      }
    }

    // 8) 产出可读性:把"谁在产什么/为什么停产"讲清楚
    this.report(econ);

    // 9) 目标推进
    this.checkObjectives();

    // 10) 每 10 天自动存档
    if (s.day % 10 === 0 && G.SV.ready()) {
      G.SV.save('auto', true);
    }

    G.UI.onDayTick();
  },

  // 日报 / 边缘触发的可读反馈(避免刷屏:只在状态"变化"时记一条)
  report(econ) {
    const s = this.state;
    if (!s.totalProd) s.totalProd = { wood: 0, stone: 0, food: 0, gold: 0 };
    for (const k in econ.prod) s.totalProd[k] = (s.totalProd[k] || 0) + econ.prod[k];

    const NAME = { wood: '木材', stone: '石料', food: '粮食' };

    // 生产建筑:停产 / 恢复 / 资源枯竭 / 恢复
    for (const b of G.B.producers()) {
      const stalled = b.eff <= 0;
      if (stalled && !b._warnStall) {
        b._warnStall = true;
        G.UI.log(`⚠️ ${b.def.name}无人上工,已经停产 —— 建住房增加人口,或减少其它建筑的用工`, 'bad');
      } else if (!stalled && b._warnStall) {
        b._warnStall = false;
        G.UI.log(`✅ ${b.def.name}恢复生产`, 'good');
      }
      const rk = G.E.resKeyOf(b);
      if (rk && G.NAT.ready) {
        const info = G.NAT.near(b, rk);
        const low = info.tiles > 0 && info.ratio < 0.25;
        if (low && !b._warnLow) {
          b._warnLow = true;
          G.UI.log(`🪫 ${b.def.name}附近的${G.CFG.NAT[rk].name}被采空了,产量下降 —— 资源会按季节长回来,也可以另找地方再建一座`, 'bad');
        } else if (!low && b._warnLow) {
          b._warnLow = false;
          G.UI.log(`🌱 ${b.def.name}附近的${G.CFG.NAT[rk].name}已经恢复,产量回升`, 'good');
        }
      }
    }

    // 仓储溢出:原实现会静默丢弃超出上限的产量
    const ov = econ.overflow;
    const ovKeys = Object.keys(ov).filter(k => ov[k] > 1);
    if (ovKeys.length && (s.overflowDays === 3 || (s.overflowDays > 3 && s.overflowDays % 20 === 0))) {
      G.UI.log(`📦 ${ovKeys.map(k => NAME[k]).join('、')}已经装满,新产出的部分被浪费了 —— 建谷仓/仓库提高上限,或造交易所自动出售盈余`, 'bad');
    }
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
