'use strict';
// ================================================================
// 数据表驱动核心 —— 词条池 / 武器 / 敌人 / Boss / 祝福 / 局外升级
// 设计书约定:加新玩法 = 往对应表里加一行,系统自动接入
// ================================================================

// ---------- 稀有度(词条数量与数值倍率) ----------
const RARITIES = [
  { id: 0, name: '破旧', color: '#a8b2bc', affixes: 1, mult: 1.00 },
  { id: 1, name: '精良', color: '#57aaff', affixes: 2, mult: 1.12 },
  { id: 2, name: '稀有', color: '#ffd24d', affixes: 3, mult: 1.25 },
  { id: 3, name: '史诗', color: '#c07bff', affixes: 4, mult: 1.42 },
  { id: 4, name: '传说', color: '#ff6b57', affixes: 5, mult: 1.65 },
];

// ---------- 全局词条池 ----------
// tier: 'stat' 数值词条(per = 各稀有度基础值) / 'special' 特效词条(per = 各稀有度词条等级)
// minR: 最低掉落稀有度; w: 抽取权重; mech(l): 战斗系统读取的机制参数
const AFFIX = {
  // ===== 数值词条 =====
  flatDmg:   { tier: 'stat', name: '蛮力', w: 10, per: [2, 4, 7, 10, 13],       apply: (s, v) => s.dmgFlat += v,   fmt: v => `+${v} 攻击力` },
  dmgPct:    { tier: 'stat', name: '强击', w: 9,  per: [4, 7, 10, 14, 18],       apply: (s, v) => s.dmgPct += v / 100, fmt: v => `+${v}% 伤害` },
  aspd:      { tier: 'stat', name: '迅击', w: 9,  per: [5, 8, 12, 16, 20],       apply: (s, v) => s.aspd += v / 100, fmt: v => `+${v}% 攻击速度` },
  crit:      { tier: 'stat', name: '锐目', w: 8,  per: [3, 5, 8, 11, 14],        apply: (s, v) => s.crit += v / 100, fmt: v => `+${v}% 暴击率` },
  critDmg:   { tier: 'stat', name: '致命', w: 8,  per: [8, 14, 20, 28, 36],      apply: (s, v) => s.critMult += v / 100, fmt: v => `+${v}% 暴击伤害` },
  maxHp:     { tier: 'stat', name: '生机', w: 9,  per: [12, 20, 30, 42, 55],     apply: (s, v) => s.maxHp += v,     fmt: v => `+${v} 最大生命` },
  regen:     { tier: 'stat', name: '再生', w: 6,  per: [0.5, 0.8, 1.2, 1.7, 2.2],apply: (s, v) => s.regen += v,     fmt: v => `+${v}/秒 生命回复` },
  armor:     { tier: 'stat', name: '坚甲', w: 7,  per: [2, 3, 5, 7, 9],          apply: (s, v) => s.armor += v,     fmt: v => `+${v} 护甲` },
  dodge:     { tier: 'stat', name: '灵巧', w: 7,  per: [3, 5, 7, 9, 12],         apply: (s, v) => s.dodge += v / 100, fmt: v => `+${v}% 闪避` },
  moveSpeed: { tier: 'stat', name: '疾行', w: 7,  per: [4, 6, 9, 12, 15],        apply: (s, v) => s.speedPct += v / 100, fmt: v => `+${v}% 移动速度` },
  pickup:    { tier: 'stat', name: '磁石', w: 5,  per: [15, 25, 35, 50, 65],     apply: (s, v) => s.pickup += v / 100, fmt: v => `+${v}% 拾取范围` },
  lifesteal: { tier: 'stat', name: '嗜血', w: 5, minR: 1, per: [1, 2, 3, 4, 6], apply: (s, v) => s.lifesteal += v / 100, fmt: v => `+${v}% 吸血` },
  projSpeed: { tier: 'stat', name: '疾风弹', w: 5, per: [8, 12, 18, 24, 30],     apply: (s, v) => s.projSpeedPct += v / 100, fmt: v => `+${v}% 弹速` },
  pierce:    { tier: 'stat', name: '贯穿', w: 4,  per: [1, 1, 1, 2, 2],          apply: (s, v) => s.pierce += v,    fmt: v => `弹丸 +${v} 次穿透` },
  goldFind:  { tier: 'stat', name: '贪婪', w: 5,  per: [10, 15, 22, 30, 40],     apply: (s, v) => s.goldFind += v / 100, fmt: v => `+${v}% 金币获取` },
  luck:      { tier: 'stat', name: '幸运', w: 5,  per: [5, 8, 12, 16, 22],       apply: (s, v) => s.luck += v / 100, fmt: v => `+${v}% 幸运(提升掉落)` },
  xpGain:    { tier: 'stat', name: '智慧', w: 5,  per: [8, 12, 18, 24, 32],      apply: (s, v) => s.xpGain += v / 100, fmt: v => `+${v}% 经验获取` },
  projCount: { tier: 'stat', name: '弹幕', w: 2, minR: 2, per: [1, 1, 1, 1, 1], apply: (s, v) => s.projExtra += v, fmt: v => `+${v} 弹丸数量` },
  // ===== 特效词条(Build 核心, 可叠加至 Ⅴ) =====
  chain:   { tier: 'special', name: '连锁闪电', w: 4, minR: 1, color: '#ffe37e', tag: '连', per: [1, 1, 2, 2, 3],
    mech: l => ({ chance: 0.25 + 0.08 * l, jumps: 2 + l, mult: 0.55 + 0.10 * l }),
    fmt: l => `命中时 ${Math.round((0.25 + 0.08 * l) * 100)}% 几率释放连锁闪电,弹跳 ${2 + l} 次,每次造成 ${Math.round((0.55 + 0.10 * l) * 100)}% 伤害` },
  burn:    { tier: 'special', name: '烈焰核心', w: 4, color: '#ff8c4d', tag: '燃', per: [1, 1, 2, 2, 3],
    mech: l => ({ dps: 0.30 + 0.15 * l, dur: 3 }),
    fmt: l => `命中点燃敌人:3 秒内每秒造成 ${Math.round((0.30 + 0.15 * l) * 100)}% 攻击力的火焰伤害(可叠加)` },
  poison:  { tier: 'special', name: '剧毒侵染', w: 4, color: '#7fd45c', tag: '毒', per: [1, 1, 2, 2, 3],
    mech: l => ({ dps: 0.15 + 0.08 * l, dur: 4, maxStacks: 5 }),
    fmt: l => `命中附加毒素:4 秒内每秒造成 ${Math.round((0.15 + 0.08 * l) * 100)}% 攻击力的毒伤,最多叠 5 层` },
  frost:   { tier: 'special', name: '寒霜之触', w: 3, color: '#8cd8ff', tag: '霜', per: [1, 1, 2, 2, 3],
    mech: l => ({ slow: 0.20 + 0.08 * l, dur: 1.6, freezeAt: 6, freezeDur: 1.2 }),
    fmt: l => `命中减速 ${Math.round((0.20 + 0.08 * l) * 100)}%,叠满 6 层冻结 1.2 秒` },
  orbit:   { tier: 'special', name: '守护环刃', w: 3, minR: 1, color: '#d78cff', tag: '刃', per: [1, 1, 2, 2, 3],
    mech: l => ({ count: 1 + l, mult: 0.30 + 0.10 * l, radius: 78, spin: 3.2 }),
    fmt: l => `${1 + l} 枚守护之刃环绕自身,触碰敌人造成 ${Math.round((0.30 + 0.10 * l) * 100)}% 攻击力伤害` },
  thorns:  { tier: 'special', name: '荆棘甲壳', w: 3, color: '#7fae6a', tag: '棘', per: [1, 1, 2, 2, 3],
    mech: l => ({ mult: 0.25 + 0.15 * l }),
    fmt: l => `受到近战伤害时,反弹 ${Math.round((0.25 + 0.15 * l) * 100)}% 攻击力的伤害` },
  berserk: { tier: 'special', name: '狂战之血', w: 3, minR: 1, color: '#ff5c5c', tag: '狂', per: [1, 1, 2, 2, 3],
    mech: l => ({ full: 0.15 + 0.10 * l }),
    fmt: l => `生命每损失 10%,攻速与伤害提升 ${round1((0.15 + 0.10 * l) * 10)}%(满血无损)` },
  explode: { tier: 'special', name: '湮灭冲击', w: 2, minR: 2, color: '#ffb066', tag: '爆', per: [1, 1, 2, 2, 3],
    mech: l => ({ radius: 95 + 25 * l, mult: 0.60 + 0.20 * l }),
    fmt: l => `击杀时引发爆炸,对 ${95 + 25 * l} 范围内敌人造成 ${Math.round((0.60 + 0.20 * l) * 100)}% 攻击力伤害` },
  split:   { tier: 'special', name: '影分弹', w: 2, minR: 2, color: '#b0e0ff', tag: '分', per: [1, 1, 2, 2, 3],
    mech: l => ({ mult: 0.40 + 0.10 * l }),
    fmt: l => `弹丸命中后分裂成 2 枚小弹,各造成 ${Math.round((0.40 + 0.10 * l) * 100)}% 伤害` },
  execute: { tier: 'special', name: '死神宣告', w: 2, minR: 2, color: '#ff6b8a', tag: '决', per: [1, 1, 2, 2, 3],
    mech: l => ({ th: 0.10 + 0.04 * l }),
    fmt: l => `命中生命低于 ${Math.round((0.10 + 0.04 * l) * 100)}% 的普通敌人时,立即处决` },
  aegis:   { tier: 'special', name: '秘法庇护', w: 2, minR: 2, color: '#9fd8ff', tag: '盾', per: [1, 1, 2, 2, 3],
    mech: l => ({ period: Math.max(4, 11 - 2 * l) }),
    fmt: l => `每 ${Math.max(4, 11 - 2 * l)} 秒自动获得一层可抵挡一次伤害的护盾` },
  nova:    { tier: 'special', name: '奥术新星', w: 3, minR: 1, color: '#ffe9b0', tag: '星', per: [1, 1, 2, 2, 3],
    mech: l => ({ dmg: 2.0 + 0.7 * l, radius: 170 + 34 * l, cd: Math.max(4.5, 9 - 0.9 * l), knock: 130 }),
    fmt: l => `主动技能[Q]:释放冲击波,对 ${170 + 34 * l} 范围内敌人造成 ${Math.round((2.0 + 0.7 * l) * 100)}% 攻击力伤害并击退,冷却 ${Math.max(4.5, 9 - 0.9 * l).toFixed(1)} 秒` },
};

