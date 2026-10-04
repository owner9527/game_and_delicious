/* ============================================================
 * buildings.js — 仓储池 / 建筑放置与施工 / 配方生产链 / 农场 /
 *                自动采矿机 / 弩炮塔 / 科研产出 / 建筑损毁
 * ============================================================ */
'use strict';

const FARM_GROW = 90;      // 小麦生长秒数
const BUF_OUT_CAP = 10;    // 产出缓冲上限

/* ---------- 全局仓储池(容量由仓储堆扩展) ---------- */
const Pool = {
  get(item){
    const v = G.pool[item];
    return (typeof v === 'number' && isFinite(v)) ? v : 0;
  },
  total(){
    let t = 0;
    for(const k in G.pool){
      const v = G.pool[k];
      if(typeof v === 'number' && isFinite(v)) t += v;
    }
    return t;
  },
  cap(){ return BASE_CAP + Buildings.countDone('stockpile') * STOCKPILE_CAP; },
  add(item, n){
    const free = this.cap() - this.total();
    const added = Math.max(0, Math.min(n, free));
    if(added > 0) G.pool[item] = this.get(item) + added;
    return added;
  },
  has(item, n){ return this.get(item) >= n; },
  hasAll(cost){ for(const k in cost) if(!this.has(k, cost[k])) return false; return true; },
  take(item, n){
    if(!this.has(item, n)) return 0;
    G.pool[item] = this.get(item) - n;
    return n;
  },
  payCost(cost){
    if(!this.hasAll(cost)) return false;
    for(const k in cost) this.take(k, cost[k]);
    return true;
  },
  bestFood(){
    if((G.pool.berry || 0) > 0) return 'berry';
    if((G.pool.bread || 0) > 0) return 'bread';
    return null;
  },
  eat(e){
    const f = this.bestFood();
    if(!f) return false;
    this.take(f, 1);
    e.body.hunger = Math.min(100, e.body.hunger + ITEMS[f].food);
    const p = e.pos || e.comps.pos;
    FX.float(p.x, p.y - 14, '吃 ' + ITEMS[f].name, ITEMS[f].color);
    return true;
  },
};

