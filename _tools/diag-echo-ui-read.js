JSON.stringify({
  ui: window.__ui,
  game: !!EchoApp.game,
  state: EchoApp.game && EchoApp.game.state,
  time: EchoApp.game && +EchoApp.game.time.toFixed(2),
  motes: EchoApp.game && EchoApp.game._motes ? EchoApp.game._motes.length : 0
})
