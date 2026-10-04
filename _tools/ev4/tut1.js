(function () {
  const __T = (() => { try { return JSON.parse(sessionStorage.getItem('__T') || '[]'); } catch (e) { return []; } })();
  const __push = o => { __T.push(o); try { sessionStorage.setItem('__T', JSON.stringify(__T)); } catch (e) {} };
  const el = id => document.getElementById(id);
  const t = {
    stage: 'auto-trigger',
    tutorialActive: !!(G.tutorial && G.tutorial.active),
    hold: !!(G.tutorial && G.tutorial.hold),
    mode: Tutorial.mode,
    stepIndex: Tutorial.i,
    stepsTotal: Tutorial.steps.length,
    rootVisible: !el('tut-root').classList.contains('hidden'),
    cardCenterClass: el('tut-card').classList.contains('center'),
    title: el('tut-title').textContent,
    nextLabel: el('tut-next').textContent,
    skipLabel: el('tut-skip').textContent,
    dotCount: el('tut-dots').children.length,
    flagBefore: JSON.parse(JSON.stringify(Meta.data.flags)),
  };
  // 阻塞式弹窗检查: alert/confirm/prompt 绝不能被用到
  t.alertWasCalled = !!window.__alertCalled;
  // hold 期间世界应该被冻结: 按住 D 也不会移动
  const x0 = G.player.x, moved0 = G.stat.moved;
  G.input.keys = { KeyD: true };
  const wasPaused = G.paused;
  // 直接调 tick 走 30 帧, 模拟真实主循环(hold 时应该跳过 update)
  for (let i = 0; i < 30; i++) G.tick(1 / 60);
  t.playerMovedDuringHold = Math.round(G.player.x - x0);
  t.movedStatDuringHold = G.stat.moved - moved0;
  t.updateFrozenByHold = (G.stat.moved - moved0) === 0;
  G.input.keys = {};
  t.paused = G.paused;
  __push(t);
  return 'T1 ' + JSON.stringify(t);
})()
