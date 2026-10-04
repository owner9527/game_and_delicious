(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const R = { phase: 'B: after-real-reload' };
  try { R.phaseA = JSON.parse(localStorage.getItem('__TUT5_A') || 'null'); } catch (e) { R.phaseA = 'parse-fail'; }

  // ---- 1) 刷新后仍带“已看过”标记 → 进对局不再自动弹（关键反向用例） ----
  R.lsOnBoot = localStorage.getItem(MMGuide.KEY);
  R.seenOnBoot = MMGuide.seen();
  startGame(); await sleep(600);
  R.reenterWithMark = { visible: shown($('guideLayer')), active: MMGuide.active, step: MMGuide.step };
  R.legacyModalAutoOpened = $('modal').classList.contains('show');

  // ---- 2) 清掉 localStorage（真实刷新之后）→ 引导重新出现（关键正向用例） ----
  localStorage.clear(); await sleep(80);
  R.seenAfterClear = MMGuide.seen();
  startGame(); await sleep(600);
  R.afterClear = { visible: shown($('guideLayer')), step: MMGuide.step, text: $('gStep').textContent.trim(), active: MMGuide.active };

  // ---- 3) 手动走完全部 9 步 ----
  let guard = 0;
  while (MMGuide.active && guard++ < 30) { $('gNext').click(); await sleep(160); }
  R.walk = { clicks: guard, finished: !MMGuide.active, lsAfterFinish: localStorage.getItem(MMGuide.KEY), titleAtEnd: $('gTitle').textContent.trim() };

  // ---- 4) 正常玩法回归：刷新商店 → 买人 → 一键上阵 → 开战 → 战斗推进 ----
  const g0 = G.gold;
  $('btnRefresh').click(); await sleep(200);
  R.refreshShop = { goldBefore: g0, goldAfter: G.gold };
  const card = document.querySelector('#shop .shopCard:not(.dis)');
  if (card) card.click();
  await sleep(250);
  R.bench = G.bench.filter(Boolean).length;
  autoPlace(); await sleep(300);
  R.boardCount = Object.keys(G.board).length;
  R.phaseBefore = G.phase;
  $('btnFight').click(); await sleep(1000);
  R.phaseAfterFight = G.phase;
  R.battleUnits = G.battle ? G.battle.units.length : 0;
  R.battleTimeAdvancing = G.battle ? G.battle.time > 0 : false;
  R.traitPanelRows = document.querySelectorAll('#traitList .traitRow').length;
  R.enemyPreview = ($('enemyBody').textContent || '').trim().slice(0, 24);
  R.guideHiddenDuringBattle = !MMGuide.active;
  return JSON.stringify(R);
})()
