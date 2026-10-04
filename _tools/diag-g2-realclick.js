// 用"屏幕坐标 → 最上层元素"的方式派发点击，等价于真人用鼠标点那个位置
window.__real = { log: [] };
function L(m){ window.__real.log.push(m); }

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
setTimeout(function(){
  try{ G.pool.wood=400; G.pool.stone=400; G.pool.ironOre=200; G.pool.coal=200; G.pool.crystal=100; }catch(e){}
  var p=G.player.comps.pos, tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
  for(var r=1;r<=16&&!found;r++){
    for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
      var tx=tx0+dx, ty=ty0+dy;
      if(Buildings.canPlace('campfire',tx,ty) && !Buildings.buildingAt(tx,ty) && !World.nodeAt(tx,ty).node) found={tx:tx,ty:ty};
    }
  }
  UI.openBuildMenu(found.tx, found.ty, Math.round(innerWidth/2), Math.round(innerHeight/2));

  setTimeout(function(){
    var before = ECS.query('building').length;
    // 统计所有可点卡片，逐个用"坐标 → 最上层元素"派发点击
    var m=document.getElementById('buildMenu');
    var cards=[].slice.call(m.querySelectorAll('.bcard')).filter(function(c){return !c.classList.contains('unavail');});
    L('可点卡片 '+cards.length+' 个，建筑数起手='+before);
    var c=cards[0];
    var r2=c.getBoundingClientRect();
    var cx=Math.round(r2.left+r2.width/2), cy=Math.round(r2.top+r2.height/2);
    var name=c.querySelector('.bname').textContent.trim();
    var top=document.elementFromPoint(cx,cy);
    L('点('+cx+','+cy+') 最上层='+top.tagName+'.'+String(top.className));
    ['mousedown','mouseup','click'].forEach(function(t){
      top.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0,buttons:t==='mouseup'||t==='click'?0:1}));
    });
    setTimeout(function(){
      L('点击「'+name+'」后 建筑数='+ECS.query('building').length+'  (该格='+(Buildings.buildingAt(found.tx,found.ty)?Buildings.buildingAt(found.tx,found.ty).comps.building.def:'空')+')');
      L('菜单已收起='+document.getElementById('buildMenu').classList.contains('hidden'));
      done(JSON.stringify(window.__real));
    }, 300);
  }, 500);
}, 1800);
})
