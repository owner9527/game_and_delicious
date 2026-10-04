(() => {
  const r = {};
  const g = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2), hidden: e.classList.contains('hidden') }; };
  ['btn-continue', 'btn-new', 'btn-chapters', 'btn-help', 'btn-codex', 'btn-settings', 'btn-about'].forEach(id => { r[id] = g(id); });
  const si = document.getElementById('title-save-info').getBoundingClientRect();
  r.saveInfo = { y: Math.round(si.top), bottom: Math.round(si.bottom), h: Math.round(si.height) };
  const hit = document.elementFromPoint(640, 350);
  r.hit_640_350 = hit ? (hit.id || hit.className) : null;
  const hit2 = document.elementFromPoint(640, 400);
  r.hit_640_400 = hit2 ? (hit2.id || hit2.className) : null;
  r.vh = innerHeight; r.vw = innerWidth;
  return JSON.stringify(r);
})()