// ---------- 武器原型(决定基础攻击方式) ----------
const WEAPONS = [
  { id: 'staff',   name: '星辰法杖',   dmg: 11,  interval: 0.50, count: 1, spread: 0,    speed: 430, size: 7,  color: '#7ec8ff', desc: '稳定的奥术飞弹' },
  { id: 'bow',     name: '疾风长弓',   dmg: 7,   interval: 0.32, count: 1, spread: 0.04, speed: 620, size: 5,  color: '#a8ff9e', desc: '高频轻矢' },
  { id: 'cannon',  name: '龙息炮',     dmg: 26,  interval: 0.95, count: 1, spread: 0,    speed: 360, size: 12, color: '#ff9d5c', aoe: 58, desc: '轰击并引发范围爆炸' },
  { id: 'trident', name: '怒涛三叉戟', dmg: 6.5, interval: 0.55, count: 3, spread: 0.20, speed: 500, size: 6,  color: '#6cd8ff', desc: '一次投出三支分戟' },
  { id: 'scythe',  name: '裂魂之镰',   dmg: 14,  interval: 0.62, count: 1, spread: 0,    speed: 340, size: 28, color: '#d78cff', wave: true, life: 0.30, desc: '大范围弧形魂波,贯穿一切' },
];
// ---------- 被动装备外观原型 ----------
const PASSIVE_BASES = [
  { id: 'ring',     name: '指环', color: '#ffd24d' },
  { id: 'amulet',   name: '护符', color: '#7ec8ff' },
  { id: 'talisman', name: '徽记', color: '#c07bff' },
  { id: 'cloak',    name: '斗篷', color: '#a8ff9e' },
  { id: 'tome',     name: '秘典', color: '#ff9d5c' },
  { id: 'watch',    name: '怀表', color: '#ff6b8a' },
];

