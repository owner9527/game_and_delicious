// 用真实函数路径验证三个面板互斥：建造/科技/详情
window.__mx = { log: [] };
function L(m){ window.__mx.log.push(m); }
function vis(){
  var ids=['buildPanel','techPanel','infoPanel'];
  return ids.filter(function(id){ return !document.getElementById(id).classList.contains('hidden'); });
}
function rectOv(){
  var v=vis(), out=[];
  for(var i=0;i<v.length;i++) for(var j=i+1;j<v.length;j++){
    var a=document.getElementById(v[i]).getBoundingClientRect(), b=document.getElementById(v[j]).getBoundingClientRect();
    var w=Math.min(a.right,b.right)-Math.max(a.left,b.left), h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(w>0&&h>0) out.push(v[i]+'×'+v[j]+'='+Math.round(w)+'×'+Math.round(h));
  }
  return out;
}
function say(tag){ var o=rectOv(); L(tag+' → ['+vis().join(',')+'] '+(o.length?('⚠ '+o.join(' ')):'无重叠 ✔')); }

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
  setTimeout(function(){
    try{ G.pool.wood=400; G.pool.stone=400; }catch(e){}
    // 先在附近建一座篝火
    var p=G.player.comps.pos, tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
    for(var r=1;r<=16&&!found;r++){
      for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
        var tx=tx0+dx, ty=ty0+dy;
        if(Buildings.canPlace('campfire',tx,ty) && !Buildings.buildingAt(tx,ty) && !World.nodeAt(tx,ty).node) found={tx:tx,ty:ty};
      }
    }
    Game.buildAt('campfire', found.tx, found.ty, false);
    var b=Buildings.buildingAt(found.tx, found.ty);
    L('已建篝火='+!!b);
    window.__mx.b = b;
    // ① 开着建造面板时,点建筑 → 应该只剩详情
    UI.togglePanel('build'); say('① 按 B');
    UI.showBuildingInfo(b);  say('② 建造面板开→点建筑看详情');
    // ③ 详情开着时按 B → 应该只剩建造
    UI.togglePanel('build'); say('③ 详情开→按 B');
    // ④ 详情开着时按 T → 应该只剩科技
    UI.showBuildingInfo(b);
    UI.togglePanel('tech');  say('④ 详情开→按 T');
    // ⑤ T 再按一次应关闭
    UI.togglePanel('tech');  say('⑤ 再按 T');
    done(JSON.stringify(window.__mx));
  }, 1700);
})
