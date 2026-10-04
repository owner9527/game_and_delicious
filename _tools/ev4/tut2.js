(function () {
  const __T = (() => { try { return JSON.parse(sessionStorage.getItem('__T') || '[]'); } catch (e) { return []; } })();
  const __push = o => { __T.push(o); try { sessionStorage.setItem('__T', JSON.stringify(__T)); } catch (e) {} };
  const el = id => document.getElementById(id);
  const out = { stage: 'step-through-and-skip' };
  // 1) 用真实键盘事件(空格)推进"欢迎"步骤
  const before = Tutorial.i;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  out.spaceAdvanced = Tutorial.i === before + 1;
  out.stepAfterSpace = Tutorial.i;
  out.titleAfterSpace = el('tut-title').textContent;
  out.holdAfterSpace = !!(G.tutorial && G.tutorial.hold);
  // 非阻塞步骤: 世界应该恢复运行(能用 DOM 覆盖层读到 check 状态)
  const moved0 = G.stat.moved;
  G.input.keys = { KeyD: true };
  for (let i = 0; i < 60; i++) G.tick(1 / 60);
  G.input.keys = {};
  out.worldRunsOnNonHoldStep = G.stat.moved > moved0;
  out.movedOnNonHoldStep = Math.round(G.stat.moved - moved0);
  // 2) 逐步骤 next(), 记录每步标题(证明"分步")
  out.stepTitles = [];
  let guard = 0;
  while (Tutorial.active && guard++ < 20) {
    out.stepTitles.push(el('tut-title').textContent);
    Tutorial.next();
  }
  out.finishedAllSteps = !Tutorial.active;
  out.rootHiddenAfterFinish = el('tut-root').classList.contains('hidden');
  out.flagAfterFinish = JSON.parse(JSON.stringify(Meta.data.flags));
  out.localStorageRaw = (localStorage.getItem('shenyuan_meta_v1') || '').slice(0, 200);
  // 3) 重看 + 用真实点击"跳过引导"按钮
  Tutorial.start('play');
  out.restartedActive = Tutorial.active;
  out.restartedStep = Tutorial.i;
  el('tut-skip').click();
  out.skippedBySkipButton = !Tutorial.active;
  out.rootHiddenAfterSkip = el('tut-root').classList.contains('hidden');
  // 4) Esc 也应该能跳过
  Tutorial.start('play');
  Tutorial.key('Escape');
  out.skippedByEscKey = !Tutorial.active;
  out.flagFinal = JSON.parse(JSON.stringify(Meta.data.flags));
  __push(out);
  return 'T2 ' + JSON.stringify(out);
})()
