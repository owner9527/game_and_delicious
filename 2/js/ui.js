/* ============================================================
 * ui.js — HUD / 建造面板 / 科技树 / 消息日志 / 横幅 / 悬浮提示 /
 *         标题 / 结算界面
 * ============================================================ */
'use strict';

const UI = {
  els: {},
  hudT: 0, logDedup: new Map(),
  buildPanelOpen: false, techPanelOpen: false,
  buildMenuOpen: false, bmTile: null,

  init(){
    const $ = id => document.getElementById(id);
    this.els = {
      hpFill: $('hpFill'), hpText: $('hpText'), hgFill: $('hgFill'), hgText: $('hgText'),
      dayText: $('dayText'), timeText: $('timeText'),
      storageText: $('storageText'), stFill: $('stFill'), resChips: $('resChips'),
      log: $('log'), banner: $('banner'), tooltip: $('tooltip'),
      buildPanel: $('buildPanel'), buildGrid: $('buildGrid'),
      techPanel: $('techPanel'), techList: $('techList'), techRp: $('techRp'),
      infoPanel: $('infoPanel'), infoBody: $('infoBody'), infoTitle: $('infoTitle'),
      pauseTag: $('pauseTag'),
      btnRecruit: $('btnRecruit'),
      titleScreen: $('titleScreen'), gameover: $('gameover'), victory: $('victory'),
      buildMenu: $('buildMenu'), bmGrid: $('bmGrid'), bmTitle: $('bmTitle'), bmHint: $('bmHint'), bmClose: $('bmClose'),
    };
    this.buildChips();
    this.bindButtons();
    this.bindBuildMenu();
    this.initGuide();
  },
  /* 游戏指南:页签切换 + 首次进入自动弹出 */
  initGuide(){
    document.querySelectorAll('.gtab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.gtab').forEach(x => x.classList.toggle('active', x === t));
        document.querySelectorAll('.gpage').forEach(p => p.classList.toggle('active', p.dataset.page === t.dataset.tab));
        Sfx.uiTick();
      };
    });
    let seenGuide = false;
    try{ seenGuide = !!localStorage.getItem('sparkfront.seenGuide'); }catch(e){}
    if(!seenGuide) this.openHelp();
  },
  openHelp(){
    const h = document.getElementById('help');
    if(!h) return;
    h.classList.remove('hidden');
    const body = h.querySelector('.gbody');
    if(body) body.scrollTop = 0;
    const first = h.querySelector('.gtab[data-tab="goal"]');
    if(first && !first.classList.contains('active')) first.click();
  },
  closeHelp(){
    const h = document.getElementById('help');
    if(h) h.classList.add('hidden');
    try{ localStorage.setItem('sparkfront.seenGuide', '1'); }catch(e){}
  },
  toggleHelp(){
    const h = document.getElementById('help');
    if(!h) return;
    if(h.classList.contains('hidden')) this.openHelp();
    else this.closeHelp();
  },
  bindButtons(){
    const $ = id => document.getElementById(id);
    $('btnBuild').onclick = () => { Sfx.init(); this.togglePanel('build'); };
    $('btnTech').onclick = () => { Sfx.init(); this.togglePanel('tech'); };
    $('btnRecruit').onclick = () => { Sfx.init(); Game.recruit(); };
    $('btnHelp').onclick = () => { Sfx.init(); this.openHelp(); };
    $('helpClose').onclick = () => this.closeHelp();
    $('btnTitleHelp').onclick = () => { Sfx.init(); this.openHelp(); };
    $('btnSave').onclick = () => { Sfx.init(); this.openSlotDialog('save'); };
    $('btnLoad').onclick = () => { Sfx.init(); this.openSlotDialog('load'); };
    const bm = document.getElementById('btnMark');
    if(bm) bm.onclick = () => {
      Sfx.init();
      Game.markMode = !Game.markMode;
      bm.textContent = Game.markMode ? '标记:开' : '标记:关';
      bm.classList.toggle('on', Game.markMode);
      Sfx.uiTick();
      this.msg(Game.markMode ? '标记模式开启:点选资源地块即可标记/取消采集。' : '标记模式关闭。');
    };
    $('btnSound').onclick = (e) => {
      Sfx.init();
      Sfx.muted = !Sfx.muted;
      e.target.textContent = Sfx.muted ? '音效:关' : '音效:开';
    };
    $('btnMenu').onclick = () => { Game.toTitle(); };
    $('btnNew').onclick = () => { Sfx.init(); Game.newGame(document.getElementById('seedInput').value); };
    $('btnContinue').onclick = () => { Sfx.init(); SaveSys.load(); };
    $('goLoad').onclick = () => SaveSys.load();
    $('goNew').onclick = () => { this.els.gameover.classList.add('hidden'); Game.newGame(''); };
    $('vcContinue').onclick = () => this.els.victory.classList.add('hidden');
    document.querySelectorAll('.pclose').forEach(b => b.onclick = () => {
      b.closest('.panel').classList.add('hidden');
      this.buildPanelOpen = this.techPanelOpen = false;
      Game.cancelPlacing();
    });
  },

  /* ---------- 消息 ---------- */
  msg(text, kind){
    const now = performance.now();
    const last = this.logDedup.get(text);
    if(last && now - last < 4000) return;
    this.logDedup.set(text, now);
    this.msgFull(text, kind);
  },
  msgFull(text, kind){
    const line = document.createElement('div');
    line.className = 'logline' + (kind ? ' ' + kind : '');
    line.textContent = text;
    this.els.log.appendChild(line);
    while(this.els.log.children.length > 7) this.els.log.removeChild(this.els.log.firstChild);
    setTimeout(() => { line.style.opacity = '0'; }, 8000);
    setTimeout(() => { if(line.parentNode) line.parentNode.removeChild(line); }, 9500);
  },
  banner(title, msg){
    const el = document.createElement('div');
    el.className = 'banner-item';
    el.innerHTML = '<b>' + title + '</b> — ' + msg;
    this.els.banner.appendChild(el);
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 6000);
  },

  /* ---------- 存档槽位选择(3 槽,主槽兼容旧存档) ---------- */
  openSlotDialog(mode){
    const panel = document.getElementById('slotPanel');
    const grid = document.getElementById('slotGrid');
    if(!panel || !grid){ // 面板缺失时兜底直用主槽
      if(mode === 'save') SaveSys.save(0, false); else SaveSys.load(0);
      return;
    }
    // 与建造/科技/详情面板互斥,避免浮层叠放
    this.els.buildPanel.classList.add('hidden');
    this.els.techPanel.classList.add('hidden');
    this.els.infoPanel.classList.add('hidden');
    this.buildPanelOpen = this.techPanelOpen = false;
    Game.cancelPlacing();
    document.getElementById('slotTitle').textContent = mode === 'save' ? '保存到槽位' : '从槽位读取';
    grid.innerHTML = '';
    const names = ['槽位一(主)', '槽位二', '槽位三'];
    for(let i = 0; i < SaveSys.KEYS.length; i++){
      const m = SaveSys.meta(i);
      const card = document.createElement('div');
      const empty = !m;
      card.className = 'bcard slotcard' + (empty && mode === 'load' ? ' unavail' : '');
      const info = empty ? '空槽位' : (m.bad ? '存档已损坏' : ('第 ' + m.day + ' 天' + (m.at ? ' · ' + this.fmtTime(m.at) : '')));
      card.innerHTML = '<div class="bname">' + names[i] + '</div>' +
        '<div class="slotmeta">' + info + '</div>' +
        '<div class="' + (mode === 'save' ? 'bmok' : 'bmwhy') + '">' +
        (mode === 'save' ? '点击保存(覆盖)' : (empty ? '暂无存档' : '点击读取')) + '</div>';
      card.onclick = () => {
        Sfx.uiTick();
        this.closeSlotDialog();
        if(mode === 'save') SaveSys.save(i, false);
        else SaveSys.load(i);
      };
      grid.appendChild(card);
    }
    panel.classList.remove('hidden');
  },
  closeSlotDialog(){
    const panel = document.getElementById('slotPanel');
    if(panel) panel.classList.add('hidden');
  },
  fmtTime(t){
    try{
      const d = new Date(t);
      const p = n => String(n).padStart(2, '0');
      return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }catch(e){ return ''; }
  },

  /* ---------- 资源筹码 ---------- */
  buildChips(){
    this.els.resChips.innerHTML = '';
    this.chipEls = {};
    for(const k in ITEMS){
      const chip = document.createElement('span');
      chip.className = 'chip zero';
      chip.innerHTML = `<span class="dot" style="background:${ITEMS[k].dot}"></span><span class="cnum">0</span>`;
      chip.title = ITEMS[k].name + (ITEMS[k].food ? '(食物+' + ITEMS[k].food + ')' : '');
      this.els.resChips.appendChild(chip);
      this.chipEls[k] = { el: chip, num: chip.querySelector('.cnum') };
    }
  },

  /* ---------- 每帧 UI 刷新 ---------- */
  tick(dt){
    this.hudT -= dt;
    if(this.hudT > 0) return;
    this.hudT = 0.25;
    this.refreshHUD();
    this.updateTooltip();
    if(this.buildPanelOpen) this.refreshBuildPanel();
    if(this.techPanelOpen) this.refreshTechPanel();
  },
  refreshHUD(){
    const pl = G.player;
    if(!pl) return;
    const b = pl.body;
    this.els.hpFill.style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
    this.els.hpText.textContent = Math.ceil(Math.max(0, b.hp)) + '/' + b.maxHp;
    this.els.hgFill.style.width = Math.max(0, b.hunger) + '%';
    this.els.hgText.textContent = Math.ceil(b.hunger);
    const ck = Systems.clock();
    this.els.dayText.textContent = '第 ' + G.time.day + ' 天' + (G.victory ? ' · ✦' : '');
    const dark = Systems.darknessAt(ck.dayFrac);
    const icon = dark > 0.6 ? '🌙' : (dark > 0.15 ? '🌇' : '☀');
    this.els.timeText.textContent = icon + ' ' + String(ck.h).padStart(2, '0') + ':' + String(ck.m).padStart(2, '0') + (G.rain > 0 ? ' 🌧' : '');
    // 仓储
    const tot = Pool.total(), cap = Pool.cap();
    this.els.storageText.textContent = '仓储 ' + Math.floor(tot) + '/' + cap;
    this.els.stFill.style.width = Math.min(100, tot / cap * 100) + '%';
    // 筹码
    for(const k in this.chipEls){
      const n = Math.floor(G.pool[k] || 0);
      this.chipEls[k].num.textContent = n;
      this.chipEls[k].el.classList.toggle('zero', n === 0);
      this.chipEls[k].el.classList.toggle('full', tot >= cap && n > 0);
    }
    // 招募按钮
    const workers = ECS.query('worker').length;
    const ok = G.campfirePos && workers < MAX_WORKERS && Pool.hasAll({ berry: 8, wood: 15 });
    this.els.btnRecruit.disabled = !ok;
    this.els.btnRecruit.textContent = `招募工人(${workers}/${MAX_WORKERS})`;
  },

  /* ---------- 右键快捷建造菜单 ----------
     右键点击某个方块 → 在光标处弹出"这一格能建什么",点一项即刻在该格开工。
     框选右键仍然是批量标记采集,两个操作互不干扰。 */
  bindBuildMenu(){
    const el = this.els.buildMenu;
    if(!el) return;
    if(this.els.bmClose) this.els.bmClose.onclick = () => { Sfx.uiTick(); this.closeBuildMenu(); };
    // 菜单内部点击不要漏到画布上
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => { e.stopPropagation(); }, { passive: true });
  },
  openBuildMenu(tx, ty, clientX, clientY){
    if(!this.els.buildMenu) return;
    this.bmTile = { tx, ty };
    this.buildMenuOpen = true;
    const el = this.els.buildMenu;
    el.classList.remove('hidden');
    this.refreshBuildMenu();
    // 先渲染再量尺寸,保证菜单贴着光标且不越出视口
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = clientX + 8, y = clientY + 8;
    if(x + w > innerWidth - 8) x = Math.max(8, clientX - w - 8);
    if(y + h > innerHeight - 8) y = Math.max(8, clientY - h - 8);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    Sfx.uiTick();
  },
  closeBuildMenu(){
    if(!this.buildMenuOpen) return;
    this.buildMenuOpen = false;
    this.bmTile = null;
    this.els.buildMenu.classList.add('hidden');
  },
  refreshBuildMenu(){
    if(!this.buildMenuOpen || !this.bmTile) return;
    const { tx, ty } = this.bmTile;
    const grid = this.els.bmGrid;
    grid.innerHTML = '';
    this.els.bmTitle.textContent = '快捷建造 · 第 ' + tx + ' , ' + ty + ' 格';

    const occ = Buildings.buildingAt(tx, ty);
    const { node } = World.nodeAt(tx, ty);

    // 该格上有资源 → 先给出"标记采集"这个最相关的动作
    if(node){
      const act = document.createElement('div');
      act.className = 'bcard bmaction';
      const nm = (typeof NODES !== 'undefined' && NODES[node.t]) ? NODES[node.t].name : '资源';
      const left = (typeof node.amt === 'number') ? node.amt : 0;
      act.innerHTML = '<div class="bname">🏳 ' + (node.marked ? '取消标记' : '标记采集') + '</div>' +
        '<div class="bmnote">' + nm + ' · ' + (left > 0 ? '剩余 ' + left : '已采空') + '</div>';
      act.title = node.marked ? '取消这处资源的采集标记' : '派工人来采这处资源';
      act.onclick = (ev) => {
        ev.stopPropagation();
        Game.markNode(tx, ty);
        this.refreshBuildMenu();
      };
      grid.appendChild(act);
    }

    // 建筑列表:能建的亮着可点,不能建的说清原因
    for(const defId of BUILD_ORDER){
      const def = BUILDINGS[defId];
      const locked = def.tech && !G.tech[def.tech];
      const canHere = Buildings.canPlace(defId, tx, ty);
      const afford = Pool.hasAll(def.cost);
      const ok = !locked && canHere && afford;

      const card = document.createElement('div');
      card.className = 'bcard' + (ok ? '' : ' unavail') + (afford ? '' : ' poor');
      card.title = def.name + ' —— ' + def.desc;

      const costHtml = Object.entries(def.cost).map(([k, v]) => {
        const lack = !Pool.has(k, v);
        return '<span class="' + (lack ? 'lack' : '') + '">' + ITEMS[k].name + '×' + v + '</span>';
      }).join(' ');

      let why = '';
      if(locked) why = '🔒 需要科技:' + TECHS.find(t => t.id === def.tech).name;
      else if(!canHere) why = this.placeReason(defId, tx, ty, node);
      else if(!afford) why = '资源不足';

      card.innerHTML = '<div class="bname">' + def.name + '</div>' +
        '<div class="bcost">' + costHtml + '</div>' +
        '<div class="' + (ok ? 'bmok' : 'bmwhy') + '">' + (ok ? '点击即开工' : why) + '</div>';

      if(ok){
        card.onclick = (ev) => {
          ev.stopPropagation();
          Game.buildAt(defId, tx, ty, ev.shiftKey);
        };
      }
      grid.appendChild(card);
    }

    let hint;
    if(occ) hint = '这一格已经有建筑了。左键点它可以查看详情或拆除。';
    else if(node) hint = '这一格有资源,得先采掉才能建。也可以直接拖拽右键框选,批量标记采集。';
    else hint = '点任意一项立刻在这一格开工(工人们随后会来施工)。按住 Shift 点击可以连续建造。';
    this.els.bmHint.textContent = hint;
  },
  /* 说清"这一格为什么建不了" */
  placeReason(defId, tx, ty, node){
    if(World.terrainAt(tx, ty) === 0) return '不能建在水上';
    if(Buildings.occ.has(Buildings.key(tx, ty))) return '这一格被占用了';
    if(defId === 'autominer') return '只能骑在矿脉上';
    if(node) return '需先清理这格的资源';
    return '此处无法建造';
  },

  /* ---------- 建造面板 ---------- */
  togglePanel(which){
    // 建造 / 科技互斥：同一时刻只允许一个面板显示，否则两块浮层会完全叠在一起
    this.closeSlotDialog();
    if(which === 'build'){
      this.buildPanelOpen = !this.buildPanelOpen;
      if(this.buildPanelOpen) this.techPanelOpen = false;
    } else {
      this.techPanelOpen = !this.techPanelOpen;
      if(this.techPanelOpen) this.buildPanelOpen = false;
    }
    this.els.buildPanel.classList.toggle('hidden', !this.buildPanelOpen);
    this.els.techPanel.classList.toggle('hidden', !this.techPanelOpen);
    // 打开面板时顺手收起建筑详情，避免第三个浮层再叠上来
    if(this.buildPanelOpen || this.techPanelOpen) this.els.infoPanel.classList.add('hidden');
    if(this.buildPanelOpen) this.refreshBuildPanel();
    if(this.techPanelOpen) this.refreshTechPanel();
    if(!this.buildPanelOpen) Game.cancelPlacing();
  },
  closePanels(){
    this.els.buildPanel.classList.add('hidden');
    this.els.techPanel.classList.add('hidden');
    this.els.infoPanel.classList.add('hidden');
    this.buildPanelOpen = this.techPanelOpen = false;
    this.closeSlotDialog();
    this.closeBuildMenu();
    Game.cancelPlacing();
  },
  refreshBuildPanel(){
    const grid = this.els.buildGrid;
    grid.innerHTML = '';
    for(const defId of BUILD_ORDER){
      const def = BUILDINGS[defId];
      const locked = def.tech && !G.tech[def.tech];
      const afford = Pool.hasAll(def.cost);
      const card = document.createElement('div');
      card.className = 'bcard' + (locked ? ' locked' : '') + (!afford && !locked ? ' poor' : '') + (Game.placing === defId ? ' selected' : '');
      let costHtml = Object.entries(def.cost).map(([k, v]) => {
        const lack = !Pool.has(k, v);
        return `<span class="${lack ? 'lack' : ''}">${ITEMS[k].name}×${v}</span>`;
      }).join(' ');
      card.innerHTML = `<div class="bname">${def.name}</div>
        <div class="bdesc">${def.desc}</div>
        <div class="bcost">${costHtml}</div>
        ${locked ? `<div class="btech">🔒 需要科技:${TECHS.find(t => t.id === def.tech).name}</div>` : ''}`;
      if(!locked){
        card.onclick = () => { Sfx.uiTick(); Game.startPlacing(defId); this.refreshBuildPanel(); };
      }
      grid.appendChild(card);
    }
  },

  /* ---------- 科技面板 ---------- */
  refreshTechPanel(){
    this.els.techRp.textContent = '科研点:' + Math.floor(G.rp) + '(由工作台/实验室持续产出,工人操作可加速)';
    const list = this.els.techList;
    list.innerHTML = '';
    const tierNames = { 1: '营火时代', 2: '定居时代', 3: '金属时代', 4: '自动化时代', 5: '星界时代' };
    // 第 1 阶:初始可用建筑(静态说明)
    const baseRow = document.createElement('div');
    baseRow.className = 'tierRow';
    baseRow.innerHTML = `<div class="tierTag">1 ${tierNames[1]}</div>
      <div class="tnode done"><div class="tname">基础建造 ✓</div>
      <div class="tdesc">篝火 / 仓储堆 / 火把 / 木墙 / 工作台 已可用。</div></div>`;
    list.appendChild(baseRow);
    for(let tier = 2; tier <= 5; tier++){
      const techs = TECHS.filter(t => t.tier === tier);
      if(!techs.length) continue;
      const row = document.createElement('div');
      row.className = 'tierRow';
      const tag = document.createElement('div');
      tag.className = 'tierTag';
      tag.textContent = tier + ' ' + tierNames[tier];
      row.appendChild(tag);
      for(const t of techs){
        const done = !!G.tech[t.id];
        const reqOk = t.req.every(r => G.tech[r]);
        const node = document.createElement('div');
        node.className = 'tnode ' + (done ? 'done' : (reqOk ? 'avail' : 'locked'));
        const reqText = t.req.length ? '前置:' + t.req.map(r => TECHS.find(x => x.id === r).name).join('、') : '无前置';
        node.innerHTML = `<div class="tname">${t.name}${done ? ' ✓' : ''}</div>
          <div class="tdesc">${t.desc}</div>
          <div class="tcost">费用 ${t.cost} 科研点 · ${reqText}</div>`;
        if(!done){
          const btn = document.createElement('button');
          btn.className = 'tbtn';
          btn.textContent = reqOk ? (G.rp >= t.cost ? '解锁' : '科研点不足') : '未满足前置';
          btn.disabled = !reqOk || G.rp < t.cost;
          btn.onclick = () => Game.unlockTech(t.id);
          node.appendChild(btn);
        }
        row.appendChild(node);
      }
      list.appendChild(row);
    }
  },

  /* ---------- 建筑详情 ---------- */
  showBuildingInfo(b){
    const bd = b.comps.building;
    const def = BUILDINGS[bd.def];
    this.els.infoTitle.textContent = def.name;
    let html = `<div class="ibrow"><span>状态</span><b>${bd.state === 'done' ? '运转中' : '施工中 ' + Math.floor(bd.progress / bd.work * 100) + '%'}</b></div>`;
    if(bd.state === 'done') html += `<div class="ibrow"><span>耐久</span><b>${Math.ceil(bd.hp)}/${def.hp}</b></div>`;
    if(def.cap) html += `<div class="ibrow"><span>仓储加成</span><b>+${def.cap}</b></div>`;
    if(def.rp) html += `<div class="ibrow"><span>科研产出</span><b>${def.rp}/s × 操作加成</b></div>`;
    if(def.light) html += `<div class="ibrow"><span>光照半径</span><b>${def.light} 格</b></div>`;
    if(def.recipe){
      html += `<div class="ibrow"><span>配方</span><b>${Object.entries(def.recipe.in).map(([k, v]) => ITEMS[k].name + '×' + v).join(' ')} → ${Object.entries(def.recipe.out).map(([k, v]) => ITEMS[k].name + '×' + v).join(' ')}</b></div>`;
      const inS = Object.entries(bd.buf.in).filter(([, v]) => v > 0).map(([k, v]) => ITEMS[k].name + '×' + Math.floor(v)).join(' ') || '空';
      const outS = Object.entries(bd.buf.out).filter(([, v]) => v > 0).map(([k, v]) => ITEMS[k].name + '×' + Math.floor(v)).join(' ') || '空';
      html += `<div class="ibrow"><span>原料缓冲</span><b>${inS}</b></div><div class="ibrow"><span>产出缓冲</span><b>${outS}</b></div>`;
      if(bd.operatorId) html += `<div class="ibrow"><span>操作员</span><b>${ECS.get(bd.operatorId) ? '已派遣 ✓' : '无'}</b></div>`;
    }
    if(bd.def === 'farm'){
      const fm = b.comps.farm;
      html += `<div class="ibrow"><span>作物</span><b>${fm.crop === 0 ? '待播种' : (fm.growth >= 1 ? '已成熟!' : '生长中 ' + Math.floor(fm.growth * 100) + '%')}</b></div>`;
    }
    if(bd.def === 'autominer'){
      const tx = Math.floor(b.pos.x / TILE), ty = Math.floor(b.pos.y / TILE);
      const { node } = World.nodeAt(tx, ty);
      html += `<div class="ibrow"><span>下方矿脉</span><b>${node ? NODES[node.t].name + ' ×' + node.amt : '已枯竭'}</b></div>`;
    }
    html += `<button class="ibbtn" id="btnDemolish">拆除(返还一半造价)</button>`;
    this.els.infoBody.innerHTML = html;
    // 详情面板和建造/科技面板占同一块位置，三者互斥
    if(this.buildPanelOpen || this.techPanelOpen){
      this.els.buildPanel.classList.add('hidden');
      this.els.techPanel.classList.add('hidden');
      this.buildPanelOpen = this.techPanelOpen = false;
      Game.cancelPlacing();
    }
    this.els.infoPanel.classList.remove('hidden');
    document.getElementById('btnDemolish').onclick = () => {
      // force 入仓:拆除退款不应被"食物保底容量"规则吞掉
      for(const k in def.cost) Pool.add(k, Math.floor(def.cost[k] / 2), true);
      Buildings.destroy(b);
      this.els.infoPanel.classList.add('hidden');
    };
  },

  /* ---------- 悬浮提示 ---------- */
  updateTooltip(){
    const tip = this.els.tooltip;
    const h = Game.hoverTile;
    if(!h || !G || !G.player){ tip.classList.add('hidden'); return; }
    const b = Buildings.buildingAt(h.tx, h.ty);
    let html = '';
    if(b){
      const bd = b.comps.building;
      const def = BUILDINGS[bd.def];
      html = `<div class="tt-name">${def.name}${bd.state === 'blueprint' ? '(施工中)' : ''}</div>`;
      if(bd.state === 'blueprint') html += `<div class="tt-dim">进度 ${Math.floor(bd.progress / bd.work * 100)}% · 工人会来施工 · 左键点击取消并全额退款</div>`;
      else if(def.recipe) html += `<div class="tt-dim">点击查看详情</div>`;
      else html += `<div class="tt-dim">${def.desc}</div>`;
    } else {
      const { node } = World.nodeAt(h.tx, h.ty);
      if(node){
        const def = NODES[node.t];
        html = `<div class="tt-name">${def.name}${node.rich ? '(富集)' : ''}</div>
          <div class="tt-dim">剩余 ${node.amt} · ${ITEMS[def.item].name}</div>
          <div class="tt-dim">左键采集 · 右键${node.marked ? '取消' : '标记'}工人采集</div>`;
      } else if(World.terrainAt(h.tx, h.ty) === 0){
        html = `<div class="tt-name">水域</div><div class="tt-dim">不可通行</div>`;
      }
    }
    if(!html){ tip.classList.add('hidden'); return; }
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const x = Game.mouseX + 16, y = Game.mouseY + 16;
    tip.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    tip.style.top = Math.min(y, window.innerHeight - 90) + 'px';
  },

  /* ---------- 结算 ---------- */
  showGameOver(){
    document.getElementById('goStats').innerHTML =
      `存活 <b>${G.time.day}</b> 天 · 击杀蚀影兽 <b>${G.stats.kills}</b> · 采集资源 <b>${G.stats.harvested}</b> · 科技 <b>${Object.keys(G.tech).length}/${TECHS.length}</b>`;
    this.els.gameover.classList.remove('hidden');
  },
  showVictory(){
    document.getElementById('vcStats').innerHTML =
      `耗时 <b>${G.time.day}</b> 天 · 工人 <b>${ECS.query('worker').length}</b> 名 · 科技 <b>${Object.keys(G.tech).length}/${TECHS.length}</b> 全部点亮`;
    this.els.victory.classList.remove('hidden');
  },
  setPauseTag(on){ this.els.pauseTag.classList.toggle('hidden', !on); },
};