// ---------- 敌人图鉴(minFloor 控制解锁层数, w 为出现权重) ----------
const ENEMY_TYPES = {
  slime:   { name: '黏液怪',   hp: 20, dmg: 9,  speed: 78,  r: 15, color: '#7fd45c', xp: 5,  ai: 'chase',  minFloor: 1, w: 10 },
  bat:     { name: '暗影蝠',   hp: 11, dmg: 7,  speed: 168, r: 11, color: '#b06cff', xp: 5,  ai: 'bat',    minFloor: 1, w: 8 },
  archer:  { name: '骷髅弓手', hp: 16, dmg: 10, speed: 72,  r: 13, color: '#d8d2c4', xp: 8,  ai: 'ranged', range: 330, interval: 2.0, projSpeed: 270, minFloor: 2, w: 8 },
  bomber:  { name: '爆裂孢子', hp: 14, dmg: 26, speed: 125, r: 13, color: '#ff8c4d', xp: 8,  ai: 'bomber', blastR: 95, minFloor: 3, w: 6 },
  charger: { name: '狂角兽',   hp: 36, dmg: 16, speed: 82,  r: 17, color: '#e05c5c', xp: 12, ai: 'charger', chargeSpeed: 440, minFloor: 4, w: 6 },
  mage:    { name: '虚空法师', hp: 26, dmg: 12, speed: 62,  r: 14, color: '#5cc8ff', xp: 14, ai: 'caster', interval: 2.7, minFloor: 5, w: 5 },
  knight:  { name: '符文骑士', hp: 64, dmg: 18, speed: 66,  r: 18, color: '#c8b06c', xp: 18, ai: 'chase',  armor: 4, minFloor: 6, w: 5 },
};
// ---------- 精英词缀 ----------
const ELITE_MODS = [
  { id: 'swift', name: '迅捷', hpMult: 1.7, dmgMult: 1.2,  speedMult: 1.5,  color: '#66e0ff' },
  { id: 'stout', name: '坚韧', hpMult: 3.2, dmgMult: 1.1,  speedMult: 0.85, sizeMult: 1.35, color: '#ffd24d' },
  { id: 'vamp',  name: '汲血', hpMult: 2.2, dmgMult: 1.3,  speedMult: 1.1,  lifesteal: 0.6, color: '#ff6b8a' },
  { id: 'frost', name: '霜牙', hpMult: 2.0, dmgMult: 1.25, speedMult: 1.0,  chill: true, color: '#8cd8ff' },
];
// ---------- Boss(每 5 层循环, cycle 增幅) ----------
const BOSSES = [
  { id: 'bonedragon', name: '骨龙王',   hp: 560, dmg: 18, r: 46, color: '#e8e0c8', xp: 120, summon: 'bat',   attacks: ['radial', 'charge', 'summon'] },
  { id: 'demonlord',  name: '深渊魔君', hp: 760, dmg: 22, r: 48, color: '#ff5c5c', xp: 150, summon: 'slime', attacks: ['spiral', 'homing', 'summon', 'radial'] },
  { id: 'voidlord',   name: '虚空之主', hp: 980, dmg: 26, r: 50, color: '#b06cff', xp: 180, summon: 'mage',  attacks: ['rings', 'sweep', 'homing', 'charge'] },
];

