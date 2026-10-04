// ===== 事件系统:模拟时钟上的随机事件(涌现与挑战) =====
G.EV = (() => {
  const active = [];   // { id, untilDay }
  let nextDay = 0;

  function has(id) { return active.some(e => e.id === id); }

  function reset() {
    active.length = 0;
    nextDay = G.U.randInt(18, 26); // 开局保护期
  }

  // 当日生效的修正系数(joyBonus/sickBonus 为加法,其余为乘法)
  function mods() {
    const m = { prodMult: 1, foodConsMult: 1, joyBonus: 0, taxMult: 1, sickBonus: 0, farmMult: 1 };
    const additive = { joyBonus: true, sickBonus: true };
    for (const e of active) {
      const def = G.CFG.EVENTS.find(d => d.id === e.id);
      if (def && def.mods) {
        for (const k in def.mods) {
          m[k] = additive[k] ? (m[k] + def.mods[k]) : (m[k] * def.mods[k]);
        }
      }
    }
    return m;
  }

  function roll() {
    const s = G.sim.state;
    if (s.day < nextDay) return;
    nextDay = s.day + G.U.randInt(9, 15);
    const sandbox = s.difficulty === 'sandbox';
    const sPop = G.res.length, sHap = Math.round(G.sim.hap());
    const pool = G.CFG.EVENTS.filter(d => {
      if (sandbox && d.good === false) return false;
      if (has(d.id)) return false;
      const ctx = Object.assign({}, s, { pop: sPop, hap: sHap });
      return !d.cond || d.cond(ctx);
    });
    if (!pool.length) return;
    let total = pool.reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * total;
    let chosen = pool[0];
    for (const d of pool) { r -= d.weight; if (r <= 0) { chosen = d; break; } }
    const text = chosen.apply(s);
    if (!text) return;
    active.push({ id: chosen.id, untilDay: s.day + chosen.days });
    G.UI.toast(`${chosen.icon} ${chosen.name}`, chosen.good ? 'good' : 'bad');
    G.UI.log(`【事件】${text}`, chosen.good ? 'good' : 'bad');
  }

  function tickExpiry() {
    const s = G.sim.state;
    for (let i = active.length - 1; i >= 0; i--) {
      if (s.day > active[i].untilDay) {
        const def = G.CFG.EVENTS.find(d => d.id === active[i].id);
        if (def) G.UI.log(`【事件结束】${def.name}`, 'info');
        active.splice(i, 1);
      }
    }
  }

  function list() {
    return active.map(e => {
      const def = G.CFG.EVENTS.find(d => d.id === e.id);
      return def ? { name: def.name, icon: def.icon, days: Math.max(0, e.untilDay - G.sim.state.day) } : null;
    }).filter(Boolean);
  }

  return { reset, mods, roll, tickExpiry, has, list };
})();
