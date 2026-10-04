JSON.stringify({
  hasG: typeof G !== 'undefined',
  hasUI: typeof UI !== 'undefined',
  hasTutorial: typeof Tutorial !== 'undefined',
  steps: typeof Tutorial !== 'undefined' ? Tutorial.steps.length : -1,
  flags: Meta.data.flags,
  objectiveText: (G.floorData ? G.objectiveText() : null),
  state: G.state,
  tutActive: !!(G.tutorial && G.tutorial.active),
  tutHold: !!(G.tutorial && G.tutorial.hold),
  tutRootHidden: document.getElementById('tut-root').classList.contains('hidden'),
  segCircle: typeof segCircleHit === 'function',
  hasPlaceStairsExit: typeof G.placeStairsExit === 'function',
  hasTryFire: typeof G.tryFire === 'function',
  hasDrawGuidance: typeof G.drawGuidance === 'function'
})
