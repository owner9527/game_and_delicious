JSON.stringify({
  stage: 'real-input end-to-end',
  tutorialActive: !!(G.tutorial && G.tutorial.active),
  step: Tutorial.i,
  title: document.getElementById('tut-title').textContent,
  hold: !!(G.tutorial && G.tutorial.hold),
  cardClassCenter: document.getElementById('tut-card').classList.contains('center'),
  spotlightVisible: document.getElementById('tut-spot').style.display === 'block',
  shots: G.stat.shots,
  movedPx: Math.round(G.stat.moved),
  state: G.state,
  floor: G.run.floor
})
