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
      // 行为可见化:今天要去哪儿、在干什么(由每天的行走单位生成时写入)
      purpose: 'home', destB: 0, walkerId: -1,
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

  // ---- 行为可读性:这名居民此刻在干嘛 ----
  const PURPOSE_META = {
    work:    { icon: '🛠️', label: '上工' },
    service: { icon: '🚶', label: '外出' },
    commute: { icon: '🚶', label: '通勤' },
    stroll:  { icon: '🌳', label: '散步' },
    home:    { icon: '🏠', label: '在家' },
    sick:    { icon: '🤒', label: '卧病' },
  };

  function whereOf(r) {
    if (r.destB) { const b = G.B.byId(r.destB); if (b) return b.def.name; }
    if (r.home) { const h = G.B.byId(r.home); if (h) return h.def.name; }
    return '市政厅';
  }

  // 返回 { key, icon, text, why } —— UI 点选居民与行走单位气泡共用
  function taskOf(r) {
    if (r.sick) return { key: 'sick', icon: '🤒', text: '卧病在家,等待医疗覆盖', why: r.coveredMed ? '已有医疗可达,正在被诊治' : '所在住宅不在医疗覆盖范围内' };
    if (r.purpose === 'work' && r.job) {
      const b = G.B.byId(r.job);
      if (b) return { key: 'work', icon: '🛠️', text: `在「${b.def.name}」上工`, why: `职业:${b.def.name}(${G.CFG.CATS.find(c => c.k === b.def.cat) ? G.CFG.CATS.find(c => c.k === b.def.cat).name : b.def.cat})` };
    }
    if (r.purpose === 'service' && r.destB) {
      const b = G.B.byId(r.destB);
      if (b) return { key: 'service', icon: '🚶', text: `前往「${b.def.name}」`, why: '今天被分配到了这项服务' };
    }
    if (r.purpose === 'stroll') return { key: 'stroll', icon: '🌳', text: '在广场/街边散步', why: '今天空闲,而且聚落有空地可逛' };
    if (r.job) {
      const b = G.B.byId(r.job);
      return { key: 'home', icon: '🏠', text: '在家休息(今天不必当班)', why: b ? `工作地点:${b.def.name}` : '' };
    }
    return { key: 'home', icon: '🏠', text: r.home ? '在家休息' : '在市政厅附近落脚本(无住房)', why: r.home ? '没有固定岗位,留在家中' : '还没有住房' };
  }

  function jobNameOf(r) {
    if (r.sick) return '病患';
    if (r.job) { const b = G.B.byId(r.job); if (b) return b.def.name + ' 员工'; }
    return '无固定职业';
  }

  // 各行为的人数分布(用于验证"不是全员无目的乱走")
  function purposeStats() {
    const out = {};
    for (const r of G.res) {
      const k = r.purpose || 'home';
      out[k] = (out[k] || 0) + 1;
    }
    out.__total = G.res.length;
    return out;
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

    // 5) 新生儿与移民
    // 改动依据:玩家反馈"人为什么这么多人跑来跑去" —— 原实现一天最多能进
    // 1(新生儿) + 8(移民潮) = 9 人,且只要有空房就瞬间填满,外人看起来就是"一群没来由的人"。
    // 现在:① 受 popCap 硬上限约束;② 每日增长不超过当前人口的 4%(至少 1 人);
    //       ③ 住房至少留 12% 余量才继续接纳,满了会在日志里说明原因。
    const ECON = G.CFG.ECON;
    const cityHap = G.sim.hap();
    const foodReserve = need > 0 ? s.food / need : 99; // 剩余粮食可支撑的天数
    const popNow = G.res.length;
    const freeByCap = Math.max(0, ECON.popCap - popNow);
    const free = Math.min(housingFree(), freeByCap);
    const growCap = Math.max(ECON.popGrowFlat, Math.floor(popNow * ECON.popGrowRate));
    const slack = housingCap() > 0 ? free / housingCap() : 0;
    let want = 0;
    if (free > 0 && cityHap >= 65 && foodReserve >= 4 && slack >= 0.12 && G.U.chance(0.5)) want += 1; // 新生儿
    if (free > 0 && cityHap >= 70 && foodReserve >= 6 && slack >= 0.12) {
      want += 1 + Math.floor((cityHap - 70) / 5); // 移民
    }
    const n = Math.min(want, free, growCap, Math.max(0, Math.floor(foodReserve / 2)));
    if (n > 0) {
      spawn(n);
      if (n >= 3) G.UI.log(`🎊 ${n} 位新居民加入了聚落(人口 ${G.res.length}/${housingCap()})`, 'good');
    } else if (s.day % 10 === 0 && cityHap >= 60) {
      // 把"为什么不再来人"讲清楚,避免玩家以为是 bug
      if (housingFree() <= 0) G.UI.log(`🛖 住房已满(${popNow}/${housingCap()}),新移民无处安置 —— 建住房才能继续扩张`, 'info');
      else if (popNow >= ECON.popCap) G.UI.log(`👥 人口已达上限 ${ECON.popCap} 人,聚落不再接纳新居民`, 'info');
      else if (slack < 0.12) G.UI.log('🛖 住房接近饱和,移民暂缓迁入', 'info');
      else if (foodReserve < 4) G.UI.log('🍞 粮食储备不足,没有人愿意搬来', 'info');
    }

    // 6) 濒灭重开:聚落几乎空置时,会有零星拓荒者愿意来碰碰运气
    if (G.res.length < 5 && housingFree() > 0 && G.res.length < ECON.popCap && G.U.chance(0.15)) {
      const n2 = Math.min(3, housingFree(), ECON.popCap - G.res.length);
      spawn(n2);
      G.UI.log(`🧭 ${n2} 名路过的拓荒者决定在这里重新开始`, 'good');
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
    spawn, genName, daily, hapOf, foodMult,
    housingCap, housingFree, homeless, sickCount, hungries,
    taskOf, jobNameOf, purposeStats, whereOf, PURPOSE_META,
  };
})();
