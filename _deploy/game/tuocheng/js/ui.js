// ===== 界面系统:HUD、建造面板、信息面板、弹窗、交互 =====
G.UI = (() => {
  const tool = { mode: 'select', key: null };
  let selected = null;
  let selZone = null;
  let tab = 'info';
  let overlay = 'none';
  let curCat = 'infra';
  const logs = [];
  let hudT = 0;

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
  }

  function setSpeed(v) {
    G.sim.speed = v;
    document.querySelectorAll('.speed-group button').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.speed) === v));
  }

  function togglePause() {
    setSpeed((G.sim.speed || 0) === 0 ? 1 : 0);
  }

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
    G.U.$('chip-date').innerHTML = `${season.icon} ${season.name}${G.sim.dayOfSeason()}日 · ${G.sim.year()}年 · 第${s.day}天`;
    G.U.$('chip-gold').innerHTML = `💰 <b>${G.U.fmt(s.gold)}</b>`;
    G.U.$('chip-wood').innerHTML = `🪵 <b>${G.U.fmt(s.wood)}</b>/${G.U.fmt(s.caps.wood)}`;
    G.U.$('chip-stone').innerHTML = `🪨 <b>${G.U.fmt(s.stone)}</b>/${G.U.fmt(s.caps.stone)}`;
    foodEl.innerHTML = `🌾 <b>${G.U.fmt(s.food)}</b>/${G.U.fmt(s.caps.food)}`;
    foodEl.style.color = starving ? '#e07a6a' : '';
    G.U.$('chip-pop').innerHTML = `👥 <b>${G.res.length}</b>/${G.R.housingCap()}`;
    G.U.$('chip-hap').innerHTML = `${face} 幸福 <b>${hap}%</b>`;
    const ready = G.sim.stageReady();
    const bs = G.U.$('btn-stage');
    if (ready) {
      bs.classList.remove('hidden');
      bs.textContent = `⬆ 晋升${ready.name}(${ready.cost}金)`;
    } else bs.classList.add('hidden');
    updateAfford();
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
    if (d.housing) {
      const occ = (b.resIds || []).length;
      html += `<h4>住户 ${occ}/${d.housing}</h4>
        <div class="row"><span class="k">舒适度</span><span class="v">${d.comfort}</span></div>`;
    }
    if (d.workers) {
      html += `<h4>员工 ${b.staff.length}/${d.workers}</h4>` + bar(b.eff * 100, '#6aa84f');
      if (b.eff < 1) html += `<div class="warn">人手不足,效率 ${Math.round(b.eff * 100)}%</div>`;
    }
    if (d.produce) {
      for (const k in d.produce) {
        const eff = d.farm ? G.E.farmFactor(b) : 1;
        html += `<div class="row"><span class="k">每日产量${d.farm ? '(含季节/地块)' : ''}</span><span class="v">${(d.produce[k] * b.eff * eff * G.E.prodMult()).toFixed(1)}</span></div>`;
        if (d.farm && b.fertileTiles) html += `<div class="row"><span class="k">肥沃土加成</span><span class="v good">+${Math.round(b.fertileTiles * d.fertileBonus * 100)}%</span></div>`;
        if (d.farm && b.water) html += `<div class="row"><span class="k">临水加成</span><span class="v good">+15%</span></div>`;
        if (d.forestBonus) html += `<div class="row"><span class="k">毗邻森林</span><span class="v">${b.forest} 格 (+${(b.forest * d.forestBonus).toFixed(1)})</span></div>`;
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
    if (d.upkeep) html += `<div class="row"><span class="k">维护费</span><span class="v">💰 ${d.upkeep}/天</span></div>`;
    html += d.noBuild ? '' : `<button class="panel-btn" data-action="demolish">💥 拆除(返还一半)</button>`;
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
      <div class="row"><span class="k">⛪ 信仰</span><span class="v ${cov('faith') < 70 ? 'warn' : ''}">${cov('faith')}%</span></div>
      <h4>财政</h4>
      <div class="row"><span class="k">昨日税金</span><span class="v">💰 ${Math.round(G.sim.state.lastTax)}</span></div>
      <div class="row"><span class="k">昨日维护</span><span class="v">💰 ${Math.round(G.sim.state.lastUpkeep)}</span></div>`;
    return html;
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
        伐木场要贴着森林,采石场要找岩石堆。`,
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
        仓储有上限:谷仓加粮仓容量、仓库加木石容量;交易所会自动卖掉盈余换金币、缺粮时自动回购。`,
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
        <tr><td>暂停 / 加速</td><td>空格;顶栏 ▶▶▶ 最高四倍速</td></tr>
        <tr><td>查看建筑</td><td>选择工具下点击建筑</td></tr>
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
    const auto = `<label class="tut-auto"><input type="checkbox" id="tut-auto-off" ${localStorage.getItem('tc_tut_off') ? '' : 'checked'}> 进入游戏时自动打开本说明</label>`;
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
    if (cb.checked) localStorage.removeItem('tc_tut_off');
    else localStorage.setItem('tc_tut_off', '1');
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

  // ---------- 每日钩子 ----------
  function onDayTick() {
    buildAlerts();
    G.RD.newDay();
    renderPanel();
    updateHUD(true);
  }

  // 新游戏/读档后的界面复位
  function resetForGame() {
    selected = null; selZone = null;
    logs.length = 0;
    setTool('select');
    curCat = 'infra';
    buildPaletteTabs();
    document.querySelectorAll('#panel-tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === 'info'));
    tab = 'info';
    renderPanel();
    G.U.$('overlay-mode').value = 'none';
    overlay = 'none';
    setSpeed(1);
    hideStart();
    ['topbar', 'palette', 'sidepanel', 'minimap-wrap', 'overlay-sel', 'alerts'].forEach(id =>
      G.U.$(id).classList.remove('hidden'));
    updateHUD(true);
  }

  return {
    init, tool, setTool, onCanvasClick, paintAt, updateHUD, refreshPalette,
    renderPanel, toast, log, showHelp, showTutorial, showWin, showStart, hideStart,
    onDayTick, resetForGame, modalConfirm,
    get selected() { return selected; },
    get overlay() { return overlay; },
  };
})();
