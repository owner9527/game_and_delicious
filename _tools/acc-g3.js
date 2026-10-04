// 《拓城记》四条玩家反馈的独立验收（带异常捕获，保证一定能返回结果）
// 用法: node probe.mjs <url> <out.png> --wait=3000 --click=640,492 --click=880,545 --wait=3000 --evalTimeout=150000 --evalFile=acc-g3.js
window.__g3 = { log: [] };
function L(m){ window.__g3.log.push(String(m)); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function num(v){ return (typeof v === 'number' && isFinite(v)) ? +v.toFixed(2) : String(v); }

new Promise(function(done){
  (async function(){
    try {
      for (var w = 0; w < 40 && !(typeof G !== 'undefined' && G && G.sim && G.sim.started); w++) await sleep(250);
      if (!(typeof G !== 'undefined' && G && G.sim && G.sim.started)) { L('✘ 没进入游戏'); return; }
      L('① 进入游戏: ' + JSON.stringify(G.sim.state || {}).slice(0, 120) + '  人口=' + G.res.length);

      // ---- Q1 资源再生 ----
      if (!G.NAT || !G.NAT.ready) { L('✘ Q1 没有可再生资源层 G.NAT'); }
      else {
        var s0 = G.NAT.summary();
        L('② Q1 资源层就绪: 森林 ' + num(s0.wood.total) + '/' + s0.wood.cap +
          ' 生长+' + num(s0.wood.grow) + '/日 采集-' + num(s0.wood.harvest) + '/日 净' + num(s0.wood.net));
        var before = s0.wood.total;
        for (var d = 0; d < 45; d++) G.NAT.daily();
        var s1 = G.NAT.summary();
        var after = s1.wood.total;
        L('   连推 45 天(无采伐): 森林 ' + num(before) + ' → ' + num(after) +
          (after > before ? '  ✔ 会自己长回来' : '  ⚠ 没回升'));
      }

      // ---- Q2 速度/节奏 ----
      var E = (G.CFG && G.CFG.ECON) || {};
      L('③ Q2 一天时长=' + E.dayMs + 'ms (' + num((E.dayMs || 0) / 1000) + ' 秒)  maxWalkFrac=' + E.maxWalkFrac + '  popCap=' + E.popCap);
      L('   当前速度=' + G.sim.speed + '  速度按钮=' +
        [].slice.call(document.querySelectorAll('[data-spd],[data-speed]')).map(function(b){ return b.dataset.spd || b.dataset.speed; }).join('/'));

      // ---- Q3 基建产出 ----
      var builds = Array.isArray(G.builds) ? G.builds : (Array.isArray(G.B) ? G.B : (G.B && typeof G.B.values === 'function' ? [].slice.call(G.B.values()) : (G.B ? Object.values(G.B) : [])));
      var camps = builds.filter(function(b){ return b && b.def && (b.def.forestBonus || /伐木/.test(b.def.name || '')); });
      L('④ Q3 建筑共 ' + builds.length + ' 座，其中伐木类 ' + camps.length + ' 座');
      if (camps.length) {
        var b = camps[0];
        L('   「' + b.def.name + '」毗邻森林=' + b.forest + '  当前产量=' + num(b.lastOut) +
          '  effective(wood)=' + num(G.NAT.effective(b, 'wood', 8)));
      }
      var sawOut = builds.filter(function(x){ return x && x.lastOut > 0; }).length;
      L('   有实际产出的建筑 ' + sawOut + '/' + builds.length);
      L('   完全没人上工的建筑 ' + builds.filter(function(x){ return x && x.def && x.def.workers > 0 && !x.eff; }).length);

      // ---- Q4 居民 ----
      var pop = G.res.length;
      var wk = Array.isArray(G.walkers) ? G.walkers : (G.walkers && typeof G.walkers.values === 'function' ? [].slice.call(G.walkers.values()) : (typeof G.R.walkers === 'function' ? G.R.walkers() : null));
      var nWalk = (wk && typeof wk.length === 'number') ? wk.length : null;
      L('⑤ Q4 人口=' + pop + '  同屏走动者=' + nWalk +
        (nWalk != null && pop ? '  比例=' + num(nWalk / pop) + (nWalk <= Math.ceil(pop * (E.maxWalkFrac || 1)) ? '  ✔ 未超上限' : '  ✘ 超了') : ''));
      L('   可点选居民 G.RD.walkerAt: ' + (G.RD && typeof G.RD.walkerAt === 'function' ? '有 ✔' : '没有 ✘'));
      if (pop) {
        var r0 = G.res[0];
        L('   居民字段: ' + Object.keys(r0).join(','));
        L('   带 purpose/任务: ' + (/purpose|task|job|dest/.test(Object.keys(r0).join(',')) ? '是 ✔' : '否 ✘') +
          '  purpose=' + r0.purpose);
      }
    } catch (e) {
      L('✘ 脚本异常: ' + (e && e.message ? e.message : e));
    }
    done(JSON.stringify(window.__g3));
  })();
})
