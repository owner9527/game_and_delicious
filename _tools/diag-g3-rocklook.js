// 检查岩石格看起来是"有明暗的石头"还是"一块暗斑"：统计整格的亮度分布
JSON.stringify((function () {
  var T = G.CFG.TERR, s = G.CFG.TS;
  if (G.sim && G.sim.state) G.sim.state.day = 3;        // 固定正午
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var ratio = cv.width / cv.clientWidth;
  var z = (G.RD && G.RD.camera) ? G.RD.camera.zoom : 1;

  function tileStats(tx, ty) {
    var p = G.RD.worldToScreen((tx + 0.5) * s, (ty + 0.5) * s);
    var tz = Math.round(s * z), half = Math.max(4, Math.round(tz / 2) - 2);
    var cx = Math.round(p.x * ratio), cy = Math.round(p.y * ratio);
    if (cx - half < 0 || cy - half < 0 || cx + half > cv.width || cy + half > cv.height) return null;
    var d = ctx.getImageData(cx - half, cy - half, half * 2, half * 2).data;
    var lo = 999, hi = -1, sum = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) {
      var L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (L < lo) lo = L; if (L > hi) hi = L; sum += L; n++;
    }
    return { min: Math.round(lo), max: Math.round(hi), avg: Math.round(sum / n) };
  }

  var camX = Math.floor((cv.clientWidth / 2 / z + G.RD.camera.x) / s);
  var camY = Math.floor((cv.clientHeight / 2 / z + G.RD.camera.y) / s);
  var rocks = [], grass = [];
  for (var dy = -12; dy <= 12; dy++) for (var dx = -12; dx <= 12; dx++) {
    var x = camX + dx, y = camY + dy;
    if (!G.M.inB(x, y) || G.M.bAt(x, y)) continue;
    var t = G.M.terr(x, y);
    if (t === T.ROCK) rocks.push([x, y]); else if (t === T.GRASS) grass.push([x, y]);
  }
  function agg(list, k) {
    var out = [];
    for (var i = 0; i < list.length && out.length < k; i++) {
      var st = tileStats(list[i][0], list[i][1]);
      if (st) out.push(st);
    }
    var av = function (f) { return out.length ? Math.round(out.reduce(function (a, b) { return a + f(b); }, 0) / out.length) : 0; };
    return { n: out.length, avgMin: av(function (o) { return o.min; }), avgMax: av(function (o) { return o.max; }), avgLum: av(function (o) { return o.avg; }) };
  }
  return JSON.stringify({ rock: agg(rocks, 10), grass: agg(grass, 10), atDay: G.sim.state.day });
})())
