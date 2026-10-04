'use strict';
// ================================================================
// 掉落生成 + 词条叠加(Build 数值计算)
// 所有装备从全局词条池 AFFIX 抽取;加词条 = 改 data.js,无需动这里
// ================================================================
const Loot = {
  _uid: 1,
  // 稀有度权重: 层数越深、幸运越高,高稀有权重按幂放大
  rollRarity(luck, floor) {
    const base = [46, 30, 15, 7, 2];
    const depth = Math.max(0, floor - 1);
    const l = 1 + (luck || 0);
    const ws = base.map((w, i) => w * Math.pow(l, i) * Math.pow(1 + depth * 0.05, i));
    let tot = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; }
    return 0;
  },
  rollAffixValue(def, rarity) {
    const base = def.per[clamp(rarity, 0, 4)];
    const v = base * (0.85 + Math.random() * 0.3) * RARITIES[rarity].mult;
    if (def.tier === 'special') return clamp(Math.round(v), 1, 5);
    return base >= 2 ? Math.max(1, Math.round(v)) : round1(v);
  },
  // 生成一件装备
  genItem(floor, opts = {}) {
    let rarity = opts.rarity != null ? opts.rarity : this.rollRarity(opts.luck || 0, floor);
    if (opts.minRarity != null && rarity < opts.minRarity) rarity = opts.minRarity;
    const kind = opts.kind || (Math.random() < 0.3 ? 'weapon' : 'passive');
    const item = { kind, rarity, floor, affixes: [], uid: 'it' + (this._uid++) };
    if (kind === 'weapon') {
      const w = rpick(WEAPONS);
      item.base = w.id;
      item.name = w.name;
      item.dmg = Math.round(w.dmg * (1 + 0.12 * (floor - 1)) * 10) / 10; // 基础伤害随掉落层数成长
    } else {
      const b = rpick(PASSIVE_BASES);
      item.base = b.id;
      item.name = b.name;
    }
    // 从词条池抽取 N 条互不重复的词条
    const pool = Object.keys(AFFIX).filter(k => (AFFIX[k].minR || 0) <= rarity);
    shuffleArr(pool);
    const n = RARITIES[rarity].affixes;
    const picked = pool.slice(0, n);
    item.affixes = picked.map(id => ({ id, v: this.rollAffixValue(AFFIX[id], rarity) }));
    // 传说保底: 必须带至少一条特效词条
    if (rarity >= 4 && !item.affixes.some(a => AFFIX[a.id].tier === 'special')) {
      const spKeys = pool.filter(k => AFFIX[k].tier === 'special');
      if (spKeys.length) item.affixes[item.affixes.length - 1] = { id: rpick(spKeys), v: this.rollAffixValue(AFFIX[spKeys[0]], rarity) };
    }
    return item;
  },
  // 起始武器
  starterWeapon() {
    const it = this.genItem(1, { kind: 'weapon', rarity: 0 });
    it.base = 'staff'; it.name = WEAPONS[0].name; it.dmg = WEAPONS[0].dmg;
    it.affixes = [{ id: 'maxHp', v: 12 }];
    return it;
  },
  itemName(item) {
    return RARITIES[item.rarity].name + '·' + item.name;
  },
  itemBase(item) {
    return item.kind === 'weapon' ? WEAPONS.find(w => w.id === item.base) : PASSIVE_BASES.find(b => b.id === item.base);
  },
  itemDescLines(item) {
    return item.affixes.map(a => {
      const d = AFFIX[a.id];
      if (!d) return '';
      if (d.tier === 'special') return `<span class="sp">◈ ${d.name}${roman(a.v)}:${d.fmt(a.v)}</span>`;
      return '· ' + d.fmt(a.v);
    });
  },
  sellValue(item) { return 6 + item.floor * 2 + item.rarity * 14; },
  rerollCost(floor) { return 20 + floor * 6; },
  // 重铸: 同稀有度重新抽取词条
  reroll(item) {
    const rarity = item.rarity;
    const pool = Object.keys(AFFIX).filter(k => (AFFIX[k].minR || 0) <= rarity);
    shuffleArr(pool);
    const n = item.affixes.length;
    item.affixes = pool.slice(0, n).map(id => ({ id, v: this.rollAffixValue(AFFIX[id], rarity) }));
    if (rarity >= 4 && !item.affixes.some(a => AFFIX[a.id].tier === 'special')) {
      const spKeys = pool.filter(k => AFFIX[k].tier === 'special');
      if (spKeys.length) item.affixes[n - 1] = { id: rpick(spKeys), v: this.rollAffixValue(AFFIX[spKeys[0]], rarity) };
    }
  },
  // 熔合: 吞噬另一件装备,随机强化自身一条词条(+25% 数值 / 特效 +1 级)
  mergeInto(target, food) {
    if (!target.affixes.length) return null;
    const a = rpick(target.affixes);
    const d = AFFIX[a.id];
    if (d.tier === 'special') a.v = clamp(a.v + 1, 1, 5);
    else a.v = d.per[clamp(target.rarity, 0, 4)] >= 2 ? a.v + Math.max(1, Math.round(a.v * 0.25)) : round1(a.v * 1.25);
    return a;
  },
  // ===== Build 计算: 基础(局外) → 武器词条 → 被动词条 → 祝福 =====
  computeStats(player) {
    const L = id => Meta.lvl(id);
    const s = {
      maxHp: 100 + L('hp') * 8,
      regen: 0.5 + L('regenMeta') * 0.3,
      speedPct: L('spd') * 0.03,
      dmgFlat: 0,
      dmgPct: L('dmg') * 0.05,
      aspd: 1,
      crit: 0.05 + L('crit') * 0.02,
      critMult: 1.6,
      projExtra: 0,
      projSpeedPct: 0,
      pierce: 0,
      armor: 0,
      dodge: 0,
      pickup: 1 + L('magnet') * 0.15,
      lifesteal: 0,
      goldFind: 1,
      luck: L('luck') * 0.06,
      xpGain: 1,
    };
    const sp = {};
    const fold = a => {
      const d = AFFIX[a.id];
      if (!d) return;
      if (d.tier === 'stat') d.apply(s, a.v);
      else sp[a.id] = Math.min(5, (sp[a.id] || 0) + clamp(Math.round(a.v), 1, 5)); // 特效词条跨装备叠加升阶
    };
    if (player.weapon) player.weapon.affixes.forEach(fold);
    player.passives.forEach(it => it && it.affixes.forEach(fold));
    (player.blessings || []).forEach(b => {
      if (b.affix) { const d = AFFIX[b.affix]; if (d) d.apply(s, b.amount); }
      else if (b.special) sp[b.special] = Math.min(5, (sp[b.special] || 0) + 1);
    });
    return { s, sp };
  },
  // 重算并应用到玩家身上(保持生命比例)
  applyStats(player) {
    const { s, sp } = this.computeStats(player);
    const ratio = player.maxHp ? player.hp / player.maxHp : 1;
    player.stats = s;
    player.sp = sp;
    player.maxHp = Math.max(1, Math.round(s.maxHp));
    player.hp = clamp(player.hp > 0 ? Math.round(player.maxHp * ratio) : player.maxHp, 1, player.maxHp);
    player.speed = 205 * (1 + s.speedPct);
    player.pickupR = 95 * s.pickup;
    // 庇护计时器(词条升阶后周期同步刷新)
    if (sp.aegis) {
      const period = AFFIX.aegis.mech(sp.aegis).period;
      if (!player.aegisPeriod) player.aegisT = player.aegisT || period;
      player.aegisPeriod = period;
    } else { player.aegisPeriod = 0; player.shield = false; }
  },
  // 玩家单发弹丸基础伤害(不含暴击)
  shotDmg(player) {
    const w = this.itemBase(player.weapon);
    const berserk = player.sp.berserk ? (1 - player.hp / player.maxHp) * AFFIX.berserk.mech(player.sp.berserk).full : 0;
    return (w.dmg + player.stats.dmgFlat) * (1 + player.stats.dmgPct + berserk);
  },
  weaponInterval(player) {
    const w = this.itemBase(player.weapon);
    const berserk = player.sp.berserk ? (1 - player.hp / player.maxHp) * AFFIX.berserk.mech(player.sp.berserk).full : 0;
    return w.interval / (player.stats.aspd * (1 + berserk));
  },
};
