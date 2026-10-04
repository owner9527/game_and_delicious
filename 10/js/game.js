/* ============================================================
   情绪花园 — 游戏状态与核心逻辑
   存档（localStorage 双副本）/ 生长与萎靡 / 生态四指标 /
   生态事件 / 经济与等级 / 每日任务 / 成就 / 心灵旅程 / 日志
   ============================================================ */
window.EG = window.EG || {};

EG.SAVE_KEY = 'eg_save_v1';
EG.LEVEL_GRID = { 1: 4, 6: 5, 12: 6, 20: 7, 30: 8 };

EG.G = null;

EG.Game = {
  /* ---------- 新档 ---------- */
  newGame(name) {
    const plots = [];
    for (let i = 0; i < 64; i++) plots.push({ unlocked: i < 6 });
    EG.G = {
      v: 1,
      name: name || '秘密花园',
      created: Date.now(), lastSeen: Date.now(),
      crystals: 60, exp: 0, level: 1,
      grid: { size: 4 },
      plots,
      plants: {}, plantSeq: 1,
      dex: {},
      events: [], eventsSeen: {},
      diary: [], months: {},
      tasks: this.freshTasks(),
      ach: {}, journeyStep: 0,
      inv: { items: {}, pots: { pot_terra: true }, decor: {} },
      eco: { sun: 50, hum: 50, fer: 50, har: 50 },
      buffs: [],
      stats: { planted: 0, harvested: 0, watered: 0, listened: 0, melody: 0, pruned: 0, recorded: 0, embraced: 0, meditations: 0, shareCards: 0, bloomedTotal: 0, witheredTotal: 0, memorials: 0, dayStreak: 0, lastRecordDay: '', careStreak: 0, lastCareDay: '', inColor: 0, inText: 0, inMusic: 0 },
      settings: { speed: 1, bgm: true, sfx: true, fontScale: 100, highContrast: false, lowFx: false, four32: false },
      tutorial: { done: false, step: 0 },
      _tick: 0,
    };
    this.save();
  },

  freshTasks() {
    return { date: EG.dayKey(), progress: { record: 0, care: 0, harvest: 0 }, claimed: {} };
  },

  /* ---------- 存档 ---------- */
  save() {
    if (!EG.G) return;
    EG.G.lastSeen = Date.now();
    try {
      const raw = JSON.stringify(EG.G);
      try {
        const bak = localStorage.getItem(EG.SAVE_KEY);
        if (bak) localStorage.setItem(EG.SAVE_KEY + '.bak', bak);
      } catch (e) {}
      localStorage.setItem(EG.SAVE_KEY, raw);
    } catch (e) { console.warn('存档失败', e); }
  },

  load() {
    let raw = null;
    try { raw = localStorage.getItem(EG.SAVE_KEY) || localStorage.getItem(EG.SAVE_KEY + '.bak'); } catch (e) {}
    if (!raw) return false;
    try {
      const g = JSON.parse(raw);
      if (!g || !g.plants) return false;
      g.settings = Object.assign({ speed: 1, bgm: true, sfx: true, fontScale: 100, highContrast: false, lowFx: false, four32: false }, g.settings);
      g.inv = Object.assign({ items: {}, pots: { pot_terra: true }, decor: {} }, g.inv);
      g.stats = Object.assign({ planted: 0, harvested: 0, watered: 0, listened: 0, melody: 0, pruned: 0, recorded: 0, embraced: 0, meditations: 0, shareCards: 0, bloomedTotal: 0, witheredTotal: 0, memorials: 0, dayStreak: 0, lastRecordDay: '', careStreak: 0, lastCareDay: '', inColor: 0, inText: 0, inMusic: 0 }, g.stats);
      EG.G = g;
      return true;
    } catch (e) { return false; }
  },

  reset() { try { localStorage.removeItem(EG.SAVE_KEY); localStorage.removeItem(EG.SAVE_KEY + '.bak'); } catch (e) {} EG.G = null; },

  /* ---------- 离线补偿 ---------- */
  catchup() {
    const g = EG.G;
    const gapMs = Date.now() - (g.lastSeen || Date.now());
    const summary = { gapH: gapMs / 3.6e6, grown: [], long: gapMs > 7 * 24 * 3.6e6 };
    if (gapMs > 30e3) {
      for (const id in g.plants) {
        const pl = g.plants[id];
        if (pl.withered) continue;
        const before = EG.stageOf(pl.growth);
        this.advanceGrowth(pl, gapMs / 1000 * 0.5);
        const after = EG.stageOf(pl.growth);
        if (after > before) summary.grown.push({ name: EG.PLANT_BY_ID[pl.species].name, from: before, to: after });
        if (before < 4 && after >= 4) this.onBloom(pl, true);
        if (pl.growth >= 100) pl.growth = 100;
        this.checkWither(pl);
      }
    }
    return summary;
  },

  /* ---------- 主循环（每秒）---------- */
  tick() {
    const g = EG.G; if (!g) return;
    g._tick++;
    const dt = 1;
    const now = Date.now();
    /* 每日任务重置 */
    if (g.tasks.date !== EG.dayKey()) g.tasks = this.freshTasks();
    /* buff 过期 */
    g.buffs = (g.buffs || []).filter(b => b.until > now);
    /* 植物生长 / 萎靡 / 凋谢 */
    for (const id in g.plants) {
      const pl = g.plants[id];
      if (pl.withered) continue;
      const before = EG.stageOf(pl.growth);
      this.advanceGrowth(pl, dt);
      const after = EG.stageOf(pl.growth);
      if (after > before) {
        EG.Garden.floatText(pl.plot, EG.stageUpLine(after), EG.EMOTIONS[pl.emo.cat].color);
        if (after === 4) this.onBloom(pl, false);
      }
      this.accumulateWilt(pl, dt);
      this.checkWither(pl);
    }
    /* 生态漂移 */
    if (g._tick % 5 === 0) this.ecoDrift(5);
    /* 事件检查 */
    if (g._tick % 30 === 0) { this.checkEvents(); this.checkQuests(); }
    if (g._tick % 45 === 0) this.save();
  },

  effMs(ts) { return (Date.now() - ts) * (EG.G.settings.speed || 1); },

  growthMult(pl) {
    const g = EG.G;
    let m = (g.settings.speed || 1);
    const graceDays = (Date.now() - g.created) < 3 * 864e5;
    if (!g.tutorial.done || graceDays) m *= 1.5;
    for (const b of g.buffs) if (b.type === 'growth' && (!pl || !pl.planted || pl.planted < b.until)) m *= b.mult;
    const evs = EG.activeEvents();
    for (const e of evs) if (e.fx && e.fx.growth) m *= e.fx.growth;
    m *= 0.9 + g.eco.fer / 500;
    if (pl && pl.tutorial) m = 0;
    return m;
  },

  advanceGrowth(pl, dtSec) {
    if (pl.growth >= 100) return;
    const sp = EG.PLANT_BY_ID[pl.species];
    const rate = 100 / (sp.hours * 3600);
    pl.growth = Math.min(100, pl.growth + rate * dtSec * this.growthMult(pl));
  },

  accumulateWilt(pl, dtSec) {
    const g = EG.G;
    if (!g.tutorial.done) return;
    if ((Date.now() - g.created) < 3 * 864e5) return;
    if (EG.activeEvents().some(e => e.fx && e.fx.autoWater)) { pl.lastWater = Date.now(); return; }
    const hours = this.effMs(pl.lastWater) / 3.6e6;
    if (hours > 18) pl.wilt = EG.clamp(pl.wilt + (dtSec * (g.settings.speed || 1) / 3600) * 2 * (this.droughtActive() ? 1.8 : 1), 0, 100);
  },

  droughtActive() { return EG.activeEvents().some(e => e.id === 'ev_drought'); },

  checkWither(pl) {
    if (pl.withered || EG.stageOf(pl.growth) < 4 || pl.tutorial) return;
    /* 绽放后的存活期按真实时间计算：时间流速（×60/×360）只加速生长阶段，
       不加速凋谢倒计时，否则加速档下存活期会被压缩到几分钟 */
    const base = pl.bloomedAt || pl.planted;
    if (base && Date.now() - base > 72 * 3.6e6) {
      pl.withered = true;
      EG.G.stats.witheredTotal++;
      EG.toast(`「${EG.PLANT_BY_ID[pl.species].name}」安静地凋谢了。点一点它，可以让它留在花园，或温柔告别 🥀`);
      EG.SFX.chime();
      EG.uiRefresh && EG.uiRefresh();
    }
  },

  onBloom(pl, silent) {
    pl.bloomedAt = Date.now();
    EG.G.stats.bloomedTotal++;
    if (!silent) {
      EG.Garden.bloomFx(pl.plot);
      EG.SFX.motif(pl.emo.cat);
      EG.toast(`「${EG.PLANT_BY_ID[pl.species].name}」绽放了 🌸`);
    }
  },

  /* ---------- 生态 ---------- */
  ecoTarget() {
    const g = EG.G;
    const acc = { sun: 50, hum: 50, fer: 50, har: 50 };
    let n = 0;
    for (const id in g.plants) {
      const pl = g.plants[id];
      if (pl.kept) continue;   /* 已陈列的纪念植株不再参与生态演算 */
      const emo = EG.EMOTIONS[pl.emo.cat];
      const w = (0.6 + pl.emo.intensity / 15) * (pl.withered ? 0.3 : 1);
      for (const k of ['sun', 'hum', 'fer', 'har']) acc[k] += emo.eco[k] * w;
      n++;
    }
    const norm = 1 + 0.55 * Math.log2(1 + n);
    for (const k of ['sun', 'hum', 'fer', 'har']) acc[k] = EG.clamp(50 + (acc[k] - 50) / norm, 0, 100);
    return acc;
  },

  ecoDrift(dtSec) {
    const g = EG.G;
    const t = this.ecoTarget();
    const k = EG.clamp(dtSec * 0.004, 0, 1);
    for (const key of ['sun', 'hum', 'fer', 'har']) g.eco[key] = EG.clamp(EG.lerp(g.eco[key], t[key], k), 0, 100);
  },

  /* ---------- 事件 ---------- */
  checkEvents() {
    const g = EG.G, now = Date.now();
    g.events = (g.events || []).filter(e => e.until > now);
    for (const def of EG.EVENTS) {
      const active = g.events.some(e => e.id === def.id);
      if (active) continue;
      let hit = false;
      if (def.cond) hit = def.cond(g);
      else if (def.random) hit = Math.random() < def.random && Object.keys(g.plants).length > 2;
      if (hit) {
        g.events.push({ id: def.id, until: now + def.hours * 3.6e6 });
        g.eventsSeen[def.id] = (g.eventsSeen[def.id] || 0) + 1;
        if (def.reward && (g.eventsSeen[def.id] <= 3)) { g.crystals += def.reward; EG.toast(`生态事件「${def.name}」触发 +${def.reward} 💠`); }
        else EG.toast(`生态事件「${def.name}」${def.icon}`);
        EG.SFX.chime();
      }
    }
  },

  /* ---------- 种植 ---------- */
  canPlantAt(plotIdx) {
    const g = EG.G;
    const info = g.plots[plotIdx];
    return info && info.unlocked && !info.plantId;
  },

  plant(seed, plotIdx) {
    const g = EG.G;
    if (!this.canPlantAt(plotIdx)) return null;
    /* 教学第一株：标记为教学植物，照料时快速成长 */
    if (!seed.tutorial && EG.Tutorial && EG.Tutorial.step === 1 && !g.tutorial.done) seed.tutorial = true;
    /* 选择物种：按情绪类别 + 强度挑植物（同株内含随机性） */
    const family = EG.PLANTS.filter(p => p.emo === seed.cat);
    const rnd = EG.RNG(seed.seedStr + g.plantSeq);
    let sp = family[Math.floor(rnd() * family.length)];
    let variant = 0;
    if (seed.intensity >= 8 && rnd() < 0.45) variant = 1;
    if (rnd() < 0.05) variant = 2;
    const id = 'p' + (g.plantSeq++);
    const pl = {
      id, species: sp.id, seed: seed.seedStr, variant,
      emo: { cat: seed.cat, intensity: seed.intensity, v: seed.v, a: seed.a },
      inputType: seed.inputType, note: (seed.note || '').slice(0, 60),
      pot: 'pot_terra', plot: plotIdx,
      planted: Date.now(), growth: seed.growth ?? 0, wilt: 0,
      lastWater: Date.now(), lastLight: 0, lastMelody: 0, lastPrune: 0,
      bloomedAt: 0, withered: false, tutorial: !!seed.tutorial,
      forFriend: !!seed.forFriend,
    };
    g.plants[id] = pl;
    g.plots[plotIdx].plantId = id;
    g.stats.planted++;
    if (seed.tutorial) pl.growth = Math.max(pl.growth, 45);
    this.record(seed.inputType, seed.cat, seed.intensity, seed.note, id);
    EG.Garden.plantFx(plotIdx);
    EG.SFX.plant();
    this.addExp(10);
    this.bumpTask('record');
    this.checkQuests();
    this.save();
    return pl;
  },

  /* ---------- 照料 ---------- */
  water(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered) return false;
    if (!pl.tutorial && this.effMs(pl.lastWater) < 30 * 60e3) { EG.toast('它刚喝过水啦，土壤还很湿润'); return false; }
    const beforeStage = EG.stageOf(pl.growth);
    let gain = 8;
    if (this.droughtActive()) gain *= EG.activeEvents().find(e => e.id === 'ev_drought').fx.waterBoost;
    if (pl.tutorial) gain = 40;
    pl.lastWater = Date.now();
    pl.growth = Math.min(100, pl.growth + gain);
    g.stats.watered++;
    this.bumpTask('care');
    this.careStreak();
    this.addExp(2);
    EG.SFX.water();
    EG.Garden.floatText(pl.plot, `+${Math.round(gain)} 成长`, '#8FD0FF');
    if (EG.Tutorial) EG.Tutorial.onWatered(pid);
    this.afterCare(pl, beforeStage);
    return true;
  },

  setLight(pid, mode) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered) return false;
    if (this.effMs(pl.lastLight) < 60 * 60e3) { EG.toast('光线刚刚调整过，让它适应一会儿'); return false; }
    const beforeStage = EG.stageOf(pl.growth);
    const sp = EG.PLANT_BY_ID[pl.species];
    const gain = sp.pref === mode ? 15 : 5;
    pl.lastLight = Date.now();
    pl.growth = Math.min(100, pl.growth + gain);
    this.bumpTask('care');
    this.careStreak();
    this.addExp(2);
    EG.SFX.pop();
    EG.Garden.floatText(pl.plot, `+${gain} 成长`, '#FFE08A');
    this.afterCare(pl, beforeStage);
    return true;
  },

  playMelody(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered) return false;
    if (this.effMs(pl.lastMelody) < 20 * 60e3) { EG.toast('它还想再听一会儿刚才的旋律'); return false; }
    const beforeStage = EG.stageOf(pl.growth);
    pl.lastMelody = Date.now();
    pl.growth = Math.min(100, pl.growth + 6);
    EG.SFX.motif(pl.emo.cat);
    /* 安抚周边：同行同列距离 1 的植物 +3 */
    const N = g.grid.size;
    const row = Math.floor(pl.plot / N), col = pl.plot % N;
    for (const oid in g.plants) {
      const o = g.plants[oid];
      if (o.id === pid || o.withered) continue;
      const orow = Math.floor(o.plot / N), ocol = o.plot % N;
      if (Math.abs(orow - row) + Math.abs(ocol - col) === 1) {
        o.growth = Math.min(100, o.growth + 3);
        EG.Garden.floatText(o.plot, '+3', '#D8C8F0');
      }
    }
    g.stats.melody++;
    this.bumpTask('care');
    this.careStreak();
    this.addExp(2);
    EG.Garden.floatText(pl.plot, '+6 成长', '#D8C8F0');
    this.afterCare(pl, beforeStage);
    return true;
  },

  listen(pid, text) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered || !text || !text.trim()) return false;
    const beforeStage = EG.stageOf(pl.growth);
    const r = EG.parseText(text) || { cat: pl.emo.cat };
    const match = r.cat === pl.emo.cat;
    const gain = match ? 20 : 10;
    pl.growth = Math.min(100, pl.growth + gain);
    pl.wilt = Math.max(0, pl.wilt - 15);
    if (pl.emo.cat === 'anger' && pl.wilt > 25) g.stats.embraced++;
    g.stats.listened++;
    this.bumpTask('care');
    this.careStreak();
    this.addExp(match ? 4 : 2);
    EG.SFX.chime();
    EG.Garden.floatText(pl.plot, match ? '+20 它感到被理解了' : '+10 它听着呢', '#C8E8C0');
    this.afterCare(pl);
    return match;
  },

  prune(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered) return false;
    if (this.effMs(pl.lastPrune) < 4 * 3.6e6) { EG.toast('刚刚修剪过，让它休息一下'); return false; }
    const beforeStage = EG.stageOf(pl.growth);
    pl.lastPrune = Date.now();
    pl.wilt = 0;
    g.stats.pruned++;
    this.bumpTask('care');
    this.careStreak();
    EG.SFX.pop();
    EG.Garden.floatText(pl.plot, '萎靡清零 ✂', '#B8E8B0');
    this.afterCare(pl, beforeStage);
    return true;
  },

  afterCare(pl, beforeStage) {
    if (beforeStage === undefined) beforeStage = EG.stageOf(pl.growth);
    const after = EG.stageOf(pl.growth);
    if (after > beforeStage) {
      EG.Garden.floatText(pl.plot, EG.stageUpLine(after), EG.EMOTIONS[pl.emo.cat].color);
      if (after === 4) this.onBloom(pl, false);
    }
    this.checkWither(pl);
    EG.uiRefresh && EG.uiRefresh();
    this.save();
  },

  changePot(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl) return;
    const owned = Object.keys(g.inv.pots);
    const idx = owned.indexOf(pl.pot);
    pl.pot = owned[(idx + 1) % owned.length];
    EG.SFX.pop();
    this.save();
  },

  useItemOnPlant(pid, itemId) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || (g.inv.items[itemId] || 0) <= 0) return false;
    if (itemId === 'honey_fruit') {
      pl.wilt = 0; EG.Garden.floatText(pl.plot, '萎靡清零 🍯', '#FFD280');
    } else if (itemId === 'starfer') {
      if (pl.variant === 2 || EG.stageOf(pl.growth) >= 4) { EG.toast('这株已经定型了，试试更年轻的植物吧'); return false; }
      if (Math.random() < 0.45) {
        pl.variant = 2;
        EG.Garden.floatText(pl.plot, '✨ 星辉变异！', '#FFE08A');
        EG.toast('星辉变异！它的花瓣染上了星光');
      } else { EG.Garden.floatText(pl.plot, '……这次没有变化', '#CCC'); return true; }
    } else if (itemId === 'spray') {
      if (!pl.withered) { EG.toast('记忆喷雾只对凋谢的植物有效'); return false; }
      pl.withered = false; pl.growth = 0; pl.wilt = 0; pl.bloomedAt = 0;
      EG.Garden.floatText(pl.plot, '记忆恢复 🌫️', '#D8E8F0');
      EG.toast('它回到了种子状态，带着被记得的温暖');
    } else return false;
    g.inv.items[itemId]--;
    EG.SFX.chime();
    EG.uiRefresh && EG.uiRefresh();
    this.save();
    return true;
  },

  useDew() {
    const g = EG.G;
    if ((g.inv.items.dew || 0) <= 0) return false;
    g.inv.items.dew--;
    g.buffs.push({ type: 'growth', mult: 1.2, until: Date.now() + 3 * 3.6e6 });
    EG.toast('平静露珠洒下了，3 小时内新种子成长 +20% 💧');
    EG.SFX.water();
    this.save();
    return true;
  },

  /* ---------- 收获与凋谢 ---------- */
  harvest(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || pl.withered || EG.stageOf(pl.growth) < 4) return null;
    const sp = EG.PLANT_BY_ID[pl.species];
    const gain = EG.clamp(15 + pl.emo.intensity * 2 + pl.variant * 5, 15, 40);
    g.crystals += gain;
    /* 图鉴 */
    const d = g.dex[pl.species] = g.dex[pl.species] || { n: 0, variants: [false, false, false], first: Date.now(), species: pl.species };
    d.n++;
    d.variants[pl.variant] = true;
    this.addExp(15 + pl.variant * 5);
    g.stats.harvested++;
    this.bumpTask('harvest');
    /* 情绪果实掉落 */
    let drop = null;
    if (Math.random() < 0.25) {
      drop = EG.pick(['dew', 'honey_fruit', 'starfer']);
      g.inv.items[drop] = (g.inv.items[drop] || 0) + 1;
    }
    /* 日志 */
    g.diary.unshift({ t: Date.now(), type: 'harvest', cat: pl.emo.cat, text: `「${sp.name}」绽放归来，结晶 +${gain}`, pid });
    if (g.diary.length > 400) g.diary.length = 400;
    EG.SFX.coin();
    EG.Garden.bloomFx(pl.plot);
    EG.Garden.floatText(pl.plot, `+${gain} 💠`, '#F2A93B');
    delete g.plants[pid];
    g.plots[pl.plot].plantId = null;
    this.checkQuests();
    this.save();
    return { gain, drop, species: sp, variant: pl.variant };
  },

  clearWithered(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || !pl.withered) return false;
    g.stats.memorials++;
    g.diary.unshift({ t: Date.now(), type: 'wither', cat: pl.emo.cat, text: `与「${EG.PLANT_BY_ID[pl.species].name}」温柔告别，化作纪念花束的一束`, pid });
    if (g.diary.length > 400) g.diary.length = 400;
    g.eco.fer = EG.clamp(g.eco.fer + 3, 0, 100);
    EG.SFX.chime();
    delete g.plants[pid];
    g.plots[pl.plot].plantId = null;
    this.checkQuests();
    this.save();
    return true;
  },

  /* 凋谢后「留在花园」：移入装饰层永久陈列，腾出地块，原句保留在植株上 */
  keepWithered(pid) {
    const g = EG.G, pl = g.plants[pid];
    if (!pl || !pl.withered || pl.kept) return false;
    pl.kept = true;
    if (pl.plot >= 0 && g.plots[pl.plot] && g.plots[pl.plot].plantId === pid) g.plots[pl.plot].plantId = null;
    pl.plot = -1;
    g.diary.unshift({ t: Date.now(), type: 'keep', cat: pl.emo.cat, text: `「${EG.PLANT_BY_ID[pl.species].name}」留在了花园里，替你记住那一天`, pid });
    if (g.diary.length > 400) g.diary.length = 400;
    EG.SFX.chime();
    EG.toast('它留在了花园里，成为一座小小的纪念 🏡');
    this.save();
    return true;
  },

  /* ---------- 记录 / 日志 / 年轮 ---------- */
  record(inputType, cat, intensity, note, pid) {
    const g = EG.G;
    g.stats.recorded++;
    g.stats['in' + inputType.charAt(0).toUpperCase() + inputType.slice(1)]++;
    const today = EG.dayKey();
    const yest = EG.dayKey(new Date(Date.now() - 864e5));
    if (g.stats.lastRecordDay === yest) g.stats.dayStreak++;
    else if (g.stats.lastRecordDay !== today) g.stats.dayStreak = 1;
    g.stats.lastRecordDay = today;
    const mk = EG.monthKey();
    g.months[mk] = g.months[mk] || { joy: 0, calm: 0, sad: 0, anger: 0, anxiety: 0, attach: 0 };
    g.months[mk][cat]++;
    g.diary.unshift({ t: Date.now(), type: inputType, cat, intensity, text: (note || '').slice(0, 60), pid });
    if (g.diary.length > 400) g.diary.length = 400;
    this.bumpTask('record');
  },

  careStreak() {
    const g = EG.G;
    const today = EG.dayKey(), yest = EG.dayKey(new Date(Date.now() - 864e5));
    if (g.stats.lastCareDay === yest) g.stats.careStreak++;
    else if (g.stats.lastCareDay !== today) g.stats.careStreak = 1;
    g.stats.lastCareDay = today;
  },

  /* ---------- 经济 / 等级 ---------- */
  expNeed(l) { return Math.round(60 * Math.pow(l, 1.6)); },

  addExp(n) {
    const g = EG.G;
    g.exp += n;
    while (g.exp >= this.expNeed(g.level) && g.level < 50) {
      g.exp -= this.expNeed(g.level);
      g.level++;
      EG.toast(`花园升到了 Lv.${g.level} 🎉`);
      EG.SFX.chime();
      const newSize = EG.LEVEL_GRID[g.level];
      if (newSize && newSize > g.grid.size) {
        const cap = EG.gridCap(window.innerWidth);
        if (newSize <= cap) {
          g.grid.size = newSize;
          EG.Garden.layout();
          EG.toast(`花园扩建为 ${newSize}×${newSize}！解锁新地块吧`);
        } else {
          /* 窄屏：单格太小不可玩，先扩到当前上限，更大规格等屏幕宽敞时补上 */
          if (cap > g.grid.size) { g.grid.size = cap; EG.Garden.layout(); }
          g.grid.pending = Math.max(g.grid.pending || 0, newSize);
          EG.toast(`花园扩建为 ${g.grid.size}×${g.grid.size}！更大的土地等屏幕宽敞时再开垦`);
        }
      }
    }
  },

  /* 屏幕变宽敞时，补上之前因窄屏而暂缓的扩建（Garden.resize 会调用） */
  applyGridPending() {
    const g = EG.G;
    if (!g || !g.grid.pending) return;
    const cap = EG.gridCap(window.innerWidth);
    if (g.grid.pending <= cap && g.grid.size < g.grid.pending) {
      g.grid.size = g.grid.pending;
      g.grid.pending = 0;
      EG.Garden.layout();
      EG.toast(`花园扩建为 ${g.grid.size}×${g.grid.size}！解锁新地块吧`);
      this.save();
    }
  },

  plotCost() { return 8 + EG.G.plots.filter(p => p.unlocked).length * 3; },

  unlockPlot(plotIdx) {
    const g = EG.G;
    const info = g.plots[plotIdx];
    /* 以有效（可能被窄屏上限收窄）的网格规格为准，避免解锁到看不见的地块 */
    const N = Math.min(g.grid.size, (EG.Garden && EG.Garden.size) || g.grid.size);
    if (!info || info.unlocked) return false;
    if (plotIdx >= N * N) { EG.toast('这片区域还没有开垦——先提升花园等级吧'); return false; }
    const cost = this.plotCost();
    if (g.crystals < cost) { EG.toast(`解锁这块地需要 ${cost} 💠，还差一点呢`); return false; }
    g.crystals -= cost;
    info.unlocked = true;
    EG.SFX.plant();
    EG.toast('开垦了一块新土地 🌱');
    this.addExp(5);
    this.save();
    return true;
  },

  buy(kind, id) {
    const g = EG.G;
    const def = kind === 'pot' ? EG.POT_BY_ID[id] : kind === 'item' ? EG.ITEMS.find(i => i.id === id) : EG.DECORS.find(d => d.id === id);
    if (!def) return false;
    if (kind === 'pot' && g.inv.pots[id]) return false;
    if (kind === 'decor' && g.inv.decor[id]) return false;
    if (g.crystals < def.price) { EG.toast('结晶还不够，慢慢攒就好 💠'); return false; }
    g.crystals -= def.price;
    if (kind === 'pot') { g.inv.pots[id] = true; EG.toast(`「${def.name}」搬进了花园 🪴`); }
    if (kind === 'item') { g.inv.items[id] = (g.inv.items[id] || 0) + 1; EG.toast(`获得了「${def.name}」${def.icon}`); }
    if (kind === 'decor') { g.inv.decor[id] = true; EG.toast(`「${def.name}」装点好了 ✨`); }
    EG.SFX.coin();
    this.addExp(3);
    this.save();
    return true;
  },

  /* ---------- 任务 / 成就 / 旅程 ---------- */
  bumpTask(key) {
    const g = EG.G;
    if (g.tasks.date !== EG.dayKey()) g.tasks = this.freshTasks();
    g.tasks.progress[key] = (g.tasks.progress[key] || 0) + 1;
  },

  claimTask(key) {
    const g = EG.G;
    if (g.tasks.claimed[key]) return false;
    const goal = { record: 1, care: 3, harvest: 1 }[key];
    if ((g.tasks.progress[key] || 0) < goal) return false;
    g.tasks.claimed[key] = true;
    g.crystals += 10;
    EG.SFX.coin();
    EG.toast('每日任务完成 +10 💠');
    this.save();
    return true;
  },

  checkQuests() {
    const g = EG.G;
    for (const a of EG.ACHIEVEMENTS) {
      if (g.ach[a.id]) continue;
      let ok = false;
      try { ok = a.cond(g); } catch (e) {}
      if (ok) {
        g.ach[a.id] = true;
        g.crystals += 20;
        EG.toast(`成就解锁「${a.name}」+20 💠`);
        EG.SFX.chime();
      }
    }
    while (g.journeyStep < EG.JOURNEY.length) {
      const j = EG.JOURNEY[g.journeyStep];
      let ok = false;
      try { ok = j.cond(g); } catch (e) {}
      if (!ok) break;
      g.journeyStep++;
      g.crystals += j.reward;
      EG.toast(`心灵旅程 第${g.journeyStep}章「${j.name}」完成 +${j.reward} 💠`);
      EG.SFX.chime();
    }
  },

  addMeditation() {
    EG.G.stats.meditations++;
    this.save();
  },
};

/* 活跃事件列表（供渲染与逻辑） */
EG.activeEvents = function () {
  const g = EG.G;
  if (!g || !g.events) return [];
  const now = Date.now();
  return g.events.filter(e => e.until > now).map(e => EG.EVENTS.find(d => d.id === e.id)).filter(Boolean);
};
