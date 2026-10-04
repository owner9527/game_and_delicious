(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const R = { phase: 'C: real-drag during guide' };

  function mk(t, x, y) {
    return new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: t === 'mouseup' ? 0 : 1 });
  }
  function drag(x1, y1, x2, y2) {
    const el = document.elementFromPoint(x1, y1);
    if (!el) return false;
    el.dispatchEvent(mk('mousedown', x1, y1));
    for (let i = 1; i <= 8; i++) document.dispatchEvent(mk('mousemove', x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8));
    document.dispatchEvent(mk('mouseup', x2, y2));
    return true;
  }

  localStorage.clear();
  startGame(); await sleep(500);
  R.guideStep = MMGuide.step;
  R.visible = shown($('guideLayer'));

  // 买一个英雄（步骤 1 的达成条件）
  document.querySelector('#shop .shopCard:not(.dis)').click();
  await sleep(400);
  R.stepAfterBuy = MMGuide.step;

  // 走到第 4 步（GD.i=3「拖到棋盘布阵」）
  let g = 0;
  while (MMGuide.active && MMGuide.step < 4 && g++ < 10) { $('gNext').click(); await sleep(200); }
  R.step = MMGuide.step;
  R.title = $('gTitle').textContent.trim();

  const cv = $('cv'), rect = cv.getBoundingClientRect();
  const cell = (c, r) => ({ x: rect.left + (16 + (c + 0.5) * 70) / 592 * rect.width, y: rect.top + (16 + (r + 0.5) * 70) / 452 * rect.height });
  const s0 = $('bench').querySelector('.slot[data-i="0"]').getBoundingClientRect();
  const from = { x: s0.left + s0.width / 2, y: s0.top + s0.height / 2 };

  // ① 真实拖拽：备战席 → 棋盘 (3,4)
  const a = cell(3, 4);
  R.dragFired = drag(from.x, from.y, a.x, a.y);
  await sleep(600);
  R.boardCount = Object.keys(G.board).length;
  R.boardKeys = Object.keys(G.board);
  R.benchLeft = G.bench.filter(Boolean).length;
  R.stepAfterPlace = MMGuide.step;
  R.autoAfterDrag = (R.stepAfterPlace === 5);
  R.cardAfterDrag = $('gTitle').textContent.trim();

  // ② 真实拖拽：调整站位 (3,4) → (5,4)
  const b = cell(5, 4);
  drag(a.x, a.y, b.x, b.y);
  await sleep(600);
  R.tutMoved = G.tutMoved === true;
  R.boardKeysAfterMove = Object.keys(G.board);
  R.stepAfterMove = MMGuide.step;
  R.autoAfterMove = (R.stepAfterMove === 6);
  R.titleNow = $('gTitle').textContent.trim();

  // ③ 拖到卖出区 → 金币增加（玩法未被引导阻塞）
  const goldBefore = G.gold;
  const sz = $('sellZone').getBoundingClientRect();
  const bp = $('bench').querySelector('.slot[data-i="0"]');
  if (bp && bp.classList.contains('filled')) { /* nothing */ }
  drag(b.x, b.y, sz.left + sz.width / 2, sz.top + sz.height / 2);
  await sleep(400);
  R.sell = { goldBefore, goldAfter: G.gold, boardCount: Object.keys(G.board).length };

  // ④ 关掉引导后回到正常流程可玩
  $('gSkip').click(); await sleep(200);
  R.afterSkip = { active: MMGuide.active, ls: localStorage.getItem(MMGuide.KEY) };
  return JSON.stringify(R);
})()
