// 客观测量：岩石格 vs 草地格在屏幕上的实际颜色差异（用于判断"特征是否明显"）
JSON.stringify((function () {
  var T = G.CFG.TERR, s = G.CFG.TS;
  if (G.sim && G.sim.state) G.sim.state.day = 3;   // ph=0.25 → 正午,nightK=0,duskK=0
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var ratio = cv.width / cv.clientWidth;
  window.__camZoom = (G.RD && G.RD.camera) ? G.RD.camera.zoom : 1;

  function sampleTile(tx, ty) {
    var p = G.RD.worldToScreen((tx + 0.5) * s, (ty + 0.5) * s);
    var tz = Math.round(s * (window.__camZoom || 1));      // 一格在屏幕上的像素尺寸
    var half = Math.max(4, Math.round(tz / 2) - 2);
    var cx = Math.round(p.x * ratio), cy = Math.round(p.y * ratio);
    if (cx - half < 0 || cy - half < 0 || cx + half > cv.width || cy + half > cv.height) return null;
    var n = half * 2;
    var d = ctx.getImageData(cx - half, cy - half, n, n).data;   // 整格取平均(含画上去的石头)
    var r = 0, g = 0, b = 0, k = 0;
    for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
    return { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(b / k), sx: cx, sy: cy };
  }
  function lum(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
  function dist(a, b) { return Math.round(Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2))); }

  // 在视野中心附近找岩石格与草地格
  var camTx = Math.floor((G.RD.screenToWorld ? G.RD.screenToWorld(cv.clientWidth / 2, cv.clientHeight / 2).x : 36 * s) / s);
  var camTy = Math.floor((G.RD.screenToWorld ? G.RD.screenToWorld(cv.clientWidth / 2, cv.clientHeight / 2).y : 36 * s) / s);

  var rocks = [], grass = [];
  for (var dy = -14; dy <= 14; dy++) {
    for (var dx = -14; dx <= 14; dx++) {
      var x = camTx + dx, y = camTy + dy;
      if (!G.M.inB(x, y)) continue;
      if (G.M.bAt(x, y)) continue;                       // 跳过有建筑的格
      var t = G.M.terr(x, y);
      if (t === T.ROCK) rocks.push([x, y]);
      else if (t === T.GRASS) grass.push([x, y]);
    }
  }
  var out = { cameraTile: [camTx, camTy], rockTilesInView: rocks.length, grassTilesInView: grass.length, samples: [] };

  // 各取 6 个可采样的样点
  function take(list, label, k) {
    var got = 0;
    for (var i = 0; i < list.length && got < k; i++) {
      var c = sampleTile(list[i][0], list[i][1]);
      if (!c) continue;
      got++;
      out.samples.push({ kind: label, tile: list[i], rgb: [c.r, c.g, c.b], lum: Math.round(lum(c)) });
    }
    return got;
  }
  take(rocks, 'rock', 6);
  take(grass, 'grass', 6);

  // 统计平均色差
  var rk = out.samples.filter(function (a) { return a.kind === 'rock'; });
  var gr = out.samples.filter(function (a) { return a.kind === 'grass'; });
  if (rk.length && gr.length) {
    var mr = { r: 0, g: 0, b: 0 }, mg = { r: 0, g: 0, b: 0 };
    rk.forEach(function (a) { mr.r += a.rgb[0]; mr.g += a.rgb[1]; mr.b += a.rgb[2]; });
    gr.forEach(function (a) { mg.r += a.rgb[0]; mg.g += a.rgb[1]; mg.b += a.rgb[2]; });
    mr.r /= rk.length; mr.g /= rk.length; mr.b /= rk.length;
    mg.r /= gr.length; mg.g /= gr.length; mg.b /= gr.length;
    out.avgRock = [Math.round(mr.r), Math.round(mr.g), Math.round(mr.b)];
    out.avgGrass = [Math.round(mg.r), Math.round(mg.g), Math.round(mg.b)];
    out.rgbDistance = dist(mr, mg);
    out.lumDiff = Math.round(Math.abs(lum(mr) - lum(mg)));
  }
  return JSON.stringify(out);
})())
