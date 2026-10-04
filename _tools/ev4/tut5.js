(function () {
  const __T = (() => { try { return JSON.parse(sessionStorage.getItem('__T') || '[]'); } catch (e) { return []; } })();
  const __push = o => { __T.push(o); try { sessionStorage.setItem('__T', JSON.stringify(__T)); } catch (e) {} };
  const out = { stage: 'after-reload' };
  // 刷新页面后: 存档里的 tutorialDone 应该还在(Meta.load 已读过 localStorage)
  out.flagAfterReload = JSON.parse(JSON.stringify(Meta.data.flags));
  out.state = G.state;
  // 老玩家再次"进入深渊" → 不应自动弹引导
  document.getElementById('btn-new').click();
  out.tutorialActiveAfterReloadedEnter = !!(G.tutorial && G.tutorial.active);
  out.rootHiddenAfterReloadedEnter = document.getElementById('tut-root').classList.contains('hidden');
  out.floor = G.run.floor;
  // 重看入口 1: 主菜单按钮(真实点击)
  G.state = 'menu'; UI.showScreen('main'); UI.refreshMenu();
  document.getElementById('btn-tutorial').click();
  out.reviewFromMenu = { active: Tutorial.active, mode: Tutorial.mode, rootVisible: !document.getElementById('tut-root').classList.contains('hidden') };
  // 重看入口 2: 暂停菜单按钮(真实点击)
  Tutorial.stop();
  G.state = 'play'; G.paused = true; UI.showScreen('pause');
  document.getElementById('btn-pause-tut').click();
  out.replayFromPause = { active: Tutorial.active, mode: Tutorial.mode, step: Tutorial.i };
  // 停在"下一层入口"这一步, 方便截图
  Tutorial.i = 6; Tutorial.render(); Tutorial.place();
  out.leavingAtStep = { i: Tutorial.i, title: document.getElementById('tut-title').textContent };
  __push(out);
  return 'T5 ' + JSON.stringify(out);
})()
