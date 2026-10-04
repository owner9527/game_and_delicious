// ===== 核心数据表(平衡性调参都在这里) =====
// 设计书要求:经济数值用数据表配置,方便调平衡。
// 新增建筑只需在此注册(包括"满足什么需求"),系统会自动纳入需求-供给网络。
G.CFG = (() => {
  const TERR = { GRASS: 0, FOREST: 1, WATER: 2, ROCK: 3, FERTILE: 4 };

  // 需求类型元数据
  const NEEDS = {
    food:    { name: '食物', color: '#e67e22', icon: '🌾' },
    housing: { name: '住房', color: '#f1c40f', icon: '🏠' },
    joy:     { name: '娱乐', color: '#e74c3c', icon: '🎭' },
    medical: { name: '医疗', color: '#2ecc71', icon: '⚕️' },
    faith:   { name: '信仰', color: '#9b59b6', icon: '⛪' },
  };

  // 建筑定义表
  // service: {need, cap(每日服务人次), radius(沿路距离,路面=1格)}
  // aura:    {kind:'well'|'guard'|'edu', radius, val}
  // produce: {food/wood/stone: 每日基础产量(满员时)}
  const BUILDS = {
    road: {
      key: 'road', name: '土路', icon: '🛣️', cat: 'infra', stage: 1, w: 1, h: 1,
      cost: { gold: 2 }, desc: '居民与服务的命脉。所有建筑必须毗邻道路才能获得服务。',
      terr: ['grass', 'fertile'], walk: true,
    },
    hall: { // 市政厅:开局自带,不可建造
      key: 'hall', name: '市政厅', icon: '🏛️', cat: 'civic', stage: 1, w: 2, h: 2,
      cost: {}, desc: '拓荒队的起点。提供少量集会服务与仓储。',
      storage: { food: 60, wood: 60, stone: 60 },
      service: { need: 'joy', cap: 10, radius: 6 },
      noBuild: true,
    },
    cottage: {
      key: 'cottage', name: '木屋', icon: '🛖', cat: 'house', stage: 1, w: 1, h: 1,
      cost: { gold: 30, wood: 12 }, housing: 6, comfort: 12,
      desc: '容纳 6 位居民。舒适度低,但便宜实惠。',
      terr: ['grass'],
    },
    stoneHouse: {
      key: 'stoneHouse', name: '石屋', icon: '🏠', cat: 'house', stage: 2, w: 1, h: 1,
      cost: { gold: 95, wood: 20, stone: 30 }, housing: 14, comfort: 32,
      desc: '容纳 14 位居民,居住舒适,自带几分愉悦。',
      terr: ['grass'],
    },
    manor: {
      key: 'manor', name: '宅邸', icon: '🏰', cat: 'house', stage: 3, w: 1, h: 1,
      cost: { gold: 280, wood: 45, stone: 100 }, housing: 26, comfort: 55,
      desc: '容纳 26 位居民,贵族般的享受。',
      terr: ['grass'],
    },
    farm: {
      key: 'farm', name: '农田', icon: '🌾', cat: 'food', stage: 1, w: 2, h: 2,
      cost: { gold: 45, wood: 16 }, workers: 4, produce: { food: 12 },
      desc: '基础粮仓。肥沃土每格 +22% 产量,毗邻水域 +15%。冬季基本停产。',
      terr: ['grass', 'fertile'], farm: true,
      fertileBonus: 0.22, waterBonus: 0.15,
    },
    pasture: {
      key: 'pasture', name: '牧场', icon: '🐄', cat: 'food', stage: 2, w: 2, h: 2,
      cost: { gold: 95, wood: 26 }, workers: 3, produce: { food: 7.5 },
      desc: '畜产品稳定,冬季仍保有 70% 产量。',
      terr: ['grass'], farm: true, winterKeep: 0.7,
    },
    hunter: {
      key: 'hunter', name: '猎人小屋', icon: '🏹', cat: 'food', stage: 1, w: 1, h: 1,
      cost: { gold: 40, wood: 14 }, workers: 2, produce: { food: 5.5 },
      desc: '在猎场(林缘/水边的兽径)打猎。猎物会自行繁殖,过度捕猎会让猎场空掉。',
      terr: ['grass'], hunt: true, gameReq: 3,
    },
    lumber: {
      key: 'lumber', name: '伐木场', icon: '🪵', cat: 'prod', stage: 1, w: 1, h: 1,
      cost: { gold: 45 }, workers: 3, produce: { wood: 6 },
      desc: '产出木材(无需木材建造,只花金币)。毗邻森林每格 +1.2 产量;林地会被采伐并逐季长回来。',
      terr: ['grass'], forestBonus: 1.2,
    },
    quarry: {
      key: 'quarry', name: '采石场', icon: '⛏️', cat: 'prod', stage: 1, w: 1, h: 1,
      cost: { gold: 70 }, workers: 4, produce: { stone: 4.5 },
      desc: '产出石料(无需石料建造,只花金币)。只要挨着岩石就能建(周围 2 格内至少 1 块);选中后会在地图上标出所有可建位置。',
      terr: ['grass'], rockReq: 1,
    },
    granary: {
      key: 'granary', name: '谷仓', icon: '🏺', cat: 'food', stage: 1, w: 1, h: 1,
      cost: { gold: 50, wood: 26 }, workers: 1, storage: { food: 170 },
      desc: '粮食储存上限 +170。',
      terr: ['grass'],
    },
    warehouse: {
      key: 'warehouse', name: '仓库', icon: '📦', cat: 'prod', stage: 2, w: 1, h: 1,
      cost: { gold: 85, wood: 32, stone: 18 }, workers: 1, storage: { wood: 200, stone: 200 },
      desc: '木材与石料储存上限各 +200。',
      terr: ['grass'],
    },
    well: {
      key: 'well', name: '水井', icon: '💧', cat: 'civic', stage: 1, w: 1, h: 1,
      cost: { gold: 22, stone: 12 }, aura: { kind: 'well', radius: 5, val: 1 },
      desc: '半径 5 内:火灾与瘟疫风险大减,居民少量+娱乐。',
      terr: ['grass'],
    },
    herbalist: {
      key: 'herbalist', name: '药草屋', icon: '🌿', cat: 'med', stage: 1, w: 1, h: 1,
      cost: { gold: 60, wood: 22 }, workers: 2, upkeep: 1,
      service: { need: 'medical', cap: 20, radius: 8, cure: 0.35 },
      desc: '提供医疗覆盖(半径 8),每日可治愈 20 名病患(35% 成功率)。',
      terr: ['grass'],
    },
    clinic: {
      key: 'clinic', name: '诊疗所', icon: '🏥', cat: 'med', stage: 2, w: 1, h: 1,
      cost: { gold: 170, wood: 34, stone: 48 }, workers: 3, upkeep: 2,
      service: { need: 'medical', cap: 60, radius: 11, cure: 0.55 },
      desc: '大型医疗覆盖(半径 11),每日治愈 60 人(55% 成功率)。',
      terr: ['grass'],
    },
    guard: {
      key: 'guard', name: '治安所', icon: '🛡️', cat: 'civic', stage: 2, w: 1, h: 1,
      cost: { gold: 115, wood: 26, stone: 26 }, workers: 2, upkeep: 2,
      aura: { kind: 'guard', radius: 9, val: 1 },
      desc: '半径 9 内免受盗匪侵扰,火灾损失也会减轻。',
      terr: ['grass'],
    },
    school: {
      key: 'school', name: '学堂', icon: '📚', cat: 'civic', stage: 2, w: 2, h: 2,
      cost: { gold: 270, wood: 60, stone: 85 }, workers: 3, upkeep: 4,
      aura: { kind: 'edu', radius: 0, val: 0.08 },
      desc: '全局生产与税收 +8%(最多叠加 3 座)。升级城市的前提。',
      terr: ['grass'],
    },
    tavern: {
      key: 'tavern', name: '酒馆', icon: '🍺', cat: 'joy', stage: 1, w: 1, h: 1,
      cost: { gold: 75, wood: 32 }, workers: 2, upkeep: 1,
      service: { need: 'joy', cap: 18, radius: 8 },
      desc: '每日 18 人次来此畅饮(半径 8)。早期幸福度支柱。',
      terr: ['grass'],
    },
    plaza: {
      key: 'plaza', name: '市集广场', icon: '⛲', cat: 'joy', stage: 2, w: 2, h: 2,
      cost: { gold: 130, wood: 42, stone: 22 }, workers: 1, upkeep: 2,
      service: { need: 'joy', cap: 44, radius: 9 },
      desc: '每日 44 人次的公共聚会(半径 9)。',
      terr: ['grass'],
    },
    theater: {
      key: 'theater', name: '剧院', icon: '🎭', cat: 'joy', stage: 3, w: 2, h: 2,
      cost: { gold: 430, wood: 85, stone: 125 }, workers: 5, upkeep: 6,
      service: { need: 'joy', cap: 95, radius: 13 },
      desc: '每日 95 人次欣赏戏剧(半径 13)。城市的骄傲。',
      terr: ['grass'],
    },
    church: {
      key: 'church', name: '教堂', icon: '⛪', cat: 'faith', stage: 2, w: 2, h: 2,
      cost: { gold: 230, wood: 52, stone: 92 }, workers: 2, upkeep: 3,
      service: { need: 'faith', cap: 48, radius: 11 },
      desc: '满足信仰需求:每日 48 人次礼拜(半径 11)。',
      terr: ['grass'],
    },
    cathedral: {
      key: 'cathedral', name: '大圣堂', icon: '🕍', cat: 'faith', stage: 3, w: 3, h: 3,
      cost: { gold: 650, wood: 95, stone: 245 }, workers: 4, upkeep: 8,
      service: { need: 'faith', cap: 125, radius: 15 },
      desc: '每日 125 人次朝圣(半径 15),信仰的灯塔。',
      terr: ['grass'],
    },
    trade: {
      key: 'trade', name: '交易所', icon: '⚖️', cat: 'prod', stage: 2, w: 2, h: 2,
      cost: { gold: 250, wood: 62, stone: 42 }, workers: 2, upkeep: 2,
      desc: '自动出售盈余粮食/木材换金币;粮荒时自动高价购粮。',
      terr: ['grass'], trade: true,
    },
    university: {
      key: 'university', name: '大学', icon: '🎓', cat: 'civic', stage: 3, w: 3, h: 3,
      cost: { gold: 920, wood: 150, stone: 300 }, workers: 6, upkeep: 10,
      aura: { kind: 'edu', radius: 0, val: 0.15 },
      desc: '全局生产与税收 +15%(最多叠加 2 座)。伟大城市的象征。',
      terr: ['grass'],
    },
  };

  // 分类
  const CATS = [
    { k: 'infra', name: '基建', icon: '🛣️' },
    { k: 'house', name: '住房', icon: '🏠' },
    { k: 'food', name: '食物', icon: '🌾' },
    { k: 'prod', name: '生产', icon: '🪵' },
    { k: 'med', name: '医疗', icon: '⚕️' },
    { k: 'joy', name: '娱乐', icon: '🎭' },
    { k: 'faith', name: '信仰', icon: '⛪' },
    { k: 'civic', name: '民生', icon: '🏛️' },
  ];

  // 阶段(多阶段解锁)
  const STAGES = [
    { name: '村落', icon: '🏕️' },
    { name: '城镇', icon: '🏘️', cost: 300, req: { pop: 40, hap: 55 }, reqText: '人口 ≥ 40 且幸福度 ≥ 55' },
    { name: '城市', icon: '🏙️', cost: 1000, req: { pop: 120, hap: 60, school: 1 }, reqText: '人口 ≥ 120、幸福度 ≥ 60 且拥有学堂' },
  ];

  // 领地解锁(3×3 区块,中央初始解锁)
  const ZONE_COST = { ring1: { gold: 450, stage: 2 }, ring2: { gold: 1200, stage: 3 } };

  // 初始资源
  const START = { gold: 420, wood: 150, stone: 60, food: 110, pop: 10 };
  // 基础上限。改动依据:开局市政厅自带 60/60/60,实际上限原为 220/220/180;
  // 而第一座伐木场约 12 天就会把木材顶满,之后产量被静默丢弃(玩家看到"建了没收入")。
  // 各 +40/+40/+30 把首次撞上限推迟到约 19 天,配合溢出提示与谷仓/仓库的定位。
  const BASECAP = { food: 200, wood: 200, stone: 150 };

  // 经济与节奏
  const ECON = {
    taxPer: 1.8,          // 每居民基础税金
    foodPer: 1.0,         // 每居民每日耗粮
    winterFood: 1.25,     // 冬季耗粮倍数
    walkRoad: 1,          // 道路通行代价
    walkGrass: 4,         // 野地通行代价(鼓励修路)
    dayMs: 4000,          // 1 倍速下一天的现实毫秒数(原 2600:玩家反馈"速度太快根本看不懂")
    daysPerSeason: 20,
    maxWalkers: 140,      // 同屏可见居民上限(实际还受"一名居民最多一个行走单位"约束)
    speeds: [0, 1, 2, 3], // 暂停 / 1x / 2x / 3x(原为 0/1/2/4)
    defaultSpeed: 1,      // 默认 1 倍速(且 1 倍速本身已放慢)
    popCap: 320,          // 人口硬上限(目标链最高要求 300,留 20 人余量)
    popGrowRate: 0.04,    // 每日人口增长不超过当前人口的 4%(原:新生儿+移民最高可达 9 人/天)
    popGrowFlat: 1,       // 但每天至少允许增长 1 人,避免小村落停滞
    maxStrollers: 0.18,   // 最多 18% 的居民同时在外闲逛,其余待在家/广场
    maxWalkFrac: 0.5,     // 同屏在外走动的居民不超过总人口的一半(其余在家/广场),避免"满街都是人"
    migrantBurst: 4,      // 「移民潮」事件单次最多涌入 4 人(原实现 8~16 人,是"人突然多到看不懂"的主因)
    autoPauseEvent: true, // 灾祸/重大事件发生时自动暂停,给玩家阅读时间
  };

  // 可再生自然资源(森林 / 矿脉 / 猎物)
  // 模型:每个资源格有 0..max 的"蓄积",被生产建筑采集后按 logistic 曲线按季节生长回来。
  // rate 为四季每日生长速率(蓄积越接近 max 生长越慢)。
  // 平衡依据:一座满效率伐木场需求 = 6 + 8 格 × 1.2 = 15.6/日,
  // 周围 8 格森林合计生长能力 ≈ 8 × 2.0 = 16/日,因此长期稳定在约 35% 蓄积(林子变稀但不死),
  // 停采后能自然恢复到满蓄积 —— 这样"可再生"看得见,也不会让玩家越玩越穷。
  const NAT = {
    wood: { name: '森林', icon: '🌲', max: 30, rate: [2.2, 2.4, 1.7, 0.9], ring: 1, harvest: 'wood' },
    ore: { name: '矿脉', icon: '⛏️', max: 26, rate: [1.3, 1.3, 1.3, 0.9], ring: 2, harvest: 'stone' },
    game: { name: '猎物', icon: '🦌', max: 14, rate: [1.6, 1.7, 1.4, 0.5], ring: 3, harvest: 'food', sparse: 0.75 },
    floor: 0.03,        // 蓄积极低时仍有的最小生长量,保证荒林也能慢慢回绿
    floorFrac: 0.3,     // 生产建筑不会把资源格采到 30% 以下(留种/留矿柱),林地永远不会被剃光
    probeDays: 40,      // 每 40 天(约半年)一次矿脉勘探刷新
    probeFrac: 0.3,     // 每次给最贫的几处矿脉补到 max 的 30%
    probeTiles: 6,
  };

  const SEASONS = [
    { k: 'spring', name: '春', icon: '🌸', farmMult: 0.95 },
    { k: 'summer', name: '夏', icon: '☀️', farmMult: 1.1 },
    { k: 'autumn', name: '秋', icon: '🍂', farmMult: 1.3 },
    { k: 'winter', name: '冬', icon: '❄️', farmMult: 0.1 },
  ];

  // 居民姓名
  const NAMES = {
    surname: ['林','王','张','李','陈','刘','杨','黄','周','吴','徐','孙','马','朱','胡','郭','何','高','罗','郑','梁','谢','宋','唐','许','韩','冯','邓','曹','彭','曾','田','董','袁','蔡','蒋','叶','程','苏','魏','吕','丁','任','卢','姚','沈','钟','姜','崔','谭','陆','范','汪','廖','石','金','韦','贾','夏','傅','方','邹','熊','白','孟','秦','邱','侯','江','尹','薛','段','雷','龙','黎','史','陶','贺','毛','郝','顾','龚','邵','万','钱','严','覃','武','戴','莫','孔','汤'],
    given: ['云帆','子墨','思远','晓岚','雨桐','书言','沐阳','清越','若谷','望舒','知行','听松','观澜','栖梧','怀瑾','望舒','采薇','既明','维桢','静姝','振衣','凌云','牧遥','星野','竹隐','鹤鸣','松崖','雪见','青临','荷风','枕流','砚秋','拂衣','沉璧','疏影','暗香','平芜','渡口','长庚','启明','初霁','晚晴','新霁','南絮','北辰','东篱','西洲','半夏','深巷','空山'],
  };

  // 事件定义(标准难度;沙盒只抽 good 事件)
  const EVENTS = [
    {
      id: 'plague', name: '瘟疫爆发', icon: '☠️', good: false, weight: 2, days: 12,
      cond: s => s.day > 30 && s.pop >= 30 && !G.EV.has('plague'),
      apply(s) {
        const un = G.res.filter(r => !r.coveredMed);
        const n = Math.min(un.length, G.U.randInt(6, 12));
        G.U.shuffle(un).slice(0, n).forEach(r => { r.sick = true; });
        return `瘟疫席卷而来!${n} 名未获医疗覆盖的居民染病,快用医疗与水井遏制!`;
      },
    },
    {
      id: 'fire', name: '走水失火', icon: '🔥', good: false, weight: 1, days: 1,
      cond: s => s.day > 40 && G.builds.filter(b => b.type !== 'road').length >= 8,
      apply(s) {
        const cands = G.builds.filter(b => b.type !== 'road' && !G.B.wellCovered(b.x, b.y));
        if (!cands.length) return null;
        const b = G.U.pick(cands);
        G.B.remove(b, true);
        return `${b.def.name}被大火吞没!在水井覆盖范围内可预防火灾。`;
      },
    },
    {
      id: 'bandits', name: '盗匪劫掠', icon: '🗡️', good: false, weight: 2, days: 1,
      cond: s => s.day > 25 && s.pop >= 45 && (s.wood + s.food > 100),
      apply(s) {
        const guarded = G.builds.some(b => b.def.aura && b.def.aura.kind === 'guard' && b.eff > 0);
        const rate = guarded ? 0.06 : 0.18;
        const lw = Math.floor(s.wood * rate), lf = Math.floor(s.food * rate);
        G.sim.state.wood -= lw; G.sim.state.food -= lf;
        return guarded
          ? `盗匪来袭,被治安所的卫兵击退!仅损失 ${lw} 木材、${lf} 粮食。`
          : `盗匪洗劫了仓库!损失 ${lw} 木材、${lf} 粮食。建造治安所可以震慑他们。`;
      },
    },
    {
      id: 'blizzard', name: '暴风雪', icon: '🌨️', good: false, weight: 2, days: 4,
      cond: s => G.sim.seasonIdx() === 3,
      mods: { foodConsMult: 1.3, prodMult: 0.75 },
      apply() { return '暴风雪来袭!耗粮 +30%,生产 -25%,持续 4 天。'; },
    },
    {
      id: 'festival', name: '丰收庆典', icon: '🎉', good: true, weight: 2, days: 1,
      cond: s => s.pop >= 15,
      mods: { joyBonus: 12, taxMult: 1.15 },
      apply() { return '丰收庆典!今天人人喜悦(+12 幸福),税金 +15%。'; },
    },
    {
      id: 'merchant', name: '流浪商队', icon: '🐪', good: true, weight: 2, days: 1,
      cond: () => true,
      apply(s) {
        if (G.builds.some(b => b.def.trade && b.eff > 0)) {
          G.EV.merchantBuff = true;
          return '商队进城!交易所今日收购价翻倍。';
        }
        G.sim.state.gold += 40;
        return '一支商队路过,留下了 40 金币的过路税。';
      },
    },
    {
      id: 'settlers', name: '移民潮', icon: '🧳', good: true, weight: 1.5, days: 1,
      cond: s => s.pop >= 20 && s.hap >= 55,
      apply(s) {
        // 同时受住房余量、人口硬上限与单次规模上限约束(原来一次最多 16 人,是"人突然多到看不懂"的主因)
        const E = G.CFG.ECON;
        const free = Math.min(G.R.housingFree(), Math.max(0, E.popCap - G.res.length), E.migrantBurst);
        const n = Math.min(free, G.U.randInt(2, E.migrantBurst));
        if (n <= 0) return null;
        G.R.spawn(n);
        return `${n} 名新移民听说这里生活安稳,举家迁入!`;
      },
    },
    {
      id: 'goodharvest', name: '风调雨顺', icon: '🌻', good: true, weight: 1.5, days: 6,
      cond: s => s.pop >= 15,
      mods: { farmMult: 1.5 },
      apply() { return '风调雨顺!未来 6 天农田产量 +50%。'; },
    },
  ];

  // 目标链(引导里程碑)
  // prog: 当前目标的显示进度 0..1(仅用于顶栏目标条/里程碑列表的进度条,与 check 同一数据源,不参与结算;
  //       未提供 prog 的目标按 0 处理,UI 会做钳制与异常兜底)。
  const OBJECTIVES = [
    { text: '铺设至少 8 格道路', check: () => G.B.count('road') >= 8, prog: () => G.B.count('road') / 8 },
    { text: '建造 2 座木屋和 1 座农田', check: () => G.B.count('cottage') >= 2 && G.B.count('farm') >= 1, prog: () => Math.min(G.B.count('cottage') / 2, G.B.count('farm')) },
    { text: '村庄人口达到 20', check: () => G.sim.pop() >= 20, prog: () => G.sim.pop() / 20 },
    { text: '建造一座酒馆和一座药草屋', check: () => G.B.count('tavern') >= 1 && G.B.count('herbalist') >= 1, prog: () => Math.min(G.B.count('tavern'), G.B.count('herbalist')) },
    { text: '拥有一座水井和一座谷仓', check: () => G.B.count('well') >= 1 && G.B.count('granary') >= 1, prog: () => Math.min(G.B.count('well'), G.B.count('granary')) },
    { text: '人口达到 40 且幸福度 ≥ 55 → 颁布城镇宪章', check: () => G.sim.state.stage >= 2, prog: () => G.sim.state.stage >= 2 ? 1 : Math.min(G.sim.pop() / 40, G.sim.hap() / 55) },
    { text: '建造学堂与治安所', check: () => G.B.count('school') >= 1 && G.B.count('guard') >= 1, prog: () => Math.min(G.B.count('school'), G.B.count('guard')) },
    { text: '解锁一块新领地(点击地图上的暗色区块)', check: () => G.M.openCount() >= 2, prog: () => G.U.clamp(G.M.openCount() - 1, 0, 1) },
    { text: '人口达到 120 且幸福度 ≥ 60 → 颁布王城敕令', check: () => G.sim.state.stage >= 3, prog: () => G.sim.state.stage >= 3 ? 1 : Math.min(G.sim.pop() / 120, G.sim.hap() / 60, G.B.count('school')) },
    { text: '建造一座大学', check: () => G.B.count('university') >= 1, prog: () => G.B.count('university') },
    { text: '人口达到 300 且幸福度 ≥ 70 → 伟大王国!', check: () => G.sim.pop() >= 300 && G.sim.hap() >= 70, prog: () => Math.min(G.sim.pop() / 300, G.sim.hap() / 70) },
  ];

  return {
    TERR, NEEDS, BUILDS, CATS, STAGES, ZONE_COST, START, BASECAP, ECON, NAT, SEASONS, NAMES, EVENTS, OBJECTIVES,
    MAPW: 72, MAPH: 72, ZSIZE: 24, TS: 32,
  };
})();
