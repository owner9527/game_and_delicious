(() => {
  const r = {};
  for (const id of ['btnStart', 'btnGuide', 'btnTut']) {
    const el = document.getElementById(id);
    const b = el.getBoundingClientRect();
    r[id] = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) };
  }
  const m = document.querySelector('#menu .modal').getBoundingClientRect();
  r.modal = { y: Math.round(m.top), h: Math.round(m.height) };
  const el = document.elementFromPoint(548, 465);
  r.hit_548_465 = el ? (el.id || el.className) : null;
  const el2 = document.elementFromPoint(640, 510);
  r.hit_640_510 = el2 ? (el2.id || el2.className) : null;
  return JSON.stringify(r);
})()
