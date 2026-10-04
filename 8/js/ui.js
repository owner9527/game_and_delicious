/* ============================================================
 * 时间碎片 — UI / 交互 / 模式（ui.js）
 * 屏幕：启动/主菜单/章节/关卡/游戏/因果星图/结算/阅读器/列表
 * 模式：主线章节、悖论实验室（每日3题）、无限回环、时间裂隙（周常）
 * ============================================================ */
(function (root) {
  'use strict';
  const E = root.TSEngine, LV = root.TSLevels, ST = root.TSStory, AU = root.TSAudio;
  const TRACKS = ['past', 'present', 'future'];
  const TRACK_CN = { past: '过去', present: '现在', future: '未来' };
  const TRACK_ICO = { past: '⧗', present: '⚙', future: '✦' };
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  const App = {
    save: null,
    game: null, def: null, mode: 'story',
    ctx: null,            // {mode, returnTo, levelKey}
    sel: null,            // 选中的碎片 id
    moveSrc: null,        // move 碎片已选来源
    endless: null,
    graphAnim: 0,
    track: 'past',
    previewTimer: 0,
  };

  /* ================= 通用 UI ================= */
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2200);
  }
  function showModal(title, bodyHTML, actions) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHTML;
    const box = $('modal-actions'); box.innerHTML = '';
    (actions || []).forEach(a => {
      const b = el('button', 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : ''), a.text);
      b.onclick = () => { $('modal-overlay').classList.add('hidden'); if (a.fn) a.fn(); };
      box.appendChild(b);
    });
    $('modal-overlay').classList.remove('hidden');
  }
  function closeOverlay(id) { $(id).classList.add('hidden'); }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $('screen-' + name).classList.remove('hidden');
    if (name !== 'game') { AU.stopAmbience(); stopEndless(); }
    if (name === 'menu') renderMenuStatus();
    Art.setMood(name);           // 背景氛围随界面切换（表现层）
  }

  /* ================= 主菜单 / 章节 / 关卡 ================= */
  function renderMenuStatus() {
    const sv = App.save;
    $('menu-stardust').textContent = '✦ ' + sv.stardust;
    $('menu-shards').textContent = '🧩 ' + sv.shards.length + '/' + ST.shardCount();
    $('menu-progress').textContent = '进度 ' + root.TSMain.progressPct() + '%';
    const seen = sv.finalsSeen.length > 0;
    $('menu-tagline').textContent = seen ? '「管理员不负责回去。管理员负责，所有人都能回去。」' : '如果过去可以被重构，此刻的选择还意味着什么？';
  }

  function renderChapters() {
    const list = $('chapter-list'); list.innerHTML = '';
    $('chapter-dust').textContent = '✦ ' + App.save.stardust;
    LV.CHAPTERS.forEach(ch => {
      const unlocked = root.TSMain.isChapterUnlocked(ch.no);
      const levels = LV.levelsOfChapter(ch.no);
      const cleared = levels.filter(l => App.save.cleared[l.id]).length;
      const stars = levels.reduce((s, l) => s + (App.save.cleared[l.id] ? App.save.cleared[l.id].stars : 0), 0);
      const card = el('div', 'chapter-card' + (unlocked ? '' : ' locked'));
      // 章节主题色（表现层）：卡片左侧色带 / 标题辉光 / 进度条
      const th = Art.chapterTheme(ch.no);
      card.style.setProperty('--ch', th);
      card.style.setProperty('--ch-glow', Art.rgba(th, 0.42));
      card.innerHTML = `<div class="ch-band"></div><span class="ch-ico">${ch.ico}</span>
        <div class="ch-glow"></div>
        <div class="ch-no">第 ${ch.no} 章 · ${unlocked ? cleared + '/' + levels.length + ' 关' : '未解锁'}</div>
        <h3>${ch.name}</h3><div class="ch-desc">${ch.desc}</div>
        <div class="ch-prog"><i style="width:${levels.length ? Math.round(cleared / levels.length * 100) : 0}%"></i></div>
        <div class="ch-meta"><span>★ ${stars}</span><span>${unlocked ? '进入 ›' : '🔒'}</span></div>`;
      if (unlocked) card.onclick = () => { App.chapterCursor = ch.no; openLevelSelect(ch.no); AU.tick(); };
      list.appendChild(card);
    });
  }

  /* ---------- 关卡页辅助：隐藏碎片 / 筛选 / 下一未通关 ---------- */
  function hasUncollectedHidden(lv) {
    return (lv.hidden || []).some(h => !App.save.shards.includes(h.shardId));
  }
  const LEVEL_FILTERS = [
    { key: '', name: '全部' },
    { key: 'uncleared', name: '未通关' },
    { key: 'notperfect', name: '未满星' },
    { key: 'hidden', name: '缺隐藏碎片' },
  ];
  function renderFilterChips() {
    const box = $('filter-chips'); if (!box) return;
    box.innerHTML = '';
    LEVEL_FILTERS.forEach(f => {
      const on = (App.levelFilter || '') === f.key;
      const c = el('button', 'chip' + (on ? ' on' : ''), f.name);
      c.onclick = () => {
        App.levelFilter = on && f.key ? '' : f.key;
        AU.tick();
        renderFilterChips();
        renderLevelGrid(App.curChapter || 1);
      };
      box.appendChild(c);
    });
  }
  function nextUnclearedLevel(fromCh) {
    for (let ch = fromCh; ch <= LV.CHAPTERS.length; ch++) {
      if (!root.TSMain.isChapterUnlocked(ch)) continue;
      const lv = LV.levelsOfChapter(ch).find(l => !App.save.cleared[l.id] && root.TSMain.isLevelUnlocked(l));
      if (lv) return lv;
    }
    return null;
  }

  function openLevelSelect(chNo) {
    const ch = LV.CHAPTERS[chNo - 1];
    if (!ch) return;
    App.curChapter = chNo;
    setHash('#/c' + chNo);
    $('level-title').textContent = `第 ${ch.no} 章 · ${ch.name}`;
    $('chapter-intro').textContent = ch.desc;
    // ① 下一未通关
    const btnNext = $('btn-next-uncleared');
    if (btnNext) btnNext.onclick = () => {
      AU.tick();
      const lv = nextUnclearedLevel(chNo);
      if (lv) startLevel(lv, { mode: 'story' });
      else toast('从本章往后已全部通关，去挑战别的章节吧');
    };
    // ② 章节下拉切换
    const jump = $('chapter-jump');
    if (jump) {
      jump.innerHTML = '';
      LV.CHAPTERS.forEach(c => {
        const levels = LV.levelsOfChapter(c.no);
        const cleared = levels.filter(l => App.save.cleared[l.id]).length;
        const o = el('option', '', `第 ${c.no} 章 · ${c.name}（${cleared}/${levels.length}）`);
        o.value = c.no;
        if (!root.TSMain.isChapterUnlocked(c.no)) { o.disabled = true; o.textContent = `第 ${c.no} 章 · ${c.name}（🔒 未解锁）`; }
        if (c.no === chNo) o.selected = true;
        jump.appendChild(o);
      });
      jump.onchange = () => { const n = +jump.value; if (n) { AU.tick(); openLevelSelect(n); } };
    }
    // ④ 筛选 chips
    renderFilterChips();
    renderLevelGrid(chNo);
    // 章节结局
    const levels = LV.levelsOfChapter(chNo);
    const box = $('chapter-ending-box');
    const chCleared = levels.filter(l => App.save.cleared[l.id]).length === levels.length;
    if (chCleared) {
      const hasDeeper = ST.byChapter(chNo).some(id => ST.SHARDS[id].hidden && App.save.shards.includes(id));
      box.classList.remove('hidden');
      box.innerHTML = `<b>章节记忆 · ${ch.name}</b><br>${ST.CHAPTER_ENDINGS[chNo].surface}` +
        (hasDeeper ? `<br><br><b style="color:var(--para)">◈ 里层</b><br>${ST.CHAPTER_ENDINGS[chNo].deeper}` : '') +
        (hasDeeper ? '' : `<div class="end-btn"><small>（收集本章「里层真相」碎片，解锁里层记忆）</small></div>`);
    } else box.classList.add('hidden');
    showScreen('levelselect');
  }

  function renderLevelGrid(chNo) {
    const ch = LV.CHAPTERS[chNo - 1];
    const levels = LV.levelsOfChapter(chNo);
    const grid = $('level-grid'); grid.innerHTML = '';
    // 关卡网格整体挂上本章主题色（表现层）
    const chTheme = Art.chapterTheme(chNo);
    grid.style.setProperty('--ch', chTheme);
    grid.style.setProperty('--ch-glow', Art.rgba(chTheme, 0.42));
    let shown = 0;
    levels.forEach((lv) => {
      const unlocked = root.TSMain.isLevelUnlocked(lv);
      const rec = App.save.cleared[lv.id];
      // ④ 筛选：未通关 / 未满星 / 含未拿隐藏碎片
      const f = App.levelFilter || '';
      if (f === 'uncleared' && rec) return;
      if (f === 'notperfect' && (!rec || rec.stars >= 3)) return;
      if (f === 'hidden' && !hasUncollectedHidden(lv)) return;
      shown++;
      // 四种状态：locked / play（可玩）/ cleared（已通关）/ perfect（满星）
      let stateCls = '';
      let stateTxt = '未解锁';
      if (rec && rec.stars >= 3) { stateCls = ' perfect'; stateTxt = '满星'; }
      else if (rec) { stateCls = ' cleared'; stateTxt = '已通关'; }
      else if (unlocked) { stateCls = ' play'; stateTxt = '可挑战'; }
      // ⑤ 角标：◈ = 本关藏有未收集的里层碎片；★…☆ = 当前星评
      const needHidden = hasUncollectedHidden(lv);
      const badges =
        (needHidden ? '<span class="lv-hid" title="本关藏有未收集的「里层真相」碎片">◈</span>' : '') +
        (rec ? `<span class="lv-stars" title="当前星评">${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}</span>` : '');
      const node = el('button', 'level-node' + (unlocked ? '' : ' locked') + (lv.kind === 'boss' ? ' boss' : '') + stateCls);
      node.innerHTML = `<div class="lv-badges">${badges}</div>
        <div class="lv-no">${lv.kind === 'boss' ? '因果对决' : '第 ' + lv.index + ' 关'}${lv.gen ? ' · 回响' : ''}</div>
        <span class="lv-state">${stateTxt}</span>
        <h4>${unlocked || rec ? lv.title : '？？？'}</h4>
        <div class="stars-mini">${rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : ''}</div>`;
      if (unlocked) node.onclick = () => startLevel(lv, { mode: 'story' });
      grid.appendChild(node);
    });
    if (!shown) grid.appendChild(el('p', 'chapter-intro', '（本筛选条件下没有关卡）'));
  }

  /* ================= 开始关卡 ================= */
  function startLevel(def, ctx) {
    App.def = def; App.mode = ctx.mode || 'story'; App.ctx = ctx || {};
    App.game = new E.Game(def);
    App.sel = null; App.moveSrc = null; App.track = 'past';
    // —— 每关复位（修复跨关残留）：道具生效表 / 已用碎片 / 提示步进 / 无效操作计数 ——
    App.activeItems = new Set();
    App.usedShardIds = new Set(); App.usedStack = [];
    App.hintStep = 0; App.invalidCount = 0;
    if (App.mode === 'story' && def && def.id) {
      // 进关即写：主菜单「继续调查」与 hash 路由都以此为锚点
      App.save.lastLevelId = def.id;
      root.TSMain.persist();
      setHash('#/' + def.id);
    }
    showScreen('game');
    renderAll();
    AU.switchTo('past');
    AU.init(); AU.resume();
    const tip = def.tips || (def.hint && def.hint[0]) || '';
    if (tip) toast('◈ ' + tip, 3600);
    if (def.intro) {
      showModal(def.title, `<b style="color:var(--gold)">任务简报</b><br>${def.intro}<br><br><small style="color:var(--ink-dim)">目标 ${def.goals.length} 个 · 标准解 ${def.par} 步</small>`,
        [{ text: '开始重构', primary: true, fn: () => { AU.init(); AU.resume(); } }]);
    }
  }

  /* ================= hash 路由（#/c3 / #/c3l05） ================= */
  let hashSilent = false;   // 程序内改 hash 时不响应自身触发的 hashchange
  function setHash(h) {
    if (typeof location === 'undefined' || location.hash === h) return;
    hashSilent = true;
    location.hash = h;
  }
  function parseHash() {
    if (typeof location === 'undefined') return null;
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return null;
    const mCh = h.match(/^c(\d+)$/);
    if (mCh) { const n = +mCh[1]; return (n >= 1 && n <= LV.CHAPTERS.length) ? { chapter: n } : null; }
    try {
      const def = LV.getLevel(h);
      if (def) return { levelId: h, def };
    } catch (e) { void e; }
    return null;
  }
  function routeFromHash() {
    const p = parseHash();
    if (!p) return false;
    if (p.chapter) { openLevelSelect(p.chapter); return true; }
    if (p.def) {
      if (root.TSMain.isLevelUnlocked(p.def)) { startLevel(p.def, { mode: 'story' }); return true; }
      openLevelSelect(p.def.chapter || 1);   // 未解锁：落到所在章节的关卡页
      return true;
    }
    return false;
  }
  function continueInvestigation() {
    // 「继续调查」：直达上一次游玩的关卡（老存档无 lastLevelId 则退回章节列表）
    const id = App.save.lastLevelId;
    let def = null;
    if (id) { try { def = LV.getLevel(id); } catch (e) { def = null; } }
    if (def && root.TSMain.isLevelUnlocked(def)) { startLevel(def, { mode: 'story' }); return; }
    renderChapters(); showScreen('chapterselect');
  }

  /* ================= 渲染 ================= */
  function renderAll() { renderHUD(); renderBoard(); renderBag(); renderItems(); }

  function renderHUD() {
    const g = App.game, def = App.def;
    $('hud-goal').innerHTML = '目标：' + g.goalStatus().map(s =>
      `<span style="color:${s.done ? 'var(--good)' : 'var(--gold)'}">${s.done ? '✓' : '◇'} ${g.entName(s.e)}·${g.label(s.e, s.st)}（${TRACK_CN[s.t]}·${s.s + 1}号位）</span>`
    ).join('　');
    $('meter-integrity').style.width = g.integrity + '%';
    $('meter-integrity-num').textContent = g.integrity;
    $('meter-steps').style.width = Math.min(100, g.steps / Math.max(1, def.par * 2) * 100) + '%';
    $('meter-steps-num').textContent = g.steps + '/' + def.par;
    const badge = $('hud-track-badge');
    badge.textContent = TRACK_ICO[App.track] + ' ' + TRACK_CN[App.track];
    badge.className = 'track-badge t-' + App.track;
    $('btn-undo').disabled = !g.canUndo();
    $('btn-redo').disabled = !g.canRedo();
  }

  function stateClass(g, f) {
    const goal = (App.def.goals || []).find(o => o.t === f.t && o.s === f.s && o.e === f.e);
    if (goal) return goal.st === f.st ? 'st-good st-glow' : 'st-bad';
    const hid = (App.def.hidden || []).find(o => o.t === f.t && o.s === f.s && o.e === f.e);
    if (hid && hid.st === f.st) return 'st-good st-glow';
    return '';
  }

  function renderBoard() {
    const g = App.game, def = App.def;
    const board = $('board'); board.innerHTML = '';
    TRACKS.forEach(tr => {
      const locked = !(def.interactive || TRACKS).includes(tr);
      const t = el('div', 'track t-' + tr + (App.track === tr ? ' active' : ''));
      const head = el('div', 'track-head');
      head.innerHTML = `<span class="th-ico">${TRACK_ICO[tr]}</span>${TRACK_CN[tr]}线
        <span class="th-note">${tr === 'past' ? '一切的起点' : tr === 'present' ? '涟漪抵达之处' : '尚未发生'}</span>
        ${locked ? '<span class="th-lock">单向律 · 本线不可操作</span>' : ''}`;
      head.onclick = () => setTrack(tr);
      t.appendChild(head);
      const cells = el('div', 'cells');
      for (let s = 0; s < def.slots[tr]; s++) {
        const isGoalCell = (def.goals || []).some(o => o.t === tr && o.s === s) || (def.hidden || []).some(o => o.t === tr && o.s === s);
        const c = el('div', 'cell' + (isGoalCell ? ' key' : ''));
        c.dataset.t = tr; c.dataset.s = s;
        c.appendChild(el('div', 'slot-time', (s + 1) + '号位'));
        const done = (def.goals || []).filter(o => o.t === tr && o.s === s).every(o => {
          const f = g.facts.get(E.kOf(tr, s, o.e)); return f && f.st === o.st;
        });
        if (isGoalCell && done) c.classList.add('done');
        g.factsAt(tr, s).forEach(f => {
          const meta = def.entities.find(x => x.id === f.e) || { name: f.e, icon: '❔' };
          const e = el('div', 'entity ' + stateClass(g, f));
          e.innerHTML = `<span class="e-ico">${meta.icon}</span><span class="e-txt"><span class="e-name">${meta.name}</span><span class="e-state">${g.label(f.e, f.st)}</span></span>`;
          c.appendChild(e);
        });
        (def.goals || []).filter(o => o.t === tr && o.s === s).forEach(o => {
          const f = g.facts.get(E.kOf(tr, s, o.e));
          if (!f || f.st !== o.st)
            c.appendChild(el('div', 'goal-ghost', `◇ 目标：${g.entName(o.e)}·${g.label(o.e, o.st)}`));
        });
        bindCell(c);
        cells.appendChild(c);
      }
      t.appendChild(cells);
      board.appendChild(t);
    });
    // 轨道材质贴图 + 因果能量流连线的几何测量（等一帧让布局稳定，避免每帧重排）
    requestAnimationFrame(() => Art.paintTracks());
  }

  function renderBag() {
    const g = App.game, def = App.def;
    const bag = $('bag-items'); bag.innerHTML = '';
    (def.shards || []).forEach(sh => {
      const used = App.usedShardIds && App.usedShardIds.has(sh.id);
      const chip = el('div', 'shard-chip' + (App.sel === sh.id ? ' sel' : '') + (used ? ' used' : ''));
      chip.innerHTML = `<span class="sc-ico">${sh.icon}</span><span class="sc-name">${sh.name}</span>
        <span class="sc-track">${sh.kind === 'plant' ? '预置闭环' : sh.kind === 'move' ? '拖拽搬移' : (sh.track ? TRACK_CN[sh.track] + '线' : '任意线')}</span>` +
        (used ? '<span class="sc-badge">已用</span>' : '');
      chip.dataset.shard = sh.id;
      chip.addEventListener('pointerdown', (ev) => onChipPointerDown(ev, sh, chip));
      bag.appendChild(chip);
    });
  }

  /* ---------- 道具表：效果收口为 apply(game, ctx) 钩子 ----------
   * 返回 {ok, msg}；ok=false 时不扣道具。
   * watch 只在无限回环生效（写 App.endless.frozenUntil，endlessTick 认该字段）；
   * glue/charm 挂在引擎状态上（engine._storm 消费），不走 activeItems。 */
  const ITEM_META = {
    watch: {
      name: '时间怀表', icon: '⏱️', desc: '无限回环中冻结崩坏 30 秒',
      apply() {
        if (App.mode !== 'endless' || !App.endless) return { ok: false, msg: '时间怀表只在「无限回环」中生效' };
        App.endless.frozenUntil = performance.now() + 30000;
        return { ok: true, msg: '时间怀表已激活：崩坏冻结 30 秒' };
      },
    },
    glue: {
      name: '因果胶水', icon: '🧿', desc: '本关内抵消一次风暴惩罚',
      apply(game) {
        if (App.mode === 'endless') return { ok: false, msg: '无限回环中没有时间风暴，胶水无处可粘' };
        if (!game) return { ok: false, msg: '当前没有进行中的对局' };
        game.glued = true;
        return { ok: true, msg: '因果胶水已激活：下一次时间风暴的惩罚将被抵消' };
      },
    },
    mirror: {
      name: '涟漪镜', icon: '🔮', desc: '本关内预览完整涟漪链',
      apply() { return { ok: true, msg: '涟漪镜已激活：长按节点可预览完整涟漪链' }; },
    },
    hourglass: {
      name: '回溯沙漏', icon: '⏳', desc: '本关内撤销不计入完美判定',
      apply() { return { ok: true, msg: '回溯沙漏已激活：撤销不再计入完美判定' }; },
    },
    charm: {
      name: '悖论护符', icon: '🛡️', desc: '抵消下一次时间风暴',
      apply(game) {
        if (App.mode === 'endless') return { ok: false, msg: '无限回环中没有时间风暴，护符无从护起' };
        if (!game) return { ok: false, msg: '当前没有进行中的对局' };
        if (game.charmedPending || game.charmed) return { ok: false, msg: '悖论护符已生效中' };
        game.charmedPending = true;
        return { ok: true, msg: '悖论护符生效中：下一次时间风暴将被抵消' };
      },
    },
  };
  function isItemActive(k) {
    if (App.activeItems && App.activeItems.has(k)) return true;
    return k === 'glue' && !!App.game && !!App.game.glued;
  }
  function renderItems() {
    const box = $('item-items'); box.innerHTML = '';
    Object.entries(ITEM_META).forEach(([k, m]) => {
      const cnt = (App.save.items[k] || 0);
      const active = isItemActive(k);
      const chip = el('div', 'item-chip' + (active ? ' sel' : '') + (cnt === 0 ? ' used' : ''),
        `<span class="sc-ico">${m.icon}</span><span class="cnt">${active ? '生效中' : '×' + cnt}</span>`);
      chip.title = m.name + '：' + m.desc;
      chip.onclick = () => useItem(k);
      box.appendChild(chip);
    });
  }

  function useItem(k) {
    const sv = App.save, m = ITEM_META[k];
    if (!m) return;
    if (App.mode === 'endless-over') return;
    if (isItemActive(k)) { toast('该道具本关已生效'); return; }
    if ((sv.items[k] || 0) <= 0) { toast('道具不足，可在「时之铺」用星尘兑换'); AU.wrong(); return; }
    const r = m.apply ? m.apply(App.game, App.ctx) : { ok: false, msg: '该道具当前不可用' };
    if (!r || r.ok === false) { toast((r && r.msg) || '该道具当前不可用'); AU.wrong(); return; }
    if (k !== 'glue' && k !== 'charm') {  // glue/charm 的生效状态由引擎状态承载，可叠加
      App.activeItems = App.activeItems || new Set();
      App.activeItems.add(k);
    }
    sv.items[k]--;
    renderItems(); root.TSMain.persist();
    toast(r.msg || (m.name + ' 已激活：' + m.desc), 2600);
  }

  function setTrack(tr) {
    App.track = tr;
    AU.switchTo(tr); AU.tick();
    renderBoard(); renderHUD();
  }

  /* ================= 交互：碎片 → 节点 ================= */
  let dragGhost = null;
  function onChipPointerDown(ev, sh, chip) {
    if (ev.button === 2) return;
    ev.preventDefault();
    selectShard(sh.id);
    const startX = ev.clientX, startY = ev.clientY;
    let dragging = false;
    const move = (e2) => {
      if (!dragging && Math.hypot(e2.clientX - startX, e2.clientY - startY) > 8) {
        dragging = true;
        chip.classList.add('dragging');
      }
      if (dragging) {
        chip.style.left = (e2.clientX - 36) + 'px';
        chip.style.top = (e2.clientY - 24) + 'px';
        document.querySelectorAll('.cell.drop-ok').forEach(c => c.classList.remove('drop-ok'));
        const t = document.elementFromPoint(e2.clientX, e2.clientY);
        const cell = t && t.closest && t.closest('.cell');
        if (cell && !isLockedTrack(cell.dataset.t)) cell.classList.add('drop-ok');
      }
    };
    const up = (e2) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      chip.classList.remove('dragging');
      chip.style.left = chip.style.top = '';
      document.querySelectorAll('.cell.drop-ok').forEach(c => c.classList.remove('drop-ok'));
      if (!dragging) return; // 视为点击选择
      const t = document.elementFromPoint(e2.clientX, e2.clientY);
      const cell = t && t.closest && t.closest('.cell');
      if (cell) {
        const target = { t: cell.dataset.t, s: +cell.dataset.s };
        if (sh.kind === 'move' && !App.moveSrc) trySetMoveSource(sh, target);
        else applyShard(sh.id, target);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function selectShard(id) {
    App.sel = App.sel === id ? null : id;
    App.moveSrc = null;
    hideHint();
    AU.tick();
    renderBag();
    const sh = App.def.shards.find(s => s.id === App.sel);
    if (sh && sh.kind === 'move') showHint('拖拽或点击：先选择「' + App.game.entName(sh.entity) + '」所在的节点', 0);
    else if (sh) showHint('点击一个' + (sh.track ? TRACK_CN[sh.track] : '') + '线节点来使用「' + sh.name + '」', 0);
  }

  function isLockedTrack(t) { return !(App.def.interactive || TRACKS).includes(t); }

  function trySetMoveSource(sh, target) {
    const g = App.game;
    const f = g.facts.get(E.kOf(target.t, target.s, sh.entity));
    if (isLockedTrack(target.t)) { opInvalid('单向律：' + TRACK_CN[target.t] + '线当前不可操作'); return; }
    if (!f || (sh.fromNeed && f.st !== sh.fromNeed)) {
      opInvalid('这里没有可移动的「' + g.entName(sh.entity) + '」');
      return;
    }
    App.moveSrc = target;
    AU.tick();
    document.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    document.querySelector(`.cell[data-t="${target.t}"][data-s="${target.s}"]`).classList.add('sel');
    showHint('再点击同一时间线上的目标节点', 0);
  }

  function applyShard(shardId, target) {
    const g = App.game;
    const op = { shardId, target };
    if (App.moveSrc) { op.source = App.moveSrc; }
    hideHint();
    const sh = App.def.shards.find(s => s.id === shardId);
    if (sh && sh.kind === 'move' && !op.source) { trySetMoveSource(sh, target); return; }
    const ok = g.applyOp(op);
    App.moveSrc = null;
    App.suppressClick = true;
    setTimeout(() => { App.suppressClick = false; }, 250);
    document.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    if (!ok) {
      opInvalid(g.msg || '无效操作（完整度 -5）');
    } else {
      AU.gear();
      markShardUsed(shardId);
      animateWave(g.lastWave);
      if (g.msg && g.msg.indexOf('时间风暴') < 0 && g.msg.indexOf('操作完成') < 0) toast(g.msg, 1600);
      if (g.msg && g.msg.indexOf('时间风暴') >= 0) {
        stormFx();
        toast(g.msg, 2400);
      }
      if (App.mode === 'endless' && App.endless) App.endless.fixes++;
    }
    if (App.mode !== 'endless') renderAll(); else { renderBag(); renderItems(); }
    hidePreview();
    afterOp();
  }

  /* ---------- 已用碎片记录（撤销时回退最近一次） ---------- */
  function markShardUsed(shardId) {
    if (App.mode === 'endless') return;   // 无限回环的稳定碎片可反复使用，不标记
    if (!App.usedShardIds) App.usedShardIds = new Set();
    App.usedShardIds.add(shardId);
    if (!App.usedStack) App.usedStack = [];
    App.usedStack.push(shardId);
  }
  function onUndone() {
    // 撤销会还原该步操作 → 对应碎片的「已用」标记一并回退
    if (!App.usedStack || !App.usedStack.length) return;
    const id = App.usedStack.pop();
    if (id && App.usedShardIds) App.usedShardIds.delete(id);
  }

  function stormFx() {
    AU.storm();
    $('storm-overlay').classList.add('on');
    document.getElementById('board').classList.add('shaking');
    setTimeout(() => {
      $('storm-overlay').classList.remove('on');
      document.getElementById('board').classList.remove('shaking');
    }, 1100);
  }

  function opInvalid(msg) {
    AU.wrong();
    toast('✕ ' + msg, 2000);
    App.invalidCount = (App.invalidCount || 0) + 1;
    if (App.invalidCount === 3 && App.def.hint && App.def.hint[0]) {
      showHint('提示：' + App.def.hint[0], 6000);
    }
  }

  function afterOp() {
    const g = App.game;
    if (g.state === 'won') {
      setTimeout(() => onWin(), 650);
    } else if (g.state === 'collapsed') {
      AU.collapse();
      $('storm-overlay').classList.add('on');
      setTimeout(() => $('storm-overlay').classList.remove('on'), 1400);
      setTimeout(() => showModal('⏳ 时间崩塌', '时间完整度归零（或风暴三次）。<br>这一段因果需要重新编排。',
        [{ text: '重新开始', primary: true, fn: () => restartLevel() }, { text: '返回', fn: () => exitLevel() }]), 900);
    }
  }

  function animateWave(wave) {
    if (!wave || !wave.length) return;
    wave.filter(w => w.type === 'ripple' || w.type === 'conflict').forEach((w, i) => {
      setTimeout(() => {
        const sel = `.cell[data-t="${w.to.t}"][data-s="${w.to.s}"]`;
        const cell = document.querySelector(sel);
        if (!cell) return;
        const d = el('div', 'ripple-dot');
        d.style.right = '12px'; d.style.top = '12px';
        d.style.background = w.type === 'conflict' ? 'var(--para)' : 'var(--accent)';
        d.style.boxShadow = '0 0 12px ' + (w.type === 'conflict' ? 'var(--para)' : 'var(--accent)');
        cell.appendChild(d);
        AU.ripple();
        // —— 美术表现：时间同步的重影残像 + 粒子重组（只影响画面）——
        Art.ghosts(cell);
        const fromSel = `.cell[data-t="${w.from.t}"][data-s="${w.from.s}"]`;
        const fromCell = document.querySelector(fromSel) || cell;
        const col = w.type === 'conflict' ? '#ff3fa4' : (w.to.t === 'past' ? '#e0a35c' : w.to.t === 'present' ? '#93b4d0' : '#7ef0e2');
        try {
          FX.push(FX.center(fromCell), FX.center(cell), col, w.type === 'conflict' ? 16 : 10);
        } catch (e) { void e; }
        setTimeout(() => d.remove(), 800);
      }, 160 + i * 240);
    });
  }

  function bindCell(c) {
    c.addEventListener('click', () => {
      if (App.suppressClick) return;
      const target = { t: c.dataset.t, s: +c.dataset.s };
      if (App.sel) applyShard(App.sel, target);
    });
    // 长按预览涟漪
    c.addEventListener('pointerdown', (ev) => {
      if (App.sel) return;
      const x = ev.clientX, y = ev.clientY;
      App.previewTimer = setTimeout(() => {
        showPreview(c, x, y);
      }, 420);
    });
    ['pointerup', 'pointerleave', 'pointermove'].forEach(evt =>
      c.addEventListener(evt, (ev) => {
        if (evt === 'pointermove' && Math.hypot(ev.movementX || 0, ev.movementY || 0) < 3) return;
        clearTimeout(App.previewTimer);
        if (evt !== 'pointermove') hidePreview();
      }));
  }

  function showPreview(cell, x, y) {
    const g = App.game;
    const list = g.previewFrom(cell.dataset.t, +cell.dataset.s);
    if (!list.length) { toast('这里没有可推演的因果'); return; }
    const pop = $('preview-pop');
    const mirror = App.activeItems && App.activeItems.has('mirror');
    pop.innerHTML = '<b>◈ 涟漪推演' + (mirror ? ' · 涟漪镜全链' : '') + '</b><br>' + list.slice(0, mirror ? 12 : 6).map(p =>
      `<span class="${p.blocked ? 'pv-blocked' : 'pv-hop'}">${p.blocked ? '✕(涟漪消散' + p.strength + ')' : '→'} ${p.text} <small>[强度${p.strength}${p.willChange ? '' : '·已满足'}]</small></span>`
    ).join('<br>');
    pop.classList.remove('hidden');
    const rect = cell.getBoundingClientRect();
    pop.style.left = Math.min(root.innerWidth - 320, rect.left) + 'px';
    pop.style.top = Math.min(root.innerHeight - 220, rect.bottom + 8) + 'px';
  }
  function hidePreview() { $('preview-pop').classList.add('hidden'); }

  function showHint(text, ms) {
    const h = $('hint-bubble');
    h.innerHTML = '◈ ' + text;
    h.classList.remove('hidden');
    h.style.left = '16px'; h.style.bottom = '86px'; h.style.right = 'auto'; h.style.top = 'auto';
    if (ms) setTimeout(hideHint, ms);
  }
  function hideHint() { $('hint-bubble').classList.add('hidden'); }

  /* ================= 撤销 / 重做 / 重开 ================= */
  function restartLevel() {
    if (App.def && App.def.id === 'endless') { startEndless(); return; }
    startLevel(App.def, App.ctx);
  }
  function exitLevel() {
    if (App.ctx.mode === 'story') openLevelSelect(App.def.chapter);
    else if (App.ctx.mode === 'lab') navLab();
    else if (App.ctx.mode === 'rift') showScreen('menu');
    else showScreen('menu');
  }

  /* ================= 结算 ================= */
  function onWin() {
    const g = App.game, def = App.def;
    AU.chime();
    // 表现层：通关时以棋盘中心做一次粒子重组爆发
    try { FX.burst(FX.center($('board')), '#ffd76e', 54); } catch (e) { void e; }
    const stars = g.stars();
    const sc = g.score();
    const hiddenIds = [...g.hiddenDone];
    const flawless = g.flawless();
    const noStorm = g.storms === 0;
    const undoless = g.undoCount === 0;
    const res = root.TSMain.recordClear(def, {
      stars, score: sc.total, steps: g.steps, hiddenIds, flawless, noStorm, undoless,
    });
    // 结算界面
    $('settle-title').textContent = def.title + ' · 因果重构完成';
    $('settle-breakdown').innerHTML =
      `因果完好度（${g.integrity}/100）<b>+${sc.integrity}</b><br>` +
      `步数（${g.steps} / 标准 ${def.par}）<b>+${sc.steps}</b><br>` +
      `隐藏碎片<b>+${sc.hidden}</b><br>` +
      `合计<b style="color:var(--gold)">${sc.total} · 星尘 +${res.stardust}</b>`;
    const shardBox = $('settle-shards'); shardBox.innerHTML = '';
    res.newShards.forEach(id => {
      const sh = ST.get(id);
      if (!sh) return;
      const d = el('div', 'shard-got', `<b>◆ ${sh.kind}</b>${sh.title}<br><small>${sh.text.split('\n')[0]}</small>`);
      d.onclick = () => openReader(id);
      shardBox.appendChild(d);
    });
    if (!res.newShards.length) shardBox.innerHTML = '<small style="color:var(--ink-dim)">本关没有新的叙事碎片</small>';
    // 结局文本
    const endBox = $('settle-end');
    endBox.innerHTML = res.endingHTML || '';
    // 星星动画
    [1, 2, 3].forEach(i => $('star' + i).classList.remove('lit'));
    $('btn-settle-next').textContent = (App.ctx.mode === 'story') ? '下一关 ›' : '返回 ›';
    $('settle-overlay').classList.remove('hidden');
    for (let i = 0; i < stars; i++) {
      setTimeout(() => { $('star' + (i + 1)).classList.add('lit'); AU.star(i); }, 350 + i * 420);
    }
    renderMenuStatusSafe();
  }
  function renderMenuStatusSafe() { try { renderMenuStatus(); } catch (e) { void e; } }

  function shareCard() {
    const g = App.game, def = App.def;
    const stars = g.stars();
    const cv = document.createElement('canvas');
    cv.width = 720; cv.height = 960;
    cv.id = 'canvas-share';
    const x = cv.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 720, 960);
    grd.addColorStop(0, '#2a2118'); grd.addColorStop(.5, '#141a26'); grd.addColorStop(1, '#0e1a1d');
    x.fillStyle = grd; x.fillRect(0, 0, 720, 960);
    // 三线轨道
    [['#d99a4e', 300], ['#7f96ad', 480], ['#8fd8cf', 660]].forEach(([c, y]) => {
      x.strokeStyle = c; x.globalAlpha = .35; x.lineWidth = 3;
      x.beginPath(); x.moveTo(80, y); x.lineTo(640, y); x.stroke();
      x.globalAlpha = 1;
    });
    x.textAlign = 'center';
    x.fillStyle = '#e8e4da'; x.font = 'bold 64px sans-serif';
    x.fillText('时间碎片', 360, 150);
    x.font = '22px sans-serif'; x.fillStyle = '#9aa3b2';
    x.fillText('TIME SHARDS · 因果重构完成', 360, 195);
    x.fillStyle = '#ffd76e'; x.font = 'bold 40px sans-serif';
    x.fillText('第 ' + def.chapter + ' 章 · ' + def.title, 360, 260);
    x.font = '120px sans-serif';
    x.fillStyle = '#ffd76e';
    x.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), 360, 430);
    x.font = '26px sans-serif'; x.fillStyle = '#e8e4da';
    x.fillText(`得分 ${g.score().total}　步数 ${g.steps}/${def.par}　完整度 ${g.integrity}`, 360, 520);
    x.fillStyle = '#9aa3b2'; x.font = '20px sans-serif';
    x.fillText('三线并行 · 因果重构 · 碎片化叙事解谜', 360, 760);
    x.fillText(new Date().toLocaleDateString('zh-CN') + ' · 钟塔镇', 360, 800);
    // 替换结算界面内容为分享卡
    const box = $('settle-overlay').querySelector('.settle-card');
    const old = box.innerHTML;
    box.innerHTML = '';
    box.appendChild(cv);
    const dl = el('a', 'btn btn-primary', '保存分享卡');
    dl.href = cv.toDataURL('image/png');
    dl.download = 'timeshards_' + def.id + '.png';
    dl.style.marginTop = '12px';
    dl.onclick = () => { box.innerHTML = old; bindSettleButtons(); };
    box.appendChild(dl);
    const back = el('button', 'btn', '返回结算');
    back.onclick = () => { box.innerHTML = old; bindSettleButtons(); };
    box.appendChild(back);
  }

  function bindSettleButtons() {
    $('btn-settle-retry').onclick = () => { closeOverlay('settle-overlay'); restartLevel(); };
    $('btn-settle-share').onclick = shareCard;
    $('btn-settle-next').onclick = () => {
      closeOverlay('settle-overlay');
      const def = App.def;
      if (App.ctx.mode === 'story') {
        const levels = LV.levelsOfChapter(def.chapter);
        const i = levels.findIndex(l => l.id === def.id);
        if (i >= 0 && i + 1 < levels.length && root.TSMain.isLevelUnlocked(levels[i + 1])) startLevel(levels[i + 1], { mode: 'story' });
        else openLevelSelect(def.chapter);
      } else exitLevel();
    };
  }

  /* ================= 因果星图 ================= */
  const G = { scale: 1, ox: 0, oy: 0 };
  // 三条时间线的星图配色
  const GTR = {
    past: { c: '#e0a35c', lt: '#f7dcae', y: 60, name: '过去线' },
    present: { c: '#93b4d0', lt: '#dcecf8', y: 260, name: '现在线' },
    future: { c: '#7ef0e2', lt: '#d9fff8', y: 460, name: '未来线' },
  };
  // 星图离屏缓存（星云底 / 轨道贴图）——只为减少每帧的全画布渐变填充
  const gfx = { cache: null, W: 0, H: 0, bands: new Map() };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function buildGraphBg(W, H) {
    const c = gfx.cache || (gfx.cache = document.createElement('canvas'));
    c.width = Math.max(1, W); c.height = Math.max(1, H);
    gfx.W = W; gfx.H = H;
    const x = c.getContext('2d');
    const bgG = x.createLinearGradient(0, 0, W, H);
    bgG.addColorStop(0, '#070c16'); bgG.addColorStop(0.45, '#0b1220'); bgG.addColorStop(1, '#0d0b1e');
    x.fillStyle = bgG; x.fillRect(0, 0, W, H);
    // 三条时间线的色散星云
    x.globalCompositeOperation = 'lighter';
    Object.keys(GTR).forEach((tr, i) => {
      const t = GTR[tr];
      const g = x.createRadialGradient(W * (0.22 + i * 0.3), t.y, 0, W * (0.22 + i * 0.3), t.y, 340);
      g.addColorStop(0, Art.rgba(t.c, 0.12)); g.addColorStop(1, Art.rgba(t.c, 0));
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    });
    // 因果尘埃（确定性散点，像运镜里的星尘）
    for (let i = 0; i < 110; i++) {
      const h1 = hashStr('d' + i), h2 = hashStr('e' + i);
      const px = (h1 % 1000) / 1000 * W, py = (h2 % 1000) / 1000 * H;
      const a = 0.05 + ((h1 >> 10) % 100) / 100 * 0.16;
      x.fillStyle = 'rgba(200,224,255,' + a + ')';
      x.fillRect(px, py, 1.6, 1.6);
    }
    x.globalCompositeOperation = 'source-over';
  }
  function bandTex(tr, W) {
    const key = tr + '|' + W;
    if (gfx.bands.has(key)) return gfx.bands.get(key);
    const t = GTR[tr];
    const c = document.createElement('canvas');
    c.width = Math.max(1, W - 20); c.height = 136;
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, 136);
    bg.addColorStop(0, Art.rgba(t.c, 0.17)); bg.addColorStop(0.5, Art.rgba(t.c, 0.055)); bg.addColorStop(1, Art.rgba(t.c, 0.015));
    x.fillStyle = bg;
    roundRect(x, 0.5, 0.5, c.width - 1, 135, 12); x.fill();
    x.strokeStyle = Art.rgba(t.c, 0.32); x.lineWidth = 1; x.stroke();
    x.fillStyle = Art.rgba('#ffffff', 0.08); x.fillRect(2, 1, c.width - 4, 1);
    if (gfx.bands.size > 12) gfx.bands.clear();
    gfx.bands.set(key, c);
    return c;
  }
  function openGraph() {
    $('graph-overlay').classList.remove('hidden');
    G.scale = 1; G.ox = 0; G.oy = 0;
    graphLoop();
  }
  function graphData() {
    const g = App.game;
    const nodes = new Map(); // key -> {t,s,es:[facts]}
    const addNode = (t, s) => {
      const k = t + ':' + s;
      if (!nodes.has(k)) nodes.set(k, { t, s, es: g.factsAt(t, s), goal: (App.def.goals || []).some(o => o.t === t && o.s === s) });
      return nodes.get(k);
    };
    const edges = [];
    g.activeEdges.forEach(e => { addNode(e.from.t, e.from.s); addNode(e.to.t, e.to.s); edges.push(e); });
    (App.def.goals || []).forEach(o => addNode(o.t, o.s));
    for (const f of g.facts.values()) addNode(f.t, f.s);
    return { nodes: [...nodes.values()], edges };
  }
  function graphLoop() {
    if ($('graph-overlay').classList.contains('hidden')) { App.graphAnim = 0; return; }
    const cv = $('graph-canvas');
    const dpr = root.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d');
    // 星图动画节流到 ~30fps（流动光点看不出差别，省一半光栅化开销）
    const nowMs = performance.now();
    if (nowMs - (App.graphLast || 0) < 32) { App.graphAnim = requestAnimationFrame(graphLoop); return; }
    App.graphLast = nowMs;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const d = graphData();
    const { nodes, edges } = d;
    const maxSlot = Math.max(1, ...nodes.map(n => n.s)) + 1;
    const pos = (n) => ({
      x: W / 2 + (n.s - (maxSlot - 1) / 2) * (150 * G.scale) + G.ox,
      y: GTR[n.t].y + G.oy,
    });
    // 纵向按轨道，横向按槽位
    const time = performance.now() / 1000;
    // 星云底 + 因果尘埃：屏幕空间固定 → 缓存成离屏图，每帧只做一次 blit（性能）
    if (!gfx.cache || gfx.W !== W || gfx.H !== H) buildGraphBg(W, H);
    x.drawImage(gfx.cache, 0, 0);
    // 槽位时间柱（竖向虚线）
    x.strokeStyle = 'rgba(255,255,255,.055)'; x.lineWidth = 1; x.setLineDash([3, 7]);
    for (let s = 0; s <= maxSlot; s++) {
      const px = W / 2 + (s - (maxSlot - 1) / 2) * (150 * G.scale) + G.ox;
      x.beginPath(); x.moveTo(px, 10); x.lineTo(px, H - 10); x.stroke();
    }
    x.setLineDash([]);
    // 轨道背景：缓存的玻璃条贴图 + 主题色标牌
    x.font = '12px sans-serif';
    Object.keys(GTR).forEach(tr => {
      const t = GTR[tr];
      const by = t.y - 40 + G.oy;
      x.drawImage(bandTex(tr, W), 10, by);
      x.fillStyle = Art.rgba(t.c, 0.9);
      roundRect(x, 16, by - 22, 74, 20, 10); x.fill();
      x.fillStyle = '#0b0f18'; x.font = 'bold 12px sans-serif';
      x.fillText(t.name, 28, by - 8);
      x.fillStyle = Art.rgba(t.lt, 0.75); x.font = '10px sans-serif';
      x.fillText(tr === 'past' ? '单向律起点' : tr === 'present' ? '涟漪抵达' : '尚未发生', 98, by - 8);
    });
    // 边：能量流（渐变描边 + 辉光 + 流动光点 + 强度标）
    edges.forEach((e, ei) => {
      const a = nodes.find(n => n.t === e.from.t && n.s === e.from.s);
      const b = nodes.find(n => n.t === e.to.t && n.s === e.to.s);
      if (!a || !b) return;
      const p1 = pos(a), p2 = pos(b);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 30;
      const str = Math.max(0.25, Math.min(1, e.strength / 100));
      const ca = GTR[e.from.t].c, cb = GTR[e.to.t].c;
      x.globalCompositeOperation = 'lighter';
      x.strokeStyle = Art.rgba(cb, 0.06 + 0.10 * str);
      x.lineWidth = 9 + 7 * str;
      x.beginPath(); x.moveTo(p1.x, p1.y); x.quadraticCurveTo(mx, my, p2.x, p2.y); x.stroke();
      const eg = x.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      eg.addColorStop(0, Art.rgba(ca, 0.35 + 0.5 * str));
      eg.addColorStop(0.5, Art.rgba('#ffffff', 0.35 + 0.4 * str));
      eg.addColorStop(1, Art.rgba(cb, 0.4 + 0.55 * str));
      x.strokeStyle = eg; x.lineWidth = 1.6 + 2 * str;
      x.beginPath(); x.moveTo(p1.x, p1.y); x.quadraticCurveTo(mx, my, p2.x, p2.y); x.stroke();
      for (let k = 0; k < 3; k++) {
        const u = (time * (0.26 + 0.05 * e.hop) + ei * 0.17 + k / 3) % 1;
        const m2 = 1 - u;
        const qx = m2 * m2 * p1.x + 2 * m2 * u * mx + u * u * p2.x;
        const qy = m2 * m2 * p1.y + 2 * m2 * u * my + u * u * p2.y;
        const fade = Math.sin(Math.PI * u);
        const rr = (2.2 + 2.6 * fade) * 3.2;
        const dg = x.createRadialGradient(qx, qy, 0, qx, qy, rr);
        dg.addColorStop(0, Art.rgba('#ffffff', 0.9 * fade));
        dg.addColorStop(0.3, Art.rgba(cb, 0.55 * fade));
        dg.addColorStop(1, Art.rgba(cb, 0));
        x.fillStyle = dg; x.beginPath(); x.arc(qx, qy, rr, 0, 6.2832); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      // 强度标（药丸底，保证可读）
      const label = e.strength + '%';
      x.font = '10px sans-serif';
      const lw = x.measureText(label).width + 12;
      x.fillStyle = 'rgba(6,10,18,.82)';
      roundRect(x, mx - lw / 2, my - 12, lw, 16, 8); x.fill();
      x.strokeStyle = Art.rgba(cb, 0.45); x.lineWidth = 1; x.stroke();
      x.fillStyle = Art.rgba(cb, 0.95); x.textAlign = 'center';
      x.fillText(label, mx, my);
      x.textAlign = 'left';
    });
    // 节点：玻璃卡片（渐变底 + 内高光 + 1px 亮边 + 柔和外阴影 + 主题色左条）
    nodes.forEach(n => {
      const p = pos(n);
      const w = Math.max(96, ...n.es.map(f => (App.game.entName(f.e).length * 13 + 56)));
      const h = 16 + Math.max(1, n.es.length) * 30;
      const t = GTR[n.t];
      const nx = p.x - w / 2, ny = p.y - 14;
      // 柔和外阴影：用两层便宜的深色圆角矩形模拟（避免 shadowBlur 的昂贵模糊）
      x.fillStyle = 'rgba(0,0,0,.30)';
      roundRect(x, nx - 3, ny + 3, w + 6, h + 6, 11); x.fill();
      x.fillStyle = 'rgba(0,0,0,.22)';
      roundRect(x, nx - 6, ny + 7, w + 12, h + 10, 13); x.fill();
      const ng = x.createLinearGradient(nx, ny, nx, ny + h);
      ng.addColorStop(0, Art.rgba(t.c, 0.30)); ng.addColorStop(0.45, 'rgba(15,20,32,.94)'); ng.addColorStop(1, 'rgba(8,11,19,.96)');
      x.fillStyle = ng;
      roundRect(x, nx, ny, w, h, 9); x.fill();
      x.strokeStyle = n.goal ? '#d6e34d' : Art.rgba(t.c, 0.6);
      x.lineWidth = n.goal ? 2 : 1.2;
      roundRect(x, nx, ny, w, h, 9); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(nx + 2, ny + 1, w - 4, 1);
      // 主题色左条
      x.fillStyle = t.c; roundRect(x, nx + 1, ny + 2, 3, h - 4, 2); x.fill();
      x.textAlign = 'center';
      n.es.forEach((f, i) => {
        const meta = App.def.entities.find(z => z.id === f.e) || { icon: '❔' };
        x.font = '13px sans-serif'; x.fillStyle = '#ece7dd';
        x.fillText(meta.icon + ' ' + App.game.entName(f.e) + '·' + App.game.label(f.e, f.st), p.x + 2, p.y + i * 30 + 8);
      });
      if (!n.es.length) { x.fillStyle = '#5b6474'; x.fillText('—', p.x, p.y + 6); }
      if (n.goal) {
        x.fillStyle = '#d6e34d'; x.font = '10px sans-serif';
        x.fillText('★ 关键节点', p.x, p.y - 20);
      }
      x.textAlign = 'left';
    });
    // 星图内暗角改由 CSS inset 阴影完成（零每帧开销）
    App.graphAnim = requestAnimationFrame(graphLoop);
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
  }

  /* ================= 阅读器 ================= */
  let readerList = [], readerIdx = 0;
  function openReader(id) {
    readerList = App.save.shards.filter(sid => ST.get(sid));
    readerIdx = Math.max(0, readerList.indexOf(id));
    renderReader();
    $('reader-overlay').classList.remove('hidden');
  }
  function renderReader() {
    const id = readerList[readerIdx];
    const sh = ST.get(id);
    if (!sh) return;
    $('reader-kind').textContent = (sh.hidden ? '◈ 里层真相 · ' : '') + sh.kind;
    $('reader-kind').className = 'reader-kind' + (sh.hidden ? ' k-hidden' : '');
    $('reader-title').textContent = sh.title;
    $('reader-text').textContent = sh.text;
    $('reader-index').textContent = (readerIdx + 1) + ' / ' + readerList.length;
  }

  /* ================= 列表页 ================= */
  function renderList(title, extraHTML, build) {
    $('list-title').textContent = title;
    $('list-extra').innerHTML = extraHTML || '';
    const body = $('list-body'); body.innerHTML = '';
    build(body);
    showScreen('list');
    currentList = title;
  }
  let currentList = '';

  function navAchievements() {
    const all = root.TSMain.allAchievements();
    const done = all.filter(a => a.done).length;
    renderList('成就 · ' + done + '/' + all.length, '✦ ' + App.save.stardust, (body) => {
      const grid = el('div', 'list-grid');
      all.forEach(a => {
        const d = el('div', 'list-item' + (a.done ? ' done' : ' locked'));
        d.innerHTML = `<div class="li-ico">${a.done ? a.icon : '🔒'}</div>
          <div class="li-main"><h4>${a.name}</h4><p>${a.desc}</p></div>`;
        grid.appendChild(d);
      });
      body.appendChild(grid);
    });
  }

  function navArchive() {
    const total = ST.shardCount();
    renderList('记忆档案馆 · ' + App.save.shards.length + '/' + total, '里层 ◈ ' + App.save.shards.filter(id => ST.get(id) && ST.get(id).hidden).length, (body) => {
      for (let ch = 1; ch <= 8; ch++) {
        const meta = LV.CHAPTERS[ch - 1];
        body.appendChild(el('h3', '', `第 ${ch} 章 · ${meta.name}`));
        const ids = ST.byChapter(ch);
        const wrap = el('div', 'list-grid');
        ids.forEach(id => {
          const sh = ST.SHARDS[id];
          const owned = App.save.shards.includes(id);
          const d = el('div', 'list-item' + (owned ? (sh.hidden ? ' done' : '') : ' locked'));
          d.innerHTML = `<div class="li-ico">${owned ? (sh.hidden ? '◈' : '🧩') : '🔒'}</div>
            <div class="li-main"><h4>${owned ? sh.title : '未发现的碎片'}</h4><p>${owned ? sh.kind + (sh.hidden ? ' · 里层真相' : '') : '继续调查以收集'}</p></div>`;
          if (owned) d.onclick = () => openReader(id);
          wrap.appendChild(d);
        });
        body.appendChild(wrap);
      }
    });
  }

  function navShop() {
    renderList('时之铺', '✦ ' + App.save.stardust, (body) => {
      body.appendChild(el('h3', '', '道具（所有道具均可游玩获得，付费不卖数值）'));
      const items = el('div');
      Object.entries(ITEM_META).forEach(([k, m]) => {
        const price = { watch: 20, glue: 30, mirror: 25, hourglass: 25, charm: 40 }[k];
        const d = el('div', 'list-item');
        d.innerHTML = `<div class="li-ico">${m.icon}</div><div class="li-main"><h4>${m.name} <small style="color:var(--ink-dim)">拥有 ×${App.save.items[k] || 0}</small></h4><p>${m.desc}</p></div>
          <div class="li-right"><button class="btn btn-sm">✦ ${price}</button></div>`;
        d.querySelector('button').onclick = () => {
          if (App.save.stardust < price) { toast('星尘不足'); AU.wrong(); return; }
          App.save.stardust -= price; App.save.items[k] = (App.save.items[k] || 0) + 1;
          root.TSMain.persist(); AU.star(0); toast('已兑换 ' + m.name); navShop();
        };
        items.appendChild(d);
      });
      body.appendChild(items);
      body.appendChild(el('h3', '', '氛围碎片 · 《环线广播合集》'));
      const bc = el('div');
      for (let i = 1; i <= 12; i++) {
        const id = 'b_' + String(i).padStart(2, '0');
        const sh = ST.get(id);
        const owned = App.save.shards.includes(id);
        const d = el('div', 'list-item' + (owned ? ' done' : ''));
        d.innerHTML = `<div class="li-ico">${owned ? '📻' : '🔒'}</div><div class="li-main"><h4>${owned ? sh.title : '广播 · ???'}</h4><p>${owned ? '已收录' : '收录这条广播'}</p></div>
          <div class="li-right">${owned ? '' : `<button class="btn btn-sm">✦ 10</button>`}</div>`;
        const btn = d.querySelector('button');
        if (btn) btn.onclick = () => {
          if (App.save.stardust < 10) { toast('星尘不足'); AU.wrong(); return; }
          App.save.stardust -= 10; App.save.shards.push(id);
          root.TSMain.persist(); AU.star(1); toast('收录《' + sh.title + '》'); navShop();
        };
        bc.appendChild(d);
      }
      body.appendChild(bc);
    });
  }

  function navSettings() {
    const s = App.save.settings;
    renderList('设置', '', (body) => {
      const grp = el('div', 'set-group');
      const row = (label, key, hint) => {
        const r = el('div', 'set-row', `<span>${label}<br><small style="color:var(--ink-dim)">${hint || ''}</small></span>`);
        const t = el('button', 'toggle' + (s[key] ? ' on' : ''));
        t.onclick = () => { s[key] = !s[key]; t.classList.toggle('on', s[key]); root.TSMain.settingsApply(); root.TSMain.persist(); };
        r.appendChild(t); grp.appendChild(r);
      };
      row('音效与氛围', 'sound', '关闭后将静音（默认开启）');
      row('色弱友好模式', 'cb', '三线增加形状铭牌（⧗⚙✦）与虚线边框');
      row('大字体', 'bigfont', '');
      row('高对比', 'hicon', '');
      row('极简模式', 'minimal', '隐藏部分装饰性 UI');
      body.appendChild(grp);
      const vol = el('div', 'set-group');
      const vr = el('div', 'set-row', `<span>音量</span>`);
      const sl = el('input'); sl.type = 'range'; sl.min = 0; sl.max = 100; sl.value = Math.round(s.vol * 100);
      sl.oninput = () => { s.vol = sl.value / 100; root.TSMain.settingsApply(); };
      vr.appendChild(sl); vol.appendChild(vr);
      body.appendChild(vol);
      const mg = el('div', 'set-group');
      const mk = (label, fn, cls) => {
        const r = el('div', 'set-row', `<span>${label}</span>`);
        const b = el('button', 'btn btn-sm ' + (cls || ''), '执行');
        b.onclick = fn; r.appendChild(b); mg.appendChild(r);
      };
      mk('导出存档', () => {
        const code = root.TSMain.exportSave();
        showModal('导出存档', '<textarea style="width:100%;height:140px;background:#10141d;color:#cfd4de;border:1px solid #333;border-radius:8px;padding:8px">' + code + '</textarea><br><small>复制以上代码，可在其他设备导入。</small>', [{ text: '好的', primary: true }]);
      });
      mk('导入存档', () => {
        showModal('导入存档', '<textarea id="imp-save" style="width:100%;height:140px;background:#10141d;color:#cfd4de;border:1px solid #333;border-radius:8px;padding:8px"></textarea>', [
          { text: '导入', primary: true, fn: () => { const ok = root.TSMain.importSave($('imp-save').value); toast(ok ? '导入成功' : '存档代码无效'); if (ok) renderMenuStatus(); } },
          { text: '取消' }]);
      });
      mk('清除存档', () => {
        showModal('清除存档', '确定清除全部进度？此操作不可撤销。', [
          { text: '确认清除', danger: true, fn: () => { root.TSMain.wipe(); location.reload(); } },
          { text: '取消' }]);
      }, 'btn-danger');
      body.appendChild(mg);
    });
  }

  /* ================= 模式：悖论实验室 ================= */
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function navLab() {
    const date = todayStr();
    const puzzles = LV.labDaily(date);
    renderList('悖论实验室 · ' + date, '每日 3 题 · 每题 ✦15', (body) => {
      const doneSet = Array.isArray(App.save.labDoneSet) && App.save.labDate === date ? App.save.labDoneSet : [];
      puzzles.forEach((p, i) => {
        const done = doneSet.includes(i);
        const d = el('div', 'list-item' + (done ? ' done' : ''));
        d.innerHTML = `<div class="li-ico">${done ? '✅' : '🧪'}</div>
          <div class="li-main"><h4>${p.title}</h4>
          <p>章内机制回响 · 标准解 ${p.par} 步 · ${done ? '今日已完成' : '挑战（保证可解）'}</p></div>
          <div class="li-right">${done ? '✦15 已领' : '挑战 ›'}</div>`;
        d.onclick = () => { const def = { ...p }; def.id = 'lab_' + date + '_' + i; startLevel(def, { mode: 'lab', labIndex: i }); };
        body.appendChild(d);
      });
      body.appendChild(el('p', 'chapter-intro', '实验室谜题由算法构造：先构造解，再反推初始状态——保证有解。每日 0 点刷新。'));
    });
  }

  /* ================= 模式：无限回环 ================= */
  function startEndless() {
    const def = {
      id: 'endless', chapter: 0, index: 0, title: '无限回环', par: 999,
      slots: { past: 3, present: 3, future: 3 },
      interactive: ['past', 'present', 'future'],
      intro: '', tips: '时间错乱会不断出现。稳定它们，活得更久。',
      entities: [
        { id: 'e1', name: '时序锚', icon: '⏱️' }, { id: 'e2', name: '因果链', icon: '🧿' },
        { id: 'e3', name: '涟漪源', icon: '🔮' }, { id: 'e4', name: '回声体', icon: '📶' },
        { id: 'e5', name: '守恒钟', icon: '🕰️' }, { id: 'e6', name: '裂隙', icon: '🌌' },
      ],
      dict: { 'e1.good': '稳定', 'e1.bad': '错乱', 'e2.good': '完整', 'e2.bad': '断裂', 'e3.good': '平静', 'e3.bad': '振荡', 'e4.good': '清朗', 'e4.bad': '啸叫', 'e5.good': '准点', 'e5.bad': '漂移', 'e6.good': '闭合', 'e6.bad': '撕开' },
      initial: [], goals: [], hidden: [], rules: [], shards: [], story: [],
    };
    for (let i = 1; i <= 6; i++) {
      def.shards.push({ kind: 'trigger', id: 'fix' + i, name: '稳定 ' + def.entities[i - 1].name, icon: def.entities[i - 1].icon, entity: 'e' + i, setState: 'good' });
    }
    App.def = def; App.mode = 'endless'; App.ctx = { mode: 'endless' };
    App.game = new E.Game(def);
    App.sel = null; App.moveSrc = null; App.track = 'past';
    // 每局复位（与 startLevel 一致，避免道具/提示/计数跨局残留）
    App.activeItems = new Set();
    App.usedShardIds = new Set(); App.usedStack = [];
    App.hintStep = 0; App.invalidCount = 0;
    App.endless = { t0: performance.now(), fixes: 0, glitches: new Set(), frozenUntil: 0, nextGlitch: performance.now() + 2500 };
    showScreen('game');
    renderAll();
    AU.switchTo('present');
    toast('◈ 无限回环开始：错乱会不断出现，稳定它们！', 3200);
    endlessTick();
  }
  let endlessTimer = 0;
  function endlessTick() {
    if (App.mode !== 'endless' || !$('screen-game') || $('screen-game').classList.contains('hidden')) return;
    const g = App.game, en = App.endless;
    const now = performance.now();
    if (now >= en.nextGlitch && en.glitches.size < 4 && now > en.frozenUntil) {
      // 注入一处错乱（越靠近未来越危险）
      const eN = 1 + Math.floor(Math.random() * 6);
      const tr = Math.random() < 0.5 ? 'future' : (Math.random() < 0.6 ? 'present' : 'past');
      const s = Math.floor(Math.random() * 3);
      const k = E.kOf(tr, s, 'e' + eN);
      const f = g.facts.get(k);
      if (!f || f.st === 'good') {
        g.facts.set(k, { t: tr, s, e: 'e' + eN, st: 'bad' });
        en.glitches.add(k);
        AU.wrong();
        toast('⚠ 时间错乱出现：' + g.entName('e' + eN) + '（' + TRACK_CN[tr] + '·' + (s + 1) + '号位）');
      }
      en.nextGlitch = now + 7000 + Math.random() * 4000;
    }
    // 每处错乱持续掉完整度
    let drain = 0;
    en.glitches.forEach(k => { if (g.facts.get(k) && g.facts.get(k).st === 'bad') drain += 0.5; else en.glitches.delete(k); });
    if (now < en.frozenUntil) drain = 0;
    if (drain > 0) {
      g.integrity = Math.max(0, Math.round((g.integrity - drain * 0.12) * 10) / 10);
      if (g.integrity <= 0) {
        const secs = Math.round((now - en.t0) / 1000);
        const dust = Math.min(30, 5 + Math.floor(secs / 6) + en.fixes * 2);
        App.save.stardust += dust;
        if (secs > (App.save.endlessBest || 0)) App.save.endlessBest = secs;
        root.TSMain.persist(); root.TSMain.evaluateAchievements();
        renderAll();
        AU.collapse();
        showModal('⏳ 回环崩解', `存活 <b>${secs}</b> 秒 · 稳定 <b>${en.fixes}</b> 处<br>历史最佳：${App.save.endlessBest} 秒<br><br>星尘 +${dust}`,
          [{ text: '再来一次', primary: true, fn: startEndless }, { text: '返回', fn: () => showScreen('menu') }]);
        App.mode = 'endless-over';
        return;
      }
    }
    // HUD
    $('hud-goal').innerHTML = `存活 <b style="color:var(--gold)">${Math.round((now - en.t0) / 1000)}</b>s · 待稳定 <b style="color:${en.glitches.size ? 'var(--para)' : 'var(--good)'}">${en.glitches.size}</b> · 已稳定 ${en.fixes}` +
      (now < en.frozenUntil ? ` · ⏱️ 怀表冻结中` : '');
    $('meter-integrity').style.width = g.integrity + '%';
    $('meter-integrity-num').textContent = Math.round(g.integrity);
    $('meter-steps-num').textContent = en.fixes + ' 次';
    $('btn-undo').disabled = true; $('btn-redo').disabled = true;
    renderBoard();
    endlessTimer = setTimeout(endlessTick, 500);
  }
  function stopEndless() {
    if (endlessTimer) { clearTimeout(endlessTimer); endlessTimer = 0; }
  }

  /* ================= 模式：时间裂隙 ================= */
  function weekKey() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }
  function navRift() {
    const wk = weekKey();
    const def = LV.riftWeekly(wk);
    const done = App.save.riftWeek === wk && App.save.riftDone;
    renderList('时间裂隙 · ' + wk, done ? '本周已完成' : '本周奖励 ✦40 + 限定外观', (body) => {
      const d = el('div', 'list-item' + (done ? ' done' : ''));
      d.innerHTML = `<div class="li-ico">${done ? '🌀' : '🌀'}</div>
        <div class="li-main"><h4>${def.title}</h4><p>${def.intro || '本周的限时裂隙。'} 标准解 ${def.par} 步。</p></div>
        <div class="li-right">${done ? '已通关' : '进入 ›'}</div>`;
      d.onclick = () => startLevel(def, { mode: 'rift' });
      body.appendChild(d);
      body.appendChild(el('p', 'chapter-intro', '时间裂隙每周一刷新。首次通关可获得星尘与限定外观「裂隙观测者」。'));
    });
  }

  /* ================= 结局画廊 ================= */
  function navEndings() {
    renderList('结局画廊', '', (body) => {
      body.appendChild(el('h3', '', '章节记忆'));
      for (let ch = 1; ch <= 8; ch++) {
        const seen = (App.save.chapterEndingsSeen[ch] || []).includes('surface');
        const deeper = (App.save.chapterEndingsSeen[ch] || []).includes('deeper');
        const d = el('div', 'list-item' + (seen ? ' done' : ' locked'));
        d.innerHTML = `<div class="li-ico">${seen ? '📖' : '🔒'}</div><div class="li-main"><h4>第 ${ch} 章 · ${LV.CHAPTERS[ch - 1].name}</h4>
          <p>${seen ? ST.CHAPTER_ENDINGS[ch].surface : '通关本章后解锁'}${deeper ? '<br><b style="color:var(--para)">◈ 里层：</b>' + ST.CHAPTER_ENDINGS[ch].deeper : ''}</p></div>`;
        body.appendChild(d);
      }
      body.appendChild(el('h3', '', '终局'));
      Object.entries(ST.FINAL_ENDINGS).forEach(([k, f]) => {
        const seen = App.save.finalsSeen.includes(k);
        const d = el('div', 'list-item' + (seen ? ' done' : ' locked'));
        d.innerHTML = `<div class="li-ico">${seen ? '🕰️' : '🔒'}</div><div class="li-main"><h4>${f.title}</h4><p>${seen ? f.text : '解锁条件：' + f.cond}</p></div>`;
        body.appendChild(d);
      });
    });
  }

  /* ================= 路由 / 事件绑定 ================= */
  function bindGlobal() {
    document.body.addEventListener('click', (ev) => {
      const nav = ev.target.closest && ev.target.closest('[data-nav]');
      if (nav) {
        const to = nav.dataset.nav;
        AU.init(); AU.resume(); AU.tick();
        if (to === 'menu') showScreen('menu');
        else if (to === 'continue') continueInvestigation();
        else if (to === 'chapterselect') { renderChapters(); showScreen('chapterselect'); }
        else if (to === 'lab') navLab();
        else if (to === 'endless') startEndless();
        else if (to === 'rift') navRift();
        else if (to === 'archive') navArchive();
        else if (to === 'achievements') navAchievements();
        else if (to === 'shop') navShop();
        else if (to === 'settings') navSettings();
        else if (to === 'help') showHelp();
        return;
      }
      const close = ev.target.closest && ev.target.closest('[data-close]');
      if (close) { closeOverlay(close.dataset.close); if (close.dataset.close === 'graph-overlay') cancelAnimationFrame(App.graphAnim); }
    });
    $('btn-boot-start').onclick = () => {
      AU.init(); AU.resume(); AU.gear(); showScreen('menu');
      if (!App.save.helpSeen) setTimeout(showHelp, 350); // 首次进入主菜单：自动弹出游戏说明
    };
    $('btn-pause').onclick = pauseMenu;
    $('btn-undo').onclick = () => { if (App.game.undo()) { if (!(App.save.settings && false) && App.activeItems && App.activeItems.has('hourglass')) { /* 沙漏：不算撤销 */ App.game.undoCount--; } onUndone(); AU.tick(); renderAll(); } };
    $('btn-redo').onclick = () => { if (App.game.redo()) { AU.tick(); renderAll(); } };
    $('btn-graph').onclick = openGraph;
    $('graph-zoom-in').onclick = () => { G.scale = Math.min(1.8, G.scale * 1.2); };
    $('graph-zoom-out').onclick = () => { G.scale = Math.max(0.5, G.scale / 1.2); };
    $('graph-fit').onclick = () => { G.scale = 1; G.ox = 0; G.oy = 0; };
    // 星图画布拖拽平移
    const cv = $('graph-canvas');
    let pan = null;
    cv.addEventListener('pointerdown', (e) => { pan = { x: e.clientX, y: e.clientY, ox: G.ox, oy: G.oy }; });
    root.addEventListener('pointermove', (e) => { if (pan) { G.ox = pan.ox + (e.clientX - pan.x); G.oy = pan.oy + (e.clientY - pan.y); } });
    root.addEventListener('pointerup', () => { pan = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); G.scale = Math.max(0.5, Math.min(1.8, G.scale * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
    // 阅读器
    $('reader-prev').onclick = () => { readerIdx = (readerIdx - 1 + readerList.length) % readerList.length; renderReader(); };
    $('reader-next').onclick = () => { readerIdx = (readerIdx + 1) % readerList.length; renderReader(); };
    // 键盘
    root.addEventListener('keydown', (e) => {
      const inGame = !$('screen-game').classList.contains('hidden');
      if (e.key === 'Escape') {
        if (!$('modal-overlay').classList.contains('hidden')) return;
        if (inGame) pauseMenu();
        return;
      }
      if (!inGame || !App.game || App.mode === 'endless' || App.mode === 'endless-over') return;
      const k = e.key.toLowerCase();
      if (k === 'q') { if (App.game.undo()) { if (App.activeItems && App.activeItems.has('hourglass')) App.game.undoCount--; onUndone(); AU.tick(); renderAll(); } }
      else if (k === 'e') { if (App.game.redo()) { AU.tick(); renderAll(); } }
      else if (k === 'r') restartLevel();
      else if (k === 'g') openGraph();
      else if (k === ' ') {
        e.preventDefault();
        const order = (App.def.interactive || TRACKS);
        const i = order.indexOf(App.track);
        setTrack(order[(i + 1) % order.length]);
      }
    });
    bindSettleButtons();
    // hash 路由：浏览器前进/后退可往返章节页与关卡（程序内改 hash 已用 hashSilent 屏蔽）
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('hashchange', () => {
        if (hashSilent) { hashSilent = false; return; }
        routeFromHash();
      });
    }
    // 背景齿轮
    const bg = $('bg-gears');
    [[6, '6%', '8%', 220], [4, '78%', '60%', 320], [3, '40%', '75%', 180]].forEach(([sz, l, t, d], i) => {
      const gear = el('div', 'gear-bg' + (i === 1 ? ' g2' : i === 2 ? ' g3' : ''));
      gear.style.width = gear.style.height = sz + 'em';
      gear.style.left = l; gear.style.top = t;
      gear.style.animationDuration = d + 's';
      bg.appendChild(gear);
    });
  }

  /* ================= 游戏说明 ================= */
  function showHelp() {
    const html = `
      <b style="color:var(--gold)">◈ 核心玩法</b><br>
      你同时操控<b style="color:var(--past)">过去</b>、<b style="color:var(--now)">现在</b>、<b style="color:var(--fut)">未来</b>三条时间线：
      从底部「碎片背包」点选一个碎片，再点击目标时间线上的节点完成改写。
      改动会沿因果链自动传导——过去影响现在，现在影响未来，把所有
      <span style="color:var(--accent)">◇ 关键节点</span>修到目标状态即通关。<br><br>
      <b style="color:var(--gold)">◈ 因果三定律</b><br>
      <b style="color:var(--past)">⧗ 单向律</b>：因果只向前流（过去→现在→未来），未来不能直接改写过去。<br>
      <b style="color:var(--now)">⚙ 涟漪衰减律</b>：每传导一步，因果强度衰减 30%；太远的涟漪会消散——离问题近的那条线也要动手。<br>
      <b style="color:var(--para)">✦ 悖论惩罚律</b>：让同一件事同时出现两个矛盾结果，会引发「时间风暴」：完整度 −15、回退最近 3 步；满 3 次时间崩塌。<br><br>
      <b style="color:var(--gold)">◈ 操作方式</b><br>
      • 点选碎片 → 点击节点使用；<b>移动类</b>碎片先点来源格、再点目标格<br>
      • <b>长按</b>任意节点：预览这次改写的涟漪会传到哪里（红色=消散）<br>
      • 快捷键：<b>Q</b> 撤销 / <b>E</b> 重做 / <b>R</b> 重开 / <b>G</b> 因果星图 / <b>空格</b> 切换时间线 / <b>Esc</b> 菜单与提示<br><br>
      <b style="color:var(--gold)">◈ 目标与星级</b><br>
      步数 ≤ 标准解得 3★（≤1.5 倍 2★）；因果完好度、步数、隐藏碎片共同决定得分与星尘。星尘可在「时之铺」兑换道具。<br><br>
      <b style="color:var(--gold)">◈ 小技巧</b><br>
      • 有些碎片是<b style="color:var(--para)">陷阱</b>（比如"强行掰闸"），用了就会看到风暴——<b>撤销是你的朋友</b><br>
      • 每关常有第二种解法，藏着<b style="color:var(--past)">里层真相</b>碎片；集齐可解锁隐藏结局<br>
      • 三线配色固定：琥珀=过去、蓝灰=现在、青紫=未来；色弱可在设置中开启形状铭牌`;
    showModal('📖 游戏说明', html, [{ text: '开始重构时间', primary: true }]);
    if (!App.save.helpSeen) {
      App.save.helpSeen = true;
      root.TSMain.persist();
    }
  }

  function pauseMenu() {
    const def = App.def;
    const body = `目标 ${def ? def.goals.length : 0} 个 · 已用步数 ${App.game ? App.game.steps : 0}<br>
      <small style="color:var(--ink-dim)">快捷键：Q 撤销 / E 重做 / R 重开 / G 星图 / 空格切线 · 长按节点可预览涟漪</small>`;
    showModal('⏸ ' + (def ? def.title : '暂停'), body,
      [
        { text: '看提示', fn: showHintStep },
        { text: '重新开始', fn: () => restartLevel() },
        { text: '因果星图', fn: openGraph },
        { text: '离开关卡', primary: true, fn: () => exitLevel() },
      ]);
  }
  function showHintStep() {
    const def = App.def;
    if (!def.hint || !def.hint.length) { toast('这一关没有更多提示了'); return; }
    App.hintStep = App.hintStep || 0;
    showHint('提示：' + def.hint[Math.min(App.hintStep, def.hint.length - 1)], 8000);
    App.hintStep++;
  }

  /* ============================================================
   * 美术模块 Art / 特效模块 FX（纯表现层）
   *  - 噪点：预生成离屏 canvas + createPattern（并导出 dataURL 给 CSS 用）
   *  - 背景：程序化时间天幕（渐变 + 时间带 + 山脊 + 城市剪影 + 钟塔 + 雾 + 尘埃 + 颗粒 + 暗角）
   *  - 轨道：过去/现在/未来三套材质贴图（缓存复用，仅在尺寸变化时重绘）
   *  - 因果：能量流连线（渐变描边 + 辉光 + 流动光点）
   *  - 时间同步：重影残像 + 粒子重组
   *  只读取用于绘制的状态，不写任何玩法/数值/存档数据。
   * ============================================================ */
  const Art = (function () {
    const dpr = () => Math.min(2, root.devicePixelRatio || 1);
    let noiseTex = null, noiseSoft = null, cssDone = false;
    const texCache = new Map();
    const THEME = {
      past: { a: '#e0a35c', b: '#7a4a22', c: '#f7dcae' },
      present: { a: '#93b4d0', b: '#3d5468', c: '#dcecf8' },
      future: { a: '#7ef0e2', b: '#a98cff', c: '#d9fff8' },
    };
    const THEME_OF = (tr) => THEME[tr] || THEME.present;

    /* ---------- 小工具 ---------- */
    function rgba(hex, a) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(s => s + s).join('') : h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

    /* ---------- ① 预生成噪点纹理（只算一次） ---------- */
    function makeNoise(n, amp) {
      const c = document.createElement('canvas'); c.width = c.height = n;
      const x = c.getContext('2d');
      const img = x.createImageData(n, n), d = img.data;
      const r = rng(20240607);
      for (let i = 0; i < d.length; i += 4) {
        const g = (r() * 255) | 0;
        d[i] = g; d[i + 1] = g; d[i + 2] = g; d[i + 3] = (r() * amp) | 0;
      }
      x.putImageData(img, 0, 0);
      return c;
    }
    function initNoise() {
      if (noiseTex) return;
      noiseTex = makeNoise(256, 92);   // 画布纹理用（靠 globalAlpha + overlay 混合控制强度）
      noiseSoft = makeNoise(128, 52);  // CSS 颗粒用（PNG 自带低 alpha）
      if (!cssDone) {
        cssDone = true;
        try { document.documentElement.style.setProperty('--noise', 'url(' + noiseSoft.toDataURL('image/png') + ')'); } catch (e) { void e; }
      }
    }
    function pat(ctx) { return ctx.createPattern(noiseTex, 'repeat'); }

    /* ---------- ② 静态背景缓存（尺寸变化时才重算） ---------- */
    function drawRidge(x, w, h, base, amp, color) {
      const ph = [rng(9021)(), rng(3311)(), rng(7717)()];
      x.beginPath(); x.moveTo(0, h);
      for (let px = 0; px <= w; px += 8) {
        const t = px / w;
        const y = base + Math.sin(t * 9.42 + ph[0] * 6.28) * amp * 0.5
          + Math.sin(t * 26.4 + ph[1] * 6.28) * amp * 0.26
          + Math.sin(t * 57.2 + ph[2] * 6.28) * amp * 0.12;
        x.lineTo(px, y);
      }
      x.lineTo(w, h); x.closePath();
      x.fillStyle = color; x.fill();
    }
    function drawCity(x, w, h, base, alpha, color, seedN, scale) {
      const r = rng(1337 + seedN * 31);
      let px = -24;
      while (px < w + 24) {
        const bw = 26 + r() * 76;
        const bh = (22 + r() * 130) * scale;
        x.globalAlpha = alpha * 0.95;
        x.fillStyle = color;
        x.fillRect(px, base - bh, bw, h - base + bh + 4);
        if (r() < 0.45) {
          x.beginPath(); x.moveTo(px, base - bh);
          x.lineTo(px + bw / 2, base - bh - (10 + r() * 26) * scale);
          x.lineTo(px + bw, base - bh); x.closePath(); x.fill();
        }
        // 零星窗光：让远景不是"纯色块"
        const wins = 1 + ((r() * 5) | 0);
        for (let i = 0; i < wins; i++) {
          const wx = px + 4 + r() * Math.max(4, bw - 12);
          const wy = base - bh + 6 + r() * Math.max(4, bh - 18);
          x.globalAlpha = alpha * (0.25 + r() * 0.6);
          x.fillStyle = r() < 0.5 ? 'rgba(255,214,140,.9)' : 'rgba(150,230,255,.8)';
          x.fillRect(wx, wy, 2.4, 3.4);
        }
        px += bw + 4 + r() * 13;
      }
      x.globalAlpha = 1;
    }
    function drawTower(x, w, h) {
      const tw = 76, tx = w * 0.5 - tw / 2, base = h * 0.93, th = Math.min(h * 0.44, 330);
      x.fillStyle = 'rgba(6,10,18,.97)';
      x.fillRect(tx, base - th, tw, th + h - base + 6);
      x.beginPath(); x.moveTo(tx - 7, base - th);
      x.lineTo(tx + tw / 2, base - th - 48); x.lineTo(tx + tw + 7, base - th); x.closePath(); x.fill();
      const cxp = tx + tw / 2, cyp = base - th + 42;
      const g = x.createRadialGradient(cxp, cyp, 2, cxp, cyp, 70);
      g.addColorStop(0, 'rgba(255,226,168,.9)'); g.addColorStop(0.28, 'rgba(224,163,92,.34)');
      g.addColorStop(1, 'rgba(224,163,92,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cxp, cyp, 70, 0, 6.2832); x.fill();
      x.strokeStyle = 'rgba(247,220,174,.7)'; x.lineWidth = 1.4;
      x.beginPath(); x.arc(cxp, cyp, 15, 0, 6.2832); x.stroke();
      x.beginPath(); x.moveTo(cxp, cyp); x.lineTo(cxp + 9, cyp - 7); x.stroke();
      x.beginPath(); x.moveTo(cxp, cyp); x.lineTo(cxp - 3, cyp - 12); x.stroke();
    }
    function genStatic(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      const x = c.getContext('2d');
      // 天幕：5 段渐变（天顶 → 地平线 → 地面辉光）
      const sky = x.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#05070f'); sky.addColorStop(0.30, '#0a1020');
      sky.addColorStop(0.56, '#0e1a2a'); sky.addColorStop(0.76, '#152232');
      sky.addColorStop(0.90, '#1d2028'); sky.addColorStop(1, '#241a12');
      x.fillStyle = sky; x.fillRect(0, 0, w, h);
      // 两团时间辉光（过去暖 / 未来冷）
      let g = x.createRadialGradient(w * 0.22, h * 1.0, 0, w * 0.22, h * 1.0, w * 0.72);
      g.addColorStop(0, 'rgba(224,163,92,.30)'); g.addColorStop(1, 'rgba(224,163,92,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      g = x.createRadialGradient(w * 0.84, h * 0.04, 0, w * 0.84, h * 0.04, w * 0.68);
      g.addColorStop(0, 'rgba(126,240,226,.20)'); g.addColorStop(1, 'rgba(126,240,226,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      // 远景山脊（大气透视：越远越淡越冷）
      drawRidge(x, w, h, h * 0.60, h * 0.15, 'rgba(28,50,76,.55)');
      drawRidge(x, w, h, h * 0.68, h * 0.10, 'rgba(18,34,54,.7)');
      // 远层 / 近层城市剪影 + 钟塔
      drawCity(x, w, h, h * 0.80, 0.5, 'rgba(16,26,42,.9)', 21, 0.5);
      drawCity(x, w, h, h * 0.93, 1, 'rgba(7,11,20,.97)', 17, 1);
      drawTower(x, w, h);
      // 地平线雾带
      const fog = x.createLinearGradient(0, h * 0.70, 0, h * 0.96);
      fog.addColorStop(0, 'rgba(140,180,220,0)'); fog.addColorStop(0.55, 'rgba(150,190,230,.10)');
      fog.addColorStop(1, 'rgba(24,30,42,0)');
      x.fillStyle = fog; x.fillRect(0, h * 0.68, w, h * 0.32);
      // 色彩分级（一次性烘焙进静态层）：冷顶 / 暖底的色调映射，让画面像"一个场景"
      x.globalCompositeOperation = 'soft-light';
      const grade = x.createLinearGradient(0, 0, 0, h);
      grade.addColorStop(0, 'rgba(96,170,255,.55)'); grade.addColorStop(0.5, 'rgba(120,120,150,.28)');
      grade.addColorStop(1, 'rgba(255,176,96,.5)');
      x.fillStyle = grade; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      // 颗粒
      x.globalAlpha = 0.28; x.globalCompositeOperation = 'overlay';
      x.fillStyle = x.createPattern(noiseTex, 'repeat'); x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      // 暗角
      const vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.20, w / 2, h / 2, Math.max(w, h) * 0.74);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.74)');
      x.fillStyle = vg; x.fillRect(0, 0, w, h);
      return c;
    }

    /* ---------- ③ 背景循环（节流 30fps：缓慢漂移不需要 60fps） ---------- */
    const bg = { cv: null, x: null, fx: null, fxx: null, cache: null, scale: 0.42, w: 0, h: 0, last: 0, prev: 0, raf: 0, mood: 0.6, moodTarget: 1 };
    const dyn = { stars: [], dust: [] };
    const MOODS = { boot: 1.15, menu: 1.0, chapterselect: 0.95, levelselect: 0.92, game: 0.58, list: 0.88, graph: 0.8 };
    function setMood(name) {
      bg.moodTarget = MOODS[name] != null ? MOODS[name] : 1;
      if (bg.cv && !bg.raf) bg.raf = requestAnimationFrame(frame);
    }
    function schedule() { if (!bg.raf) bg.raf = requestAnimationFrame(frame); }
    function frame(now) {
      bg.raf = 0;
      const cv = bg.cv;
      if (!cv || !bg.cache) return;
      if (document.hidden) { schedule(); return; }
      // 24fps 节流：背景是缓慢漂移的柔光，肉眼无需 60fps（性能优先）
      if (now - bg.last < 41) { schedule(); return; }
      const fx = bg.fx, x = bg.fxx;
      if (!fx || !x) { schedule(); return; }
      if (fx.clientWidth === 0) { schedule(); return; }   // 极简模式等隐藏状态：不做无谓光栅化
      const dt = Math.min(0.12, (now - (bg.prev || now - 41)) / 1000);
      bg.prev = now; bg.last = now;
      // 有全屏覆盖层时暂停背景动画：既省电，也让覆盖层的 backdrop-blur 结果可被合成器缓存
      if (bg.overlayOpen === undefined || now - bg.ovCheck > 200) {
        bg.ovCheck = now;
        bg.overlayOpen = !!document.querySelector('.overlay:not(.hidden)');
      }
      if (bg.overlayOpen) { schedule(); return; }
      const w = bg.w, h = bg.h, t = now / 1000;
      const sc = bg.scale, lw = fx.width, lh = fx.height;
      bg.mood += (bg.moodTarget - bg.mood) * 0.05;
      // 只在低分辨率层上作画（光栅化面积约为全屏的 1/6）
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, lw, lh);
      x.globalCompositeOperation = 'lighter';
      // 三条时间带缓慢漂移（过去暖 / 现在冷 / 未来青紫）
      const bands = [
        { c: THEME.past.a, y: h * 0.28, amp: 24, sp: 0.13, al: 0.085 },
        { c: THEME.present.a, y: h * 0.50, amp: 30, sp: 0.09, al: 0.062 },
        { c: THEME.future.a, y: h * 0.72, amp: 28, sp: 0.17, al: 0.078 },
      ];
      bands.forEach((b, i) => {
        const y = (b.y + Math.sin(t * b.sp + i * 2.1) * b.amp) * sc;
        const half = 160 * sc;
        const g = x.createLinearGradient(0, y - half, 0, y + half);
        g.addColorStop(0, rgba(b.c, 0)); g.addColorStop(0.5, rgba(b.c, b.al * bg.mood)); g.addColorStop(1, rgba(b.c, 0));
        x.fillStyle = g; x.fillRect(0, y - half, lw, half * 2);
      });
      // 雾带：三层缓慢横向漂移（压扁的径向渐变）
      for (let i = 0; i < 3; i++) {
        const fy = h * (0.62 + i * 0.13) * sc + Math.sin(t * (0.05 + i * 0.02) + i) * 12 * sc;
        const fxp = (((t * (7 + i * 4)) % (w + 900)) - 450) * sc;
        const fr = (480 - i * 70) * sc;
        const fg = x.createRadialGradient(fxp, fy, 0, fxp, fy, fr);
        fg.addColorStop(0, 'rgba(176,206,238,' + (0.055 * bg.mood) + ')');
        fg.addColorStop(1, 'rgba(176,206,238,0)');
        x.fillStyle = fg; x.save(); x.translate(fxp, fy); x.scale(1, 0.24); x.translate(-fxp, -fy);
        x.beginPath(); x.arc(fxp, fy, fr, 0, 6.2832); x.fill(); x.restore();
      }
      // 星野闪烁（低分辨率下自然变成柔和光点）
      for (let i = 0; i < dyn.stars.length; i++) {
        const s = dyn.stars[i];
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.v + s.p));
        x.fillStyle = 'rgba(214,232,255,' + (0.55 * tw * bg.mood) + ')';
        x.fillRect(s.x * lw, s.y * lh, s.s, s.s);
      }
      // 尘埃浮游
      x.globalCompositeOperation = 'source-over';
      for (let i = 0; i < dyn.dust.length; i++) {
        const d = dyn.dust[i];
        d.x += d.vx * dt / Math.max(1, w); d.y += d.vy * dt / Math.max(1, h);
        if (d.y < -0.03) { d.y = 1.03; d.x = Math.random(); }
        if (d.x < -0.03) d.x = 1.03; else if (d.x > 1.03) d.x = -0.03;
        const a = d.a * (0.5 + 0.5 * Math.sin(t * 0.9 + d.p)) * bg.mood;
        x.fillStyle = 'rgba(236,226,205,' + a + ')';
        x.beginPath(); x.arc(d.x * lw, d.y * lh, d.s, 0, 6.2832); x.fill();
      }
      schedule();
    }
    function bgResize() {
      const cv = bg.cv; if (!cv) return;
      const w = Math.max(1, root.innerWidth), h = Math.max(1, root.innerHeight), d = dpr();
      bg.w = w; bg.h = h;
      cv.width = Math.round(w * d); cv.height = Math.round(h * d);
      bg.x = cv.getContext('2d');
      bg.x.setTransform(d, 0, 0, d, 0, 0);
      // 静态全景：只在尺寸变化时绘制一次（天幕 / 剪影 / 钟塔 / 雾 / 颗粒 / 暗角）
      bg.cache = genStatic(w, h);
      bg.x.drawImage(bg.cache, 0, 0, w, h);
      // 动态柔光层：低分辨率后备缓冲（约 0.42 倍），由 CSS 放大铺满
      bg.scale = 0.42;
      const fx = bg.fx;
      if (fx) {
        fx.width = Math.max(2, Math.round(w * bg.scale));
        fx.height = Math.max(2, Math.round(h * bg.scale));
        bg.fxx = fx.getContext('2d');
      }
      const r = rng(4242);
      dyn.stars = [];
      for (let i = 0; i < 190; i++) dyn.stars.push({ x: r(), y: r() * 0.82, s: 0.8 + r() * 1.4, p: r() * 6.283, v: 0.4 + r() * 1.7 });
      dyn.dust = [];
      for (let i = 0; i < 76; i++) dyn.dust.push({ x: r(), y: r(), s: 0.9 + r() * 2.1, vx: (r() - 0.5) * 8, vy: -3 - r() * 10, a: 0.10 + r() * 0.30, p: r() * 6.283 });
      paintTracks();
      if (!bg.raf) schedule();
    }
    let rzT = 0;
    function onResize() { clearTimeout(rzT); rzT = setTimeout(() => { bgResize(); FX.resize(); }, 140); }

    /* ---------- ④ 三条时间线的轨道材质贴图（缓存，仅在尺寸变化时重绘） ---------- */
    function trackTex(theme, w, h) {
      const key = theme + '|' + w + '|' + h;
      if (texCache.has(key)) return texCache.get(key);
      const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
      const x = c.getContext('2d');
      const T = THEME_OF(theme);
      // 基色渐变
      const base = x.createLinearGradient(0, 0, w * 0.6, h);
      if (theme === 'past') { base.addColorStop(0, '#3a2616'); base.addColorStop(0.5, '#241a12'); base.addColorStop(1, '#160f0b'); }
      else if (theme === 'present') { base.addColorStop(0, '#1e2a3a'); base.addColorStop(0.5, '#141c28'); base.addColorStop(1, '#0b1119'); }
      else { base.addColorStop(0, '#123039'); base.addColorStop(0.5, '#141a34'); base.addColorStop(1, '#100c22'); }
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      // 受光面：顶部亮带
      const top = x.createLinearGradient(0, 0, 0, h * 0.7);
      top.addColorStop(0, rgba(T.c, 0.16)); top.addColorStop(0.35, rgba(T.a, 0.05)); top.addColorStop(1, rgba(T.a, 0));
      x.fillStyle = top; x.fillRect(0, 0, w, h);
      // 主题装饰
      const r = rng(theme === 'past' ? 11 : theme === 'present' ? 22 : 33);
      if (theme === 'past') {
        // 做旧：胶片划痕 + 斑驳光斑
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const sx = r() * w, sy = r() * h, sh = 12 + r() * (h * 0.7);
          x.strokeStyle = 'rgba(255,238,206,' + (0.03 + r() * 0.06) + ')';
          x.lineWidth = 0.7 + r() * 1.1;
          x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 5, sy + sh); x.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const bx = r() * w, by = r() * h, br = 24 + r() * 90;
          const bg2 = x.createRadialGradient(bx, by, 0, bx, by, br);
          bg2.addColorStop(0, 'rgba(224,163,92,.07)'); bg2.addColorStop(1, 'rgba(224,163,92,0)');
          x.fillStyle = bg2; x.beginPath(); x.arc(bx, by, br, 0, 6.2832); x.fill();
        }
        x.globalCompositeOperation = 'source-over';
      } else if (theme === 'present') {
        // 干净锐利：细网格 + 对角冷光
        x.strokeStyle = 'rgba(190,220,248,.055)'; x.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 26) { x.beginPath(); x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, h); x.stroke(); }
        for (let gy = 0; gy < h; gy += 22) { x.beginPath(); x.moveTo(0, gy + 0.5); x.lineTo(w, gy + 0.5); x.stroke(); }
        const sh = x.createLinearGradient(0, h, w * 0.8, 0);
        sh.addColorStop(0, 'rgba(147,180,208,0)'); sh.addColorStop(0.55, 'rgba(190,220,248,.09)'); sh.addColorStop(1, 'rgba(147,180,208,0)');
        x.fillStyle = sh; x.fillRect(0, 0, w, h);
      } else {
        // 未来：扫描线 + 全息光斑 + 色散边
        x.fillStyle = 'rgba(6,10,20,.30)';
        for (let gy = 0; gy < h; gy += 3) x.fillRect(0, gy, w, 1);
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const bx = r() * w, by = r() * h, br = 60 + r() * 170;
          const g2 = x.createRadialGradient(bx, by, 0, bx, by, br);
          g2.addColorStop(0, i % 2 ? 'rgba(169,140,255,.16)' : 'rgba(126,240,226,.15)');
          g2.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g2; x.beginPath(); x.arc(bx, by, br, 0, 6.2832); x.fill();
        }
        const l = x.createLinearGradient(0, 0, w * 0.12, 0);
        l.addColorStop(0, 'rgba(126,240,226,.22)'); l.addColorStop(1, 'rgba(126,240,226,0)');
        x.fillStyle = l; x.fillRect(0, 0, w * 0.12, h);
        x.globalCompositeOperation = 'source-over';
      }
      // 噪点（材质颗粒）
      x.globalAlpha = theme === 'past' ? 0.42 : 0.22;
      x.globalCompositeOperation = 'overlay';
      x.fillStyle = pat(x); x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      // 内描边 + 接触阴影（让轨道有体积感）
      const vg = x.createLinearGradient(0, 0, 0, h);
      vg.addColorStop(0, rgba(T.a, 0.10)); vg.addColorStop(0.12, 'rgba(0,0,0,0)');
      vg.addColorStop(0.86, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)');
      x.fillStyle = vg; x.fillRect(0, 0, w, h);
      const hv = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      hv.addColorStop(0, 'rgba(0,0,0,0)'); hv.addColorStop(1, 'rgba(0,0,0,.4)');
      x.fillStyle = hv; x.fillRect(0, 0, w, h);
      if (texCache.size > 24) texCache.clear();
      texCache.set(key, c);
      return c;
    }
    function paintTracks() {
      const board = document.getElementById('board');
      if (!board) return;
      const d = dpr();
      board.querySelectorAll('.track').forEach(tr => {
        const theme = tr.classList.contains('t-past') ? 'past' : tr.classList.contains('t-present') ? 'present' : 'future';
        const w = Math.max(1, tr.clientWidth), h = Math.max(1, tr.clientHeight);
        if (w < 4 || h < 4) return;   // 屏幕未显示时不生成纹理（避免无意义重绘）
        let cv = tr.querySelector('canvas.track-art');
        if (!cv) { cv = document.createElement('canvas'); cv.className = 'track-art'; tr.insertBefore(cv, tr.firstChild); }
        if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
        const x = cv.getContext('2d');
        x.setTransform(d, 0, 0, d, 0, 0);
        x.clearRect(0, 0, w, h);
        x.drawImage(trackTex(theme, w, h), 0, 0, w, h);
      });
      layoutLinks();
    }

    /* ---------- ⑤ 因果能量流连线（渐变描边 + 辉光 + 流动光点） ---------- */
    let linkCv = null, linkGeo = null, linkRaf = 0, linkLast = 0;
    function layoutLinks() {
      const board = document.getElementById('board');
      if (!board) return;
      let cv = board.querySelector('#board-links');
      if (!cv) { cv = document.createElement('canvas'); cv.id = 'board-links'; board.appendChild(cv); }
      linkCv = cv;
      const d = dpr(), br = board.getBoundingClientRect();
      // 测量基准：棋格包围盒（内容坐标），而不是 board.scrollWidth——
      // 后者会被本画布自身的位图尺寸反向撑大（dpr=2 时多出一倍可滚空白）
      const rect = new Map();
      let bw = Math.max(1, board.clientWidth), bh = Math.max(1, board.clientHeight);
      board.querySelectorAll('.cell').forEach(c => {
        const r = c.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const l = r.left - br.left + board.scrollLeft, t = r.top - br.top + board.scrollTop;
        rect.set(c.dataset.t + ':' + c.dataset.s, { l, t, w: r.width, h: r.height });
        bw = Math.max(bw, l + r.width + 14);
        bh = Math.max(bh, t + r.height + 14);
      });
      if (!rect.size) { linkGeo = null; return; }   // 未显示/无棋格时不测量
      bw = Math.ceil(bw); bh = Math.ceil(bh);
      if (cv.width !== Math.round(bw * d) || cv.height !== Math.round(bh * d)) { cv.width = Math.round(bw * d); cv.height = Math.round(bh * d); }
      // 显式设定 CSS 尺寸：位图尺寸不再反推布局尺寸（撑大滚动区的根因）
      cv.style.width = bw + 'px'; cv.style.height = bh + 'px';
      const edges = (App.game && App.game.activeEdges) ? App.game.activeEdges.map(e => ({
        f: e.from.t + ':' + e.from.s, to: e.to.t + ':' + e.to.s,
        ft: e.from.t, tt: e.to.t, s: e.strength, hop: e.hop,
      })) : [];
      linkGeo = { w: bw, h: bh, rect, edges };
      if (!linkRaf) linkRaf = requestAnimationFrame(linksFrame);
    }
    function qpt(p1, c, p2, u) {
      const m = 1 - u;
      return { x: m * m * p1.x + 2 * m * u * c.x + u * u * p2.x, y: m * m * p1.y + 2 * m * u * c.y + u * u * p2.y };
    }
    function linksFrame(now) {
      linkRaf = 0;
      const cv = linkCv;
      if (!cv || !linkGeo) return;
      const scr = document.getElementById('screen-game');
      if (!scr || scr.classList.contains('hidden')) return;
      if (now - linkLast < 33) { linkRaf = requestAnimationFrame(linksFrame); return; }
      linkLast = now;
      const d = dpr(), x = cv.getContext('2d');
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, linkGeo.w, linkGeo.h);
      const edges = linkGeo.edges;
      if (!edges.length) return;
      const t = now / 1000;
      x.globalCompositeOperation = 'lighter';
      edges.forEach((e, i) => {
        const a = linkGeo.rect.get(e.f), b = linkGeo.rect.get(e.to);
        if (!a || !b) return;
        const p1 = { x: a.l + a.w - 4, y: a.t + a.h / 2 };
        const p2 = { x: b.l + 4, y: b.t + b.h / 2 };
        const dx = p2.x - p1.x;
        const c = { x: (p1.x + p2.x) / 2 + (dx < 90 ? -46 : 8), y: (p1.y + p2.y) / 2 + (e.ft === e.tt ? -26 : 0) };
        const str = Math.max(0.25, Math.min(1, e.s / 100));
        const ca = THEME_OF(e.ft).a, cb = THEME_OF(e.tt).a;
        // ① 外辉光
        x.strokeStyle = rgba(cb, 0.06 + 0.10 * str);
        x.lineWidth = 7 + 6 * str;
        x.beginPath(); x.moveTo(p1.x, p1.y); x.quadraticCurveTo(c.x, c.y, p2.x, p2.y); x.stroke();
        // ② 渐变能量芯
        const g = x.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        g.addColorStop(0, rgba(ca, 0.30 + 0.5 * str));
        g.addColorStop(0.5, rgba('#ffffff', 0.30 + 0.45 * str));
        g.addColorStop(1, rgba(cb, 0.34 + 0.55 * str));
        x.strokeStyle = g; x.lineWidth = 1.4 + 2.2 * str;
        x.beginPath(); x.moveTo(p1.x, p1.y); x.quadraticCurveTo(c.x, c.y, p2.x, p2.y); x.stroke();
        // ③ 流动光点（每段 3 颗）
        for (let k = 0; k < 3; k++) {
          const u = ((t * (0.32 + 0.05 * (e.hop || 1)) + i * 0.21 + k / 3) % 1);
          const q = qpt(p1, c, p2, u);
          const fade = Math.sin(Math.PI * u);
          const rr = 2.1 + 2.4 * fade;
          const dg = x.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr * 3.4);
          dg.addColorStop(0, rgba('#ffffff', 0.85 * fade));
          dg.addColorStop(0.35, rgba(cb, 0.5 * fade));
          dg.addColorStop(1, rgba(cb, 0));
          x.fillStyle = dg; x.beginPath(); x.arc(q.x, q.y, rr * 3.4, 0, 6.2832); x.fill();
        }
        // ④ 起点/终点脉冲环
        [p1, p2].forEach((p, pi) => {
          const rr = 4 + 3 * (0.5 + 0.5 * Math.sin(t * 2.2 + i + pi));
          x.strokeStyle = rgba(pi ? cb : ca, 0.35); x.lineWidth = 1.2;
          x.beginPath(); x.arc(p.x, p.y, rr, 0, 6.2832); x.stroke();
        });
      });
      x.globalCompositeOperation = 'source-over';
      linkRaf = requestAnimationFrame(linksFrame);
    }

    /* ---------- ⑥ 重影残像（时间同步时的同形低透明偏移绘制） ---------- */
    function ghostAt(cell) {
      if (!cell) return;
      const ents = cell.querySelectorAll('.entity');
      if (!ents.length) return;
      let layer = cell.querySelector('.ghost-layer');
      if (!layer) { layer = el('div', 'ghost-layer'); cell.appendChild(layer); }
      ents.forEach(en => {
        const top = en.offsetTop;
        ['ghost-a', 'ghost-b'].forEach(cls => {
          const g = el('div', en.className + ' ghost ' + cls, en.innerHTML);
          g.style.top = top + 'px';
          g.style.animationDelay = (cls === 'ghost-b' ? 70 : 0) + 'ms';
          layer.appendChild(g);
        });
      });
      setTimeout(() => { if (layer && layer.parentNode) layer.remove(); }, 1180);
    }

    /* ---------- ⑦ 章节主题色（章节卡片 / 关卡节点） ---------- */
    const CH_THEME = ['#e0a35c', '#8fb8d8', '#7ef0e2', '#c58bff', '#ff9a6e', '#6ee7a8', '#ffd76e', '#ff6fb5'];
    function chapterTheme(n) { return CH_THEME[(n - 1 + CH_THEME.length) % CH_THEME.length]; }

    return {
      init() {
        initNoise();
        bg.cv = document.getElementById('bg-canvas');
        bg.fx = document.getElementById('bg-fx');
        if (bg.cv) { bgResize(); root.addEventListener('resize', onResize); }
        FX.init();
      },
      setMood, paintTracks, layoutLinks, chapterTheme, rgba,
      ghosts: ghostAt,
    };
  })();

  /* ============================================================
   * 特效模块 FX：涟漪粒子（沿因果路径汇聚 = "粒子重组"）
   * 仅绘制，不改状态。
   * ============================================================ */
  const FX = (function () {
    let cv = null, x = null, w = 0, h = 0, raf = 0, last = 0;
    const parts = [];
    function init() {
      cv = document.getElementById('fx-canvas');
      if (!cv) return;
      resize();
    }
    function resize() {
      if (!cv) return;
      const d = Math.min(2, root.devicePixelRatio || 1);
      w = Math.max(1, root.innerWidth); h = Math.max(1, root.innerHeight);
      cv.width = Math.round(w * d); cv.height = Math.round(h * d);
      x = cv.getContext('2d');
      x.setTransform(d, 0, 0, d, 0, 0);
    }
    function center(elm) {
      const r = elm.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 };
    }
    function push(a, b, color, n) {
      if (!x) return;
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 70;
      const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 70;
      for (let i = 0; i < n; i++) {
        parts.push({
          p: -Math.random() * 0.35, sp: 0.55 + Math.random() * 0.65,
          a, b, c: { x: mx, y: my }, color,
          s: 1 + Math.random() * 2.1, jx: (Math.random() - 0.5) * 22, jy: (Math.random() - 0.5) * 22,
        });
      }
      if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    }
    function burst(p, color, n) {
      if (!x) return;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * 6.2832, sp = 40 + Math.random() * 190;
        parts.push({
          free: true, p: 0, sp: 0.8 + Math.random() * 0.7,
          x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
          color, s: 1.2 + Math.random() * 2.4,
        });
      }
      if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    }
    function qpt2(p1, c, p2, u) {
      const m = 1 - u;
      return { x: m * m * p1.x + 2 * m * u * c.x + u * u * p2.x, y: m * m * p1.y + 2 * m * u * c.y + u * u * p2.y };
    }
    function loop(now) {
      raf = 0;
      if (!x) return;
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      x.clearRect(0, 0, w, h);
      if (!parts.length) return;
      x.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.p += p.sp * dt * 1.35;
        if (p.p > 1.3) { parts.splice(i, 1); continue; }
        let px, py, fade;
        if (p.free) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
          px = p.x; py = p.y; fade = Math.max(0, 1 - p.p / 1.1);
        } else {
          const u = Math.max(0, Math.min(1, p.p));
          const q = qpt2(p.a, p.c, p.b, u);
          const j = 1 - u;
          px = q.x + p.jx * j; py = q.y + p.jy * j;
          fade = p.p < 0 ? 0 : Math.sin(Math.PI * Math.min(1, u)) * (1 - Math.max(0, p.p - 0.85) / 0.45);
        }
        if (fade <= 0.01) continue;
        const rr = p.s * (0.8 + 1.6 * fade);
        const g = x.createRadialGradient(px, py, 0, px, py, rr * 3.2);
        g.addColorStop(0, Art.rgba('#ffffff', 0.85 * fade));
        g.addColorStop(0.3, Art.rgba(p.color, 0.62 * fade));
        g.addColorStop(1, Art.rgba(p.color, 0));
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rr * 3.2, 0, 6.2832); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      if (parts.length) raf = requestAnimationFrame(loop);
    }
    return { init, resize, push, burst, center };
  })();

  /* ================= 应用入口 ================= */
  function boot(save) {
    App.save = save;
    bindGlobal();
    root.TSMain.settingsApply();
    Art.init();
    showScreen('boot');
    // 刷新不丢：带 #/c3l05 之类 hash 进入时直接落到对应关卡/章节页
    routeFromHash();
  }

  root.TSUI = {
    boot, toast, openReader,
    get App() { return App; },
    applyShard, renderAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
