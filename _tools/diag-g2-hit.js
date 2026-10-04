// 验证：真实鼠标点击能不能落到菜单卡片上（而不是被画布吃掉）
window.__hit = { log: [] };
function L(m){ window.__hit.log.push(m); }

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
    if(!found){ L('没找到可建格'); done(JSON.stringify(window.__hit)); return; }
    UI.openBuildMenu(found.tx, found.ty, Math.round(innerWidth/2), Math.round(innerHeight/2));

    setTimeout(function(){
      var m=document.getElementById('buildMenu');
      var cards=[].slice.call(m.querySelectorAll('.bcard')).filter(function(c){return !c.classList.contains('unavail');});
      L('可点卡片数='+cards.length);
      var c=cards[0];
      if(!c){ L('没有可点卡片'); done(JSON.stringify(window.__hit)); return; }
      var r2=c.getBoundingClientRect();
      var cx=Math.round(r2.left+r2.width/2), cy=Math.round(r2.top+r2.height/2);
      var top=document.elementFromPoint(cx,cy);
      L('卡片="'+c.querySelector('.bname').textContent.trim()+'" 中心='+cx+','+cy);
      L('该点最上层元素='+(top?top.tagName+'#'+(top.id||'')+'.'+String(top.className).slice(0,24):'null'));
      L('命中卡片或其子元素='+(!!(top && (top===c || c.contains(top)))));
      L('卡片 pointer-events='+getComputedStyle(c).pointerEvents+'  菜单 pointer-events='+getComputedStyle(m).pointerEvents);
      L('菜单 z-index='+getComputedStyle(m).zIndex+'  画布 z-index='+getComputedStyle(document.getElementById('cv')).zIndex);
      // 记录坐标供真实鼠标点击使用
      window.__hit.clickAt = { x: cx, y: cy, before: ECS.query('building').length, tile: found };
      done(JSON.stringify(window.__hit));
    }, 500);
  }, 1800);
})
