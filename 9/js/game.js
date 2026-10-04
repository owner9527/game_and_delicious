/* 星穹拓荒 — 模拟核心：纯逻辑可测，表现层通过字段/队列读取 */
window.SF = window.SF || {};
(function () {
  'use strict';
  const D = SF.data;
  const U = 34; // 1 逻辑单位 = 34px
  const DAY_LEN = 180;   // 一天 180 秒
  const TAU = Math.PI * 2;

  function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  let CID = 1;

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'campaign';           // campaign|endless|weekly|sandbox|tutorial
    this.seed = opts.seed || String(Date.now() % 1000000);
    this.difficulty = opts.difficulty || 2;        // 1~5
    this.station = opts.station || 1;
    this.carry = opts.carry || null;               // 跃迁携带 {res, pop, techs}
    this.carriedTechs = opts.carriedTechs || [];
    this.resMul = opts.resMul || 1;
    this.eventsOn = opts.eventsOn !== false;
    this.threatFixed = opts.threat || 0;
    this.weekly = opts.weekly || false;

    // 威胁等级：难度基值 + 站数递进（- 遗产/科技减免）
    const pity = SF.meta ? SF.meta.pityFactor() : 1;
    this.pity = pity;
    const base = [1, 2, 4, 6, 8][clamp(this.difficulty, 1, 5) - 1];
    let th = this.threatFixed > 0 ? this.threatFixed
      : clamp(base + (this.station - 1) * 0.7 - (opts.threatDown || 0), 1, 9);
    if (this.mode === 'tutorial') th = 1;
    this.threat = Math.round(th);

    // 星系与地表（纯函数再生成，同种子一致；伴星降落时用外部传入的行星/地表）
    this.galaxy = SF.gen.galaxy(this.seed, this.station, this.threat);
    if (this.threatFixed > 0) this.threat = this.threatFixed;
    this.planet = opts.planet || this.galaxy.planets[0];
    this.map = opts.map || SF.gen.map(this.seed, this.planet, this.station);
    this.goal = this.galaxy.goal;
    if (this.mode === 'tutorial') this.goal = SF.gen.goalOf('pop');

    // 科技可用集
    this.availTechs = this.galaxy.techs;
    this.researched = [];
    if (this.carriedTechs.length) this.researched = this.carriedTechs.slice();

    // 资源
    const lfx = SF.meta ? SF.meta.legacyFx() : {};
    this.lfx = lfx;
    const carryRes = this.carry ? this.carry.res : null;
    this.res = {
      ore: Math.round((120 + (lfx.ore || 0)) * this.resMul + (carryRes ? carryRes.ore : 0)),
      organics: Math.round(90 * this.resMul + (carryRes ? carryRes.organics : 0)),
      energy: 150 + (carryRes ? carryRes.energy : 0),
      research: Math.round((lfx.research || 0) + (carryRes ? carryRes.research : 0)),
    };

    // 实体
    this.buildings = [];
    this.colonists = [];
    this.beasts = [];
    this.pirates = [];
    this.meteors = [];
    this.floaters = [];
    this.buildQueue = [];

    // 相机
    this.cam = { x: 0, y: 0, zoom: 0.95 };

    // 状态
    this.time = 0;
    this.speed = 1;
    this.pauseReasons = {};
    this.morale = 50;
    this.brownoutT = 0;
    this.growthT = 0;
    this.mods = {};
    this.recalcMods();

    // 事件调度
    this.nextEventAt = this.mode === 'tutorial' ? 210 : lerp(150, 100, (this.threat - 1) / 8);
    this.warnEvt = null;          // {id, until, def}
    this.activeEvt = null;        // {id, until, data}
    this.aura = { storm: 0, flare: 0, radburst: 0 };
    this.pendingChoice = null;
    this.choiceHistory = {};

    // 统计
    this.stats = {
      peakPop: 0, deaths: 0, beastsKilled: 0, oreMined: 0,
      eventsTotal: 0, eventsGood: 0, buildingsLost: 0, trades: 0,
      built: 0, warps: opts.warps || 0, meteorClean: true,
    };
    this.log = [];
    this.toastQueue = [];
    this.shake = 0;
    this.gameOver = false; this.won = false; this.loseReason = '';
    this.goalDone = false;
    this.rates = { ore: 0, organics: 0, energy: 0, research: 0, food: 0 };
    this.milestones = {};
    this.tutStep = 0;
    // 新手教学：第一次玩任何一种模式都自动开启（原先只在"星图长征"里开，
    // 玩家点最显眼的"深空漫游/沙盒"就没有任何引导，进去一脸茫然）
    this.tutActive = this.mode === 'tutorial' || (SF.meta && SF.meta.data.playCount === 0);
    this.firstEventDone = false;
    // 教学后的「建议目标」软链（非强制、不暂停、可忽略，填补教学后的引导空档）
    this.sugActive = false;      // 教学完成后自动开启
    this.sugIdx = 0;             // 当前建议序号
    this.sugDismissed = false;   // 玩家点 ✕ 后本局不再显示
    this.sugDoneAt = -1;         // 当前条达成时刻（游戏内时间，<0 表示未达成）

    // 初始殖民者（跃迁携带时不重复发初始人口；遗产 +2 仅新局生效）
    const initPop = this.carry ? this.carry.pop : 12 + (lfx.pop || 0);
    this.site = this.map.sites[0]; // 真正落点由 ui 在 start 时调用 setSite 指定
    this.popCapBase = 0;

    // 遗产：开局赠送科技 / 护盾
    if (lfx.startTech && !this.carry) {
      const t1 = D.TECHS.filter(t => t.tier === 1 && this.availTechs[t.branch] && this.availTechs[t.branch].includes(t.id));
      if (t1.length && !this.researched.includes(t1[0].id)) { this.researched.push(t1[0].id); this.pushLog('遗产蓝图：预先掌握『' + t1[0].name + '』', 'good'); }
    }
    this.startShield = !!lfx.startShield && !this.carry;

    for (let i = 0; i < initPop; i++) this.addColonist();
    this.recalcMods();
    this.pushLog('移民舰进入『' + this.galaxy.sysName + '』轨道，准备降落。', 'sys');
  }

  /* ================= 生命周期 ================= */
  Game.prototype.setSite = function (siteIdx) {
    const s = this.map.sites[siteIdx];
    this.site = s;
    this.cam.x = s.x; this.cam.y = s.y;
    this.addBuilding('command', s.x, s.y, true);
    if (this.startShield) this.addBuilding('shield', s.x + 3.2 * U, s.y + 2.4 * U, true);
    this.recalcMods();
    if (SF.meta) SF.meta.unlock('first_land');
    this.milestone('land');
  };

  Game.prototype.addColonist = function () {
    const names = D.COLONIST_NAMES;
    const c = {
      id: CID++, name: names[(CID * 7 + this.station) % names.length] + '-' + (CID % 100),
      x: this.site.x + SF.rng.fx.range(-3, 3) * U, y: this.site.y + SF.rng.fx.range(-3, 3) * U,
      tx: 0, ty: 0, hp: 100, maxHp: 100, jobId: 0, infected: false, infectT: 0,
      wx: 0, wy: 0, wanderT: 0,
    };
    c.maxHp = Math.round(100 * (1 + (this.lfx.colonistHp || 0)));
    c.hp = c.maxHp;
    c.tx = c.x; c.ty = c.y;
    this.colonists.push(c);
    return c;
  };

  Game.prototype.setSpeed = function (s) { this.speed = s; };
  Game.prototype.paused = function () {
    return this.speed === 0 || Object.keys(this.pauseReasons).length > 0 || this.pendingChoice !== null;
  };
  Game.prototype.effSpeed = function () { return this.paused() ? 0 : this.speed; };

  /* ================= 修正汇总 ================= */
  Game.prototype.recalcMods = function () {
    const m = {
      mineYield: 1, farmYield: 1, energyYield: 1, labYield: 1, buildSpeed: 1,
      costMul: 1, hpMul: 1, popCapMul: 1, growthMul: 1, moraleBonus: 0,
      colonistHp: 0, healMul: 1, plagueRes: 0, radRes: 0,
      shieldAmt: 1, shieldRegen: 1, turretDps: 1, turretRate: 1, meteorRes: 0,
      storageMul: 1, beaconCharge: 1, eventWarn: 0, militia: 0, scan: 0,
      nightYield: 0.15, consumeMul: 1, brownoutRes: 0, nodeOre: 1, nodeOrg: 1,
      trade: 0, ruin: 0, warpThreat: 0, selfRepair: 0, energyCap: 0,
    };
    const add = (fx) => {
      for (const k in fx) {
        const v = fx[k];
        if (k === 'mineYield' || k === 'farmYield' || k === 'energyYield' || k === 'labYield' ||
            k === 'buildSpeed' || k === 'hpMul' || k === 'popCap' || k === 'growth' || k === 'healMul' ||
            k === 'shieldAmt' || k === 'shieldRegen' || k === 'turretDps' || k === 'turretRate' ||
            k === 'storage' || k === 'nodeOre' || k === 'nodeOrg' || k === 'colonistHp' ||
            k === 'nightYield' || k === 'eventWarn' || k === 'energyCap' || k === 'trade' || k === 'ruin' ||
            k === 'warpThreat' || k === 'selfRepair' || k === 'plagueRes' || k === 'radRes' || k === 'meteorRes' ||
            k === 'morale' || k === 'beaconCharge' || k === 'militia' || k === 'scan' || k === 'brownoutRes') {
          // 数值语义见下
        }
        switch (k) {
          case 'costMul': m.costMul += v; break;
          case 'consumeMul': m.consumeMul += v; break;
          case 'beaconCharge': m.beaconCharge -= v; break;
          case 'popCap': m.popCapMul += v; break;
          case 'growth': m.growthMul += v; break;
          case 'colonistHp': m.colonistHp += v; break;
          case 'morale': m.moraleBonus += v; break;
          case 'storage': m.storageMul += v; break;
          default: m[k] = (typeof m[k] === 'number') ? m[k] + v : v;
        }
      }
    };
    for (const id of this.researched) {
      const t = D.TECHS.find(t => t.id === id);
      if (t) add(t.fx);
    }
    add(this.lfx);
    this.mods = m;
    // 造价/储量随科技变动 → 刷新上限
    this.refreshCaps();
  };

  Game.prototype.refreshCaps = function () {
    const m = this.mods;
    let ore = 500, org = 500, nrg = 300 + m.energyCap;
    for (const b of this.buildings) {
      if (!b.built || !b.def.storage) continue;
      ore += b.def.storage.ore; org += b.def.storage.organics; nrg += b.def.storage.energy;
    }
    this.caps = { ore: Math.round(ore * m.storageMul), organics: Math.round(org * m.storageMul), energy: Math.round(nrg) };
  };

  Game.prototype.costOf = function (typeId) {
    const def = D.BUILDINGS[typeId], out = {};
    for (const k in def.cost) out[k] = Math.max(k === 'energy' ? 0 : 0, Math.round(def.cost[k] * this.mods.costMul));
    return out;
  };
  Game.prototype.canAfford = function (cost) {
    for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false;
    return true;
  };

  /* ================= 建造 ================= */
  Game.prototype.canPlace = function (typeId, x, y) {
    const def = D.BUILDINGS[typeId];
    const M = this.map;
    if (x < 80 || y < 80 || x > M.w - 80 || y > M.h - 80) return { ok: false, why: '超出地表范围' };
    if (def.unique && this.buildings.some(b => b.type === typeId)) return { ok: false, why: '该建筑唯一' };
    for (const b of this.buildings) {
      if (dist(x, y, b.x, b.y) < (def.size + b.def.size) * U * 0.82) return { ok: false, why: '与其他建筑重叠' };
    }
    for (const n of M.nodes) {
      if (n.amount <= 0) continue;
      if (dist(x, y, n.x, n.y) < (def.size + 1.1) * U) return { ok: false, why: '距离资源点太近' };
    }
    if (def.adj) {
      const near = M.nodes.some(n => n.type === def.adj && n.amount > 0 && dist(x, y, n.x, n.y) < def.adjRange * U);
      if (!near) return { ok: false, why: '必须毗邻未枯竭的矿脉' };
    }
    const cost = this.costOf(typeId);
    if (!this.canAfford(cost)) return { ok: false, why: '资源不足', cost };
    return { ok: true, cost };
  };

  Game.prototype.place = function (typeId, x, y) {
    const chk = this.canPlace(typeId, x, y);
    if (!chk.ok) { if (chk.why === '资源不足') this.toast('资源不足', 'warn'); return false; }
    const b = this.addBuilding(typeId, x, y, false);
    for (const k in chk.cost) this.res[k] -= chk.cost[k];
    this.recalcMods();
    SF.audio.build();
    this.pushLog('开工建造：' + b.def.name, 'sys');
    this.milestone('first_build');
    return true;
  };

  Game.prototype.addBuilding = function (typeId, x, y, instant) {
    const def = D.BUILDINGS[typeId];
    const b = {
      id: 'b' + (CID++), type: typeId, def, x, y,
      hp: def.hp * this.mods.hpMul, maxHp: def.hp * this.mods.hpMul,
      built: !!instant, progress: instant ? def.buildTime : 0,
      eff: 0, assigned: 0, shield: 0, shieldMax: 0,
      charge: 0, targetId: null, cool: 0, dead: false, ghost: instant ? false : true,
    };
    if (def.shield) { b.shieldMax = def.shield.amount * this.mods.shieldAmt; b.shield = b.shieldMax; }
    this.buildings.push(b);
    if (instant) this.refreshCaps();
    this.stats.built++;
    return b;
  };

  Game.prototype.salvage = function (bid) {
    const i = this.buildings.findIndex(b => b.id === bid);
    if (i < 0) return;
    const b = this.buildings[i];
    if (b.type === 'command') { this.toast('指挥中枢无法拆除', 'warn'); return; }
    const cost = this.costOf(b.type);
    for (const k in cost) this.res[k] = Math.min(this.caps[k] || 99999, (this.res[k] || 0) + Math.round(cost[k] * 0.5));
    this.buildings.splice(i, 1);
    this.recalcMods();
    SF.audio.hit();
    this.pushLog('拆除了' + b.def.name + '，回收一半材料。', 'sys');
  };

  Game.prototype.repair = function (bid) {
    const b = this.buildings.find(b => b.id === bid);
    if (!b || b.hp >= b.maxHp) return;
    const need = Math.ceil((b.maxHp - b.hp) * 0.25);
    if (this.res.ore < need) { this.toast('矿石不足（需 ' + need + '）', 'warn'); SF.audio.err(); return; }
    this.res.ore -= need;
    b.hp = b.maxHp;
    SF.audio.done();
    this.pushLog('修复了' + b.def.name + '（-' + need + ' 矿石）', 'sys');
  };

  /* ================= 科技 ================= */
  Game.prototype.techState = function (t) {
    if (this.researched.includes(t.id)) return 'done';
    const branchList = this.availTechs[t.branch] || [];
    const idx = branchList.indexOf(t.id);
    if (idx <= 0) return idx === 0 ? 'avail' : 'hidden';
    const prev = branchList[idx - 1];
    return this.researched.includes(prev) ? 'avail' : 'lock';
  };
  Game.prototype.research = function (techId) {
    const t = D.TECHS.find(t => t.id === techId);
    if (!t || this.techState(t) !== 'avail') return false;
    if (this.res.research < t.cost) { this.toast('科研点不足', 'warn'); SF.audio.err(); return false; }
    this.res.research -= t.cost;
    this.researched.push(t.id);
    this.recalcMods();
    SF.audio.tech();
    this.toast('科技突破：' + t.name, 'good');
    this.pushLog('研究完成：' + t.name + ' — ' + t.desc, 'good');
    // 建筑造价变了，已排队的不管；上限刷新在 recalcMods 内
    if (this.researched.length >= 10 && SF.meta) SF.meta.unlock('tech10');
    for (const b of this.buildings) {
      if (b.def.shield) { b.shieldMax = b.def.shield.amount * this.mods.shieldAmt; }
    }
    return true;
  };

  /* ================= 日志/浮字/Toast ================= */
  Game.prototype.pushLog = function (txt, kind) {
    this.log.push({ t: this.time, txt, kind: kind || 'sys' });
    if (this.log.length > 60) this.log.shift();
    if (kind && kind !== 'sys') this.uiDirty = true;
  };
  Game.prototype.toast = function (txt, kind) { this.toastQueue.push({ txt, kind: kind || 'sys' }); };
  Game.prototype.floater = function (x, y, txt, color) {
    this.floaters.push({ x, y, txt, color: color || '#DDE6FF', t: 1.4 });
    if (this.floaters.length > 40) this.floaters.shift();
  };

  /* ================= 主更新 ================= */
  Game.prototype.update = function (dtReal) {
    if (this.gameOver) return;
    let dt = dtReal * this.effSpeed();
    if (dt <= 0) { this.updateFloatersOnly(dtReal); return; }
    // 步长切分，避免大步长穿模
    const steps = Math.ceil(dt / 0.12);
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) this.step(sub);
    this.updateFloatersOnly(dtReal);
  };

  Game.prototype.updateFloatersOnly = function (dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t -= dt; f.y -= dt * 26;
      if (f.t <= 0) this.floaters.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  };

  Game.prototype.step = function (dt) {
    this.time += dt;
    this.dayPhase = (this.time % DAY_LEN) / DAY_LEN;
    const isDay = this.dayPhase < 0.62;

    /* ---- 建造进度 ---- */
    let anyBuilding = false;
    for (const b of this.buildings) {
      if (!b.built) {
        b.progress += dt * this.mods.buildSpeed;
        if (b.progress >= b.def.buildTime) {
          b.built = true; b.ghost = false;
          SF.audio.done();
          this.toast(b.def.name + ' 建造完成', 'good');
          this.pushLog(b.def.name + ' 建造完成', 'good');
          this.refreshCaps(); this.recalcMods();
          if (b.type === 'turret' || b.type === 'shield') this.milestone('first_defense');
          if (b.type === 'beacon') this.pushLog('曲速信标落成——等待充能。', 'sys');
        }
        continue;
      }
      if (b.hp < b.maxHp && this.mods.selfRepair > 0) b.hp = Math.min(b.maxHp, b.hp + this.mods.selfRepair * dt);
      anyBuilding = true;
    }
    this.anyBuilt = anyBuilding;

    /* ---- 岗位分配 ---- */
    this.assignJobs();

    /* ---- 能源与产出 ---- */
    this.economy(dt, isDay);

    /* ---- 殖民者 ---- */
    this.updateColonists(dt);

    /* ---- 士气与人口 ---- */
    this.updateMorale(dt);
    this.updateGrowth(dt);

    /* ---- 威胁实体 ---- */
    this.updateBeasts(dt);
    this.updatePirates(dt);
    this.updateMeteors(dt);

    /* ---- 事件调度 ---- */
    if (this.eventsOn) this.updateEvents(dt);

    /* ---- 临时光环计时 ---- */
    for (const k in this.aura) if (this.aura[k] > 0) this.aura[k] = Math.max(0, this.aura[k] - dt);

    /* ---- 护盾回充 ---- */
    for (const b of this.buildings) {
      if (b.def.shield && b.built) {
        const max = b.def.shield.amount * this.mods.shieldAmt;
        b.shieldMax = max;
        if (this.res.energy > 1) b.shield = Math.min(max, b.shield + max * 0.02 * this.mods.shieldRegen * dt);
      }
    }

    /* ---- 信标充能 ---- */
    const beacon = this.buildings.find(b => b.type === 'beacon' && b.built);
    if (beacon && !beacon.charged) {
      const need = beacon.def.chargeTime * beacon.def.chargeTime * 0 + beacon.def.chargeTime * this.mods.beaconCharge;
      if (this.rates.energyNet >= 0 || this.res.energy > 5) {
        beacon.charge += dt;
        if (beacon.charge >= need) {
          beacon.charged = true;
          this.toast('曲速信标充能完毕！', 'good');
          SF.audio.good();
          this.pushLog('曲速信标充能完毕，可以跃迁。', 'good');
        }
      }
    }

    /* ---- 胜负判定 ---- */
    this.checkGoal();
    this.checkLose();
    if (SF.meta) {
      if (this.res.ore >= 2000) SF.meta.unlock('h_ore2000');
      if (this.mode === 'endless' && this.time >= 1800) SF.meta.unlock('endless30');
    }

    /* ---- 统计峰值 ---- */
    if (this.colonists.length > this.stats.peakPop) this.stats.peakPop = this.colonists.length;
    if (this.colonists.length >= 60 && SF.meta) SF.meta.unlock('pop60');
  };

  /* ---- 岗位分配：优先食物 → 矿石 → 科研 ---- */
  Game.prototype.assignJobs = function () {
    const jobs = [];
    for (const b of this.buildings) {
      if (!b.built || b.def.workers <= 0) continue;
      if (b.type === 'mine') {
        const node = this.map.nodes.find(n => n.type === 'ore' && dist(b.x, b.y, n.x, n.y) < b.def.adjRange * U && n.amount > 0);
        if (!node) { b.eff = 0; b.assigned = 0; continue; }
        b.nodeId = node.id;
      }
      jobs.push(b);
    }
    const foodLow = this.res.organics < this.colonists.length * 6;
    const oreLow = this.res.ore < 160 || this.buildQueue.length > 0;
    const prio = (b) => {
      if (b.type === 'farm') return foodLow ? 4 : 2.2;
      if (b.type === 'mine') return oreLow ? 3.4 : 2;
      if (b.type === 'lab') return 1.6;
      return 1;
    };
    jobs.sort((a, c) => prio(c) - prio(a));
    const maxWorkers = Math.floor(this.colonists.length * 0.8);
    let left = maxWorkers;
    for (const b of jobs) {
      const assign = Math.min(b.def.workers, left);
      b.assigned = assign;
      b.eff = assign / b.def.workers;
      left -= assign;
    }
    // 分配殖民者的 job 目标
    let ji = 0;
    const workMap = new Map();
    for (const b of jobs) {
      for (let k = 0; k < b.assigned; k++) workMap.set(b.id + ':' + k, b);
    }
    const slots = [...workMap.values()];
    for (let i = 0; i < this.colonists.length; i++) {
      const c = this.colonists[i];
      const b = i < slots.length ? slots[i] : null;
      const newJob = b ? b.id : null;
      if (newJob !== c.jobId) {
        c.jobId = newJob;
        c.wanderT = 0;
      }
    }
    this.unemployed = Math.max(0, this.colonists.length - slots.length);
    this.maxWorkers = maxWorkers;
  };

  /* ---- 经济：能源/产出/维护 ---- */
  Game.prototype.economy = function (dt, isDay) {
    const m = this.mods;
    const rates = { ore: 0, organics: 0, energy: 0, research: 0 };
    const cons = { energy: 0, ore: 0 };

    const stormF = this.aura.storm > 0 ? 0.5 : 1;
    const flareF = this.aura.flare > 0 ? 1.4 : 1;
    const brownoutF = (this.res.energy <= 0.5) ? (0.35 + 0.25 * m.brownoutRes) : 1;
    this.brownoutFactor = brownoutF;

    for (const b of this.buildings) {
      if (!b.built) continue;
      const def = b.def;
      // 维护
      if (def.upkeep.energy) cons.energy += def.upkeep.energy * m.consumeMul;
      if (def.upkeep.ore) {
        if (this.res.ore > def.upkeep.ore * dt * 2) cons.ore += def.upkeep.ore * m.consumeMul;
        else if (def.produce.energy) { b.eff = 0; continue; } // 没矿石燃料 → 发电机停机
      }
      if (def.produce.energy) {
        let f = (b.eff || 1);
        if (b.type === 'solar') f = (isDay ? 1 : m.nightYield) * flareF;
        rates.energy += def.produce.energy * f * m.energyYield * stormF;
      }
      if (def.produce.ore && b.eff > 0) {
        const node = this.map.nodes[b.nodeId];
        if (node && node.amount > 0) {
          const gain = def.produce.ore * b.eff * brownoutF * m.mineYield * this.resMul;
          const real = Math.min(gain * dt, node.amount);
          node.amount -= real * m.nodeOre;
          rates.ore += gain * (node.amount <= 0 ? 0 : m.nodeOre);
          if (node.amount <= 0) {
            this.toast('一处矿脉已枯竭', 'warn');
            this.pushLog('矿脉枯竭，采矿场停产。', 'warn');
          }
          if (SF.rng.fx.chance(dt * 2)) this.sparks(node.x, node.y, '#FFB05C');
        }
      }
      if (def.produce.organics && b.eff > 0) {
        const envF = 1 + this.planet.env.organic / 200;
        rates.organics += def.produce.organics * b.eff * brownoutF * m.farmYield * envF * this.resMul;
      }
      if (def.produce.research && b.eff > 0) {
        rates.research += def.produce.research * b.eff * brownoutF * m.labYield;
      }
    }

    // 殖民者食物消耗
    const foodCons = this.colonists.length * 0.022 * m.consumeMul;
    rates.food = rates.organics - foodCons;

    // 能源结算
    const netE = rates.energy - cons.energy;
    rates.energyNet = netE;
    this.res.energy = Math.max(0, Math.min(this.caps.energy, this.res.energy + netE * dt));
    if (this.res.energy <= 0.01 && netE < 0) {
      this.brownoutT += dt;
      if (this.brownoutT > 299 && SF.rng.fx.chance(0.02)) SF.audio.crisis();
    } else {
      this.brownoutT = Math.max(0, this.brownoutT - dt * 0.6);
    }

    // 矿石/有机物/科研结算
    this.res.ore = Math.max(0, Math.min(this.caps.ore, this.res.ore + rates.ore * dt - cons.ore * dt));
    this.res.organics = Math.max(0, Math.min(this.caps.organics, this.res.organics + rates.organics * dt - foodCons * dt));
    this.res.research = Math.min(9999, this.res.research + rates.research * dt);
    this.stats.oreMined += rates.ore * dt;
    this.rates = rates;
  };

  /* ---- 殖民者：移动/饥饿/辐射/瘟疫/医疗 ---- */
  Game.prototype.updateColonists = function (dt) {
    const env = this.planet.env;
    const speedF = (1 - env.gravity / 260) * (this.aura.storm > 0 ? 0.7 : 1);
    const medbays = this.buildings.filter(b => b.built && b.type === 'medbay');
    const radTowers = this.buildings.filter(b => b.built && b.type === 'radtower');
    const cmd = this.buildings.find(b => b.type === 'command');

    const radLevel = env.radiation
      + (this.aura.flare > 0 ? 30 : 0)
      + (this.aura.radburst > 0 ? 45 : 0);
    const radDmg = Math.max(0, radLevel - 42) * 0.006 * (1 - this.mods.radRes);
    const starving = this.res.organics <= 0.01;

    for (let i = this.colonists.length - 1; i >= 0; i--) {
      const c = this.colonists[i];
      // 走位
      let gx, gy;
      const jb = c.jobId ? this.buildings.find(b => b.id === c.jobId) : null;
      if (jb) { gx = jb.x; gy = jb.y; }
      else if (cmd) { gx = cmd.x; gy = cmd.y; }
      else { gx = this.site.x; gy = this.site.y; }
      c.wanderT -= dt;
      if (c.wanderT <= 0 || dist(c.x, c.y, c.tx, c.ty) < 6) {
        c.wanderT = SF.rng.fx.range(2.5, 6);
        const r = jb ? 2.6 : 5.5;
        const a = SF.rng.fx.range(0, TAU), rr = SF.rng.fx.range(1.2, r) * U;
        c.tx = gx + Math.cos(a) * rr; c.ty = gy + Math.sin(a) * rr;
      }
      const d = dist(c.x, c.y, c.tx, c.ty);
      if (d > 4) {
        const sp = 42 * speedF * dt;
        c.x += (c.tx - c.x) / d * sp; c.y += (c.ty - c.y) / d * sp;
      }

      // 生命
      let dmg = 0;
      if (starving) dmg += 1.1;
      if (radDmg > 0) {
        let prot = 1;
        for (const rt of radTowers) if (dist(c.x, c.y, rt.x, rt.y) < rt.def.radProtect * U) { prot = 0.3; break; }
        dmg += radDmg * prot;
      }
      if (c.infected) {
        c.infectT += dt;
        dmg += 0.75;
        // 传播
        if (SF.rng.fx.chance(dt * 0.05 * (1 - this.mods.plagueRes))) {
          const victim = this.colonists.find(o => !o.infected && dist(o.x, o.y, c.x, c.y) < 5 * U);
          if (victim) {
            victim.infected = true; victim.infectT = 0;
            this.toast(victim.name + ' 被感染了！', 'crisis');
          }
        }
        // 医疗站治愈
        for (const mb of medbays) {
          if (dist(c.x, c.y, mb.x, mb.y) < 10 * U && c.infectT > 26 / this.mods.healMul) {
            c.infected = false;
            this.toast(c.name + ' 痊愈了', 'good');
            this.pushLog('医疗站治愈了 ' + c.name, 'good');
            if (SF.meta) SF.meta.unlock('cure_plague');
            break;
          }
        }
      }
      // 医疗站附近回血
      let healing = 0.12;
      for (const mb of medbays) if (dist(c.x, c.y, mb.x, mb.y) < 10 * U) { healing = 1.6 * this.mods.healMul; break; }
      c.hp = Math.min(c.maxHp, c.hp + (healing - dmg) * dt);

      if (c.hp <= 0) {
        this.colonists.splice(i, 1);
        this.stats.deaths++;
        this.morale = Math.max(0, this.morale - (c.infected ? 8 : 5));
        this.pushLog('⚠ ' + c.name + ' 牺牲了' + (starving ? '（饥饿）' : c.infected ? '（瘟疫）' : radDmg > 0.05 ? '（辐射）' : ''), 'crisis');
        this.toast(c.name + ' 牺牲了', 'crisis');
        SF.audio.death();
        if (jb) this.assignJobs();
      }
    }
  };

  /* ---- 士气 ---- */
  Game.prototype.updateMorale = function (dt) {
    let target = 50 + this.mods.moraleBonus;
    for (const b of this.buildings) {
      if (!b.built) continue;
      if (b.def.morale) target += b.def.morale * (b.def.workers > 0 ? (b.eff > 0 ? 1 : 0.4) : 1);
    }
    const cap = this.popCap();
    if (this.colonists.length > cap) target -= (this.colonists.length - cap) * 3;
    if (this.res.organics <= 0.01) target -= 28;
    if (this.brownoutT > 20) target -= 10;
    if (this.aura.storm > 0) target -= 4;
    if (this.unemployed > 0) target -= Math.min(8, this.unemployed * 0.7);
    target = clamp(target, 0, 100);
    this.morale += clamp(target - this.morale, -3.5 * dt, 2.2 * dt);
  };

  Game.prototype.popCap = function () {
    let cap = 0;
    for (const b of this.buildings) if (b.built && b.def.popCap) cap += b.def.popCap;
    return Math.round(cap * this.mods.popCapMul);
  };

  Game.prototype.workSpeed = function () { return 0.55 + (this.morale / 100) * 0.6; };

  Game.prototype.updateGrowth = function (dt) {
    const cap = this.popCap();
    if (this.colonists.length >= cap || this.colonists.length >= 80) return;
    if (this.morale < 55 || this.res.organics < this.colonists.length * 4) return;
    this.growthT += dt * this.workSpeed() * this.mods.growthMul;
    const interval = 38;
    if (this.growthT >= interval) {
      this.growthT = 0;
      const c = this.addColonist();
      this.toast('新生命降临：' + c.name + ' 加入了殖民地', 'good');
      this.pushLog('人口自然增长：' + c.name + ' 出生', 'good');
    }
  };

  /* ================= 事件系统 ================= */
  Game.prototype.updateEvents = function (dt) {
    const t = this.time;
    // 预警阶段
    if (this.warnEvt) {
      if (t >= this.warnEvt.until) {
        const def = this.warnEvt.def;
        this.warnEvt = null;
        this.triggerEvent(def);
      }
      return;
    }
    if (this.activeEvt) {
      if (t >= this.activeEvt.until) this.endEvent();
      return;
    }
    if (this.pendingChoice) return;
    if (t >= this.nextEventAt) {
      const def = this.pickEvent();
      if (!def) { this.nextEventAt = t + 30; return; }
      const warnDur = 5 + this.mods.eventWarn + (SF.meta && SF.meta.data.settings.zen ? 10 : 0);
      this.warnEvt = { def, until: t + warnDur };
      SF.audio.alarm();
      this.toast('⚠ 预警：' + def.name + '（' + Math.ceil(warnDur) + ' 秒后）', 'warn');
      this.pushLog('预警：' + def.name + ' 逼近！', 'warn');
    }
  };

  Game.prototype.pickEvent = function () {
    const env = this.planet.env;
    const pool = [];
    for (const def of D.EVENTS) {
      let w = def.w;
      if (def.id === 'meteor') w *= 1 + (100 - env.atmosphere) / 90;
      if (def.id === 'beast') w *= 1 + env.organic / 120;
      if (def.id === 'quake' && !(this.planet.typeId === 'lava' || env.gravity > 70)) continue;
      if (def.id === 'pirate' && this.station < 2 && this.threat < 4) continue;
      if (def.id === 'flare' && this.galaxy.star.flare < 1.2) w *= 0.3;
      if (def.id === 'radburst') w *= env.radiation / 12;
      if (def.id === 'plague' && this.colonists.length < 10) continue;
      if (def.id === 'migrant' && (this.colonists.length < 14 || this.popCap() - this.colonists.length < 4)) continue;
      if (def.id === 'beast' && this.station === 1 && this.time < 600) w *= 0.4;
      if (w <= 0) continue;
      pool.push({ def, w });
    }
    if (!pool.length) return null;
    return SF.rng.fx.weighted(pool).def;
  };

  Game.prototype.triggerEvent = function (def) {
    const th = this.threat;
    this.stats.eventsTotal++;
    this.firstEventDone = true;
    const line = D.AI_LINES[def.id];
    if (line) this.pushLog('船载AI：' + SF.rng.fx.pick(line), 'warn');
    switch (def.id) {
      case 'meteor': {
        const dur = 16 + th;
        this.activeEvt = { def, until: this.time + dur, data: { next: 0, destroyed: 0, hitCount: 0 } };
        break;
      }
      case 'beast': {
        const n = 2 + Math.floor((th - 1) / 4) + (this.station > 5 ? 1 : 0);
        this.activeEvt = { def, until: this.time + 12 + n * 2, data: { left: n, next: 0 } };
        this.pushLog('星兽群规模：约 ' + n + ' 只', 'crisis');
        break;
      }
      case 'pirate': {
        const n = th >= 6 ? 2 : 1;
        this.activeEvt = { def, until: this.time + 10, data: { left: n, next: 0 } };
        break;
      }
      case 'quake': {
        const dur = 12;
        this.activeEvt = { def, until: this.time + dur, data: { next: 0, destroyed: 0 } };
        break;
      }
      case 'storm': this.aura.storm = 40; this.activeEvt = { def, until: this.time + 40, data: {} }; break;
      case 'flare': this.aura.flare = 25; this.activeEvt = { def, until: this.time + 25, data: {} }; break;
      case 'radburst': this.aura.radburst = 20; this.activeEvt = { def, until: this.time + 20, data: {} }; break;
      case 'plague': {
        const n = Math.max(1, 1 + Math.floor(this.colonists.length * 0.08));
        let cnt = 0;
        for (const c of this.colonists) {
          if (cnt >= n) break;
          if (!c.infected && SF.rng.fx.chance(0.6 * (1 - this.mods.plagueRes))) { c.infected = true; c.infectT = 0; cnt++; }
        }
        if (cnt === 0 && this.colonists.length) { this.colonists[0].infected = true; cnt = 1; }
        this.activeEvt = { def, until: this.time + 30, data: { infected: cnt } };
        this.pushLog(cnt + ' 名殖民者被病原体感染', 'crisis');
        break;
      }
      case 'rich': {
        const M = this.map;
        const type = SF.rng.fx.chance(0.6) ? 'ore' : 'org';
        const x = clamp(this.site.x + SF.rng.fx.range(-500, 500), 120, M.w - 120);
        const y = clamp(this.site.y + SF.rng.fx.range(-400, 400), 120, M.h - 120);
        const node = { id: M.nodes.length, type, x, y, amount: type === 'ore' ? 800 : 550, max: 800, rich: true, expire: this.time + 100 };
        M.nodes.push(node);
        this.activeEvt = { def, until: this.time + 100, data: { nodeId: node.id } };
        this.toast('富矿出现，位置已在小地图标记', 'good');
        SF.audio.good();
        break;
      }
      case 'merchant': this.openChoice('merchant'); break;
      case 'ruin': this.openChoice('ruin'); break;
      case 'migrant': this.openChoice('migrant'); break;
      case 'derelict': this.openChoice('derelict'); break;
    }
    this.milestone('first_event');
  };

  Game.prototype.endEvent = function () {
    const ev = this.activeEvt;
    if (!ev) return;
    if (ev.def.id === 'rich') {
      const node = this.map.nodes[ev.data.nodeId];
      if (node && node.amount > 0) {
        node.amount = 0;
        this.toast('富矿消失在星尘中', 'warn');
      }
    }
    if (ev.def.id === 'meteor' && ev.data.destroyed === 0 && this.stats.built > 1 && SF.meta) {
      SF.meta.unlock('no_loss_meteor');
    }
    if (['meteor', 'beast', 'pirate', 'quake'].includes(ev.def.id)) {
      const bad = (ev.data.destroyed || 0) > 0 || (ev.data.colonistDeaths || 0) > 0;
      if (!bad) this.stats.eventsGood++;
    } else this.stats.eventsGood++;
    this.activeEvt = null;
    this.scheduleNext();
  };

  Game.prototype.scheduleNext = function () {
    const base = lerp(120, 60, (this.threat - 1) / 8);
    this.nextEventAt = this.time + base * SF.rng.fx.range(0.85, 1.3) * this.pity;
  };

  /* ---- 星兽 ---- */
  Game.prototype.spawnBeast = function () {
    const M = this.map;
    const edge = SF.rng.fx.int(0, 3);
    let x, y;
    if (edge === 0) { x = SF.rng.fx.range(0, M.w); y = 30; }
    else if (edge === 1) { x = M.w - 30; y = SF.rng.fx.range(0, M.h); }
    else if (edge === 2) { x = SF.rng.fx.range(0, M.w); y = M.h - 30; }
    else { x = 30; y = SF.rng.fx.range(0, M.h); }
    this.beasts.push({
      id: 'k' + (CID++), x, y, hp: 45 + this.threat * 18, maxHp: 45 + this.threat * 18,
      dps: 4.5 + this.threat, speed: 22 + this.threat * 0.8, target: null, wob: SF.rng.fx.range(0, TAU),
    });
  };

  Game.prototype.updateBeasts = function (dt) {
    // 波次生成
    const ev = this.activeEvt;
    if (ev && ev.def.id === 'beast' && ev.data.left > 0) {
      ev.data.next -= dt;
      if (ev.data.next <= 0) { this.spawnBeast(); ev.data.left--; ev.data.next = 2; }
    }
    const m = this.mods;
    for (let i = this.beasts.length - 1; i >= 0; i--) {
      const k = this.beasts[i];
      // 目标：最近建筑
      if (!k.target || k.target.dead) {
        let best = null, bd = 1e9;
        for (const b of this.buildings) {
          const d = dist(k.x, k.y, b.x, b.y);
          if (d < bd) { bd = d; best = b; }
        }
        k.target = best;
      }
      const t = k.target;
      if (t) {
        const d = dist(k.x, k.y, t.x, t.y);
        const range = (t.def.size + 0.9) * U;
        if (d > range) {
          const sp = k.speed * dt;
          k.x += (t.x - k.x) / d * sp; k.y += (t.y - k.y) / d * sp;
        } else {
          this.damageBuilding(t, k.dps * 0.75 * dt, 'beast', k);
          if (SF.rng.fx.chance(dt * 3)) this.sparks(t.x + SF.rng.fx.range(-14, 14), t.y + SF.rng.fx.range(-14, 14), '#E8465A');
        }
      }
      // 民兵反击
      if (m.militia > 0) {
        const cmd = this.buildings.find(b => b.type === 'command');
        if (cmd && dist(k.x, k.y, cmd.x, cmd.y) < 14 * U) {
          k.hp -= 8 * dt;
          if (SF.rng.fx.chance(dt * 2)) this.sparks(k.x, k.y, '#35E0D6');
        }
      }
      if (k.hp <= 0) {
        this.beasts.splice(i, 1);
        this.stats.beastsKilled++;
        this.res.organics = Math.min(this.caps.organics, this.res.organics + 8);
        this.floater(k.x, k.y, '+8 有机物', '#7DD871');
        SF.audio.hit();
        if (SF.meta) {
          SF.meta.addStat('beasts', 1);
          if (SF.meta.getStat('beasts') >= 50) SF.meta.unlock('beast50');
        }
      }
    }
    // 炮塔索敌（能源耗尽时停机）
    for (const b of this.buildings) {
      if (!b.built || !b.def.combat) continue;
      if (this.res.energy <= 0.5) { b.targetId = null; continue; }
      b.cool -= dt * (1 + m.turretRate);
      let tgt = null, bd = b.def.combat.range * U;
      for (const k of this.beasts) {
        const d = dist(b.x, b.y, k.x, k.y);
        if (d < bd) { bd = d; tgt = k; }
      }
      for (const p of this.pirates) {
        const d = dist(b.x, b.y, p.x, p.y);
        if (d < bd) { bd = d; tgt = p; }
      }
      b.targetId = tgt ? tgt.id : null;
      if (tgt && b.cool <= 0) {
        b.cool = 0.7;
        const dmg = b.def.combat.dps * 0.7 * m.turretDps;
        tgt.hp -= dmg;
        SF.audio.shoot();
        b.laserT = 0.09;
        this.sparks(tgt.x, tgt.y, '#35E0D6');
      }
      if (b.laserT) b.laserT = Math.max(0, b.laserT - dt);
    }
  };

  /* ---- 海盗 ---- */
  Game.prototype.updatePirates = function (dt) {
    const ev = this.activeEvt;
    if (ev && ev.def.id === 'pirate' && ev.data.left > 0) {
      ev.data.next -= dt;
      if (ev.data.next <= 0) {
        ev.data.left--;
        ev.data.next = 4;
        const M = this.map;
        this.pirates.push({
          id: 'p' + (CID++), x: M.w - 40, y: SF.rng.fx.range(0, M.h),
          hp: 70 + this.threat * 18, phase: 'go', dwell: 0, stolen: {},
        });
      }
    }
    const cmd = this.buildings.find(b => b.type === 'command');
    for (let i = this.pirates.length - 1; i >= 0; i--) {
      const p = this.pirates[i];
      if (p.phase === 'go' && cmd) {
        const d = dist(p.x, p.y, cmd.x, cmd.y);
        if (d > 60) { const sp = 85 * dt; p.x += (cmd.x - p.x) / d * sp; p.y += (cmd.y - p.y) / d * sp; }
        else p.phase = 'steal';
      } else if (p.phase === 'steal') {
        p.dwell += dt;
        if (p.dwell > 3.5) {
          for (const k of ['ore', 'organics', 'energy', 'research']) {
            const take = Math.min(this.res[k] || 0, Math.round((this.res[k] || 0) * 0.12) + 20);
            if (take > 0) { this.res[k] -= take; p.stolen[k] = take; }
          }
          p.phase = 'flee';
          this.toast('海盗抢走了物资！', 'crisis');
          this.pushLog('海盗掠夺了殖民地储备', 'crisis');
        }
      } else {
        const sp = 120 * dt;
        p.x += (this.map.w + 200 - p.x) / 300 * sp; p.y -= sp * 0.3;
        if (p.x > this.map.w + 150 || p.y < -100) this.pirates.splice(i, 1);
      }
      if (p.hp <= 0) {
        for (const k in p.stolen) this.res[k] = Math.min(this.caps[k] || 9999, (this.res[k] || 0) + p.stolen[k]);
        this.pirates.splice(i, 1);
        this.toast('海盗船被击毁，物资追回！', 'good');
        SF.audio.boom();
      }
    }
  };

  /* ---- 陨石 / 星震 ---- */
  Game.prototype.updateMeteors = function (dt) {
    const ev = this.activeEvt;
    if (ev && (ev.def.id === 'meteor' || ev.def.id === 'quake')) {
      ev.data.next -= dt;
      if (ev.data.next <= 0) {
        ev.data.next = ev.def.id === 'quake' ? 3.5 : 1.3;
        const targets = this.buildings.filter(b => !b.ghost);
        let tx, ty;
        if (targets.length && SF.rng.fx.chance(0.6)) {
          const t = SF.rng.fx.pick(targets);
          tx = t.x + SF.rng.fx.range(-60, 60); ty = t.y + SF.rng.fx.range(-60, 60);
        } else {
          tx = this.site.x + SF.rng.fx.range(-350, 350);
          ty = this.site.y + SF.rng.fx.range(-300, 300);
        }
        this.meteors.push({
          id: 'm' + (CID++), tx, ty, t: 0, dur: ev.def.id === 'quake' ? 0.1 : 1.1,
          quake: ev.def.id === 'quake',
          sx: tx + (ev.def.id === 'quake' ? 0 : SF.rng.fx.range(-260, 260)),
          sy: ty - (ev.def.id === 'quake' ? 0 : 620),
          dmg: (ev.def.id === 'quake' ? 36 : 18 + this.threat * 2.5),
        });
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const mte = this.meteors[i];
      mte.t += dt;
      if (mte.t < mte.dur) continue;
      // 落地结算
      this.meteors.splice(i, 1);
      this.shake = Math.min(1, this.shake + 0.5);
      SF.audio.boom();
      this.burst(mte.tx, mte.ty, mte.quake ? '#FF8A3D' : '#FFB05C');
      const R = 2.2 * U, dmgBase = mte.dmg * (1 - this.mods.meteorRes);
      for (const b of this.buildings) {
        const d = dist(b.x, b.y, mte.tx, mte.ty);
        if (d < R + b.def.size * U) this.damageBuilding(b, dmgBase * (1 - d / (R + b.def.size * U)) * 1.4, 'meteor', null, ev);
      }
      for (const c of this.colonists) {
        if (dist(c.x, c.y, mte.tx, mte.ty) < R) {
          c.hp -= 30;
          if (SF.rng.fx.chance(0.5)) this.floater(c.x, c.y, '-30', '#E8465A');
        }
      }
    }
  };

  Game.prototype.damageBuilding = function (b, dmg, src, beast, ev) {
    if (b.dead) return;
    // 护盾吸收（范围内护盾发生器）
    for (const s of this.buildings) {
      if (!s.built || !s.def.shield || s.shield <= 0) continue;
      if (dist(b.x, b.y, s.x, s.y) < s.def.shield.radius * U) {
        const abs = Math.min(s.shield, dmg);
        s.shield -= abs; dmg -= abs;
        if (abs > 0 && SF.rng.fx.chance(0.3)) this.sparks(b.x, b.y, '#35E0D6');
        if (dmg <= 0) return;
      }
    }
    b.hp -= dmg;
    if (ev) ev.data.hitCount = (ev.data.hitCount || 0) + 1;
    if (b.hp <= 0) {
      b.dead = true;
      const idx = this.buildings.indexOf(b);
      if (idx >= 0) this.buildings.splice(idx, 1);
      this.stats.buildingsLost++;
      if (ev) ev.data.destroyed = (ev.data.destroyed || 0) + 1;
      this.burst(b.x, b.y, '#E8465A');
      this.shake = Math.min(1.2, this.shake + 0.7);
      this.pushLog('💥 ' + b.def.name + ' 被摧毁了！', 'crisis');
      this.toast(b.def.name + ' 被摧毁', 'crisis');
      SF.audio.boom();
      this.recalcMods();
    }
  };

  /* ================= 选择型事件 ================= */
  Game.prototype.openChoice = function (id) {
    const m = this.mods;
    let payload = null;
    if (id === 'merchant') {
      const disc = 1 - m.trade;
      const offers = SF.rng.fx.shuffle([
        { give: { ore: Math.round(150 * disc) }, get: { research: 60 }, note: '矿石换科研' },
        { give: { research: 30 }, get: { ore: Math.round(220 * disc) }, note: '科研换矿石' },
        { give: { organics: 100 }, get: { energy: Math.round(260 * disc) }, note: '有机物换能源' },
        { give: { ore: Math.round(90 * disc) }, get: { organics: 160 }, note: '矿石换食物' },
      ]).slice(0, 3);
      payload = { offers };
    } else if (id === 'ruin') {
      payload = { risk: 0.25, gainR: m.ruin > 0 ? 160 : 80 };
    } else if (id === 'migrant') {
      payload = { pop: 4, food: 80 };
    } else if (id === 'derelict') {
      payload = { risk: 0.2 };
    }
    this.pendingChoice = { id, payload };
    SF.audio.alarm();
  };

  Game.prototype.resolveChoice = function (optIdx) {
    const ch = this.pendingChoice;
    if (!ch) return;
    this.pendingChoice = null;
    const p = ch.payload;
    const good = (t) => { this.toast(t, 'good'); this.pushLog(t, 'good'); };
    const bad = (t) => { this.toast(t, 'crisis'); this.pushLog(t, 'crisis'); };
    this.stats.eventsGood++;
    if (ch.id === 'merchant') {
      if (optIdx >= 0 && optIdx < p.offers.length) {
        const o = p.offers[optIdx];
        let ok = true;
        for (const k in o.give) if ((this.res[k] || 0) < o.give[k]) ok = false;
        if (!ok) { this.toast('资源不足，交易取消', 'warn'); }
        else {
          for (const k in o.give) this.res[k] -= o.give[k];
          for (const k in o.get) this.res[k] = Math.min(this.caps[k] || 9999, (this.res[k] || 0) + o.get[k]);
          good('交易完成');
          this.stats.trades++;
          if (SF.meta) { SF.meta.addStat('trades', 1); if (SF.meta.getStat('trades') >= 3) SF.meta.unlock('trade3'); }
        }
      }
    } else if (ch.id === 'ruin') {
      if (optIdx === 0) {
        if (SF.rng.fx.chance(p.risk) && this.colonists.length > 3) {
          const c = this.colonists[SF.rng.fx.int(0, this.colonists.length - 1)];
          this.colonists.splice(this.colonists.indexOf(c), 1);
          bad('探索队遭遇防御机关，' + c.name + ' 没能回来');
          this.stats.deaths++;
        } else {
          this.res.research += p.gainR;
          good('遗迹破译成功：科研点 +' + p.gainR);
        }
      }
    } else if (ch.id === 'migrant') {
      if (optIdx === 0) {
        if (this.res.organics < p.food) { this.toast('食物不足，移民船失望地离开了', 'warn'); }
        else {
          this.res.organics -= p.food;
          for (let i = 0; i < p.pop; i++) this.addColonist();
          good(p.pop + ' 名新殖民者加入！');
        }
      }
    } else if (ch.id === 'derelict') {
      if (optIdx === 0) {
        if (SF.rng.fx.chance(p.risk)) {
          const cmd = this.buildings.find(b => b.type === 'command');
          if (cmd) { this.damageBuilding(cmd, 60, 'derelict'); }
          bad('船骸的防御系统仍在运作！指挥中枢受损');
        } else {
          const ore = SF.rng.fx.int(120, 260);
          this.res.ore = Math.min(this.caps.ore, this.res.ore + ore);
          good('回收物资：矿石 +' + ore);
        }
      }
    }
    this.scheduleNext();
  };

  /* ================= 特效钩子（render 提供） ================= */
  Game.prototype.sparks = function (x, y, color) { if (SF.render) SF.render.burst(x, y, color, 3, 40); };
  Game.prototype.burst = function (x, y, color) { if (SF.render) SF.render.burst(x, y, color, 22, 150); };

  /* ================= 目标 / 胜负 ================= */
  Game.prototype.goalProgress = function () {
    if (this.goal.type === 'pop') return { cur: this.colonists.length, target: this.goal.target };
    if (this.goal.type === 'score') return { cur: Math.floor(this.score().total), target: this.goal.target };
    const beacon = this.buildings.find(b => b.type === 'beacon');
    if (!beacon) return { cur: 0, target: 1, label: '未建造' };
    if (!beacon.built) return { cur: 0, target: 1, label: '建造中 ' + Math.floor(beacon.progress / beacon.def.buildTime * 100) + '%' };
    if (!beacon.charged) return { cur: 0, target: 1, label: '充能 ' + Math.floor(beacon.charge / (beacon.def.chargeTime * this.mods.beaconCharge) * 100) + '%' };
    return { cur: 1, target: 1, label: '就绪' };
  };

  Game.prototype.checkGoal = function () {
    if (this.goalDone) return;
    const p = this.goalProgress();
    if (p.cur >= p.target) {
      this.goalDone = true;
      this.toast('★ 殖民目标达成！可随时跃迁', 'good');
      this.pushLog('★ 殖民目标达成：' + this.goal.text, 'good');
      SF.audio.good();
      this.milestone('goal');
    }
  };

  Game.prototype.checkLose = function () {
    if (this.gameOver) return;
    if (this.colonists.length <= 0) return this.doLose('all_dead', '全体殖民者罹难');
    const cmd = this.buildings.find(b => b.type === 'command');
    if (!cmd) return this.doLose('base_lost', '指挥中枢被摧毁');
    if (this.brownoutT >= 300) return this.doLose('collapse', '能源长期赤字，基地陷入瘫痪');
  };

  Game.prototype.doLose = function (reason, text) {
    this.gameOver = true; this.won = false; this.loseReason = text;
    SF.audio.death();
    if (reason === 'all_dead' && this.time < 600 && SF.meta) SF.meta.unlock('h_ftl');
    if (this.res.ore >= 1000 && SF.meta) SF.meta.unlock('rich1000');
    if (SF.meta) SF.meta.noteLoss();
  };

  /** 发起跃迁（目标达成后）。返回 'next' | 'final' */
  Game.prototype.warp = function () {
    if (!this.goalDone) return null;
    if (this.speed === 3 && SF.meta) SF.meta.unlock('maxspeed');
    if (SF.meta) SF.meta.unlock('first_warp');
    this.stats.warps++;
    const isFinal = this.mode === 'campaign' && this.station >= 9;
    this.won = true;
    this.gameOver = true;
    return isFinal ? 'final' : 'next';
  };

  /** 跃迁携带物（进入下一站用） */
  Game.prototype.packCarry = function () {
    const keep = 0.5 + (this.lfx.warpCarry || 0);
    return {
      pop: this.colonists.length,
      res: {
        ore: Math.round(this.res.ore * keep),
        organics: Math.round(this.res.organics * keep),
        energy: Math.round(this.res.energy * 0.6),
        research: Math.round(this.res.research),
      },
      techs: this.researched.slice(),
    };
  };

  /* ================= 评分 ================= */
  Game.prototype.score = function () {
    const s = this.stats;
    const surv = Math.min(15, this.time / 60 * 0.6);
    const pop = Math.min(25, s.peakPop * 0.45);
    const tech = Math.min(15, this.researched.length * 1.2);
    const evRatio = s.eventsTotal > 0 ? s.eventsGood / s.eventsTotal : 1;
    const ev = Math.min(15, evRatio * 15);
    const resScore = Math.min(15, (this.res.ore + this.res.organics + this.res.energy) / 150);
    const rsh = Math.min(10, this.res.research / 60);
    const st = this.station * 2;
    const total = clamp(surv + pop + tech + ev + resScore + rsh + st, 0, 100);
    const parts = [
      ['生存时长', Math.round(surv)], ['人口峰值', Math.round(pop)],
      ['科技', Math.round(tech)], ['事件处理', Math.round(ev)],
      ['资源储备', Math.round(resScore)], ['科研储备', Math.round(rsh)],
      ['星系进度', Math.round(st)],
    ];
    let rank = 'D';
    for (const r of D.RANKS) if (total >= r.min) { rank = r.rank; break; }
    return { total: Math.round(total), parts, rank };
  };

  Game.prototype.legacyEarn = function () {
    const sc = this.score();
    let pts = Math.round(sc.total / 2) + this.station * 3;
    if (this.won) pts += 20;
    if (this.mode === 'weekly') pts = Math.round(pts * 1.2);
    return pts;
  };

  /* ================= 教程 ================= */
  Game.prototype.TUT_STEPS = [
    { id: 'land', text: '选择降落点，建立指挥中枢' },
    { id: 'mine', text: '建造 1 座采矿场（毗邻矿脉）' },
    { id: 'ore50', text: '累计采集 50 矿石' },
    { id: 'gen', text: '建造 1 座聚变发电机' },
    { id: 'house', text: '建造 1 座居住舱' },
    { id: 'event', text: '抵御第一次事件威胁' },
  ];
  Game.prototype.tutCheck = function () {
    if (!this.tutActive) return -1;
    const st = this.TUT_STEPS;
    let step = this.tutStep;
    while (step < st.length) {
      const id = st[step].id;
      const ok = id === 'land' ? !!this.milestones.land
        : id === 'mine' ? this.buildings.some(b => b.type === 'mine' && b.built)
        : id === 'ore50' ? this.stats.oreMined >= 50
        : id === 'gen' ? this.buildings.some(b => b.type === 'generator' && b.built)
        : id === 'house' ? this.buildings.some(b => b.type === 'housing' && b.built)
        : id === 'event' ? this.firstEventDone && this.time > 0
        : true;
      if (!ok) break;
      step++;
    }
    if (step !== this.tutStep) {
      this.tutStep = step;
      if (step >= st.length) {
        this.tutActive = false;
        this.toast('教学完成！星穹在等待你的开拓', 'good');
        SF.audio.good();
        // 无缝接上「建议目标」软链：教学结束 ≠ 没有引导
        this.sugActive = true; this.sugIdx = 0; this.sugDoneAt = -1;
        this.toast('左上新增「建议目标」链，非强制，可随时忽略', 'sys');
      }
    }
    return this.tutStep;
  };

  /* ---- 教学后的建议目标链（软引导：逐条推进，完成即淡出换下一条） ---- */
  Game.prototype.SUGGEST_GOALS = [
    { id: 'energy', text: '把电力转正：能源净收支 ≥ 0，储量攒到 40', check: g => (g.rates.energyNet || 0) >= 0 && g.res.energy >= 40 },
    { id: 'food', text: '保障食物：建水培农场，让有机物净产出转正', check: g => (g.rates.food || 0) > 0 },
    { id: 'ore100', text: '储备 100 矿石，为扩建与防御做准备', check: g => g.res.ore >= 100 },
    { id: 'turret', text: '建造 1 座防御炮塔——威胁会一站比一站高', check: g => g.buildings.some(b => b.type === 'turret' && b.built) },
    { id: 'lab', text: '建 1 座研究站：科研点能换成永久强化', check: g => g.buildings.some(b => b.type === 'lab' && b.built) },
    { id: 'goal_half', text: '向殖民目标推进过半（顶栏进度条）', check: g => g.goalProgress().cur >= g.goalProgress().target * 0.5 },
  ];
  Game.prototype.sugCheck = function () {
    if (!this.sugActive || this.sugDismissed || this.gameOver) return;
    const chain = this.SUGGEST_GOALS;
    const cur = chain[this.sugIdx];
    if (!cur) { this.sugActive = false; return; }
    if (this.sugDoneAt < 0) {
      let ok = false;
      try { ok = !!cur.check(this); } catch (e) { ok = false; }
      if (ok) {
        this.sugDoneAt = this.time;
        this.toast('✓ 建议达成：' + cur.text, 'good');
        try { SF.audio.good(); } catch (e) {}
      }
      return;
    }
    // 达成后展示 2.6 秒（按游戏内时间计时，暂停时不流逝）再淡出换下一条
    if (this.time - this.sugDoneAt >= 2.6) {
      this.sugIdx++; this.sugDoneAt = -1;
      if (this.sugIdx >= chain.length) {
        this.sugActive = false;
        this.toast('★ 建议目标全部达成——星穹任你开拓', 'good');
      }
    }
  };

  Game.prototype.milestone = function (id) {
    if (this.milestones[id]) return;
    this.milestones[id] = true;
    if (SF.meta) SF.meta.saveRunSnapshot(this);
  };

  /* ================= 序列化（里程碑存档） ================= */
  Game.prototype.serialize = function () {
    return {
      v: 1, mode: this.mode, seed: this.seed, station: this.station, difficulty: this.difficulty,
      threat: this.threatFixed, resMul: this.resMul, eventsOn: this.eventsOn,
      res: this.res, time: this.time, morale: this.morale, brownoutT: this.brownoutT,
      researched: this.researched, goal: this.goal, siteIdx: this.map.sites.indexOf(this.site),
      buildings: this.buildings.map(b => ({
        t: b.type, x: Math.round(b.x), y: Math.round(b.y), hp: Math.round(b.hp),
        built: b.built, prog: Math.round(b.progress * 10) / 10, charge: Math.round(b.charge), charged: !!b.charged,
      })),
      colonists: this.colonists.map(c => ({ n: c.name, hp: Math.round(c.hp), inf: c.infected })),
      stats: this.stats, tutStep: this.tutStep, tutActive: this.tutActive,
      sugIdx: this.sugIdx, sugActive: this.sugActive, sugDismissed: this.sugDismissed,
      nextEventAt: this.nextEventAt, firstEventDone: this.firstEventDone,
      carriedTechs: this.carriedTechs, carry: this.carry,
    };
  };

  SF.Game = Game;
  SF.Game.deserialize = function (snap) {
    const g = new Game({
      mode: snap.mode, seed: snap.seed, station: snap.station, difficulty: snap.difficulty,
      threat: snap.threat, resMul: snap.resMul, eventsOn: snap.eventsOn,
      carriedTechs: snap.carriedTechs || [], carry: null,
    });
    g.researched = snap.researched.slice();
    g.recalcMods();
    g.setSite(snap.siteIdx >= 0 ? snap.siteIdx : 0);
    // 移除 setSite 生成的默认实体，重建快照状态
    g.buildings.length = 0;
    g.colonists.length = 0;
    for (const b of snap.buildings) {
      const nb = g.addBuilding(b.t, b.x, b.y, b.built);
      nb.hp = b.hp; nb.progress = b.prog;
      if (nb.def.shield) { nb.shieldMax = nb.def.shield.amount * g.mods.shieldAmt; nb.shield = nb.shieldMax; }
      if (b.charged) nb.charged = true;
      nb.charge = b.charge;
    }
    for (const c of snap.colonists) {
      const nc = g.addColonist();
      nc.name = c.n; nc.hp = c.hp; nc.infected = !!c.inf;
    }
    g.res = snap.res; g.time = snap.time; g.morale = snap.morale; g.brownoutT = snap.brownoutT || 0;
    g.goal = snap.goal; g.stats = snap.stats;
    g.tutStep = snap.tutStep || 0; g.tutActive = !!snap.tutActive;
    // 建议目标链状态（旧存档无这些字段 → 保持默认关闭，教学完成时才自动开启）
    g.sugActive = !!snap.sugActive; g.sugIdx = snap.sugIdx || 0; g.sugDismissed = !!snap.sugDismissed;
    g.nextEventAt = snap.nextEventAt || g.time + 60;
    g.firstEventDone = !!snap.firstEventDone;
    g.assignJobs(); g.refreshCaps();
    g.pushLog('读取里程碑存档——30 秒后该存档将自动销毁（永久死亡规则）。', 'warn');
    return g;
  };
})();
