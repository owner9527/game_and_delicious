(function () {
  // 诊断: 第 3 层卡在 room=2 dir=3, 逐帧看 checkDoor 的输入条件
  Tutorial.finish(true);
  const P = () => G.player;
  const god = () => { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; };
  const trace = [];
  function passDoor(dir) {
    const cy = ROOM_H / 2, cx = ROOM_W / 2;
    let tx, ty;
    if (dir === 0) { tx = ROOM_W - 42; ty = cy; }
    else if (dir === 1) { tx = 42; ty = cy; }
    else if (dir === 2) { tx = cx; ty = ROOM_H - 42; }
    else { tx = cx; ty = 42; }
    const from = G.cur.room.idx;
    P().x = tx; P().y = ty;
    const t = { from, dir, lockedAtStart: G.cur.locked, hasDoor: G.cur.room.doors[dir] != null, to: G.cur.room.doors[dir], frames: [] };
    for (let i = 0; i < 150 && G.cur.room.idx === from; i++) {
      G.update(1 / 60);
      if (i < 6 || (i % 40 === 0)) t.frames.push({ i, x: Math.round(P().x), y: Math.round(P().y), locked: G.cur.locked, idx: G.cur.room.idx, fade: +G.fade.toFixed(2), fadeDir: G.fadeDir, afterFade: !!G.afterFade });
    }
    t.endIdx = G.cur.room.idx;
    t.endLocked = G.cur.locked;
    trace.push(t);
    return G.cur.room.idx !== from;
  }
  function clearRoom() {
    for (const e of G.enemies) e.dead = true;
    G.cur.pending.length = 0;
    for (let i = 0; i < 3; i++) G.update(1 / 60);
    return { locked: G.cur.locked, enemies: G.enemies.length, pending: G.cur.pending.length, type: G.cur.room.type };
  }
  const out = { floors: [] };
  for (let f = 1; f <= 3; f++) {
    god();
    const rec = { floor: G.run.floor, steps: [] };
    let guard = 0;
    while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
      const st = G.nextStepTo(G.floorData.farIdx);
      if (!st) { rec.err = 'no path'; break; }
      let cl = null;
      if (G.cur.locked) cl = clearRoom();
      rec.steps.push({ room: G.cur.room.idx, type: G.cur.room.type, clear: cl });
      const ok = passDoor(st.dir);
      if (!ok) { rec.err = 'door fail room=' + G.cur.room.idx + ' dir=' + st.dir; break; }
      god();
    }
    rec.reachedFar = G.cur.room.idx === G.floorData.farIdx;
    rec.roomType = G.cur.room.type;
    out.floors.push(rec);
    if (!rec.reachedFar) break;
    // 清怪 + 按 E
    if (G.cur.locked) clearRoom();
    if (G.cur.exitPk) {
      P().x = G.cur.exitPk.x; P().y = G.cur.exitPk.y;
      const before = G.run.floor;
      G.detectInteract(); G.tryInteract();
      for (let i = 0; i < 400 && G.run.floor === before; i++) G.update(1 / 60);
      rec.floorChange = before + ' -> ' + G.run.floor;
    } else rec.err = (rec.err || '') + ' no exitPickup';
  }
  out.finalFloor = G.run.floor;
  out.trace = trace;
  return 'DIAG ' + JSON.stringify(out);
})()
