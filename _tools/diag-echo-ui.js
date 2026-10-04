window.__ui = { log: [] };
var acts = [
  function () { var el = document.querySelector('#scr-boot'); window.__ui.log.push('boot:' + !!el); el && el.dispatchEvent(new MouseEvent('click', { bubbles: true })); },
  function () { var b = document.querySelector('[data-act="intro-skip"]'); window.__ui.log.push('introSkip:' + !!b); b && b.click(); },
  function () { var b = document.querySelector('[data-act="chapters"]'); window.__ui.log.push('chapters:' + !!b); b && b.click(); },
  function () { var b = document.querySelector('.ch-card'); window.__ui.log.push('chCard:' + !!b + ' n=' + document.querySelectorAll('.ch-card').length); b && b.click(); },
  function () { var b = document.querySelector('.lv-node'); window.__ui.log.push('lvNode:' + !!b + ' n=' + document.querySelectorAll('.lv-node').length); b && b.click(); }
];
acts.forEach(function (f, i) { setTimeout(f, 200 + i * 700); });

// 等所有点击生效后（含关卡加载）再返回，probe 用 awaitPromise 等待
new Promise(function (res) {
  setTimeout(function () {
    res(JSON.stringify({
      ui: window.__ui,
      screen: EchoApp.curScreen,
      game: !!EchoApp.game,
      state: EchoApp.game && EchoApp.game.state,
      time: EchoApp.game && +EchoApp.game.time.toFixed(2),
      motes: EchoApp.game && EchoApp.game._motes ? EchoApp.game._motes.length : 0
    }));
  }, 6000);
})
