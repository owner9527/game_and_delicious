(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const rc = id => $(id).getBoundingClientRect();
  const inter = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  const R = { phase: 'UI-smoke 05' };

  // ---- 1) 主菜单「🎓 新手引导 · 重看教程」入口 ----
  R.menuBtnRect = (() => { const b = $('btnTut').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })();
  R.startBtnRect = (() => { const b = $('btnStart').getBoundingClientRect(); return { cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) }; })();
  $('btnTut').click(); await sleep(700);
  R.menuEntry = { guide: MMGuide.active, step: MMGuide.step, phase: G.phase, menuHidden: !$('menu').classList.contains('show') };

  // ---- 2) 第 2 步（商店）的卡片停靠：不遮挡商店/备战席/开战按钮 ----
  $('gNext').click(); await sleep(450);
  const card = rc('gCard'), spot = rc('gSpot');
  R.step2 = {
    step: MMGuide.step, title: $('gTitle').textContent.trim(),
    spotOverShop: inter(spot, rc('shop')),
    spotOverBench: inter(spot, rc('bench')),
    cardOverShop: inter(card, rc('shop')),
    cardOverBench: inter(card, rc('bench')),
    cardOverFight: inter(card, rc('btnFight')),
    cardOverCanvasBoardRows: inter(card, { left: rc('cv').left, right: rc('cv').right, top: rc('cv').top + rc('cv').height / 2, bottom: rc('cv').bottom }),
    card: { x: Math.round(card.left), y: Math.round(card.top), w: Math.round(card.width), h: Math.round(card.height) },
  };
  R.pointerEvents = { layer: getComputedStyle($('guideLayer')).pointerEvents, card: getComputedStyle($('gCard')).pointerEvents, btn: getComputedStyle($('gNext')).pointerEvents };

  // ---- 3) 穿过引导点商店：仍能买到英雄，且自动推进到下一步 ----
  const g0 = G.gold;
  document.querySelector('#shop .shopCard:not(.dis)').click();
  await sleep(700);
  R.buyThrough = { gold: g0 + ' -> ' + G.gold, bought: G.bench.some(u => u), step: MMGuide.step, title: $('gTitle').textContent.trim() };

  // ---- 4) 顶部「❓ 玩法」弹窗里的“重看新手引导” ----
  $('btnHelp').click(); await sleep(350);
  R.helpModal = { shown: $('modal').classList.contains('show'), hasTutBtn: !!$('mTut') };
  $('mTut').click(); await sleep(450);
  R.replayFromModal = { modalHidden: !$('modal').classList.contains('show'), guide: MMGuide.active, step: MMGuide.step, title: $('gTitle').textContent.trim() };

  // ---- 5) 其它界面未被影响 ----
  $('btnBook').click(); await sleep(350);
  R.book = { shown: $('modal').classList.contains('show'), cells: document.querySelectorAll('.heroGrid .heroCell').length, tutGuard: $('mTut') ? 'no-tut-in-book' : 'ok' };
  $('mClose').click(); await sleep(250);
  $('btnMute').click(); await sleep(200);
  R.mute = { txt: $('btnMute').textContent.trim(), savedMuted: JSON.parse(localStorage.getItem('tactics_auto_chess_v1')).muted };
  $('btnMute').click(); await sleep(200);
  $('btnRefresh').click(); await sleep(250);
  R.refreshShop = (() => { const s = JSON.parse(localStorage.getItem('tactics_auto_chess_v1')); return { bestStage: s.bestStage, bestStreak: s.bestStreak, coll: Object.keys(s.collection || {}).length, muted: s.muted }; })();

  // ---- 6) 跳过 ----
  $('gSkip').click(); await sleep(250);
  R.skip = { active: MMGuide.active, layerShown: shown($('guideLayer')), ls: localStorage.getItem(MMGuide.KEY) };
  return JSON.stringify(R);
})()
