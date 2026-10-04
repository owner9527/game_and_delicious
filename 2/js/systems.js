/* ============================================================
 * systems.js — 昼夜循环 / 饥饿与回复 / 夜袭生成 / 白昼燃烧 /
 *              事件状态机 / 灯光汇总 / 全局维护
 * ============================================================ */
'use strict';

const Systems = {
  /* 昼夜光照:0=正午 1=深夜 */
  darknessAt(dayFrac){
    if(dayFrac < 0.24) return 1;
    if(dayFrac < 0.30) return 1 - (dayFrac - 0.24) / 0.06;
    if(dayFrac < 0.72) return 0;
    if(dayFrac < 0.80) return (dayFrac - 0.72) / 0.08;
    return 1;
  },
  isNight(){ return this.darknessAt((G.time.t % DAY_LEN) / DAY_LEN) > 0.5; },
  clock(){
    const dayFrac = (G.time.t % DAY_LEN) / DAY_LEN;
    const h24 = dayFrac * 24;
    const h = Math.floor(h24), m = Math.floor((h24 - h) * 60);
    return { h, m, dayFrac };
  },

  /* 某点是否在火光灼烧/惧止范围内(kind: 'burn' 灼烧 | 'fear' 惧止) */
  nearLight(x, y, kind){
    for(const L of this.getLights()){
      const f = kind === 'fear' ? 0.72 : 0.85;
      if(Util.dist(x, y, L.x, L.y) < L.r * f) return true;
    }
    return false;
  },

  update(dt){
    this.updateTime(dt);
    this.updateNeeds(dt);
    this.updateNight(dt);
    this.updateEvents(dt);
    Buildings.update(dt); // 生产链 / 农场 / 采矿机 / 炮塔 / 科研 / 任务emit
    ECS.update(dt);       // 工人 / 怪物 / 无人机 AI 等
    FX.update(dt);
    this.cleanupJobs(dt);
    this.checkPlayer(dt);
    this.autosave(dt);
  },

  updateTime(dt){
    G.time.t += dt;
    const dayFrac = (G.time.t % DAY_LEN) / DAY_LEN;
    // 跨越阶段边界触发
    const prev = G.time.dayFrac;
    G.time.dayFrac = dayFrac;
    if(prev < 0.80 && dayFrac >= 0.80) this.onNightFall();
    if(prev < 0.30 && dayFrac >= 0.30) this.onDawn();
    if(prev > dayFrac){ /* 跨天 */ }
  },
  onNightFall(){
    UI.msg('夜幕降临,黑暗中传来低吼……', 'warn');
    Sfx.alarm();
    const mult = G.raidMult || 1;
    G.raidMult = 1;
    let count = Math.min(24, Math.round((BAL.nightSpawnBase + G.time.day) * mult * 0.8));
    const home = G.campfirePos || G.player.comps.pos;
    for(let i = 0; i < count; i++){
      for(let tries = 0; tries < 20; tries++){
        const a = Math.random() * Math.PI * 2;
        const d = (15 + Math.random() * 8) * TILE;
        const x = home.x + Math.cos(a) * d, y = home.y + Math.sin(a) * d;
        if(World.walkable(Math.floor(x / TILE), Math.floor(y / TILE))){
          Actors.spawnMonster(x, y, G.time.day);
          break;
        }
      }
    }
  },
  onDawn(){
    G.time.day++;
    UI.msg('第 ' + G.time.day + ' 天的晨光驱散了兽群。', 'good');
  },

  updateNeeds(dt){
    for(const e of ECS.query('body')){
      const b = e.body;
      b.hunger = Math.max(0, b.hunger - BAL.hungerRate * dt);
      // 自动进食(玩家与工人,饿了就从仓储取食物)
      if(b.hunger < BAL.hungerEatAt && (e.type === 'player' || e.type === 'worker')){
        Pool.eat(e);
      }
      if(b.hunger <= 0){
        b.hp -= BAL.starveDps * dt;
        if(Math.random() < dt * 0.5) FX.float(e.pos.x, e.pos.y - 10, '饥饿!', '#e07050');
      } else if(b.hunger > 70 && b.hp < b.maxHp){
        b.hp = Math.min(b.maxHp, b.hp + BAL.regenHps * dt);
      }
      if(b.hp <= 0 && !e.dead){
        if(e.type === 'worker') Actors.onKill(e, null);
        // 玩家死亡由 checkPlayer 统一处理
      }
    }
    // 蚀影兽:白昼燃烧;夜晚惧火(篝火/火把是真正的庇护所)
    const dark = Systems.darknessAt(G.time.dayFrac);
    if(dark < 0.35 || dark > 0.5){
      const lights = dark < 0.35 ? null : Systems.getLights();
      for(const m of ECS.query('monster')){
        if(m.spawnT > 0) continue;
        let burn = 0;
        if(dark < 0.35) burn = 7; // 黎明烈焰
        else {
          for(const L of lights){
            if(Util.dist(m.pos.x, m.pos.y, L.x, L.y) < L.r * 0.85){ burn = 6; break; }
          }
        }
        if(burn > 0){
          m.body.hp -= burn * dt;
          if(Math.random() < dt * 4) FX.burst(m.pos.x, m.pos.y, '#e08040', 1, 30);
          if(m.body.hp <= 0){
            ECS.kill(m);
            G.stats.kills++;
            FX.burst(m.pos.x, m.pos.y, '#e08040', 12, 70);
          }
        }
      }
    }
  },

  updateNight(dt){
    // 占位:刷怪在 onNightFall 完成
  },

  /* ---------- 事件表 + 状态机 ---------- */
  updateEvents(dt){
    if(G.rain > 0) G.rain -= dt;
    G.eventT -= dt;
    if(G.eventT > 0) return;
    G.eventT = EVENT_INTERVAL + Math.random() * 30;
    // 加权抽取
    const pool = [];
    for(const ev of EVENTS){
      if(ev.id === 'rain' && G.rain > 0) continue;
      if(ev.id === 'raidwarn' && Systems.isNight()) continue;
      pool.push(ev);
    }
    let total = 0;
    for(const ev of pool) total += ev.weight;
    let r = Math.random() * total;
    let ev = pool[pool.length - 1];
    for(const e of pool){ r -= e.weight; if(r <= 0){ ev = e; break; } }
    this.fireEvent(ev);
  },
  fireEvent(ev){
    switch(ev.id){
      case 'rain':
        G.rain = ev.dur;
        break;
      case 'veinsurge': {
        const p = G.player.comps.pos;
        const n = World.spawnRichNodes(p.x, p.y, 4 + Math.floor(G.time.day / 2), Math.random);
        if(n === 0) return; // 没找到位置就不播报
        break;
      }
      case 'raidwarn':
        G.raidMult = 2;
        break;
      case 'traveler':
        G.rp += 40;
        break;
    }
    UI.banner(ev.name, ev.msg);
    UI.msg('【' + ev.name + '】' + ev.msg, 'good');
  },

  /* ---------- 维护 ---------- */
  jobCleanT: 0,
  cleanupJobs(dt){
    this.jobCleanT -= dt;
    if(this.jobCleanT > 0) return;
    this.jobCleanT = 1.0;
    Actors.removeJobsWhere(j => !Actors.jobValid(j));
    for(const j of G.jobs){
      if(j.claimedBy){
        const w = ECS.get(j.claimedBy);
        if(!w || w.dead) j.claimedBy = 0;
      }
    }
    // 建筑操作者失效清理
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.operatorId){
        const w = ECS.get(bd.operatorId);
        if(!w || w.dead || w.ai.state !== 'operate') bd.operatorId = 0;
      }
    }
  },
  checkPlayer(dt){
    const pl = G.player;
    if(!pl || pl.dead) return;
    if(pl.body.hp <= 0 && !G.over){
      G.over = true;
      Sfx.alarm();
      UI.showGameOver();
    }
  },
  autosave(dt){
    G.autosaveT -= dt;
    if(G.autosaveT <= 0){
      G.autosaveT = 60;
      if(!G.over && typeof SaveSys !== 'undefined') SaveSys.save(true);
    }
  },

  /* ---------- 灯光汇总(渲染用) ---------- */
  getLights(){
    const lights = [];
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      if(bd.state !== 'done') continue;
      const def = BUILDINGS[bd.def];
      /* kind 仅用于渲染层挑选光晕颜色;玩法判定只读 r/x/y,不受影响 */
      if(def.light) lights.push({ x: b.pos.x, y: b.pos.y, r: def.light * TILE, flicker: bd.def === 'campfire' ? 0.12 : 0.04, kind: 'fire' });
      if(bd.def === 'autominer') lights.push({ x: b.pos.x, y: b.pos.y, r: TILE * 1.2, flicker: 0.05, kind: 'cool' });
      if(bd.def === 'beacon') lights.push({ x: b.pos.x, y: b.pos.y, r: TILE * 7, flicker: 0.2, kind: 'beacon' });
    }
    if(G.player && !G.player.dead){
      lights.push({ x: G.player.pos.x, y: G.player.pos.y, r: TILE * 2.4, flicker: 0.03, kind: 'fire' });
    }
    return lights;
  },
};