/* ---------- 建筑系统 ---------- */
const Buildings = {
  occ: new Map(),    // "tx,ty" -> entity(所有建筑占位)
  block: new Map(),  // "tx,ty" -> entity(不可通行建筑)

  init(){
    this.occ.clear();
    this.block.clear();
  },
  key(tx, ty){ return tx + ',' + ty; },

  workNeeded(def){
    if(def.buildWork) return def.buildWork;
    let total = 0;
    for(const k in def.cost) total += def.cost[k];
    return 4 + Math.ceil(total / 5);
  },
  canPlace(defId, tx, ty){
    const def = BUILDINGS[defId];
    if(World.terrainAt(tx, ty) === 0) return false;          // 不能下水
    if(this.occ.has(this.key(tx, ty))) return false;          // 不能重叠
    const { node } = World.nodeAt(tx, ty);
    if(defId === 'autominer'){
      // 采矿机必须骑在矿脉上
      if(!node) return false;
      return ['iron', 'coal', 'stone', 'crystal'].includes(node.t);
    }
    if(node) return false;                                    // 先清理资源
    return true;
  },
  place(defId, tx, ty){
    const def = BUILDINGS[defId];
    if(!this.canPlace(defId, tx, ty)) return null;
    if(!Pool.payCost(def.cost)){ UI.msgFull('资源不足', 'warn'); return null; }
    const comps = {
      pos: { x: Util.tCenter(tx), y: Util.tCenter(ty) },
      building: {
        def: defId, state: 'blueprint',
        progress: 0, work: this.workNeeded(def),
        hp: 1, buf: { in: {}, out: {} }, timer: 0,
        pullCd: 0, pushCd: 0, operatorId: 0,
      },
    };
    if(defId === 'farm') comps.farm = { crop: 0, growth: 0 };
    const b = ECS.spawn('building', comps);
    const k = this.key(tx, ty);
    this.occ.set(k, b);
    if(!def.walkable) this.block.set(k, b);
    this.addJob({ type: 'build', bid: b.id, prio: 8 });
    Sfx.place();
    return b;
  },
  /* 读档:按存档数据原样重建建筑(不扣费) */
  rebuild(defId, tx, ty, d){
    const def = BUILDINGS[defId];
    if(!def) return null;
    const comps = {
      pos: { x: Util.tCenter(tx), y: Util.tCenter(ty) },
      building: {
        def: defId, state: d.state || 'done',
        progress: d.progress || 0, work: d.work || this.workNeeded(def),
        hp: d.hp || 1, buf: d.buf || { in: {}, out: {} }, timer: d.timer || 0,
        pullCd: 0, pushCd: 0, operatorId: 0,
      },
    };
    if(defId === 'farm') comps.farm = { crop: d.crop || 0, growth: d.growth || 0 };
    const b = ECS.spawn('building', comps);
    const k = this.key(tx, ty);
    this.occ.set(k, b);
    if(!def.walkable) this.block.set(k, b);
    return b;
  },
  hammer(b, amt){
    const bd = b.comps.building;
    if(bd.state !== 'blueprint') return;
    bd.progress += amt;
    if(bd.progress >= bd.work) this.complete(b);
  },
  complete(b){
    const bd = b.comps.building;
    const def = BUILDINGS[bd.def];
    bd.state = 'done';
    bd.hp = def.hp;
    if(bd.def === 'campfire'){
      G.campfirePos = { x: b.pos.x, y: b.pos.y };
      UI.msg('篝火点燃了。黑夜不再意味着绝望。', 'good');
      Sfx.done();
    }
    if(def.win){
      G.victory = true;
      Sfx.unlock();
      UI.showVictory();
    }
    if(bd.def === 'dronebay'){
      for(let i = 0; i < (def.drones || 2); i++){
        Actors.spawnDrone(b.pos.x + (Math.random() - 0.5) * 20, b.pos.y - 10, b.id);
      }
    }
    UI.msg(def.name + ' 建造完成!', 'good');
    UI.refreshBuildPanel && UI.buildPanelOpen && UI.refreshBuildPanel();
  },
  damage(b, dmg){
    const bd = b.comps.building;
    bd.hp -= dmg;
    b.hitFlash = 0.15;
    if(bd.hp <= 0) this.destroy(b);
  },
  destroy(b){
    const bd = b.comps.building;
    const def = BUILDINGS[bd.def];
    FX.burst(b.pos.x, b.pos.y, '#c8a06a', 14, 90);
    UI.msg(def.name + ' 被摧毁了!', 'warn');
    Sfx.alarm();
    const k = this.key(Math.floor(b.pos.x / TILE), Math.floor(b.pos.y / TILE));
    this.occ.delete(k);
    this.block.delete(k);
    // 清理相关任务
    Actors.removeJobsWhere(j => j.bid === b.id);
    if(G.campfirePos && Math.abs(G.campfirePos.x - b.pos.x) < 1 && Math.abs(G.campfirePos.y - b.pos.y) < 1){
      G.campfirePos = null;
      const cf = this.firstDone('campfire');
      if(cf) G.campfirePos = { x: cf.pos.x, y: cf.pos.y };
    }
    ECS.kill(b);
  },
  buildingAt(tx, ty){
    const b = this.occ.get(this.key(tx, ty));
    return b && !b.dead ? b : null;
  },
  blockAt(tx, ty){
    const b = this.block.get(this.key(tx, ty));
    return b && !b.dead ? true : false;
  },
  countDone(defId){
    let n = 0;
    for(const b of ECS.query('building')){
      if(b.comps.building.def === defId && b.comps.building.state === 'done') n++;
    }
    return n;
  },
  firstDone(defId){
    for(const b of ECS.query('building')){
      if(b.comps.building.def === defId && b.comps.building.state === 'done') return b;
    }
    return null;
  },
  nearestStockpile(x, y){
    let best = null, bd = 1e9;
    for(const b of ECS.query('building')){
      const bd2 = b.comps.building;
      if(bd2.def !== 'stockpile' || bd2.state !== 'done') continue;
      const d = Util.dist(x, y, b.comps.pos.x, b.comps.pos.y);
      if(d < bd){ bd = d; best = b; }
    }
    return best;
  },
  /* 是否值得派工人操作 */
  needsOperator(b){
    const bd = b.comps.building;
    if(bd.state !== 'done') return false;
    const def = BUILDINGS[bd.def];
    if(def.rp) return true; // 科研建筑永远受益
    if(def.recipe){
      let outN = 0;
      for(const k in bd.buf.out) outN += bd.buf.out[k];
      if(outN >= BUF_OUT_CAP) return false;
      // 有存货或仓库里有原料都算"有事可做"
      let hasIn = true;
      for(const k in def.recipe.in) if((bd.buf.in[k] || 0) < def.recipe.in[k]) hasIn = false;
      if(hasIn) return true;
      for(const k in def.recipe.in) if(Pool.has(k, 1)) return true;
      return false;
    }
    return false;
  },

  /* ---------- 每帧系统 ---------- */
  update(dt){
    this.maintainJobs();
    this.updateProduction(dt);
    this.updateFarms(dt);
    this.updateMiners(dt);
    this.updateTurrets(dt);
    this.updateResearch(dt);
  },

  /* 任务emit:蓝图施工 / 农场农活 / 操作岗位 */
  jobExists(type, bid, action){
    for(const j of G.jobs){
      if(j.type === type && j.bid === bid && (action === undefined || j.action === action)) return true;
    }
    return false;
  },
  maintainJobs(){
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state === 'blueprint'){
        if(!this.jobExists('build', b.id)) this.addJob({ type: 'build', bid: b.id, prio: 8 });
        continue;
      }
      if(bd.state !== 'done') continue;
      const def = BUILDINGS[bd.def];
      if(bd.def === 'farm'){
        const fm = b.farm;
        if(fm.crop === 0 && !this.jobExists('farm', b.id, 'plant')) this.addJob({ type: 'farm', bid: b.id, action: 'plant', prio: 6 });
        if(fm.crop === 1 && fm.growth >= 1 && !this.jobExists('farm', b.id, 'harvest')) this.addJob({ type: 'farm', bid: b.id, action: 'harvest', prio: 6 });
      }
      if((def.rp || def.recipe) && bd.operatorId === 0 && !this.jobExists('operate', b.id) && this.needsOperator(b)){
        this.addJob({ type: 'operate', bid: b.id, prio: 3 });
      }
    }
  },
  /* 配方生产(厨房 / 冶炼炉) */
  updateProduction(dt){
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state !== 'done') continue;
      const def = BUILDINGS[bd.def];
      if(!def.recipe) continue;
      const rec = def.recipe;
      // 拉料
      bd.pullCd -= dt;
      if(bd.pullCd <= 0){
        let needPull = false;
        for(const k in rec.in){
          if((bd.buf.in[k] || 0) < rec.in[k]) needPull = true;
        }
        if(needPull){
          let all = true;
          for(const k in rec.in){
            const lack = rec.in[k] - (bd.buf.in[k] || 0);
            if(lack > 0){
              const got = Pool.take(k, lack);
              if(got > 0) bd.buf.in[k] = (bd.buf.in[k] || 0) + got;
              else { all = false; break; }
            }
          }
          bd.pullCd = all ? 0.5 : 2.5; // 拉齐后休息一会;缺料时降频
        }
      }
      // 有全套原料 → 开工
      let ready = true;
      for(const k in rec.in) if((bd.buf.in[k] || 0) < rec.in[k]) ready = false;
      let outN = 0;
      for(const k in rec.out) outN += (bd.buf.out[k] || 0);
      if(ready && outN < BUF_OUT_CAP){
        const boost = this.opBoost(b, def);
        bd.timer += dt * boost;
        if(bd.timer >= rec.time){
          bd.timer = 0;
          for(const k in rec.in) bd.buf.in[k] -= rec.in[k];
          for(const k in rec.out) bd.buf.out[k] = (bd.buf.out[k] || 0) + rec.out[k];
          FX.burst(b.pos.x, b.pos.y - 8, '#e8c26a', 6, 45);
        }
      } else if(!ready) bd.timer = Math.max(0, bd.timer - dt);
      // 推货入仓
      bd.pushCd -= dt;
      if(bd.pushCd <= 0){
        let pushed = false;
        for(const k in bd.buf.out){
          const n = bd.buf.out[k];
          if(n > 0){
            const added = Pool.add(k, 1);
            if(added > 0){ bd.buf.out[k] -= 1; pushed = true; }
            break;
          }
        }
        bd.pushCd = pushed ? 0.4 : 1.5;
      }
    }
  },
  opBoost(b, def){
    if(!def.opBoost || !b.comps.building.operatorId) return 1;
    const w = ECS.get(b.comps.building.operatorId);
    if(!w || w.dead) return 1;
    const d = Util.dist(w.comps.pos.x, w.comps.pos.y, b.comps.pos.x, b.comps.pos.y);
    return d < TILE * 2 ? def.opBoost : 1;
  },
  /* 农田生长 */
  updateFarms(dt){
    for(const b of ECS.query('building', 'farm')){
      const fm = b.farm;
      if(fm.crop !== 1) continue;
      const speed = (G.rain > 0 ? 2.2 : 1) / FARM_GROW;
      fm.growth = Math.min(1, fm.growth + dt * speed);
    }
  },
  /* 自动采矿机 */
  updateMiners(dt){
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state !== 'done' || bd.def !== 'autominer') continue;
      bd.timer += dt;
      if(bd.timer >= BUILDINGS_MINER_TIME){
        bd.timer = 0;
        const tx = Math.floor(b.pos.x / TILE), ty = Math.floor(b.pos.y / TILE);
        const { node } = World.nodeAt(tx, ty);
        if(node){
          const r = Actors.hitNode(tx, ty, node);
          if(r){
            const added = Pool.add(r.item, r.gain);
            if(added > 0) FX.float(b.pos.x, b.pos.y - 12, ITEMS[r.item].name + ' +' + added, ITEMS[r.item].color);
          }
        } else {
          bd.timer = 0;
        }
      }
    }
  },
  /* 弩炮塔 */
  updateTurrets(dt){
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state !== 'done' || bd.def !== 'turret') continue;
      const def = BUILDINGS.turret;
      bd.timer -= dt;
      if(bd.timer > 0) continue;
      const range = def.range * TILE;
      let target = null, bd2 = range;
      for(const m of ECS.query('pos', 'monster')){
        if(m.spawnT > 0) continue;
        const d = Util.dist(b.pos.x, b.pos.y, m.pos.x, m.pos.y);
        if(d < bd2){ bd2 = d; target = m; }
      }
      if(target){
        bd.timer = def.cd;
        bd.aimA = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x);
        Actors.meleeHit(b, target, def.dmg); // 直接命中(弹道纯视觉)
        bd.tracer = 0.12;
        const pp = G.player.comps.pos;
        if(Util.dist(pp.x, pp.y, b.pos.x, b.pos.y) < 560) Sfx.shoot();
      }
    }
  },
  /* 科研点产出 */
  updateResearch(dt){
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state !== 'done') continue;
      const def = BUILDINGS[bd.def];
      if(!def.rp) continue;
      G.rp += def.rp * this.opBoost(b, def) * dt;
      bd.working = true;
    }
  },
};

const BUILDINGS_MINER_TIME = 8; // 采矿节奏
Buildings.addJob = function(job){
  job.id = G.nextJobId++;
  job.claimedBy = 0;
  G.jobs.push(job);
  return job;
};
