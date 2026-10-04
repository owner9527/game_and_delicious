window.__esc = { log: [] };
function L(m){ window.__esc.log.push(m); }
function helpOpen(){ var e=document.getElementById('help-modal'); return e.style.display !== 'none'; }
function paused(){ var g=SF.ui.game; return g ? (g.speed===0 || Object.keys(g.pauseReasons).length>0) : null; }

setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);

new Promise(function(done){
  setTimeout(function(){
    var g = SF.ui.game;
    if(!g){ L('没进对局'); done(JSON.stringify(window.__esc)); return; }
    var help = document.getElementById('help-modal');
    L('① 首次进入：说明弹窗=' + helpOpen() + '  暂停=' + paused());

    // 方式 1：按钮
    var btn = help.querySelector('[data-close="help-modal"]');
    btn.click();
    L('② 点按钮关闭 → 弹窗=' + helpOpen() + '  暂停=' + paused());

    // 方式 2：Esc
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    L('③ 按 H 重新打开 → 弹窗=' + helpOpen() + '  暂停=' + paused());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    L('④ 按 Esc 关闭 → 弹窗=' + helpOpen() + '  暂停=' + paused());

    // 方式 3：点背景
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    L('⑤ 再按 H 打开 → 弹窗=' + helpOpen() + '  暂停=' + paused());
    help.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    L('⑥ 点背景关闭 → 弹窗=' + helpOpen() + '  暂停=' + paused());

    // 设置弹窗也要能关
    var sb = document.getElementById('btn-ingame-settings');
    if (sb) { sb.click(); L('⑦ 打开设置 → 弹窗=' + (document.getElementById('settings-modal').style.display !== 'none') + ' 暂停=' + paused()); }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    L('⑧ Esc 关设置 → 弹窗=' + (document.getElementById('settings-modal').style.display !== 'none') + ' 暂停=' + paused());

    // 最后确认能真的动起来
    var cols = g.colonists || [];
    var p0 = cols.map(function(c){ return { x: c.x, y: c.y }; });
    setTimeout(function(){
      var moved = 0;
      for (var i = 0; i < cols.length; i++) if (Math.hypot(cols[i].x - p0[i].x, cols[i].y - p0[i].y) > 0.5) moved++;
      L('⑨ 殖民者 ' + moved + '/' + cols.length + ' 在动' + (moved ? '  ✔' : '  ✘'));
      done(JSON.stringify(window.__esc));
    }, 1500);
  }, 3600);
})