// ---------- 祝福池(升级/祭坛三选一: 局内词条注入) ----------
// affix+amount: 数值词条增量 / special: 特效词条 +1 级 / healPct / gold: 即时效果
const BLESSING_POOL = [
  { id: 'b_dmg',     name: '力量祝福', desc: '伤害 +8%',                 w: 10, affix: 'dmgPct', amount: 8 },
  { id: 'b_aspd',    name: '迅捷祝福', desc: '攻击速度 +6%',             w: 10, affix: 'aspd', amount: 6 },
  { id: 'b_crit',    name: '锋锐祝福', desc: '暴击率 +5%',               w: 9,  affix: 'crit', amount: 5 },
  { id: 'b_critdmg', name: '斩首祝福', desc: '暴击伤害 +15%',            w: 8,  affix: 'critDmg', amount: 15 },
  { id: 'b_hp',      name: '血肉祝福', desc: '最大生命 +20,并回复 20 点', w: 9,  affix: 'maxHp', amount: 20, heal: 20 },
  { id: 'b_spd',     name: '疾风祝福', desc: '移动速度 +5%',             w: 8,  affix: 'moveSpeed', amount: 5 },
  { id: 'b_regen',   name: '泉涌祝福', desc: '生命回复 +0.8/秒',         w: 7,  affix: 'regen', amount: 0.8 },
  { id: 'b_armor',   name: '磐石祝福', desc: '护甲 +3',                  w: 7,  affix: 'armor', amount: 3 },
  { id: 'b_dodge',   name: '幻影祝福', desc: '闪避 +4%',                 w: 7,  affix: 'dodge', amount: 4 },
  { id: 'b_ls',      name: '汲取祝福', desc: '吸血 +1.5%',               w: 6,  affix: 'lifesteal', amount: 1.5 },
  { id: 'b_pierce',  name: '洞穿祝福', desc: '弹丸穿透 +1',              w: 5,  affix: 'pierce', amount: 1 },
  { id: 'b_luck',    name: '寻宝祝福', desc: '幸运 +8%(掉落更好)',       w: 6,  affix: 'luck', amount: 8 },
  { id: 'b_xp',      name: '贤者祝福', desc: '经验获取 +10%',            w: 6,  affix: 'xpGain', amount: 10 },
  { id: 'b_proj',    name: '千弹祝福', desc: '弹丸数量 +1',              w: 2,  affix: 'projCount', amount: 1 },
  { id: 'b_chain',   name: '雷霆之怒', desc: '获得/升级 连锁闪电',       w: 5, special: 'chain' },
  { id: 'b_burn',    name: '烈焰之心', desc: '获得/升级 燃烧',           w: 5, special: 'burn' },
  { id: 'b_poison',  name: '蛇毒之牙', desc: '获得/升级 剧毒',           w: 5, special: 'poison' },
  { id: 'b_frost',   name: '极寒之息', desc: '获得/升级 寒霜',           w: 5, special: 'frost' },
  { id: 'b_orbit',   name: '环刃之灵', desc: '获得/升级 守护环刃',       w: 5, special: 'orbit' },
  { id: 'b_berserk', name: '狂战之魂', desc: '获得/升级 狂战',           w: 4, special: 'berserk' },
  { id: 'b_thorns',  name: '荆棘之壳', desc: '获得/升级 荆棘',           w: 4, special: 'thorns' },
  { id: 'b_explode', name: '湮灭之愿', desc: '获得/升级 湮灭',           w: 3, special: 'explode' },
  { id: 'b_split',   name: '分裂之影', desc: '获得/升级 影分弹',         w: 3, special: 'split' },
  { id: 'b_aegis',   name: '庇护之誓', desc: '获得/升级 秘法庇护',       w: 3, special: 'aegis' },
  { id: 'b_execute', name: '处决之刻', desc: '获得/升级 死神宣告',       w: 3, special: 'execute' },
  { id: 'b_nova',    name: '新星觉醒', desc: '解锁/升级 主动技能[Q] 奥术新星', w: 6, special: 'nova' },
  { id: 'b_heal',    name: '圣光洗礼', desc: '立即回复 50% 生命',        w: 5, healPct: 0.5 },
  { id: 'b_gold',    name: '黄金之手', desc: '立即获得 60 金币',         w: 4, gold: 60 },
];

