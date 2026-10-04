(function () {
  // 目标门指引的像素级 A/B: 锁住房(灰色/无箭头) vs 清完怪(门洞绿色箭头 + 方向文字)
  Tutorial.finish(true);
  const P = () => G.player;
  const god = () => { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; };
  const noFade = () => { G.fade = 0; G.fadeDir = 0; G.afterFade = null; };
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
    for (let i = 0; i < 150 && G.cur.room.idx === from; i++) G.update(1 / 60);
    return G.cur.room.idx !== from;
  }
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const SC = cvs.width / ROOM_W;
  const isGreen = (r, g, b) => g > 60 && g - b > 8;
  function stat(x, y, w, h) {
    const sx = Math.max(0, Math.min(cvs.width - 1, Math.round(x * SC)));
    const sy = Math.max(0, Math.min(cvs.height - 1, Math.round(y * SC)));
    const sw = Math.max(1, Math.min(cvs.width - sx, Math.round(w * SC)));
    const sh = Math.max(1, Math.min(cvs.height - sy, Math.round(h * SC)));
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    let green = 0, maxGb = -999, best = null;
    for (let i = 0; i < d.length; i += 4) {
      if (isGreen(d[i], d[i + 1], d[i + 2])) green++;
      const gb = d[i + 1] - d[i + 2];
      if (gb > maxGb) { maxGb = gb; best = [d[i], d[i + 1], d[i + 2]]; }
    }
    return { greenPx: green, maxGreenMinusBlue: maxGb, greenestPixel: best, box: { sx, sy, sw, sh } };
  }
  // 新的门箭头画在门洞内缘: 上/下 (W/2, 13|H-13), 左/右 (13|W-13, H/2)
  const doorWin = dir => dir === 0 ? [ROOM_W - 60, ROOM_H / 2 - 45, 60, 90]
    : dir === 1 ? [0, ROOM_H / 2 - 45, 60, 90]
    : dir === 2 ? [ROOM_W / 2 - 45, ROOM_H - 60, 90, 60]
    : [ROOM_W / 2 - 45, 0, 90, 60];
  // 玩家身边的方向箭头区域(以玩家为中心)
  const playerWin = () => [P().x - 90, P().y - 90, 180, 180];

  const out = {};
  god();
  let guard = 0;
  while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
    const st = G.nextStepTo(G.floorData.farIdx);
    if (!st) break;
    if (G.cur.locked && !out.doorAB) {
      const dw = doorWin(st.dir);
      P().x = 640; P().y = 416;              // 玩家在中间, 远离门区域
      noFade(); G.render();
      const lockedDoor = stat.apply(null, dw);
      const lockedPlayer = stat.apply(null, playerWin());
      const lockedTxt = G.objectiveText();
      clearRoom();
      P().x = 640; P().y = 416;
      noFade(); G.render();
      const openDoor = stat.apply(null, dw);
      const openPlayer = stat.apply(null, playerWin());
      out.doorAB = {
        room: G.cur.room.idx, roomType: G.cur.room.type, targetDir: st.dir,
        doorWindow: dw,
        locked: { door: lockedDoor, aroundPlayer: lockedPlayer, objectiveText: lockedTxt },
        unlocked: { door: openDoor, aroundPlayer: openPlayer, objectiveText: G.objectiveText() },
        doorGreenDelta: openDoor.greenPx - lockedDoor.greenPx,
        playerArrowGreenDelta: openPlayer.greenPx - lockedPlayer.greenPx,
      };
    } else if (G.cur.locked) clearRoom();
    if (!passDoor(st.dir)) break;
    god();
  }
  return 'PIXDUMP ' + JSON.stringify(out);
})()
