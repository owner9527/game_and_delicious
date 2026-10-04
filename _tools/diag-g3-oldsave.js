// 复现用户遇到的情况：老存档的地形里基地周围没有岩石。
// 做法：先正常开局存一份档 → 把存档里的中央领地岩石全部抹成草地 → 再读这份档，
// 检查新的读档兜底是否补出了可开采的矿脉（而不是"改了跟没改一样"）。
window.__g3old = { log: [] };
function L(m){ window.__g3old.log.push(String(m)); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

new Promise(function(done){
  (async function () {
    try {
      for (var w = 0; w < 40 && !(typeof G !== 'undefined' && G && G.M); w++) await sleep(250);
      if (!(typeof G !== 'undefined' && G && G.M)) { L('✘ 没加载'); done(JSON.stringify(window.__g3old)); return; }

      var KEY = 'tc_save_manual', T = G.CFG.TERR, Z = G.CFG.ZSIZE;
      var W = G.CFG.MAPW;

      // ① 正常开一局并存档
      G.main.newGame(1337, 'normal');
      await sleep(600);
      G.SV.save('manual', true);
      var raw = localStorage.getItem(KEY);
      L('① 已存一份档: ' + (raw ? (raw.length + ' 字节') : '✘ 没有'));

      var data = JSON.parse(raw);
      var terr = data.terr;

      function rocksInZone(arr) {
        var n = 0;
        for (var y = Z; y < Z * 2; y++) for (var x = Z; x < Z * 2; x++) if (arr[y * W + x] === T.ROCK) n++;
        return n;
      }
      function spotsInZone(arr) {
        // 复用游戏自己的判定太麻烦(需要 bmap)，这里按"草地 + 2 格内有岩石"近似
        var n = 0;
        for (var y = Z; y < Z * 2; y++) for (var x = Z; x < Z * 2; x++) {
          if (arr[y * W + x] !== T.GRASS) continue;
          var k = 0;
          for (var yy = y - 2; yy <= y + 2; yy++) for (var xx = x - 2; xx <= x + 2; xx++)
            if (xx >= 0 && yy >= 0 && xx < W && yy < G.CFG.MAPH && arr[yy * W + xx] === T.ROCK) k++;
          if (k > 0) n++;
        }
        return n;
      }

      L('   改动前: 中央领地岩石 ' + rocksInZone(terr) + ' 块，可建位置 ' + spotsInZone(terr) + ' 处');

      // ② 模拟"老存档"：把中央领地的岩石全部改成草地，并把资源层数据清掉
      for (var y2 = Z; y2 < Z * 2; y2++) for (var x2 = Z; x2 < Z * 2; x2++) {
        if (terr[y2 * W + x2] === T.ROCK) terr[y2 * W + x2] = T.GRASS;
      }
      data.nat = null;                              // 老档可能没有 nat 字段
      localStorage.setItem(KEY, JSON.stringify(data));
      L('② 把它改成"基地周围一块石头都没有"的老存档: 岩石 ' + rocksInZone(terr) + ' 块，可建位置 ' + spotsInZone(terr) + ' 处');

      // ③ 走真实的读档路径
      var ok = G.SV.load('manual');
      await sleep(900);
      L('③ 读取该存档: ' + (ok ? '成功' : '✘ 失败'));

      // ④ 读档后检查
      var cur = G.map.terr;
      L('④ 读档后: 中央领地岩石 ' + rocksInZone(cur) + ' 块，可建位置 ' + spotsInZone(cur) + ' 处');

      // ⑤ 用游戏自己的 canPlace 逐格确认真的能建
      G.sim.state.gold = 9999; G.sim.state.wood = 9999; G.sim.state.stone = 9999; G.sim.state.stage = 1;
      var real = 0, first = null;
      for (var y3 = Z; y3 < Z * 2; y3++) for (var x3 = Z; x3 < Z * 2; x3++) {
        var r = G.B.canPlace('quarry', x3, y3);
        if (r.ok) { real++; if (!first) first = { x: x3, y: y3 }; }
      }
      L('⑤ 游戏 canPlace 判定: 可建 ' + real + ' 处' + (real > 0 ? '  ✔ 老存档也能建采石场了' : '  ✘ 仍然建不了'));

      var placed = false;
      if (first) { var pr = G.B.place('quarry', first.x, first.y); placed = !!(pr && pr.ok !== false); }
      L('   实际放置: ' + (placed ? '成功 ' : '失败 ') + (first ? '(' + first.x + ',' + first.y + ')' : ''));

      // ⑥ 新补的岩石格有没有被资源层登记(有没有矿可采)
      if (G.NAT && G.NAT.ready && first) {
        var tot = 0, cnt = 0;
        for (var yy4 = first.y - 2; yy4 <= first.y + 2; yy4++) for (var xx4 = first.x - 2; xx4 <= first.x + 2; xx4++) {
          if (G.M.terr(xx4, yy4) !== T.ROCK) continue;
          var st = G.NAT.stockAt(G.M.idx(xx4, yy4), 'ore');
          if (st !== null) { tot += st; cnt++; }
        }
        L('⑥ 资源层: 采石场周围 ' + cnt + ' 块岩石，蓄积合计=' + Math.round(tot) + (cnt > 0 && tot > 0 ? '  ✔ 有矿可采' : '  ✘ 石头是死的(采不到)'));
      }
    } catch (e) {
      L('✘ 异常: ' + (e && e.message ? e.message : e));
    }
    done(JSON.stringify(window.__g3old));
  })();
})
