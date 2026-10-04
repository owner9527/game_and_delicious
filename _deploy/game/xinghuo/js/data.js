/* ============================================================
 * data.js — 数据驱动层:常量 / 物品 / 建筑 / 配方 / 科技树 / 事件表
 * 加新内容 = 在这里注册新条目,引擎不变。
 * ============================================================ */
'use strict';

const TILE = 32;          // 每格世界像素
const CHUNK = 16;         // 分块边长(格)
const DAY_LEN = 210;      // 一昼夜秒数
const BASE_CAP = 150;     // 基础仓储容量
const STOCKPILE_CAP = 250;// 每座仓储堆增加容量
const WORKER_CARRY = 8;   // 工人单次搬运上限
const MAX_WORKERS = 10;

/* ---------- 物品 ---------- */
const ITEMS = {
  wood:    { name: '木头',   color: '#a06a3a', dot: '#a06a3a' },
  stone:   { name: '石头',   color: '#9aa0a6', dot: '#9aa0a6' },
  ironOre: { name: '铁矿石', color: '#c98d5e', dot: '#c96f3f' },
  coal:    { name: '煤炭',   color: '#4a4a52', dot: '#2e2e36' },
  iron:    { name: '铁锭',   color: '#c8ccd4', dot: '#e0e4ec' },
  crystal: { name: '水晶',   color: '#57d7d0', dot: '#57d7d0' },
  berry:   { name: '浆果',   color: '#c0392b', dot: '#d94f3d', food: 25 },
  wheat:   { name: '小麦',   color: '#d8b84a', dot: '#d8b84a' },
  bread:   { name: '面包',   color: '#c98a2e', dot: '#e0a04a', food: 60 },
};

/* ---------- 可采集资源节点 ---------- */
const NODES = {
  tree:    { name: '树木',   item: 'wood',    amount: 4 },
  rock:    { name: '岩石',   item: 'stone',   amount: 4 },
  iron:    { name: '铁矿脉', item: 'ironOre', amount: 4 },
  coal:    { name: '煤矿脉', item: 'coal',    amount: 4 },
  crystal: { name: '水晶簇', item: 'crystal', amount: 3 },
  berry:   { name: '浆果丛', item: 'berry',   amount: 3 },
};
const RICH_MULT = 2.2; // 富集矿脉产出倍率

/* ---------- 建筑 ---------- */
const BUILDINGS = {
  campfire: {
    name: '篝火', cost: { wood: 5 }, walkable: false, hp: 120, light: 4.6,
    desc: '营地核心。照亮夜晚,招募工人与回复的据点。',
  },
  stockpile: {
    name: '仓储堆', cost: { wood: 20 }, walkable: true, hp: 150, cap: STOCKPILE_CAP,
    desc: '每座 +250 仓储上限,工人的卸货点。',
  },
  torch: {
    name: '火把', cost: { wood: 2, stone: 1 }, walkable: true, hp: 40, light: 2.6,
    desc: '廉价的照明,压缩黑暗的领地。',
  },
  wallWood: {
    name: '木墙', cost: { wood: 4 }, walkable: false, hp: 260,
    desc: '阻挡蚀影兽。它们会啃墙——留好出入口。',
  },
  workbench: {
    name: '工作台', cost: { wood: 30, stone: 10 }, walkable: false, hp: 180, rp: 0.5, opBoost: 2.2,
    desc: '产出科研点 0.5/s;有工人操作时 ×2.2。',
  },
  farm: {
    name: '农田', cost: { wood: 15 }, walkable: true, hp: 80, tech: 'farming',
    desc: '工人播种与收割小麦(雨天加速生长)。',
  },
  kitchen: {
    name: '厨房', cost: { wood: 20, stone: 10 }, walkable: true, hp: 160, tech: 'cooking',
    recipe: { in: { wheat: 3 }, out: { bread: 1 }, time: 9 }, opBoost: 2.2,
    desc: '小麦×3 → 面包(食物+60)。有工人操作时更快。',
  },
  furnace: {
    name: '冶炼炉', cost: { stone: 30, ironOre: 10 }, walkable: false, hp: 300, tech: 'smelting',
    recipe: { in: { ironOre: 2, coal: 1 }, out: { iron: 1 }, time: 6 }, opBoost: 2.2,
    desc: '铁矿石×2 + 煤×1 → 铁锭。自动化产业链的起点。',
  },
  turret: {
    name: '弩炮塔', cost: { iron: 10, stone: 5 }, walkable: false, hp: 400, tech: 'turrets',
    range: 6.5, dmg: 14, cd: 1.1,
    desc: '自动射击射程内的蚀影兽,守卫基地。',
  },
  autominer: {
    name: '自动采矿机', cost: { iron: 15, crystal: 5 }, walkable: false, hp: 250, tech: 'automation',
    mineTime: 8,
    desc: '必须放置在矿脉上,自动持续开采入仓。',
  },
  lab: {
    name: '实验室', cost: { iron: 20, crystal: 10 }, walkable: false, hp: 220, tech: 'science',
    rp: 2, opBoost: 2,
    desc: '科研点 2/s;有工人操作时 ×2。',
  },
  dronebay: {
    name: '无人机站', cost: { iron: 40, crystal: 20 }, walkable: false, hp: 300, tech: 'drones',
    drones: 2,
    desc: '释放无人机,自动采集标点周围的一切资源。',
  },
  beacon: {
    name: '星界信标', cost: { iron: 100, crystal: 50, stone: 100 }, walkable: false, hp: 500, tech: 'beacon',
    buildWork: 60, win: true,
    desc: '最终奇观:点亮它的瞬间,你将赢得这场无尽拓荒。',
  },
};
const BUILD_ORDER = ['campfire','stockpile','torch','wallWood','workbench','farm','kitchen','furnace','turret','autominer','lab','dronebay','beacon'];

