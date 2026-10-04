(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k, bubbles: true }));
  const R = { phase: 'UI-smoke 07' };

  // ---- 各功能屏往返（确认没有破坏原有界面） ----
  const screens = [['btn-chapters', 'screen-chapters'], ['btn-help', 'screen-help'], ['btn-codex', 'screen-codex'], ['btn-settings', 'screen-settings'], ['btn-about', 'screen-about']];
  R.screens = {};
  for (const [btn, scr] of screens) {
    $(btn).click(); await sleep(250);
    R.screens[scr] = { shown: shown($(scr)), back: !!document.querySelector('#' + scr + ' [data-back]') };
    document.querySelector('#' + scr + ' [data-back]').click(); await sleep(250);
  }
  R.titleShownAfter = shown($('screen-title'));
  R.settingTutBtn = !!$('set-tutorial-btn');
  R.menuTutBtnRect = (() => { const b = $('btn-tutorial').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })();

  // ---- 设置页里的“重新查看”入口 ----
  $('btn-settings').click(); await sleep(250);
  $('set-tutorial-btn').click(); await sleep(900);
  R.fromSettings = { active: MMTutorial.active, state: MMGame.state, level: MMGame.levelIdx, step: MMTutorial.step };
  $('tut-skip').click(); await sleep(200);

  // ---- 暂停菜单里的“重看新手引导” ----
  key('Escape', true); key('Escape', false); await sleep(400);
  R.pause = { shown: shown($('modal-pause')), hasTutBtn: !!$('pause-tutorial'), btns: $('modal-pause').querySelectorAll('.menu-btn').length };
  $('pause-tutorial').click(); await sleep(700);
  R.afterPauseTut = { pauseHidden: !shown($('modal-pause')), tutActive: MMTutorial.active, state: MMGame.state, step: MMTutorial.step, which: MMTutorial.which };
  // 引导期间仍可操作
  const x0 = MMGame.debugChars()[0].x;
  key('d', true); await sleep(600); key('d', false); await sleep(200);
  R.playWhileGuiding = { moved: Math.abs(MMGame.debugChars()[0].x - x0) > 20, state: MMGame.state };
  $('tut-skip').click(); await sleep(200);

  // ---- 暂停 → 继续 / 退出到章节 ----
  key('Escape', true); key('Escape', false); await sleep(300);
  $('pause-resume').click(); await sleep(300);
  R.resume = { pauseHidden: !shown($('modal-pause')), state: MMGame.state };
  key('Escape', true); key('Escape', false); await sleep(300);
  $('pause-exit').click(); await sleep(400);
  R.exit = { levelsShown: shown($('screen-levels')), state: MMGame.state, tutActive: MMTutorial.active };
  return JSON.stringify(R);
})()
