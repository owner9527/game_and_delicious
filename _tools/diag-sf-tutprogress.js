window.__tutp = { log: [] };
function L(m){ window.__tutp.log.push(m); }
setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('没进对局'); done(JSON.stringify(window.__tutp)); return; }
    var hp = document.getElementById('help-modal');
    if(hp && hp.style.display !== 'none') hp.querySelector('[data-close="help-modal"]').click();

    setTimeout(function(){
      var steps = g.TUT_STEPS.map(function(s){ return s.id; });
      L('① 教学步骤: ' + steps.join(' → '));
      L('   当前 step=' + g.tutCheck() + '  tutActive=' + g.tutActive);

      // 在最近的矿脉上建一座采矿场，看教学是否推进
      var nodes = g.map.nodes.filter(function(n){ return n.type === 'ore' && n.amount > 0; });
      nodes.sort(function(a,b){ return Math.hypot(a.x-g.site.x,a.y-g.site.y) - Math.hypot(b.x-g.site.x,b.y-g.site.y); });
      var mine = SF.data.BUILDINGS.mine;
      L('② 附近矿脉 ' + nodes.length + ' 处，采矿场造价 ' + JSON.stringify(mine.cost));
      // 给足资源
      var res = g.res;
      for (var k in mine.cost) res[k] = (res[k] || 0) + mine.cost[k] * 3;
      L('   资源: ' + JSON.stringify({ore:Math.round(res.ore),energy:Math.round(res.energy)}));

      var n0 = nodes[0];
      // 玩家会围绕矿脉找一个"能放"的点：这里扫一圈偏移，取第一个 canPlace 通过的位置
      var U = 34, best = null, firstWhy = '';
      for (var ring = 1; ring <= 4 && !best; ring++) {
        for (var a = 0; a < 24 && !best; a++) {
          var ang = a / 24 * Math.PI * 2;
          var px = n0.x + Math.cos(ang) * ring * U * 1.6;
          var py = n0.y + Math.sin(ang) * ring * U * 1.6;
          var chk = g.canPlace('mine', px, py);
          if (chk.ok) best = { x: px, y: py };
          else if (!firstWhy) firstWhy = chk.why;
        }
      }
      L('③ 围绕矿脉找可建点: ' + (best ? ('找到 (' + Math.round(best.x) + ',' + Math.round(best.y) + ')') : '找不到！首个失败原因: ' + firstWhy));
      var placed = best ? g.place('mine', best.x, best.y) : false;
      L('   放置采矿场: ' + (placed ? '成功' : '失败'));

      // 让它建完（加速推进）
      g.speed = 3;
      var t0 = Date.now();
      var timer = setInterval(function(){
        if (Date.now() - t0 > 9000) {
          clearInterval(timer);
          var built = g.buildings.filter(function(b){ return b.built; }).length;
          L('④ 9 秒后：已建成建筑 ' + built + ' 座，教学 step=' + g.tutCheck() + '  tutActive=' + g.tutActive);
          L('   采矿场是否已建成: ' + g.buildings.some(function(b){ return b.type === 'mine' && b.built; }));
          L('   教学面板文案: ' + (document.getElementById('tut-list').textContent || '').replace(/\s+/g,' ').trim().slice(0,110));
          done(JSON.stringify(window.__tutp));
        }
      }, 500);
    }, 800);
  }, 3600);
})