/* ---------- 科技树(模块化配方系统) ---------- */
const TECHS = [
  { id: 'farming',   name: '垦殖术',   cost: 20,  req: [],           tier: 2, desc: '解锁农田:稳定的食物来源。' },
  { id: 'cooking',   name: '烹饪术',   cost: 45,  req: ['farming'],  tier: 2, desc: '解锁厨房:小麦烤成高营养面包。' },
  { id: 'smelting',  name: '冶炼术',   cost: 70,  req: [],           tier: 3, desc: '解锁冶炼炉:矿石变铁锭。' },
  { id: 'turrets',   name: '弩炮学',   cost: 110, req: ['smelting'], tier: 3, desc: '解锁弩炮塔:夜袭不再是噩梦。' },
  { id: 'automation',name: '自动化',   cost: 160, req: ['smelting'], tier: 4, desc: '解锁自动采矿机:资源自己流入仓库。' },
  { id: 'science',   name: '高等学术', cost: 230, req: ['automation'],tier: 4, desc: '解锁实验室:科研速度大幅提升。' },
  { id: 'drones',    name: '无人机群', cost: 320, req: ['science'],  tier: 5, desc: '解锁无人机站:飞行采集,无视地形。' },
  { id: 'beacon',    name: '星界工程', cost: 500, req: ['drones'],   tier: 5, desc: '解锁星界信标:本局最终目标。' },
];

/* ---------- 事件表(天气 / 随机事件 + 状态机) ---------- */
const EVENTS = [
  { id: 'rain',     name: '丰润之雨', weight: 3, dur: 45,
    msg: '大雨降临,农田的作物疯狂生长。' },
  { id: 'veinsurge',name: '矿脉涌动', weight: 2,
    msg: '大地深处嗡鸣,附近涌出富集矿脉(已自动标记)!' },
  { id: 'raidwarn', name: '兽群低吼', weight: 2,
    msg: '林间兽影攒动……今夜的袭击将格外凶猛。' },
  { id: 'traveler', name: '神秘旅者', weight: 2,
    msg: '一位旅者借宿篝火,留下古老的研究笔记。科研 +40。' },
];
const EVENT_INTERVAL = 80; // 事件判定间隔(秒)

/* ---------- 平衡数值 ---------- */
const BAL = {
  playerSpeed: 135, workerSpeed: 118, droneSpeed: 200, monsterSpeed: 88,
  playerDmg: 12, playerAtkCd: 0.38, reach: 1.85,
  monsterDmg: 9, monsterAtkCd: 1.0,
  buildRate: 1.0,          // 工人每次锤击进度
  harvestInterval: 0.42,   // 采集节奏(秒)
  hungerRate: 100 / 260,   // 饥饿:约 4.3 分钟耗尽
  hungerEatAt: 38,
  starveDps: 2.2,
  regenHps: 1.1,           // 饱食>70 时回血
  nightSpawnBase: 2,       // 首夜基础怪数
  monsterHp: 26, monsterHpPerDay: 9,
};
