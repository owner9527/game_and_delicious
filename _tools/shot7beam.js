(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  // 先跳过核心引导，再进第二章第 4 关（镜面折光）→ 机关引导自动出现
  localStorage.setItem('mirror_maze_tut_v1', '1');
  $('btn-chapters').click(); await s(400);
  document.querySelectorAll('#chapter-list .chapter-card')[1].click(); await s(400);
  document.querySelectorAll('#level-grid .level-cell')[3].click(); await s(1200);
  return MMTutorial.which + ' ' + $('tut-step').textContent;
})()
