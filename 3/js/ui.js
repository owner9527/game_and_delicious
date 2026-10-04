// ===== 界面系统:HUD、建造面板、信息面板、弹窗、交互 =====
G.UI = (() => {
  const tool = { mode: 'select', key: null };
  let selected = null;
  let selectedRes = null;
  let selZone = null;
  let tab = 'info';
  let overlay = 'none';
  let curCat = 'infra';
  const logs = [];
  let hudT = 0;
  let prevStocks = null;
  let bannerT = null;

  // ---------- 初始化 ----------
  function init() {
    document.querySelectorAll('.speed-group button').forEach(b => {
      b.addEventListener('click', () => setSpeed(parseInt(b.dataset.speed)));
    });
    G.U.$('btn-help').addEventListener('click', showHelp);
    G.U.$('btn-save').addEventListener('click', () => { G.SV.save('manual'); });
    G.U.$('btn-load').addEventListener('click', () => {
      if (G.SV.hasAny()) modalConfirm('读取存档', '读取上次保存的进度?当前未保存的进度将丢失。', () => G.SV.loadLatest());
      else toast('暂无存档', 'bad');
    });
    G.U.$('btn-new').addEventListener('click', () => {
      modalConfirm('新游戏', '开始新的领地?当前进度将丢失(可先保存)。', showStart);
    });
    G.U.$('btn-stage').addEventListener('click', () => {
      const next = G.sim.stageReady();
      if (!next) return;
      modalConfirm(`晋升「${next.name}」`,
        `花费 <b>${next.cost} 金币</b> 颁布敕令,晋升为「${next.name}」。<br>将解锁新阶级的建筑与外环领地。`, () => {
          G.sim.stageUp();
        });
    });
    G.U.$('tool-select').addEventListener('click', () => setTool('select'));
    G.U.$('tool-bulldoze').addEventListener('click', () => setTool('bulldoze'));
    G.U.$('goal-strip').addEventListener('click', () => toggleGoalDrop());
    G.U.$('overlay-mode').addEventListener('change', e => { overlay = e.target.value; });
    document.querySelectorAll('#panel-tabs button').forEach(b => {
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        document.querySelectorAll('#panel-tabs button').forEach(x => x.classList.toggle('active', x === b));
        renderPanel();
      });
    });
    G.U.$('panel-body').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'demolish' && selected) {
        modalConfirm('拆除建筑', `拆除 <b>${selected.def.name}</b>?返还一半资源。`, () => {
          G.B.remove(selected);
          selected = null; renderPanel();
        });
      } else if (a === 'stageup') {
        G.sim.stageUp(); renderPanel();
      } else if (a === 'unlock') {
        unlockZone(parseInt(btn.dataset.zx), parseInt(btn.dataset.zy));
      }
    });
    G.U.$('btn-start-new').addEventListener('click', () => {
      const diff = document.querySelector('input[name="difficulty"]:checked').value;
      const seed = G.U.seedFromString(G.U.$('input-seed').value.trim());
      G.main.newGame(seed, diff);
    });
    G.U.$('btn-start-continue').addEventListener('click', () => G.SV.loadLatest());
    G.RD.bindMinimap();
    buildPaletteTabs();
    G.U.$('panel-body').addEventListener('change', e => {
      const el = e.target.closest('[data-setting]');
      if (!el) return;
      if (el.dataset.setting === 'autopause') {
        G.U.store.set('tc_autopause', el.checked ? '1' : '0');
        toast(el.checked ? '⏸ 重大事件将自动暂停' : '重大事件不再自动暂停', 'info');
      }
    });
  }

  function setSpeed(v) {
    const max = Math.max.apply(null, G.CFG.ECON.speeds || [0, 1, 2, 3]);
    v = G.U.clamp(Math.round(v) || 0, 0, max);
    G.sim.speed = v;
    document.querySelectorAll('.speed-group button').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.speed) === v));
    return v;
  }

  function togglePause() {
    setSpeed((G.sim.speed || 0) === 0 ? (G.CFG.ECON.defaultSpeed || 1) : 0);
  }

  function getSpeed() { return G.sim.speed || 0; }

  // ---------- 工具 ----------
  function setTool(mode, key) {
    tool.mode = mode; tool.key = key || null;
    G.U.$('tool-select').classList.toggle('active', mode === 'select');
    G.U.$('tool-bulldoze').classList.toggle('active', mode === 'bulldoze');
    const cv = G.U.$('game');
    cv.classList.toggle('tool-place', mode === 'place');
    cv.classList.toggle('tool-bulldoze', mode === 'bulldoze');
    document.querySelectorAll('.build-item').forEach(el =>
      el.classList.toggle('selected', mode === 'place' && el.dataset.key === key));
  }

  // ---------- 建造面板 ----------
  function buildPaletteTabs() {
    const tabs = G.U.$('palette-tabs');
    tabs.innerHTML = '';
    for (const c of G.CFG.CATS) {
      const b = document.createElement('button');
      b.textContent = `${c.icon}${c.name}`;
      b.title = c.name;
      b.classList.toggle('active', c.k === curCat);
      b.addEventListener('click', () => { curCat = c.k; buildPaletteTabs(); });
      tabs.appendChild(b);
    }
    refreshPalette();
  }

  function refreshPalette() {
    const list = G.U.$('palette-list');
    list.innerHTML = '';
    const s = G.sim ? G.sim.state : null;
    for (const key in G.CFG.BUILDS) {
      const def = G.CFG.BUILDS[key];
      if (def.noBuild || def.cat !== curCat) continue;
      const el = document.createElement('div');
      el.className = 'build-item';
      el.dataset.key = key;
      const locked = def.stage > (s ? s.stage : 1);
      if (locked) el.classList.add('locked');
      const cost = [];
      if (def.cost.gold) cost.push(`💰${def.cost.gold}`);
      if (def.cost.wood) cost.push(`🪵${def.cost.wood}`);
      if (def.cost.stone) cost.push(`🪨${def.cost.stone}`);
      el.innerHTML = `
        <div class="build-icon">${def.icon}</div>
        <div class="build-info">
          <div class="build-name">${def.name}${locked ? ` 🔒${G.CFG.STAGES[def.stage - 1].name}` : ''}</div>
          <div class="build-cost">${cost.join(' ')}${def.workers ? ` · 👷${def.workers}` : ''}</div>
        </div>`;
      el.title = def.desc;
      el.addEventListener('click', () => {
        if (el.classList.contains('locked')) { toast(`需要达到「${G.CFG.STAGES[def.stage - 1].name}」阶段`, 'bad'); return; }
        if (tool.mode === 'place' && tool.key === key) setTool('select');
        else setTool('place', key);
      });
      list.appendChild(el);
    }
    updateAfford();
  }

  function updateAfford() {
    const s = G.sim ? G.sim.state : null;
    if (!s) return;
    document.querySelectorAll('.build-item').forEach(el => {
      const def = G.CFG.BUILDS[el.dataset.key];
      if (!def) return;
      const poor = (def.cost.gold || 0) > s.gold || (def.cost.wood || 0) > s.wood || (def.cost.stone || 0) > s.stone;
      el.classList.toggle('poor', poor && !el.classList.contains('locked'));
    });
  }

  // ---------- 画布交互 ----------
  function onCanvasClick(sx, sy) {
    if (tool.mode !== 'select') return; // 放置/拆除由 paintAt 处理
    // 先看有没有点到居民 —— 点一下就能知道"这个人是谁、正在干嘛"
    const res = G.RD.walkerAt ? G.RD.walkerAt(sx, sy) : null;
    if (res) {
      selectedRes = res; selected = null; selZone = null;
      hideHover();
      renderPanel();
      return;
    }
    selectedRes = null;
    const tile = G.RD.tileAt(sx, sy);
    if (!tile) return;
    const b = G.M.bAt(tile.tx, tile.ty);
    if (b) { selected = b; selZone = null; }
    else {
      selected = null;
      const z = G.M.zoneAt(tile.tx, tile.ty);
      if (!G.map.zones[z.zy * 3 + z.zx].open) selZone = z;
      else selZone = null;
    }
    renderPanel();
  }

  // ---------- 悬停提示(#tooltip 原本只写了 CSS,没有任何 JS 使用) ----------
  function hideHover() {
    const el = G.U.$('tooltip');
    if (el) el.classList.add('hidden');
  }

  function hoverAt(sx, sy, tile) {
    const el = G.U.$('tooltip');
    if (!el) return;
    const sm = G.U.$('modal-start'), gm = G.U.$('modal-generic');
    if ((sm && !sm.classList.contains('hidden')) || (gm && !gm.classList.contains('hidden'))) { hideHover(); return; }
    let html = null;
    // 1) 居民优先
    const res = G.RD.walkerAt ? G.RD.walkerAt(sx, sy) : null;
    if (res) {
      const t = G.R.taskOf(res);
      html = `<div class="tt-title">🧑 ${G.U.esc(res.name)}</div>`
        + `<div>${t.icon} ${G.U.esc(t.text)}</div>`
        + `<div class="tt-dim">${G.U.esc(G.R.jobNameOf(res))} · 幸福 ${Math.round(res.hap)}% · 健康 ${Math.round(res.health)}%</div>`
        + `<div class="tt-dim">点击可查看完整需求</div>`;
    } else if (tile) {
      const b = G.M.bAt(tile.tx, tile.ty);
      if (b) {
        const d = b.def;
        let lines = `<div class="tt-title">${d.icon} ${d.name}</div>`;
        if (d.produce && b.lastOut) {
          const parts = [];
          for (const k in b.lastOut) parts.push(`${k === 'wood' ? '🪵' : k === 'stone' ? '🪨' : '🌾'}+${b.lastOut[k].toFixed(1)}`);
          lines += `<div>昨日产出:${parts.join(' ')}</div>`;
        }
        if (d.workers) lines += `<div class="${b.eff <= 0 ? 'tt-bad' : 'tt-dim'}">员工 ${b.staff.length}/${d.workers}${b.eff <= 0 ? ' · 停产' : ''}</div>`;
        if (b.outNote) lines += `<div class="tt-bad">${G.U.esc(b.outNote)}</div>`;
        if (d.service) lines += `<div class="tt-dim">${G.CFG.NEEDS[d.service.need].name} ${b.servedToday}/${Math.round(d.service.cap * b.eff)} 人次/日</div>`;
        html = lines;
      } else {
        const r = G.RD.tileHasResource ? G.RD.tileHasResource(tile.tx, tile.ty) : null;
        if (r) {
          const nd = G.CFG.NAT[r.key];
          const pct = Math.round(r.stock / nd.max * 100);
          html = `<div class="tt-title">${nd.icon} ${nd.name}</div>`
            + `<div>蓄积 ${r.stock.toFixed(1)} / ${nd.max}(${pct}%)</div>`
            + `<div class="tt-dim">四季生长 ${nd.rate.join(' / ')} 点/日(越接近上限长得越慢)</div>`
            + `<div class="tt-dim">邻近的生产建筑会从这里取材</div>`;
        }
      }
    }
    if (!html) { hideHover(); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = sx + 16, y = sy + 14;
    if (x + w > window.innerWidth - 8) x = sx - w - 14;
    if (y + h > window.innerHeight - 8) y = sy - h - 12;
    el.style.left = Math.max(6, x) + 'px';
    el.style.top = Math.max(52, y) + 'px';
  }

  function paintAt(tx, ty) {
    if (!G.M.inB(tx, ty)) return;
    if (tool.mode === 'place') {
      const def = G.CFG.BUILDS[tool.key];
      if (!def) return;
      const r = G.B.place(tool.key, tx, ty);
      if (!r.ok) {
        const now = Date.now();
        if (!paintAt._lt || now - paintAt._lt > 1200 || paintAt._lm !== r.reason) {
          toast(r.reason, 'bad');
          paintAt._lt = now; paintAt._lm = r.reason;
        }
      }
    } else if (tool.mode === 'bulldoze') {
      const b = G.M.bAt(tx, ty);
      if (b) {
        if (b.def.key === 'hall') { toast('市政厅不可拆除', 'bad'); return; }
        G.B.remove(b);
        if (selected === b) { selected = null; renderPanel(); }
      }
    }
  }

  // ---------- HUD ----------
  // 库存涨落动画:数字变化时给对应资源条打一次绿/红闪,让"收入到底有没有进账"一眼可见
  function flashChip(el, delta) {
    if (!el) return;
    el.classList.remove('up', 'down');
    if (Math.abs(delta) < 0.05) return;
    void el.offsetWidth; // 重启动画
    el.classList.add(delta > 0 ? 'up' : 'down');
    clearTimeout(el._flashT);
    el._flashT = setTimeout(() => el.classList.remove('up', 'down'), 900);
  }

  function updateHUD(force) {
    const now = performance.now();
    if (!force && now - hudT < 180) return;
    hudT = now;
    if (!G.sim.state) return;
    const s = G.sim.state;
    const season = G.CFG.SEASONS[G.sim.seasonIdx()];
    const hap = Math.round(G.sim.hap());
    const face = hap >= 65 ? '😄' : hap >= 45 ? '🙂' : hap >= 30 ? '😟' : '😠';
    const foodEl = G.U.$('chip-food');
    const starving = s.food < G.res.length * 3;
    const ov = s.lastOverflow || { wood: 0, stone: 0, food: 0 };
    const prod = s.lastProd || { wood: 0, stone: 0, food: 0 };
    G.U.$('chip-date').innerHTML = `${season.icon} ${season.name}${G.sim.dayOfSeason()}日 · ${G.sim.year()}年 · 第${s.day}天`;
    G.U.$('chip-gold').innerHTML = `💰 <b>${G.U.fmt(s.gold)}</b>`;
    G.U.$('chip-wood').innerHTML = `🪵 <b>${G.U.fmt(s.wood)}</b>/${G.U.fmt(s.caps.wood)}${ov.wood > 1 ? ' ⚠' : ''}`;
    G.U.$('chip-stone').innerHTML = `🪨 <b>${G.U.fmt(s.stone)}</b>/${G.U.fmt(s.caps.stone)}${ov.stone > 1 ? ' ⚠' : ''}`;
    foodEl.innerHTML = `🌾 <b>${G.U.fmt(s.food)}</b>/${G.U.fmt(s.caps.food)}${ov.food > 1 ? ' ⚠' : ''}`;
    foodEl.style.color = starving ? '#e07a6a' : '';
    G.U.$('chip-pop').innerHTML = `👥 <b>${G.res.length}</b>/${G.R.housingCap()}`;
    G.U.$('chip-hap').innerHTML = `${face} 幸福 <b>${hap}%</b>`;

    // 资源条涨落动画(悬浮时也能看到昨日产出)
    const stocks = { gold: s.gold, wood: s.wood, stone: s.stone, food: s.food };
    if (prevStocks) {
      flashChip(G.U.$('chip-gold'), stocks.gold - prevStocks.gold);
      flashChip(G.U.$('chip-wood'), stocks.wood - prevStocks.wood);
      flashChip(G.U.$('chip-stone'), stocks.stone - prevStocks.stone);
      flashChip(G.U.$('chip-food'), stocks.food - prevStocks.food);
    }
    prevStocks = stocks;
    G.U.$('chip-gold').title = `金币 · 昨日税金+${Math.round(prod.gold || 0)} / 维护-${Math.round(s.lastUpkeep || 0)}`;
    G.U.$('chip-wood').title = `木材 · 昨日产出+${(prod.wood || 0).toFixed(1)}${ov.wood > 1 ? ` · 溢出浪费 ${ov.wood.toFixed(1)}(仓储已满)` : ''}`;
    G.U.$('chip-stone').title = `石料 · 昨日产出+${(prod.stone || 0).toFixed(1)}${ov.stone > 1 ? ` · 溢出浪费 ${ov.stone.toFixed(1)}(仓储已满)` : ''}`;
    G.U.$('chip-food').title = `粮食 · 昨日产出+${(prod.food || 0).toFixed(1)} · 昨日消耗-${(G.res.length * G.CFG.ECON.foodPer).toFixed(0)}`;

    updateGoalStrip();

    const ready = G.sim.stageReady();
    const bs = G.U.$('btn-stage');
    if (ready) {
      bs.classList.remove('hidden');
      bs.textContent = `⬆ 晋升${ready.name}(${ready.cost}金)`;
    } else bs.classList.add('hidden');
    updateAfford();
  }

  // ---------- 顶栏目标条 + 里程碑下拉(目标链常驻入口) ----------
  // 数据复用 G.CFG.OBJECTIVES 与 state.objIdx,不新增模拟逻辑;
  // 每个目标的进度由 config.js 中同数据源的 prog()(0..1)给出,这里只做钳制与展示。
  let goalOpen = false;
  let goalCache = '';

  function goalInfo() {
    const s = G.sim.state;
    const objs = G.CFG.OBJECTIVES;
    const idx = Math.min(s.objIdx, objs.length - 1);
    if (s.objIdx >= objs.length) return { done: true, idx, name: '全部里程碑达成 · 伟大王国!', p: 1 };
    let p = 0;
    try { p = objs[idx].prog ? G.U.clamp(+objs[idx].prog() || 0, 0, 1) : 0; } catch (e) { p = 0; }
    return { done: false, idx, name: objs[idx].text, p };
  }

  // 内容按 key 缓存,只在变化时重建 DOM(每帧调用也不会闪/抖)
  function updateGoalStrip() {
    const strip = G.U.$('goal-strip');
    if (!strip || !G.sim.state) return;
    const info = goalInfo();
    const pct = Math.round(info.p * 100);
    const key = [info.done ? 'D' : info.idx, info.name, pct, goalOpen ? 1 : 0].join('|');
    if (key === goalCache) return;
    goalCache = key;
    strip.innerHTML = `<span class="gs-icon">🎯</span>`
      + `<span class="gs-name">${info.done ? '🏆 ' : '当前目标:'}${G.U.esc(info.name)}</span>`
      + `<span class="gs-bar"><span class="gs-fill" style="width:${pct}%"></span></span>`
      + `<span class="gs-pct">${pct}%</span>`
      + `<span class="gs-more">${goalOpen ? '▾ 收起' : '▴ 展开'}</span>`;
  }

  function toggleGoalDrop(force) {
    goalOpen = force === undefined ? !goalOpen : !!force;
    G.U.$('goal-drop').classList.toggle('hidden', !goalOpen);
    if (goalOpen) renderGoalDrop();
    updateGoalStrip();
  }

  function renderGoalDrop() {
    const s = G.sim.state;
    if (!s) return;
    const objs = G.CFG.OBJECTIVES;
    let html = `<div class="gd-title">🎯 发展里程碑(${Math.min(s.objIdx, objs.length)}/${objs.length})</div>`;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const cls = i < s.objIdx ? 'gd-done' : i === s.objIdx ? 'gd-cur' : 'gd-next';
      const mark = i < s.objIdx ? '✔' : i === s.objIdx ? '▶' : '·';
      let pl = '';
      if (i === s.objIdx) {
        let p = 0;
        try { p = o.prog ? G.U.clamp(+o.prog() || 0, 0, 1) : 0; } catch (e) { p = 0; }
        pl = `<div class="gd-bar"><div class="gd-fill" style="width:${Math.round(p * 100)}%"></div></div>`;
      }
      html += `<div class="gd-item ${cls}"><span class="gd-mark">${mark}</span><span class="gd-text">${G.U.esc(o.text)}${pl}</span></div>`;
    }
    html += `<div class="gd-tip">已完成 ✔;当前 ▶(带进度条)。晋升阶段还需要在顶栏点「⬆ 晋升」颁布敕令。</div>`;
    G.U.$('goal-drop').innerHTML = html;
  }

  // ---------- 警报 ----------
  function buildAlerts() {
    const box = G.U.$('alerts');
    const arr = [];
    const n = G.res.length;
    const homeless = G.R.homeless();
    if (homeless > 0) arr.push(`🚫 ${homeless} 人无家可归,快建住房!`);
    if (n > 0 && G.sim.state.food < n * 3) arr.push('🍞 粮食储备不足 3 天,抓紧开垦农田!');
    else if (n > 0 && G.sim.state.food < n * 6) arr.push('🍞 粮食储备偏低,建议多建农田');
    const sick = G.R.sickCount();
    if (sick > 0) arr.push(`⚕️ ${sick} 人患病,需要医疗覆盖!`);
    for (const e of G.EV.list()) if (e.days > 1) arr.push(`${e.icon} ${e.name}进行中(剩 ${e.days} 天)`);
    box.innerHTML = arr.map(a => `<div class="alert-item">${a}</div>`).join('');
  }

  // ---------- 面板 ----------
  function renderPanel() {
    const body = G.U.$('panel-body');
    if (!G.sim.state) { body.innerHTML = ''; return; }
    // 选中的居民可能已经离世/迁出
    if (selectedRes && !G.res.includes(selectedRes)) selectedRes = null;
    if (tab === 'info') body.innerHTML = panelInfo();
    else if (tab === 'city') body.innerHTML = panelCity();
    else if (tab === 'goal') body.innerHTML = panelGoal();
    else body.innerHTML = panelLog();
  }

  // 进度条:渐变填充 + 高光(外框/内阴影/圆角在 style.css 里)
  function bar(v, color) {
    const p = G.U.clamp(v, 0, 100);
    const bg = `linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.06) 58%),`
      + `linear-gradient(90deg,${color}99,${color})`;
    return `<div class="need-bar"><div class="need-fill" style="width:${p}%;background-image:${bg}"></div></div>`;
  }

  function panelInfo() {
    if (selectedRes) return panelResident();
    if (selZone) {
      const { zx, zy } = selZone;
      const ring = G.M.zoneRing(zx, zy);
      const cost = G.CFG.ZONE_COST[ring === 1 ? 'ring1' : 'ring2'];
      const s = G.sim.state;
      const canStage = s.stage >= cost.stage;
      const canGold = s.gold >= cost.gold;
      return `<h3>🕯️ 未解锁领地</h3>
        <div class="dim">区块 (${zx}, ${zy}) · ${ring === 1 ? '内环' : '外环'}</div>
        <h4>解锁条件</h4>
        <div class="row"><span class="k">费用</span><span class="v ${canGold ? 'good' : 'bad'}">💰 ${cost.gold}</span></div>
        <div class="row"><span class="k">阶段</span><span class="v ${canStage ? 'good' : 'bad'}">${G.CFG.STAGES[cost.stage - 1].name}</span></div>
        ${canStage && canGold
          ? `<button class="panel-btn" data-action="unlock" data-zx="${zx}" data-zy="${zy}">🔓 解锁这片领地</button>`
          : `<div class="dim" style="margin-top:8px">尚未满足条件</div>`}`;
    }
    if (!selected) {
      return `<h3>👆 点击建筑查看详情</h3>
        <div class="dim">左侧选择建筑进行建造;道路可按住拖动连画;<br>右键或 ESC 取消工具。</div>
        <h4>今日概况</h4>
        <div class="row"><span class="k">人口</span><span class="v">${G.res.length}</span></div>
        <div class="row"><span class="k">建筑数</span><span class="v">${G.builds.length}</span></div>
        <div class="row"><span class="k">昨日税金</span><span class="v">💰 ${Math.round(G.sim.state.lastTax)}</span></div>
        <div class="row"><span class="k">维护费</span><span class="v">💰 ${Math.round(G.sim.state.lastUpkeep)}</span></div>`;
    }
    const b = selected, d = b.def;
    let html = `<h3>${d.icon} ${d.name}</h3><div class="dim">${d.desc}</div>`;
    // 维护成本提到最上面,与产出/用工一眼对上(原来沉在面板最底部)
    if (d.upkeep) html += `<div class="row"><span class="k">维护成本</span><span class="v">💰 ${d.upkeep}/天</span></div>`;
    if (d.housing) {
      const occ = (b.resIds || []).length;
      html += `<h4>住户 ${occ}/${d.housing}</h4>
        <div class="row"><span class="k">舒适度</span><span class="v">${d.comfort}</span></div>`;
    }
    if (d.workers) {
      html += `<h4>员工 ${b.staff.length}/${d.workers}</h4>` + bar(b.eff * 100, '#6aa84f');
      const gapN = d.workers - b.staff.length;
      html += `<div class="row"><span class="k">负荷状态</span><span class="v ${b.eff >= 1 ? 'good' : 'warn'}">${b.eff >= 1 ? '✔ 满负荷' : '未满负荷(' + Math.round(b.eff * 100) + '%)'}</span></div>`;
      if (gapN > 0) html += `<div class="row"><span class="k">用工缺口</span><span class="v bad">还缺 ${gapN} 人</span></div>`;
      if (b.eff <= 0) html += `<div class="warn">无人上工,已经停产 —— 建住房增加人口,或拆除/减少其它建筑腾人手</div>`;
    } else if (d.key !== 'road') {
      html += `<div class="row"><span class="k">用工</span><span class="v">无需员工,自动运转</span></div>`;
    }
    if (d.produce) {
      html += `<h4>产出</h4>`;
      const want = G.E.wantOf(b);
      for (const k in d.produce) {
        const kk = k === 'wood' ? '🪵' : k === 'stone' ? '🪨' : '🌾';
        const goal = want.out[k];
        const real = (b.lastOut && b.lastOut[k] !== undefined) ? b.lastOut[k] : 0;
        const cls = real > 0.05 ? 'good' : (b.eff <= 0 ? '' : 'warn');
        html += `<div class="row"><span class="k">${kk} 昨日实际产出</span><span class="v ${cls}">${real.toFixed(1)}</span></div>`;
        html += `<div class="row"><span class="k">${kk} 满员理论产量</span><span class="v">${goal.toFixed(1)}</span></div>`;
        if (d.farm) {
          html += `<div class="row"><span class="k">季节/地块系数</span><span class="v">×${G.E.farmFactor(b).toFixed(2)}</span></div>`;
          if (d.fertileBonus) html += `<div class="row"><span class="k">· 沃土加成</span><span class="v">+${Math.round(b.fertileTiles * d.fertileBonus * 100)}%(落地时 ${b.fertileTiles} 格沃土)</span></div>`;
          if (b.water && d.waterBonus) html += `<div class="row"><span class="k">· 水域加成</span><span class="v">+${Math.round(d.waterBonus * 100)}%(毗邻水域)</span></div>`;
        }
        if (d.forestBonus) {
          const eq = G.E.forestEqOf(b);
          html += `<div class="row"><span class="k">毗邻森林(放置时)</span><span class="v">${b.forest} 格</span></div>`;
          html += `<div class="row"><span class="k">林地健康度折算</span><span class="v ${eq > 3 ? 'good' : 'warn'}">${eq.toFixed(1)} / 8 格</span></div>`;
        }
        if (k === 'wood' && d.produce.wood) {
          html += `<div class="row"><span class="k">其中森林加成</span><span class="v good">+${G.E.forestBonusOf(b, G.E.prodMult()).toFixed(1)}</span></div>`;
        }
      }
      if (b.outNote) html += `<div class="bad">⚠ ${G.U.esc(b.outNote)}</div>`;
      else if (b.eff <= 0) html += `<div class="bad">⚠ 无人上工,已经停产(建住房增加人口)</div>`;
      html += `<div class="row"><span class="k">全局生产效率</span><span class="v">×${G.E.prodMult().toFixed(2)}</span></div>`;
      const rk = G.E.resKeyOf(b);
      if (rk && G.NAT.ready) {
        const info = G.NAT.near(b, rk);
        const nd = G.CFG.NAT[rk];
        html += `<h4>附近${nd.name}</h4>
          <div class="row"><span class="k">资源格</span><span class="v">${info.tiles} 格</span></div>
          <div class="row"><span class="k">蓄积</span><span class="v ${info.ratio < 0.3 ? 'bad' : 'good'}">${info.total.toFixed(0)} / ${info.cap.toFixed(0)}</span></div>
          ${bar(info.ratio * 100, info.ratio < 0.3 ? '#c0603f' : '#4f8a3f')}
          <div class="dim">${nd.icon} ${nd.name}按季节生长(${nd.rate.join('/')} 点/日),采伐后会自己长回来。</div>`;
      }
      const ov = G.sim.state.lastOverflow || {};
      for (const k in d.produce) {
        if (ov[k] > 1) html += `<div class="bad">📦 ${k === 'wood' ? '木材' : k === 'stone' ? '石料' : '粮食'}仓储已满,昨日浪费 ${ov[k].toFixed(1)}(建谷仓/仓库提高上限)</div>`;
      }
    }
    if (d.service) {
      html += `<div class="row"><span class="k">服务</span><span class="v">${G.CFG.NEEDS[d.service.need].name} · 今日 ${b.servedToday}/${Math.round(d.service.cap * b.eff)} 人次</span></div>
        <div class="row"><span class="k">覆盖半径</span><span class="v">${d.service.radius} 格(沿路)</span></div>`;
      if (b.eff <= 0) html += `<div class="bad">⚠ 缺少员工,无法提供服务</div>`;
      if (!G.P.connected(b)) html += `<div class="bad">⚠ 未毗邻道路,居民无法到达!</div>`;
    }
    if (d.storage) {
      for (const k in d.storage) html += `<div class="row"><span class="k">仓储加成</span><span class="v">${k === 'food' ? '🌾' : k === 'wood' ? '🪵' : '🪨'} +${d.storage[k]}</span></div>`;
    }
    if (d.aura) {
      html += `<div class="row"><span class="k">光环半径</span><span class="v">${d.aura.radius || '全局'}</span></div>`;
    }
    html += d.noBuild ? '' : `<button class="panel-btn" data-action="demolish">💥 拆除(返还一半)</button>`;
    return html;
  }

  // 居民详情:职业 + 当前任务 + 需求(玩家反馈"人为什么这么多人跑来跑去干嘛")
  function panelResident() {
    const r = selectedRes;
    const t = G.R.taskOf(r);
    let html = `<h3>🧑 ${G.U.esc(r.name)}</h3>
      <div class="dim">职业:${G.U.esc(G.R.jobNameOf(r))} · 于第 ${r.joinedDay || 1} 天加入</div>
      <h4>正在做什么</h4>
      <div class="row"><span class="k">当前状态</span><span class="v">${t.icon} ${G.U.esc(t.text)}</span></div>
      ${t.why ? `<div class="dim">${G.U.esc(t.why)}</div>` : ''}
      <div class="row"><span class="k">所在 / 去处</span><span class="v">${G.U.esc(G.R.whereOf(r))}</span></div>
      <div class="row"><span class="k">幸福度</span><span class="v ${r.hap >= 60 ? 'good' : r.hap < 35 ? 'bad' : ''}">${Math.round(r.hap)}%</span></div>
      <div class="row"><span class="k">健康</span><span class="v ${r.sick ? 'bad' : ''}">${Math.round(r.health)}%${r.sick ? '(患病)' : ''}</span></div>
      <h4>需求满足度</h4>`;
    for (const k in G.CFG.NEEDS) {
      const nd = G.CFG.NEEDS[k];
      const v = Math.round((r.sat && r.sat[k]) || 0);
      html += `<div class="row"><span class="k">${nd.icon} ${nd.name}</span><span class="v">${v}%</span></div>${bar(v, nd.color)}`;
    }
    html += `<div class="dim" style="margin-top:8px">地图上这名居民头顶有 ▲ 目的标记(蓝=上班 / 黄=去酒馆教堂 / 绿=散步)。点击建筑可取消选中。</div>`;
    return html;
  }

  function panelCity() {
    const n = G.res.length;
    const employed = G.res.filter(r => r.job).length;
    const cov = need => n ? Math.round(G.res.filter(r => {
      if (need === 'joy') return r.coveredJoy;
      if (need === 'medical') return r.coveredMed;
      if (need === 'faith') return r.coveredFaith;
      return false;
    }).length / n * 100) : 0;
    const avg = k => n ? Math.round(G.res.reduce((a, r) => a + r.sat[k], 0) / n) : 0;
    let html = `<h3>🏙️ 城市概览</h3>
      <div class="row"><span class="k">阶段</span><span class="v">${G.CFG.STAGES[G.sim.state.stage - 1].icon} ${G.CFG.STAGES[G.sim.state.stage - 1].name}</span></div>
      <div class="row"><span class="k">人口 / 住房容量</span><span class="v">${n} / ${G.R.housingCap()}</span></div>
      <div class="row"><span class="k">就业(健康者)</span><span class="v">${employed} / ${G.res.filter(r => !r.sick).length}</span></div>
      <div class="row"><span class="k">患者 / 饥饿</span><span class="v ${G.R.sickCount() ? 'bad' : ''}">${G.R.sickCount()} / <span class="${G.R.hungries() ? 'bad' : ''}">${G.R.hungries()}</span></span></div>
      <h4>需求满足度</h4>`;
    for (const k in G.CFG.NEEDS) {
      const nd = G.CFG.NEEDS[k];
      const v = avg(k);
      html += `<div class="row"><span class="k">${nd.icon} ${nd.name}</span><span class="v">${v}%</span></div>${bar(v, nd.color)}`;
    }
    html += `<h4>服务覆盖(可达)</h4>
      <div class="row"><span class="k">🎭 娱乐</span><span class="v ${cov('joy') < 70 ? 'warn' : ''}">${cov('joy')}%</span></div>
      <div class="row"><span class="k">⚕️ 医疗</span><span class="v ${cov('medical') < 70 ? 'warn' : ''}">${cov('medical')}%</span></div>
      <div class="row"><span class="k">⛪ 信仰</span><span class="v ${cov('faith') < 70 ? 'warn' : ''}">${cov('faith')}%</span></div>`;

    // ---- 本日资源流向(生产链透视) ----
    // 数据源:economy.tick 每日写入 state 的 lastProd/lastWant/lastOverflow 快照,这里只做聚合展示,不新增模拟逻辑。
    html += `<h4>本日资源流向<span class="dim">(昨日结算)</span></h4>` + flowTable();
    const stalled = G.B.stalledProducers();
    if (stalled.length) {
      html += `<div class="bad">⚠ ${stalled.map(b => b.def.name).join('、')} 无人上工已停产(人口不足,先建住房)</div>`;
    }

    // ---- 自然资源:可再生 + 可感知(只统计已解锁领地) ----
    if (G.NAT && G.NAT.ready) {
      const sum = G.NAT.summary();
      html += `<h4>可再生资源<span class="dim">(已解锁领地内)</span></h4>`;
      for (const key of ['wood', 'ore', 'game']) {
        const v = sum[key];
        const netStr = (v.net >= 0 ? '+' : '') + v.net.toFixed(1);
        html += `<div class="row"><span class="k">${v.icon} ${v.name}</span>
          <span class="v ${v.net >= 0 ? 'good' : 'bad'}">${Math.round(v.total)} / ${Math.round(v.cap)}(${netStr}/日)</span></div>
          ${bar(v.ratio * 100, v.ratio > 0.45 ? '#4f8a3f' : v.ratio > 0.2 ? '#c99a2e' : '#c0603f')}
          <div class="dim">生长 +${v.grow.toFixed(1)} · 采集 -${v.harvest.toFixed(1)}</div>`;
      }
      html += `<div class="dim">森林/矿脉会被采空,但会按季节自己长回来;每 40 天还有一次矿脉勘探刷新。解锁新领地后这里的数字会重新统计。</div>`;
    }

    // ---- 人口 ----
    const ECON = G.CFG.ECON;
    const growCap = Math.max(ECON.popGrowFlat, Math.floor(n * ECON.popGrowRate));
    html += `<h4>人口</h4>
      <div class="row"><span class="k">当前 / 住房容量</span><span class="v">${n} / ${G.R.housingCap()}</span></div>
      <div class="row"><span class="k">人口硬上限</span><span class="v">${ECON.popCap}</span></div>
      <div class="row"><span class="k">本日最多新增</span><span class="v">${growCap} 人</span></div>`;

    html += `<h4>财政</h4>
      <div class="row"><span class="k">昨日税金</span><span class="v">💰 ${Math.round(G.sim.state.lastTax)}</span></div>
      <div class="row"><span class="k">昨日维护</span><span class="v">💰 ${Math.round(G.sim.state.lastUpkeep)}</span></div>`;

    html += `<h4>节奏与提醒</h4>
      <div class="row"><span class="k">当前速度</span><span class="v">${speedLabel(G.sim.speed || 0)} · 一天 ${(G.CFG.ECON.dayMs / 1000).toFixed(1)} 秒</span></div>
      <label class="chk-row"><input type="checkbox" data-setting="autopause" ${autoPauseOnEvent() ? 'checked' : ''}> 重大事件(瘟疫/火灾/盗匪)自动暂停,让我看清发生了什么</label>`;
    return html;
  }

  // 本日资源流向表:每类资源一行,列 建筑产出 / 居民消耗 / 浪费(溢出) / 净变化。
  // 记账恒等式:净变化 = 产出 − 消耗 − 浪费。其中「产出」= 实际生产总量
  // (economy 的 lastProd 入库量 + lastOverflow 被仓储上限丢弃量);理论满负荷产量(lastWant)放在悬浮提示里。
  function flowTable() {
    const s = G.sim.state;
    const prod = s.lastProd || { wood: 0, stone: 0, food: 0, gold: 0 };
    const want = s.lastWant || { wood: 0, stone: 0, food: 0 };
    const ov = s.lastOverflow || { wood: 0, stone: 0, food: 0 };
    // 居民消耗:日常只有粮食(木/石无日常消耗);耗粮系数复用 residents 的 foodMult(冬季 1.25 倍)。
    // 金币行:产出入账=税金,消耗=维护费(交易所买卖与建造支出不在快照里,见注脚)。
    const rows = [
      { icon: '🪵', name: '木材', gross: (prod.wood || 0) + (ov.wood || 0), cons: 0, waste: ov.wood || 0, want: want.wood || 0 },
      { icon: '🪨', name: '石料', gross: (prod.stone || 0) + (ov.stone || 0), cons: 0, waste: ov.stone || 0, want: want.stone || 0 },
      { icon: '🌾', name: '粮食', gross: (prod.food || 0) + (ov.food || 0),
        cons: G.res.length * G.CFG.ECON.foodPer * G.R.foodMult(), waste: ov.food || 0, want: want.food || 0 },
      { icon: '💰', name: '金币', gross: prod.gold || 0, cons: s.lastUpkeep || 0, waste: 0, want: null },
    ];
    const q1 = v => (Math.round(v * 10) / 10).toFixed(1);
    const cell = (v, gold, cls) => {
      if (Math.abs(v) < 0.05) return '<span class="dim">-</span>';
      const body = gold ? String(Math.round(Math.abs(v))) : q1(Math.abs(v));
      return `<span class="${cls || ''}">${v > 0 ? '+' : '-'}${body}</span>`;
    };
    let h = '<table class="flow-table"><tr><th>资源</th><th>产出</th><th>消耗</th><th>浪费</th><th>净变化</th></tr>';
    for (const r of rows) {
      const isGold = r.want === null;
      const net = r.gross - r.cons - r.waste;
      const netCls = net > 0.05 ? 'good' : net < -0.05 ? 'bad' : 'dim';
      const tip = isGold
        ? '昨日税金(受幸福/教育加成)与建筑维护费;交易所买卖未计入'
        : `理论满负荷产量 ${q1(r.want)},实际受资源蓄积/人手/仓储限制;缺粮时居民实际消耗会低于理论值`;
      h += `<tr title="${tip}"><td>${r.icon} ${r.name}</td>`
        + `<td>${cell(r.gross, isGold, 'good')}</td>`
        + `<td>${cell(-r.cons, isGold, 'bad')}</td>`
        + `<td>${cell(-r.waste, isGold, 'bad')}</td>`
        + `<td>${cell(net, isGold, netCls)}</td></tr>`;
    }
    h += '</table>'
      + `<div class="dim">产出=建筑实际交付(理论满负荷产量见悬浮提示);浪费=仓储装满后被丢弃;消耗=居民口粮与维护费;净变化不含建造/事件/交易所的进出。</div>`;
    return h;
  }

  function speedLabel(v) {
    return v === 0 ? '⏸ 暂停' : '▶'.repeat(Math.min(3, v)) + ' ' + v + 'x';
  }

  function panelGoal() {
    const s = G.sim.state;
    let html = `<h3>🎯 发展目标</h3>`;
    const objs = G.CFG.OBJECTIVES;
    const from = Math.max(0, s.objIdx - 2);
    for (let i = from; i < Math.min(objs.length, from + 4); i++) {
      const cls = i < s.objIdx ? 'obj-done' : i === s.objIdx ? 'obj-cur' : 'obj-next';
      html += `<div class="obj-item ${cls}">${i < s.objIdx ? '✔' : i === s.objIdx ? '▶' : '·'} ${objs[i].text}</div>`;
    }
    const stage = G.CFG.STAGES[s.stage - 1];
    html += `<h4>当前阶段:${stage.icon} ${stage.name}</h4>`;
    const next = G.sim.stageReady();
    if (next) {
      html += `<button class="panel-btn" data-action="stageup">⬆ 晋升「${next.name}」(💰${next.cost})</button>`;
    } else if (s.stage < G.CFG.STAGES.length) {
      const nx = G.CFG.STAGES[s.stage];
      html += `<div class="dim">下一阶段「${nx.name}」:${nx.reqText},且金币 ≥ ${nx.cost}</div>
        <div class="row"><span class="k">人口</span><span class="v ${G.sim.pop() >= nx.req.pop ? 'good' : 'bad'}">${G.sim.pop()}/${nx.req.pop}</span></div>
        <div class="row"><span class="k">幸福度</span><span class="v ${Math.round(G.sim.hap()) >= nx.req.hap ? 'good' : 'bad'}">${Math.round(G.sim.hap())}/${nx.req.hap}</span></div>
        ${nx.req.school ? `<div class="row"><span class="k">学堂</span><span class="v ${G.B.count('school') >= nx.req.school ? 'good' : 'bad'}">${G.B.count('school')}/${nx.req.school}</span></div>` : ''}
        <div class="row"><span class="k">金币</span><span class="v ${s.gold >= nx.cost ? 'good' : 'bad'}">${G.U.fmt(s.gold)}/${nx.cost}</span></div>`;
    } else {
      html += `<div class="good">已达到最高阶段</div>`;
    }
    html += `<h4>领地</h4><div class="dim">已解锁 ${G.M.openCount()}/9 个区块。点击地图上暗色区块可查看解锁条件。</div>`;
    return html;
  }

  function panelLog() {
    let html = '<h3>📜 日志</h3>';
    const recent = logs.slice(-60).reverse();
    if (!recent.length) html += '<div class="dim">暂无记录</div>';
    for (const l of recent) {
      html += `<div class="log-item"><span class="log-day">D${l.day}</span><span class="${l.type === 'bad' ? 'bad' : l.type === 'good' ? 'good' : ''}">${l.text}</span></div>`;
    }
    return html;
  }

  function unlockZone(zx, zy) {
    const ring = G.M.zoneRing(zx, zy);
    const cost = G.CFG.ZONE_COST[ring === 1 ? 'ring1' : 'ring2'];
    const s = G.sim.state;
    if (s.stage < cost.stage) { toast(`需要达到「${G.CFG.STAGES[cost.stage - 1].name}」阶段`, 'bad'); return; }
    if (s.gold < cost.gold) { toast('金币不足', 'bad'); return; }
    s.gold -= cost.gold;
    G.M.openZone(zx, zy);
    toast(`🗺️ 领地扩展!区块 (${zx}, ${zy}) 已解锁`, 'good');
    log(`解锁了区块 (${zx}, ${zy}) 的新领地`, 'good');
    selZone = null;
    renderPanel();
  }

  // ---------- Toast / 日志 / 弹窗 ----------
  function toast(text, type = 'info') {
    const box = G.U.$('toasts');
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .5s'; }, 3400);
    setTimeout(() => d.remove(), 4000);
  }

  function log(text, type = 'info') {
    logs.push({ day: G.sim.state ? G.sim.state.day : 0, text, type });
    if (logs.length > 120) logs.shift();
    if (tab === 'log') renderPanel();
  }

  function modalConfirm(title, html, onOk, okText = '确定') {
    G.U.$('modal-title').textContent = title;
    G.U.$('modal-content').innerHTML = html;
    const btns = G.U.$('modal-btns');
    btns.innerHTML = '';
    const ok = document.createElement('button');
    ok.textContent = okText;
    ok.addEventListener('click', () => { hideModal(); onOk && onOk(); });
    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.className = 'ghost';
    cancel.addEventListener('click', hideModal);
    btns.appendChild(ok); btns.appendChild(cancel);
    G.U.$('modal-generic').classList.remove('hidden');
  }
  function hideModal() { G.U.$('modal-generic').classList.add('hidden'); }

  // ---------- 游戏说明(分页引导) ----------
  const TUT_PAGES = [
    {
      title: '❓ 游戏说明 1/6 · 你的目标',
      html: `你是拓荒队的<b>造物主</b>。带领居民在蛮荒大陆上选址安家,
        把一座小村落逐步经营成<b>人口 300、幸福安乐的伟大城市</b>。<br><br>
        右侧「目标」面板列出了 <b>11 个发展里程碑</b>(铺路 → 建房开田 → 人口 20 →
        晋升城镇 → 开疆拓土 → 建造大学……),跟着它走就不会迷路。<br>
        每达成一个目标都会放礼花提示。<br><br>
        <span class="dim">居民会自己走路、干活、生老病死、结婚生子——你要做的是为他们排布好家园。</span>`,
    },
    {
      title: '❓ 游戏说明 2/6 · 先修路,再建房',
      html: `<b>道路是这座城市的命脉</b>:所有服务类建筑(酒馆、药草屋、教堂……)
        必须<b>毗邻道路</b>,居民才能沿路前来使用。没有路,建筑就是摆设。<br><br>
        推荐开局三步:<br>
        ① 从市政厅向外铺一条「土路」(可按住鼠标拖动连画);<br>
        ② 沿路建 3~5 座<b>木屋</b>(住房);<br>
        ③ 在沃土上开 2~3 块 <b>2×2 农田</b>。<br><br>
        地块有讲究:农田在<b>沃土</b>(深褐色)上产量更高,临水 +15%;
        伐木场要贴着森林,采石场要找岩石堆,猎人小屋要找林缘/水边的<b>兽径</b>。<br><br>
        <b>自然资源是会再生的</b>:森林会被砍稀、矿脉会被采空、猎场的动物会变少,
        但它们都会按季节自己长回来(悬浮在资源格上可以看到蓄积)。`,
    },
    {
      title: '❓ 游戏说明 3/6 · 居民的五种需求',
      html: `每位居民每天都需要:<br>
        🌾 <b>食物</b>——农场产出,全城共享,断粮会饿死人;<br>
        🏠 <b>住房</b>——无家可归者幸福暴跌;<br>
        🎭 <b>娱乐</b>——酒馆/市集广场/剧院,按服务容量每日接待;<br>
        ⚕️ <b>医疗</b>——药草屋/诊疗所提供覆盖,病人会被优先救治;<br>
        ⛪ <b>信仰</b>——「城镇」阶段后生效,教堂/大圣堂。<br><br>
        五项加权就是<b>幸福度</b>:高于 70 会来移民和新生儿,低于 30 居民会弃城而去。<br>
        <b>右下角「覆盖层」</b>切到娱乐/医疗/信仰,红色住宅就是被遗漏的居民——这是规划神器。`,
    },
    {
      title: '❓ 游戏说明 4/6 · 经济与四季',
      html: `💰 <b>收入</b>:人口税金 × 幸福系数(幸福 100% 时约 1.5 倍),学堂/大学再加成;<br>
        💸 <b>支出</b>:建造费 + 服务建筑维护费(顶栏实时显示)。<br><br>
        一年四季各 20 天,农田产量:春 95% / 夏 110% / <b>秋 130%</b> / <b>冬 10%</b>。
        <b>冬季前务必囤粮</b>,或建冬天仍产 70% 的牧场(城镇阶段)。<br><br>
        仓储有上限:谷仓加粮仓容量、仓库加木石容量;交易所会自动卖掉盈余换金币、缺粮时自动回购。<br><br>
        <b>看不出来有没有收入?</b>建筑头顶每天会飘出真实产出数字(🪵+7.2 这种),
        顶栏资源数会绿闪/红闪,右侧「城市」页还有<b>本日资源流向</b>与<b>可再生资源</b>两张表
        (逐项列出产出/消耗/浪费/净变化),顶栏中间是当前目标与进度,点开能看到全部 11 个里程碑。
        如果某个生产建筑<b>无人上工</b>,面板会直接写明原因。`,
    },
    {
      title: '❓ 游戏说明 5/6 · 阶段 · 领地 · 灾祸',
      html: `🏘️ <b>晋升阶段</b>:人口与幸福达标后,顶栏会出现发光的「晋升」按钮——
        城镇解锁石屋/教堂/学堂等,城市解锁剧院/大学/大圣堂与外环领地。<br>
        🗺️ <b>开疆</b>:点击地图上的暗色区块,花金币解锁新领地。<br><br>
        ⚠️ 标准难度有灾祸:<b>瘟疫</b>(靠医疗覆盖与水井)、<b>火灾</b>(水井圈内的建筑免疫)、
        <b>盗匪</b>(治安所震慑)、<b>暴风雪</b>(耗粮激增)。躲不过就提前布防。<br>
        <span class="dim">选沙盒难度则只有丰收、商队、移民潮等好事。</span>`,
    },
    {
      title: '❓ 游戏说明 6/6 · 操作速查',
      html: `<table>
        <tr><th>操作</th><th>方式</th></tr>
        <tr><td>移动视角</td><td>左键拖动 / WASD / 方向键 / 点击小地图</td></tr>
        <tr><td>缩放</td><td>鼠标滚轮</td></tr>
        <tr><td>建造</td><td>左侧选建筑 → 左键放置(道路可拖动连画)</td></tr>
        <tr><td>拆除</td><td>左下「💥 拆除」工具或按 B,返还一半资源</td></tr>
        <tr><td>取消工具</td><td>右键 / ESC</td></tr>
        <tr><td>暂停 / 速度</td><td>空格暂停;数字键 1 / 2 / 3 切 1~3 倍速(顶栏同款)</td></tr>
        <tr><td>查看建筑</td><td>选择工具下点击建筑(会显示昨日实际产出与停产原因)</td></tr>
        <tr><td>查看居民</td><td><b>点击任何一个走动的人</b>,右侧会显示他的职业与当前任务</td></tr>
        <tr><td>查看资源</td><td>鼠标悬浮在森林/岩石/猎场上,会显示蓄积与生长速度</td></tr>
        <tr><td>覆盖层</td><td>右下角下拉切换</td></tr>
      </table>
      顶栏的「❓ 说明」随时可以重新打开本向导。祝你的王国繁荣昌盛!`,
    },
  ];
  let tutPage = 0;

  function showTutorial(page = 0) {
    tutPage = G.U.clamp(page, 0, TUT_PAGES.length - 1);
    const p = TUT_PAGES[tutPage];
    const last = tutPage === TUT_PAGES.length - 1;
    G.U.$('modal-title').textContent = p.title;
    const dots = TUT_PAGES.map((_, i) =>
      `<span class="tut-dot${i === tutPage ? ' on' : ''}"></span>`).join('');
    const auto = `<label class="tut-auto"><input type="checkbox" id="tut-auto-off" ${G.U.store.get('tc_tut_off') ? '' : 'checked'}> 进入游戏时自动打开本说明</label>`;
    G.U.$('modal-content').innerHTML = p.html + `<div class="tut-dots">${dots}</div>` + auto;
    const btns = G.U.$('modal-btns');
    btns.innerHTML = '';
    if (tutPage > 0) {
      const prev = document.createElement('button');
      prev.textContent = '上一步';
      prev.className = 'ghost';
      prev.addEventListener('click', () => showTutorial(tutPage - 1));
      btns.appendChild(prev);
    }
    const next = document.createElement('button');
    next.textContent = last ? '🏗️ 开始建设' : '下一步';
    next.addEventListener('click', () => {
      persistTutChoice();
      if (last) hideModal(); else showTutorial(tutPage + 1);
    });
    btns.appendChild(next);
    if (tutPage === 0) {
      const skip = document.createElement('button');
      skip.textContent = '跳过';
      skip.className = 'ghost';
      skip.addEventListener('click', () => { persistTutChoice(); hideModal(); });
      btns.appendChild(skip);
    }
    G.U.$('modal-generic').classList.remove('hidden');
  }

  function persistTutChoice() {
    const cb = document.getElementById('tut-auto-off');
    if (!cb) return;
    if (cb.checked) G.U.store.remove('tc_tut_off');
    else G.U.store.set('tc_tut_off', '1');
  }

  function showHelp() {
    showTutorial(0);
  }

  function showWin() {
    G.U.$('modal-title').textContent = '👑 伟大王国!';
    G.U.$('modal-content').innerHTML = `
      你的聚落已成长为人口 300、幸福安乐的伟大城市。<br>
      从一片荒野到炊烟万里——这是你亲手书写的拓城记。<br><br>
      <span class="dim">你可以继续自由经营,或开创新的一局。</span>`;
    const btns = G.U.$('modal-btns');
    btns.innerHTML = '';
    const ok = document.createElement('button');
    ok.textContent = '继续经营';
    ok.addEventListener('click', hideModal);
    btns.appendChild(ok);
    G.U.$('modal-generic').classList.remove('hidden');
  }

  function showStart() {
    G.U.$('modal-start').classList.remove('hidden');
    G.U.$('btn-start-continue').classList.toggle('hidden', !G.SV.hasAny());
    G.uiPaused = true;
  }
  function hideStart() {
    G.U.$('modal-start').classList.add('hidden');
    G.uiPaused = false;
  }

  // ---------- 事件横幅:重大事件发生时给一段"读得完"的说明 ----------
  function banner(icon, title, text, type) {
    const el = G.U.$('banner');
    if (!el) return;
    el.className = 'banner-' + (type || 'info');
    el.innerHTML = `<div class="bn-icon">${icon}</div>
      <div class="bn-body"><div class="bn-title">${G.U.esc(title)}</div><div class="bn-text">${G.U.esc(text)}</div></div>
      <button class="bn-close" title="关闭">✕</button>`;
    el.classList.remove('hidden');
    el.querySelector('.bn-close').addEventListener('click', hideBanner);
    clearTimeout(bannerT);
    bannerT = setTimeout(hideBanner, type === 'bad' ? 12000 : 7000);
  }
  function hideBanner() { const el = G.U.$('banner'); if (el) el.classList.add('hidden'); }

  // 重大事件自动暂停(默认开;可在「城市」页关闭并记住选择)
  function autoPauseOnEvent() {
    const v = G.U.store.get('tc_autopause');
    return v === null ? !!G.CFG.ECON.autoPauseEvent : v === '1';
  }

  // ---------- 季节前瞻:入秋时对整个冬季的粮食收支做一次近似估算 ----------
  // 只在每年入秋当天提示一次:state.warnedAutumn 记录已提示的年份
  // (老存档没有该字段 → 视为今年还没提示过,只弹一次,不会重复刷屏)。
  // 估算口径(仅 UI 提示,不参与结算):
  //   需求 ≈ 人口 × 日耗粮 × 冬季倍数(winterFood=1.25) × 冬季天数(未含暴风雪 +30%);
  //   产出 ≈ 农田按冬季系数折算(牧场用 winterKeep=0.7,普通农田 0.1,保留沃土/水域加成),
  //          猎人等非农田按昨日实际交付延续;再减去当前库存即为缺口。
  function winterFoodOutlook() {
    const winter = G.CFG.SEASONS[3];
    const pm = G.E.prodMult();
    let prodDaily = 0;
    for (const b of G.B.producers()) {
      if (!b.def.produce || !b.def.produce.food || b.eff <= 0) continue;
      if (b.def.farm) {
        let f = b.def.winterKeep || winter.farmMult;
        if (b.def.fertileBonus) f *= 1 + b.fertileTiles * b.def.fertileBonus;
        if (b.water && b.def.waterBonus) f *= 1 + b.def.waterBonus;
        prodDaily += b.def.produce.food * b.eff * f * pm;
      } else {
        prodDaily += (b.lastOut && b.lastOut.food) || 0; // 猎人等:按昨日实际交付近似
      }
    }
    return prodDaily;
  }

  function autumnForecast() {
    const s = G.sim.state;
    if (G.sim.seasonIdx() !== 2) return;              // 只在秋天提示
    if (s.warnedAutumn === G.sim.year()) return;      // 今年入秋已提示过
    s.warnedAutumn = G.sim.year();
    const winterDays = G.CFG.ECON.daysPerSeason;
    const left = winterDays - G.sim.dayOfSeason();
    const pop = G.res.length;
    const needTotal = pop * G.CFG.ECON.foodPer * G.CFG.ECON.winterFood * winterDays;
    const prodTotal = winterFoodOutlook() * winterDays;
    const stock = s.food;
    const gap = Math.max(0, Math.round(needTotal - prodTotal - stock));
    const text = `入秋提示:距冬季还有 ${left} 天。按当前人口 ${pop} 估算,冬季 ${winterDays} 天约需粮 ${Math.round(needTotal)},`
      + `预计产出约 ${Math.round(prodTotal)},当前库存 ${Math.round(stock)},`
      + (gap > 0 ? `预计缺口约 ${gap}。` : '预计可以过冬。')
      + (gap > 0
        ? '建议:趁秋季囤粮,多建农田/牧场(冬季仍产 70%),建谷仓扩大储量;若遇暴风雪耗粮还会 +30%。'
        : '仍建议留些余量,以防暴风雪与人口增长。');
    banner(gap > 0 ? '❄️' : '🍂', gap > 0 ? '冬季将至,预计有粮食缺口' : '冬季将至,粮草无忧', text, gap > 0 ? 'bad' : 'good');
    log(`🍂 ${text}`, gap > 0 ? 'bad' : 'good');
  }

  // ---------- 每日钩子 ----------
  function onDayTick() {
    buildAlerts();
    autumnForecast();
    G.RD.newDay();
    if (G.RD.dayFloats) G.RD.dayFloats(); // 刚结算完的产出飘在建筑头顶
    if (goalOpen) renderGoalDrop();       // 里程碑下拉开着时同步刷新进度
    renderPanel();
    updateHUD(true);
  }

  // 新游戏/读档后的界面复位
  function resetForGame() {
    selected = null; selectedRes = null; selZone = null;
    prevStocks = null;
    goalCache = ''; goalOpen = false;
    G.U.$('goal-drop').classList.add('hidden');
    logs.length = 0;
    hideBanner();
    hideHover();
    setTool('select');
    curCat = 'infra';
    buildPaletteTabs();
    document.querySelectorAll('#panel-tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === 'info'));
    tab = 'info';
    renderPanel();
    G.U.$('overlay-mode').value = 'none';
    overlay = 'none';
    setSpeed(G.CFG.ECON.defaultSpeed || 1);
    hideStart();
    ['topbar', 'palette', 'sidepanel', 'minimap-wrap', 'overlay-sel', 'alerts'].forEach(id =>
      G.U.$(id).classList.remove('hidden'));
    updateHUD(true);
  }

  return {
    init, tool, setTool, onCanvasClick, paintAt, updateHUD, refreshPalette,
    renderPanel, toast, log, showHelp, showTutorial, showWin, showStart, hideStart,
    onDayTick, resetForGame, modalConfirm,
    setSpeed, getSpeed, togglePause, hoverAt, hideHover, banner, hideBanner, autoPauseOnEvent,
    get selected() { return selected; },
    get selectedResident() { return selectedRes; },
    get overlay() { return overlay; },
    get logCount() { return logs.length; },
  };
})();
