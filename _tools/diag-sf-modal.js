window.__sfm2 = { log: [] };
function L(m){ window.__sfm2.log.push(m); }

setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('没进对局'); done(JSON.stringify(window.__sfm2)); return; }
    var help = document.getElementById('help-modal');
    var cs = getComputedStyle(help);
    var r = help.getBoundingClientRect();
    L('说明弹窗 inline display="' + help.style.display + '"');
    L('  computed: display=' + cs.display + ' position=' + cs.position + ' z-index=' + cs.zIndex +
      ' opacity=' + cs.opacity + ' visibility=' + cs.visibility + ' pointer-events=' + cs.pointerEvents);
    L('  尺寸: ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    L('  视口内=' + (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth));

    var btn = help.querySelector('[data-close="help-modal"]');
    if (btn) {
      var br = btn.getBoundingClientRect();
      var cx = Math.round(br.left + br.width / 2), cy = Math.round(br.top + br.height / 2);
      L('  "开始拓荒"按钮 rect=' + Math.round(br.left) + ',' + Math.round(br.top) + ' ' + Math.round(br.width) + 'x' + Math.round(br.height));
      var top = (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
      L('  该点最上层元素=' + (top ? (top.tagName + '#' + (top.id || '') + '.' + String(top.className).slice(0,26)) : 'null(点在视口外)'));
      L('  能点到按钮=' + !!(top && (top === btn || btn.contains(top) || btn === top)));
      L('  按钮在视口内=' + (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight));
    } else { L('  ✘ 没找到关闭按钮'); }

    // 主题/设置等其他弹窗是否也开着
    ['settings-modal','help-modal'].forEach(function(id){
      var e = document.getElementById(id);
      if (e) L('  ' + id + ' display=' + e.style.display + ' computed=' + getComputedStyle(e).display);
    });
    L('暂停原因=' + JSON.stringify(g.pauseReasons) + ' speed=' + g.speed);
    done(JSON.stringify(window.__sfm2));
  }, 3600);
})
