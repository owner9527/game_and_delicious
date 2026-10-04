(function () {
  var r = document.getElementById('btn-new').getBoundingClientRect();
  var t = document.getElementById('btn-tutorial').getBoundingClientRect();
  var sr = document.querySelector('.seedrow').getBoundingClientRect();
  return JSON.stringify({
    startBtnCenter: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
    tutBtnCenter: { x: Math.round(t.left + t.width / 2), y: Math.round(t.top + t.height / 2) },
    seedrowHeight: Math.round(sr.height),
    state: G.state
  });
})()
