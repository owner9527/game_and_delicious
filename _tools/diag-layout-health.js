// 通用布局体检：找出跑出视口 / 被裁掉的可见元素（游戏 9 那种"定位被覆盖导致布局散掉"会在这里暴露）
(function () {
  var W = innerWidth, H = innerHeight;
  var skip = { HTML: 1, BODY: 1, HEAD: 1, SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, TITLE: 1 };
  var out = [];
  var all = document.querySelectorAll('#game *, #app *, #stage *, body > div > *');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (skip[e.tagName]) continue;
    var cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    if (cs.position === 'fixed' && e.offsetWidth >= W - 2 && e.offsetHeight >= H - 2) continue; // 全屏遮罩层
    var r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // 只关心"自己带定位"的 HUD 元素，避免把页面主内容流算进来
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
    var over = [];
    if (r.right > W + 4) over.push('右超出 ' + Math.round(r.right - W));
    if (r.bottom > H + 4) over.push('下超出 ' + Math.round(r.bottom - H));
    if (r.left < -4) over.push('左超出 ' + Math.round(-r.left));
    if (r.top < -4) over.push('上超出 ' + Math.round(-r.top));
    if (!over.length) continue;
    var anchor = (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    out.push({ el: e.tagName + anchor, pos: cs.position, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], over: over.join(',') });
  }
  // 去重（同一元素可能被多次匹配）
  var seen = {}, uniq = [];
  out.forEach(function (o) { var k = o.el + o.rect.join(','); if (!seen[k]) { seen[k] = 1; uniq.push(o); } });
  return JSON.stringify({ win: W + 'x' + H, count: uniq.length, list: uniq.slice(0, 12) });
})()
