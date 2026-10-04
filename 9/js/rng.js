/* 星穹拓荒 — 种子随机数工具（同一种子 → 完全一致的生成序列） */
window.SF = window.SF || {};
(function () {
  'use strict';

  // 字符串哈希 xmur3 → 得到 32 位种子状态
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // mulberry32 PRNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 创建可复现随机源 */
  function makeRng(seedStr) {
    const seedFn = xmur3(String(seedStr));
    const rand = mulberry32(seedFn());
    const api = {
      seed: String(seedStr),
      next: rand,                    // [0,1)
      range(min, max) { return min + rand() * (max - min); },
      int(min, max) { return Math.floor(min + rand() * (max - min + 1)); },
      chance(p) { return rand() < p; },
      pick(arr) { return arr[Math.floor(rand() * arr.length)]; },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      /** 按权重挑选 {key:weight} 或 [{w, ...}] */
      weighted(entries, wKey) {
        wKey = wKey || 'w';
        let total = 0;
        for (const e of entries) total += (wKey === 'w' ? (e.w !== undefined ? e.w : e[1]) : e[wKey]);
        let r = rand() * total;
        for (const e of entries) {
          r -= (wKey === 'w' ? (e.w !== undefined ? e.w : e[1]) : e[wKey]);
          if (r <= 0) return e;
        }
        return entries[entries.length - 1];
      },
      /** 正态分布(简易) */
      gauss(mean, sd) {
        const u = 1 - rand(), v = rand();
        return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      }
    };
    return api;
  }

  /** 运行时非确定随机（特效/战斗抖动用，不参与生成一致性） */
  const fx = {
    next: Math.random,
    range(min, max) { return min + Math.random() * (max - min); },
    int(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
    weighted(entries, wKey) {
      wKey = wKey || 'w';
      let total = 0;
      for (const e of entries) total += (wKey === 'w' ? (e.w !== undefined ? e.w : e[1]) : e[wKey]);
      let r = Math.random() * total;
      for (const e of entries) {
        r -= (wKey === 'w' ? (e.w !== undefined ? e.w : e[1]) : e[wKey]);
        if (r <= 0) return e;
      }
      return entries[entries.length - 1];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };

  /** 周挑战种子：ISO 周编号 */
  function weeklySeed() {
    const d = new Date();
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return 'WEEK-' + t.getUTCFullYear() + '-' + String(week).padStart(2, '0');
  }

  SF.rng = { makeRng, fx, weeklySeed };
})();
