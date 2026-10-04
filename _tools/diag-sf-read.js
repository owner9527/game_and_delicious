JSON.stringify({
  game: !!SF.ui.game,
  state: SF.app.state,
  cam: (function(){ var g=SF.ui.game; return g? {x:Math.round(g.cam.x),y:Math.round(g.cam.y),z:+g.cam.zoom.toFixed(2)} : null; })(),
  moved: window.__dragStart ? { dx: Math.round(SF.ui.game.cam.x - window.__dragStart.x), dy: Math.round(SF.ui.game.cam.y - window.__dragStart.y) } : null
})
