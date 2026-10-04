/* 星穹拓荒 — UI/UX 层：HUD、面板、弹窗、输入、星图与结算 */
window.SF = window.SF || {};
SF.ui = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const D = SF.data;
  const U = 34;

  const st = {
    game: null,            // 当前对局
    placing: null,         // {typeId}
    ghost: null,           // {x,y,ok,why,typeId}
    marker: null,
    selB: null,            // 选中建筑 id
    choiceOpen: null,
    lastRes: {},
    hudAcc: 0, miniAcc: 0, infoAcc: 0,
    pending: null,         // 星图阶段参数 {mode,difficulty,seed,galaxy,...}
    gSel: -1, gHov: -1,
    drag: null, keys: {},
    moved: 0, downPos: null,
    pinch: null,
    menuCv: null, galaxyCv: null,
  };

  /* ================= 工具 ================= */
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function hms(sec) {
    const day = Math.floor(sec / 180) + 1;
    const ph = (sec % 180) / 180;
    const hh = String(Math.floor(ph * 24)).padStart(2, '0');
    const mm = String(Math.floor((ph * 24 % 1) * 60)).padStart(2, '0');
    return { day, clock: hh + ':' + mm };
  }
  function toast(txt, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = txt;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => el.remove(), 3100);
    while (box.children.length > 4) box.firstChild.remove();
  }

  /* ================= 屏幕切换 ================= */
  function showScreen(name) {
    for (const s of ['screen-menu', 'screen-galaxy', 'screen-sandbox', 'screen-archive']) {
      $(s).style.display = s === name ? '' : 'none';
    }
    $('hud').style.display = name === '__game__' ? '' : 'none';
    $('game-canvas').style.visibility = name === '__game__' ? 'visible' : 'hidden';
    // 跨屏清理浮层
    if (name !== '__game__') {
      for (const id of ['screen-settle', 'modal', 'settings-modal', 'help-modal', 'site-select', 'pause-cover', 'warp-fx']) {
        $(id).style.display = 'none';
      }
    }
    SF.app.state = name === '__game__' ? 'game'
      : name === 'screen-menu' ? 'menu'
      : name === 'screen-galaxy' ? 'galaxy'
      : name === 'screen-sandbox' ? 'sandbox' : 'archive';
  }

  function showMenu() {
    st.game = null;
    showScreen('screen-menu');
    const m = SF.meta.data;
    const lv = Math.min(99, 1 + Math.floor(m.legacyTotal / 100));
    $('menu-footer').textContent = '探索者档案 Lv.' + lv + ' · 遗产点 ' + m.legacy + ' · 成就 ' +
      Object.keys(m.achv).length + '/' + D.ACHIEVEMENTS.length + ' · 已拓荒 ' + m.playCount + ' 局';
    $('btn-continue').style.display = SF.meta.getRun() ? '' : 'none';
    SF.audio.stopAmbient();
  }

  /* ================= 难度选择 ================= */
  function pickDifficulty(mode, cb) {
    const forced = SF.meta.data.playCount < 3 && mode === 'campaign';
    if (forced) {
      toast('新手护航：前 3 局使用低威胁星区', 'good');
      cb(1);
      return;
    }
    const diffs = [
      [1, '新手', '威胁 1-2 · 宽松事件', '适合第一次接触'],
      [2, '标准', '威胁 2-5 · 标准节奏', '推荐体验方式'],
      [3, '资深', '威胁 4-7 · 事件频繁', '有策略功底再来'],
      [4, '严酷', '威胁 6-9 · 步步杀机', '资源永远不够'],
      [5, '地狱', '威胁 8-9 · 地狱开局', '主播挑战专用'],
    ];
    const opts = diffs.map(d => ({
      label: d[1] + '难度（威胁上限 ' + [2, 5, 7, 9, 9][d[0] - 1] + '）',
      note: d[2] + ' — ' + d[3],
      cb: () => cb(d[0]),
    }));
    showModal({
      tag: '难度选择', tagClass: 'good', title: '选择远征难度',
      body: '永久死亡规则自选定之时生效。连续失败会小幅降低事件强度（动态难度保护，最多 -30%）。',
      options: opts, noClose: false,
    });
  }

  /* ================= 星图选站 ================= */
  function showGalaxy(pending) {
    st.pending = pending;
    st.gSel = pending.mode === 'sandbox' ? 0 : -1;
    // 显示用威胁等级（长征/无尽按难度与站数推算）
    if (pending.threat > 0) pending.dispThreat = pending.threat;
    else {
      const base = [1, 2, 4, 6, 8][clamp(pending.difficulty || 2, 1, 5) - 1];
      pending.dispThreat = Math.round(clamp(base + ((pending.station || 1) - 1) * 0.7 - (pending.threatDown || 0), 1, 9));
    }
    showScreen('screen-galaxy');
    const g = pending.galaxy;
    $('galaxy-station').textContent = (pending.mode === 'endless' ? '深空漫游 · 第 ' : '第 ') +
      (pending.station || 1) + (pending.mode === 'weekly' ? ' / 3 站' : pending.mode === 'campaign' ? ' / 9 站' : ' 站');
    $('galaxy-seed').textContent = '种子: ' + pending.seed;
    updateGalaxyPanel();
  }

  function updateGalaxyPanel() {
    const p = st.pending;
    if (!p || st.gSel < 0) {
      $('planet-name').textContent = '点击行星进行扫描';
      $('planet-type').textContent = '——';
      $('env-list').innerHTML = '<div class="scan-hint">扫描其他行星可以对比环境参数</div>';
      $('goal-desc').textContent = p ? p.galaxy.goal.text : '——';
      $('btn-land').disabled = true;
      drawRadar(null);
      return;
    }
    const pl = p.galaxy.planets[st.gSel];
    $('planet-name').textContent = pl.name + (pl.main ? ' ★ 主星' : '（伴星）');
    $('planet-type').textContent = pl.typeName + ' · ' + D.PLANETS.find(t => t.id === pl.typeId).trait;
    let html = '';
    for (const ek of D.ENV_KEYS) {
      const v = pl.env[ek.k];
      const col = (ek.good === 'low' && v > 60) || (ek.good === 'high' && v < 30) ? '#E8465A'
        : (ek.good === 'low' && v > 40) || (ek.good === 'high' && v < 45) ? '#FF8A3D' : '#7DD871';
      html += '<div class="env-item"><span>' + ek.name + '</span><div class="env-bar"><i style="width:' + v + '%;background:' + col + '"></i></div><b class="env-val">' + v + '</b></div>';
    }
    html += '<div class="env-item"><span>预估威胁</span><div class="env-bar"><i style="width:' + (st.pending.dispThreat * 11) + '%;background:#FF8A3D"></i></div><b class="env-val">' + st.pending.dispThreat + '</b></div>';
    $('env-list').innerHTML = html;
    $('goal-desc').textContent = p.galaxy.goal.text;
    $('btn-land').disabled = false;
    $('btn-land').textContent = st.gSel === 0 ? '选择该行星降落' : '降落于伴星（更艰难）';
    drawRadar(pl);
  }

  function drawRadar(pl) {
    const cv = $('radar-canvas'), c = cv.getContext('2d');
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2 + 6, R = 66;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(53,224,214,.25)';
    for (let ring = 1; ring <= 3; ring++) {
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const rr = R * ring / 3;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    if (!pl) {
      c.fillStyle = 'rgba(138,151,199,.6)'; c.font = '12px sans-serif'; c.textAlign = 'center';
      c.fillText('等待扫描数据…', cx, cy);
      return;
    }
    const vals = D.ENV_KEYS.map(ek => pl.env[ek.k] / 100);
    c.beginPath();
    vals.forEach((v, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const x = cx + Math.cos(a) * R * v, y = cy + Math.sin(a) * R * v;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
    c.fillStyle = 'rgba(53,224,214,.18)'; c.fill();
    c.strokeStyle = '#35E0D6'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = 'rgba(138,151,199,.9)'; c.font = '10px sans-serif';
    const labels = ['重力', '大气', '温度', '辐射', '矿藏', '有机'];
    labels.forEach((lb, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      c.fillText(lb, cx + Math.cos(a) * (R + 15) - 9, cy + Math.sin(a) * (R + 15) + 3);
    });
  }

  function openSiteSelect() {
    const p = st.pending;
    const pl = p.galaxy.planets[st.gSel];
    if (!pl) return;
    // 为选定行星生成地表与降落点
    const map = SF.gen.map(p.seed + (st.gSel > 0 ? '|sat' + st.gSel : ''), pl, p.station || 1);
    p.chosenPlanet = pl; p.chosenMap = map;
    const cards = $('site-cards');
    cards.innerHTML = '';
    map.sites.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'site-card';
      el.innerHTML = '<h4>' + ['A', 'B', 'C'][i] + ' · ' + s.name + '</h4><ul>' +
        '<li>' + s.blurb + '</li>' +
        '<li>⛏ 附近矿脉：' + s.oreNear + ' 处</li>' +
        '<li>❦ 附近有机质：' + s.orgNear + ' 处</li></ul>';
      el.onclick = () => { SF.audio.click(); launchFromSite(i); };
      cards.appendChild(el);
    });
    $('site-select').style.display = 'flex';
  }

  function launchFromSite(siteIdx) {
    const p = st.pending;
    $('site-select').style.display = 'none';
    const isSat = st.gSel > 0;
    if ((p.station || 1) === 1) SF.app.runBest = 0;
    const g = new SF.Game({
      mode: p.mode, seed: p.seed + (isSat ? '|sat' + st.gSel : ''), station: p.station || 1,
      difficulty: p.difficulty, threat: p.mode === 'sandbox' ? p.threat : 0,
      resMul: p.resMul || 1, eventsOn: p.eventsOn !== false,
      carry: p.carry || null, carriedTechs: p.carriedTechs || [],
      warps: p.warps || 0, threatDown: p.threatDown || 0, weekly: p.mode === 'weekly',
      planet: isSat ? p.chosenPlanet : null, map: isSat ? p.chosenMap : null,
    });
    g.setSite(siteIdx);
    enterGame(g);
    if (SF.meta) {
      SF.meta.data.playCount++;
      SF.meta.save();
    }
  }

  /* ================= 进入对局 ================= */
  function enterGame(g) {
    st.game = g;
    st.placing = null; st.ghost = null; st.selB = null; st.choiceOpen = null;
    st.settled = false;
    g._entById = (id) => g.beasts.find(k => k.id === id) || g.pirates.find(p => p.id === id);
    showScreen('__game__');
    closeAllPanels();
    SF.audio.init();
    SF.audio.startAmbient();
    // 相机初始化
    g.cam.x = g.site.x; g.cam.y = g.site.y; g.cam.zoom = Math.min(1.1, Math.max(0.7, innerWidth / 2200));
    $('event-ticker').innerHTML = '';
    $('tut-panel').style.display = g.tutActive ? '' : 'none';
    toast('已在『' + g.galaxy.sysName + ' ' + ['I', 'II', 'III', 'IV'][g.station - 1 >= 4 ? 3 : g.station - 1] + '』降落', 'good');
    if (g.tutActive) renderTut();
    // 第一次游玩：自动弹出操作说明（打开即暂停，关闭后继续教学）
    if (SF.meta && SF.meta.data.playCount === 0 && !g.carry) {
      openHelp('ctrl');
      g.pauseReasons.settings = 1;
    }
  }

  /* ================= 面板管理 ================= */
  function pauseIfPanel(on) {
    const g = st.game;
    if (!g) return;
    if (on) g.pauseReasons.panel = 1;
    else delete g.pauseReasons.panel;
  }
  function anyModal() {
    for (const id of ['modal', 'settings-modal', 'help-modal', 'screen-settle']) {
      if ($(id).style.display !== 'none') return true;
    }
    return false;
  }
  function togglePanel(id) {
    const el = $(id);
    const show = el.style.display === 'none' || !el.style.display;
    closeAllPanels();
    if (show) {
      el.style.display = 'flex';
      pauseIfPanel(true);
      if (id === 'panel-build') renderBuild();
      if (id === 'panel-tech') renderTech();
      if (id === 'panel-log') renderLog();
      SF.audio.click();
    }
  }
  function closeAllPanels() {
    for (const id of ['panel-build', 'panel-tech', 'panel-info', 'panel-log']) $(id).style.display = 'none';
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('on'));
    cancelPlacing();
    pauseIfPanel(false);
  }
  function cancelPlacing() {
    st.placing = null; st.ghost = null;
    document.querySelectorAll('.build-item').forEach(b => b.classList.remove('sel'));
  }

  /* ================= 建造面板 ================= */
  function renderBuild() {
    const g = st.game;
    const cats = $('build-cats');
    if (!cats.children.length) {
      for (const c of D.BUILD_CATS) {
        const b = document.createElement('button');
        b.className = 'bcat' + (c.id === 'prod' ? ' active' : '');
        b.textContent = c.name;
        b.dataset.cat = c.id;
        b.onclick = () => {
          cats.querySelectorAll('.bcat').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          renderBuildList(c.id);
          SF.audio.click();
        };
        cats.appendChild(b);
      }
    }
    renderBuildList('prod');
    function renderBuildList(cat) {
      const list = $('build-list');
      list.innerHTML = '';
      for (const id in D.BUILDINGS) {
        const def = D.BUILDINGS[id];
        if (def.cat !== cat) continue;
        if (id === 'beacon' && g.goal.type !== 'beacon' && g.buildings.some(b => b.type === 'beacon')) continue;
        const cost = g.costOf(id);
        const afford = g.canAfford(cost);
        const uniqueDone = def.unique && g.buildings.some(b => b.type === id);
        const el = document.createElement('div');
        el.className = 'build-item' + (afford && !uniqueDone ? '' : ' lock');
        el.innerHTML = '<div class="bi-ico">' + def.icon + '</div><div class="bi-mid">' +
          '<div class="bi-name">' + def.name + (uniqueDone ? ' <span class="dim">（已建造）</span>' : '') + '</div>' +
          '<div class="bi-desc">' + def.desc + '</div>' +
          '<div class="bi-cost">' + costHtml(cost, g) + ' · ⏱' + Math.round(def.buildTime / Math.max(0.01, g.mods.buildSpeed)) + 's · ❤' + Math.round(def.hp * g.mods.hpMul) + '</div></div>';
        if (!uniqueDone && afford) {
          el.onclick = () => {
            st.placing = { typeId: id };
            list.querySelectorAll('.build-item').forEach(x => x.classList.remove('sel'));
            el.classList.add('sel');
            SF.audio.click();
          };
        } else {
          el.onclick = () => { cancelPlacing(); SF.audio.err(); };
        }
        list.appendChild(el);
      }
    }
  }
  function costHtml(cost, g) {
    const names = { ore: '◆矿', organics: '❧有', energy: '⚡能', research: '✦研' };
    let h = '';
    for (const k in cost) {
      if (!cost[k]) continue;
      const ok = (g.res[k] || 0) >= cost[k];
      h += '<span class="' + (ok ? 'ok' : 'no') + '">' + names[k] + cost[k] + '</span> ';
    }
    return h || '<span class="dim">免费</span>';
  }

  /* ================= 科技面板 ================= */
  function renderTech() {
    const g = st.game;
    $('tech-have').textContent = '（已研究 ' + g.researched.length + '）';
    const cols = $('tech-cols');
    cols.innerHTML = '';
    for (const bid in D.BRANCHES) {
      const br = D.BRANCHES[bid];
      const col = document.createElement('div');
      col.className = 'tech-col';
      col.innerHTML = '<h5 style="background:rgba(0,0,0,.25);color:' + br.color + '">' + br.name + '系</h5>';
      const ids = g.availTechs[bid] || [];
      for (const tid of ids) {
        const t = D.TECHS.find(x => x.id === tid);
        const state = g.techState(t);
        const el = document.createElement('div');
        el.className = 'tech-item ' + state;
        el.innerHTML = '<div class="t-name">' + t.name + '</div><div class="t-desc">' + t.desc + '</div>' +
          '<div class="t-cost">' + (state === 'done' ? '✓ 已掌握' : state === 'lock' ? '需先研究前置' : '✦ ' + t.cost +
            (g.res.research >= t.cost ? '' : '（不足）')) + '</div>';
        if (state === 'avail') {
          el.onclick = () => { if (g.research(t.id)) { renderTech(); } };
        }
        col.appendChild(el);
      }
      cols.appendChild(col);
    }
  }

  /* ================= 日志面板 ================= */
  function renderLog() {
    const g = st.game;
    const list = $('log-list');
    list.innerHTML = g.log.slice(-40).reverse().map(l => {
      const t = hms(l.t);
      return '<div class="log-item ' + (l.kind || '') + '"><span class="lt">第' + t.day + '天 ' + t.clock + '</span>' + l.txt + '</div>';
    }).join('');
    SF.meta && (SF.meta.ui.logSeen = g.log.length);
  }

  /* ================= 建筑详情 ================= */
  function showBuildingInfo(b) {
    st.selB = b.id;
    const g = st.game;
    const def = b.def;
    let rows = '';
    rows += kv('耐久', Math.ceil(b.hp) + ' / ' + Math.round(b.maxHp));
    if (def.workers > 0) rows += kv('岗位', b.assigned + ' / ' + def.workers + '（效率 ' + Math.round(b.eff * 100) + '%）');
    for (const k in def.produce) rows += kv('产出 · ' + resName(k), '+' + (def.produce[k] * (b.eff || 1) * prodMul(g, k)).toFixed(2) + '/s');
    for (const k in def.upkeep) rows += kv('维护 · ' + resName(k), '-' + def.upkeep[k].toFixed(2) + '/s');
    if (def.popCap) rows += kv('人口容量', '+' + def.popCap);
    if (def.morale) rows += kv('士气', '+' + def.morale);
    if (def.shield) rows += kv('护盾', Math.ceil(b.shield) + '/' + Math.round(b.shieldMax));
    if (def.combat) rows += kv('火力', def.combat.dps + ' DPS · 射程 ' + def.combat.range);
    if (b.type === 'beacon') rows += kv('充能', b.charged ? '已完成' : Math.floor(b.charge / (def.chargeTime * g.mods.beaconCharge) * 100) + '%');
    $('info-title').textContent = def.icon + ' ' + def.name;
    $('info-body').innerHTML = '<div class="hp-bar"><i style="width:' + (b.hp / b.maxHp * 100) + '%"></i></div>' + rows +
      '<div class="info-btns">' +
      (b.hp < b.maxHp ? '<button class="btn btn-small" id="ib-repair">修复（' + Math.ceil((b.maxHp - b.hp) * 0.25) + ' 矿石）</button>' : '') +
      (b.type !== 'command' ? '<button class="btn btn-small danger-btn" id="ib-salvage">拆除（返还 50%）</button>' : '') +
      '</div><div class="dim" style="font-size:11.5px;margin-top:8px">' + def.desc + '</div>';
    const rp = $('ib-repair');
    if (rp) rp.onclick = () => { g.repair(b.id); showBuildingInfo(b); };
    const sv = $('ib-salvage');
    if (sv) sv.onclick = () => {
      showModal({
        tag: '确认', title: '拆除 ' + def.name + '？',
        body: '将返还 50% 造价，此操作不可撤销。',
        options: [{ label: '确认拆除', cls: 'danger', cb: () => { g.salvage(b.id); closePanel('panel-info'); } },
                  { label: '取消', cb: null }],
      });
    };
    $('panel-info').style.display = 'flex';
    closeOtherThan('panel-info');
    pauseIfPanel(true);
  }
  function closePanel(id) { $(id).style.display = 'none'; pauseIfPanel(false); }
  function closeOtherThan(keep) {
    for (const id of ['panel-build', 'panel-tech', 'panel-log']) if (id !== keep) $(id).style.display = 'none';
  }
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function resName(k) { return { ore: '矿石', organics: '有机物', energy: '能源', research: '科研点' }[k] || k; }
  function prodMul(g, k) {
    const m = g.mods;
    if (k === 'ore') return m.mineYield;
    if (k === 'organics') return m.farmYield * (1 + g.planet.env.organic / 200);
    if (k === 'energy') return m.energyYield;
    if (k === 'research') return m.labYield;
    return 1;
  }

  /* ================= 弹窗 ================= */
  function showModal(cfg) {
    const g = st.game;
    $('modal-tag').textContent = cfg.tag || '事件';
    $('modal-tag').className = 'modal-tag ' + (cfg.tagClass || '');
    $('modal-tag').style.display = cfg.tag === '' ? 'none' : '';
    $('modal-title').textContent = cfg.title || '';
    $('modal-body').innerHTML = cfg.body || '';
    const opts = $('modal-opts');
    opts.innerHTML = '';
    (cfg.options || []).forEach(o => {
      const b = document.createElement('button');
      b.className = 'opt-btn ' + (o.cls || '');
      b.innerHTML = o.label + (o.note ? '<span class="o-note">' + o.note + '</span>' : '');
      b.onclick = () => {
        SF.audio.click();
        closeModal();
        if (o.cb) o.cb();
      };
      opts.appendChild(b);
    });
    $('modal').style.display = 'flex';
    $('modal').dataset.noClose = cfg.noClose ? '1' : '';
    if (g) g.pauseReasons.modal = 1;
  }
  function closeModal() {
    $('modal').style.display = 'none';
    const g = st.game;
    if (g) delete g.pauseReasons.modal;
  }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') && $('modal').dataset.noClose !== '1') closeModal();
  });

  /* 事件选择弹窗（游戏驱动） */
  function checkChoice() {
    const g = st.game;
    if (!g || !g.pendingChoice || st.choiceOpen === g.pendingChoice.id + g.stats.eventsTotal) return;
    st.choiceOpen = g.pendingChoice.id + g.stats.eventsTotal;
    const ch = g.pendingChoice, p = ch.payload;
    if (ch.id === 'merchant') {
      showModal({
        tag: '交易', tagClass: 'good', title: '流浪商人', noClose: true,
        body: '<div class="quote">"沙漠里的水比钻石贵，朋友。看看货吧。"</div>选择一项交易（每次到访限一次）或婉拒。',
        options: p.offers.map((o, i) => ({
          label: tradeLabel(o),
          note: '库存：' + Math.floor(g.res.ore) + ' 矿 / ' + Math.floor(g.res.organics) + ' 有机物 / ' + Math.floor(g.res.research) + ' 科研',
          cb: () => g.resolveChoice(i),
        })).concat([{ label: '挥手送客', note: '不进行交易', cb: () => g.resolveChoice(-1) }]),
      });
    } else if (ch.id === 'ruin') {
      showModal({
        tag: '探索', tagClass: 'good', title: '遗迹信号', noClose: true,
        body: '<div class="quote">规律性的脉冲从地下传来——这里曾有文明驻足。</div>派出探索队发掘遗迹可能获得大量科研点，也可能触发年久失修的防御机关。',
        options: [
          { label: '派出探索队（25% 风险）', note: '成功：科研点 +' + p.gainR + (g.mods.ruin ? '（遗迹解密已翻倍收益）' : '') + '；失败：失去 1 名殖民者', cb: () => g.resolveChoice(0) },
          { label: '不感兴趣', note: '继续殖民大业', cb: () => g.resolveChoice(-1) },
        ],
      });
    } else if (ch.id === 'migrant') {
      showModal({
        tag: '人口', tagClass: 'good', title: '移民船请求靠港', noClose: true,
        body: '<div class="quote">"我们的引擎撑不了多久了，收留我们。"</div>接收 ' + p.pop + ' 名移民将立即消耗 ' + p.food + ' 有机物储备。',
        options: [
          { label: '接收移民（' + p.pop + ' 人）', note: '消耗 ' + p.food + ' 有机物', cb: () => g.resolveChoice(0) },
          { label: '婉拒', note: '殖民地资源紧张', cb: () => g.resolveChoice(-1) },
        ],
      });
    } else if (ch.id === 'derelict') {
      showModal({
        tag: '探索', tagClass: 'good', title: '废弃船骸', noClose: true,
        body: '<div class="quote">锈蚀的船体安静地漂在轨道上，货舱可能还有货物。</div>靠近回收有 20% 概率惊动残存的自动防御系统。',
        options: [
          { label: '派无人艇回收', note: '获得 120~260 矿石；20% 概率指挥中枢受损', cb: () => g.resolveChoice(0) },
          { label: '保持距离', cb: () => g.resolveChoice(-1) },
        ],
      });
    }
  }
  function tradeLabel(o) {
    const names = { ore: '矿石', organics: '有机物', energy: '能源', research: '科研点' };
    const give = Object.keys(o.give).map(k => names[k] + ' -' + o.give[k]).join('，');
    const get = Object.keys(o.get).map(k => names[k] + ' +' + o.get[k]).join('，');
    return give + ' → ' + get;
  }

  /* ================= 游戏说明（分页帮助） ================= */
  const HELP_PAGES = {
    basics: () => `
      <p><b>《星穹拓荒》是"一局一宇宙"的殖民经营 Roguelike：</b>每次开局随机生成一座星系，你带领 12 名殖民者落地生根，在资源耗尽与全员死亡之前完成殖民目标，随后跃迁下一站，共九站长征。</p>
      <table>
        <tr><td>① 扫描星系</td><td>点击行星查看六维环境（重力/大气/温度/辐射/矿藏/有机），条形越绿越有利</td></tr>
        <tr><td>② 选择降落点</td><td>三个候选落点各有倾向：富矿带 / 生机谷地 / 开阔台地，落点不可更改</td></tr>
        <tr><td>③ 经营殖民地</td><td>建造设施、殖民者自动上岗、研究科技、攒资源扩产能</td></tr>
        <tr><td>④ 应对事件</td><td>右上预警条出现后有约 5~15 秒准备时间；冷色＝安全，暖色＝危险</td></tr>
        <tr><td>⑤ 达成目标</td><td>随机三选一：人口 60 / 评分 85 / 建造曲速信标；达成后右下出现 <b>▲跃迁</b></td></tr>
        <tr><td>⑥ 跃迁或覆灭</td><td>跃迁带走 50% 资源与全部人口科技；任何致命失误直接局终</td></tr>
      </table>
      <p><b>永久死亡：</b>殖民者全灭、指挥中枢被毁、能源赤字持续 300 秒——任一发生即结算，不可读档续命（里程碑存档读取 30 秒后自动销毁）。死亡也产出<b>遗产点</b>，回主菜单"殖民者档案"可解锁跨局强化，越玩越强。</p>`,
    res: () => `
      <table>
        <tr><td>◆ 矿石</td><td>建造与修复的硬通货。<b>采矿场</b>必须毗邻矿脉（地图上的橙色菱形），矿脉会枯竭</td></tr>
        <tr><td>❧ 有机物</td><td>殖民者的食物。<b>水培农场</b>产出，受行星"有机指数"加成；断粮会饿死人、士气暴跌</td></tr>
        <tr><td>⚡ 能源</td><td>所有设施的命脉。<b>太阳能</b>白天高效、夜间只剩 15%，<b>聚变发电机</b>全天稳定但耗矿；赤字→全面停产→300 秒后基地瘫痪</td></tr>
        <tr><td>✦ 科研点</td><td><b>研究站</b>产出，在科技树（五系×八级，每局随机出现 60%）中解锁强化</td></tr>
        <tr><td>☻ 人口</td><td>受居住舱容量限制（资源栏显示 当前/上限），超容会掉士气；新 colonist 需要士气 55+ 且食物充足</td></tr>
        <tr><td>☺ 士气</td><td>影响工作效率与人口增长；居住舱/医疗站/娱乐中心提升，挨饿/失业/超容/死人下降</td></tr>
      </table>
      <p>殖民者会<b>自动分配</b>到缺人手的岗位（优先食物 → 矿石 → 科研），把鼠标悬停资源图标还能看到每秒增减速率。</p>`,
    build: () => {
      const cn = { ore: '◆', organics: '❧', energy: '⚡', research: '✦' };
      let h = '<p>建造菜单在右下角 <b>⬢建造</b>：点击卡牌选中（绿=资源够，红=不够），再点地面放置；红色虚影会提示不可建的原因。</p>';
      for (const cat of D.BUILD_CATS) {
        h += '<h4>— ' + cat.name + ' —</h4>';
        for (const id in D.BUILDINGS) {
          const b = D.BUILDINGS[id];
          if (b.cat !== cat.id) continue;
          const cost = Object.keys(b.cost).filter(k => b.cost[k] > 0).map(k => cn[k] + b.cost[k]).join(' ') || '免费';
          h += '<div class="h-row"><span class="h-ico">' + b.icon + '</span><div class="h-mid"><b>' + b.name +
            '</b><span class="h-cost">' + cost + ' · ⏱' + b.buildTime + 's' + (b.workers ? ' · 岗位' + b.workers : '') + '</span><p>' + b.desc + '</p></div></div>';
        }
      }
      h += '<p style="margin-top:10px">💡 星系目标为"曲速信标"时，特殊分类会出现 <b>✷曲速信标</b>：造价高昂，建成后自动充能，充能完毕即可跃迁。</p>';
      return h;
    },
    event: () => `
      <p><b>右上预警条出现 = 威胁将至</b>，倒计时结束才正式爆发——利用这段时间检查护盾、备足能源。研究"预警雷达"可 +5 秒预警，设置里的禅模式再 +10 秒。</p>
      <table>
        <tr><td>☄ 陨石雨</td><td>持续砸落、随机命中建筑。对策：<b>护盾发生器</b>（范围吸收伤害）+ 建筑别挤成一团</td></tr>
        <tr><td>🐉 星兽袭击</td><td>从地图边缘扑向最近建筑。<b>防御炮塔</b>自动开火；击杀每只掉落 8 有机物</td></tr>
        <tr><td>🏴 海盗袭掠</td><td>直奔指挥中枢偷资源。炮塔可击毁海盗船并追回全部赃物</td></tr>
        <tr><td>🌀 暗物质风暴</td><td>40 秒内能源产出减半、殖民者减速。提前攒满能源储备</td></tr>
        <tr><td>☀ 恒星耀斑 / ☢ 辐射爆发</td><td>露天殖民者持续掉血。<b>辐射屏蔽塔</b>范围内伤害 -70%，或研究"抗辐射涂层"</td></tr>
        <tr><td>🦠 瘟疫</td><td>随机感染数人，靠近会传播。<b>医疗站</b>范围内约 26 秒治愈；研究"疫苗工程"降感染率</td></tr>
        <tr><td>⛰ 星震</td><td>高重力/熔岩星球特有，短时间大范围砸落</td></tr>
        <tr><td>💎 良机</td><td><b>富矿</b>（限时 100 秒，抓紧采）/ <b>流浪商人</b>（以物易物）/ <b>遗迹</b>（25% 风险换大额科研）/ <b>移民船</b>（花食物换 4 人）/ <b>废弃船骸</b>（小概率损中枢，换矿石）</td></tr>
      </table>
      <p>威胁等级（难度 + 站数）决定事件频率与强度：威胁 1 约每 2 分钟一次，威胁 9 约每 1 分钟一次且伤害更高。</p>`,
    ctrl: () => `
      <table>
        <tr><td>移动视角</td><td>按住拖动 / <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span>；手机单指拖动</td></tr>
        <tr><td>缩放</td><td>鼠标滚轮；手机双指捏合</td></tr>
        <tr><td>建造</td><td>右下 <b>⬢建造</b> → 点选设施卡 → 在地面点一下放置；<span class="kbd">Shift</span> 连续放置</td></tr>
        <tr><td>查看建筑</td><td>点一下建筑 → 详情面板：产出/维护/血量，可<b>修复</b>（花矿石）或<b>拆除</b>（返还 50% 造价）</td></tr>
        <tr><td>暂停/变速</td><td><span class="kbd">空格</span> 暂停，<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 切换 1x/2x/3x；打开任何面板自动暂停，暂停中照常下令</td></tr>
        <tr><td>快捷键</td><td><span class="kbd">B</span> 建造 · <span class="kbd">T</span> 科技 · <span class="kbd">H</span> 本说明 · <span class="kbd">Esc</span> 取消/关闭</td></tr>
        <tr><td>跃迁</td><td>殖民目标达成后右下出现 <b>▲跃迁</b>，点击后需 3 秒倒计时确认（防误触）</td></tr>
        <tr><td>小地图</td><td>左下角：青点=建筑 · 橙点=矿脉与落石 · 红点=敌人 · 白框=当前视野</td></tr>
      </table>
      <p>本说明随时可看：主菜单 <b>?玩法说明</b>、对局中右上 <b>?</b> 按钮或 <span class="kbd">H</span> 键（打开时自动暂停）。</p>`,
    tips: () => `
      <p><b>开局三件套：</b>采矿场（贴着矿脉建）→ 聚变发电机 → 水培农场。能源是命脉——赤字警报一响，矿场农场实验室全部停摆。</p>
      <p><b>防御要趁早：</b>威胁 ≥4（约第 3 站起）就该有 1~2 座炮塔；一座护盾发生器罩住核心建筑群，陨石雨基本无损（有成就）。</p>
      <p><b>别把鸡蛋放一个篮子：</b>矿脉会枯竭，矿场随之停产——多占几条矿脉，或研究"自动钻探"提高单脉产量。</p>
      <p><b>富矿是天降横财：</b>限时 100 秒，出现立刻派人；商人换科研很划算，遗迹赌赢血赚（研究"遗迹解密"收益翻倍）。</p>
      <p><b>士气别崩：</b>低于 40 效率明显下滑；住房+医疗站+娱乐中心三件套维持 70+，人口会自己增长。</p>
      <p><b>跃迁策略：</b>只带走 50% 资源——临走前把矿石花在<b>永久生效的科技</b>上更划算；"曲速航线"科技还能降低下一站威胁等级。</p>
      <p><b>死了也不亏：</b>遗产点照拿，去档案页解锁"资深船员(+2人)/预载数据(+50科研)/护航编队(开局送护盾)"等 12 项跨局强化，层数越深越从容。</p>`,
  };
  function renderHelpBody(tab) {
    document.querySelectorAll('#help-tabs .htab').forEach(b => b.classList.toggle('active', b.dataset.ht === tab));
    $('help-body').innerHTML = (HELP_PAGES[tab] || HELP_PAGES.basics)();
    $('help-body').scrollTop = 0;
  }
  function openHelp(tab) {
    renderHelpBody(tab || 'basics');
    $('help-modal').style.display = 'flex';
    SF.audio.click();
  }

  /* ================= 跃迁 ================= */
  function requestWarp() {
    const g = st.game;
    if (!g || !g.goalDone || g.gameOver) return;
    const next = g.station + 1;
    const isFinal = g.mode === 'campaign' && g.station >= 9;
    const body = isFinal
      ? '这是长征的第九站。跃迁将穿越最后一道星门——无论前方是什么，开拓者的史诗都将被铭记。'
      : '跃迁至第 ' + next + ' 站：资源保留 50%+，殖民者与科技随舰迁移，新星系新环境新目标。<br><br><span class="dim">永久死亡仍然生效：跃迁途中若遭遇不测……</span>';
    showModal({ tag: '跃迁', tagClass: 'good', title: isFinal ? '最终跃迁' : '启动跃迁', body, noClose: true, options: [] });
    const opts = $('modal-opts');
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.innerHTML = '▲ 确认跃迁（3）';
    opts.appendChild(btn);
    const cancel = document.createElement('button');
    cancel.className = 'opt-btn';
    cancel.innerHTML = '再停留一会儿';
    cancel.onclick = () => { SF.audio.click(); closeModal(); };
    opts.appendChild(cancel);
    let n = 3;
    const counting = setInterval(() => {
      if ($('modal').style.display === 'none') { clearInterval(counting); return; }
      n--;
      if (n <= 0) {
        clearInterval(counting);
        btn.innerHTML = '▲ 跃迁！';
        btn.onclick = () => { SF.audio.click(); closeModal(); doWarp(); };
      } else btn.innerHTML = '▲ 确认跃迁（' + n + '）';
    }, 1000);
  }
  function doWarp() {
    const g = st.game;
    const res = g.warp();
    SF.app.runBest = Math.max(SF.app.runBest || 0, g.score().total);
    SF.audio.warp();
    $('warp-fx').style.display = 'flex';
    $('warp-text').textContent = res === 'final' ? '穿越最终星门…' : '跃迁至下一星系…';
    if (SF.meta) SF.meta.clearRun();
    setTimeout(() => {
      $('warp-fx').style.display = 'none';
      if (res === 'final') { settle(g); return; }
      const carry = g.packCarry();
      const p = {
        mode: g.mode, seed: g.seed.split('|')[0], station: g.station + 1, difficulty: g.difficulty,
        carry, carriedTechs: carry.techs, warps: g.stats.warps, threatDown: g.mods.warpThreat,
        resMul: g.resMul, eventsOn: g.eventsOn,
        galaxy: SF.gen.galaxy(g.seed.split('|')[0], g.station + 1, g.threat + 1),
      };
      // 无尽/周挑战也继续下一站
      showGalaxy(p);
    }, 2400);
  }

  /* ================= 结算 ================= */
  function settle(g) {
    const sc = g.score();
    if (sc.rank === 'S' && SF.meta) SF.meta.unlock('rank_s');
    if (g.res.ore >= 1000 && SF.meta) SF.meta.unlock('rich1000');
    const legacy = g.legacyEarn();
    const newAchv = SF.meta ? SF.meta.finishRun(g, legacy) : [];
    st.game = null;
    showScreen('__game__'); // 保留背景
    $('hud').style.display = 'none';
    closeAllPanels();
    $('screen-settle').style.display = 'flex';
    const rank = $('settle-rank');
    rank.textContent = g.won ? sc.rank : '✝';
    rank.className = 'settle-rank' + (g.won ? '' : ' dead');
    $('settle-title').textContent = g.won
      ? (g.mode === 'campaign' ? '九站长征 · 凯旋' : '殖民目标达成')
      : '殖民点陷落';
    const reasons = { all_dead: '全体殖民者罹难', base_lost: '指挥中枢被摧毁', collapse: '能源赤字导致基地瘫痪' };
    $('settle-sub').textContent = g.won
      ? g.galaxy.sysName + ' · 第 ' + g.station + ' 站 · 评级 ' + sc.rank
      : (reasons[g.loseReason] || '远征结束') + ' · 存活 ' + Math.floor(g.time / 60) + ' 分钟';
    let rows = '';
    for (const p of sc.parts) rows += '<div class="srow"><span>' + p[0] + '</span><b>+' + p[1] + '</b></div>';
    rows += '<div class="srow"><span>综合评分</span><b>' + sc.total + ' / 100</b></div>';
    rows += '<div class="srow"><span>事件处理率</span><b>' + (g.stats.eventsTotal ? Math.round(g.stats.eventsGood / g.stats.eventsTotal * 100) : 100) + '%</b></div>';
    rows += '<div class="srow"><span>牺牲人数 / 击杀星兽</span><b>' + g.stats.deaths + ' / ' + g.stats.beastsKilled + '</b></div>';
    $('settle-rows').innerHTML = rows;
    $('settle-legacy').innerHTML = '获得遗产点 <b>+' + legacy + '</b>';
    $('settle-achv').innerHTML = newAchv.map(a => '<span class="na">🏅 ' + a.name + '</span>').join('');
    const btns = $('settle-btns');
    btns.innerHTML = '';
    const addBtn = (label, primary, cb) => {
      const b = document.createElement('button');
      b.className = 'btn' + (primary ? ' btn-primary' : '');
      b.innerHTML = label;
      b.onclick = () => { SF.audio.click(); cb(); };
      btns.appendChild(b);
    };
    if (g.won && g.mode === 'endless') {
      addBtn('▶ 继续深空（第 ' + (g.station + 1) + ' 站）', true, () => {
        const carry = g.packCarry();
        showGalaxy({
          mode: 'endless', seed: g.seed.split('|')[0], station: g.station + 1, difficulty: g.difficulty,
          carry, carriedTechs: carry.techs, warps: g.stats.warps, threatDown: g.mods.warpThreat,
          resMul: g.resMul, eventsOn: g.eventsOn,
          galaxy: SF.gen.galaxy(g.seed.split('|')[0], g.station + 1, g.threat + 1),
        });
      });
    }
    addBtn('↺ 再来一局', g.won && g.mode !== 'endless', () => {
      const mode = g.mode;
      const start = (diff) => {
        const seed = mode === 'weekly' ? SF.rng.weeklySeed() : String(Date.now() % 1000000);
        showGalaxy({
          mode, seed, station: 1, difficulty: diff || g.difficulty,
          resMul: g.resMul, eventsOn: g.eventsOn,
          threat: mode === 'weekly' ? 4 : (mode === 'sandbox' ? g.threatFixed : 0),
          galaxy: SF.gen.galaxy(seed, 1, mode === 'weekly' ? 4 : 0),
        });
      };
      if (mode === 'campaign') pickDifficulty('campaign', start);
      else start(null);
    });
    addBtn('⌂ 回主菜单', !g.won || g.mode === 'campaign', () => showMenu());
    // 周挑战成绩入榜
    if (g.mode === 'weekly' && SF.meta) {
      const best = SF.app.runBest || sc.total;
      SF.meta.addWeekly({ score: best, station: g.station, rank: sc.rank, date: new Date().toLocaleDateString() });
    }
    SF.audio.stopAmbient();
  }

  /* ================= 教程 ================= */
  function renderTut() {
    const g = st.game;
    if (!g || !g.tutActive) { $('tut-panel').style.display = 'none'; return; }
    const step = g.tutCheck();
    let html = '';
    g.TUT_STEPS.forEach((s, i) => {
      const cls = i < step ? 'done' : i === step ? 'cur' : '';
      html += '<div class="tut-item ' + cls + '"><span class="ti">' + (i < step ? '✓' : i === step ? '▶' : '○') + '</span>' + s.text + '</div>';
    });
    $('tut-list').innerHTML = html;
    // 高亮标记
    st.marker = null;
    if (step === 1 || step === 3 || step === 4) {
      // 找一个合适的矿脉/位置提示
      if (step === 1) {
        const nodes = g.map.nodes.filter(n => n.type === 'ore' && n.amount > 0);
        if (nodes.length) {
          nodes.sort((a, b) => dist2(a, g.site) - dist2(b, g.site));
          st.marker = { x: nodes[0].x, y: nodes[0].y };
        }
      }
    }
  }
  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  /* ================= HUD 刷新 ================= */
  function updateHud(dt) {
    const g = st.game;
    if (!g) return;
    st.hudAcc += dt;
    if (st.hudAcc < 0.2) { checkChoice(); return; }
    st.hudAcc = 0;
    checkChoice();

    // 资源
    setRes('ore', g.res.ore, g.rates.ore || 0);
    setRes('org', g.res.organics, g.rates.food || 0);
    setRes('energy', g.res.energy, g.rates.energyNet || 0);
    setRes('research', g.res.research, g.rates.research || 0);
    setRes('pop', g.colonists.length, g.unemployed ? 0 : 0, g.colonists.length + '/' + g.popCap());
    const moraleIco = g.morale >= 70 ? '☺' : g.morale >= 40 ? '😐' : '☹';
    setRes('morale', Math.round(g.morale), 0, null, moraleIco);

    // 目标
    const gp = g.goalProgress();
    const pct = Math.min(100, gp.cur / gp.target * 100);
    $('hud-goal-fill').style.width = pct + '%';
    $('hud-goal-val').textContent = gp.label || (Math.floor(gp.cur) + '/' + gp.target);
    $('hud-goal-label').textContent = { pop: '目标 · 人口', score: '目标 · 评分', beacon: '目标 · 曲速信标' }[g.goal.type];
    const tm = hms(g.time);
    $('hud-station').textContent = (g.mode === 'endless' ? '深空 ' : '第 ') + g.station + (g.mode === 'weekly' ? '/3 站' : g.mode === 'campaign' ? '/9 站' : ' 站');
    $('hud-day').textContent = '第 ' + tm.day + ' 天';
    $('hud-clock').textContent = tm.clock;
    $('hud-threat').textContent = g.threat;

    // 预警条
    const ab = $('alert-bar');
    if (g.warnEvt) {
      ab.style.display = 'flex';
      ab.className = 'alert-bar glass';
      $('alert-text').textContent = g.warnEvt.def.name + '来袭';
      $('alert-count').textContent = Math.max(0, Math.ceil(g.warnEvt.until - g.time)) + 's';
    } else if (g.activeEvt) {
      ab.style.display = 'flex';
      const crisis = ['beast', 'pirate', 'quake'].includes(g.activeEvt.def.id);
      ab.className = 'alert-bar glass' + (crisis ? ' crisis' : '');
      $('alert-text').textContent = g.activeEvt.def.name + '进行中';
      $('alert-count').textContent = Math.max(0, Math.ceil(g.activeEvt.until - g.time)) + 's';
    } else ab.style.display = 'none';

    // 速度按钮
    document.querySelectorAll('.spd[data-spd]').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.spd) === g.speed && !g.paused());
    });
    $('btn-pause').classList.toggle('active', g.paused() && g.speed > 0 || g.speed === 0);

    // 跃迁按钮
    $('btn-warp').style.display = g.goalDone && !g.gameOver ? '' : 'none';

    // 赤字警告
    $('brownout').style.display = g.brownoutT > 5 ? '' : 'none';
    if (g.brownoutT > 5) $('brownout-time').textContent = Math.ceil(300 - g.brownoutT);

    // 提示点
    let canTech = false;
    for (const bid in g.availTechs) {
      for (const tid of g.availTechs[bid]) {
        const t = D.TECHS.find(x => x.id === tid);
        if (g.techState(t) === 'avail' && g.res.research >= t.cost) canTech = true;
      }
    }
    $('tech-dot').style.display = canTech && $('panel-tech').style.display === 'none' ? '' : 'none';
    const seen = (SF.meta && SF.meta.ui.logSeen) || 0;
    $('quest-dot').style.display = g.log.length > seen && $('panel-log').style.display === 'none' ? '' : 'none';

    // 暂停遮罩：手动暂停或打开面板时（弹窗自身有遮罩，不重复显示）
    const panelsOpen = ['panel-build', 'panel-tech', 'panel-info', 'panel-log']
      .some(id => $(id).style.display !== 'none');
    const manualPause = g.speed === 0 && !g.pendingChoice;
    $('pause-cover').style.display = (manualPause || panelsOpen) && !anyModal() && !g.gameOver ? '' : 'none';

    // 教程
    if (g.tutActive) renderTut();

    // 事件 ticker
    const tk = $('event-ticker');
    if (g.log.length && $('panel-log').style.display === 'none') {
      const recent = g.log.slice(-3).reverse();
      const html = recent.map(l => '<div class="tk ' + (l.kind || '') + '">' + l.txt + '</div>').join('');
      if (tk._html !== html) { tk.innerHTML = html; tk._html = html; tk.style.display = ''; }
    } else tk.style.display = 'none';
  }

  let resPrev = {};
  function setRes(id, val, rate, txt, icoOverride) {
    const el = $('res-' + id);
    const b = el.querySelector('b');
    const shown = txt || fmt(val);
    if (resPrev[id] !== shown) {
      b.textContent = shown;
      if (resPrev[id] !== undefined) {
        const up = parseFloat(shown) > parseFloat(resPrev[id]);
        el.classList.remove('flash-up', 'flash-dn');
        void el.offsetWidth;
        el.classList.add(parseFloat(shown) >= parseFloat(resPrev[id]) ? 'flash-up' : 'flash-dn');
        setTimeout(() => el.classList.remove('flash-up', 'flash-dn'), 600);
      }
      resPrev[id] = shown;
    }
    if (id === 'pop') el.querySelector('span').textContent = '殖民者';
    if (icoOverride) el.querySelector('i').textContent = icoOverride;
    el.title = rate ? (rate > 0 ? '+' : '') + rate.toFixed(2) + '/s' : '';
  }

  /* ================= 输入 ================= */
  function bindInput() {
    const cv = $('game-canvas');
    cv.addEventListener('contextmenu', e => e.preventDefault());

    cv.addEventListener('pointerdown', e => {
      SF.audio.init();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      if (e.pointerType === 'touch') {
        // 双指缩放
        const touches = [...cv._pt || []];
        cv._pt = (cv._pt || []);
        cv._pt.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
        if (cv._pt.length === 2) {
          st.pinch = { d: pdist(cv._pt), zoom: st.game.cam.zoom };
          return;
        }
      }
      st.downPos = { x: e.clientX, y: e.clientY };
      st.moved = 0;
      st.drag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointermove', e => {
      const g = st.game;
      if (!g) return;
      if (e.pointerType === 'touch') {
        if (cv._pt) {
          const p = cv._pt.find(p => p.id === e.pointerId);
          if (p) { p.x = e.clientX; p.y = e.clientY; }
        }
        if (st.pinch && cv._pt && cv._pt.length === 2) {
          const nd = pdist(cv._pt);
          g.cam.zoom = clamp(st.pinch.zoom * nd / st.pinch.d, 0.45, 2.2);
          return;
        }
      }
      if (st.placing) {
        const w = SF.render.screenToWorld(g, e.clientX, e.clientY);
        const chk = g.canPlace(st.placing.typeId, w.x, w.y);
        st.ghost = { x: w.x, y: w.y, ok: chk.ok, why: chk.why, typeId: st.placing.typeId };
      }
      if (st.drag && st.downPos) {
        const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
        st.moved += Math.abs(dx) + Math.abs(dy);
        if (st.moved > 6) {
          g.cam.x -= dx / g.cam.zoom; g.cam.y -= dy / g.cam.zoom;
          clampCam(g);
        }
        st.drag = { x: e.clientX, y: e.clientY };
      } else {
        // hover 行星（星图阶段）
        if (SF.app.state === 'galaxy') galaxyHover(e.clientX, e.clientY);
      }
    });
    const up = e => {
      const g = st.game;
      cv._pt = (cv._pt || []).filter(p => p.id !== e.pointerId);
      if (cv._pt.length < 2) st.pinch = null;
      if (st.drag && st.moved <= 6 && g) {
        // 视为点击
        handleClick(e.clientX, e.clientY);
      }
      st.drag = null; st.downPos = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    cv.addEventListener('wheel', e => {
      const g = st.game;
      if (!g) return;
      e.preventDefault();
      const old = g.cam.zoom;
      const nz = clamp(old * (e.deltaY > 0 ? 0.88 : 1.14), 0.45, 2.2);
      // 以鼠标为中心缩放
      const wx = (e.clientX - innerWidth / 2) / old + g.cam.x;
      const wy = (e.clientY - innerHeight / 2) / old + g.cam.y;
      g.cam.zoom = nz;
      g.cam.x = wx - (e.clientX - innerWidth / 2) / nz;
      g.cam.y = wy - (e.clientY - innerHeight / 2) / nz;
      clampCam(g);
    }, { passive: false });

    window.addEventListener('keydown', e => {
      const g = st.game;
      if (e.code === 'Space') { e.preventDefault(); if (g && SF.app.state === 'game') { g.speed = g.speed === 0 ? 1 : 0; SF.audio.click(); } return; }
      if (!g || SF.app.state !== 'game') return;
      if (e.key === '1') g.speed = 1;
      if (e.key === '2') g.speed = 2;
      if (e.key === '3') g.speed = 3;
      if (e.key === 'b' || e.key === 'B') togglePanel('panel-build');
      if (e.key === 't' || e.key === 'T') togglePanel('panel-tech');
      if (e.key === 'Escape') {
        if (st.placing) cancelPlacing();
        else closeAllPanels();
      }
      if (e.key === 'h' || e.key === 'H') {
        openHelp('ctrl');
        g.pauseReasons.settings = 1;
      }
      st.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', e => { st.keys[e.key.toLowerCase()] = false; });
  }
  function pdist(pts) {
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function clampCam(g) {
    g.cam.x = clamp(g.cam.x, 0, g.map.w);
    g.cam.y = clamp(g.cam.y, 0, g.map.h);
  }

  function handleClick(sx, sy) {
    const g = st.game;
    if (!g) return;
    const w = SF.render.screenToWorld(g, sx, sy);
    if (st.placing) {
      if (g.place(st.placing.typeId, w.x, w.y)) {
        const keepShift = st.keys['shift'];
        if (!keepShift || !g.canPlace(st.placing.typeId, w.x + 40, w.y).ok) cancelPlacing();
      } else SF.audio.err();
      return;
    }
    // 选中建筑
    let best = null, bd = 1e9;
    for (const b of g.buildings) {
      const d = Math.hypot(b.x - w.x, b.y - w.y);
      if (d < b.def.size * 34 + 12 && d < bd) { bd = d; best = b; }
    }
    if (best) { SF.audio.click(); showBuildingInfo(best); }
    else { st.selB = null; closePanel('panel-info'); }
  }

  /* 星图点击/悬停 */
  function galaxyHover(cx, cy) {
    const p = st.pending;
    if (!p) return;
    const cv = $('galaxy-canvas');
    const r = cv.getBoundingClientRect();
    const idx = planetAt(p.galaxy, cx - r.left, cy - r.top, r.width, r.height);
    if (idx !== st.gHov) { st.gHov = idx; cv.style.cursor = idx >= 0 ? 'pointer' : 'default'; }
  }
  function planetAt(galaxy, x, y, w, h) {
    const cx = w * 0.5, cy = h * 0.5;
    for (const p of galaxy.planets) {
      const r = p.orbit * Math.min(1.35, Math.max(0.62, h / 760));
      const a = p.phase + SF.app.now * p.speed;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.42;
      if (Math.hypot(px - x, py - y) < p.size + 14) return p.idx;
    }
    return -1;
  }
  function galaxyClick(x, y, w, h) {
    const p = st.pending;
    if (!p) return;
    const idx = planetAt(p.galaxy, x, y, w, h);
    if (idx >= 0) {
      st.gSel = idx;
      updateGalaxyPanel();
      SF.audio.click();
    }
  }

  /* ================= 设置 & 档案 ================= */
  function applySettings() {
    const s = SF.meta.data.settings;
    document.body.classList.toggle('cbmode', s.cb);
    document.body.classList.toggle('perfname', s.perf);
    document.body.classList.toggle('fs1', s.font === 1);
    document.body.classList.toggle('fs2', s.font === 2);
    SF.audio.setEnabled(s.sound);
    $('tgl-sound').textContent = s.sound ? '开' : '关';
    $('tgl-sound').classList.toggle('on', s.sound);
    $('tgl-perf').textContent = s.perf ? '开' : '关';
    $('tgl-perf').classList.toggle('on', s.perf);
    $('tgl-cb').textContent = s.cb ? '开' : '关';
    $('tgl-cb').classList.toggle('on', s.cb);
    $('tgl-zen').textContent = s.zen ? '开' : '关';
    $('tgl-zen').classList.toggle('on', s.zen);
    document.querySelectorAll('#seg-font button').forEach(b => b.classList.toggle('active', Number(b.dataset.v) === s.font));
  }

  function renderArchive(tab) {
    const m = SF.meta.data;
    const lv = Math.min(99, 1 + Math.floor(m.legacyTotal / 100));
    $('archive-stats').innerHTML = '档案等级 Lv.' + lv + ' · 遗产点 <b style="color:#FFE066">' + m.legacy + '</b> · 成就 ' +
      Object.keys(m.achv).length + '/' + D.ACHIEVEMENTS.length;
    const body = $('archive-body');
    if (tab === 'legacy') {
      body.innerHTML = '<div class="dim" style="font-size:12px;margin-bottom:8px">每局结算产出遗产点。解锁跨局增益——不提供数值上限优势，保持局内公平。</div>';
      for (const it of D.LEGACY) {
        const owned = !!m.spent[it.id];
        const el = document.createElement('div');
        el.className = 'legacy-item';
        el.innerHTML = '<div class="li-ico">' + it.icon + '</div><div class="li-mid"><div class="li-name">' + it.name +
          '</div><div class="li-desc">' + it.desc + '</div></div>' +
          '<button class="li-buy' + (owned ? ' li-owned' : '') + '" ' + (owned || m.legacy < it.cost ? 'disabled' : '') + '>' +
          (owned ? '✓ 已解锁' : it.cost + ' LP') + '</button>';
        if (!owned) {
          el.querySelector('button').onclick = () => {
            if (SF.meta.buy(it.id)) { SF.audio.good(); renderArchive('legacy'); showMenu(); }
            else SF.audio.err();
          };
        }
        body.appendChild(el);
      }
    } else if (tab === 'achv') {
      body.innerHTML = '<div class="achv-grid"></div>';
      const grid = body.firstChild;
      for (const a of D.ACHIEVEMENTS) {
        const got = m.achv[a.id];
        const hide = a.hidden && !got;
        const el = document.createElement('div');
        el.className = 'achv-card' + (got ? ' ok' : '');
        el.innerHTML = '<div class="a-name">' + (hide ? '???' : '🏅 ' + a.name) + '</div>' +
          '<div class="a-desc">' + (hide ? '隐藏成就' : a.desc) + '</div>' +
          (got ? '<div class="a-time">✓ 达成于 ' + got + '</div>' : '');
        grid.appendChild(el);
      }
    } else {
      const wk = m.weekly || [];
      body.innerHTML = wk.length
        ? '<div class="dim" style="font-size:12px;margin-bottom:8px">每周挑战：全服同一固定种子（本地记录 Top 10）</div>' +
          wk.map((r, i) => '<div class="rank-row"><span class="rk">#' + (i + 1) + '</span><span>' + r.score + ' 分 · ' + r.rank + ' 评级 · 第 ' + r.station + ' 站</span><span class="rr-name">' + r.date + '</span></div>').join('')
        : '<div class="scan-hint">尚未有每周挑战成绩——每周一刷新固定种子，与全服玩家同题竞技。</div>';
    }
  }

  /* ================= 主菜单绑定 ================= */
  function bindMenus() {
    const go = (mode) => {
      SF.audio.init(); SF.audio.click();
      pickDifficulty(mode, (diff) => {
        const seed = mode === 'weekly' ? SF.rng.weeklySeed() : (SF.rng.fx.int(100000, 999999)) + '';
        showGalaxy({
          mode, seed, station: 1, difficulty: diff,
          threat: mode === 'weekly' ? 4 : 0,
          galaxy: SF.gen.galaxy(seed, 1, mode === 'weekly' ? 4 : 0),
        });
      });
    };
    $('btn-campaign').onclick = () => go('campaign');
    $('btn-endless').onclick = () => go('endless');
    $('btn-weekly').onclick = () => go('weekly');
    $('btn-sandbox').onclick = () => { SF.audio.click(); showScreen('screen-sandbox'); };
    $('btn-help').onclick = () => openHelp('basics');
    $('btn-ingame-help').onclick = () => {
      openHelp('ctrl');
      if (st.game) st.game.pauseReasons.settings = 1;
    };
    document.querySelectorAll('#help-tabs .htab').forEach(b => {
      b.onclick = () => { SF.audio.click(); renderHelpBody(b.dataset.ht); };
    });
    $('btn-settings').onclick = () => { SF.audio.click(); applySettings(); $('settings-modal').style.display = 'flex'; };
    $('btn-archive').onclick = () => { SF.audio.click(); showScreen('screen-archive'); renderArchive('legacy'); };
    $('btn-archive-back').onclick = () => showMenu();
    $('btn-galaxy-back').onclick = () => showMenu();
    $('btn-land').onclick = () => { SF.audio.click(); openSiteSelect(); };
    $('btn-site-cancel').onclick = () => { $('site-select').style.display = 'none'; };
    $('btn-continue').onclick = () => {
      SF.audio.click();
      const snap = SF.meta.getRun();
      if (!snap) return;
      const g = SF.Game.deserialize(snap);
      enterGame(g);
      setTimeout(() => { SF.meta.clearRun(); $('btn-continue').style.display = 'none'; toast('里程碑存档已按规则销毁', 'warn'); }, 30000);
    };
    $('btn-sandbox-back').onclick = () => showMenu();
    $('btn-sandbox-start').onclick = () => {
      SF.audio.click();
      const seed = $('sb-seed').value.trim() || String(SF.rng.fx.int(100000, 999999));
      showGalaxy({
        mode: 'sandbox', seed, station: 1, difficulty: 2,
        threat: Number($('sb-threat').value), resMul: Number($('sb-res').value) / 10,
        eventsOn: $('sb-event').dataset.on !== '0',
        galaxy: SF.gen.galaxy(seed, 1, Number($('sb-threat').value)),
      });
    };
    $('sb-threat').oninput = e => $('sb-threat-v').textContent = e.target.value;
    $('sb-res').oninput = e => $('sb-res-v').textContent = (e.target.value / 10).toFixed(1) + 'x';
    $('sb-event').onclick = e => {
      const b = e.target;
      b.dataset.on = b.dataset.on === '0' ? '1' : '0';
      b.textContent = '切换（' + (b.dataset.on === '0' ? '关闭' : '开启') + '）';
    };

    // 档案页签
    document.querySelectorAll('.atab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.atab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        renderArchive(t.dataset.tab);
      };
    });

    // HUD
    $('btn-build').onclick = () => togglePanel('panel-build');
    $('btn-tech').onclick = () => togglePanel('panel-tech');
    $('btn-quest').onclick = () => togglePanel('panel-log');
    $('btn-warp').onclick = requestWarp;
    document.querySelectorAll('.spd[data-spd]').forEach(b => {
      b.onclick = () => { if (st.game) { st.game.speed = Number(b.dataset.spd); SF.audio.click(); } };
    });
    $('btn-pause').onclick = () => { if (st.game) { st.game.speed = st.game.speed === 0 ? 1 : 0; SF.audio.click(); } };
    $('btn-ingame-settings').onclick = () => { applySettings(); $('settings-modal').style.display = 'flex'; if (st.game) st.game.pauseReasons.settings = 1; };
    document.querySelectorAll('[data-close]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.close;
        if (id === 'settings-modal' || id === 'help-modal') {
          $(id).style.display = 'none';
          if (st.game) delete st.game.pauseReasons.settings;
        } else closeAllPanels();
      };
    });

    // 设置项
    $('tgl-sound').onclick = () => { SF.meta.data.settings.sound = !SF.meta.data.settings.sound; applySettings(); SF.meta.save(); };
    $('tgl-perf').onclick = () => { SF.meta.data.settings.perf = !SF.meta.data.settings.perf; applySettings(); SF.meta.save(); };
    $('tgl-cb').onclick = () => { SF.meta.data.settings.cb = !SF.meta.data.settings.cb; applySettings(); SF.meta.save(); };
    $('tgl-zen').onclick = () => { SF.meta.data.settings.zen = !SF.meta.data.settings.zen; applySettings(); SF.meta.save(); };
    document.querySelectorAll('#seg-font button').forEach(b => {
      b.onclick = () => { SF.meta.data.settings.font = Number(b.dataset.v); applySettings(); SF.meta.save(); };
    });

    // 星图画布点击
    $('galaxy-canvas').addEventListener('pointerdown', e => {
      const r = e.target.getBoundingClientRect();
      galaxyClick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    });

    bindInput();
    SF.render.bindSelf(st);
  }

  /* ================= 每帧 ================= */
  function frame(dt, now) {
    SF.app.now = now;
    const state = SF.app.state;
    if (state === 'menu' || state === 'sandbox' || state === 'archive') {
      const mc = state === 'sandbox' ? $('menu-canvas2') : $('menu-canvas');
      if (mc && mc.clientWidth) SF.render.menuBg(mc, dt);
    } else if (state === 'galaxy') {
      SF.render.galaxyBg($('galaxy-canvas'), st.pending ? st.pending.galaxy : null, dt, st.gSel, st.gHov);
      } else if (state === 'game') {
      const g = st.game;
      if (g) {
        // 对局结束 → 自动进入结算
        if (g.gameOver && !st.settled) {
          st.settled = true;
          setTimeout(() => { if (SF.app.state === 'game') settle(g); }, 1400);
        }
        // WASD 平移
        const sp = 420 * dt / g.cam.zoom;
        if (st.keys['w']) { g.cam.y -= sp; clampCam(g); }
        if (st.keys['s']) { g.cam.y += sp; clampCam(g); }
        if (st.keys['a']) { g.cam.x -= sp; clampCam(g); }
        if (st.keys['d']) { g.cam.x += sp; clampCam(g); }
        g.update(dt);
        SF.render.frame(g, dt);
        st.miniAcc += dt;
        if (st.miniAcc > 0.3) { st.miniAcc = 0; SF.render.minimap(g, $('minimap')); }
        updateHud(dt);
        if ($('panel-info').style.display !== 'none' && st.selB) {
          st.infoAcc += dt;
          if (st.infoAcc > 0.8) {
            st.infoAcc = 0;
            const b = g.buildings.find(b => b.id === st.selB);
            if (b) showBuildingInfo(b); else closePanel('panel-info');
          }
        }
      }
    }
  }

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  return {
    init() { bindMenus(); applySettings(); },
    showMenu, showGalaxy, enterGame, settle, frame, toast,
    get game() { return st.game; },
    state: () => SF.app.state,
  };
})();
