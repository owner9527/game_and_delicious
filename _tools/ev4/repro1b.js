(function () {
  var out = {};
  out.floor = G.run.floor;
  var fd = G.floorData;
  out.farIdx = fd.farIdx;
  out.farType = fd.rooms[fd.farIdx].type;
  out.totalRooms = fd.rooms.length;
  out.bossFloor = fd.bossFloor;
  G.enterRoom(fd.farIdx, -1);
  out.enteredType = G.cur.room.type;
  out.lockedOnEntry = G.cur.locked;
  out.enemiesSpawned = G.enemies.length;
  out.stairsRoomDoors = Object.keys(G.cur.room.doors).length;
  G.enemies = []; G.cur.pending = []; G.cur.locked = false; G.cur.room.cleared = true;
  G.update(0.033); G.update(0.033);
  out.pickupTypesAfterClear = G.pickups.map(function (p) { return p.type; });
  out.hasNextPickup = G.pickups.some(function (p) { return p.type === 'next'; });
  out.decorativePortal = G.portal ? { x: G.portal.x, y: G.portal.y } : null;
  if (G.portal) { G.player.x = G.portal.x; G.player.y = G.portal.y; }
  G.detectInteract();
  out.interactPromptOnPortal = G.interactTarget ? G.interactTarget.label : null;
  G.tryInteract();
  for (var i = 0; i < 20; i++) G.update(0.033);
  out.floorAfterStandingOnPortalAndPressingE = G.run.floor;
  out.advanced = G.run.floor > 1;
  out.allRoomsCleared = G.floorData.rooms.every(function (r) { return r.cleared; });
  out.roomsTotal = G.floorData.rooms.length;
  out.startFloorBannerWanted = 'floor change ' + 1 + ' -> ' + G.run.floor;
  return 'REPRO1 ' + JSON.stringify(out);
})()
