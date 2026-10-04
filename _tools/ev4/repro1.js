(function () {
  var out = {};
  out.floor = G.run.floor;
  var fd = G.floorData;
  out.farIdx = fd.farIdx;
  out.farType = fd.rooms[fd.farIdx].type;
  out.totalRooms = fd.rooms.length;
  out.bossFloor = fd.bossFloor;
  // 直接把玩家放进楼梯房(等价于玩家自己一路走到的结果)
  G.enterRoom(fd.farIdx, -1);
  out.enteredType = G.cur.room.type;
  out.locked = G.cur.locked;
  out.enemiesSpawned = G.enemies.length;
  out.stairsRoomDoors = Object.keys(G.cur.room.doors).length;
  // 清空该房间
  G.enemies = []; G.cur.pending = []; G.cur.locked = false;
  G.cur.room.cleared = true;
  out.pickupTypesAfterClear = G.pickups.map(function (p) { return p.type; });
  out.hasNextPickup = G.pickups.some(function (p) { return p.type === 'next'; });
  out.decorativePortal = G.portal ? { x: G.portal.x, y: G.portal.y } : null;
  // 站在那个"看起来就是下一层入口"的光圈上
  if (G.portal) { G.player.x = G.portal.x; G.player.y = G.portal.y; }
  G.detectInteract();
  out.interactPromptOnPortal = G.interactTarget ? G.interactTarget.label : null;
  G.tryInteract();
  G.update(0.033); G.update(0.033); G.update(0.033);
  out.floorAfterStandingAndPressingE = G.run.floor;
  out.advanceable = G.run.floor > 1;
  out.allRoomsCleared = fd.rooms.every(function (r) { return r.cleared; });
  return JSON.stringify(out);
})()
