// 复现：扫描若干种子，统计「开局已解锁领地内能否放下采石场」
JSON.stringify((function () {
  var T = G.CFG.TERR, Z = G.CFG.ZSIZE;
  var total = 0, noSpot = 0, noRockAtAll = 0;
  var spots = [], rockTotals = [];
  var examples = [];
  var seeds = [];
  for (var i = 0; i < 200; i++) seeds.push(1337 + i * 977);
  for (var s = 0; s < seeds.length; s++) {
    var seed = seeds[s];
    G.M.genWorld(seed);
    var x0 = 1 * Z, y0 = 1 * Z, x1 = x0 + Z, y1 = y0 + Z;
    var rocks = 0, sp = 0;
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++)
        if (G.M.terr(x, y) === T.ROCK) rocks++;
    for (var y2 = y0; y2 < y1; y2++)
      for (var x2 = x0; x2 < x1; x2++) {
        if (G.M.terr(x2, y2) !== T.GRASS) continue;
        if (G.M.rockNear(x2, y2, 1, 1, 2) >= 6) sp++;
      }
    total++;
    rockTotals.push(rocks);
    spots.push(sp);
    if (sp === 0) { noSpot++; if (examples.length < 6) examples.push({ seed: seed, rocksInZone: rocks }); }
    if (rocks === 0) noRockAtAll++;
  }
  rockTotals.sort(function (a, b) { return a - b; });
  spots.sort(function (a, b) { return a - b; });
  return JSON.stringify({
    seeds: total,
    seedsWithZeroRockInStartZone: noRockAtAll,
    seedsWhereQuarryHasNoLegalSpot: noSpot,
    failureRate: (noSpot / total * 100).toFixed(1) + '%',
    rockCount: { min: rockTotals[0], median: rockTotals[Math.floor(total / 2)], max: rockTotals[total - 1] },
    legalSpots: { min: spots[0], median: spots[Math.floor(total / 2)], max: spots[total - 1] },
    worstSeeds: examples
  });
})())
