'use strict';
// ================================================================
// UI 层: HUD / 小地图 / 全屏菜单 / 局内弹窗(升级·祭坛·拾取·背包)
// ================================================================
const UI = {
  el: {}, _cache: {}, _bannerT: null, _mctx: null,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), hpfill: $('hpfill'), hptext: $('hptext'), xpfill: $('xpfill'), lvtext: $('lvtext'),
      shieldtag: $('shieldtag'), floortext: $('floortext'), roomtext: $('roomtext'),
      goldtext: $('goldtext'), buffrow: $('buffrow'), dashind: $('dashind'),
      bossbar: $('bossbar'), bossname: $('bossname'), bossbarfill: $('bossbarfill'),
      interacttip: $('interacttip'), banner: $('banner'), bannerMain: $('banner-main'), bannerSub: $('banner-sub'),
      modalRoot: $('modal-root'), novaind: $('novaind'),
      screens: { main: $('screen-main'), altar: $('screen-altar'), help: $('screen-help'), pause: $('screen-pause'), death: $('screen-death') },
      menuStats: $('menu-stats'), seedInput: $('seed-input'), btnContinue: $('btn-continue'),
      altarGrid: $('altar-grid'), altarSouls: $('altar-souls'), pauseInfo: $('pause-info'), deathStats: $('death-stats'),
      btnSfx: $('btn-sfx'),
    };
    this._mctx = document.getElementById('minimap').getContext('2d');

    // ---- 按钮事件 ----
    $('btn-new').onclick = () => { Sfx.ensure(); Sfx.play('ui'); const v = this.el.seedInput.value.trim(); G.newRun(v); };
    this.el.btnContinue.onclick = () => { Sfx.ensure(); Sfx.play('ui'); G.continueRun(); };
    $('btn-altar').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.showScreen('altar'); this.updateAltar(); };
    $('btn-altar-back').onclick = () => { Sfx.play('ui'); this.showScreen('main'); this.refreshMenu(); };
    $('btn-help').onclick = () => { Sfx.ensure(); Sfx.play('ui'); this.showScreen('help'); };
    $('btn-help-back').onclick = () => { Sfx.play('ui'); this.showScreen(this._helpFrom || 'main'); };
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
    const total = G.floorData.rooms.filter(r => r.type !== 'start').length;
    const done = G.floorData.rooms.filter(r => r.type !== 'start' && r.cleared).length;
    this.setTxt(this.el.roomtext, `探索 ${done}/${total}`);
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
    // 互动提示
    if (G.interactTarget) {
      this.el.interacttip.classList.remove('hidden');
      this.setTxt(this.el.interacttip, `[E] ${G.interactTarget.label}`);
    } else this.el.interacttip.classList.add('hidden');
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
    });
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
};
