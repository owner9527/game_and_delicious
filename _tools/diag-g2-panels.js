// 检查建造/科技/详情三个面板的显示与重叠情况
window.__ov = { log: [] };
function L(m){ window.__ov.log.push(m); }
function state(tag){
  var ids=['buildPanel','techPanel','infoPanel'];
  var vis=ids.filter(function(id){ return !document.getElementById(id).classList.contains('hidden'); });
  var rects={};
  ids.forEach(function(id){ var r=document.getElementById(id).getBoundingClientRect(); rects[id]=[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]; });
  // 两两求交叠面积
  var ov=[];
  for(var i=0;i<vis.length;i++) for(var j=i+1;j<vis.length;j++){
    var a=document.getElementById(vis[i]).getBoundingClientRect(), b=document.getElementById(vis[j]).getBoundingClientRect();
    var w=Math.min(a.right,b.right)-Math.max(a.left,b.left), h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(w>0&&h>0) ov.push(vis[i]+'×'+vis[j]+' 重叠 '+Math.round(w)+'×'+Math.round(h));
  }
  L(tag+' → 可见=['+vis.join(',')+']'+(ov.length?('  ⚠ '+ov.join('; ')):'  (无重叠)'));
  L('       尺寸 build='+rects.buildPanel.join('x').replace(/x/g,',')+' tech='+rects.techPanel.join(','));
}

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
  setTimeout(function(){
    state('① 初始');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    state('② 按 B(建造)');
    L('   buildPanelOpen='+UI.buildPanelOpen+' techPanelOpen='+UI.techPanelOpen);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));
    state('③ 按 T(科技)');
    L('   buildPanelOpen='+UI.buildPanelOpen+' techPanelOpen='+UI.techPanelOpen);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));
    state('④ 再按 T(应关闭)');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    state('⑤ 按 B(建造)');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    state('⑥ 再按 B(应关闭)');
    // 详情面板与建造面板同时
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    UI.els.infoPanel.classList.remove('hidden');
    state('⑦ 建造面板 + 详情面板');
    done(JSON.stringify(window.__ov));
  }, 1600);
})
