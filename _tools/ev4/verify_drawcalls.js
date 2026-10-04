(function () {
  // 通过 Canvas 绘制调用探针, 客观证明"目标门上的绿色箭头"确实被画出来了,
  // 并且只在门开启(未上锁)时画。
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

  // ---- 绘制探针: 记录每次 fill() 时的平移量 ----
  const proto = CanvasRenderingContext2D.prototype;
  const origFill = proto.fill;
  let spy = null;
  function arm() { spy = []; }
  function disarm() { spy = null; }
  proto.fill = function () {
    if (spy && this.canvas && this.canvas.id === 'game') {
      try { const m = this.getTransform(); spy.push([Math.round(m.e), Math.round(m.f)]); } catch (e) {}
    }
    return origFill.apply(this, arguments);
  };

  const doorBox = dir => dir === 0 ? [ROOM_W - 150, ROOM_H / 2 - 110, 150, 220]
    : dir === 1 ? [0, ROOM_H / 2 - 110, 150, 220]
    : dir === 2 ? [ROOM_W / 2 - 110, ROOM_H - 150, 220, 150]
    : [ROOM_W / 2 - 110, 0, 220, 150];
  const hits = (list, box) => list.filter(p => p[0] >= box[0] && p[0] <= box[0] + box[2] && p[1] >= box[1] && p[1] <= box[1] + box[3]).length;

  const out = {};
  god();
  let guard = 0, res = null;
  while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
    const st = G.nextStepTo(G.floorData.farIdx);
    if (!st) break;
    if (G.cur.locked && !res) {
      const box = doorBox(st.dir);
      P().x = 120; P().y = 780;
      // 锁定状态渲染
      noFade(); arm(); G.render(); const arrL = spy; disarm();
      const lockedFills = hits(arrL, box);
      clearRoom();
      P().x = 120; P().y = 780;
      noFade(); arm(); G.render(); const arrU = spy; disarm();
      const openFills = hits(arrU, box);
      res = {
        room: G.cur.room.idx, roomType: G.cur.room.type, targetDir: st.dir, doorBox: box,
        fillsInsideDoor_locked: lockedFills, fillsInsideDoor_unlocked: openFills,
        arrowDrawnOnlyWhenUnlocked: openFills > lockedFills,
      };
    } else if (G.cur.locked) clearRoom();
    if (!passDoor(st.dir)) break;
    god();
  }
  out.targetDoorArrowDrawCalls = res;

  // ---- 入口光圈/文字的绘制调用(楼梯房) ----
  const pk = G.cur.exitPk;
  const ebox = [pk.x - 130, pk.y - 130, 260, 260];
  G.cur.locked = true; P().x = 120; P().y = 780;
  noFade(); arm(); G.render(); const arrL2 = spy; disarm();
  const lockFills = hits(arrL2, ebox);
  clearRoom();
  noFade(); arm(); G.render(); const arrU2 = spy; disarm();
  const openFills = hits(arrU2, ebox);
  out.stairsExitGuidanceDrawCalls = {
    sampleBox: ebox, exitPos: { x: Math.round(pk.x), y: Math.round(pk.y) },
    fills_locked: lockFills, fills_unlocked: openFills,
  };
  proto.fill = origFill;
  return 'DRAWSPY ' + JSON.stringify(out);
})()
