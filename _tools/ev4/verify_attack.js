(async function () {
  const out = {};
  if (G.tutorial && G.tutorial.active) Tutorial.finish(true);
  const p = () => G.player;

  // ============ 1) 连续输出速率: 旧版(冷却重置) vs 新版(保留溢出) ============
  function rate(weaponId, dt, useOld, frames) {
    const pl = p();
    pl.weapon = { kind: 'weapon', base: weaponId, rarity: 0, affixes: [], name: 'T', dmg: 11, uid: 'tw_' + weaponId };
    Loot.applyStats(pl);
    pl.fireCd = 0;
    const s0 = G.stat.shots;
    const origShoot = G.shoot;
    if (useOld) G.shoot = function () { const ok = origShoot.call(G); if (ok) G.player.fireCd = Loot.weaponInterval(G.player); return ok; };
    const wasPaused = G.paused;
    G.paused = true;                 // 冻结 tick 里的 update, 只让本测试驱动 updatePlayer
    G.input.fireBuf = 0; G.input.fire = true;
    for (let i = 0; i < frames; i++) G.updatePlayer(dt);
    G.input.fire = false;
    G.paused = wasPaused;
    G.shoot = origShoot;
    const shots = G.stat.shots - s0;
    return { shots, rate: +(shots / (frames * dt)).toFixed(3) };
  }
  out.rate = {};
  for (const wid of ['staff', 'bow', 'cannon']) {
    const iv = Loot.itemBase({ kind: 'weapon', base: wid }).interval;
    for (const [dtName, dt, frames] of [['60fps', 1 / 60, 600], ['30fps', 1 / 30, 300]]) {
      const oldR = rate(wid, dt, true, frames);
      const newR = rate(wid, dt, false, frames);
      out.rate[wid + '_' + dtName] = {
        nominalInterval: iv,
        nominalPerSec: +(1 / iv).toFixed(3),
        before_perSec: oldR.rate, after_perSec: newR.rate,
        before_shots: oldR.shots, after_shots: newR.shots,
        delta_pct: +(((newR.rate - oldR.rate) / oldR.rate) * 100).toFixed(2),
      };
    }
  }
  // 复位武器
  p().weapon = Loot.starterWeapon(); Loot.applyStats(p()); p().hp = p().maxHp;

  // ============ 2) "按下 → 开火"同步延迟(真实 rAF 计时) ============
  const cvs = document.getElementById('game');
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));

  // 新版: mousedown 处理器里立即 tryFire
  let newMin = 1e9, newShots = 0;
  for (let k = 0; k < 5; k++) {
    await raf();
    p().fireCd = 0; G.input.fire = false; G.input.fireBuf = 0;
    const s0 = G.stat.shots, t0 = performance.now();
    cvs.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 600, clientY: 400 }));
    const dtms = performance.now() - t0;
    newShots += G.stat.shots - s0;
    if (dtms < newMin) newMin = dtms;
    cvs.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    G.input.fire = false; G.input.fireBuf = 0;
  }
  out.pressToShot = { after_minMs: +newMin.toFixed(3), after_shotsOutOf5: newShots };

  // 旧版语义: 只在 updatePlayer 里采样 input.fire(等价于把"按下即开火"关掉)
  let oldMin = 1e9, oldShots = 0;
  for (let k = 0; k < 5; k++) {
    await raf();
    p().fireCd = 0; G.input.fireBuf = 0; G.input.fire = false;
    const s0 = G.stat.shots, t0 = performance.now();
    G.input.fire = true;              // 旧 mousedown 唯一做的事
    let guard = 0;
    while (G.stat.shots === s0 && guard++ < 20) await raf();
    const dtms = performance.now() - t0;
    oldShots += G.stat.shots - s0;
    if (dtms < oldMin) oldMin = dtms;
    G.input.fire = false;
  }
  out.pressToShot.before_minMs = +oldMin.toFixed(3);
  out.pressToShot.before_shotsOutOf5 = oldShots;

  // ============ 3) 冷却中"点一下"(按下即松开)会不会被吞 ============
  // 旧版: fire 只在 updatePlayer 采样一次, 冷却中点击丢失
  function tap(oldStyle, cd) {
    const pl = p();
    pl.weapon = Loot.starterWeapon(); Loot.applyStats(pl);
    pl.fireCd = cd;                   // 冷却还剩 cd 秒时玩家点了一下
    const s0 = G.stat.shots;
    const wasPaused = G.paused; G.paused = true;
    G.input.fireBuf = 0; G.input.fire = false;
    const dt = 1 / 60;
    if (oldStyle) {
      // 第 1 帧按下, 第 2 帧松开(玩家快速点一下)
      G.input.fire = true; G.input.fireBuf = 0; G.updatePlayer(dt);
      G.input.fire = false;
      for (let i = 1; i < 40; i++) G.updatePlayer(dt);
    } else {
      // 新版: mousedown → fireBuf = 0.16, 冷却结束后自动补发
      G.input.fireBuf = 0.16; G.tryFire();
      G.input.fire = false;
      for (let i = 0; i < 40; i++) G.updatePlayer(dt);
    }
    G.paused = wasPaused;
    return G.stat.shots - s0;
  }
  out.tapDuringCooldown = {};
  for (const cd of [0.10, 0.12, 0.30]) {
    out.tapDuringCooldown['cd_' + cd + 's'] = {
      cooldownLeft: cd, before_shots: tap(true, cd), after_shots: tap(false, cd),
    };
  }
  out.tapDuringCooldown.bufferWindow_s = 0.16;

  // ============ 4) 移动 / 冲刺 中是否还能开火 ============
  (function () {
    const pl = p();
    pl.weapon = Loot.starterWeapon(); Loot.applyStats(pl);
    const res = {};
    const wasPaused = G.paused; G.paused = true;
    for (const [name, setup] of [
      ['移动中', () => { G.input.keys = { KeyD: true }; }],
      ['冲刺中', () => { G.input.keys = {}; pl.dashT = 0.17; }],
      ['静止', () => { G.input.keys = {}; }],
    ]) {
      setup();
      pl.fireCd = 0; pl.dashCd = 0; G.input.fire = true; G.input.fireBuf = 0;
      const s0 = G.stat.shots;
      const x0 = pl.x, y0 = pl.y;
      for (let i = 0; i < 60; i++) G.updatePlayer(1 / 60);
      res[name] = { shotsIn1s: G.stat.shots - s0, movedPx: Math.round(Math.hypot(pl.x - x0, pl.y - y0)) };
      G.input.fire = false; pl.dashT = 0;
    }
    G.paused = wasPaused;
    G.input.keys = {};
    out.fireWhile = res;
  })();

  // ============ 5) 命中判定: 点测试(旧) vs 扫掠(新) 在切线掠过时的漏判 ============
  (function () {
    const realRoom = G.cur.room;
    const savedObs = realRoom.obstacles;
    realRoom.obstacles = [];             // 测试内临时清掉岩石, 只比较敌人判定
    const ER = 13, SIZE = 5, SPEED = 620, DT = 1 / 30;   // 弓 + dt 上限 + 小体型敌人
    const stepLen = SPEED * DT;
    const halfDx = stepLen / 2;
    function trial(offsetPx, swept) {
      const e = {
        uid: 90000 + offsetPx, type: 'slime', name: 'T', x: 700, y: 416, r: ER,
        hp: 1000, maxHp: 1000, dmg: 0, speed: 0, color: '#fff', xp: 0, armor: 0, ai: 'idle',
        t: 0, ph: 0, spawnT: 0, contactCd: 0, flashT: 0, shootT: 0, state: 'idle', stateT: 0, aimA: 0,
        blinkCd: 0, burn: null, poison: null, frost: null, frozenT: 0, dotT: 0, dotAcc: 0,
        orbitCd: 0, elite: -1, boss: false, dead: false, vx: 0, vy: 0, lifesteal: 0,
      };
      G.enemies = [e];
      const sx = 700 - halfDx, sy = 416 - offsetPx;
      G.projs = [{
        x: sx, y: sy, px: sx, py: sy, vx: SPEED, vy: 0, ang: 0, dmg: 10, pierce: 0,
        hits: new Set(), life: 1, color: '#fff', size: SIZE, aoe: 0, wave: false, canSplit: false, speed: SPEED,
      }];
      const real = segCircleHit;
      if (!swept) segCircleHit = function (x1, y1, x2, y2, cx, cy, r) { return dist2(x2, y2, cx, cy) <= r * r; };
      G.updateProjs(DT);
      segCircleHit = real;
      const hit = e.hp < 1000;
      G.enemies = [];
      return hit;
    }
    const rows = [];
    let beforeHits = 0, afterHits = 0;
    for (let off = 0; off <= 24; off += 2) {
      const b = trial(off, false), a = trial(off, true);
      if (b) beforeHits++;
      if (a) afterHits++;
      rows.push({ offsetPx: off, pointTest: b, sweptTest: a });
    }
    realRoom.obstacles = savedObs;
    G.projs = []; G.enemies = [];
    out.hitDetection = {
      setup: { enemyR: ER, projSize: SIZE, speed: SPEED, dt: DT, frameStepPx: +stepLen.toFixed(2), effectiveRadius: ER + SIZE },
      before_hits: beforeHits, after_hits: afterHits, samples: rows.length, rows,
    };
  })();

  return 'ATTACK ' + JSON.stringify(out);
})()
