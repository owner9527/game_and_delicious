// 打开右键菜单并停在那里，用于截图
window.__shot = { log: [] };
setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
  setTimeout(function(){
    try{ G.pool.wood=400; G.pool.stone=400; G.pool.ironOre=200; G.pool.coal=200; G.pool.crystal=100; }catch(e){}
    var p=G.player.comps.pos;
    var tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
    for(var r=1;r<=16&&!found;r++){
      for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
        var tx=tx0+dx, ty=ty0+dy;
        if(Buildings.canPlace('campfire',tx,ty) && !Buildings.buildingAt(tx,ty) && !World.nodeAt(tx,ty).node) found={tx:tx,ty:ty};
      }
    }
    if(found) UI.openBuildMenu(found.tx, found.ty, Math.round(innerWidth*0.55), Math.round(innerHeight*0.55));
    var m=document.getElementById('buildMenu');
    var r2=m.getBoundingClientRect();
    window.__shot.log.push(JSON.stringify({tile:found, visible:!m.classList.contains('hidden'),
      rect:{x:Math.round(r2.left),y:Math.round(r2.top),w:Math.round(r2.width),h:Math.round(r2.height)},
      inViewport:(r2.left>=0 && r2.top>=0 && r2.right<=innerWidth && r2.bottom<=innerHeight),
      cards:m.querySelectorAll('.bcard').length}));
    done(JSON.stringify(window.__shot));
  }, 2000);
})
