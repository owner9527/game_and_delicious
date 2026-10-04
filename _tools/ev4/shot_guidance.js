(function () {
  // 场景 2: 无引导时的常规指路(目标门绿箭头 + 玩家旁方向箭头/文字 + HUD 目标行 + 小地图脉冲)
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
  Tutorial.finish(true);
  UI.showScreen(null);
  god();
  // 走到一个已清空、且目标门通向楼梯房的房间
  let guard = 0, shot = null;
  while (guard++ < 30) {
    const st = G.nextStepTo(G.floorData.farIdx);
    if (!st) break;
    if (G.cur.locked) clearRoom();
    const dirName = ['右侧', '左侧', '下方', '上方'][st.dir];
    if (!shot) {
      for (let i = 0; i < 60; i++) { god(); G.update(1 / 60); }
      P().x = ROOM_W / 2; P().y = ROOM_H / 2 + 40;
      G.input.mx = P().x + 100; G.input.my = P().y;
      UI.updateHUD();
      G.render();
      shot = {
        room: G.cur.room.idx, roomType: G.cur.room.type, targetDir: st.dir, dirName,
        goal: G.objectiveText(),
        hudObjText: document.getElementById('objtext').textContent,
        hudWarn: document.getElementById('objtext').classList.contains('warn'),
      };
      break;
    }
    if (!passDoor(st.dir)) break;
    god();
  }
  return JSON.stringify(shot);
})()
