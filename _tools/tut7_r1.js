(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const R = { phase: 'R1: before-reload' };

  // 强制走一遍引导并跳过 → 写入“已看过”标记，然后真实刷新
  MMTutorial.start('core', true); await sleep(500);
  R.started = { active: MMTutorial.active, step: MMTutorial.step, which: MMTutorial.which, shown: shown($('tutorial-layer')) };
  $('tut-skip').click(); await sleep(300);
  R.afterSkip = { active: MMTutorial.active, lsKey: MMTutorial.KEY_CORE, lsValue: localStorage.getItem(MMTutorial.KEY_CORE), seen: MMTutorial.seenCore(), layerShown: shown($('tutorial-layer')) };
  R.lsBeamBefore = localStorage.getItem(MMTutorial.KEY_BEAM);
  R.href = location.href;
  setTimeout(() => location.replace(location.pathname + '?debug=1'), 150);
  return JSON.stringify(R);
})()
