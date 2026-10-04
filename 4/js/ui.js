'use strict';
// ================================================================
// UI 层: HUD / 小地图 / 全屏菜单 / 局内弹窗(升级·祭坛·拾取·背包)
// ================================================================
const UI = {
  el: {}, _cache: {}, _bannerT: null, _mctx: null, _cmpKey: null, _cmpShown: false,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), hpfill: $('hpfill'), hptext: $('hptext'), xpfill: $('xpfill'), lvtext: $('lvtext'),
      shieldtag: $('shieldtag'), floortext: $('floortext'), roomtext: $('roomtext'),
      goldtext: $('goldtext'), buffrow: $('buffrow'), dashind: $('dashind'),
      bossbar: $('bossbar'), bossname: $('bossname'), bossbarfill: $('bossbarfill'),
      interacttip: $('interacttip'), banner: $('banner'), bannerMain: $('banner-main'), bannerSub: $('banner-sub'),
      modalRoot: $('modal-root'), novaind: $('novaind'), objtext: $('objtext'),
      cmp: $('cmp-float'),
      screens: { main: $('screen-main'), altar: $('screen-altar'), help: $('screen-help'), pause: $('screen-pause'), death: $('screen-death') },
      menuStats: $('menu-stats'), seedInput: $('seed-input'), btnContinue: $('btn-continue'),
      altarGrid: $('altar-grid'), altarSouls: $('altar-souls'), pauseInfo: $('pause-info'), deathStats: $('death-stats'),
      btnSfx: $('btn-sfx'),
      tut: {
        root: $('tut-root'), veil: $('tut-veil'), spot: $('tut-spot'), arrow: $('tut-arrow'), card: $('tut-card'),
        num: $('tut-num'), total: $('tut-total'), dots: $('tut-dots'), title: $('tut-title'),
        text: $('tut-text'), keys: $('tut-keys'), next: $('tut-next'), skip: $('tut-skip'),
      },
    };
    this._mctx = document.getElementById('minimap').getContext('2d');

    // ---- 按钮事件 ----
    $('btn-new').onclick = () => { Sfx.ensure(); Sfx.play('ui'); const v = this.el.seedInput.value.trim(); G.newRun(v); };
    this.el.btnContinue.onclick = () => { Sfx.ensure(); Sfx.play('ui'); G.continueRun(); };
    $('btn-altar').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.showScreen('altar'); this.updateAltar(); };
    $('btn-altar-back').onclick = () => { Sfx.play('ui'); this.showScreen('main'); this.refreshMenu(); };
    $('btn-help').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.showScreen('help'); };
    $('btn-help-back').onclick = () => { Sfx.play('ui'); this.showScreen(this._helpFrom || 'main'); };
    // 新手引导重看入口(主菜单 / 暂停菜单)
    $('btn-tutorial').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.startTutorial('review', 'main'); };
    $('btn-help-tut').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.startTutorial('review', this._helpFrom || 'main'); };
    $('btn-pause-tut').onclick = () => { Sfx.play('ui'); this.startTutorial('play', 'pause'); };
    $('btn-resume').onclick = () => { Sfx.play('ui'); G.togglePause(false); };
    $('btn-pause-help').onclick = () => { Sfx.play('ui'); this._helpFrom = 'pause'; this.showScreen('help'); };
    $('btn-abandon').onclick = () => { Sfx.play('ui'); G.abandonRun(); };
    $('btn-again').onclick = () => { Sfx.play('ui'); G.newRun(null); };
    $('btn-death-altar').onclick = () => { Sfx.play('ui'); this.showScreen('altar'); this.updateAltar(); };
    $('btn-death-menu').onclick = () => { Sfx.play('ui'); this.showScreen('main'); this.refreshMenu(); };
    this.el.btnSfx.onclick = () => {
      Sfx.enabled = !Sfx.enabled;
      Meta.data.settings.sfx = Sfx.enabled;
      Meta.save();
      this.updateSfxBtn();
      Sfx.play('ui');
    };
    Tutorial.init(this.el.tut);
  },

  showScreen(name) {
    Object.values(this.el.screens).forEach(s => s.classList.add('hidden'));
    if (name) this.el.screens[name].classList.remove('hidden');
  },
  updateSfxBtn() { this.el.btnSfx.textContent = '音效:' + (Sfx.enabled ? '开' : '关'); },

  refreshMenu() {
    const st = Meta.data.stats;
    this.el.menuStats.innerHTML = `魂晶 <b style="color:#ffd24d">${Meta.data.souls}</b> 💠 · 最佳层数 <b>${st.bestFloor}</b> · 累计击杀 <b>${st.kills}</b> · 深渊探索 <b>${st.runs}</b> 次`;
    const has = RunSave.has();
    this.el.btnContinue.classList.toggle('hidden', !has);
    if (has) {
      const run = RunSave.load();
      if (run) this.el.btnContinue.textContent = `▸ 继续冒险(第 ${run.floor} 层)`;
    }
  },

  // ---------------- HUD ----------------
  setTxt(el, txt) { if (this._cache[el.id] !== txt) { this._cache[el.id] = txt; el.textContent = txt; } },
  updateHUD() {
    const p = G.player, run = G.run;
    if (!p || !run) return;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    this.el.hpfill.style.width = hpPct + '%';
    this.setTxt(this.el.hptext, `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    const need = G.xpNeed(p);
    this.el.xpfill.style.width = clamp(p.xp / need, 0, 1) * 100 + '%';
    this.setTxt(this.el.lvtext, 'Lv.' + p.level);
    this.setTxt(this.el.floortext, `第 ${run.floor} 层${G.floorData.bossFloor ? ' · 领主层' : ''}`);
    // 本层进度常驻 HUD(意见书 3.4 P1): enterRoom/roomCleared 已维护 room.cleared,
    // 这里只做聚合计数 —— 总房间数(不含营地)/已清数/全层剩余敌人。
    // 本作敌人进房才实体化, "全层剩余" = 当前房间存活(含待刷第二波 cur.pending)
    // + 其它未清房间按种子配置的 guards 数(领主房计 1 只领主, 其召唤物为临时实体不计入)。
    const rms = G.floorData.rooms;
    const total = rms.filter(r => r.type !== 'start').length;
    const done = rms.filter(r => r.type !== 'start' && r.cleared).length;
    let leftN = G.enemies.filter(e => !e.dead).length;
    if (G.cur && G.cur.pending) leftN += G.cur.pending.length;
    const curIdx = G.cur ? G.cur.room.idx : -1;
    for (const r of rms) {
      if (r.cleared || r.idx === curIdx || r.type === 'start') continue;
      if (r.type === 'boss') leftN += 1;
      else if (r.type === 'combat' || r.type === 'stairs') leftN += r.guards.length;
    }
    this.setTxt(this.el.roomtext, `本层进度 ${done}/${total} 房间 · 剩余敌人 ${leftN}`);
    // 常驻目标指引: 告诉玩家现在该做什么 / 往哪走
    const obj = G.objectiveText ? G.objectiveText() : '';
    if (obj) {
      this.setTxt(this.el.objtext, obj);
      this.el.objtext.classList.toggle('warn', !!(G.cur && G.cur.locked));
    }
    this.setTxt(this.el.goldtext, `🪙 ${p.gold}   💠 ${p.souls}`);
    // 冲刺
    if (p.dashCd <= 0) { this.setTxt(this.el.dashind, '冲刺 就绪'); this.el.dashind.classList.remove('cd'); }
    else { this.setTxt(this.el.dashind, '冲刺 ' + p.dashCd.toFixed(1) + 's'); this.el.dashind.classList.add('cd'); }
    // 主动技能(Q 奥术新星)
    const hasNova = !!p.sp.nova;
    this.el.novaind.classList.toggle('hidden', !hasNova);
    if (hasNova) {
      const nc = Math.max(0, p.novaCd);
      if (nc <= 0) { this.setTxt(this.el.novaind, '[Q] 奥术新星 就绪'); this.el.novaind.classList.remove('cd'); }
      else { this.setTxt(this.el.novaind, '[Q] 奥术新星 ' + nc.toFixed(1) + 's'); this.el.novaind.classList.add('cd'); }
    }
    // 护盾
    this.el.shieldtag.classList.toggle('hidden', !p.shield);
    // 词条 Buff 行
    const sig = SPECIAL_ORDER.map(k => k + (p.sp[k] || 0)).join(',');
    if (this._cache.buffs !== sig) {
      this._cache.buffs = sig;
      this.el.buffrow.innerHTML = SPECIAL_ORDER.filter(k => p.sp[k]).map(k => {
        const d = AFFIX[k];
        return `<div class="buff" style="border-color:${d.color};color:${d.color}" title="${d.name}:${d.fmt(p.sp[k])}">${d.tag} ${roman(p.sp[k])}</div>`;
      }).join('');
    }
    // Boss 血条
    const boss = G.enemies.find(e => e.boss && !e.dead);
    this.el.bossbar.classList.toggle('hidden', !boss);
    if (boss) {
      this.setTxt(this.el.bossname, `${boss.name}${boss.cycle > 0 ? ' · 深渊回响 Ⅰ+' + boss.cycle : ''}`);
      this.el.bossbarfill.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
    }
    // 互动提示(被封印的入口: 不加 [E], 并用红色说明原因)
    if (G.interactTarget) {
      this.el.interacttip.classList.remove('hidden');
      this.el.interacttip.classList.toggle('blocked', !!G.interactTarget.blocked);
      // 地上装备提示顺带告知"可按住 Alt 对比"(触屏设备用长按, 不加桌面键位提示)
      let tip = G.interactTarget.label;
      if (!G.interactTarget.blocked && G.interactTarget.pk.type === 'item'
        && !document.body.classList.contains('has-touch')) tip += ' · 按住 Alt 对比';
      this.setTxt(this.el.interacttip, G.interactTarget.blocked
        ? `🔒 ${G.interactTarget.label}`
        : `[E] ${tip}`);
    } else {
      this.el.interacttip.classList.add('hidden');
      this.el.interacttip.classList.remove('blocked');
    }
    // 装备对比浮层(按住 Alt / 触屏长按拾取物)
    this.updateCompare();
    this.drawMinimap();
  },

  drawMinimap() {
    const ctx = this._mctx;
    const fd = G.floorData;
    if (!fd) return;
    ctx.clearRect(0, 0, 220, 160);
    let minx = 99, maxx = -99, miny = 99, maxy = -99;
    fd.rooms.forEach(r => { minx = Math.min(minx, r.gx); maxx = Math.max(maxx, r.gx); miny = Math.min(miny, r.gy); maxy = Math.max(maxy, r.gy); });
    const cs = 26, gap = 6;
    const ox = (220 - (maxx - minx + 1) * (cs + gap)) / 2, oy = (160 - (maxy - miny + 1) * (cs + gap)) / 2;
    const px = r => ox + (r.gx - minx) * (cs + gap), py = r => oy + (r.gy - miny) * (cs + gap);
    // 连线
    ctx.strokeStyle = '#2a3244'; ctx.lineWidth = 2;
    fd.rooms.forEach(r => {
      for (const k in r.doors) {
        const n = fd.rooms[r.doors[k]];
        if (n.idx > r.idx && (r.visited || n.visited)) {
          ctx.beginPath();
          ctx.moveTo(px(r) + cs / 2, py(r) + cs / 2);
          ctx.lineTo(px(n) + cs / 2, py(n) + cs / 2);
          ctx.stroke();
        }
      }
    });
    // 房间块(渐变底 + 边缘光, 关键房间加光晕)
    const icons = { treasure: ['宝', '#ffd24d'], shrine: ['祭', '#8cd8ff'], stairs: ['↓', '#9fe8b0'], boss: ['王', '#ff6b57'], start: ['营', '#8a93ab'] };
    const objIdx = G.objectiveIdx ? G.objectiveIdx() : -1;
    const objRoom = objIdx >= 0 ? fd.rooms[objIdx] : null;
    // 目标房间是否已"已知"(自己走过, 或与已探索房间相邻)
    const objKnown = !!(objRoom && (objRoom.visited || fd.rooms.some(m => m.visited && Object.values(m.doors).includes(objRoom.idx))));
    const pulse = 0.5 + Math.sin(G.time * 4.2) * 0.5;
    fd.rooms.forEach(r => {
      const x = px(r), y = py(r);
      const cur = r === G.cur.room;
      let c0 = 'rgba(26,33,48,.55)', c1 = 'rgba(12,16,26,.55)', bd = '#2b3547';
      if (r.visited) { c0 = 'rgba(64,80,116,.95)'; c1 = 'rgba(34,44,68,.95)'; bd = '#5b6d94'; }
      if (cur) { c0 = 'rgba(255,214,96,.42)'; c1 = 'rgba(150,110,20,.35)'; bd = '#ffd24d'; }
      const gr = ctx.createLinearGradient(x, y, x, y + cs);
      gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      ctx.save();
      if (cur) { ctx.shadowColor = 'rgba(255,210,77,.9)'; ctx.shadowBlur = 9; }
      else if (r.visited) { ctx.shadowColor = 'rgba(120,170,255,.35)'; ctx.shadowBlur = 5; }
      ctx.fillStyle = gr; ctx.strokeStyle = bd; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, cs, cs, 5);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      // 顶部内高光
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, cs - 3, 3, 2); ctx.fill();
      const ic = icons[r.type];
      if (ic && (r.type === 'start' ? r.visited : (r.visited || fd.rooms.some(m => m.visited && Object.values(m.doors).includes(r.idx))))) {
        ctx.save();
        ctx.shadowColor = ic[1]; ctx.shadowBlur = 7;
        ctx.fillStyle = ic[1];
        ctx.font = 'bold 13px "Microsoft YaHei"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ic[0], x + cs / 2, y + cs / 2 + 1);
        ctx.restore();
      }
      // 目标房间(↓ 楼梯房 / 王 领主房)已探明后 → 脉冲光环, 一眼看出"往这走"
      if (objKnown && objRoom && r.idx === objRoom.idx) {
        const on = !cur;
        ctx.save();
        ctx.globalAlpha = on ? 0.5 + pulse * 0.5 : 0.35 + pulse * 0.3;
        ctx.strokeStyle = '#9fe8b0';
        ctx.lineWidth = 2;
        const pad = 3 + pulse * 4;
        ctx.beginPath();
        ctx.roundRect(x - pad, y - pad, cs + pad * 2, cs + pad * 2, 7);
        ctx.stroke();
        ctx.globalAlpha = (on ? 0.3 + pulse * 0.35 : 0.2) * 0.9;
        ctx.shadowColor = '#9fe8b0'; ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }
    });
  },

  // ---------------- 装备对比浮层(意见书 3.4 P1 "最值得先做") ----------------
  // 桌面: 站在装备掉落物旁(或任意位置)按住 Alt; 触屏: 长按地上的装备拾取物(main.js 检测)。
  // 显示新装备 vs 当前对应部位装备(武器→当前武器; 被动→第一个空槽, 没有空槽则对比 1 号槽)
  // 的逐词条差值: 数值词条求差(全为正收益词条, 差值符号即优劣, 绿升红降),
  // 特效词条比较阶数, 武器额外给基础伤害与"套进当前 Build"的预估单发伤害。
  worldToStage(x, y) {
    const c = document.getElementById('game').getBoundingClientRect();
    const s = document.getElementById('stage').getBoundingClientRect();
    return { x: c.left - s.left + x / ROOM_W * c.width, y: c.top - s.top + y / ROOM_H * c.height };
  },

  updateCompare() {
    const el = this.el.cmp;
    if (!el) return;
    const altHeld = !!(G.input.keys && (G.input.keys.AltLeft || G.input.keys.AltRight));
    const show = G.state === 'play' && !G.modal && !G.paused && (altHeld || !!G.compareHold);
    if (!show) {
      if (this._cmpShown) { el.classList.add('hidden'); this._cmpShown = false; }
      return;
    }
    // 数据源优先级: 触屏长按的拾取物 > 当前互动目标(脚边的装备掉落物)
    let pk = G.compareHold;
    if (!pk || pk.gone) {
      pk = null;
      const t = G.interactTarget;
      if (t && t.pk && t.pk.type === 'item' && t.pk.item) pk = t.pk;
    }
    if (!pk) {
      if (this._cmpShown) { el.classList.add('hidden'); this._cmpShown = false; }
      return;
    }
    const item = pk.item, p = G.player;
    let old = null, slotTxt = '';
    if (item.kind === 'weapon') old = p.weapon;
    else {
      const empty = p.passives.findIndex(x => !x);
      if (empty >= 0) slotTxt = `空槽位 ${empty + 1}`;
      else old = p.passives[0];
    }
    const key = item.uid + '|' + (old ? old.uid : slotTxt);
    if (this._cmpKey !== key) { this._cmpKey = key; el.innerHTML = this.compareHTML(item, old, slotTxt); }
    el.classList.remove('hidden');
    this._cmpShown = true;
    // 浮层跟随拾取物(舞台坐标), 默认在物品上方, 靠顶/靠边时限幅或翻到下方
    const pos = this.worldToStage(pk.x, pk.y);
    const w = 296, h = el.offsetHeight || 190;
    const stageEl = document.getElementById('stage');
    const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    let x = clamp(pos.x - w / 2, 8, Math.max(8, sw - w - 8));
    let y = pos.y - h - 30;
    if (y < 8) y = pos.y + 30;
    y = clamp(y, 8, Math.max(8, sh - h - 8));
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  },

  compareHTML(item, old, slotTxt) {
    const rc = RARITIES[item.rarity].color;
    const oldTitle = old ? Loot.itemName(old) : (item.kind === 'weapon' ? '当前武器' : (slotTxt || '空槽位'));
    const oldColor = old ? RARITIES[old.rarity].color : '#77809a';
    const row = (newTxt, oldTxt, delta, cls) =>
      `<div class="cmp-row ${cls}"><div class="cr-n">${newTxt}</div><div class="cr-d">${oldTxt}${delta ? ' <b>' + delta + '</b>' : ''}</div></div>`;
    const num = v => (Math.abs(v) < 1 && v !== 0) ? round1(v) : Math.round(v);
    const sign = dd => dd > 0 ? '▲ +' + num(dd) : (dd < 0 ? '▼ -' + num(-dd) : '＝');
    const agg = it => {
      const m = {};
      if (it) for (const a of it.affixes) {
        const d = AFFIX[a.id];
        if (d && d.tier === 'stat') m[a.id] = round1((m[a.id] || 0) + a.v);
      }
      return m;
    };
    const spTier = it => {
      const m = {};
      if (it) for (const a of it.affixes) {
        const d = AFFIX[a.id];
        if (d && d.tier === 'special') m[a.id] = Math.max(m[a.id] || 0, clamp(Math.round(a.v), 1, 5));
      }
      return m;
    };
    const na = agg(item), oa = agg(old), ns = spTier(item), os = spTier(old);
    const rows = [];
    // 数值词条并集求差(本作所有数值词条都是"越高越好", 差值符号直接映射优劣色)
    const ids = Object.keys(na);
    for (const id of Object.keys(oa)) if (!ids.includes(id)) ids.push(id);
    for (const id of ids) {
      const d = AFFIX[id];
      const nv = na[id] || 0, ov = oa[id] || 0;
      if (nv > 0 && ov > 0) {
        const dd = round1(nv - ov);
        rows.push(row(d.fmt(nv), '当前 ' + d.fmt(ov), sign(dd), dd > 0 ? 'up' : (dd < 0 ? 'down' : 'same')));
      } else if (nv > 0) {
        rows.push(row(d.fmt(nv), '当前无 · 新获得', '▲ 新增', 'up'));
      } else {
        rows.push(row('失去词条:' + d.name, '原本 ' + d.fmt(ov), '▼ 丢失', 'down'));
      }
    }
    // 特效词条: 比较该装备自身的阶数(跨装备叠加由整体 Build 决定, 这里只看单件变化)
    const spIds = Object.keys(ns);
    for (const id of Object.keys(os)) if (!spIds.includes(id)) spIds.push(id);
    for (const id of spIds) {
      const d = AFFIX[id];
      const nv = ns[id] || 0, ov = os[id] || 0;
      if (nv > ov) rows.push(row(`◈ ${d.name} ${roman(nv)}`, ov ? '当前 ' + roman(ov) : '当前无 · 新获得', ov ? '▲ 升阶' : '▲ 新增', 'up'));
      else if (nv < ov) rows.push(row(nv > 0 ? `◈ ${d.name} ${roman(nv)}` : `◈ ${d.name}`, ov ? '当前 ' + roman(ov) : '', '▼ 丢失', 'down'));
      else rows.push(row(`◈ ${d.name} ${roman(nv)}`, '同阶', '', 'same'));
    }
    // 伤害试算: 把候选装备套进当前 Build(不动真实玩家数据), 与现状比较
    const estShot = cand => {
      const c = Object.assign({}, G.player);
      if (cand.kind === 'weapon') c.weapon = cand;
      else {
        const slot = G.player.passives.findIndex(x => !x);
        c.passives = G.player.passives.slice();
        c.passives[slot >= 0 ? slot : 0] = cand;
      }
      c.stats = Loot.computeStats(c).s;
      return Math.round(Loot.shotDmg(c));
    };
    const oEst = Math.round(Loot.shotDmg(G.player));
    if (item.kind === 'weapon') {
      const dd = old ? round1(item.dmg - old.dmg) : 0;
      rows.push(row(`基础伤害 ${item.dmg}`, old ? `当前 ${old.dmg}` : '当前无',
        old ? sign(dd) : '', !old || dd > 0 ? 'up' : (dd < 0 ? 'down' : 'same')));
    }
    const nEst = estShot(item);
    rows.push(row(`预估单发 ${nEst}`, `当前 ${oEst}`, sign(nEst - oEst), nEst > oEst ? 'up' : (nEst < oEst ? 'down' : 'same')));
    const tip = document.body.classList.contains('has-touch') ? '长按地上装备可对比 · 松手关闭' : '按住 Alt 对比 · 松开关闭';
    return `<div class="cmp-head"><span style="color:${rc}">${Loot.itemName(item)}</span><span class="cmp-vs">vs</span>` +
      `<span style="color:${oldColor}">${oldTitle}</span></div>${rows.join('')}<div class="cmp-tip">${tip}</div>`;
  },

  banner(main, sub = '', dur = 2200) {
    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('hidden');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.banner.classList.add('hidden'), dur);
  },

  // ---------------- 弹窗通用 ----------------
  openModal(html) {
    this.el.modalRoot.innerHTML = html;
    this.el.modalRoot.classList.remove('hidden');
  },
  closeModal() {
    this.el.modalRoot.classList.add('hidden');
    this.el.modalRoot.innerHTML = '';
    G.modal = null;
  },

  // 三选一(升级祝福 / 远古祭坛)
  openChoices(title, sub, choices, onPick) {
    G.modal = 'choices';
    const cards = choices.map((b, i) => {
      let lvl = '';
      if (b.special) {
        const cur = G.player.sp[b.special] || 0;
        lvl = `<div class="clvl">当前:${cur ? roman(cur) : '未拥有'} → ${roman(Math.min(5, cur + 1))}</div>`;
      }
      return `<div class="choice-card" data-i="${i}">
        <div class="cname">${b.name}</div>
        <div class="cdesc">${b.desc}</div>${lvl}</div>`;
    }).join('');
    this.openModal(`<div class="modal"><h2>${title}</h2><div class="msub">${sub}</div>
      <div class="choice-row">${cards}</div></div>`);
    this.el.modalRoot.querySelectorAll('.choice-card').forEach(c => {
      c.onclick = () => { Sfx.play('bless'); onPick(choices[+c.dataset.i]); };
    });
  },

  // ---------------- 拾取弹窗 ----------------
  itemCardHTML(item, selected, extraCls = '') {
    if (!item) return '';
    const r = RARITIES[item.rarity];
    const lines = Loot.itemDescLines(item).map(l => `<div class="iaffix">${l}</div>`).join('');
    const slot = G.player.passives.indexOf(item);
    const kindTxt = item.kind === 'weapon'
      ? `武器 · 基础伤害 ${item.dmg} · ${Loot.itemBase(item).desc}`
      : (slot >= 0 ? `被动装备 · 第 ${slot + 1} 槽` : '被动装备');
    // 稀有度光晕: 边框色 + 柔和外发光(内联, 随稀有度变化)
    return `<div class="item-card ${extraCls} ${selected ? 'selected' : ''}" data-uid="${item.uid}"
      style="border-color:${r.color};box-shadow:0 0 26px -9px ${r.color}, inset 0 1px 0 rgba(255,255,255,.09), inset 0 -14px 28px rgba(0,0,0,.42), 0 6px 20px rgba(0,0,0,.55)">
      <div class="iname" style="color:${r.color}">${Loot.itemName(item)}</div>
      <div class="ikind">${kindTxt}</div>${lines}
      ${item.kind === 'weapon' ? `<div class="idps">预估单发:${Math.round(Loot.shotDmg({ ...G.player, weapon: item }))}</div>` : ''}
    </div>`;
  },
  openPickup(item, pk) {
    G.modal = 'pickup';
    const p = G.player;
    let rightCol, btns;
    if (item.kind === 'weapon') {
      rightCol = `<div class="pickup-col"><div class="pickup-col-title">当前武器</div>${this.itemCardHTML(p.weapon, true)}</div>`;
      btns = `<button class="btn primary small" id="pk-equip">装备(替换当前武器)</button>
        <button class="btn small" id="pk-merge">熔合强化当前武器</button>`;
    } else {
      const slots = p.passives.map((it, i) =>
        it ? this.itemCardHTML(it, i === 0, 'selectable').replace('data-uid', `data-slot="${i}" data-uid`)
           : `<div class="item-card selectable empty-slot" data-slot="${i}" style="border-color:#2a3244;color:#5d6579;text-align:center;padding:28px 0">空槽位 ${i + 1}</div>`
      ).join('');
      rightCol = `<div class="pickup-col"><div class="pickup-col-title">被动装备槽(点击选择目标)</div>${slots}</div>`;
      btns = `<button class="btn primary small" id="pk-equip">装备到所选槽位</button>
        <button class="btn small" id="pk-merge">熔合进所选装备</button>`;
    }
    this.openModal(`<div class="modal"><h2>获得战利品</h2><div class="msub">选择 装备 / 熔合(强化词条) / 出售</div>
      <div class="pickup-layout">
        <div class="pickup-col"><div class="pickup-col-title">新装备</div>${this.itemCardHTML(item, true)}</div>
        ${rightCol}
      </div>
      <div class="modal-btns">${btns}
        <button class="btn small" id="pk-sell">出售(+${Loot.sellValue(item)}金)</button>
        <button class="btn small" id="pk-leave">留在地上</button>
      </div></div>`);

    let selSlot = -1;
    if (item.kind === 'passive') {
      const empty = p.passives.findIndex(x => !x);
      selSlot = empty >= 0 ? empty : 0;
      const refresh = () => {
        this.el.modalRoot.querySelectorAll('.item-card.selectable, .empty-slot').forEach(c => {
          c.classList.toggle('selected', +c.dataset.slot === selSlot);
        });
      };
      refresh();
      this.el.modalRoot.querySelectorAll('.item-card.selectable, .empty-slot').forEach(c => {
        c.onclick = () => { selSlot = +c.dataset.slot; Sfx.play('ui'); refresh(); };
      });
    }
    const close = () => { this.closeModal(); };
    const q = id => this.el.modalRoot.querySelector(id);
    if (q('#pk-equip')) q('#pk-equip').onclick = () => {
      if (item.kind === 'weapon') p.weapon = item;
      else p.passives[selSlot] = item;
      Loot.applyStats(p);
      if (pk) pk.gone = true;
      Sfx.play('pick');
      G.saveRun();
      close();
    };
    if (q('#pk-merge')) q('#pk-merge').onclick = () => {
      const target = item.kind === 'weapon' ? p.weapon : p.passives[selSlot];
      if (!target) return;
      const boosted = Loot.mergeInto(target, item);
      Loot.applyStats(p);
      if (pk) pk.gone = true;
      Sfx.play('fuse');
      if (boosted) {
        const d = AFFIX[boosted.id];
        FX.text(p.x, p.y - 30, '熔合强化!', '#ffe9b0', 15, true);
        UI.banner('熔合成功', `【${target.name}】词条提升:${d.name} → ${d.tier === 'special' ? roman(boosted.v) : d.fmt(boosted.v)}`, 2400);
      }
      G.saveRun();
      close();
    };
    if (q('#pk-sell')) q('#pk-sell').onclick = () => {
      G.gainGold(Loot.sellValue(item));
      if (pk) pk.gone = true;
      Sfx.play('coin');
      close();
    };
    if (q('#pk-leave')) q('#pk-leave').onclick = () => { Sfx.play('ui'); close(); };
  },

  // ---------------- 背包 + 属性面板 ----------------
  openInventory() {
    if (G.tutorial && G.tutorial.hold) return;
    G.stat.tabs++;
    G.modal = 'inventory';
    this.renderInventory();
  },
  renderInventory(selUid) {
    const p = G.player;
    const s = p.stats;
    const wD = Loot.itemBase(p.weapon);
    const spList = SPECIAL_ORDER.filter(k => p.sp[k]).map(k => {
      const d = AFFIX[k];
      return `<div class="sp-item">◈ ${d.name} ${roman(p.sp[k])}</div>`;
    }).join('') || '<div style="color:#5d6579">尚未获得特效词条</div>';
    const allSlots = [p.weapon, ...p.passives];
    const cards = allSlots.map((it, i) => {
      if (!it) return `<div class="item-card selectable empty-slot" data-slot="${i}" style="border-color:#2a3244;color:#5d6579;text-align:center;padding:24px 0">${i === 0 ? '武器' : '空槽位 ' + i}</div>`;
      return this.itemCardHTML(it, it.uid === selUid, 'selectable inv-card').replace('data-uid', `data-slot="${i}" data-uid`);
    }).join('');
    this.openModal(`<div class="modal"><h2>背包 · 词条 Build</h2>
      <div class="msub">点击装备后可花费金币重铸词条(重新抽取) · Tab/Esc 关闭</div>
      <div class="inv-layout">
        <div class="inv-slots">${cards}</div>
        <div class="stat-panel">
          <h4>属性</h4>
          单发伤害 <b style="color:#ffd24d;float:right">${Math.round(Loot.shotDmg(p))}</b><br>
          武器 <b style="float:right">${wD.name}</b><br>
          攻速 <b style="float:right">${(1 / Loot.weaponInterval(p)).toFixed(2)}/秒</b><br>
          弹丸 <b style="float:right">${wD.count + s.projExtra}</b><br>
          暴击 <b style="float:right">${Math.round(s.crit * 100)}% / ×${(s.critMult).toFixed(2)}</b><br>
          移速 <b style="float:right">${Math.round(p.speed)}</b><br>
          护甲 <b style="float:right">${s.armor}</b><br>
          闪避 <b style="float:right">${Math.round(s.dodge * 100)}%</b><br>
          吸血 <b style="float:right">${(s.lifesteal * 100).toFixed(1)}%</b><br>
          回复 <b style="float:right">${round1(s.regen)}/秒</b><br>
          拾取 <b style="float:right">${Math.round(s.pickup * 100)}%</b><br>
          幸运 <b style="float:right">${Math.round(s.luck * 100)}%</b>
          <h4>特效词条</h4>${spList}
        </div>
      </div>
      <div class="modal-btns">
        <button class="btn small" id="inv-reroll">重铸所选词条(${Loot.rerollCost(G.run.floor)}金)</button>
        <button class="btn small" id="inv-close">关闭</button>
      </div></div>`);

    let sel = selUid || (p.weapon ? p.weapon.uid : null);
    const refresh = () => this.renderInventory(sel);
    this.el.modalRoot.querySelectorAll('.item-card.selectable, .empty-slot').forEach(c => {
      c.onclick = () => {
        const i = +c.dataset.slot;
        const it = i === 0 ? p.weapon : p.passives[i - 1];
        sel = it ? it.uid : null;
        Sfx.play('ui');
        refresh();
      };
    });
    const q = id => this.el.modalRoot.querySelector(id);
    q('#inv-close').onclick = () => { Sfx.play('ui'); this.closeModal(); };
    q('#inv-reroll').onclick = () => {
      const target = (p.weapon && p.weapon.uid === sel) ? p.weapon : p.passives.find(x => x && x.uid === sel);
      if (!target) return;
      const cost = Loot.rerollCost(G.run.floor);
      if (p.gold < cost) { FX.text(p.x, p.y - 30, '金币不足', '#ff6b6b', 14); return; }
      p.gold -= cost;
      Loot.reroll(target);
      Loot.applyStats(p);
      Sfx.play('fuse');
      G.saveRun();
      refresh();
    };
  },

  // ---------------- 祭坛 ----------------
  updateAltar() {
    this.el.altarSouls.textContent = Meta.data.souls;
    this.el.altarGrid.innerHTML = META_UPGRADES.map(u => {
      const l = Meta.lvl(u.id);
      const maxed = l >= u.max;
      const cost = maxed ? 0 : u.cost(l);
      const pips = Array.from({ length: u.max }, (_, i) => `<span class="${i < l ? 'on' : ''}">●</span>`).join(' ');
      return `<div class="meta-card">
        <div class="mi"><b>${u.name}</b><div class="md">${u.desc}</div><div class="mp">${pips}</div></div>
        <button class="btn small" data-id="${u.id}" ${maxed || Meta.data.souls < cost ? 'disabled' : ''}>
          ${maxed ? '已满级' : `${cost} 💠`}</button></div>`;
    }).join('');
    this.el.altarGrid.querySelectorAll('button[data-id]').forEach(b => {
      b.onclick = () => {
        if (Meta.buy(b.dataset.id)) { Sfx.play('bless'); this.updateAltar(); }
        else Sfx.play('ui');
      };
    });
  },

  // ---------------- 死亡结算 ----------------
  showDeath(d) {
    this.el.deathStats.innerHTML = `
      <div>到达层数 <b>第 ${d.floor} 层</b></div>
      <div>本局击杀 <b>${d.kills}</b></div>
      <div>最终等级 <b>Lv.${d.level}</b></div>
      <div>携带金币 <b>${d.gold}</b></div>
      <div class="soul-line">魂晶收益 <b>+${d.souls} 💠</b></div>
      ${d.record ? '<div style="color:#ffd24d;text-align:center;margin-top:6px">✦ 新的最佳层数纪录! ✦</div>' : ''}`;
    this.showScreen('death');
  },

  showPause(show) {
    if (show) {
      this.el.pauseInfo.innerHTML = `第 ${G.run.floor} 层 · 种子 <b>${G.run.seed}</b><br>击杀 ${G.player.kills} · 魂晶 ${G.player.souls} 💠 · 等级 Lv.${G.player.level}`;
      this.updateSfxBtn();
      this.showScreen('pause');
    } else this.showScreen(null);
  },

  // ---------------- 新手引导入口(对外 API) ----------------
  // 触发条件: 首次 newRun 自动触发(见 game.js newRun); 有存档记录 flags.tutorialDone 则不再弹
  tutorialShouldAutoStart() {
    return !(Meta.data && Meta.data.flags && Meta.data.flags.tutorialDone);
  },
  startTutorial(mode, from) { Tutorial.start(mode || 'play', from); },
  tutorialFrame() { Tutorial.frame(); },
  tutorialKey(code) { Tutorial.key(code); },
  tutorialStop() { Tutorial.stop(); },
};

// ================================================================
// 新手引导: 分步 · 可跳过 · 可重看 · 不阻塞老玩家
//   mode 'play'   : 局内引导, 步骤会检测玩家真实操作(移动/开火/冲刺/拾取/进房/过层/Tab)
//   mode 'review' : 主菜单纯阅读回放(不检测操作, 只按"下一步")
// 全程使用 DOM 覆盖层, 不使用任何 alert()/confirm() 阻塞弹窗。
// ================================================================
const Tutorial = {
  steps: [
    {
      hold: true,
      title: '欢迎来到《深渊词条》',
      text: '深渊每层都是随机的房间迷宫。<b>清空房间的敌人 → 门才会开启</b>,找到 <span class="g">↓ 楼梯房</span> 里的绿色光圈按 <b>E</b> 就能进入下一层。<br>每 5 层是领主层。先花 20 秒看完下面 8 步,随时可以跳过。',
      keys: ['空格 / 回车 继续', 'Esc 跳过引导'],
    },
    {
      sel: '#hud-tl',
      title: '① 移动与瞄准',
      text: '用 <b>WASD</b>(或方向键)移动,鼠标位置就是准星方向。<b>移动中照常可以射击</b>,不会被移动打断。',
      keys: ['W A S D', '鼠标瞄准'],
      check: g => g.stat.moved > 130,
    },
    {
      sel: '#minimap',
      title: '② 攻击',
      text: '按住<b>鼠标左键</b>持续射击;单点也能连击 —— 冷却中点击会被缓冲,不会白点。准星出现<span class="g">白色十字</span>就代表这一发打中了。',
      keys: ['鼠标左键', '准星白十字 = 命中'],
      check: g => g.stat.shots >= 3,
    },
    {
      live: 'player',
      title: '③ 冲刺(保命)',
      text: '按<b>空格</b>冲刺,冲刺过程中<b>短暂无敌</b>,用来穿弹幕、脱离包围。冲刺有 1.6 秒冷却,右下角会显示状态。',
      keys: ['空格 / Shift'],
      check: g => g.stat.dashes >= 1,
    },
    {
      live: 'player',
      title: '④ 拾取与互动',
      text: '金币、药水、红心<b>走近自动收</b>;装备、宝箱、祭坛需要走到旁边,屏幕下方出现提示后按 <b>E</b> 互动。',
      keys: ['E 互动/拾取'],
      check: g => g.stat.picks >= 1,
    },
    {
      live: 'player',
      title: '⑤ 清空房间才会开门',
      text: '房门被<span class="r">血色符文</span>封住时无法通过,必须<b>清光本房间的敌人</b>。清空后门会亮起暖光,通往目标方向的那扇门还会出现<span class="g">绿色箭头</span>。',
      keys: ['清空敌人 → 门开启'],
      check: g => g.stat.rooms >= 1,
    },
    {
      live: 'exit',
      title: '⑥ 下一层入口在哪?(最容易卡住的地方)',
      text: '看三个地方:① 右上角<b>小地图</b>脉冲的 <span class="g">↓</span> 就是楼梯房;② 屏幕上方常驻<b>目标提示</b>;③ 身边跟随的<span class="g">绿色箭头</span>指向通往它的门。<br>进入楼梯房后清空敌人,房间中部的<span class="g">绿色光圈</span>就会解除封印 —— <b>走进光圈按 E</b> 进入下一层。',
      keys: ['小地图 ↓', '绿色箭头', '走进光圈按 E'],
      check: g => g.run.floor > 1,
    },
    {
      sel: '#hud-bl',
      title: '⑦ 词条与装备(Build)',
      text: '按 <b>Tab</b> 打开背包:所有装备属性都从随机<b>词条池</b>抽取,特效词条可跨装备<span class="g">叠加升阶(最高 Ⅴ)</span>。拾取新装备时可选 装备 / <b>熔合</b>强化 / 出售,金币还能重铸词条。',
      keys: ['Tab 背包', '熔合 / 重铸'],
      check: g => g.stat.tabs >= 1,
    },
    {
      hold: true,
      title: '引导结束 — 开始深入深渊',
      text: '之后可以随时重看:<b>主菜单 → ✦ 新手引导(重看)</b>,或局内按 <b>Esc</b> 暂停 → <b>✦ 新手引导(重看)</b>。<br>祝你在深渊里刷到传说。',
      keys: ['开始冒险'],
    },
  ],

  el: null, i: 0, mode: 'play', from: 'main', _fc: 0,

  init(el) {
    this.el = el;
    el.total.textContent = this.steps.length;
    el.next.onclick = () => { Sfx.play('ui'); this.next(); };
    el.skip.onclick = () => { Sfx.play('ui'); this.finish(true); };
    window.addEventListener('keydown', e => this.key(e.code));
  },

  get active() { return !!(G.tutorial && G.tutorial.active); },

  start(mode, from) {
    this.mode = mode || 'play';
    this.from = from || 'main';
    this.i = 0;
    if (!G.tutorial) G.tutorial = { active: false, hold: false, step: 0 };
    G.tutorial.active = true;
    G.tutorial.hold = false;
    // 重看引导: 先把画面清干净(主菜单/暂停界面), 只留游戏画面 + 引导卡片
    if (!G.stat) G.stat = { shots: 0, hits: 0, kills: 0, dashes: 0, picks: 0, rooms: 0, tabs: 0, moved: 0 };
    // 重看时把行为计数归零, 让"第②③④步"能被真实操作触发
    for (const k in G.stat) G.stat[k] = 0;
    this._returnScreen = (mode === 'review') ? this.from : null;
    if (mode === 'review') UI.showScreen(null);
    this.el.root.classList.remove('hidden');
    this.render();
    this.place();
  },

  stop() {
    if (!G.tutorial) G.tutorial = { active: false, hold: false, step: 0 };
    G.tutorial.active = false;
    G.tutorial.hold = false;
    if (this.el) {
      this.el.root.classList.add('hidden');
      this.el.spot.style.display = 'none';
      this.el.arrow.style.display = 'none';
      this.el.card.classList.remove('center', 'at-bottom');
    }
    this.mode = 'play';
  },

  // 结束引导: skip=true 表示玩家主动跳过(同样记为"看过了", 不再自动弹)
  finish(skipped) {
    const wasReview = this.mode === 'review';
    const back = this._returnScreen;
    this.stop();
    this.markDone();
    if (wasReview && back) {
      UI.showScreen(back);
      if (back === 'main') UI.refreshMenu();
    }
    if (!skipped && !wasReview) UI.banner('新手引导结束', '随时可在 主菜单 → ✦ 新手引导 重看', 2400);
  },

  markDone() {
    if (!Meta.data.flags) Meta.data.flags = { tutorialDone: false, tutorialRuns: 0 };
    Meta.data.flags.tutorialDone = true;
    Meta.data.flags.tutorialRuns = (Meta.data.flags.tutorialRuns || 0) + 1;
    Meta.save();
  },

  next() {
    if (!this.active) return;
    if (this.i >= this.steps.length - 1) { this.finish(false); return; }
    this.i++;
    G.tutorial.step = this.i;
    this.render();
    this.place();
  },

  key(code) {
    if (!this.active) return;
    if (code === 'Escape') { this.finish(true); return; }
    const st = this.steps[this.i];
    if (st && st.hold && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) this.next();
  },

  render() {
    const st = this.steps[this.i];
    if (!st) return;
    // 同步"是否冻结世界"给 game.js (不要等到下一帧 frame() 才更新, 否则会多冻一帧)
    if (G.tutorial) G.tutorial.hold = !!st.hold;
    const el = this.el;
    el.num.textContent = this.i + 1;
    el.title.textContent = st.title;
    el.text.innerHTML = st.text;
    el.keys.innerHTML = (st.keys || []).map(k => `<span>${k}</span>`).join('');
    el.dots.innerHTML = this.steps.map((s, k) => `<i class="${k === this.i ? 'on' : (k < this.i ? 'done' : '')}"></i>`).join('');
    el.next.textContent = (this.i >= this.steps.length - 1) ? '开始冒险 ▸' : '下一步 ▸';
    el.veil.classList.toggle('solid', !!st.hold);
  },

  // 每帧同步(由 G.render 调用): 推进检测 + 高亮位置
  frame() {
    if (!this.active) return;
    // 三选一/拾取等弹窗打开时, 引导先让位(避免两个界面叠在一起)
    const blocked = !!G.modal;
    this.el.root.classList.toggle('hidden', blocked);
    if (blocked) return;
    const st = this.steps[this.i];
    if (!st) return;
    G.tutorial.hold = !!st.hold;
    if (this.mode === 'play' && st.check && G.state === 'play' && st.check(G)) { this.next(); return; }
    this._fc = (this._fc + 1) % 3;
    if (this._fc) return;      // 位置同步降到 ~20Hz, 不吃渲染性能
    this.place();
  },

  _stageRect() { return document.getElementById('stage').getBoundingClientRect(); },
  _toStage(r) {
    const s = this._stageRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  },
  _canvasToStage(x, y) {
    const c = document.getElementById('game').getBoundingClientRect();
    const s = this._stageRect();
    return { x: c.left - s.left + x / ROOM_W * c.width, y: c.top - s.top + y / ROOM_H * c.height };
  },

  // 当前步骤要高亮的区域(舞台坐标系); null → 用柔光暗角
  targetRect(st) {
    if (this.mode !== 'play') return null;
    if (st.live === 'player' && G.player) {
      const c = this._canvasToStage(G.player.x, G.player.y);
      return { x: c.x - 40, y: c.y - 40, w: 80, h: 80 };
    }
    if (st.live === 'exit') {
      const pk = (G.cur && G.cur.exitPk) || (G.pickups || []).find(q => q.type === 'next');
      if (pk) { const c = this._canvasToStage(pk.x, pk.y); return { x: c.x - 56, y: c.y - 56, w: 112, h: 112 }; }
      const mm = document.getElementById('minimap');
      return mm ? this._toStage(mm.getBoundingClientRect()) : null;
    }
    if (st.sel) {
      const n = document.querySelector(st.sel);
      if (n && !n.classList.contains('hidden')) return this._toStage(n.getBoundingClientRect());
    }
    return null;
  },

  place() {
    if (!this.active || !this.el) return;
    const st = this.steps[this.i];
    if (!st) return;
    const r = this.targetRect(st);
    const el = this.el;
    if (r && r.w > 6 && r.h > 6) {
      el.spot.style.display = 'block';
      el.spot.style.left = Math.round(r.x - 9) + 'px';
      el.spot.style.top = Math.round(r.y - 9) + 'px';
      el.spot.style.width = Math.round(r.w + 18) + 'px';
      el.spot.style.height = Math.round(r.h + 18) + 'px';
      el.veil.style.display = 'none';
      el.arrow.style.display = 'block';
      el.arrow.style.left = Math.round(r.x + r.w / 2 - 10) + 'px';
      el.arrow.style.top = Math.round(r.y - 34) + 'px';
      el.card.classList.remove('center');
    } else {
      el.spot.style.display = 'none';
      el.arrow.style.display = 'none';
      el.veil.style.display = 'block';
      el.card.classList.toggle('center', !!st.hold);
    }
    const boss = !!(G.enemies && G.enemies.some(e => e.boss && !e.dead));
    el.card.classList.toggle('at-bottom', boss && !el.card.classList.contains('center'));
  },
};

