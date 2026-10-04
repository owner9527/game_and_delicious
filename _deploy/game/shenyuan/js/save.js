'use strict';
// ================================================================
// 双存档系统: 局外永久档案(Meta) + 局内进行中档案(RunSave)
// ================================================================
const META_KEY = 'shenyuan_meta_v1';
const RUN_KEY = 'shenyuan_run_v1';

const Meta = {
  data: null,
  def() {
    return { souls: 0, upgrades: {}, stats: { bestFloor: 0, kills: 0, runs: 0 }, settings: { sfx: true } };
  },
  load() {
    try {
      const raw = localStorage.getItem(META_KEY);
      this.data = raw ? Object.assign(this.def(), JSON.parse(raw)) : this.def();
    } catch (e) { this.data = this.def(); }
    if (!this.data.upgrades) this.data.upgrades = {};
    if (!this.data.stats) this.data.stats = { bestFloor: 0, kills: 0, runs: 0 };
    if (!this.data.settings) this.data.settings = { sfx: true };
    Sfx.enabled = this.data.settings.sfx !== false;
  },
  save() { try { localStorage.setItem(META_KEY, JSON.stringify(this.data)); } catch (e) {} },
  lvl(id) { return this.data.upgrades[id] || 0; },
  addSouls(n) {
    const mult = 1 + this.lvl('soul') * 0.10;
    this.data.souls += Math.round(n * mult);
    this.save();
  },
  buy(id) {
    const u = META_UPGRADES.find(u => u.id === id);
    const l = this.lvl(id);
    if (!u || l >= u.max) return false;
    const c = u.cost(l);
    if (this.data.souls < c) return false;
    this.data.souls -= c;
    this.data.upgrades[id] = l + 1;
    this.save();
    return true;
  },
};

const RunSave = {
  has() { try { return !!localStorage.getItem(RUN_KEY); } catch (e) { return false; } },
  save(obj) { try { localStorage.setItem(RUN_KEY, JSON.stringify(obj)); } catch (e) {} },
  load() { try { return JSON.parse(localStorage.getItem(RUN_KEY)); } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} },
};
