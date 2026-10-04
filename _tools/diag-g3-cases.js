// 针对性检查：把曾经失败的种子逐个过一遍，看开局领地里的岩石与合法落点
JSON.stringify((function () {
  var T = G.CFG.TERR, Z = G.CFG.ZSIZE;
  var need = G.CFG.BUILDS.quarry.rockReq;
  var seeds = [1337, 51164, 59957, 169381, 4268, 5245, 8176, 14038, 15015];
  var out = { need: need, zone: Z, results: [] };
  for (var i = 0; i < seeds.length; i++) {
    var seed = seeds[i];
    G.M.genWorld(seed);
    var x0 = Z, y0 = Z, x1 = x0 + Z, y1 = y0 + Z;
    var rocks = 0, best = 0, spots = 0, rockTiles = [];
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++)
        if (G.M.terr(x, y) === T.ROCK) { rocks++; if (rockTiles.length < 4) rockTiles.push(x + ',' + y); }
    for (var y2 = y0; y2 < y1; y2++)
      for (var x2 = x0; x2 < x1; x2++) {
        if (G.M.terr(x2, y2) !== T.GRASS) continue;
        var n = G.M.rockNear(x2, y2, 1, 1, 2);
        if (n > best) best = n;
        if (n >= need) spots++;
      }
    out.results.push({ seed: seed, rocksInZone: rocks, bestRockNearGrass: best, legalSpots: spots, ok: spots > 0, sample: rockTiles });
  }
  out.allPass = out.results.every(function (r) { return r.ok; });
  return JSON.stringify(out);
})())
