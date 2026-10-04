window.__mod = { log: [] };
function L(m){ window.__mod.log.push(m); }
setTimeout(function(){ var b=document.querySelector('#btn-endless'); if(b) b.click(); L('① 点深空漫游'); }, 300);
new Promise(function(done){
  setTimeout(function(){
    var el = document.getElementById('modal');
    var vis = getComputedStyle(el).display !== 'none';
    L('② 难度弹窗显示=' + vis);
    if(vis){
      var box = el.querySelector('.modal-box');
      var r = box.getBoundingClientRect();
      L('   盒子 ' + Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height) + ' 底部='+Math.round(r.bottom)+' 视口高='+innerHeight + (r.bottom<=innerHeight+1?'  ✔ 完整在屏内':'  ✘ 超出屏幕'));
      var btns = box.querySelectorAll('button');
      L('   按钮数=' + btns.length);
      if(btns.length){
        var b = btns[btns.length-1], br = b.getBoundingClientRect();
        var cx=Math.round(br.left+br.width/2), cy=Math.round(br.top+br.height/2);
        var inV = cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight;
        var top = inV ? document.elementFromPoint(cx,cy) : null;
        L('   末个按钮 "'+b.textContent.trim().slice(0,14)+'" @'+cx+','+cy+' 可点=' + (!!(top&&(top===b||b.contains(top)))) + (inV?'':' (视口外)'));
      }
    }
    done(JSON.stringify(window.__mod));
  }, 1200);
})