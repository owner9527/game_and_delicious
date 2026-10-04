window.__sf2 = { log: [] };
function L(m){ window.__sf2.log.push(m); }

setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); L('① 沙盒'); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('✘ 没进对局'); done(JSON.stringify(window.__sf2)); return; }
    var help = document.getElementById('help-modal');
    L('② 进入对局后：说明弹窗显示=' + (help && help.style.display !== 'none') + '  暂停原因=' + JSON.stringify(g.pauseReasons));

    // 模拟玩家点弹窗里的"开始拓荒"按钮
    var closeBtn = help ? help.querySelector('[data-close="help-modal"]') : null;
    L('③ 找到关闭按钮=' + !!closeBtn + (closeBtn ? ' 文案="' + closeBtn.textContent.trim() + '"' : ''));
    if(closeBtn) closeBtn.click();

    setTimeout(function(){
      L('④ 关闭后：弹窗显示=' + (help.style.display !== 'none') + '  暂停原因=' + JSON.stringify(g.pauseReasons) + '  isPaused=' + (typeof g.isPaused === 'function' ? g.isPaused() : 'n/a'));

      var cols = g.colonists || [];
      var p0 = cols.map(function(c){ return { x: c.x, y: c.y }; });
      setTimeout(function(){
        var moved = 0;
        for (var i = 0; i < cols.length; i++) if (Math.hypot(cols[i].x - p0[i].x, cols[i].y - p0[i].y) > 0.5) moved++;
        L('⑤ 殖民者 ' + cols.length + ' 人，关掉说明后 1.6s 内有位移的 ' + moved + ' 人' + (moved > 0 ? '  ✔ 会动' : '  ✘ 仍旧全站着'));

        // 建筑是否产出
        var before = JSON.stringify(g.res || g.resources || {});
        setTimeout(function(){
          L('⑥ 3s 后资源：' + JSON.stringify(g.res || g.resources || {}));
          L('   建筑数=' + g.buildings.length + '  殖民者任务样本=' + (cols[0] ? JSON.stringify(cols[0].task || cols[0].job || cols[0].state || '?') : '无'));
          done(JSON.stringify(window.__sf2));
        }, 3000);
      }, 1600);
    }, 400);
  }, 3600);
})
