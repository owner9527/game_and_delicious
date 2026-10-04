window.__mod = { log: [] };
function L(m){ window.__mod.log.push(m); }
function chk(id, label){
  var el = document.getElementById(id);
  if(!el){ L(label + ': 元素不存在'); return; }
  var vis = getComputedStyle(el).display !== 'none';
  if(!vis){ L(label + ': 未显示'); return; }
  var box = el.querySelector('.modal-box') || el.firstElementChild;
  var r = box.getBoundingClientRect();
  L(label + ': 盒子 ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)
    + '  底部=' + Math.round(r.bottom) + ' 视口高=' + innerHeight + (r.bottom <= innerHeight + 1 ? '  ✔ 完整在屏内' : '  ✘ 超出屏幕'));
  // 找盒子内最后一个按钮，检查能否点到
  var btns = box.querySelectorAll('button');
  if(btns.length){
    var b = btns[btns.length-1], br = b.getBoundingClientRect();
    var cx = Math.round(br.left + br.width/2), cy = Math.round(br.top + br.height/2);
    var inView = cx>=0 && cy>=0 && cx<innerWidth && cy<innerHeight;
    var top = inView ? document.elementFromPoint(cx, cy) : null;
    L('   最后一个按钮 "' + b.textContent.trim().slice(0,12) + '" @' + cx + ',' + cy
      + ' 可点=' + (!!(top && (top===b || b.contains(top)))) + (inView ? '' : ' (在视口外)'));
  }
}

// 主菜单 → 难度选择弹窗
setTimeout(function(){ var b=document.querySelector('#btn-campaign'); if(b) b.click(); L('① 点星图长征'); }, 300);
setTimeout(function(){ chk('modal', '② 难度选择弹窗'); }, 1100);

new Promise(function(done){
  setTimeout(function(){
    // 关掉难度弹窗（点背景），确认能关
    var m = document.getElementById('modal');
    m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    L('③ 点背景关难度弹窗 → display=' + m.style.display);
    // 进沙盒看设置/说明弹窗
    done(JSON.stringify(window.__mod));
  }, 1700);
})
