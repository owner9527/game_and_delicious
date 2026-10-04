window.__gc = {};
var out = {};
function safe(name, fn){ try { out[name] = fn(); } catch(e){ out[name] = 'ERR: ' + e.message; } }

safe('win', function(){ return innerWidth + 'x' + innerHeight; });
safe('htmlScrollH', function(){ return document.documentElement.scrollHeight; });
safe('bodyScrollH', function(){ return document.body.scrollHeight; });
safe('needsScroll', function(){ return document.documentElement.scrollHeight > innerHeight + 2; });
safe('htmlOverflow', function(){ return getComputedStyle(document.documentElement).overflow; });
safe('bodyOverflow', function(){ return getComputedStyle(document.body).overflow; });
safe('bodyOverflowX', function(){ return getComputedStyle(document.body).overflowX; });
safe('bodyOverflowY', function(){ return getComputedStyle(document.body).overflowY; });
safe('bodyDisplay', function(){ return getComputedStyle(document.body).display; });
safe('bodyAlignItems', function(){ return getComputedStyle(document.body).alignItems; });
safe('bodyMinHeight', function(){ return getComputedStyle(document.body).minHeight; });
safe('bodyPosition', function(){ return getComputedStyle(document.body).position; });

safe('scrollWindow', function(){
  var b0 = window.pageYOffset;
  window.scrollTo(0, 400);
  var a0 = window.pageYOffset;
  window.scrollTo(0, b0);
  return 'from ' + b0 + ' to ' + a0 + ' => ' + (a0 > b0 ? '可滚动' : '滚不动!');
});
safe('scrollBody', function(){
  var b0 = document.body.scrollTop;
  document.body.scrollTop = 300;
  var a0 = document.body.scrollTop;
  document.body.scrollTop = b0;
  return 'from ' + b0 + ' to ' + a0;
});
safe('scrollDoc', function(){
  var b0 = document.documentElement.scrollTop;
  document.documentElement.scrollTop = 300;
  var a0 = document.documentElement.scrollTop;
  document.documentElement.scrollTop = b0;
  return 'from ' + b0 + ' to ' + a0;
});
safe('touchAction', function(){ return getComputedStyle(document.body).touchAction + ' / html=' + getComputedStyle(document.documentElement).touchAction; });
safe('cards', function(){ return document.querySelectorAll('a.game').length; });
safe('firstCardRect', function(){
  var r = document.querySelectorAll('a.game')[0].getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
});
safe('lastCardRect', function(){
  var cs = document.querySelectorAll('a.game');
  var r = cs[cs.length-1].getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
});
safe('fixedFullScreenLayers', function(){
  var res = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i], s = getComputedStyle(e);
    if (s.position !== 'fixed') continue;
    if (s.display === 'none' || parseFloat(s.opacity) < 0.01) continue;
    var r = e.getBoundingClientRect();
    if (r.width >= innerWidth - 2 && r.height >= innerHeight - 2) {
      res.push(e.tagName + '.' + String(e.className).slice(0,24) + ' pe=' + s.pointerEvents + ' z=' + s.zIndex);
    }
  }
  return res;
});
safe('elementAtCenter', function(){
  var e = document.elementFromPoint(Math.round(innerWidth/2), Math.round(innerHeight/2));
  return e ? (e.tagName + '.' + String(e.className).slice(0,30)) : 'null';
});
JSON.stringify(out);
