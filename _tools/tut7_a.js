(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), bubbles: true }));
  const R = { phase: 'A: fresh-entry' };

  // ---- 1) 首次进入（--click 640,350 开始冒险）→ 分步引导自动出现 ----
  R.tutActive_fresh = MMTutorial.active;
  R.which = MMTutorial.which;
  R.stepText = MMTutorial.stepText;
  R.step = MMTutorial.step;
  R.total = MMTutorial.total;
  R.title = MMTutorial.title;
  R.layerShown = shown($('tutorial-layer'));
  R.dots = $('tut-dots').querySelectorAll('i').length;
  R.layerPointerEvents = getComputedStyle($('tutorial-layer')).pointerEvents;   // none = 不阻塞
  R.seenBefore = MMTutorial.seenCore();
  R.lsBefore = localStorage.getItem(MMTutorial.KEY_CORE);
  R.saveBlob = localStorage.getItem('mirror_maze_save_v1');

  // ---- 2) 能推进步骤 ----
  $('tut-next').click(); await sleep(400);
  R.advance = { step: MMTutorial.step, stepText: MMTutorial.stepText, title: MMTutorial.title, spotShown: shown($('tut-spot')), keys: $('tut-keys').querySelectorAll('kbd').length };
  R.advanceOk = (MMTutorial.step === 2 && R.advance.keys === 4);

  // ---- 3) 真按键“移动” → 步骤达成自动推进（引导期间玩法不被阻塞） ----
  const x0 = MMGame.debugChars().map(c => c.x);
  key('d', true); await sleep(800);
  const x1 = MMGame.debugChars().map(c => c.x);
  key('d', false); await sleep(400);
  R.move = { from: x0, to: x1, step: MMTutorial.step, title: MMTutorial.title };
  R.moveOk = (Math.abs(x1[0] - x0[0]) > 20 && MMTutorial.step === 3);

  // ---- 4) 真按键“跳跃” → 自动推进 ----
  key(' ', true); await sleep(500); key(' ', false); await sleep(400);
  R.jump = { step: MMTutorial.step, title: MMTutorial.title };

  // ---- 5) 玩法仍可用：撤销 / 提示（先跑一段再撤销，验证位置回退） ----
  key('d', true); await sleep(120); key(' ', true); await sleep(90); key(' ', false);
  await sleep(700); key('d', false); await sleep(350);
  const canUndoBefore = MMGame.canUndo;
  const xb = MMGame.debugChars()[0].x;
  key('z', true); key('z', false); await sleep(350);
  const xa = MMGame.debugChars()[0].x;
  R.undo = { canUndoBefore, canUndoAfter: MMGame.canUndo, xBefore: xb, xAfter: xa, undone: xa < xb - 20, step: MMTutorial.step };
  key('h', true); key('h', false); await sleep(400);
  R.hintBoxShown = shown($('hud-hint-box'));
  $('hud-restart').click(); await sleep(500);
  R.afterRestart = { steps: MMGame.debugInfo().steps, state: MMGame.state, tutActive: MMTutorial.active };

  // ---- 6) 跳过 → 引导消失 + localStorage 记录“已看过” ----
  $('tut-skip').click(); await sleep(300);
  R.afterSkip = {
    active: MMTutorial.active,
    layerShown: shown($('tutorial-layer')),
    lsKey: MMTutorial.KEY_CORE,
    lsValue: localStorage.getItem(MMTutorial.KEY_CORE),
    seen: MMTutorial.seenCore(),
  };

  // ---- 7) 带着标记再进关卡 → 不再自动弹 ----
  MMUI.exitToChapters(); await sleep(400);
  document.querySelectorAll('#level-grid .level-cell')[0].click(); await sleep(700);
  R.reenterWithMark = { active: MMTutorial.active, state: MMGame.state, level: MMGame.levelIdx };

  // ---- 8) 清掉 localStorage 再进 → 引导重新出现 ----
  localStorage.removeItem(MMTutorial.KEY_CORE);
  R.seenAfterClear = MMTutorial.seenCore();
  MMUI.exitToChapters(); await sleep(400);
  document.querySelectorAll('#level-grid .level-cell')[0].click(); await sleep(700);
  R.afterClear = { active: MMTutorial.active, step: MMTutorial.step, title: MMTutorial.title, stepText: MMTutorial.stepText };

  // ---- 9) 原有玩法：一路向右（跳过 ### 台阶），两个影子同时进镜像之门 → 通关 ----
  key('d', true);
  for (let i = 0; i < 14; i++) { key(' ', true); await sleep(90); key(' ', false); await sleep(360); }
  key('d', false);
  await sleep(800);
  R.win = {
    state: MMGame.state,
    resultShown: !$('modal-result').classList.contains('hidden'),
    resultTitle: $('result-title').textContent,
    stars: [1, 2, 3].filter(i => $('star-' + i).classList.contains('lit')).length,
    tutAborted: !MMTutorial.active,
    saveAfter: (() => { try { const s = JSON.parse(localStorage.getItem('mirror_maze_save_v1')); return { unlocked: s.unlocked, stars: Object.keys(s.stars) }; } catch (e) { return 'err'; } })(),
  };
  R.charsAtWin = MMGame.debugChars();
  R.shardsGot = MMGame.debugInfo().shards;
  return JSON.stringify(R);
})()
