JSON.stringify((function () {
  var out = {};
  // 05 用 #guideLayer，07 用 #tutorial-layer
  var cands = ['guideLayer', 'tutorial-layer'];
  cands.forEach(function (id) {
    var e = document.getElementById(id);
    if (!e) return;
    var cs = getComputedStyle(e);
    out[id] = { display: cs.display, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05, pe: cs.pointerEvents, z: cs.zIndex };
  });
  // 引导卡片/步骤文字
  var t = document.querySelector('#tut-card, #gCard, .tut-card, .gCard');
  if (t) out.cardText = (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  // 跳过按钮
  var sk = document.querySelector('#tut-skip, #gSkip, [id*=skip]');
  out.hasSkip = !!sk;
  // 两个存档键
  out.keys = {};
  ['tactics_auto_chess_guide_v1', 'mirror_maze_tut_v1', 'mirror_maze_tut_beam_v1'].forEach(function (k) {
    try { out.keys[k] = localStorage.getItem(k); } catch (e) { out.keys[k] = 'ERR'; }
  });
  return out;
})())
