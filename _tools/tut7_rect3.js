(() => {
  const r = {};
  const g = id => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) }; };
  r.btnNew = g('btn-new'); r.btnChapters = g('btn-chapters'); r.btnTut = g('btn-tutorial'); r.saveInfo = g('title-save-info');
  const hit = document.elementFromPoint(640, 350); r.hit_640_350 = hit ? (hit.id || hit.className) : null;
  const hit2 = document.elementFromPoint(640, 400); r.hit_640_400 = hit2 ? (hit2.id || hit2.className) : null;
  r.vh = innerHeight;
  return JSON.stringify(r);
})()
