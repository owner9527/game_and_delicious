/* 星穹拓荒 — 静态数据表（对应策划案：建筑/科技树/事件/成就/遗产/星体模板） */
window.SF = window.SF || {};
SF.data = (function () {
  'use strict';

  /* ============ 恒星模板 ============ */
  const STARS = [
    { id: 'red',    name: '红矮星',   color: '#FF7A5C', solar: 0.75, flare: 0.8,  desc: '光照微弱，太阳能效率低下' },
    { id: 'yellow', name: '黄矮星',   color: '#FFD873', solar: 1.0,  flare: 1.0,  desc: '稳定而温和的恒星' },
    { id: 'blue',   name: '蓝巨星',   color: '#7FB4FF', solar: 1.35, flare: 1.6,  desc: '光度极高，耀斑频发' },
    { id: 'white',  name: '白矮星',   color: '#E8F4FF', solar: 0.9,  flare: 1.1,  desc: '致密残骸，辐射偏强' },
    { id: 'binary', name: '双星系统', color: '#FFB47F', solar: 1.15, flare: 1.45, desc: '两颗恒星共舞，能量紊乱' },
  ];

  /* ============ 行星模板（六维环境：重力/大气/温度/辐射/矿藏/有机） ============ */
  const PLANETS = [
    { id: 'rock', name: '岩石行星', pal: ['#4A3F52', '#6B5A6E', '#8A7580', '#3A3142'], accent: '#B89ACD',
      env: { gravity: [45, 85], atmosphere: [20, 60], temperature: [30, 70], radiation: [20, 55], mineral: [55, 95], organic: [10, 45] },
      trait: '矿脉丰富，但地壳活动频繁' },
    { id: 'desert', name: '沙漠行星', pal: ['#7A5C3A', '#9C7B4A', '#C4A265', '#5E4630'], accent: '#E8C58A',
      env: { gravity: [35, 70], atmosphere: [25, 65], temperature: [60, 95], radiation: [30, 65], mineral: [45, 80], organic: [5, 35] },
      trait: '白天酷热，昼夜温差巨大' },
    { id: 'ocean', name: '海洋行星', pal: ['#1E4A66', '#2A6B8A', '#3D8FA8', '#173A52'], accent: '#6FD8E8',
      env: { gravity: [40, 80], atmosphere: [60, 95], temperature: [35, 70], radiation: [10, 40], mineral: [30, 60], organic: [55, 95] },
      trait: '生命繁盛，但可落脚的陆地稀少' },
    { id: 'ice', name: '冰封行星', pal: ['#5A7A9A', '#7FA0BE', '#A8C8E0', '#46607E'], accent: '#BFE8FF',
      env: { gravity: [30, 65], atmosphere: [15, 55], temperature: [2, 25], radiation: [15, 45], mineral: [50, 85], organic: [5, 30] },
      trait: '极寒冻结一切，供暖刻不容缓' },
    { id: 'lava', name: '熔岩行星', pal: ['#3A2430', '#57323E', '#6E4048', '#2A1A24'], accent: '#FF8A5C',
      env: { gravity: [50, 90], atmosphere: [30, 70], temperature: [80, 100], radiation: [35, 70], mineral: [70, 100], organic: [2, 20] },
      trait: '矿藏宝库，同时是地狱熔炉' },
    { id: 'moon', name: '巨行星卫星', pal: ['#4A4468', '#665C8A', '#8578A8', '#383252'], accent: '#B4A0E8',
      env: { gravity: [10, 45], atmosphere: [0, 25], temperature: [10, 45], radiation: [40, 85], mineral: [55, 90], organic: [10, 40] },
      trait: '几无大气，陨石长驱直入' },
  ];

  const ENV_KEYS = [
    { k: 'gravity', name: '重力', good: 'low' },
    { k: 'atmosphere', name: '大气', good: 'high' },
    { k: 'temperature', name: '温度', good: 'mid' },
    { k: 'radiation', name: '辐射', good: 'low' },
    { k: 'mineral', name: '矿藏丰度', good: 'high' },
    { k: 'organic', name: '有机指数', good: 'high' },
  ];

  /* ============ 建筑 ============ */
  // cost: 一次性造价; produce: 满效率每秒产出; upkeep: 每秒维护; workers: 岗位数
  const BUILDINGS = {
    command: {
      id: 'command', name: '指挥中枢', icon: '⌂', cat: 'core', unique: true,
      desc: '移民舰改装的核心舱段。它被摧毁之时，就是殖民点陷落之日。',
      cost: { ore: 0 }, buildTime: 0, hp: 900, size: 1.9, workers: 0,
      produce: { energy: 2, ore: 0.12 }, upkeep: {}, popCap: 8, morale: 2,
    },
    housing: {
      id: 'housing', name: '居住舱', icon: '▤', cat: 'live',
      desc: '标准六人居住模块，士气 +3。',
      cost: { ore: 60 }, buildTime: 8, hp: 220, size: 1.25, workers: 0,
      produce: {}, upkeep: { energy: 0.5 }, popCap: 6, morale: 3,
    },
    mine: {
      id: 'mine', name: '采矿场', icon: '⛏', cat: 'prod',
      desc: '必须毗邻矿脉建造。2 名工人产出矿石。',
      cost: { ore: 80 }, buildTime: 10, hp: 200, size: 1.3, workers: 2,
      produce: { ore: 0.85 }, upkeep: { energy: 1.0 }, adj: 'ore', adjRange: 4.6,
    },
    farm: {
      id: 'farm', name: '水培农场', icon: '❦', cat: 'prod',
      desc: '产出有机物（食物），受行星有机指数加成。',
      cost: { ore: 70 }, buildTime: 9, hp: 170, size: 1.4, workers: 2,
      produce: { organics: 0.9 }, upkeep: { energy: 1.0 },
    },
    solar: {
      id: 'solar', name: '太阳能阵列', icon: '☀', cat: 'prod',
      desc: '白天高效发电，夜间仅保留 15%。',
      cost: { ore: 55 }, buildTime: 7, hp: 120, size: 1.5, workers: 0,
      produce: { energy: 2.6 }, upkeep: {},
    },
    generator: {
      id: 'generator', name: '聚变发电机', icon: '⚙', cat: 'prod',
      desc: '全天候稳定发电，消耗少量矿石。',
      cost: { ore: 110 }, buildTime: 14, hp: 240, size: 1.35, workers: 0,
      produce: { energy: 6 }, upkeep: { ore: 0.08 },
    },
    lab: {
      id: 'lab', name: '研究站', icon: '⚗', cat: 'prod',
      desc: '2 名科学家持续产出科研点。',
      cost: { ore: 95 }, buildTime: 12, hp: 180, size: 1.3, workers: 2,
      produce: { research: 0.55 }, upkeep: { energy: 2.0 },
    },
    medbay: {
      id: 'medbay', name: '医疗站', icon: '✚', cat: 'live',
      desc: '治疗附近殖民者，大幅加速瘟疫痊愈。士气 +2。',
      cost: { ore: 85 }, buildTime: 11, hp: 190, size: 1.2, workers: 1,
      produce: {}, upkeep: { energy: 1.0 }, morale: 2,
    },
    warehouse: {
      id: 'warehouse', name: '物资仓库', icon: '▩', cat: 'core',
      desc: '储量 +400 矿石/有机物、+150 能源，耐久较高。',
      cost: { ore: 65 }, buildTime: 8, hp: 300, size: 1.45, workers: 0,
      produce: {}, upkeep: {}, storage: { ore: 400, organics: 400, energy: 150 },
    },
    rec: {
      id: 'rec', name: '娱乐中心', icon: '♪', cat: 'live',
      desc: '全息影院与重力酒吧。士气 +9。',
      cost: { ore: 90 }, buildTime: 12, hp: 200, size: 1.35, workers: 1,
      produce: {}, upkeep: { energy: 1.0 }, morale: 9,
    },
    shield: {
      id: 'shield', name: '护盾发生器', icon: '⛨', cat: 'def',
      desc: '半径内建筑获得护盾，吸收陨石与星兽伤害。',
      cost: { ore: 140, research: 20 }, buildTime: 16, hp: 260, size: 1.3, workers: 0,
      produce: {}, upkeep: { energy: 2.2 }, shield: { radius: 9, amount: 60 },
    },
    turret: {
      id: 'turret', name: '防御炮塔', icon: '⌖', cat: 'def',
      desc: '自动索敌的磁轨炮，火力覆盖半径 8。',
      cost: { ore: 100 }, buildTime: 12, hp: 240, size: 1.05, workers: 0,
      produce: {}, upkeep: { energy: 1.0 }, combat: { dps: 18, range: 8 },
    },
    radtower: {
      id: 'radtower', name: '辐射屏蔽塔', icon: '☢', cat: 'def',
      desc: '半径 10 内殖民者受到的辐射伤害 -70%。',
      cost: { ore: 120, research: 15 }, buildTime: 14, hp: 210, size: 1.15, workers: 0,
      produce: {}, upkeep: { energy: 1.5 }, radProtect: 10,
    },
    beacon: {
      id: 'beacon', name: '曲速信标', icon: '✷', cat: 'special', unique: true,
      desc: '刺穿天穹的跃迁之塔。建成并充能完毕后，殖民点即可跃迁离开本星系。',
      cost: { ore: 500, organics: 150, energy: 250, research: 120 }, buildTime: 55, hp: 500, size: 1.7, workers: 0,
      produce: {}, upkeep: { energy: 4 }, chargeTime: 90,
    },
  };
  const BUILD_CATS = [
    { id: 'prod', name: '生产' }, { id: 'live', name: '生存' },
    { id: 'def', name: '防御' }, { id: 'core', name: '基地' }, { id: 'special', name: '特殊' },
  ];

  /* ============ 科技树：五系 × 八级，每局随机出现 60% ============ */
  // fx 键值由 game.recalcMods() 汇总
  const TECHS = [
    // —— 生存系 SURV ——
    { id: 'sv1', branch: 'surv', tier: 1, name: '水培优化', cost: 20, desc: '农场产出 +25%', fx: { farmYield: 0.25 } },
    { id: 'sv2', branch: 'surv', tier: 2, name: '医疗协议', cost: 32, desc: '治疗效率 +60%，殖民者生命上限 +15%', fx: { healMul: 0.6, colonistHp: 0.15 } },
    { id: 'sv3', branch: 'surv', tier: 3, name: '抗辐射涂层', cost: 45, desc: '辐射伤害 -40%', fx: { radRes: 0.4 } },
    { id: 'sv4', branch: 'surv', tier: 4, name: '模块化住房', cost: 65, desc: '人口上限 +25%', fx: { popCap: 0.25 } },
    { id: 'sv5', branch: 'surv', tier: 5, name: '心理关怀', cost: 85, desc: '基础士气 +6', fx: { morale: 6 } },
    { id: 'sv6', branch: 'surv', tier: 6, name: '疫苗工程', cost: 110, desc: '瘟疫感染率 -60%', fx: { plagueRes: 0.6 } },
    { id: 'sv7', branch: 'surv', tier: 7, name: '食物合成', cost: 140, desc: '农场产出再 +35%', fx: { farmYield: 0.35 } },
    { id: 'sv8', branch: 'surv', tier: 8, name: '生态循环', cost: 180, desc: '人口自然增长 +50%，士气 +4', fx: { growth: 0.5, morale: 4 } },
    // —— 工业系 INDU ——
    { id: 'in1', branch: 'indu', tier: 1, name: '精炼采掘', cost: 20, desc: '矿石产出 +25%', fx: { mineYield: 0.25 } },
    { id: 'in2', branch: 'indu', tier: 2, name: '预制构件', cost: 32, desc: '建造速度 +30%', fx: { buildSpeed: 0.3 } },
    { id: 'in3', branch: 'indu', tier: 3, name: '纳米修复', cost: 45, desc: '建筑缓慢自我修复（0.6/s）', fx: { selfRepair: 0.6 } },
    { id: 'in4', branch: 'indu', tier: 4, name: '自动钻探', cost: 65, desc: '矿石产出 +35%', fx: { mineYield: 0.35 } },
    { id: 'in5', branch: 'indu', tier: 5, name: '超导仓储', cost: 85, desc: '资源储量上限 +60%', fx: { storage: 0.6 } },
    { id: 'in6', branch: 'indu', tier: 6, name: '模块化设计', cost: 110, desc: '全部建筑造价 -12%', fx: { costMul: -0.12 } },
    { id: 'in7', branch: 'indu', tier: 7, name: '深层熔炉', cost: 140, desc: '矿石 +20%，能源产出 +15%', fx: { mineYield: 0.2, energyYield: 0.15 } },
    { id: 'in8', branch: 'indu', tier: 8, name: '自主工厂', cost: 180, desc: '建造速度 +50%', fx: { buildSpeed: 0.5 } },
    // —— 能源系 ENER ——
    { id: 'en1', branch: 'ener', tier: 1, name: '电网优化', cost: 20, desc: '能源产出 +15%', fx: { energyYield: 0.15 } },
    { id: 'en2', branch: 'ener', tier: 2, name: '高效光伏', cost: 32, desc: '太阳能夜间效率提升至 50%', fx: { nightYield: 0.35 } },
    { id: 'en3', branch: 'ener', tier: 3, name: '超级电容', cost: 45, desc: '能源储量 +300', fx: { energyCap: 300 } },
    { id: 'en4', branch: 'ener', tier: 4, name: '裂变反应堆', cost: 65, desc: '发电机产出 +35%', fx: { energyYield: 0.35 } },
    { id: 'en5', branch: 'ener', tier: 5, name: '节能改造', cost: 85, desc: '全部能耗 -15%', fx: { consumeMul: -0.15 } },
    { id: 'en6', branch: 'ener', tier: 6, name: '地热钻探', cost: 110, desc: '发电机产出 +30%', fx: { energyYield: 0.3 } },
    { id: 'en7', branch: 'ener', tier: 7, name: '无线传输', cost: 140, desc: '能源赤字容忍翻倍（赤字惩罚减半）', fx: { brownoutRes: 1 } },
    { id: 'en8', branch: 'ener', tier: 8, name: '零点模组', cost: 180, desc: '能源产出 +50%', fx: { energyYield: 0.5 } },
    // —— 护盾系 DEFS ——
    { id: 'df1', branch: 'defs', tier: 1, name: '装甲强化', cost: 20, desc: '建筑耐久 +25%', fx: { hp: 0.25 } },
    { id: 'df2', branch: 'defs', tier: 2, name: '火控系统', cost: 32, desc: '炮塔伤害 +30%', fx: { turretDps: 0.3 } },
    { id: 'df3', branch: 'defs', tier: 3, name: '偏导护盾', cost: 45, desc: '护盾容量 +40%，回充 +40%', fx: { shieldAmt: 0.4, shieldRegen: 0.4 } },
    { id: 'df4', branch: 'defs', tier: 4, name: '预警雷达', cost: 65, desc: '事件预警时间 +5 秒', fx: { eventWarn: 5 } },
    { id: 'df5', branch: 'defs', tier: 5, name: '点防御协议', cost: 85, desc: '炮塔攻速 +25%', fx: { turretRate: 0.25 } },
    { id: 'df6', branch: 'defs', tier: 6, name: '陨石偏导场', cost: 110, desc: '陨石伤害 -35%', fx: { meteorRes: 0.35 } },
    { id: 'df7', branch: 'defs', tier: 7, name: '民兵制度', cost: 140, desc: '殖民者武装化：基地 12 范围内对星兽反击', fx: { militia: 1 } },
    { id: 'df8', branch: 'defs', tier: 8, name: '轨道监视', cost: 180, desc: '事件预警 +5 秒，小地图全知', fx: { eventWarn: 5, scan: 1 } },
    // —— 探索系 EXPL ——
    { id: 'ex1', branch: 'expl', tier: 1, name: '地质扫描', cost: 20, desc: '矿脉产出 +30%', fx: { nodeOre: 0.3 } },
    { id: 'ex2', branch: 'expl', tier: 2, name: '生态学', cost: 32, desc: '有机物采集与农场 +30%', fx: { nodeOrg: 0.3, farmYield: 0.3 } },
    { id: 'ex3', branch: 'expl', tier: 3, name: '扩音天线', cost: 45, desc: '科研产出 +25%', fx: { labYield: 0.25 } },
    { id: 'ex4', branch: 'expl', tier: 4, name: '商务协议', cost: 65, desc: '商人交易价格 -25%', fx: { trade: 0.25 } },
    { id: 'ex5', branch: 'expl', tier: 5, name: '深空探测', cost: 85, desc: '科研产出 +30%', fx: { labYield: 0.3 } },
    { id: 'ex6', branch: 'expl', tier: 6, name: '遗迹解密', cost: 110, desc: '遗迹事件收益翻倍', fx: { ruin: 1 } },
    { id: 'ex7', branch: 'expl', tier: 7, name: '曲速航线', cost: 140, desc: '下一星系威胁等级 -1', fx: { warpThreat: 1 } },
    { id: 'ex8', branch: 'expl', tier: 8, name: '跃迁引擎', cost: 180, desc: '曲速信标充能时间 -40%', fx: { beaconCharge: 0.4 } },
  ];
  const BRANCHES = {
    surv: { name: '生存', color: '#7DD871' },
    indu: { name: '工业', color: '#FFB05C' },
    ener: { name: '能源', color: '#FFE066' },
    defs: { name: '护盾', color: '#FF8FB0' },
    expl: { name: '探索', color: '#35E0D6' },
  };

  /* ============ 事件 ============ */
  const EVENTS = [
    { id: 'meteor', name: '陨石雨', kind: 'strike', w: 10 },
    { id: 'beast', name: '星兽袭击', kind: 'strike', w: 9 },
    { id: 'pirate', name: '海盗袭掠', kind: 'strike', w: 6 },
    { id: 'quake', name: '星震', kind: 'strike', w: 3 },
    { id: 'storm', name: '暗物质风暴', kind: 'aura', w: 7 },
    { id: 'flare', name: '恒星耀斑', kind: 'aura', w: 5 },
    { id: 'radburst', name: '辐射爆发', kind: 'aura', w: 3 },
    { id: 'plague', name: '瘟疫爆发', kind: 'aura', w: 4 },
    { id: 'rich', name: '资源富矿', kind: 'good', w: 7 },
    { id: 'merchant', name: '流浪商人', kind: 'choice', w: 6 },
    { id: 'ruin', name: '遗迹信号', kind: 'choice', w: 5 },
    { id: 'migrant', name: '移民船', kind: 'choice', w: 5 },
    { id: 'derelict', name: '废弃船骸', kind: 'choice', w: 4 },
  ];

  /* ============ 成就（16 项，含 2 隐藏） ============ */
  const ACHIEVEMENTS = [
    { id: 'first_land', name: '初次落地', desc: '完成第一次行星降落' },
    { id: 'first_warp', name: '第一次跃迁', desc: '完成首次星系跃迁' },
    { id: 'pop60', name: '人口兴旺', desc: '单局殖民者达到 60 人' },
    { id: 'rank_s', name: '评级 S', desc: '单局结算获得 S 评价' },
    { id: 'no_loss_meteor', name: '无损防御', desc: '一次陨石雨中无任何建筑损毁' },
    { id: 'beast50', name: '猎兽者', desc: '累计击杀 50 只星兽' },
    { id: 'tech10', name: '博识', desc: '单局研究 10 项科技' },
    { id: 'station5', name: '深空行者', desc: '在长征中抵达第 5 站' },
    { id: 'campaign9', name: '凯旋而归', desc: '完成九站星图长征' },
    { id: 'endless30', name: '无尽远航', desc: '深空漫游坚持 30 分钟' },
    { id: 'rich1000', name: '精打细算', desc: '结算时矿石储备 ≥ 1000' },
    { id: 'trade3', name: '慈善家', desc: '累计与流浪商人完成 3 次交易' },
    { id: 'cure_plague', name: '医者仁心', desc: '治愈一次瘟疫' },
    { id: 'maxspeed', name: '速度与激情', desc: '以 3x 速度完成一次胜利跃迁' },
    { id: 'h_ftl', name: '致敬先驱', desc: '隐藏：开局 10 分钟内全员罹难', hidden: true },
    { id: 'h_ore2000', name: '矿石大亨', desc: '隐藏：单局矿石储量达到 2000', hidden: true },
  ];

  /* ============ 遗产解锁（跨局成长，不破坏局内公平） ============ */
  const LEGACY = [
    { id: 'l_pop', name: '资深船员', desc: '开局殖民者 +2', cost: 80, icon: '☻', fx: { pop: 2 } },
    { id: 'l_rsh', name: '预载数据', desc: '开局科研点 +50', cost: 60, icon: '✦', fx: { research: 50 } },
    { id: 'l_ore', name: '应急物资', desc: '开局矿石 +150', cost: 60, icon: '◆', fx: { ore: 150 } },
    { id: 'l_mine', name: '钻探专精', desc: '矿石产出 +10%', cost: 120, icon: '⛏', fx: { mineYield: 0.1 } },
    { id: 'l_farm', name: '农艺专精', desc: '农场产出 +10%', cost: 120, icon: '❦', fx: { farmYield: 0.1 } },
    { id: 'l_nrg', name: '能源专精', desc: '能源产出 +10%', cost: 120, icon: '⚡', fx: { energyYield: 0.1 } },
    { id: 'l_tech', name: '蓝图备份', desc: '开局免费获得 1 项一级科技', cost: 150, icon: '✧', fx: { startTech: 1 } },
    { id: 'l_cheap', name: '标准化组件', desc: '建筑造价 -5%', cost: 150, icon: '⬢', fx: { costMul: -0.05 } },
    { id: 'l_shield', name: '护航编队', desc: '开局附赠 1 座护盾发生器', cost: 200, icon: '⛨', fx: { startShield: 1 } },
    { id: 'l_morale', name: '开拓者精神', desc: '基础士气 +10', cost: 100, icon: '☺', fx: { morale: 10 } },
    { id: 'l_hp', name: '基因强化', desc: '殖民者生命上限 +20%', cost: 100, icon: '✚', fx: { colonistHp: 0.2 } },
    { id: 'l_carry', name: '深空货舱', desc: '跃迁时资源保留 +25%', cost: 180, icon: '▣', fx: { warpCarry: 0.25 } },
  ];

  /* ============ 殖民者代号 ============ */
  const COLONIST_NAMES = ['星尘', '远望', '磐石', '晨曦', '澜', '冬青', '白桦', '灯塔', '孤鹜', '青梧', '霜', '长庚', '北落', '司南', '扶摇', '云杉', '火种', '银鞍', '沙鸥', '疾风', '朔月', '南枝', '烛龙', '衡', '栖霞', '寒江', '叠嶂', '流萤', '征途', '守望', '拾荒者', '老练', '新芽', '铁匠', '医师', '教师', '工程师', '领航员', '植物学家', '地质师', '通讯员', '厨师', '诗人', '赌徒', '清道夫'];

  /* ============ 船载 AI 播报 ============ */
  const AI_LINES = {
    meteor: ['检测到大量高速碎屑进入大气层', '天降火雨——护盾与掩体准备'],
    beast: ['生物信号逼近：星兽群正在接近殖民地', '地平线上出现了大型掠食者'],
    pirate: ['警告：未识别武装船只请求…它们没有请求', '海盗登舰小组正在接近'],
    quake: ['地质结构失稳，星震即将来临'],
    storm: ['暗物质浓度飙升，能源系统效率受损', '风暴前沿抵达，请检查电网'],
    flare: ['恒星耀斑预警：辐射与电磁扰动上升'],
    radburst: ['辐射读数异常升高，请远离露天区域'],
    plague: ['检疫警报：检测到未知病原体'],
    rich: ['扫描到高品位富矿，抓紧开采！', '检测到浓缩有机质沉积'],
    merchant: ['附近出现流浪商队，愿意交易'],
    ruin: ['接收到规律性信号：疑似先遣文明遗迹'],
    migrant: ['一艘移民船请求加入殖民地'],
    derelict: ['发现废弃船骸，可能仍有可用物资'],
  };

  /* ============ 结算评价阈值 ============ */
  const RANKS = [
    { min: 85, rank: 'S' }, { min: 70, rank: 'A' }, { min: 55, rank: 'B' },
    { min: 40, rank: 'C' }, { min: 0, rank: 'D' },
  ];

  return {
    STARS, PLANETS, ENV_KEYS, BUILDINGS, BUILD_CATS, TECHS, BRANCHES,
    EVENTS, ACHIEVEMENTS, LEGACY, COLONIST_NAMES, AI_LINES, RANKS,
  };
})();
