(function () {
  // 场景 1: 局内新手引导第 ⑥ 步(下一层入口) —— 高亮套在楼梯入口上
  const P = () => G.player;
  const god = () => { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; };
  const clearRoom = () => { for (const e of G.enemies) e.dead = true; G.cur.pending.length = 0; for (let i = 0; i < 3; i++) G.update(1 / 60); };
  function passDoor(dir) {
    const cy = ROOM_H / 2, cx = ROOM_W / 2;
    let tx, ty;
    if (dir === 0) { tx = ROOM_W - 42; ty = cy; }
    else if (dir === 1) { tx = 42; ty = cy; }
    else if (dir === 2) { tx = cx; ty = ROOM_H - 42; }
    else { tx = cx; ty = 42; }
    const from = G.cur.room.idx;
    P().x = tx; P().y = ty;
    for (let i = 0; i < 200 && G.cur.room.idx === from; i++) G.update(1 / 60);
    return G.cur.room.idx !== from;
  }
  G.input.keys = {}; G.input.fire = false;
  Tutorial.finish(true);          // 先关掉, 免得它推进
  god();
  let guard = 0;
  while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
    const st = G.nextStepTo(G.floorData.farIdx);
    if (!st) break;
    if (G.cur.locked) clearRoom();
    if (!passDoor(st.dir)) break;
    god();
  }
  if (G.cur.locked) clearRoom();
  // 让淡入结束(画面正常亮度)
  for (let i = 0; i < 60; i++) { god(); G.update(1 / 60); }
  // 玩家站在光圈旁边
  const pk = G.cur.exitPk;
  P().x = pk.x - 70; P().y = pk.y + 40;
  G.input.mx = pk.x; G.input.my = pk.y;
  G.detectInteract();
  // 打开局内引导并停在"下一层入口"这一步
  Tutorial.start('play');
  Tutorial.i = 6;
  if (G.tutorial) G.tutorial.step = 6;
  Tutorial.render();
  Tutorial.place();
  for (let i = 0; i < 4; i++) { god(); G.update(1 / 60); }
  G.render();
  return JSON.stringify({
    floor: G.run.floor, roomType: G.cur.room.type, locked: G.cur.locked,
    tutorialStep: Tutorial.i, tutorialTitle: document.getElementById('tut-title').textContent,
    spotDisplay: document.getElementById('tut-spot').style.display,
    spotLeft: document.getElementById('tut-spot').style.left, spotTop: document.getElementById('tut-spot').style.top,
    arrowDisplay: document.getElementById('tut-arrow').style.display,
    exitPos: { x: Math.round(pk.x), y: Math.round(pk.y) },
    goal: G.objectiveText(),
  });
})()
