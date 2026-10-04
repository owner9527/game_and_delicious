// 用游戏自己的 G.B.canPlace 验证：这些曾经失败的种子现在能不能真的放下采石场
JSON.stringify((function () {
  var Z = G.CFG.ZSIZE, out = [];
  var seeds = [1337, 51164, 59957, 169381];
  for (var i = 0; i < seeds.length; i++) {
    G.M.genWorld(seeds[i]);
    if (!G.sim.state) G.sim.state = G.sim.newState('normal', seeds[i]);
    G.sim.state.gold = 999; G.sim.state.wood = 999; G.sim.state.stone = 999;
    G.sim.state.stage = 1;
    var x0 = Z, y0 = Z;
    var okSpots = 0, reasons = {}, first = null;
    for (var y = y0; y < y0 + Z; y++) {
      for (var x = x0; x < x0 + Z; x++) {
        var r = G.B.canPlace('quarry', x, y);
        if (r.ok) { okSpots++; if (!first) first = { x: x, y: y }; }
        else reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      }
    }
    var placed = false;
    if (first) {
      var pr = G.B.place('quarry', first.x, first.y);
      placed = !!(pr && pr.ok !== false);
    }
    out.push({ seed: seeds[i], canPlaceOk: okSpots, firstSpot: first, placed: placed, topReasons: Object.keys(reasons).slice(0, 3) });
  }
  return JSON.stringify({ tested: out.length, results: out, allOk: out.every(function (o) { return o.canPlaceOk > 0 && o.placed; }) });
})())
