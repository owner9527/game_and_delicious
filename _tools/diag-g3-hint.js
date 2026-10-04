// 验证：① 有岩石就能放采石场 ② 选中采石场后地图上标出了所有可建位置
window.__g3h = { log: [] };
function L(m){ window.__g3h.log.push(String(m)); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

new Promise(function(done){
  (async function () {
    try {
      for (var w = 0; w < 40 && !(typeof G !== 'undefined' && G && G.sim && G.sim.started); w++) await sleep(250);
      if (!(typeof G !== 'undefined' && G && G.sim && G.sim.started)) { L('✘ 没进入游戏'); done(JSON.stringify(window.__g3h)); return; }
      var q = G.CFG.BUILDS.quarry;
      L('① 采石场的岩石要求 rockReq = ' + q.rockReq + '（1 = 挨着一块就够）');

      // ② 选中采石场 → 提示层应标出可建位置
      G.UI.setTool('place', 'quarry');
      await sleep(900);
      var info = G.RD.placeHintInfo ? G.RD.placeHintInfo() : null;
      L('② 选中后提示层: ' + JSON.stringify(info));
      L('   视野内标出的可建位置数 = ' + (info ? info.count : '取不到') + (info && info.count > 0 ? '  ✔' : '  ✘'));

      // ③ 逐格核对：凡是有岩石的草地格，理论上都能建
      var T = G.CFG.TERR, Z = G.CFG.ZSIZE;
      var rockGrass = 0, okOnRock = 0, noRockOk = 0, noRockTotal = 0;
      for (var y = Z; y < Z * 2; y++) {
        for (var x = Z; x < Z * 2; x++) {
          if (G.M.terr(x, y) !== T.GRASS) continue;
          var nearRock = G.M.rockNear(x, y, 1, 1, 2) > 0;
          var ok = G.B.canPlace('quarry', x, y).ok;
          if (nearRock) { rockGrass++; if (ok) okOnRock++; }
          else { noRockTotal++; if (ok) noRockOk++; }
        }
      }
      L('③ 开局领地内: 挨着岩石的草地格 ' + rockGrass + ' 个，其中可建 ' + okOnRock +
        ' 个' + (rockGrass > 0 && okOnRock === rockGrass ? '  ✔ 全部可建' : (okOnRock < rockGrass ? '  ⚠ 有可建却没通过的(可能被占用/领地里已建)' : '')));
      L('   不挨岩石的草地格 ' + noRockTotal + ' 个，其中可建 ' + noRockOk + ' 个' + (noRockOk === 0 ? '  ✔ 正确地全部拒绝' : '  ⚠ 有不该通过的'));

      // ④ 关掉放置模式
      G.UI.setTool('select');
      await sleep(400);
      L('④ 退出放置模式后提示层: ' + JSON.stringify(G.RD.placeHintInfo ? G.RD.placeHintInfo() : null));
    } catch (e) {
      L('✘ 异常: ' + (e && e.message ? e.message : e));
    }
    done(JSON.stringify(window.__g3h));
  })();
})
