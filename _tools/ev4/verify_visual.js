(function () {
  // 用像素采样客观验证: 绿色目标箭头 / 楼梯入口光圈 / 封印红色提示 / 小地图脉冲
  Tutorial.finish(true);
  const P = () => G.player;
  const god = () => { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; };
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const SC = cvs.width / ROOM_W;
  const noFade = () => { G.fade = 0; G.fadeDir = 0; G.afterFade = null; };

  // 绿色系(包含接近白的浅绿箭头 #d6ffe4 与绿光晕): 绿通道占优且不是蓝灰色地面
  const isGreen = (r, g, b) => g > 90 && g - b > 6 && g >= r - 12;
  const isRed = (r, g, b) => r > 110 && r - g > 30;
  function sample(x, y, w, h, pred) {
    const sx = Math.max(0, Math.round(x * SC)), sy = Math.max(0, Math.round(y * SC));
    const sw = Math.min(cvs.width - sx, Math.round(w * SC)), sh = Math.min(cvs.height - sy, Math.round(h * SC));
    if (sw <= 0 || sh <= 0) return 0;
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (pred(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }
  function count(x, y, w, h) { return { green: sample(x, y, w, h, isGreen), red: sample(x, y, w, h, isRed) }; }
  const doorBox = dir => dir === 0 ? [ROOM_W - 140, ROOM_H / 2 - 100, 140, 200]
    : dir === 1 ? [0, ROOM_H / 2 - 100, 140, 200]
    : dir === 2 ? [ROOM_W / 2 - 100, ROOM_H - 140, 200, 140]
    : [ROOM_W / 2 - 100, 0, 200, 140];

  function clearRoom() {
    for (const e of G.enemies) e.dead = true;
    G.cur.pending.length = 0;
    for (let i = 0; i < 3; i++) G.update(1 / 60);
  }
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

  const out = {};
  // ================= A) 目标门的绿色箭头: 锁住房 vs 清完怪 =================
  god();
  let guard = 0, doorAB = null;
  while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
    const st = G.nextStepTo(G.floorData.farIdx);
    if (!st) break;
    const [bx, by, bw, bh] = doorBox(st.dir);
    if (G.cur.locked && !doorAB) {
      P().x = 120; P().y = 780;                 // 玩家挪开, 采样只反映环境
      noFade(); G.render();
      const before = count(bx, by, bw, bh);
      const txtBefore = G.objectiveText();
      const warnBefore = document.getElementById('objtext').classList.contains('warn');
      clearRoom();
      P().x = 120; P().y = 780;
      noFade(); G.render();
      const after = count(bx, by, bw, bh);
      doorAB = {
        room: G.cur.room.idx, type: G.cur.room.type, dir: st.dir,
        doorBox: { x: bx, y: by, w: bw, h: bh },
        locked_greenPx: before.green, locked_redPx: before.red,
        unlocked_greenPx: after.green, unlocked_redPx: after.red,
        objectiveText_locked: txtBefore, objectiveText_unlocked: G.objectiveText(),
        hudWarnClass_locked: warnBefore, hudWarnClass_unlocked: document.getElementById('objtext').classList.contains('warn'),
      };
    } else if (G.cur.locked) clearRoom();
    if (!passDoor(st.dir)) break;
    god();
  }
  out.targetDoorArrow = doorAB;

  // ================= B) 楼梯房入口: 封印 vs 开启 =================
  const pk = G.cur.exitPk;
  out.stairsRoom = {
    roomType: G.cur.room.type,
    exitPickupExists: !!pk,
    portalDecoration: G.portal ? { x: Math.round(G.portal.x), y: Math.round(G.portal.y) } : null,
    exitPickupPos: pk ? { x: Math.round(pk.x), y: Math.round(pk.y) } : null,
    pickupSitsExactlyOnPortalGlow: !!(pk && G.portal && Math.abs(pk.x - G.portal.x) < 0.01 && Math.abs(pk.y - G.portal.y) < 0.01),
  };
  const box = [pk.x - 95, pk.y - 115, 190, 230];
  G.cur.locked = true;
  P().x = 120; P().y = 780;
  noFade(); G.render();
  Object.assign(out.stairsRoom, { locked: count.apply(null, box) });
  P().x = pk.x; P().y = pk.y; G.detectInteract();
  out.stairsRoom.locked_prompt = G.interactTarget ? G.interactTarget.label : null;
  out.stairsRoom.locked_blockedFlag = G.interactTarget ? !!G.interactTarget.blocked : null;
  out.stairsRoom.locked_hud = document.getElementById('objtext').textContent;
  clearRoom();
  P().x = 120; P().y = 780;
  noFade(); G.render();
  out.stairsRoom.unlocked = count.apply(null, box);
  delete out.stairsRoom.locked; delete out.stairsRoom.unlocked;   // 展开成独立字段
  noFade(); G.render();
  const L = count.apply(null, box);
  out.stairsRoom.sampleBox = box;
  P().x = pk.x; P().y = pk.y; G.detectInteract();
  out.stairsRoom.unlocked_prompt = G.interactTarget ? G.interactTarget.label : null;
  out.stairsRoom.unlocked_blockedFlag = G.interactTarget ? !!G.interactTarget.blocked : null;
  out.stairsRoom.goalText = G.objectiveText();
  out.stairsRoom.hud = document.getElementById('objtext').textContent;
  out.stairsRoom.hudWarn = document.getElementById('objtext').classList.contains('warn');

  // 重新做一次"锁 → 解锁"的像素对比(顺序执行, 结果互不污染)
  G.cur.locked = true; G.render();
  const locked2 = count.apply(null, box);
  G.cur.locked = false; G.render();
  const unlocked2 = count.apply(null, box);
  delete out.stairsRoom.locked_greenPx; delete out.stairsRoom.locked_redPx;
  out.stairsRoom.pixelAB = {
    sampleBox: box,
    locked_greenPx: locked2.green, locked_redPx: locked2.red,
    unlocked_greenPx: unlocked2.green, unlocked_redPx: unlocked2.red,
    greenDelta_pct: +(((unlocked2.green - locked2.green) / Math.max(1, locked2.green)) * 100).toFixed(1),
  };

  // ================= C) 小地图目标脉冲 =================
  const mm = document.getElementById('minimap');
  const mctx = mm.getContext('2d');
  const mmGreen = () => {
    const d = mctx.getImageData(0, 0, 220, 160).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 110 && d[i + 1] > d[i] + 20) n++;
    return n;
  };
  G.floorData.rooms.forEach(r => { r.visited = false; });
  G.cur.room.visited = true;
  UI.drawMinimap();
  const known = mmGreen();
  G.floorData.rooms.forEach(r => { r.visited = false; });
  UI.drawMinimap();
  const unknown = mmGreen();
  out.minimapObjectivePulse = { objectiveKnown_greenPx: known, objectiveUnknown_greenPx: unknown, delta: known - unknown };

  return 'VISUAL ' + JSON.stringify(out);
})()
