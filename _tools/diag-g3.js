JSON.stringify({
  modals: Array.prototype.slice.call(document.querySelectorAll('.modal,[class*=modal],[class*=guide],[class*=help]'))
    .filter(function (e) { var s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05 && e.getBoundingClientRect().width > 40; })
    .map(function (e) { return (e.id || e.className) + ' @' + Math.round(e.getBoundingClientRect().top) + ',' + Math.round(e.getBoundingClientRect().height); }).slice(0, 6),
  buttons: Array.prototype.slice.call(document.querySelectorAll('button,.btn')).filter(function (e) {
    var s = getComputedStyle(e); var r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05 && r.width > 20;
  }).map(function (e) { var r = e.getBoundingClientRect(); return (e.textContent || '').trim().slice(0, 10) + '@' + Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2); }).slice(0, 12),
  topCenter: (function () { var e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? (e.tagName + '#' + (e.id || '') + '.' + String(e.className).slice(0, 30)) : null; })()
})
