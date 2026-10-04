// 打开建造面板并停在那里，用于截图
setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);
new Promise(function(done){
  setTimeout(function(){
    UI.togglePanel('build');
    var r=document.getElementById('buildPanel').getBoundingClientRect();
    done(JSON.stringify({panel:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
      techHidden:document.getElementById('techPanel').classList.contains('hidden')}));
  }, 1600);
})
