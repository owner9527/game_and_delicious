(function () {
  Tutorial.finish(true);
  const out = {};
  const P = () => G.player;

  // ============ A) 存档兼容: 旧版局外档案(没有 flags 字段) ============
  localStorage.setItem('shenyuan_meta_v1', JSON.stringify({
    souls: 123, upgrades: { hp: 2, dmg: 1 }, stats: { bestFloor: 7, kills: 99, runs: 5 }, settings: { sfx: false },
  }));
  Meta.load();
  out.legacyMetaNoFlags = {
    soulsKept: Meta.data.souls, upgradesKept: Meta.data.upgrades, bestFloorKept: Meta.data.stats.bestFloor,
    sfxKept: Meta.data.settings.sfx, flagsBackfilled: Meta.data.flags,
    tutorialWouldAutoStartForVeteranWithoutFlag: UI.tutorialShouldAutoStart(),
  };

  // ============ B) 存档兼容: 旧版局内档案仍可"继续冒险" ============
  localStorage.setItem('shenyuan_run_v1', JSON.stringify({
    seed: 12345, floor: 4,
    p: {
      level: 5, xp: 3, hp: 50, gold: 200, souls: 10, kills: 20, blessings: [],
      weapon: { kind: 'weapon', base: 'bow', rarity: 1, affixes: [{ id: 'aspd', v: 8 }], name: '疾风长弓', dmg: 7, uid: 'legacy1' },
      passives: [null, null, null, null, null, null], revivesUsed: 0,
    },
    cleared: [0, 1],
  }));
  G.continueRun();
  out.legacyRunContinue = {
    floor: G.run.floor, seed: G.run.seed, level: G.player.level,
    hp: Math.round(P().hp), maxHp: P().maxHp, gold: P().gold, souls: P().souls,
    weaponBase: P().weapon.base, aspdAffixKept: P().weapon.affixes.length,
    clearedRoomsRestored: G.floorData.rooms.map((r, i) => r.cleared ? i : -1).filter(i => i >= 0),
    tutorialAutoPopped: !!(G.tutorial && G.tutorial.active),
    exitPickupInStairsRoom: (function () {
      const fd = G.floorData;
      const far = fd.rooms[fd.farIdx];
      return far.type === 'stairs' ? 'farIdx=' + fd.farIdx + ' type=stairs' : 'farIdx type=' + far.type;
    })(),
  };

  // ============ C) HUD 目标文本 + warn 样式(锁住房) ============
  God();
  function God() { P().maxHp = 1e6; P().hp = 1e6; P().iframes = 1e6; }
  const fd = G.floorData;
  let combatIdx = -1;
  for (const r of fd.rooms) if (r.type === 'combat') { combatIdx = r.idx; break; }
  const rows = [];
  function snap(tag) {
    UI.updateHUD();
    const el = document.getElementById('objtext');
    rows.push({ tag, text: el.textContent, warnClass: el.classList.contains('warn'), locked: G.cur.locked, roomType: G.cur.room.type });
  }
  if (combatIdx >= 0) {
    G.enterRoom(combatIdx, -1);
    snap('locked combat room');
    for (const e of G.enemies) e.dead = true;
    G.cur.pending.length = 0;
    for (let i = 0; i < 3; i++) G.update(1 / 60);
    snap('cleared combat room');
  }
  G.enterRoom(fd.farIdx, -1);
  if (G.cur.room.type === 'stairs') {
    snap('stairs room locked');
    for (const e of G.enemies) e.dead = true;
    G.cur.pending.length = 0;
    for (let i = 0; i < 3; i++) G.update(1 / 60);
    snap('stairs room unlocked');
    // 互动提示样式: 封印 vs 开启
    const pk = G.cur.exitPk;
    G.cur.locked = true; P().x = pk.x; P().y = pk.y; G.detectInteract(); UI.updateHUD();
    const tip = document.getElementById('interacttip');
    out.interactTip = { lockedText: tip.textContent, lockedBlocked: tip.classList.contains('blocked'), lockedHidden: tip.classList.contains('hidden') };
    G.cur.locked = false; G.detectInteract(); UI.updateHUD();
    out.interactTip.unlockedText = tip.textContent;
    out.interactTip.unlockedBlocked = tip.classList.contains('blocked');
  }
  out.hudObjective = rows;
  out.portalDecorationMatchesPickup = (function () {
    const pk = G.pickups.find(p => p.type === 'next');
    return !!(pk && G.portal && Math.abs(pk.x - G.portal.x) < 0.01 && Math.abs(pk.y - G.portal.y) < 0.01);
  })();

  // ============ D) 玩家行为统计是否在正常游玩中累加(引导步骤依赖) ============
  const s0 = JSON.parse(JSON.stringify(G.stat));
  G.input.keys = { KeyD: true }; G.input.fire = true;
  for (let i = 0; i < 120; i++) G.updatePlayer(1 / 60);
  G.input.keys = {}; G.input.fire = false;
  out.statsAccumulate = {
    movedGrew: G.stat.moved > s0.moved, shotsGrew: G.stat.shots > s0.shots,
    moved: Math.round(G.stat.moved), shots: G.stat.shots,
  };

  return 'FINAL ' + JSON.stringify(out);
})()
