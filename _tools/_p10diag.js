(() => {
  const out = {};
  const say = (k, v) => { out[k] = v; };
  try {
    if (!EG.G) EG.Game.newGame('诊断花园');
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    EG.UI.modalStack = [];

    /* 1) 数据规模 */
    say('scale', {
      dictEntries: EG.DICT.length, uniqueWords: [...new Set(EG.DICT.map(d => d.w))].length,
      emotions: EG.EMO_LIST.length, plants: EG.PLANTS.length, variants: EG.VARIANTS.length,
      pots: EG.POTS.length, items: EG.ITEMS.length, decor: EG.DECORS.length,
      events: EG.EVENTS.length, ach: EG.ACHIEVEMENTS.length, journey: EG.JOURNEY.length,
      music: EG.MUSIC_LIB.length, forms: EG.PLANTS.length * 3,
    });

    /* 2) 颜色路径：色相到底影不影响结果？ */
    const openColor = (h, s, l) => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
      EG.UI.modalStack = [];
      EG.UI.openWizard();
      EG.UI.W.tab = 'color'; EG.UI.W.parsed = null;
      EG.UI.W.color = { h, s, l };
      EG.UI.renderWizard();
    };
    const chip = txt => [...document.querySelectorAll('#color-words button')].find(b => b.textContent.includes(txt));
    openColor(8, 95, 50); /* 纯红 → 数据表里应是 anger */
    say('colorChips', [...document.querySelectorAll('#color-words button')].map(b => b.textContent.trim()));
    say('hasDirectConfirmBtn', [...document.querySelectorAll('#wiz button, #wiz .btn')].map(b => b.textContent.trim()));
    const hueOnly = EG.parseColor(8, 95, 50);
    say('parseColorRedHue', { cat: hueOnly.cat, intensity: hueOnly.intensity });
    chip('平静如水').click();
    say('redHuePickCalm', { cat: EG.UI.W.parsed.cat, intensity: EG.UI.W.parsed.intensity, v: +EG.UI.W.parsed.v.toFixed(2) });
    openColor(120, 90, 50); /* 纯绿 → 数据表里应是 calm */
    chip('烦躁上火').click();
    say('greenHuePickAnger', { cat: EG.UI.W.parsed.cat, intensity: EG.UI.W.parsed.intensity, v: +EG.UI.W.parsed.v.toFixed(2) });
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    EG.UI.modalStack = [];

    /* 3) 等级曲线 */
    const need = l => EG.Game.expNeed(l);
    const cum = n => { let s = 0; for (let l = 1; l < n; l++) s += need(l); return s; };
    say('expCurve', { toLv6: cum(6), toLv20: cum(20), toLv30: cum(30), toLv50: cum(50) });
    say('expPerPlantCycle', 10 + 4 + 20);

    /* 4) 生态评分上限（64 格 = Lv30 上限） */
    const realPlants = EG.G.plants, realPlots = EG.G.plots, realEco = { ...EG.G.eco };
    const mkPlants = list => {
      const o = {}; let i = 0;
      for (const [cat, n, it] of list) {
        const sp = EG.PLANTS.find(p => p.emo === cat);
        for (let k = 0; k < n; k++, i++) o['t' + i] = { id: 't' + i, species: sp.id, seed: 'diag' + i, variant: 0, emo: { cat, intensity: it, v: 0, a: 0 }, pot: 'pot_terra', plot: i, growth: 100, wilt: 0, withered: false, planted: Date.now(), bloomeAt: 0, lastWater: Date.now() };
      }
      return o;
    };
    const ecoOf = list => {
      EG.G.eco = { sun: 50, hum: 50, fer: 50, har: 50 };
      EG.G.plants = mkPlants(list);
      EG.Game.ecoDrift(1e6);
      return { eco: { sun: +EG.G.eco.sun.toFixed(1), hum: +EG.G.eco.hum.toFixed(1), fer: +EG.G.eco.fer.toFixed(1), har: +EG.G.eco.har.toFixed(1) }, score: EG.ecoScore(EG.G) };
    };
    say('eco64allCalm10', ecoOf([['calm', 64, 10]]));
    say('eco64allCalm1', ecoOf([['calm', 64, 1]]));
    say('eco64allJoy10', ecoOf([['joy', 64, 10]]));
    say('eco64mixed', ecoOf([['calm', 16, 10], ['attach', 16, 10], ['sad', 16, 10], ['joy', 16, 10]]));
    say('eco24mixed', ecoOf([['calm', 6, 10], ['attach', 6, 10], ['sad', 6, 10], ['joy', 6, 10]]));

    /* 5) 渲染成本：满园 64 株 vs 空园 */
    EG.G.eco = { sun: 50, hum: 50, fer: 50, har: 50 };
    EG.G.plots = realPlots.map((p, i) => ({ unlocked: i < 64, plantId: null }));
    const measure = n => { const t = performance.now(); for (let i = 0; i < n; i++) EG.Garden.render(performance.now() + i * 16); return +((performance.now() - t) / n).toFixed(2); };
    EG.G.plants = {};
    EG.Garden.layout();
    say('renderMsEmpty', measure(30));
    EG.G.plots = realPlots.map((p, i) => ({ unlocked: i < 64, plantId: 't' + i }));
    EG.G.plants = mkPlants([['joy', 10, 6], ['calm', 10, 6], ['sad', 10, 7], ['anger', 10, 8], ['anxiety', 12, 6], ['attach', 12, 5]]);
    EG.Garden.layout();
    say('renderMs64plants', measure(20));
    EG.G.settings.lowFx = true;
    say('renderMs64_lowFx', measure(20));
    EG.G.settings.lowFx = false;

    /* 6) 满园 64 株绘制一次的全屏粒子/渐变是否在每帧重建 —— 记录帧间隔 */
    EG.G.plants = realPlants; EG.G.plots = realPlots; EG.G.eco = realEco;
    EG.Garden.layout();

    /* 7) 分享卡是否把玩家写下的原句画进 PNG */
    const drawn = [];
    const origFill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (typeof t === 'string') drawn.push(t); return origFill.call(this, t, ...a); };
    const fp = EG.G.plots.findIndex(p => p.unlocked && !p.plantId);
    const pl = EG.Game.plant({ cat: 'sad', intensity: 7, v: -0.75, a: -0.45, inputType: 'text', note: '我今天特别难过想一个人待着', seedStr: 'diagshare' }, fp);
    EG.UI.openShare(pl.id);
    CanvasRenderingContext2D.prototype.fillText = origFill;
    say('shareCardDrawnTexts', drawn);
    say('shareCardHasRawNote', drawn.some(t => t.includes('难过')));
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    EG.UI.modalStack = [];

    /* 8) 图鉴里存的种子 vs 玩家实际种子 */
    say('dexEntry', JSON.parse(JSON.stringify(EG.G.dex[pl.species] || {})));

    /* 9) 曲库播放是否确定性 + 实际音符数 */
    const freqs = [];
    const origTone = EG.Audio.tone;
    EG.Audio.tone = (f) => { freqs.push(Math.round(f)); return { o: { stop() {} }, g: { gain: { setTargetAtTime() {} } } }; };
    const ctxOk = !!EG.Audio.ensure();
    EG.MusicPlayer.play(EG.MUSIC_LIB[0]); const a1 = freqs.slice(); freqs.length = 0;
    EG.MusicPlayer.play(EG.MUSIC_LIB[0]); const a2 = freqs.slice();
    EG.Audio.tone = origTone; EG.MusicPlayer.stop();
    say('audioCtx', ctxOk);
    say('trackNotes', a1.length);
    say('trackDeterministic', JSON.stringify(a1) === JSON.stringify(a2));

    /* 10) 萎靡是否在 3 天宽限内也被跳过；凋谢是否可被照料阻止 */
    const fr2 = EG.G.plots.findIndex(p => p.unlocked && !p.plantId);
    const pw = EG.Game.plant({ cat: 'joy', intensity: 6, v: 0.85, a: 0.65, inputType: 'color', note: 'x', seedStr: 'diagwither' }, fr2);
    pw.growth = 100; pw.bloomedAt = Date.now() - 80 * 3.6e6; pw.lastWater = Date.now();
    EG.Game.checkWither(pw);
    say('witherDespiteCare', !!pw.withered);
    EG.G.settings.speed = 360;
    say('witherRealHoursAt360', +(72 / 360).toFixed(2));
    EG.G.settings.speed = 1;

    /* 11) 每日任务重复计数 */
    const before = EG.G.tasks.progress.record || 0;
    const fr3 = EG.G.plots.findIndex(p => p.unlocked && !p.plantId);
    EG.Game.plant({ cat: 'calm', intensity: 5, v: 0.55, a: -0.75, inputType: 'color', note: '', seedStr: 'diagdup' }, fr3);
    say('taskRecordDeltaFor1Planting', (EG.G.tasks.progress.record || 0) - before);

    /* 12) 键盘/可访问性钩子 */
    say('a11y', {
      escHandler: /['"]keydown['"][\s\S]{0,120}Escape/.test(document.documentElement.innerHTML),
      tabIndexInDOM: document.querySelectorAll('[tabindex]').length,
      ariaInDOM: document.querySelectorAll('[aria-label],[role]').length,
      clickableDivs: document.querySelectorAll('.track,.dex-card,.cal-day,.shop-card').length,
      focusRulesInCSS: [...document.styleSheets].reduce((n, s) => { try { return n + [...s.cssRules].filter(r => (r.selectorText || '').includes(':focus')).length; } catch (e) { return n; } }, 0),
      bodyHasLowFxClass: document.body.classList.contains('lowfx') || document.body.classList.contains('low-fx'),
      viewportMeta: document.querySelector('meta[name=viewport]').content,
    });

    /* 13) 最终留一个好看的满园状态用于截图 */
    EG.G.plants = {}; EG.G.plots.forEach(p => p.plantId = null);
    const demo = [['joy', 'joy_daisy', 100, 0], ['calm', 'calm_mint', 100, 0], ['sad', 'sad_iris', 100, 1], ['anger', 'anger_canna', 100, 0], ['anxiety', 'anx_vine', 100, 2], ['attach', 'att_rose', 100, 0], ['joy', 'joy_tulip', 62, 0], ['calm', 'calm_bell', 35, 0]];
    demo.forEach(([cat, sp, g, v], i) => {
      const pl = EG.Game.plant({ cat, intensity: 6 + (i % 4), v: 0, a: 0, inputType: 'color', note: '第' + (i + 1) + '株', seedStr: 'demo' + i }, i);
      if (pl) { pl.species = sp; pl.growth = g; pl.variant = v; pl.bloomedAt = Date.now(); }
    });
    say('demoPlanted', Object.keys(EG.G.plants).length);
  } catch (e) {
    say('fatal', String(e && e.stack || e));
  }
  return JSON.stringify(out);
})()
