/* 星穹拓荒 — 程序化生成：种子 → 星系 → 行星 → 地表 → 降落点（纯函数管线） */
window.SF = window.SF || {};
SF.gen = (function () {
  'use strict';
  const D = SF.data;

  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  const STAR_PREFIX = ['开普勒', '格利泽', '天仓', '南门', '参宿', '织女', '天津', '轸宿', '角宿', '心宿', '天棓', '库楼'];

  /** 生成一个星系（1 主星 + 0~3 伴星） */
  function galaxy(seedStr, station, threat) {
    const rng = SF.rng.makeRng(seedStr + '|galaxy|' + station);
    const star = Object.assign({}, rng.pick(D.STARS));
    const sysName = rng.pick(STAR_PREFIX) + '-' + rng.int(101, 989);
    const count = 1 + rng.int(0, 3);
    const planets = [];
    const typePool = rng.shuffle(D.PLANETS);
    for (let i = 0; i < count; i++) {
      const tpl = typePool[i % typePool.length];
      const env = {};
      for (const ek of D.ENV_KEYS) {
        const r = tpl.env[ek.k];
        env[ek.k] = Math.round(Math.max(0, Math.min(100, SF.rng.makeRng(seedStr + '|' + i + ek.k).range(r[0], r[1]))));
      }
      planets.push({
        idx: i, name: sysName + ' ' + ROMAN[i], typeId: tpl.id, typeName: tpl.name,
        pal: tpl.pal, accent: tpl.accent, env,
        orbit: 120 + i * 82 + rng.int(-10, 10),
        size: i === 0 ? 24 : rng.int(9, 15),
        phase: rng.range(0, Math.PI * 2),
        speed: rng.range(0.05, 0.12) * (i === 0 ? 0.4 : 1),
        main: i === 0,
      });
    }
    // 主星殖民目标：随机三选一
    const gtype = rng.pick(['pop', 'score', 'beacon']);
    const goal = goalOf(gtype);
    return {
      seed: seedStr, station, threat, star, sysName, planets, goal,
      techs: pickTechs(seedStr, station),
    };
  }

  function goalOf(type) {
    if (type === 'pop') return { type: 'pop', target: 60, text: '殖民者数量达到 60 人' };
    if (type === 'score') return { type: 'score', target: 85, text: '殖民评分达到 85（S 级标准）' };
    return { type: 'beacon', target: 1, text: '建造曲速信标并完成充能' };
  }

  /** 每局随机出现 60% 的科技 */
  function pickTechs(seedStr, station) {
    const rng = SF.rng.makeRng(seedStr + '|techs|' + station);
    const byBranch = {};
    for (const b of Object.keys(D.BRANCHES)) {
      const all = D.TECHS.filter(t => t.branch === b);
      const keep = Math.max(3, Math.round(all.length * 0.6));
      byBranch[b] = rng.shuffle(all).slice(0, keep).sort((a, c) => a.tier - c.tier).map(t => t.id);
    }
    return byBranch;
  }

  /** 简易值噪声 */
  function noiseFn(rng, gridN) {
    const grid = [];
    for (let i = 0; i < gridN * gridN; i++) grid.push(rng.next());
    return function (x, y) { // x,y in [0,1)
      const gx = x * (gridN - 1), gy = y * (gridN - 1);
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const x1 = Math.min(gridN - 1, x0 + 1), y1 = Math.min(gridN - 1, y0 + 1);
      const fx = gx - x0, fy = gy - y0;
      const v = (a, b) => grid[b * gridN + a];
      const top = v(x0, y0) * (1 - fx) + v(x1, y0) * fx;
      const bot = v(x0, y1) * (1 - fx) + v(x1, y1) * fx;
      return top * (1 - fy) + bot * fy;
    };
  }

  /** 生成行星地表：低多边形块面 + 资源节点 + 降落点候选 */
  function map(seedStr, planet, station) {
    const rng = SF.rng.makeRng(seedStr + '|map|' + station);
    const W = 2600, H = 1800;
    const noise = noiseFn(rng, 7);

    // —— 低多边形块面 ——
    const CELL = 200, COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
    const pts = [];
    for (let r = 0; r <= ROWS; r++) {
      const row = [];
      for (let c = 0; c <= COLS; c++) {
        const jx = c * CELL + (c > 0 && c < COLS ? rng.range(-52, 52) : 0);
        const jy = r * CELL + (r > 0 && r < ROWS ? rng.range(-52, 52) : 0);
        row.push({ x: jx, y: jy });
      }
      pts.push(row);
    }
    const facets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const n = noise((c + 0.5) / COLS, (r + 0.5) / ROWS);
        const ci = Math.min(3, Math.floor(n * 4));
        const base = planet.pal[ci];
        const tri = (a, b, d) => ({
          pts: [pts[a[0]][a[1]], pts[b[0]][b[1]], pts[d[0]][d[1]]],
          color: shade(base, rng.range(-0.05, 0.05)),
        });
        facets.push(tri([r, c], [r, c + 1], [r + 1, c]));
        facets.push(tri([r, c + 1], [r + 1, c + 1], [r + 1, c]));
      }
    }

    // —— 岩石装饰 / 环形山 ——
    const rocks = [];
    for (let i = 0; i < 46; i++) {
      rocks.push({ x: rng.range(60, W - 60), y: rng.range(60, H - 60), s: rng.range(5, 16), c: rng.chance(0.5) });
    }

    // —— 资源节点 ——
    const env = planet.env;
    const oreN = 4 + Math.round(env.mineral / 13);      // 最多 ~11
    const orgN = 2 + Math.round(env.organic / 16);      // 最多 ~8
    const nodes = [];
    const used = [];
    function placeNode(type, amount) {
      for (let tries = 0; tries < 40; tries++) {
        const x = rng.range(150, W - 150), y = rng.range(150, H - 150);
        let ok = true;
        for (const u of used) {
          const dx = u.x - x, dy = u.y - y;
          if (dx * dx + dy * dy < 300 * 300) { ok = false; break; }
        }
        if (!ok) continue;
        used.push({ x, y });
        nodes.push({ id: nodes.length, type, x, y, amount, max: amount, rich: false, workers: [] });
        return;
      }
    }
    for (let i = 0; i < oreN; i++) placeNode('ore', Math.round(rng.range(900, 1500) * (1 + env.mineral / 160)));
    for (let i = 0; i < orgN; i++) placeNode('org', Math.round(rng.range(600, 1000) * (1 + env.organic / 140)));

    // —— 三个候选降落点（不同倾向） ——
    const sites = [];
    const siteR = 360;
    function siteProfile(x, y) {
      let ore = 0, org = 0;
      for (const n of nodes) {
        const dx = n.x - x, dy = n.y - y;
        if (dx * dx + dy * dy < siteR * siteR) { if (n.type === 'ore') ore++; else org++; }
      }
      return { ore, org };
    }
    const styles = rng.shuffle(['ore', 'org', 'balanced']);
    for (const st of styles) {
      let best = null, bestScore = -1;
      for (let tries = 0; tries < 90; tries++) {
        const x = rng.range(siteR + 120, W - siteR - 120), y = rng.range(siteR + 120, H - siteR - 120);
        const p = siteProfile(x, y);
        let score;
        if (st === 'ore') score = p.ore * 3 + p.org;
        else if (st === 'org') score = p.org * 3 + p.ore;
        else score = p.ore + p.org + (Math.min(p.ore, 2) + Math.min(p.org, 2)) * 1.5;
        // 与已选落点保持距离
        for (const s of sites) {
          const dx = s.x - x, dy = s.y - y;
          if (dx * dx + dy * dy < 700 * 700) score -= 10;
        }
        if (score > bestScore) { bestScore = score; best = { x, y, p }; }
      }
      const names = { ore: ['富矿带', '矿脉台地'], org: ['生机谷地', '孢子平原'], balanced: ['开阔台地', '中央高地'] };
      const blurbs = {
        ore: ['矿脉在脚下延伸，工业的火种', '地表裸露着高品位矿层'],
        org: ['植被与孢子遍布，食物无忧', '温润的有机质平原'],
        balanced: ['地形开阔，攻守兼备', '稳妥均衡的落点'],
      };
      sites.push({
        x: best.x, y: best.y, name: rng.pick(names[st]), blurb: rng.pick(blurbs[st]),
        oreNear: best.p.ore, orgNear: best.p.org,
      });
    }

    return { w: W, h: H, facets, rocks, nodes, sites, siteR };
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + Math.round(amt * 255), g = ((n >> 8) & 255) + Math.round(amt * 255), b = (n & 255) + Math.round(amt * 255);
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  return { galaxy, map, goalOf };
})();
