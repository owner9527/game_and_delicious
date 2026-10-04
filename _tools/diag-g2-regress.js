// 回归测试：① 原来的 B 面板 → 选建筑 → 左键放置 仍然可用 ② 右键框选标记仍然真的能标记
window.__reg = { log: [] };
function L(m){ window.__reg.log.push(m); }

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
  // —— ① 旧流程：B 面板放置 ——
  setTimeout(function(){
    try{ G.pool.wood=400; G.pool.stone=400; }catch(e){}
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    var panel=document.getElementById('buildPanel');
    L('① B 打开建造面板='+(!panel.classList.contains('hidden'))+' 卡片='+panel.querySelectorAll('.bcard').length);
    var card=[].slice.call(panel.querySelectorAll('.bcard')).filter(function(c){return !c.classList.contains('locked');})[0];
    L('   点选='+(card?card.querySelector('.bname').textContent.trim():'无'));
    if(card) card.click();
    L('   进入放置模式 placing='+Game.placing);
  }, 1500);

  setTimeout(function(){
    // 找一格可建处，换算成屏幕坐标后左键放置
    var p=G.player.comps.pos, tx0=Math.floor(p.x/TILE), ty0=Math.floor(p.y/TILE), found=null;
    for(var r=1;r<=14&&!found;r++){
      for(var dy=-r;dy<=r&&!found;dy++) for(var dx=-r;dx<=r&&!found;dx++){
        var tx=tx0+dx, ty=ty0+dy;
        if(Buildings.canPlace('campfire',tx,ty) && !Buildings.buildingAt(tx,ty) && !World.nodeAt(tx,ty).node) found={tx:tx,ty:ty};
      }
    }
    L('② 空位='+(found?found.tx+','+found.ty:'无'));
    if(!found){ done(JSON.stringify(window.__reg)); return; }
    // 世界→屏幕：屏幕 = (世界 - cam) * zoom + 视口中心
    var cam=Render.cam;
    var sx=(tx*TILE+TILE/2 - cam.x)*cam.zoom + innerWidth/2;
    var sy=(ty*TILE+TILE/2 - cam.y)*cam.zoom + innerHeight/2;
    var before=ECS.query('building').length;
    var cv=document.getElementById('cv');
    cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:sx,clientY:sy,button:0,buttons:1}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:sx,clientY:sy,button:0,buttons:0}));
    L('③ 左键放置 建筑数 '+before+' → '+ECS.query('building').length+'  placing已清='+(Game.placing===null));

    // —— ② 右键框选标记 ——
    // 找一个附近的资源节点
    var nd=null;
    for(var r=1;r<=30&&!nd;r++){
      for(var dy=-r;dy<=r&&!nd;dy++) for(var dx=-r;dx<=r&&!nd;dx++){
        var q=World.nodeAt(tx0+dx,ty0+dy).node; if(q && !q.marked) nd={tx:tx0+dx,ty:ty0+dy};
      }
    }
    L('④ 待标记资源格='+(nd?nd.tx+','+nd.ty:'无'));
    if(nd){
      var ax=(nd.tx*TILE+TILE/2 - cam.x)*cam.zoom + innerWidth/2;
      var ay=(nd.ty*TILE+TILE/2 - cam.y)*cam.zoom + innerHeight/2;
      var bx=ax+TILE*cam.zoom*1.2, by=ay+TILE*cam.zoom*0.9;
      cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:ax,clientY:ay,button:2,buttons:2}));
      cv.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,clientX:bx,clientY:by,button:2,buttons:2}));
      window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:bx,clientY:by,button:2,buttons:0}));
      var marked=0;
      World.eachNodeInRect(nd.tx,nd.ty,nd.tx,nd.ty,function(x,y,n){ if(n.marked) marked++; });
      L('⑤ 框选后该格 marked='+marked+'  菜单保持收起='+document.getElementById('buildMenu').classList.contains('hidden'));
      L('   收割任务数='+ECS.query('ai').filter(function(e){return e.comps.worker;}).length+' (仅计数,不校验)');
    }
    done(JSON.stringify(window.__reg));
  }, 2400);
})
