/* 星穹拓荒 — 元进度（遗产/成就/周榜/设置/存档）与主循环 */
window.SF = window.SF || {};
(function () {
  'use strict';
  const KEY = 'sf_meta_v1', RUN_KEY = 'sf_run_v1';

  /* ================= 元进度 ================= */
  const DEFAULTS = () => ({
    legacy: 0, legacyTotal: 0, spent: {}, achv: {},
    playCount: 0, lossStreak: 0,
    stats: { beasts: 0, trades: 0 },
    weekly: [],
    settings: { sound: true, perf: false, cb: false, font: 0, zen: false },
    ui: { logSeen: 0 },
  });

  SF.meta = {
    data: DEFAULTS(),
    ui: { logSeen: 0 },
    runAchv: [],   // 本局新解锁成就（结算展示）

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          this.data = Object.assign(DEFAULTS(), d);
          this.data.settings = Object.assign(DEFAULTS().settings, d.settings || {});
          this.data.stats = Object.assign(DEFAULTS().stats, d.stats || {});
          this.ui = Object.assign(this.ui, d.ui || {});
        }
      } catch (e) { this.data = DEFAULTS(); }
      this.data.ui = this.ui;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    },

    legacyFx() {
      const out = {};
      for (const id in this.data.spent) {
        if (!this.data.spent[id]) continue;
        const it = SF.data.LEGACY.find(l => l.id === id);
        if (!it) continue;
        for (const k in it.fx) out[k] = (out[k] || 0) + it.fx[k];
      }
      return out;
    },
    buy(id) {
      const it = SF.data.LEGACY.find(l => l.id === id);
      if (!it || this.data.spent[id] || this.data.legacy < it.cost) return false;
      this.data.legacy -= it.cost;
      this.data.spent[id] = 1;
      this.save();
      return true;
    },

    unlock(id) {
      if (this.data.achv[id]) return;
      const a = SF.data.ACHIEVEMENTS.find(a => a.id === id);
      if (!a) return;
      this.data.achv[id] = new Date().toLocaleDateString();
      this.runAchv.push(a);
      this.save();
      try { SF.ui.toast('🏅 成就达成：' + a.name, 'good'); } catch (e) {}
      SF.audio.good();
    },

    addStat(k, v) { this.data.stats[k] = (this.data.stats[k] || 0) + v; this.save(); },
    getStat(k) { return this.data.stats[k] || 0; },

    pityFactor() { return 1 - Math.min(0.3, Math.max(0, this.data.lossStreak - 1) * 0.1); },
    noteLoss() { this.data.lossStreak++; this.save(); },

    finishRun(g, legacy) {
      this.data.legacy += legacy;
      this.data.legacyTotal += legacy;
      if (!g.won) this.data.lossStreak++; else this.data.lossStreak = 0;
      this.addStat('beasts', 0);
      this.save();
      const got = this.runAchv.slice();
      this.runAchv = [];
      this.clearRun();
      return got;
    },

    addWeekly(entry) {
      this.data.weekly.push(entry);
      this.data.weekly.sort((a, b) => b.score - a.score);
      this.data.weekly = this.data.weekly.slice(0, 10);
      this.save();
    },

    /* ---- 里程碑存档 ---- */
    saveRunSnapshot(g) {
      try { localStorage.setItem(RUN_KEY, JSON.stringify(g.serialize())); } catch (e) {}
    },
    getRun() {
      try {
        const raw = localStorage.getItem(RUN_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} },
  };

  /* ================= 应用状态机 + 主循环 ================= */
  SF.app = { state: 'menu', now: 0, runBest: 0 };

  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0.016);
    last = ts;
    try {
      SF.ui.frame(dt, ts / 1000);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('load', () => {
    SF.meta.load();
    SF.render.init(document.getElementById('game-canvas'));
    SF.ui.init();
    SF.ui.showMenu();
    requestAnimationFrame(loop);
  });
})();
