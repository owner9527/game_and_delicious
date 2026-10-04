(function () {
  // 边界: 已清空房间不重新刷怪 / 领主房出口不会消失 / 重复按 E 不会跳层
  Tutorial.finish(true);
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
  const out = {};
  god();

  // ---- A) 已清空房间回头不再刷怪、门保持开启 ----
  (function () {
    const fd = G.floorData;
    // 找一个战斗房
    let target = -1;
    for (const r of fd.rooms) if (r.type === 'combat') { target = r.idx; break; }
    if (target < 0) { out.clearedRoomNoRespawn = { skipped: '本层无战斗房' }; return; }
    // 直接用 enterRoom 模拟"走过去"
    G.enterRoom(target, -1);
    const lockedOnEntry = G.cur.locked, enemies = G.enemies.length;
    clearRoom();
    const afterClear = { locked: G.cur.locked, cleared: G.cur.room.cleared };
    // 回起点房, 再进来一次
    G.enterRoom(fd.startIdx, -1);
    G.enterRoom(target, -1);
    out.clearedRoomNoRespawn = {
      room: target, lockedOnEntry, enemiesOnFirstEntry: enemies,
      afterClear, lockedOnReentry: G.cur.locked, enemiesOnReentry: G.enemies.length,
      clearedFlagKept: !!G.cur.room.cleared,
    };
  })();

  // ---- B) 领主层: 击杀领主 → 出口生成 → 出去再回来出口仍在 → 按 E 到下一层 ----
  G.startFloor(5);
  god();
  (function () {
    const fd = G.floorData;
    out.bossFloor = { floor: G.run.floor, bossFloor: fd.bossFloor, farType: fd.rooms[fd.farIdx].type };
    G.enterRoom(fd.farIdx, -1);
    const boss = G.enemies.find(e => e.boss);
    out.bossFloor.bossFound = !!boss;
    // 等 boss 出生保护(spawnT)结束, 否则 hitEnemy 会被 spawnT>0 挡掉
    for (let i = 0; i < 90; i++) { god(); G.update(1 / 60); }
    out.bossFloor.bossSpawnT = +boss.spawnT.toFixed(3);
    // 秒掉领主(走真实 killEnemy → onBossDeath 流程)
    G.hitEnemy(boss, boss.maxHp * 10, { noCrit: true });
    G.update(1 / 60);
    const portal = G.pickups.find(p => p.type === 'next');
    out.bossFloor.portalAfterKill = portal ? { x: Math.round(portal.x), y: Math.round(portal.y), portal: !!portal.portal } : null;
    out.bossFloor.exitPosRecorded = !!(G.cur.room.exitPos);
    out.bossFloor.lockedAfterKill = G.cur.locked;
    out.bossFloor.promptOnPortal = (function () {
      if (!portal) return null;
      P().x = portal.x; P().y = portal.y; G.detectInteract();
      return G.interactTarget ? G.interactTarget.label : null;
    })();
    // 出房间再回来 → 出口必须还在(否则永久卡死)
    G.enterRoom(fd.startIdx, -1);
    G.enterRoom(fd.farIdx, -1);
    const portal2 = G.pickups.find(p => p.type === 'next');
    out.bossFloor.portalAfterReentry = portal2 ? { x: Math.round(portal2.x), y: Math.round(portal2.y) } : null;
    out.bossFloor.enemiesAfterReentry = G.enemies.length;
    out.bossFloor.lockedAfterReentry = G.cur.locked;
    // 退出时存档里的 cleared 也应该带上领主房
    const clearedList = G.floorData.rooms.map((r, i) => r.cleared ? i : -1).filter(i => i >= 0);
    out.bossFloor.clearedRooms = clearedList;
  })();

  // ---- C) 连续两次 nextFloor 不应该跳层 ----
  (function () {
    const fd = G.floorData;
    const portal = G.pickups.find(p => p.type === 'next');
    if (!portal) { out.noDoubleAdvance = { skipped: 'no portal' }; return; }
    P().x = portal.x; P().y = portal.y;
    G.detectInteract();
    const f0 = G.run.floor;
    G.tryInteract();                       // 第一次
    G.tryInteract();                       // 淡出期间再按一次(旧代码会连跳两层)
    G.tryInteract();
    for (let i = 0; i < 400 && G.run.floor === f0; i++) G.update(1 / 60);
    out.noDoubleAdvance = { from: f0, to: G.run.floor, delta: G.run.floor - f0, expectDelta: 1 };
  })();

  return 'EDGE ' + JSON.stringify(out);
})()
