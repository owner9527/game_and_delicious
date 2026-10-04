/* ============================================================
 * save.js — 世界状态序列化:种子 + 脏块覆盖 + 实体 + 建筑 + 科技
 * 未修改的分块不存储(按种子重算),存档小、支持长线游玩。
 * ============================================================ */
'use strict';

const SaveSys = {
  KEY: 'sparkfront.save.v1',

  has(){
    try{ return !!localStorage.getItem(this.KEY); }catch(e){ return false; }
  },
  save(autosave){
    if(!G || !G.player){ return; }
    const data = this.serialize();
    try{
      localStorage.setItem(this.KEY, JSON.stringify(data));
    }catch(e){
      UI.msgFull('存档失败:' + e.message, 'warn');
      return;
    }
    UI.msg(autosave ? '(自动保存完成)' : '世界状态已保存。', 'good');
  },
  serialize(){
    const chunks = [];
    for(const [k, ch] of World.chunks){
      if(!ch.dirty || ch.nodes.size === 0) continue;
      const [cx, cy] = k.split(',').map(Number);
      const nodes = [];
      for(const [idx, n] of ch.nodes){
        nodes.push({ i: idx, t: n.t, a: n.amt, r: n.rich ? 1 : 0, m: n.marked ? 1 : 0 });
      }
      chunks.push({ cx, cy, nodes });
    }
    const buildings = [];
    for(const b of ECS.query('building')){
      const bd = b.comps.building;
      const fm = b.comps.farm;
      buildings.push({
        def: bd.def, tx: Math.floor(b.pos.x / TILE), ty: Math.floor(b.pos.y / TILE),
        state: bd.state, progress: bd.progress, work: bd.work, hp: bd.hp,
        buf: bd.buf, timer: bd.timer,
        crop: fm ? fm.crop : 0, growth: fm ? fm.growth : 0,
      });
    }
    const workers = [];
    for(const w of ECS.query('worker')){
      workers.push({ x: w.pos.x, y: w.pos.y, hp: w.body.hp, hunger: w.body.hunger });
    }
    return {
      v: 1, seed: G.seed,
      time: { t: G.time.t, day: G.time.day },
      pool: G.pool, rp: G.rp, tech: G.tech,
      stats: G.stats, rain: G.rain, raidMult: G.raidMult, eventT: G.eventT,
      campfirePos: G.campfirePos, victory: G.victory,
      nameIdx: Actors.nameIdx,
      player: { x: G.player.pos.x, y: G.player.pos.y, hp: G.player.body.hp, hunger: G.player.body.hunger },
      chunks, buildings, workers,
    };
  },
  load(){
    let raw = null;
    try{ raw = localStorage.getItem(this.KEY); }catch(e){}
    if(!raw){ UI.msgFull('没有找到存档。', 'warn'); return false; }
    let data;
    try{ data = JSON.parse(raw); }catch(e){ UI.msgFull('存档已损坏。', 'warn'); return false; }
    try{
      Game.startWorld(data.seed, data);
      return true;
    }catch(e){
      console.error(e);
      UI.msgFull('读档失败:' + e.message, 'warn');
      return false;
    }
  },
};
