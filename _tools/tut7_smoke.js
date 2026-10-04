(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const R = { phase: 'smoke' };
  R.err = 'none';
  R.tutActive = MMTutorial.active;
  R.stepText = MMTutorial.stepText;
  R.title = MMTutorial.title;
  R.which = MMTutorial.which;
  R.total = MMTutorial.total;
  R.layerShown = shown($('tutorial-layer'));
  R.spotShown = shown($('tut-spot'));
  R.cardRect = (() => { const b = $('tut-card').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })();
  R.state = MMGame.state;
  R.info = MMGame.debugInfo();
  R.chars = MMGame.debugChars();
  await sleep(500);
  $('tut-next').click(); await sleep(400);
  R.afterNext = { step: MMTutorial.step, title: MMTutorial.title, spotShown: shown($('tut-spot')) };
  R.snap = (() => { const s = MMGame.tutSnapshot(); return { mode: s.mode, nchars: s.chars.length, nshards: s.shards.length, vw: s.vw, vh: s.vh, zoom: +s.cam.zoom.toFixed(2) }; })();
  // 真实按键：移动
  const press = (k, code, vk) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code, bubbles: true })); };
  press('d', 'KeyD'); await sleep(700);
  R.afterKeyMove = { step: MMTutorial.step, chars: MMGame.debugChars() };
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD', bubbles: true }));
  return JSON.stringify(R);
})()
