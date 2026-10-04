(function () {
  const __T = (() => { try { return JSON.parse(sessionStorage.getItem('__T') || '[]'); } catch (e) { return []; } })();
  const __push = o => { __T.push(o); try { sessionStorage.setItem('__T', JSON.stringify(__T)); } catch (e) {} };
  const out = { stage: 'second-run-no-auto-pop' };
  // 第一次进入深渊已经弹过引导 → 第二次 newRun 不应再自动弹
  G.newRun(null);
  out.secondRunFloor = G.run.floor;
  out.secondRunTutorialActive = !!(G.tutorial && G.tutorial.active);
  out.secondRunRootHidden = document.getElementById('tut-root').classList.contains('hidden');
  out.flagAtSecondRun = JSON.parse(JSON.stringify(Meta.data.flags));
  // 老玩家的"继续冒险"也绝不该弹
  G.saveRun();
  G.continueRun();
  out.continueRunTutorialActive = !!(G.tutorial && G.tutorial.active);
  __push(out);
  return 'T3 ' + JSON.stringify(out);
})()
