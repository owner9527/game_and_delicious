window.__tut = { log: [] };
function L(m){ window.__tut.log.push(m); }
setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('没进对局'); done(JSON.stringify(window.__tut)); return; }
    var hp = document.getElementById('help-modal');
    if(hp) hp.querySelector('[data-close="help-modal"]').click();

    setTimeout(function(){
      var tp = document.getElementById('tut-panel');
      var cs = tp ? getComputedStyle(tp) : null;
      L('① tutActive=' + g.tutActive + '  面板存在=' + !!tp + '  显示=' + (cs ? cs.display : 'n/a'));
      if(tp && cs.display !== 'none'){
        var r = tp.getBoundingClientRect();
        L('   面板位置 ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)
          + (r.bottom <= innerHeight + 1 && r.top >= -1 ? '  ✔ 在屏内' : '  ⚠ 超出屏幕'));
        L('   文案: ' + (tp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120));
        var btns = tp.querySelectorAll('button');
        L('   按钮数=' + btns.length + (btns.length ? ' 首个="' + btns[0].textContent.trim().slice(0,14) + '"' : ''));
        if(btns.length){
          var b = btns[0], br = b.getBoundingClientRect();
          var cx = Math.round(br.left+br.width/2), cy = Math.round(br.top+br.height/2);
          var inV = cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight;
          var top = inV ? document.elementFromPoint(cx,cy) : null;
          L('   首个按钮可点=' + (!!(top && (top===b || b.contains(top)))) + (inV?'':' (视口外)'));
        }
      }
      done(JSON.stringify(window.__tut));
    }, 700);
  }, 3600);
})
