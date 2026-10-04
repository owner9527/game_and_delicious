JSON.stringify({
  diag: window.__diag,
  game: !!EchoApp.game,
  state: EchoApp.game && EchoApp.game.state,
  time: EchoApp.game && +EchoApp.game.time.toFixed(2),
  hasPost: !!(EchoApp.game && EchoApp.game.renderPost),
  motes: EchoApp.game && EchoApp.game._motes ? EchoApp.game._motes.length : 0,
  screen: EchoApp.curScreen
})
