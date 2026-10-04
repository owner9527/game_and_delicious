(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const R = { phase: 'F: file:// protocol', href: location.href };
  R.lsAvailable = (() => { try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); return true; } catch (e) { return 'THROW:' + e.name; } })();
  R.lsKeyReadable = localStorage.getItem(MMGuide.KEY);
  startGame(); await sleep(600);
  R.guideVisible = shown($('guideLayer'));
  R.step = MMGuide.step; R.stepText = $('gStep').textContent.trim();
  $('gNext').click(); await sleep(250);
  R.advancedTo = MMGuide.step;
  document.querySelector('#shop .shopCard:not(.dis)').click(); await sleep(600);
  R.bought = G.bench.some(u => u);
  R.stepAfterBuy = MMGuide.step;
  $('gSkip').click(); await sleep(250);
  R.afterSkip = { active: MMGuide.active, ls: localStorage.getItem(MMGuide.KEY) };
  startGame(); await sleep(500);
  R.reenterWithMark = shown($('guideLayer'));
  document.querySelector('#shop .shopCard:not(.dis)').click(); await sleep(200);
  autoPlace(); await sleep(250);
  R.bench = G.bench.filter(Boolean).length;
  R.boardCount = Object.keys(G.board).length;
  R.btnFightDisabled = $('btnFight').disabled;
  $('btnFight').click(); await sleep(800);
  R.phaseAfterFight = G.phase;
  R.battleUnits = G.battle ? G.battle.units.length : 0;
  return JSON.stringify(R);
})()
