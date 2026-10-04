// 对比不同 rockReq 阈值下的失败率，为放宽幅度提供依据
JSON.stringify((function () {
  var T = G.CFG.TERR, Z = G.CFG.ZSIZE;
  var thresholds = [6, 4, 3, 2, 1];
  var fail = {}, zeroRock = 0, total = 0;
  thresholds.forEach(function (t) { fail[t] = 0; });
  var seeds = [];
  for (var i = 0; i < 300; i++) seeds.push(1337 + i * 977);
  for (var s = 0; s < seeds.length; s++) {
    G.M.genWorld(seeds[s]);
    var x0 = Z, y0 = Z, x1 = x0 + Z, y1 = y0 + Z;
    var rocks = 0, best = 0;
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++)
        if (G.M.terr(x, y) === T.ROCK) rocks++;
    if (rocks === 0) zeroRock++;
    for (var y2 = y0; y2 < y1; y2++)
      for (var x2 = x0; x2 < x1; x2++) {
        if (G.M.terr(x2, y2) !== T.GRASS) continue;
        var n = G.M.rockNear(x2, y2, 1, 1, 2);
        if (n > best) best = n;
      }
    total++;
    thresholds.forEach(function (t) { if (best < t) fail[t]++; });
  }
  var out = { seeds: total, seedsWithZeroRock: zeroRock, failureByThreshold: {} };
  thresholds.forEach(function (t) {
    out.failureByThreshold['rockReq=' + t] = fail[t] + ' / ' + total + '  (' + (fail[t] / total * 100).toFixed(1) + '%)';
  });
  return JSON.stringify(out);
})())
