(() => {
  const b = document.getElementById('gNext').getBoundingClientRect();
  const c = document.getElementById('gSkip').getBoundingClientRect();
  const at = (r) => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? (e.id || e.className) : null; };
  return JSON.stringify({
    step: MMGuide.step, active: MMGuide.active, title: document.getElementById('gTitle').textContent,
    next: { cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2), hit: at(b) },
    skip: { cx: Math.round(c.left + c.width / 2), cy: Math.round(c.top + c.height / 2), hit: at(c) },
  });
})()
