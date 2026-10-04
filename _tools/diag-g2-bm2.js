window.__bm2 = { log: [] };
function L(m){ window.__bm2.log.push(m); }

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);
setTimeout(function(){
  try{ G.pool.wood=400; G.pool.stone=400; }catch(e){}
}, 1400);

new Promise(function(done){
setTimeout(function(){
  var p=G.player.comps.pos;
  var tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
  for(var r=1;r<=40&&!found;r++){
    for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
      var tx=tx0+dx, ty=ty0+dy;
      var nd=World.nodeAt(tx,ty).node;
      if(nd && !Buildings.buildingAt(tx,ty)){ found={tx:tx,ty:ty,type:nd.t}; }
    }
  }
  L('① 找到资源格='+(found?found.tx+','+found.ty+' ('+found.type+')':'无'));
  if(!found){ done(JSON.stringify(window.__bm2)); return; }

  UI.openBuildMenu(found.tx, found.ty, Math.round(innerWidth/2), Math.round(innerHeight/2));
  var m=document.getElementById('buildMenu');
  var act=m.querySelector('.bcard.bmaction');
  L('② 菜单可见='+(!m.classList.contains('hidden'))+' 动作卡="'+(act?act.textContent.trim():'无')+'"');
  var cards=[].slice.call(m.querySelectorAll('.bcard'));
  var usable=cards.filter(function(c){return !c.classList.contains('unavail') && !c.classList.contains('bmaction');});
  L('   建筑可建='+usable.length+'/'+(cards.length-1)+'  提示="'+document.getElementById('bmHint').textContent.slice(0,34)+'"');

  var before=World.nodeAt(found.tx,found.ty).node.marked;
  if(act) act.click();
  var after=World.nodeAt(found.tx,found.ty).node.marked;
  L('③ 点"标记采集" '+before+' → '+after+'  菜单仍开着='+(!m.classList.contains('hidden')));

  // 再点一次应取消
  var act2=document.getElementById('buildMenu').querySelector('.bcard.bmaction');
  if(act2) act2.click();
  L('④ 再点一次取消 → '+World.nodeAt(found.tx,found.ty).node.marked);
  done(JSON.stringify(window.__bm2));
}, 2200);
})
