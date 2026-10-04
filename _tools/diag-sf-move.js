window.__sfm = { log: [] };
function L(m){ window.__sfm.log.push(m); }
function pe(type, x, y, pt, id){
  return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
    pointerId: id || 1, pointerType: pt || 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
}
function dragPan(cv, x1, y1, x2, y2, type){
  cv.dispatchEvent(pe('pointerdown', x1, y1, type));
  var N = 8;
  for (var i = 1; i <= N; i++) {
    cv.dispatchEvent(pe('pointermove', Math.round(x1 + (x2 - x1) * i / N), Math.round(y1 + (y2 - y1) * i / N), type));
  }
  cv.dispatchEvent(pe('pointerup', x2, y2, type));
}

setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); L('① 沙盒='+!!b); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    L('② 进入对局=' + !!g + ' state=' + SF.app.state);
    if(!g){ done(JSON.stringify(window.__sfm)); return; }
    var cv = document.getElementById('game-canvas');
    L('   地图=' + g.map.w + 'x' + g.map.h + ' 初始 cam=(' + Math.round(g.cam.x) + ',' + Math.round(g.cam.y) + ')');

    // 鼠标拖动平移
    var a = { x: g.cam.x, y: g.cam.y };
    dragPan(cv, 500, 400, 700, 520, 'mouse');
    var d1 = Math.hypot(g.cam.x - a.x, g.cam.y - a.y);
    L('③ 鼠标拖动(200,120)：位移 ' + Math.round(d1) + (d1 > 1 ? '  ✔ 生效' : '  ✘ 没动'));

    // 触摸拖动平移
    var b2 = { x: g.cam.x, y: g.cam.y };
    dragPan(cv, 500, 400, 660, 500, 'touch');
    var d2 = Math.hypot(g.cam.x - b2.x, g.cam.y - b2.y);
    L('④ 触摸拖动(160,100)：位移 ' + Math.round(d2) + (d2 > 1 ? '  ✔ 生效' : '  ✘ 没动'));

    // 点击（不拖动）应当被当成"点击"，不应平移
    var c2 = { x: g.cam.x, y: g.cam.y };
    cv.dispatchEvent(pe('pointerdown', 640, 400, 'mouse'));
    cv.dispatchEvent(pe('pointerup', 640, 400, 'mouse'));
    var d3 = Math.hypot(g.cam.x - c2.x, g.cam.y - c2.y);
    L('⑤ 原地点击：位移 ' + Math.round(d3) + (d3 < 1 ? '  ✔ 未误平移' : '  ✘ 点击被当成拖动'));

    // WASD
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    setTimeout(function(){
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
      L('⑥ W 键 0.5s：cam.y ' + Math.round(b2.y) + ' → ' + Math.round(g.cam.y) + ' 位移 ' + Math.round(Math.abs(g.cam.y-b2.y)) + (Math.abs(g.cam.y-b2.y)>1?'  ✔':'  ✘'));
      // 殖民者
      var cols = g.colonists || [];
      var p0 = cols.map(function(c){ return { x: c.x, y: c.y }; });
      L('⑦ 殖民者数=' + cols.length);
      setTimeout(function(){
        var moved = 0, names = [];
        for (var i = 0; i < cols.length; i++) {
          if (Math.hypot(cols[i].x - p0[i].x, cols[i].y - p0[i].y) > 0.5) moved++;
          if (i < 4) names.push((cols[i].job || cols[i].task || '?') + ':' + Math.round(Math.hypot(cols[i].x - p0[i].x, cols[i].y - p0[i].y)));
        }
        L('   1.5s 内有位移的 ' + moved + '/' + cols.length + (moved ? '  ✔' : '  ✘ 全部站着不动'));
        L('   样本位移 ' + names.join(' '));
        L('   speed=' + g.speed + ' paused=' + JSON.stringify(g.pauseReasons || {}));
        done(JSON.stringify(window.__sfm));
      }, 1500);
    }, 500);
  }, 3600);
})