// ---------- 局外永久成长(深渊祭坛, 魂晶购买) ----------
const META_UPGRADES = [
  { id: 'hp',        name: '生命之泉', desc: '最大生命 +8/级',        max: 10, cost: l => 8 + l * 7 },
  { id: 'dmg',       name: '力量祝福', desc: '伤害 +5%/级',           max: 10, cost: l => 10 + l * 8 },
  { id: 'crit',      name: '鹰眼',     desc: '暴击率 +2%/级',         max: 5,  cost: l => 12 + l * 10 },
  { id: 'spd',       name: '疾风步',   desc: '移动速度 +3%/级',       max: 5,  cost: l => 10 + l * 8 },
  { id: 'magnet',    name: '寻宝罗盘', desc: '拾取范围 +15%/级',      max: 5,  cost: l => 8 + l * 6 },
  { id: 'luck',      name: '幸运硬币', desc: '幸运 +6%/级(掉落更好)', max: 5,  cost: l => 14 + l * 12 },
  { id: 'regenMeta', name: '再生之种', desc: '生命回复 +0.3/秒/级',   max: 5,  cost: l => 10 + l * 9 },
  { id: 'revive',    name: '不死鸟羽', desc: '每局复活次数 +1',       max: 3,  cost: l => 40 + l * 40 },
  { id: 'startGold', name: '行囊',     desc: '初始金币 +40/级',       max: 5,  cost: l => 8 + l * 6 },
  { id: 'soul',      name: '魂炼',     desc: '魂晶获取 +10%/级',      max: 5,  cost: l => 15 + l * 12 },
];

// ---------- 特效词条在 HUD 上的展示顺序 ----------
const SPECIAL_ORDER = ['chain', 'burn', 'poison', 'frost', 'orbit', 'thorns', 'berserk', 'explode', 'split', 'execute', 'aegis', 'nova'];
