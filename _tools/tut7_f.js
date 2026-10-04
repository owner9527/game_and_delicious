(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), bubbles: true }));
  const R = { phase: 'F: file:// protocol', href: location.href };
  R.lsAvailable = (() => { try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); return true; } catch (e) { return 'THROW:' + e.name; } })();
  R.lsKeyBoot = localStorage.getItem(MMTutorial.KEY_CORE);

  // 从主菜单点「新手引导」入口 → 直接开局并强制播放引导
  localStorage.clear();
  $('btn-tutorial').click(); await sleep(900);
  R.menuEntry = { active: MMTutorial.active, step: MMTutorial.step, stepText: MMTutorial.stepText, state: MMGame.state, level: MMGame.levelIdx, shown: shown($('tutorial-layer')) };
  $('tut-next').click(); await sleep(350);
  R.advance = { step: MMTutorial.step, title: MMTutorial.title };
  key('d', true); await sleep(700); key('d', false); await sleep(300);
  R.moved = { step: MMTutorial.step, chars: MMGame.debugChars().map(c => Math.round(c.x)) };
  key(' ', true); await sleep(400); key(' ', false); await sleep(300);
  R.jumped = { step: MMTutorial.step, title: MMTutorial.title };
  $('tut-skip').click(); await sleep(300);
  R.afterSkip = { active: MMTutorial.active, ls: localStorage.getItem(MMTutorial.KEY_CORE) };

  // 带标记再进 → 不再自动弹
  MMUI.exitToChapters(); await sleep(400);
  document.querySelectorAll('#level-grid .level-cell')[0].click(); await sleep(700);
  R.reenterWithMark = { active: MMTutorial.active, state: MMGame.state };
  // 清掉再进 → 重新出现
  localStorage.clear();
  MMUI.exitToChapters(); await sleep(400);
  document.querySelectorAll('#level-grid .level-cell')[0].click(); await sleep(700);
  R.afterClear = { active: MMTutorial.active, step: MMTutorial.step, stepText: MMTutorial.stepText };
  return JSON.stringify(R);
})()
