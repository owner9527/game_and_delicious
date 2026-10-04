JSON.stringify({
  floor: G.run.floor,
  interactTarget: G.interactTarget ? G.interactTarget.label : null,
  pickups: G.pickups.map(function (p) { return p.type; }),
  nextPickups: G.pickups.filter(function (p) { return p.type === 'next'; }).map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), portal: !!p.portal }; }),
  playerPos: { x: Math.round(G.player.x), y: Math.round(G.player.y) },
  state: G.state
})
