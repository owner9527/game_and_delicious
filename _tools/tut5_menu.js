(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const R = { phase: 'boot-menu replay path' };
  R.menuShownAtBoot = $('menu').classList.contains('show');
  $('btnGuide').click(); await sleep(350);
  R.guideModal = { shown: $('modal').classList.contains('show'), hasTut: !!$('mTut'), tabs: document.querySelectorAll('#modalBody .tab').length };
  $('mTut').click(); await sleep(600);
  R.afterTutFromMenu = {
    modalHidden: !$('modal').classList.contains('show'),
    menuHidden: !$('menu').classList.contains('show'),
    phase: G.phase,
    guideActive: MMGuide.active,
    step: MMGuide.step,
    stepText: $('gStep').textContent.trim(),
    layerVisible: shown($('guideLayer')),
    layerZ: getComputedStyle($('guideLayer')).zIndex,
  };
  $('gSkip').click(); await sleep(250);
  R.skip = { active: MMGuide.active, ls: localStorage.getItem(MMGuide.KEY) };
  return JSON.stringify(R);
})()
