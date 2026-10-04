(() => {
  const b = document.getElementById('tut-next').getBoundingClientRect();
  const c = document.getElementById('tut-skip').getBoundingClientRect();
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  const hit2 = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  return JSON.stringify({
    step: MMTutorial.step, stepText: MMTutorial.stepText,
    nextRect: { cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) },
    skipRect: { cx: Math.round(c.left + c.width / 2), cy: Math.round(c.top + c.height / 2) },
    hitNext: hit ? (hit.id || hit.className) : null,
    hitSkip: hit2 ? (hit2.id || hit2.className) : null,
    active: MMTutorial.active,
  });
})()
