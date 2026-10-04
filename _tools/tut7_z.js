(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k, bubbles: true }));
  const R = { phase: 'z-order check' };
  R.z = { tut: getComputedStyle($('tutorial-layer')).zIndex, codex: getComputedStyle($('screen-codex')).zIndex, pauseModal: getComputedStyle($('modal-pause')).zIndex, gameLayer: getComputedStyle($('game-layer')).zIndex };
  R.tutActive = MMTutorial.active;
  const card = () => { const b = $('tut-card').getBoundingClientRect(); return { x: b.left + 20, y: b.top + 20 }; };
  const at = (p) => { const e = document.elementFromPoint(p.x, p.y); return e ? (e.id || e.className || e.tagName) : null; };
  R.hitInGame = at(card());
  // 暂停 → 弹窗(z50)应盖住引导
  key('Escape', true); key('Escape', false); await sleep(400);
  R.hitOnPause = at(card());
  // 暂停 → 图鉴屏(z12)应盖住引导
  $('pause-codex').click(); await sleep(450);
  R.codexShown = shown($('screen-codex'));
  R.hitOnCodex = at(card());
  R.tutStillActive = MMTutorial.active;
  // 返回 → 回到游戏，引导仍在
  document.querySelector('#screen-codex [data-back]').click(); await sleep(450);
  R.backToGame = { gameShown: shown($('game-layer')), tutActive: MMTutorial.active, step: MMTutorial.step, hit: at(card()) };
  $('tut-skip').click(); await sleep(200);
  R.done = MMTutorial.active;
  return JSON.stringify(R);
})()
