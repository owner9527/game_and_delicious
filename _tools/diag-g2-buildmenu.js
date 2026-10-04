window.__bm = { log: [] };
function L(m){ window.__bm.log.push(m); }
function rightClick(x, y){
  var cv = document.getElementById('cv');
  cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:x,clientY:y,button:2,buttons:2}));
  window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:x,clientY:y,button:2,buttons:0}));
}

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); L('① 开始新旅程按钮='+!!b); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); L('② 关闭新手指南='+!!c); }, 900);
setTimeout(function(){
  try{ G.pool.wood=400; G.pool.stone=400; G.pool.ironOre=200; G.pool.coal=200; G.pool.crystal=100; G.pool.iron=100; }catch(e){ L('给资源失败:'+e.message); }
  L('③ started='+Game.started+' player='+!!(G&&G.player));
}, 1400);

// —— 测真实右键路径 ——
setTimeout(function(){
  var cx=Math.round(innerWidth/2)+120, cy=Math.round(innerHeight/2)+60;
  rightClick(cx, cy);
  var m=document.getElementById('buildMenu');
  L('④ 右键画布后菜单可见='+(!m.classList.contains('hidden')));
  L('   标题="'+document.getElementById('bmTitle').textContent+'" 卡片数='+m.querySelectorAll('.bcard').length);
  L('   贴合光标 left='+m.style.left+' top='+m.style.top);
  window.__bm.tile = UI.bmTile ? (UI.bmTile.tx+','+UI.bmTile.ty) : 'null';
}, 1900);

// —— 挪到一个确定可建的格子,点一下即建造 ——
setTimeout(function(){
  UI.closeBuildMenu();
  var p=G.player.comps.pos;
  var tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
  for(var r=1;r<=16&&!found;r++){
    for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
      var tx=tx0+dx, ty=ty0+dy;
      if(Buildings.canPlace('campfire',tx,ty) && !Buildings.buildingAt(tx,ty) && !World.nodeAt(tx,ty).node){ found={tx:tx,ty:ty}; }
    }
  }
  window.__bm.found=found;
  L('⑤ 找到可建格='+(found?found.tx+','+found.ty:'无'));
  if(!found){ return; }
  UI.openBuildMenu(found.tx, found.ty, Math.round(innerWidth/2), Math.round(innerHeight/2));
  var m=document.getElementById('buildMenu');
  var cards=[].slice.call(m.querySelectorAll('.bcard'));
  var usable=cards.filter(function(c){return !c.classList.contains('unavail');});
  L('   菜单可见='+(!m.classList.contains('hidden'))+' 可建='+usable.length+'/'+cards.length);
  window.__bm.before=ECS.query('building').length;
  var target=usable[0];
  L('   点击目标='+(target?target.querySelector('.bname').textContent.trim():'无'));
  if(target) target.click();
  window.__bm.after=ECS.query('building').length;
}, 2600);

new Promise(function(done){
setTimeout(function(){
  L('⑥ 建筑数 '+window.__bm.before+' → '+window.__bm.after);
  L('   建造后菜单自动收起='+document.getElementById('buildMenu').classList.contains('hidden'));
  var f=window.__bm.found;
  if(f){ var b=Buildings.buildingAt(f.tx,f.ty); L('   该格已有='+(b?b.comps.building.def:'无')); }
  // —— 框选右键标记是否仍然可用 ——
  var cv=document.getElementById('cv');
  var x0=Math.round(innerWidth/2)-200, y0=Math.round(innerHeight/2)-150;
  var x1=x0+70, y1=y0+60;
  cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:x0,clientY:y0,button:2,buttons:2}));
  cv.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,clientX:x1,clientY:y1,button:2,buttons:2}));
  window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:x1,clientY:y1,button:2,buttons:0}));
  L('⑦ 框选右键后菜单保持收起='+document.getElementById('buildMenu').classList.contains('hidden')+'  dragging已清='+(Game.dragging===null));
  // —— Esc 关闭菜单 ——
  var pt=G.player.comps.pos;
  UI.openBuildMenu(Math.floor(pt.x/TILE), Math.floor(pt.y/TILE), 400, 300);
  var openBefore=!document.getElementById('buildMenu').classList.contains('hidden');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  L('⑧ Esc 前可见='+openBefore+' Esc 后收起='+document.getElementById('buildMenu').classList.contains('hidden'));
  done(JSON.stringify(window.__bm));
}, 3400);
})

