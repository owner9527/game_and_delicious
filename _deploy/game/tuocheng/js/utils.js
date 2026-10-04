// ===== 工具函数 =====
const G = window.G = window.G || {};

G.U = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },

  // 确定性随机数生成器 (mulberry32)
  rng(seed) {
    let s = seed >>> 0;
    const f = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      f,
      range(a, b) { return a + f() * (b - a); },
      int(a, b) { return Math.floor(a + f() * (b - a + 1)); }, // 含两端
      pick(arr) { return arr[Math.floor(f() * arr.length)]; },
      chance(p) { return f() < p; },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(f() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
    };
  },

  // 运行时随机(非确定性)
  rand: null, // main.js 初始化
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },

  // 简易值噪声(双线性插值 + 两倍频)
  vnoise(x, y, seed, scale) {
    const fx = x / scale, fy = y / scale;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sm = t => t * t * (3 - 2 * t);
    const h = (a, b) => G.U.hash2(a, b, seed);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    const v = G.U.lerp(G.U.lerp(a, b, sm(tx)), G.U.lerp(c, d, sm(tx)), sm(ty));
    const v2 = G.U.hash2(ix * 7 + iy * 13, ix * 3 - iy * 5, seed + 999);
    return v * 0.82 + v2 * 0.18;
  },

  fmt(n) {
    n = Math.floor(n);
    return n.toLocaleString('en-US');
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  $(id) { return document.getElementById(id); },

  seedFromString(str) {
    if (!str) return (Math.random() * 4294967296) >>> 0;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
};
