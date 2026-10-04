// ===== 居民系统:需求满足、幸福度、健康、迁移、生死 =====
// 设计书核心:"居民需求主体"。每个居民有住房/食物/娱乐/医疗/信仰需求,
// 建筑把需求映射到供给,系统按"最近/最好"原则自动纳入网络。
G.res = [];
G._rid = 1;

G.R = (() => {

  function genName() {
    return G.U.pick(G.CFG.NAMES.surname) + G.U.pick(G.CFG.NAMES.given);
  }

  function newResident(hx, hy) {
    return {
      id: G._rid++, name: genName(),
      home: 0, hx, hy,
      job: 0,
      servedJoy: 0, servedFaith: 0,
      coveredMed: false, coveredFaith: false,
      sat: { food: 60, housing: 0, joy: 30, medical: 50, faith: 60 },
      hap: 55,
      health: 100, sick: false,
      joinedDay: G.sim ? G.sim.state.day : 1,
    };
  }

  function spawn(n) {
    // 在市政厅或任意住宅旁落户;无住房也先安顿在市政厅
    const anchors = G.B.houses().concat(G.builds.filter(b => b.def.key === 'hall'));
    const a = anchors.length ? G.U.pick(anchors) : null;
    const hx = a ? a.x + (a.w >> 1) : (G.CFG.MAPW >> 1);
    const hy = a ? a.y + (a.h >> 1) : (G.CFG.MAPH >> 1);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const r = newResident(hx + G.U.randInt(-2, 2), hy + G.U.randInt(-2, 2));
      G.res.push(r); arr.push(r);
    }
    G.B.assignHousing();
    return arr;
  }

  function housingCap() {
    let cap = 0;
    for (const h of G.B.houses()) cap += h.def.housing;
    return cap;
  }
  function housingFree() { return Math.max(0, housingCap() - G.res.length); }
  function homeless() { return G.res.filter(r => !r.home).length; }
  function sickCount() { return G.res.reduce((a, r) => a + (r.sick ? 1 : 0), 0); }
  function hungries() { return G.res.filter(r => r.sat.food < 40).length; }

  function hapWeights() {
    return G.sim.state.stage >= 2
      ? { food: .30, housing: .18, joy: .20, medical: .16, faith: .16 }
      : { food: .34, housing: .24, joy: .28, medical: .14, faith: 0 };
  }

  function hapOf(r) {
    const w = hapWeights();
    let v = 0, tw = 0;
    for (const k in w) { v += r.sat[k] * w[k]; tw += w[k]; }
    return tw > 0 ? v / tw : 50;
  }

  // ---- 每日结算 ----
  function daily() {
    const s = G.sim.state;
    const mods = G.sim.mods;

    // 1) 吃饭:全局粮池,公平分摊
    const need = G.res.length * G.CFG.ECON.foodPer * foodMult();
    let foodSat = 100;
    if (G.res.length > 0) {
      const ratio = Math.min(1, s.food / need);
      foodSat = 100 * ratio;
      s.food = Math.max(0, s.food - Math.min(s.food, need));
      if (ratio < 1 && s.day % 3 === 0) G.UI.log('粮食短缺!居民正在挨饿', 'bad');
    }

    // 2) 住房
    G.B.assignHousing();

    // 3) 服务分配(需求-供给网络)
    const joy = G.B.assignServices('joy');
    const faith = G.B.assignServices('faith');
    const med = G.B.assignServices('medical');
    for (const r of G.res) {
      r.servedJoy = joy.assign.get(r.id) || 0;
      r.coveredJoy = joy.covered.has(r.id);
      r.servedFaith = faith.assign.get(r.id) || 0;
      r.coveredFaith = faith.covered.has(r.id);
      r.coveredMed = med.covered.has(r.id);
    }

    // 4) 每位居民:满足度 → 幸福 → 健康 → 生死
    const born = [];
    for (let i = G.res.length - 1; i >= 0; i--) {
      const r = G.res[i];
      r.sat.food = G.U.lerp(r.sat.food, foodSat, 0.6);
      r.sat.housing = G.U.lerp(r.sat.housing, r.home ? 100 : 0, 0.5);
      const comfort = r.home ? G.B.byId(r.home).def.comfort : 0;
      const joyTarget = r.servedJoy ? Math.min(100, 68 + comfort * 0.7) : comfort * 0.45;
      r.sat.joy = G.U.lerp(r.sat.joy, joyTarget + (mods.joyBonus || 0), 0.6);
      r.sat.medical = G.U.lerp(r.sat.medical, r.coveredMed ? 100 : 0, 0.5);
      const faithTarget = s.stage >= 2 ? (r.servedFaith ? 100 : (r.coveredFaith ? 45 : 0)) : 60;
      r.sat.faith = G.U.lerp(r.sat.faith, faithTarget, 0.4);

      const target = hapOf(r);
      r.hap = G.U.lerp(r.hap, target, 0.6);

      // 健康
      if (r.sat.food < 25) r.health -= 4;
      if (r.sick) r.health -= r.coveredMed ? 2.5 : 5;
      if (!r.sick && r.sat.food > 60) r.health += 2;
      r.health = G.U.clamp(r.health, 0, 100);

      // 染病
      if (!r.sick) {
        const home = r.home ? G.B.byId(r.home) : null;
        const wellOk = home && G.B.wellCovered(home.x, home.y);
        let p = 0.0015 + (wellOk ? 0 : 0.0035) + (mods.sickBonus || 0);
        if (G.U.chance(p)) { r.sick = true; r.health -= 5; }
      } else if (r.coveredMed && med.assign.has(r.id)) {
        const clinic = G.B.byId(med.assign.get(r.id));
        if (clinic && clinic.treated === undefined) clinic.treated = 0;
        if (clinic && clinic.treated < clinic.def.service.cap) {
          clinic.treated++;
          if (G.U.chance(clinic.def.service.cure)) { r.sick = false; r.health += 10; }
        }
      }

      // 死亡
      if (r.health <= 0) {
        const cause = r.sick ? '瘟疫' : (r.sat.food < 25 ? '饥荒' : '疾病');
        G.UI.log(`💔 ${r.name} 因${cause}离世`, 'bad');
        killResident(i);
        continue;
      }

      // 迁出
      if (r.hap < 30 && G.U.chance(0.25) && G.res.length > 5) {
        G.UI.log(`${r.name} 对生活失望,离开了聚落`, 'bad');
        killResident(i);
        continue;
      }
    }

    // 5) 新生儿与移民(需要粮食储备充足才招人,避免盲目涌入引发饥荒)
    const cityHap = G.sim.hap();
    const foodReserve = need > 0 ? s.food / need : 99; // 剩余粮食可支撑的天数
    if (cityHap >= 65 && housingFree() > 0 && foodReserve >= 4 && G.U.chance(0.5)) born.push(1);
    if (cityHap >= 70 && housingFree() > 0 && foodReserve >= 6) {
      const n = Math.min(
        housingFree(),
        1 + Math.floor((cityHap - 70) / 5) + G.U.randInt(0, 2),
        Math.floor(foodReserve / 2), // 移民规模受粮食约束
        8
      );
      if (n > 0 && G.U.chance(0.8)) born.push(n);
    }
    if (born.length) {
      const total = Math.min(born.reduce((a, b) => a + b, 0), housingFree());
      if (total > 0) {
        spawn(total);
        if (total >= 3) G.UI.log(`🎊 ${total} 位新居民加入了聚落`, 'good');
      }
    }

    // 6) 濒灭重开:聚落几乎空置时,会有零星拓荒者愿意来碰碰运气
    if (G.res.length < 5 && housingFree() > 0 && G.U.chance(0.15)) {
      const n = Math.min(3, housingFree());
      spawn(n);
      G.UI.log(`🧭 ${n} 名路过的拓荒者决定在这里重新开始`, 'good');
    }
  }

  function killResident(i) {
    const r = G.res[i];
    const home = G.B.byId(r.home);
    if (home && home.resIds) {
      const k = home.resIds.indexOf(r.id);
      if (k >= 0) home.resIds.splice(k, 1);
    }
    G.res.splice(i, 1);
  }

  function foodMult() {
    const season = G.CFG.SEASONS[G.sim.seasonIdx()];
    return (season.k === 'winter' ? G.CFG.ECON.winterFood : 1.0) * (G.sim.mods.foodConsMult || 1);
  }

  return {
    spawn, genName, daily, hapOf,
    housingCap, housingFree, homeless, sickCount, hungries,
  };
})();
