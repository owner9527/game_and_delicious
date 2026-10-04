(() => {
  const out = {};
  try {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    EG.UI.modalStack = [];
    EG.Game.newGame('手机花园');
    EG.UI.refreshHUD(); EG.Garden.layout();
    const demo = [['joy', 'joy_daisy', 100], ['calm', 'calm_mint', 100], ['sad', 'sad_iris', 100], ['anger', 'anger_canna', 100], ['anxiety', 'anx_vine', 100], ['attach', 'att_rose', 100]];
    demo.forEach(([cat, sp, g], i) => {
      const pl = EG.Game.plant({ cat, intensity: 7, v: 0, a: 0, inputType: 'color', note: '', seedStr: 'm' + i }, i);
      if (pl) { pl.species = sp; pl.growth = g; pl.bloomedAt = Date.now(); }
    });
    out.W = EG.Garden.W; out.H = EG.Garden.H;
    out.cellPx = +(EG.Garden.plotRects[0].w + 6).toFixed(1);
    out.plotScale = +EG.Garden.plotRects[0].scale.toFixed(2);
    out.gardenH = +(EG.Garden.plotRects[3].y + EG.Garden.plotRects[3].h).toFixed(0);
    out.stonePathX = [180, +(EG.Garden.W - 180).toFixed(0)];
    out.fenceRanges = [[-14, 176], [+(EG.Garden.W - 176).toFixed(0), +(EG.Garden.W + 14).toFixed(0)]];
    out.decorOverlap = (EG.Garden.W - 180) < 220;
    const tb = document.getElementById('toolbar').getBoundingClientRect();
    out.toolbar = { x: Math.round(tb.x), right: Math.round(innerWidth - tb.right), bottomGap: Math.round(innerHeight - tb.bottom), w: Math.round(tb.width) };
    out.cornerBtns = [...document.querySelectorAll('.corner-btn')].map(b => { const r = b.getBoundingClientRect(); return { id: b.id, x: Math.round(r.x), y: Math.round(r.y), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) }; });
    out.hudOverlapTopbarVsCorner = Math.round(document.getElementById('topbar').getBoundingClientRect().bottom) > 12 + 50 && Math.round(innerWidth) < 420;
    out.topbar = (() => { const r = document.getElementById('topbar').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; })();
    out.visualViewport = window.visualViewport ? { w: window.visualViewport.width, h: window.visualViewport.height } : null;
    return JSON.stringify(out);
  } catch (e) { out.fatal = String(e && e.stack || e); return JSON.stringify(out); }
})()
