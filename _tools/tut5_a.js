(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const R = { phase: 'A: fresh-entry' };

  // ---- 1) 首次进入（由 --click 548,465 触发）→ 引导应已出现 ----
  R.guideVisible_fresh = shown($('guideLayer'));
  R.cardVisible = shown($('gCard'));
  R.spotVisible = shown($('gSpot'));
  R.active = MMGuide.active;
  R.step = MMGuide.step;
  R.total = MMGuide.total;
  R.stepText = $('gStep').textContent.trim();
  R.title = $('gTitle').textContent.trim();
  R.seenBefore = MMGuide.seen();
  R.lsBefore = localStorage.getItem(MMGuide.KEY);
  R.layerPointerEvents = getComputedStyle($('guideLayer')).pointerEvents;   // none → 不阻塞

  // ---- 2) 能推进步骤（点“下一步”，步骤号递增） ----
  $('gNext').click(); await sleep(250);
  const s1 = MMGuide.step, t1 = $('gStep').textContent.trim();
  R.advance = { after1: s1, text1: t1, title1: $('gTitle').textContent.trim() };
  R.advanceOk = (s1 === 2 && t1 === '2 / 9');

  // ---- 3) 停在“第 1 步 · 商店”上买英雄 → 达成条件后自动推进（不阻塞玩法） ----
  R.stepAtShop = MMGuide.step;
  R.titleAtShop = $('gTitle').textContent.trim();
  const card = document.querySelector('#shop .shopCard:not(.dis)');
  R.goldBefore = G.gold;
  if (card) card.click();
  await sleep(300);
  R.bought = G.bench.some(u => u);
  R.goldAfter = G.gold;
  await sleep(700);
  R.stepAfterBuy = MMGuide.step;
  R.titleAfterBuy = $('gTitle').textContent.trim();
  R.autoAdvanceOnAction = (R.stepAfterBuy === 3);

  // ---- 4) 跳过 → 引导消失 + localStorage 记录“已看过” ----
  $('gSkip').click(); await sleep(300);
  R.afterSkip = {
    visible: shown($('guideLayer')),
    active: MMGuide.active,
    lsKey: MMGuide.KEY,
    lsValue: localStorage.getItem(MMGuide.KEY),
    seen: MMGuide.seen(),
    saveBlobOk: !!JSON.parse(localStorage.getItem('tactics_auto_chess_v1') || '{}'),
  };

  // ---- 5) 带标记再进 → 不再自动弹 ----
  startGame(); await sleep(500);
  R.reenterWithMark = { visible: shown($('guideLayer')), active: MMGuide.active };

  // ---- 6) 清掉 localStorage 再进 → 引导重新出现 ----
  localStorage.removeItem(MMGuide.KEY);
  R.seenAfterClear = MMGuide.seen();
  startGame(); await sleep(500);
  R.afterClear = { visible: shown($('guideLayer')), step: MMGuide.step, active: MMGuide.active };
  R.stepTextAfterClear = $('gStep').textContent.trim();

  // ---- 7) 把“已看过”标记写回并真实刷新（第 2 段 evalFile 继续验证） ----
  localStorage.setItem(MMGuide.KEY, '1');
  R.lsBeforeReload = localStorage.getItem(MMGuide.KEY);
  try { localStorage.setItem('__TUT5_A', JSON.stringify(R)); } catch (e) {}
  R.note = 'reload-now';
  setTimeout(() => location.reload(), 250);
  return JSON.stringify(R);
})()
