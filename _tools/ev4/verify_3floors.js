(function () {
  const out = { floors: [], log: [] };
  // 关掉引导(顺带验证"跳过"路径), 以免它的强制暂停影响下面直接调用 G.update 的测试
  out.tutorialAutoStarted = !!(G.tutorial && G.tutorial.active);
  Tutorial.finish(true);
  out.tutorialStopped = !(G.tutorial && G.tutorial.active);

  const P = () => G.player;
  const step = n => { for (let i = 0; i < n; i++) G.update(1 / 60); };
  // 测试脚本内部无敌(不改游戏文件里的任何数值)
  const god = () => { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; };

  // 用游戏自己的规则清空房间(标记死亡 → update 里 roomCleared 解锁门)
  function clearRoom() {
    for (const e of G.enemies) e.dead = true;
    G.cur.pending.length = 0;
    step(3);
    return !G.cur.locked;
  }

  // 走门: 把玩家放到 checkDoor 的触发点, 再跑真实 update 让门传送触发
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

  for (let f = 1; f <= 3; f++) {
    const rec = { floor: G.run.floor, ok: false };
    god();
    // 一层一层走: 从起点房沿 BFS 最短路径走到楼梯房, 每步穿一扇门
    let guard = 0;
    while (G.cur.room.idx !== G.floorData.farIdx && guard++ < 30) {
      const st = G.nextStepTo(G.floorData.farIdx);
      if (!st) { rec.err = 'BFS 找不到通往楼梯房的路径'; break; }
      if (G.cur.locked) { rec.clearedRooms = (rec.clearedRooms || 0) + 1; clearRoom(); }
      const ok = passDoor(st.dir);
      rec.doorSteps = (rec.doorSteps || 0) + 1;
      if (!ok) { rec.err = '门无法通过 room=' + G.cur.room.idx + ' dir=' + st.dir; break; }
      god();
    }
    rec.reachedFarIdx = G.cur.room.idx === G.floorData.farIdx;
    rec.roomType = G.cur.room.type;
    rec.exitPickupExists = !!G.cur.exitPk;
    rec.portalDecoration = !!G.portal;
    rec.lockedOnEntry = G.cur.locked;
    // 站在入口上按 E(未清怪时应该被拒绝并说明原因)
    if (G.cur.exitPk) {
      P().x = G.cur.exitPk.x; P().y = G.cur.exitPk.y;
      G.detectInteract();
      rec.promptWhileLocked = G.interactTarget ? G.interactTarget.label : null;
      rec.blockedFlag = G.interactTarget ? !!G.interactTarget.blocked : null;
      G.tryInteract();
      rec.floorAfterBlockedInteract = G.run.floor;
    }
    // 清空楼梯房 → 入口解锁
    const cleared = clearRoom();
    rec.roomCleared = cleared;
    if (G.cur.exitPk) {
      P().x = G.cur.exitPk.x; P().y = G.cur.exitPk.y;
      G.detectInteract();
      rec.promptAfterClear = G.interactTarget ? G.interactTarget.label : null;
      rec.goalText = G.objectiveText();
      // 真实按 E
      const before = G.run.floor;
      G.tryInteract();
      for (let i = 0; i < 400 && G.run.floor === before; i++) G.update(1 / 60);
      rec.floorAfter = G.run.floor;
      rec.advanced = G.run.floor === before + 1;
    }
    rec.floorChange = rec.floor + ' -> ' + rec.floorAfter;
    rec.ok = !!rec.advanced;
    out.floors.push(rec);
    out.log.push('第 ' + rec.floor + ' 层 → 第 ' + rec.floorAfter + ' 层 (' + (rec.advanced ? '成功' : '失败') + ')');
    if (!rec.ok) break;
  }
  out.finalFloor = G.run.floor;
  out.consecutiveClears = out.floors.filter(r => r.ok).length;
  return 'FLOORS ' + JSON.stringify(out);
})()
