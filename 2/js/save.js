/* ============================================================
 * save.js — 世界状态序列化:种子 + 脏块覆盖 + 实体 + 建筑 + 科技
 * 未修改的分块不存储(按种子重算),存档小、支持长线游玩。
 * 修复:脏块即使节点被采空也要落盘(写空节点表),
 *       否则读档后按种子重新生成,采空的资源会"复活"(F5/F9 无限刷)。
 * 槽位:三槽存档,主槽沿用旧键名(兼容老存档),另加两个扩展槽。
 * ============================================================ */
'use strict';

const SaveSys = {
  KEY: 'sparkfront.save.v1',
  KEYS: ['sparkfront.save.v1', 'sparkfront.save.v1.slot2', 'sparkfront.save.v1.slot3'],

  keyOf(slot){
    const i = (typeof slot === 'number' && isFinite(slot)) ? Math.max(0, Math.min(this.KEYS.length - 1, slot | 0)) : 0;
    return this.KEYS[i] || this.KEY;
  },

  has(slot){
    try{ return !!localStorage.getItem(this.keyOf(slot)); }catch(e){ return false; }
  },
  /* 槽位摘要(供槽位选择 UI 显示),空槽/损坏返回 null / {bad:true} */
  meta(slot){
    let raw = null;
    try{ raw = localStorage.getItem(this.keyOf(slot)); }catch(e){}
    if(!raw) return null;
    try{
      const d = JSON.parse(raw);
      return { day: (d.time && d.time.day) ? d.time.day : 1, at: d.savedAt || 0 };
    }catch(e){ return { bad: true }; }
  },

  save(slot, autosave){
    // 兼容旧签名 save(autosave:boolean)
    if(typeof slot === 'boolean'){ autosave = slot; slot = 0; }
    if(slot === undefined || slot === null) slot = 0;
    if(!G || !G.player){ return; }
    const data = this.serialize();
    try{
      localStorage.setItem(this.keyOf(slot), JSON.stringify(data));
    }catch(e){
      UI.msgFull('存档失败:' + e.message, 'warn');
      return;
    }
    UI.msg(autosave ? '(自动保存完成)' : '世界状态已保存。', 'good');
  },
  serialize(){
    const chunks = [];
    for(const [k, ch] of World.chunks){
      // 只跳过从未修改过的块;采空的脏块必须写空节点表,防止读档后资源复活
      if(!ch.dirty) continue;
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
      savedAt: Date.now(),
    };
  },
  load(slot){
    if(typeof slot !== 'number') slot = 0;
    let raw = null;
    try{ raw = localStorage.getItem(this.keyOf(slot)); }catch(e){}
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

  /* 页面隐藏/关闭时兜底自动保存(写主槽,带 60s 周期自动保存同样的守卫) */
  initAutoSave(){
    const doSave = () => {
      if(typeof Game !== 'undefined' && Game.started && G && G.player && !G.over) this.save(0, true);
    };
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'hidden') doSave();
    });
    window.addEventListener('pagehide', doSave);
    window.addEventListener('beforeunload', doSave);
  },
};
