(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), bubbles: true }));
  const R = { phase: 'B: after-real-reload(?debug=1)' };

  // ---- 1) 刷新后仍带“已看过”标记 → 再进关卡不再自动弹（关键反向用例） ----
  R.lsOnBoot = localStorage.getItem(MMTutorial.KEY_CORE);
  R.seenCoreOnBoot = MMTutorial.seenCore();
  R.tutActiveOnBoot = MMTutorial.active;
  $('btn-new').click(); await sleep(800);
  R.reenterWithMark = { active: MMTutorial.active, layerShown: shown($('tutorial-layer')), state: MMGame.state, level: MMGame.levelIdx };

  // ---- 2) 清掉 localStorage 后再进 → 引导重新出现（关键正向用例） ----
  localStorage.removeItem(MMTutorial.KEY_CORE);
  R.seenAfterClear = MMTutorial.seenCore();
  MMUI.exitToChapters(); await sleep(400);
  document.querySelectorAll('#level-grid .level-cell')[0].click(); await sleep(800);
  R.afterClear = { active: MMTutorial.active, step: MMTutorial.step, stepText: MMTutorial.stepText, title: MMTutorial.title };

  // ---- 3) 走完核心引导（8 步）→ 标记写入 ----
  let g = 0;
  while (MMTutorial.active && g++ < 20) { $('tut-next').click(); await sleep(220); }
  R.walkCore = { clicks: g, finished: !MMTutorial.active, ls: localStorage.getItem(MMTutorial.KEY_CORE), titleAtEnd: $('tut-title').textContent };

  // ---- 4) 进入首个“棱镜光束”关卡（第二章第 4 关）→ 机关引导自动出现 ----
  MMUI.exitToChapters(); await sleep(400);
  document.querySelector('#screen-levels [data-back]').click(); await sleep(300);
  $('btn-chapters').click(); await sleep(400);
  R.chapterCards = document.querySelectorAll('#chapter-list .chapter-card').length;
  document.querySelectorAll('#chapter-list .chapter-card')[1].click(); await sleep(400);
  R.levelCells = document.querySelectorAll('#level-grid .level-cell').length;
  document.querySelectorAll('#level-grid .level-cell')[3].click(); await sleep(900);
  R.beam = {
    levelIdx: MMGame.levelIdx,
    active: MMTutorial.active,
    which: MMTutorial.which,
    step: MMTutorial.step,
    total: MMTutorial.total,
    title: MMTutorial.title,
    spotShown: shown($('tut-spot')),
    keys: $('tut-keys').querySelectorAll('kbd').length,
  };
  R.hudMode = $('hud-mode-chip').textContent;
  R.hudLevel = $('hud-level-name').textContent;

  // 聚光灯位置是否真的套在发射器/折光镜上（用同一套相机投影反算）
  const spotRect = () => { const b = $('tut-spot').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const snap = MMGame.tutSnapshot();
  const proj = (c) => ({ x: (c.x - snap.cam.x) * snap.cam.zoom + snap.vw / 2, y: (c.y - snap.cam.y) * snap.cam.zoom + snap.vh / 2 });
  const box = (arr, p) => {
    const r = arr.map((c) => { const q = proj(c); return { x: q.x - p * snap.cam.zoom, y: q.y - p * snap.cam.zoom, w: 2 * p * snap.cam.zoom, h: 2 * p * snap.cam.zoom }; });
    const x0 = Math.min.apply(null, r.map((v) => v.x)), x1 = Math.max.apply(null, r.map((v) => v.x + v.w));
    const y0 = Math.min.apply(null, r.map((v) => v.y)), y1 = Math.max.apply(null, r.map((v) => v.y + v.h));
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  };
  R.spotStep1 = spotRect();
  R.expectEmit = box(snap.emitters, 26);
  R.snapDevices = { emitters: snap.emitters.length, mirrors: snap.mirrors.length, switchMirrors: snap.switchMirrors.length, pads: snap.pads.length, receivers: snap.receivers.length };

  $('tut-next').click(); await sleep(400);
  R.beamStep2 = { step: MMTutorial.step, title: MMTutorial.title, spotShown: shown($('tut-spot')), spot: spotRect() };
  R.expectMirror = box((snap.mirrors || []).concat(snap.switchMirrors || []), 26);
  $('tut-next').click(); await sleep(400);
  R.beamStep3 = { step: MMTutorial.step, title: MMTutorial.title, spotShown: shown($('tut-spot')), spot: spotRect(), act: MMTutorial.actText };
  R.expectRecv = box(snap.receivers, 26);

  // ---- 5) 机关引导可跳过 + 玩法仍正常 ----
  $('tut-skip').click(); await sleep(300);
  R.beamSkip = { active: MMTutorial.active, lsBeam: localStorage.getItem(MMTutorial.KEY_BEAM), seenBeam: MMTutorial.seenBeam() };
  const x0 = MMGame.debugChars()[0].x;
  key('d', true); await sleep(700); key('d', false); await sleep(300);
  const x1 = MMGame.debugChars()[0].x;
  R.playAfter = { moved: Math.abs(x1 - x0) > 20, from: x0, to: x1, state: MMGame.state, steps: MMGame.debugInfo().steps };
  return JSON.stringify(R);
})()
