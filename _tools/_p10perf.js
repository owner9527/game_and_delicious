(() => new Promise(res => {
  const out = {};
  try {
    if (!EG.G) EG.Game.newGame('perf');
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    EG.UI.modalStack = [];
    const plots = EG.G.plots.map((p, i) => ({ unlocked: i < 64, plantId: i < 64 ? 'p' + i : null }));
    const mk = list => {
      const o = {}; let i = 0;
      for (const [cat, n] of list) {
        const sp = EG.PLANTS.find(p => p.emo === cat);
        for (let k = 0; k < n; k++, i++) o['p' + i] = { id: 'p' + i, species: sp.id, seed: 'perf' + i, variant: 0, emo: { cat, intensity: 6, v: 0, a: 0 }, pot: 'pot_terra', plot: i, growth: 100, wilt: 0, withered: false, planted: Date.now(), bloomedAt: Date.now(), lastWater: Date.now() };
      }
      return o;
    };
    EG.G.plots = plots;
    EG.G.plants = mk([['joy', 10], ['calm', 12], ['sad', 10], ['anger', 10], ['anxiety', 10], ['attach', 12]]);
    EG.Garden.layout();
    const measure = n => { const t = performance.now(); for (let i = 0; i < n; i++) EG.Garden.render(performance.now() + i * 16); return +((performance.now() - t) / n).toFixed(2); };
    out.full64 = measure(40);
    EG.G.plants = {};
    EG.G.plots = plots.map(p => ({ ...p, plantId: null }));
    EG.Garden.layout();
    out.empty = measure(40);
    out.forms = Object.keys(EG._paramCache || {}).length;
    out.texPetalSize = 'n/a';
    out.dpr = EG.Garden.dpr; out.W = EG.Garden.W; out.H = EG.Garden.H;
    let last = performance.now(); const ds = [];
    const loop = now => {
      ds.push(now - last); last = now;
      if (ds.length < 100) requestAnimationFrame(loop);
      else {
        out.frameMs = +(ds.slice(30).reduce((a, b) => a + b, 0) / (ds.length - 30)).toFixed(2);
        out.fps = +(1000 / out.frameMs).toFixed(1);
        res(JSON.stringify(out));
      }
    };
    requestAnimationFrame(loop);
  } catch (e) { out.fatal = String(e && e.stack || e); res(JSON.stringify(out)); }
}))()
