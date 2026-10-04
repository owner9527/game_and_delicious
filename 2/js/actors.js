/* ============================================================
 * actors.js — 实体与 AI:玩家 / 工人(状态机+工作台) / 蚀影兽 / 无人机
 * 每帧系统循环处理:采集 → 运输 → 建造 → 生产。
 * ============================================================ */
'use strict';

const WORKER_NAMES = ['阿石','小满','老周','阿枝','春禾','铁蛋','杏儿','二狗','莫里','陆桑','阿禾','石头'];

const Actors = {
  nameIdx: 0,

  /* ============ 实体工厂 ============ */
  spawnPlayer(x, y){
    return ECS.spawn('player', {
      pos: { x, y }, dir: 1,
      body: { hp: 100, maxHp: 100, hunger: 100 },
      move: { speed: BAL.playerSpeed, path: null, wp: 0 },
      combat: { dmg: BAL.playerDmg, timer: 0 },
      auto: null, // {kind:'harvest'|'attack'|'build', ...}
      hitFlash: 0,
    });
  },
  spawnWorker(x, y){
    const name = WORKER_NAMES[this.nameIdx++ % WORKER_NAMES.length] + (this.nameIdx > WORKER_NAMES.length ? (Math.floor(this.nameIdx / WORKER_NAMES.length) + 1) + '号' : '');
    const e = ECS.spawn('worker', {
      pos: { x, y }, dir: 1,
      body: { hp: 80, maxHp: 80, hunger: 80 },
      move: { speed: BAL.workerSpeed, path: null, wp: 0 },
      carry: { item: null, n: 0, cap: WORKER_CARRY },
      worker: { name },
      combat: { dmg: 7, timer: 0 },
      ai: { state: 'idle', job: null, timer: 0, repathT: 0, lastX: x, lastY: y, stuckT: 0,
            wanderT: 1 + Math.random() * 2, fightT: 0 },
      hitFlash: 0,
    });
    return e;
  },
  spawnMonster(x, y, day){
    const hp = BAL.monsterHp + BAL.monsterHpPerDay * (day - 1);
    return ECS.spawn('monster', {
      pos: { x, y }, dir: 1,
      body: { hp, maxHp: hp },
      move: { speed: BAL.monsterSpeed + Math.random() * 18, path: null, wp: 0 },
      monster: { dmg: BAL.monsterDmg + day, timer: 0, targetId: 0, retargetT: 0, wanderA: Math.random() * 6.28 },
      spawnT: 0.6, hitFlash: 0,
    });
  },
  spawnDrone(x, y, bayId){
    return ECS.spawn('drone', {
      pos: { x, y },
      move: { speed: BAL.droneSpeed, path: null, wp: 0 },
      drone: { bayId, state: 'seek', tx: -1, ty: -1, timer: 0, carry: 0, hover: Math.random() * 6.28 },
    });
  },

  /* ============ 寻路与移动 ============ */
  setPath(e, tx, ty){
    const pos = e.comps.pos;
    const path = World.findPath(Math.floor(pos.x / TILE), Math.floor(pos.y / TILE), tx, ty);
    e.comps.move.path = path;
    e.comps.move.wp = 0;
    return !!path && path.length >= 0;
  },
  followPath(e, dt){
    const mv = e.comps.move, pos = e.comps.pos;
    if(!mv.path || mv.wp >= mv.path.length) return 'arrived';
    const wp = mv.path[mv.wp];
    const cx = Util.tCenter(wp.x), cy = Util.tCenter(wp.y);
    const d = Util.dist(pos.x, pos.y, cx, cy);
    const step = mv.speed * dt;
    if(d <= step + 0.6){
      pos.x = cx; pos.y = cy; mv.wp++;
      return mv.wp >= mv.path.length ? 'arrived' : 'moving';
    }
    pos.x += (cx - pos.x) / d * step;
    pos.y += (cy - pos.y) / d * step;
    if(Math.abs(cx - pos.x) > 1) e.dir = cx > pos.x ? 1 : -1;
    return 'moving';
  },
  clearPath(e){ e.comps.move.path = null; },
  /* 走到目标格的相邻可走格 */
  pathToAdjacent(e, tx, ty){
    const pos = e.comps.pos;
    const etx = Math.floor(pos.x / TILE), ety = Math.floor(pos.y / TILE);
    if(Math.abs(etx - tx) <= 1 && Math.abs(ety - ty) <= 1) return true; // 已在旁边
    let best = null, bd = 1e9;
    for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
      if(!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if(!World.walkable(nx, ny)) continue;
      const d = (nx - etx) * (nx - etx) + (ny - ety) * (ny - ety);
      if(d < bd){ bd = d; best = [nx, ny]; }
    }
    if(!best) return false;
    return this.setPath(e, best[0], best[1]);
  },

  /* ============ 近战 ============ */
  meleeHit(att, target, dmg){
    const tb = target.comps.body;
    if(!tb) return;
    tb.hp -= dmg;
    target.hitFlash = 0.15;
    const p = target.comps.pos;
    FX.burst(p.x, p.y, target.type === 'monster' ? '#b05ae0' : '#e07050', 5, 50);
    const pp = G.player.comps.pos;
    if(Util.dist(pp.x, pp.y, p.x, p.y) < 480) Sfx.hit();
    if(tb.hp <= 0) this.onKill(target, att);
  },
  onKill(target, att){
    const p = target.comps.pos;
    if(target.type === 'monster'){
      ECS.kill(target);
      G.stats.kills++;
      Sfx.monsterDie();
      FX.burst(p.x, p.y, '#8a3ac0', 14, 90);
      if(Math.random() < 0.32){
        const n = 1 + (Math.random() < 0.3 ? 1 : 0);
        Pool.add('crystal', n);
        FX.float(p.x, p.y, '水晶 +' + n, '#57d7d0');
      }
    } else if(target.type === 'worker'){
      ECS.kill(target);
      const nm = target.comps.worker ? target.comps.worker.name : '工人';
      UI.msg(nm + ' 阵亡了……', 'warn');
      Sfx.alarm();
      FX.burst(p.x, p.y, '#e07050', 16, 80);
    }
  },

  /* ============ 玩家点击交互 ============ */
  playerClick(wx, wy, hitEnt){
    const pl = G.player;
    if(!pl || pl.dead) return;
    if(hitEnt && hitEnt.type === 'monster'){
      pl.comps.auto = { kind: 'attack', id: hitEnt.id };
      return;
    }
    if(hitEnt && hitEnt.type === 'building'){
      const b = hitEnt.comps.building;
      // 点击施工中的蓝图 = 取消并全额退款(工人仍会自动施工未取消的蓝图)
      if(b.state === 'blueprint'){ Buildings.cancelBlueprint(hitEnt); return; }
      UI.showBuildingInfo(hitEnt);
      return;
    }
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const { node } = World.nodeAt(tx, ty);
    if(node){ pl.comps.auto = { kind: 'harvest', tx, ty }; return; }
    pl.comps.auto = null;
  },
  /* 玩家自动任务(点击后的自动寻路执行) */
  updatePlayerAuto(dt){
    const pl = G.player;
    const auto = pl.comps.auto;
    if(!auto) return;
    const pos = pl.comps.pos;
    let targetX, targetY, inRange = false;
    if(auto.kind === 'harvest'){
      const { node } = World.nodeAt(auto.tx, auto.ty);
      if(!node){ pl.comps.auto = null; return; }
      targetX = Util.tCenter(auto.tx); targetY = Util.tCenter(auto.ty);
      inRange = Util.dist(pos.x, pos.y, targetX, targetY) <= BAL.reach * TILE;
      if(inRange){
        this.clearPath(pl);
        pl.combat.timer -= dt;
        if(pl.combat.timer <= 0){
          pl.combat.timer = BAL.playerAtkCd;
          const r = this.hitNode(auto.tx, auto.ty, node);
          if(r){
            const added = Pool.add(r.item, r.gain);
            FX.float(pos.x, pos.y - 14, ITEMS[r.item].name + ' +' + added, ITEMS[r.item].color);
            if(added < r.gain) UI.msgFull('仓储已满,产出浪费了!建造仓储堆扩容', 'warn');
          }
        }
        return;
      }
    } else if(auto.kind === 'attack'){
      const t = ECS.get(auto.id);
      if(!t || t.dead || t.comps.body.hp <= 0){ pl.comps.auto = null; return; }
      const tp = t.comps.pos;
      inRange = Util.dist(pos.x, pos.y, tp.x, tp.y) <= BAL.reach * TILE;
      if(inRange){
        this.clearPath(pl);
        pl.combat.timer -= dt;
        if(pl.combat.timer <= 0){
          pl.combat.timer = BAL.playerAtkCd;
          pl.dir = tp.x > pos.x ? 1 : -1;
          this.meleeHit(pl, t, pl.combat.dmg);
        }
        return;
      }
      targetX = tp.x; targetY = tp.y;
    } else if(auto.kind === 'build'){
      const b = ECS.get(auto.id);
      if(!b || b.dead || b.comps.building.state !== 'blueprint'){ pl.comps.auto = null; return; }
      const bp = b.comps.pos;
      inRange = Util.dist(pos.x, pos.y, bp.x, bp.y) <= BAL.reach * TILE;
      if(inRange){
        this.clearPath(pl);
        pl.combat.timer -= dt;
        if(pl.combat.timer <= 0){
          pl.combat.timer = 0.4;
          Buildings.hammer(b, 1.2);
        }
        return;
      }
      targetX = bp.x; targetY = bp.y;
    }
    // 走向目标
    const etx = Math.floor(pos.x / TILE), ety = Math.floor(pos.y / TILE);
    const ttx = Math.floor(targetX / TILE), tty = Math.floor(targetY / TILE);
    const mv = pl.comps.move;
    if(!mv.path || mv.repathT === undefined || mv.repathT <= 0 ||
       (mv.dest && (mv.dest.x !== ttx || mv.dest.y !== tty))){
      this.setPath(pl, ttx, tty);
      mv.dest = { x: ttx, y: tty };
      mv.repathT = 1.5;
    }
    mv.repathT -= dt;
    this.followPath(pl, dt);
  },
  /* 对资源节点挥击一次,返回 {item, gain} 或 null */
  hitNode(tx, ty, node){
    const def = NODES[node.t];
    const gain = Math.min(1, node.amt);
    if(gain <= 0) return null;
    node.amt -= gain;
    const cx = Util.tCenter(tx), cy = Util.tCenter(ty);
    const pp = G.player.comps.pos;
    if(Util.dist(pp.x, pp.y, cx, cy) < 520){
      Sfx.chop();
      FX.burst(cx, cy, ITEMS[def.item].color, 5, 55);
    }
    if(node.amt <= 0){
      World.setNode(tx, ty, null);
      FX.burst(cx, cy, ITEMS[def.item].color, 12, 80);
      G.stats.harvested += def.amount;
    }
    return { item: def.item, gain };
  },

  /* ============ 工人 AI 状态机 ============ */
  updateWorker(e, dt){
    const ai = e.ai, body = e.comps.body, pos = e.comps.pos;
    ai.timer -= dt;

    // 受击反击 / 恐慌优先级最高(血量过半就撤,工人生命更值钱)
    const threat = this.nearestMonster(pos.x, pos.y, 3.6 * TILE);
    if(body.hp < body.maxHp * 0.5 && ai.state !== 'flee'){
      this.workerFlee(e);
    } else if(threat && ai.state !== 'flee' && ai.state !== 'fight' && ai.state !== 'operate' && body.hp > body.maxHp * 0.5){
      this.dropJob(e);
      ai.state = 'fight'; ai.fightT = 6;
    }

    switch(ai.state){
      case 'idle': this.wIdle(e, dt); break;
      case 'goto': this.wGoto(e, dt); break;
      case 'harvest': this.wHarvest(e, dt); break;
      case 'haul': this.wHaul(e, dt); break;
      case 'build': this.wBuild(e, dt); break;
      case 'farmwork': this.wFarm(e, dt); break;
      case 'operate': this.wOperate(e, dt); break;
      case 'fight': this.wFight(e, dt); break;
      case 'flee': this.wFlee(e, dt); break;
    }
  },

  wIdle(e, dt){
    const ai = e.ai, body = e.comps.body;
    // 手里有货先去卸
    if(e.comps.carry.n > 0){
      if(ai.haulRetry > 0){ ai.haulRetry -= dt; }
      else { ai.state = 'haul'; this.clearPath(e); return; }
    }
    // 饿了先吃
    if(body.hunger < BAL.hungerEatAt && Pool.eat(e)) return;
    // 找工作
    const job = this.claimJob(e);
    if(job){ this.startJob(e, job); return; }
    // 没活:在篝火附近游荡
    ai.wanderT -= dt;
    if(ai.wanderT <= 0){
      ai.wanderT = 2.5 + Math.random() * 3;
      const home = G.campfirePos || { x: TILE * 2, y: TILE * 2 };
      const tx = Math.floor(home.x / TILE) + Math.floor(Math.random() * 9) - 4;
      const ty = Math.floor(home.y / TILE) + Math.floor(Math.random() * 9) - 4;
      if(World.walkable(tx, ty)) this.setPath(e, tx, ty);
    }
    this.followPath(e, dt);
  },
  wGoto(e, dt){
    const r = this.followPath(e, dt);
    if(r === 'arrived') this.onArrive(e);
  },
  onArrive(e){
    const ai = e.ai, job = ai.job;
    this.clearPath(e);
    if(!job){ ai.state = 'idle'; return; }
    if(job.type === 'harvest'){
      const { node } = World.nodeAt(job.tx, job.ty);
      if(node && node.marked) ai.state = 'harvest';
      else this.dropJob(e);
    } else if(job.type === 'build'){
      ai.state = 'build';
    } else if(job.type === 'farm'){
      ai.state = 'farmwork';
    } else if(job.type === 'operate'){
      const b = ECS.get(job.bid);
      if(b && !b.dead && b.comps.building.state === 'done'){ ai.state = 'operate'; ai.repathT = 3; }
      else this.dropJob(e);
    } else if(job.type === 'haul'){
      ai.state = 'haul';
    } else {
      ai.state = 'idle';
    }
  },
  /* 资源点开采 */
  wHarvest(e, dt){
    const ai = e.ai, carry = e.comps.carry;
    const job = ai.job;
    if(!job){ ai.state = 'idle'; return; }
    const { node } = World.nodeAt(job.tx, job.ty);
    if(!node || !node.marked){ this.finishJob(e); return; }
    if(carry.n >= carry.cap){ this.finishJob(e); return; }
    if(ai.timer <= 0){
      ai.timer = BAL.harvestInterval;
      const r = this.hitNode(job.tx, job.ty, node);
      if(r){
        carry.item = r.item; carry.n += r.gain;
        if(carry.n >= carry.cap || !World.nodeAt(job.tx, job.ty).node){ this.finishJob(e); return; }
      } else {
        this.finishJob(e); return;
      }
    }
  },
  /* 搬运回仓储堆 */
  wHaul(e, dt){
    const ai = e.ai, carry = e.comps.carry;
    const sp = Buildings.nearestStockpile(e.comps.pos.x, e.comps.pos.y);
    const dest = sp ? sp.comps.pos : (G.campfirePos || { x: TILE * 2, y: TILE * 2 });
    if(Util.dist(e.comps.pos.x, e.comps.pos.y, dest.x, dest.y) < TILE * 1.5){
      if(carry.n > 0){
        const added = Pool.add(carry.item, carry.n);
        if(added > 0){
          carry.n -= added;
          FX.float(e.comps.pos.x, e.comps.pos.y - 10, ITEMS[carry.item].name + ' +' + added, ITEMS[carry.item].color);
        }
        if(carry.n > 0){
          // 仓储放不下(满仓/食物保底):货先扛着,稍后再来卸,不丢弃
          this.dropJob(e);
          ai.state = 'idle';
          ai.haulRetry = 3;
          return;
        }
        carry.item = null; carry.n = 0;
      }
      this.dropJob(e);
      ai.state = 'idle';
      return;
    }
    if(!e.comps.move.path){
      const tx = Math.floor(dest.x / TILE), ty = Math.floor(dest.y / TILE);
      if(!this.pathToAdjacent(e, tx, ty)){
        // 暂时到不了:先搁置,稍后再试
        this.dropJob(e);
        ai.state = 'idle';
        ai.haulRetry = 3;
      }
    }
    this.followPath(e, dt);
  },
  /* 施工 */
  wBuild(e, dt){
    const ai = e.ai;
    const b = ai.job ? ECS.get(ai.job.bid) : null;
    if(!b || b.dead || b.comps.building.state !== 'blueprint'){ this.finishJob(e); return; }
    if(ai.timer <= 0){
      ai.timer = 0.5;
      Buildings.hammer(b, BAL.buildRate);
      FX.burst(b.comps.pos.x, b.comps.pos.y - 6, '#e8c26a', 3, 40);
      if(b.comps.building.state === 'done'){ this.finishJob(e); return; }
    }
  },
  /* 农活:播种 / 收割 */
  wFarm(e, dt){
    const ai = e.ai;
    const b = ai.job ? ECS.get(ai.job.bid) : null;
    const action = ai.job && ai.job.action;
    if(!b || b.dead || b.comps.building.state !== 'done'){ this.finishJob(e); return; }
    const fm = b.comps.farm;
    if(!fm){ this.finishJob(e); return; }
    if(ai.timer <= 0){
      if(action === 'plant' && fm.crop === 0){ fm.crop = 1; fm.growth = 0; FX.float(b.comps.pos.x, b.comps.pos.y, '播种', '#a8d878'); }
      else if(action === 'harvest' && fm.crop === 1 && fm.growth >= 1){
        fm.crop = 0;
        const n = 3 + (Math.random() < 0.4 ? 1 : 0);
        const added = Pool.add('wheat', n);
        FX.float(b.comps.pos.x, b.comps.pos.y, '小麦 +' + added, ITEMS.wheat.color);
      }
      this.finishJob(e);
      return;
    }
  },
  /* 操作建筑(加速生产/科研) */
  wOperate(e, dt){
    const ai = e.ai;
    const b = ai.job ? ECS.get(ai.job.bid) : null;
    if(!b || b.dead || b.comps.building.state !== 'done'){ this.finishJob(e); return; }
    const bd = b.comps.building;
    // 建筑不再需要操作(无原料/满仓)→ 走人
    if(!Buildings.needsOperator(b)){ this.finishJob(e); return; }
    // 定期复审:出现更高优先级的活(收割/施工)就让岗
    ai.repathT -= dt;
    if(ai.repathT <= 0){
      ai.repathT = 2;
      for(const j of G.jobs){
        if(j.claimedBy || (j.prio || 5) < 5) continue;
        if(this.jobValid(j)){ this.dropJob(e); ai.state = 'idle'; return; }
      }
    }
    bd.operatorId = e.id;
    // 吃饭不打断工作
    if(e.comps.body.hunger < BAL.hungerEatAt * 0.6) Pool.eat(e);
    // 靠近一点站定
    const d = Util.dist(e.comps.pos.x, e.comps.pos.y, b.comps.pos.x, b.comps.pos.y);
    if(d > TILE * 1.35){ this.followPath(e, dt); }
  },
  /* 战斗 */
  wFight(e, dt){
    const ai = e.ai;
    ai.fightT -= dt;
    const pos = e.comps.pos;
    const m = this.nearestMonster(pos.x, pos.y, 4.5 * TILE);
    if(!m || ai.fightT <= 0 || e.comps.body.hp < e.comps.body.maxHp * 0.25){
      ai.state = 'idle'; ai.job = null; this.clearPath(e); return;
    }
    const mp = m.comps.pos;
    e.combat.timer -= dt;
    if(Util.dist(pos.x, pos.y, mp.x, mp.y) < TILE * 1.15){
      this.clearPath(e);
      if(e.combat.timer <= 0){
        e.combat.timer = 0.75;
        e.dir = mp.x > pos.x ? 1 : -1;
        this.meleeHit(e, m, e.combat.dmg);
      }
    } else {
      // 追击:直线逼近
      const step = e.comps.move.speed * dt;
      const d = Util.dist(pos.x, pos.y, mp.x, mp.y);
      const nx = pos.x + (mp.x - pos.x) / d * step, ny = pos.y + (mp.y - pos.y) / d * step;
      if(World.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))){ pos.x = nx; pos.y = ny; e.dir = mp.x > pos.x ? 1 : -1; }
      else { this.clearPath(e); }
    }
  },
  /* 逃跑回篝火 */
  workerFlee(e){
    const ai = e.ai;
    this.dropJob(e);
    ai.state = 'flee';
    ai.fleeBoost = true;
    this.clearPath(e);
  },
  wFlee(e, dt){
    const ai = e.ai, body = e.comps.body;
    if(body.hp > body.maxHp * 0.75){ ai.state = 'idle'; ai.fleeBoost = false; this.clearPath(e); return; }
    // 逃跑时冲刺
    const base = e.comps.move.speed;
    e.comps.move.speed = BAL.workerSpeed * 1.35;
    const home = G.campfirePos || { x: TILE * 2, y: TILE * 2 };
    const d = Util.dist(e.comps.pos.x, e.comps.pos.y, home.x, home.y);
    if(d > TILE * 2.2){
      if(!e.comps.move.path){
        const tx = Math.floor(home.x / TILE), ty = Math.floor(home.y / TILE);
        if(!this.pathToAdjacent(e, tx, ty)){ ai.state = 'idle'; }
      }
      this.followPath(e, dt);
    }
    e.comps.move.speed = base;
    // 篝火旁回复(受饱食限制)
    body.hp = Math.min(body.maxHp, body.hp + 3 * dt);
  },

  /* ============ 工作台(任务清单) ============ */
  addJob(job){
    job.id = G.nextJobId++;
    job.claimedBy = 0;
    G.jobs.push(job);
    return job;
  },
  removeJobsWhere(fn){
    for(let i = G.jobs.length - 1; i >= 0; i--){
      if(fn(G.jobs[i])){
        const j = G.jobs[i];
        if(j.claimedBy){
          const w = ECS.get(j.claimedBy);
          if(w && w.ai && w.ai.job === j){ w.ai.job = null; if(w.ai.state !== 'haul') w.ai.state = 'idle'; this.clearPath(w); }
        }
        G.jobs.splice(i, 1);
      }
    }
  },
  claimJob(e){
    let best = null, bestScore = -1e9;
    const pos = e.comps.pos;
    for(const j of G.jobs){
      if(j.claimedBy) continue;
      if(!this.jobValid(j)) continue;
      const jx = j.tx !== undefined ? Util.tCenter(j.tx) : (j.bid ? ECS.get(j.bid)?.comps.pos.x : pos.x);
      const jy = j.ty !== undefined ? Util.tCenter(j.ty) : (j.bid ? ECS.get(j.bid)?.comps.pos.y : pos.y);
      const d = Util.dist(pos.x, pos.y, jx, jy);
      const score = (j.prio || 5) * 100 - d / TILE * 4;
      if(score > bestScore){ bestScore = score; best = j; }
    }
    if(best){
      best.claimedBy = e.id;
      return best;
    }
    return null;
  },
  jobValid(j){
    if(j.type === 'harvest'){
      const { node } = World.nodeAt(j.tx, j.ty);
      return !!(node && node.marked);
    }
    if(j.type === 'build' || j.type === 'farm' || j.type === 'operate'){
      const b = ECS.get(j.bid);
      if(!b || b.dead) return false;
      const bd = b.comps.building;
      if(j.type === 'build') return bd.state === 'blueprint';
      if(bd.state !== 'done') return false;
      if(j.type === 'farm'){
        const fm = b.comps.farm;
        if(!fm) return false;
        return (j.action === 'plant' && fm.crop === 0) || (j.action === 'harvest' && fm.crop === 1 && fm.growth >= 1);
      }
      if(j.type === 'operate') return Buildings.needsOperator(b);
    }
    return true;
  },
  startJob(e, job){
    const ai = e.ai;
    ai.job = job;
    ai.state = 'goto';
    let tx, ty, adjacent = false;
    if(job.type === 'harvest'){ tx = job.tx; ty = job.ty; }
    else {
      const b = ECS.get(job.bid);
      if(!b){ this.dropJob(e); return; }
      tx = Math.floor(b.comps.pos.x / TILE); ty = Math.floor(b.comps.pos.y / TILE);
      adjacent = true; // 建筑类走到旁边(农田可走上去)
      if(b.comps.building.def === 'farm') adjacent = false;
    }
    const pos = e.comps.pos;
    const etx = Math.floor(pos.x / TILE), ety = Math.floor(pos.y / TILE);
    if(etx === tx && ety === ty){ this.onArrive(e); return; }
    let ok;
    if(adjacent){
      ok = this.pathToAdjacent(e, tx, ty);
    } else {
      if(!World.walkable(tx, ty)){ this.dropJob(e); return; }
      ok = this.setPath(e, tx, ty);
    }
    if(!ok){ this.dropJob(e); }
  },
  finishJob(e){
    const ai = e.ai;
    const job = ai.job;
    // 采集完若手里有货 → 去卸货(原采集任务保持开放,留给下一个工人)
    if(job && job.type === 'harvest' && e.comps.carry.n > 0){
      if(job.claimedBy === e.id) job.claimedBy = 0;
      ai.job = { type: 'haul', claimedBy: e.id };
      ai.state = 'haul';
      this.clearPath(e);
      return;
    }
    this.dropJob(e);
    ai.state = 'idle';
  },
  dropJob(e){
    const ai = e.ai;
    if(ai.job){
      if(ai.job.claimedBy === e.id) ai.job.claimedBy = 0;
      if(ai.job.type === 'operate' && ai.job.bid){
        const b = ECS.get(ai.job.bid);
        if(b && !b.dead && b.building.operatorId === e.id) b.building.operatorId = 0;
      }
    }
    ai.job = null;
    this.clearPath(e);
  },

  /* ============ 蚀影兽 AI ============ */
  updateMonster(e, dt){
    const m = e.monster, pos = e.comps.pos, body = e.comps.body;
    if(e.spawnT > 0){ e.spawnT -= dt; return; }
    m.retargetT -= dt;
    m.timer -= dt;
    // 选目标:优先啃建筑;只有贴脸的工人才顺手攻击
    if(m.retargetT <= 0){
      m.retargetT = 1.6;
      m.targetId = 0;
      let bd = 6 * TILE;
      for(const t of ECS.query('pos', 'body')){
        if(t.type !== 'worker' && t.type !== 'player') continue;
        const d = Util.dist(pos.x, pos.y, t.comps.pos.x, t.comps.pos.y);
        if(d < bd){ bd = d; m.targetId = t.id; }
      }
      if(!m.targetId){
        let bbd = 34 * TILE;
        for(const b of ECS.query('building')){
          if(b.comps.building.state !== 'done') continue;
          const d = Util.dist(pos.x, pos.y, b.comps.pos.x, b.comps.pos.y);
          if(d < bbd){ bbd = d; m.targetId = b.id; }
        }
      }
      if(!m.targetId){
        let abd = 16 * TILE;
        for(const t of ECS.query('pos', 'body')){
          if(t.type !== 'worker' && t.type !== 'player') continue;
          const d = Util.dist(pos.x, pos.y, t.comps.pos.x, t.comps.pos.y);
          if(d < abd){ abd = d; m.targetId = t.id; }
        }
      }
    }
    let target = m.targetId ? ECS.get(m.targetId) : null;
    if(!target || target.dead){ m.targetId = 0; return; }
    const tp = target.comps.pos;
    const d = Util.dist(pos.x, pos.y, tp.x, tp.y);
    // 攻击
    if(d < TILE * 1.05){
      if(m.timer <= 0){
        m.timer = BAL.monsterAtkCd;
        e.dir = tp.x > pos.x ? 1 : -1;
        if(target.type === 'building') Buildings.damage(target, m.dmg);
        else this.meleeHit(e, target, m.dmg);
      }
      return;
    }
    // 贪心移动:被挡住时啃墙;惧火时止步于火光边界
    const step = e.comps.move.speed * dt;
    const nx = pos.x + (tp.x - pos.x) / d * step;
    const ny = pos.y + (tp.y - pos.y) / d * step;
    const ntx = Math.floor(nx / TILE), nty = Math.floor(ny / TILE);
    if(World.walkable(ntx, nty)){
      // 夜晚:不敢踏入火光(除非已在光里)
      if(Systems.darknessAt(G.time.dayFrac) > 0.5 &&
         !Systems.nearLight(pos.x, pos.y, 'burn') && Systems.nearLight(nx, ny, 'fear')){
        m.wanderA += dt * 2.5;
        pos.x += Math.cos(m.wanderA) * step * 0.35;
        pos.y += Math.sin(m.wanderA) * step * 0.35;
        return;
      }
      pos.x = nx; pos.y = ny; e.dir = tp.x > pos.x ? 1 : -1;
    }
    else {
      const block = Buildings.buildingAt(ntx, nty);
      if(block && m.timer <= 0){
        m.timer = BAL.monsterAtkCd;
        Buildings.damage(block, m.dmg);
        FX.burst(Util.tCenter(ntx), Util.tCenter(nty), '#c8a06a', 4, 40);
      } else if(!block){
        // 绕行:尝试单轴
        const sx = pos.x + Math.sign(tp.x - pos.x) * step;
        const sy = pos.y + Math.sign(tp.y - pos.y) * step;
        if(World.walkable(Math.floor(sx / TILE), Math.floor(pos.y / TILE))) pos.x = sx;
        else if(World.walkable(Math.floor(pos.x / TILE), Math.floor(sy / TILE))) pos.y = sy;
        else { m.wanderA += dt * 3; pos.x += Math.cos(m.wanderA) * step * 0.6; pos.y += Math.sin(m.wanderA) * step * 0.6; }
      }
    }
  },
  nearestMonster(x, y, r){
    let best = null, bd = r;
    for(const m of ECS.query('pos', 'monster')){
      const d = Util.dist(x, y, m.comps.pos.x, m.comps.pos.y);
      if(d < bd){ bd = d; best = m; }
    }
    return best;
  },

  /* ============ 无人机 AI ============ */
  updateDrone(e, dt){
    const dr = e.drone, pos = e.comps.pos;
    dr.hover += dt * 3;
    const bay = ECS.get(dr.bayId);
    if(!bay || bay.dead){ ECS.kill(e); return; }
    if(dr.state === 'seek'){
      // 找目标:优先已标记,其次站点附近任意节点
      if(dr.tx < 0 || !World.nodeAt(dr.tx, dr.ty).node){
        const t = this.findDroneTarget(bay);
        if(!t){ dr.state = 'return'; return; }
        dr.tx = t.tx; dr.ty = t.ty;
      }
      const cx = Util.tCenter(dr.tx), cy = Util.tCenter(dr.ty);
      if(this.flyTo(e, cx, cy, dt, TILE * 0.4)){
        const { node } = World.nodeAt(dr.tx, dr.ty);
        if(!node){ dr.tx = -1; return; }
        dr.timer -= dt;
        if(dr.timer <= 0){
          dr.timer = 0.5;
          const r = this.hitNode(dr.tx, dr.ty, node);
          if(r){ dr.carry += r.gain; dr.item = r.item; }
          if(!World.nodeAt(dr.tx, dr.ty).node || dr.carry >= 10){ dr.state = 'return'; }
        }
      }
    } else { // return:回站入仓
      if(this.flyTo(e, bay.comps.pos.x, bay.comps.pos.y, dt, TILE * 0.8)){
        if(dr.carry > 0 && dr.item){
          const added = Pool.add(dr.item, dr.carry);
          if(added > 0) FX.float(bay.comps.pos.x, bay.comps.pos.y, ITEMS[dr.item].name + ' +' + added, ITEMS[dr.item].color);
          dr.carry -= added;
          if(dr.carry <= 0){ dr.carry = 0; dr.item = null; }
          // 满仓放不下:带着货继续找活,仓储有空位时再入仓
        }
        dr.state = 'seek'; dr.tx = -1;
      }
    }
  },
  findDroneTarget(bay){
    const bx = bay.comps.pos.x, by = bay.comps.pos.y;
    let best = null, bd = 30 * TILE, bestMarked = false;
    const t0x = Math.floor(bx / TILE), t0y = Math.floor(by / TILE);
    World.eachNodeInRect(t0x - 30, t0y - 30, t0x + 30, t0y + 30, (tx, ty, node) => {
      if(node.t === 'berry') return; // 浆果留给工人
      const d = Util.dist(bx, by, Util.tCenter(tx), Util.tCenter(ty));
      const better = node.marked && !bestMarked ? true : (node.marked === bestMarked && d < bd);
      if(better){ bd = d; best = { tx, ty }; bestMarked = !!node.marked; }
    });
    return best;
  },
  flyTo(e, x, y, dt, arriveR){
    const pos = e.comps.pos;
    const d = Util.dist(pos.x, pos.y, x, y);
    if(d <= arriveR) return true;
    const step = e.comps.move.speed * dt;
    pos.x += (x - pos.x) / d * Math.min(step, d);
    pos.y += (y - pos.y) / d * Math.min(step, d);
    return false;
  },
};
