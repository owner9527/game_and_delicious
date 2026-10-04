// 逐个场景驱动《余烬之城》：走 6 个剧情节点，记录每个节点的主题/SVG 长度/JS 报错
window.__g1 = { log: [], errs: [] };
window.addEventListener('error', function (e) { window.__g1.errs.push(String(e.message)); });

function snap(tag) {
  var art = document.querySelector('#art');
  var svg = art ? art.querySelector('svg') : null;
  var root = document.documentElement;
  var th = (root.className.match(/th-[a-z_]+/) || [''])[0] || (art && (art.className.match(/th-[a-z_]+/) || [''])[0]) || '-';
  window.__g1.log.push({
    tag: tag,
    theme: th,
    svgLen: svg ? svg.outerHTML.length : 0,
    shapes: svg ? svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,g').length : 0,
    dlg: (document.querySelector('#dlgText') || {}).textContent ? document.querySelector('#dlgText').textContent.slice(0, 22) : '',
    opts: document.querySelectorAll('#options .opt').length
  });
}

setTimeout(function () {
  var b = document.querySelector('#btnNew') || document.querySelector('.tbtn.main');
  if (b) b.click();
  window.__g1.startBtn = !!b;
}, 100);

var i = 0;
var timer = setInterval(function () {
  // 章节卡 → 点掉
  var card = document.querySelector('#chapCard');
  if (card && getComputedStyle(card).opacity > 0.5) card.click();
  // 剧情：点对话框继续
  var dlg = document.querySelector('#dialog');
  var opts = document.querySelectorAll('#options .opt');
  if (opts.length) {
    snap('node' + i);
    if (i % 2 === 0) opts[0].click(); else opts[Math.min(1, opts.length - 1)].click();
    i++;
  } else if (dlg && getComputedStyle(dlg).display !== 'none' && i < 8) {
    var box = document.querySelector('#dlgBox') || dlg;
    box.click();
  }
}, 420);

new Promise(function (res) {
  setTimeout(function () {
    clearInterval(timer);
    res(JSON.stringify({ startBtn: window.__g1.startBtn, nodes: window.__g1.log.length, log: window.__g1.log, errs: window.__g1.errs }));
  }, 7000);
})
