/* ============================================================
 * main.js — 游戏入口:初始化 / 输入 / 主循环 / 新游戏与读档
 * ============================================================ */
'use strict';

const Game = {
  started: false, paused: false, placing: null,
  keys: {}, mouseX: 0, mouseY: 0, hoverTile: null, dragging: null,

  init(){
    Render.init();
    UI.init();
    // 注册实体系统(工人 / 蚀影兽 / 无人机)
    ECS.addSystem('workers', dt => { for(const e of ECS.query('ai')) Actors.updateWorker(e, dt); });
    ECS.addSystem('monsters', dt => { for(const e of ECS.query('monster')) Actors.updateMonster(e, dt); });
    ECS.addSystem('drones', dt => { for(const e of ECS.query('drone')) Actors.updateDrone(e, dt); });
    this.bindInput();
    if(SaveSys.has()) document.getElementById('btnContinue').classList.remove('hidden');
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      try{
        if(this.started && !this.paused && !G.over){
          this.updatePlayerMove(dt);
          Systems.update(dt);
        }
        if(this.started && G) Render.draw(dt);
        if(G) UI.tick(dt);
      }catch(err){
        console.error(err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  /* ---------- 开局 / 读档 ---------- */
  newGame(seedStr){
    this.startWorld(strSeed(seedStr), null);
  },
  startWorld(seed, data){
    ECS.clear();
    Buildings.init();
    FX.clear();
    Actors.nameIdx = data ? (data.nameIdx || 0) : 0;
    World.init(seed);
    if(data && data.chunks) World.loadSaved(data.chunks);

    G = {
      seed,
      time: data ? { t: data.time.t, day: data.time.day, dayFrac: (data.time.t % DAY_LEN) / DAY_LEN }
                 : { t: DAY_LEN * 0.32, day: 1, dayFrac: 0.32 },
      pool: data ? data.pool : { wood: 15, berry: 5 },
      rp: data ? data.rp : 0,
      tech: data ? (data.tech || {}) : {},
      jobs: [], nextJobId: 1,
      stats: data ? data.stats : { kills: 0, harvested: 0 },
      rain: data ? (data.rain || 0) : 0,
      raidMult: data ? (data.raidMult || 1) : 1,
      eventT: data ? data.eventT : EVENT_INTERVAL * 0.7,
      campfirePos: data ? data.campfirePos : null,
      victory: data ? !!data.victory : false,
      over: false,
      autosaveT: 60,
    };

    // 出生点:清理出一片空地
    if(!data){
      for(let dy = -2; dy <= 2; dy++){
        for(let dx = -2; dx <= 2; dx++){
          World.setNode(2 + dx, 2 + dy, null);
        }
      }
    }
    G.player = Actors.spawnPlayer(Util.tCenter(2), Util.tCenter(2));
    if(data){
      const pd = data.player;
      G.player.pos.x = pd.x; G.player.pos.y = pd.y;
      G.player.body.hp = pd.hp; G.player.body.hunger = pd.hunger;
      for(const bd of data.buildings){
        Buildings.rebuild(bd.def, bd.tx, bd.ty, bd);
      }
      for(const wd of data.workers){
        const w = Actors.spawnWorker(wd.x, wd.y);
        w.body.hp = wd.hp; w.body.hunger = wd.hunger;
      }
      // 恢复已标记资源的采集任务
      for(const [k, ch] of World.chunks){
        const [cx, cy] = k.split(',').map(Number);
        for(const [idx, node] of ch.nodes){
          if(node.marked){
            const lx = idx % CHUNK, ly = (idx - lx) / CHUNK;
            Actors.addJob({ type: 'harvest', tx: cx * CHUNK + lx, ty: cy * CHUNK + ly, prio: 5 });
          }
        }
      }
      // 无人机站补充无人机
      for(const b of ECS.query('building')){
        const bd = b.comps.building;
        if(bd.state === 'done' && bd.def === 'dronebay'){
          for(let i = 0; i < (BUILDINGS.dronebay.drones || 2); i++){
            Actors.spawnDrone(b.pos.x, b.pos.y - 10, b.id);
          }
        }
      }
    }

    Render.cam.x = G.player.pos.x;
    Render.cam.y = G.player.pos.y;
    this.started = true;
    this.paused = false;
    UI.setPauseTag(false);
    UI.closePanels();
    document.getElementById('titleScreen').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('victory').classList.add('hidden');
    UI.closeHelp();
    if(!data){
      UI.msg('欢迎来到无尽之地。左键砍树采石,先造一座篝火!', 'good');
      UI.msg('提示:右键点击任意方块即可弹出「快捷建造」,点一下就地开工;拖拽右键框选资源,工人会自动去采。');
    } else {
      UI.msg('世界状态已恢复,继续你的拓荒。', 'good');
    }
  },
  toTitle(){
    this.started = false;
    document.getElementById('btnContinue').classList.toggle('hidden', !SaveSys.has());
    document.getElementById('titleScreen').classList.remove('hidden');
  },

  /* ---------- 招募 / 科技 ---------- */
  recruit(){
    if(!this.started) return;
    if(!G.campfirePos){ UI.msgFull('需要先建造一座篝火,才能招募拓荒者。', 'warn'); return; }
    if(ECS.query('worker').length >= MAX_WORKERS){ UI.msgFull('工人数量已达上限(' + MAX_WORKERS + ')。', 'warn'); return; }
    const cost = { berry: 8, wood: 15 };
    if(!Pool.hasAll(cost)){ UI.msgFull('招募需要 浆果×8 + 木头×15。', 'warn'); return; }
    Pool.payCost(cost);
    const cx = Math.floor(G.campfirePos.x / TILE), cy = Math.floor(G.campfirePos.y / TILE);
    let sx = cx, sy = cy;
    for(let r = 1; r < 5; r++){
      let found = false;
      for(let dy = -r; dy <= r && !found; dy++){
        for(let dx = -r; dx <= r && !found; dx++){
          if(World.walkable(cx + dx, cy + dy)){ sx = cx + dx; sy = cy + dy; found = true; }
        }
      }
      if(found) break;
    }
    const w = Actors.spawnWorker(Util.tCenter(sx), Util.tCenter(sy));
    UI.msg(w.comps.worker.name + ' 加入了营地!', 'good');
    Sfx.done();
  },
  unlockTech(id){
    const t = TECHS.find(x => x.id === id);
    if(!t || G.tech[id]) return;
    if(!t.req.every(r => G.tech[r])) return;
    if(G.rp < t.cost){ UI.msgFull('科研点不足。', 'warn'); return; }
    G.rp -= t.cost;
    G.tech[id] = true;
    Sfx.unlock();
    UI.msg('科技解锁:' + t.name + ' —— ' + t.desc, 'good');
    UI.refreshTechPanel();
  },

  /* ---------- 建造放置 ---------- */
  startPlacing(defId){
    const def = BUILDINGS[defId];
    if(def.tech && !G.tech[def.tech]){ UI.msgFull('尚未解锁该建筑所需科技。', 'warn'); return; }
    this.placing = defId;
    // 关闭建造面板但保留放置模式(× / Esc 才取消)
    if(UI.buildPanelOpen){
      UI.els.buildPanel.classList.add('hidden');
      UI.buildPanelOpen = false;
    }
  },
  cancelPlacing(){ this.placing = null; },
  tryPlaceAt(tx, ty){
    const defId = this.placing;
    if(!defId) return;
    const def = BUILDINGS[defId];
    if(!Buildings.canPlace(defId, tx, ty)){ UI.msgFull(defId === 'autominer' ? '自动采矿机必须放置在矿脉上。' : '此处无法建造(需空地且不在水上)。', 'warn'); return; }
    if(!Pool.hasAll(def.cost)){ UI.msgFull('资源不足:' + Object.entries(def.cost).map(([k, v]) => ITEMS[k].name + '×' + v).join(' '), 'warn'); return; }
    Buildings.place(defId, tx, ty);
    if(!this.keys['shift']) this.cancelPlacing();
  },
  /* 在指定格直接开工 —— 供右键快捷建造菜单调用(点一下即建造,无需先进入放置模式) */
  buildAt(defId, tx, ty, keepOpen){
    const def = BUILDINGS[defId];
    if(def.tech && !G.tech[def.tech]){ UI.msgFull('尚未解锁该建筑所需科技。', 'warn'); return; }
    if(!Buildings.canPlace(defId, tx, ty)){ UI.msgFull(defId === 'autominer' ? '自动采矿机必须放置在矿脉上。' : '此处无法建造(需空地且不在水上)。', 'warn'); return; }
    if(!Pool.hasAll(def.cost)){ UI.msgFull('资源不足:' + Object.entries(def.cost).map(([k, v]) => ITEMS[k].name + '×' + v).join(' '), 'warn'); return; }
    const b = Buildings.place(defId, tx, ty);
    if(!b) return;
    UI.msg('已开工:' + def.name + ' —— 工人们会赶来施工。', 'good');
    if(keepOpen) UI.refreshBuildMenu(); else UI.closeBuildMenu();
  },
  /* 标记 / 取消标记单个资源节点 —— 供右键快捷菜单里的"标记采集"使用 */
  markNode(tx, ty){
    const { node } = World.nodeAt(tx, ty);
    if(!node) return;
    const want = !node.marked;
    node.marked = want;
    World.getChunk(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)).dirty = true;
    if(want) Actors.addJob({ type: 'harvest', tx, ty, prio: 5 });
    else Actors.removeJobsWhere(j => j.type === 'harvest' && j.tx === tx && j.ty === ty);
    UI.msg(want ? '已标记采集,工人们出发了。' : '已取消标记。');
    Sfx.uiTick();
  },

  /* ---------- 玩家移动 ---------- */
  updatePlayerMove(dt){
    const pl = G.player;
    if(!pl || pl.dead) return;
    const k = this.keys;
    let dx = 0, dy = 0;
    if(k['w'] || k['arrowup']) dy -= 1;
    if(k['s'] || k['arrowdown']) dy += 1;
    if(k['a'] || k['arrowleft']) dx -= 1;
    if(k['d'] || k['arrowright']) dx += 1;
    if(dx || dy){
      // 视野会跟着人物走,菜单贴在屏幕坐标上会错位,所以一动就收起
      UI.closeBuildMenu();
      pl.comps.auto = null;
      pl.comps.move.path = null;
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      const step = BAL.playerSpeed * dt;
      const r = 6; // 身位半径
      const nx = pl.pos.x + dx * step;
      if(World.walkable(Math.floor((nx + Math.sign(dx) * r) / TILE), Math.floor(pl.pos.y / TILE))) pl.pos.x = nx;
      const ny = pl.pos.y + dy * step;
      if(World.walkable(Math.floor(pl.pos.x / TILE), Math.floor((ny + Math.sign(dy) * r) / TILE))) pl.pos.y = ny;
      if(dx) pl.dir = dx > 0 ? 1 : -1;
    } else if(pl.comps.auto){
      Actors.updatePlayerAuto(dt);
    }
  },

  /* ---------- 输入绑定 ---------- */
  bindInput(){
    const cv = document.getElementById('cv');
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;
      if(e.key === 'F5'){ e.preventDefault(); if(this.started) SaveSys.save(false); return; }
      if(e.key === 'F9'){ e.preventDefault(); if(this.started) SaveSys.load(); return; }
      if(key === 'escape'){
        UI.closeHelp();
        UI.closePanels();
        UI.closeBuildMenu();
        this.cancelPlacing();
        return;
      }
      if(!this.started) return;
      if(key === 'b'){ UI.closeBuildMenu(); UI.togglePanel('build'); }
      else if(key === 't'){ UI.closeBuildMenu(); UI.togglePanel('tech'); }
      else if(key === 'h'){
        UI.toggleHelp();
      }
      else if(key === ' '){ e.preventDefault(); this.paused = !this.paused; UI.setPauseTag(this.paused); }
      else if(key === 'e'){
        if(Pool.eat(G.player)) Sfx.eat();
        else UI.msgFull('仓储里没有食物(浆果/面包)。', 'warn');
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    cv.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      const w = Render.screenToWorld(e.clientX, e.clientY);
      this.hoverTile = { tx: Math.floor(w.x / TILE), ty: Math.floor(w.y / TILE) };
      if(this.dragging){
        this.dragging.x1 = this.hoverTile.tx;
        this.dragging.y1 = this.hoverTile.ty;
      }
    });
    cv.addEventListener('mousedown', (e) => {
      Sfx.init();
      if(!this.started || !G || !G.player) return;
      const wpt = Render.screenToWorld(e.clientX, e.clientY);
      if(e.button === 0){
        UI.closeBuildMenu();
        if(this.placing){
          this.tryPlaceAt(Math.floor(wpt.x / TILE), Math.floor(wpt.y / TILE));
          if(UI.buildPanelOpen) UI.refreshBuildPanel();
          return;
        }
        // 实体拾取:优先怪物
        let hit = null, bd = 16;
        for(const m of ECS.query('monster')){
          const d = Util.dist(wpt.x, wpt.y, m.pos.x, m.pos.y);
          if(d < bd){ bd = d; hit = m; }
        }
        if(!hit){
          const b = Buildings.buildingAt(Math.floor(wpt.x / TILE), Math.floor(wpt.y / TILE));
          if(b) hit = b;
        }
        Actors.playerClick(wpt.x, wpt.y, hit);
        if(!hit) UI.els.infoPanel.classList.add('hidden');
      } else if(e.button === 2){
        if(this.placing){ this.cancelPlacing(); return; }
        UI.closeBuildMenu();
        const tx = Math.floor(wpt.x / TILE), ty = Math.floor(wpt.y / TILE);
        this.dragging = { x0: tx, y0: ty, x1: tx, y1: ty };
      }
    });
    window.addEventListener('mouseup', (e) => {
      if(e.button !== 2 || !this.dragging) return;
      const d = this.dragging;
      this.dragging = null;
      // 没有拖动 = 右键点了某个方块 → 弹出该格的快捷建造菜单
      if(d.x0 === d.x1 && d.y0 === d.y1){
        if(this.started && G && G.player) UI.openBuildMenu(d.x0, d.y0, e.clientX, e.clientY);
        return;
      }
      // 拖动过 = 框选批量标记采集(保持原行为)
      this.finishMarking(d);
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      UI.closeBuildMenu();
      const z = Render.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9);
      Render.cam.zoom = Util.clamp(z, 0.55, 1.9);
    }, { passive: false });
  },

  /* ---------- 右键框选标记采集 ---------- */
  finishMarking(d){
    d = d || this.dragging;
    if(!d) return;
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const tiles = [];
    World.eachNodeInRect(x0, y0, x1, y1, (tx, ty, node) => tiles.push({ tx, ty, node }));
    if(!tiles.length) return;
    const anyUnmarked = tiles.some(t => !t.node.marked);
    let n = 0;
    for(const t of tiles){
      if(t.node.marked === anyUnmarked) continue;
      t.node.marked = anyUnmarked;
      const cx = Math.floor(t.tx / CHUNK), cy = Math.floor(t.ty / CHUNK);
      World.getChunk(cx, cy).dirty = true;
      if(anyUnmarked){
        Actors.addJob({ type: 'harvest', tx: t.tx, ty: t.ty, prio: 5 });
      } else {
        Actors.removeJobsWhere(j => j.type === 'harvest' && j.tx === t.tx && j.ty === t.ty);
      }
      n++;
    }
    if(n > 0){
      UI.msg(anyUnmarked ? '已标记 ' + n + ' 处资源,工人们出发了。' : '取消了 ' + n + ' 处标记。');
      Sfx.uiTick();
    }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
