window.__lay9 = { log: [] };
function L(m){ window.__lay9.log.push(m); }
setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('没进对局'); done(JSON.stringify(window.__lay9)); return; }
    var hp = document.getElementById('help-modal');
    if(hp && hp.style.display !== 'none') hp.querySelector('[data-close="help-modal"]').click();

    setTimeout(function(){
      ['res-bar','dock','tut-panel','minimap-wrap','event-ticker','brownout'].forEach(function(id){
        var e = document.getElementById(id);
        if(!e) return;
        var cs = getComputedStyle(e), r = e.getBoundingClientRect();
        var inV = r.width > 0 && r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
        L(id.padEnd(14) + ' position=' + cs.position.padEnd(9) + ' rect=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (r.width ? (inV ? '  ✔ 在屏内' : '  ✘ 出屏') : ' (未显示)'));
      });
      // 打开建造面板，确认侧边面板位置正确
      var bb = document.getElementById('btn-build');
      if(bb) bb.click();
      setTimeout(function(){
        ['panel-build','panel-tech','panel-info','panel-log'].forEach(function(id){
          var e = document.getElementById(id);
          var cs = getComputedStyle(e), r = e.getBoundingClientRect();
          if(cs.display === 'none'){ L(id.padEnd(14) + ' (关闭)'); return; }
          var inV = r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
          L(id.padEnd(14) + ' position=' + cs.position.padEnd(9) + ' rect=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (inV ? '  ✔ 在屏内' : '  ✘ 出屏'));
        });
        var b = document.getElementById('panel-build');
        L('  建造面板可见=' + (getComputedStyle(b).display !== 'none') + ' 卡片数=' + b.querySelectorAll('.build-item').length);
        done(JSON.stringify(window.__lay9));
      }, 500);
    }, 700);
  }, 3600);
})
