// 量一量各个界面元素的实际位置与两两重叠
window.__lay = { log: [] };
function L(m){ window.__lay.log.push(m); }
function R(id){ var e=document.getElementById(id); if(!e) return null; var r=e.getBoundingClientRect(); return { id:id, x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), r:Math.round(r.right), b:Math.round(r.bottom), vis:!e.classList.contains('hidden') && r.width>0 }; }
function ov(a,b){
  if(!a||!b||!a.vis||!b.vis) return null;
  var w=Math.min(a.r,b.r)-Math.max(a.x,b.x), h=Math.min(a.b,b.b)-Math.max(a.y,b.y);
  return (w>0&&h>0) ? (Math.round(w)+'×'+Math.round(h)) : null;
}
function report(tag, ids){
  var els = ids.map(R).filter(function(e){return e&&e.vis;});
  L(tag);
  els.forEach(function(e){ L('   '+e.id.padEnd(11)+' x '+String(e.x).padStart(4)+'..'+String(e.r).padStart(4)+'   y '+String(e.y).padStart(4)+'..'+String(e.b).padStart(4)); });
  var hits=[];
  for(var i=0;i<els.length;i++) for(var j=i+1;j<els.length;j++){
    var o=ov(els[i],els[j]); if(o) hits.push(els[i].id+'×'+els[j].id+'='+o);
  }
  L('   重叠: '+(hits.length?hits.join('  '):'无 ✔'));
}

setTimeout(function(){ var b=document.querySelector('#btnNew'); if(b) b.click(); }, 120);
setTimeout(function(){ var c=document.querySelector('#helpClose'); if(c) c.click(); }, 900);

new Promise(function(done){
  setTimeout(function(){
    var ids=['buildPanel','techPanel','infoPanel','miniWrap','log','hudTop','banner','buildMenu'];
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true}));
    report('【按 B：建造面板】', ids);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));
    report('【按 T：科技面板】', ids);
    done(JSON.stringify(window.__lay));
  }, 1600);
})
