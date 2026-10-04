/* ============================================================
   情绪花园 — UI 层
   HUD / 种植向导（颜色·文字·音乐）/ 照料面板 / 图鉴 / 日志·年轮 /
   商店 / 成就 / 设置 / 分享卡片 / 冥想 / 回顾信 / 新手引导
   ============================================================ */
window.EG = window.EG || {};

EG.toast = function (msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
  while (wrap.children.length > 3) wrap.firstChild.remove();
};

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function emoTag(cat, it) {
  const e = EG.EMOTIONS[cat];
  return `<span class="tag" style="background:${e.color}">${e.symbol} ${e.name}${it != null ? ' · ' + it + '/10' : ''}</span>`;
}

/* ---------------- 模态框 ---------------- */
EG.UI = {
  modalStack: [],
  modal(title, bodyHTML, opts = {}) {
    const bd = h(`<div class="modal-backdrop"><div class="modal ${opts.wide ? 'wide' : ''}">
      <div class="modal-head"><h2>${title}</h2><button class="modal-close">✕</button></div>
      <div class="modal-body"></div></div></div>`);
    const body = bd.querySelector('.modal-body');
    body.innerHTML = bodyHTML;
    const close = () => {
      bd.classList.remove('show');
      setTimeout(() => bd.remove(), 200);
      this.modalStack = this.modalStack.filter(x => x !== bd);
      if (opts.onClose) opts.onClose();
    };
    bd.querySelector('.modal-close').onclick = close;
    if (!opts.static) bd.addEventListener('pointerdown', e => { if (e.target === bd) close(); });
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('show'));
    this.modalStack.push(bd);
    return { bd, body, close };
  },
  closeTop() { const top = this.modalStack[this.modalStack.length - 1]; if (top) top.querySelector('.modal-close').click(); },

  /* ---------------- HUD ---------------- */
  refreshHUD() {
    const g = EG.G; if (!g) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('gname', g.name);
    set('lv', g.level);
    set('crystals', g.crystals);
    const exp = document.getElementById('expfill');
    if (exp) exp.style.width = Math.min(100, g.exp / EG.Game.expNeed(g.level) * 100) + '%';
    const ecoMap = [['sun', '#F2A93B', '日照'], ['hum', '#6FA8C9', '湿度'], ['fer', '#8FA06B', '肥力'], ['har', '#E891A0', '和谐']];
    ecoMap.forEach(([k, c, label], i) => {
      const bar = document.getElementById('eco-' + k);
      if (bar) { bar.style.width = Math.round(g.eco[k]) + '%'; bar.style.background = c; bar.parentElement.previousElementSibling.textContent = label + ' ' + Math.round(g.eco[k]); }
    });
    const snd = document.getElementById('btn-sound');
    if (snd) snd.textContent = (g.settings.bgm || g.settings.sfx) ? '🔊' : '🔇';
    document.documentElement.style.setProperty('--fs', (g.settings.fontScale || 100) / 100);
    document.body.classList.toggle('hc', !!g.settings.highContrast);
  },

  refreshCare() {
    const panel = document.getElementById('care-panel');
    if (!panel || !panel._pid) return;
    const pl = EG.G.plants[panel._pid];
    if (!pl) { panel.classList.remove('show'); panel._pid = null; return; }
    this.renderCare(pl);
  },

  /* ---------------- 照料面板 ---------------- */
  openCare(pid) {
    const panel = document.getElementById('care-panel');
    panel._pid = pid;
    EG.Garden.selectedPlant = pid;
    EG.Garden.mode = 'view';
    this.setToolActive(null);
    this.renderCare(EG.G.plants[pid]);
    panel.classList.add('show');
    if (EG.Tutorial.step === 2) EG.Tutorial.advance();
  },
  closeCare() {
    const panel = document.getElementById('care-panel');
    panel.classList.remove('show');
    panel._pid = null;
    EG.Garden.selectedPlant = null;
  },
  renderCare(pl) {
    const panel = document.getElementById('care-panel');
    const sp = EG.PLANT_BY_ID[pl.species];
    const stage = EG.stageOf(pl.growth);
    const e = EG.EMOTIONS[pl.emo.cat];
    const stageColor = stage >= 4 ? e.color : '#7BA05B';
    const cdWater = EG.Game.effMs(pl.lastWater) < 30 * 60e3;
    const hoursToWither = pl.bloomedAt ? Math.max(0, 72 - EG.Game.effMs(pl.bloomedAt) / 3.6e6) : null;
    const items = EG.G.inv.items;
    panel.innerHTML = `
      <div class="care-head">
        <div class="p-ico">${pl.withered ? '🥀' : stage >= 4 ? '🌸' : stage >= 1 ? '🌿' : '🌰'}</div>
        <div>
          <div class="p-name">${sp.name} ${pl.variant === 1 ? '<span style="color:#D9534F;font-size:.7rem">重瓣</span>' : pl.variant === 2 ? '<span style="color:#F2A93B;font-size:.7rem">星辉</span>' : ''}</div>
          <div class="p-meta">${emoTag(pl.emo.cat, pl.emo.intensity)} · 由${{ color: '颜色', text: '一句话', music: '音乐' }[pl.inputType] || '心'}种下 ${pl.forFriend ? '· 为朋友而种' : ''}</div>
        </div>
        <button class="modal-close" style="margin-left:auto" id="care-close">✕</button>
      </div>
      <div class="growth-row">
        <div class="gbar"><i style="width:${Math.round(pl.growth)}%;background:${stageColor}"></i></div>
        <div class="glabel"><span>${EG.STAGES[stage]} · ${Math.round(pl.growth)}/100</span><span>${pl.withered ? '已凋谢' : pl.wilt > 0 ? '🥀 萎靡 ' + Math.round(pl.wilt) : '状态良好'}</span></div>
      </div>
      ${pl.withered ? `
        <div class="care-actions" style="grid-template-columns:1fr 1fr">
          <button id="care-spray"><span class="ci">🌫️</span>记忆喷雾${(items.spray || 0) > 0 ? ' ×' + items.spray : ''}</button>
          <button id="care-bye"><span class="ci">🌾</span>温柔告别</button>
        </div>
        <div class="care-note">凋谢不是消失——它化作养分与纪念花束，留在你的图鉴里。</div>
      ` : `
        <div class="care-actions">
          <button id="care-water" ${cdWater ? 'disabled' : ''}><span class="ci">💧</span>浇水 +8</button>
          <button id="care-light"><span class="ci">☀️</span>调光</button>
          <button id="care-melody"><span class="ci">🎵</span>旋律 +6</button>
          <button id="care-listen"><span class="ci">👂</span>倾听 +10~20</button>
          <button id="care-prune" ${pl.wilt <= 0 ? 'disabled' : ''}><span class="ci">✂️</span>剪枝</button>
          <button id="care-pot"><span class="ci">🪴</span>换盆</button>
          <button id="care-honey" ${(items.honey_fruit || 0) <= 0 ? 'disabled' : ''}><span class="ci">🍯</span>蜜糖果实 ×${items.honey_fruit || 0}</button>
          <button id="care-starfer" ${(items.starfer || 0) <= 0 ? 'disabled' : ''}><span class="ci">✨</span>星光肥料 ×${items.starfer || 0}</button>
          <button id="care-share"><span class="ci">📷</span>植物卡</button>
        </div>
        <div class="light-pick" id="light-pick">
          <button data-l="bright">☀️ 明亮 ${sp.pref === 'bright' ? '♥' : ''}</button>
          <button data-l="soft">🌤️ 柔和 ${sp.pref === 'soft' ? '♥' : ''}</button>
          <button data-l="dim">🌥️ 温暗 ${sp.pref === 'dim' ? '♥' : ''}</button>
        </div>
        <div id="listen-box">
          <textarea id="listen-input" maxlength="50" placeholder="对它说一句话吧……（它会认真听）"></textarea>
          <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">
            <button class="btn small ghost" id="listen-cancel">先不用</button>
            <button class="btn small" id="listen-send">说给它听</button>
          </div>
        </div>
        ${stage >= 4 ? `<button class="btn full gold" id="care-harvest" style="margin-top:10px">🌸 收获${hoursToWither != null ? `（${Math.ceil(hoursToWither)} 小时后自然凋谢）` : ''}</button>` : ''}
        <div class="care-note">${sp.desc}</div>
      `}`;
    const $ = id => panel.querySelector('#' + id);
    $('care-close').onclick = () => this.closeCare();
    if (pl.withered) {
      $('care-spray').onclick = () => { if ((EG.G.inv.items.spray || 0) > 0) EG.Game.useItemOnPlant(pl.id, 'spray'); else EG.toast('背包里没有记忆喷雾，可以去商店看看'); };
      $('care-bye').onclick = () => {
        if (confirm(`与「${sp.name}」温柔告别吗？它会化作养分与一束纪念。`)) { EG.Game.clearWithered(pl.id); this.closeCare(); }
      };
    } else {
      $('care-water').onclick = () => EG.Game.water(pl.id);
      $('care-light').onclick = () => panel.querySelector('#light-pick').classList.toggle('show');
      panel.querySelectorAll('#light-pick button').forEach(b => b.onclick = () => {
        EG.Game.setLight(pl.id, b.dataset.l);
        panel.querySelector('#light-pick').classList.remove('show');
      });
      $('care-melody').onclick = () => EG.Game.playMelody(pl.id);
      $('care-listen').onclick = () => { panel.querySelector('#listen-box').classList.toggle('show'); const ta = panel.querySelector('#listen-input'); if (ta) ta.focus(); };
      $('listen-cancel').onclick = () => panel.querySelector('#listen-box').classList.remove('show');
      $('listen-send').onclick = () => {
        const ta = panel.querySelector('#listen-input');
        if (ta.value.trim()) { EG.Game.listen(pl.id, ta.value); ta.value = ''; panel.querySelector('#listen-box').classList.remove('show'); }
      };
      $('care-prune').onclick = () => EG.Game.prune(pl.id);
      $('care-pot').onclick = () => { EG.Game.changePot(pl.id); };
      $('care-honey').onclick = () => EG.Game.useItemOnPlant(pl.id, 'honey_fruit');
      $('care-starfer').onclick = () => EG.Game.useItemOnPlant(pl.id, 'starfer');
      $('care-share').onclick = () => this.openShare(pl.id);
      const hv = $('care-harvest');
      if (hv) hv.onclick = () => this.doHarvest(pl.id);
    }
  },

  doHarvest(pid) {
    const r = EG.Game.harvest(pid);
    this.closeCare();
    if (!r) return;
    EG.Tutorial.onHarvested();
    const sp = r.species;
    const { body, close } = this.modal('绽放结算', `
      <div style="text-align:center">
        <canvas id="harv-thumb" style="width:180px;height:150px"></canvas>
        <h3 style="margin:4px 0">${sp.name}${r.variant === 1 ? ' · 重瓣' : r.variant === 2 ? ' · 星辉' : ''}</h3>
        <p style="color:var(--ink-l);font-size:.85rem">${sp.desc}</p>
        <div style="margin:12px 0;font-size:1.1rem">获得情绪结晶 <b style="color:var(--gold)">+${r.gain} 💠</b></div>
        ${r.drop ? `<div style="font-size:.9rem">还掉落了 ${EG.ITEMS.find(i => i.id === r.drop).icon} ${EG.ITEMS.find(i => i.id === r.drop).name} ×1</div>` : ''}
        <p class="quote">图鉴里又多了一页。谢谢你的照料。${EG.pick(EG.KIND_WORDS)}</p>
        <button class="btn" id="harv-ok" style="margin-top:10px">好呀</button>
      </div>`);
    requestAnimationFrame(() => {
      const c = body.querySelector('#harv-thumb');
      if (c) EG.drawPlantThumb(c, sp.id, 'share' + sp.id, r.variant, 100);
    });
    body.querySelector('#harv-ok').onclick = close;
  },

  /* ---------------- 种植向导 ---------------- */
  W: null,
  openWizard(forceTab) {
    EG.MusicPlayer.stop();
    this.W = { tab: forceTab || null, parsed: null, color: { h: 210, s: 70, l: 55 }, note: '', track: null };
    const { body, close, bd } = this.modal('今天的情绪', `<div id="wiz"></div>`, {
      onClose: () => { EG.MusicPlayer.stop(); if (EG.Garden.pendingSeed && EG.Garden.mode === 'plant' && false) {} },
    });
    this._wizBody = body; this._wizClose = close;
    this.renderWizard();
  },
  renderWizard() {
    const W = this.W, body = this._wizBody;
    const root = body.querySelector('#wiz');
    const steps = `<div class="wiz-steps"><i class="${W.tab ? 'on' : ''}"></i><i class="${W.parsed ? 'on' : ''}"></i><i></i></div>`;
    if (!W.tab) {
      root.innerHTML = `${steps}
        <p style="text-align:center;color:var(--ink-l);font-size:.9rem">此刻的心情，想用什么方式告诉我？</p>
        <div class="input-pick">
          <button data-t="color"><span class="ico">🎨</span>选一个颜色</button>
          <button data-t="text"><span class="ico">✍️</span>写一句话</button>
          <button data-t="music"><span class="ico">🎵</span>选一段音乐</button>
        </div>
        <p class="quote">情绪没有好坏，每一种都值得被看见。</p>`;
      root.querySelectorAll('.input-pick button').forEach(b => b.onclick = () => { W.tab = b.dataset.t; this.renderWizard(); });
      return;
    }
    if (!W.parsed) {
      if (W.tab === 'color') this.wizColor(root, steps);
      else if (W.tab === 'text') this.wizText(root, steps);
      else this.wizMusic(root, steps);
      return;
    }
    this.wizConfirm(root, steps);
  },

  wizColor(root, steps) {
    root.innerHTML = `${steps}
      <div id="wheel-wrap">
        <canvas id="wheel" width="240" height="240" style="width:240px;height:240px"></canvas>
        <div class="color-preview">
          <div class="sw" id="color-sw"></div>
          <div style="flex:1">
            <div style="font-size:.85rem">明度：<span id="l-val">55</span>%（亮 → 更高昂，暗 → 更低回）</div>
            <input type="range" class="lslider" id="l-slider" min="15" max="92" value="${this.W.color.l}">
          </div>
        </div>
        <p style="font-size:.88rem;margin-top:4px">这种颜色，今天更接近哪一句？</p>
        <div class="word-chips" id="color-words"></div>
      </div>`;
    const wheel = root.querySelector('#wheel');
    const ctx = wheel.getContext('2d');
    const R = 120;
    for (let a = 0; a < 360; a += 1) {
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R, (a - 90.6) * Math.PI / 180, (a - 89.4) * Math.PI / 180);
      ctx.closePath();
      ctx.fillStyle = `hsl(${a},95%,50%)`;
      ctx.fill();
    }
    const white = ctx.createRadialGradient(R, R, 0, R, R, R);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(0.75, 'rgba(255,255,255,.45)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.beginPath(); ctx.arc(R, R, R, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,80,60,.9)'; ctx.beginPath(); ctx.arc(R, R, 13, 0, 7); ctx.fill();
    const pick = e => {
      const r = wheel.getBoundingClientRect();
      const x = (e.clientX - r.left) * 240 / r.width - R, y = (e.clientY - r.top) * 240 / r.height - R;
      if (Math.hypot(x, y) > R) return;
      const d = ctx.getImageData(R + x, R + y, 1, 1).data;
      const [h, s] = EG.rgbToHsl(d[0], d[1], d[2]);
      this.W.color.h = h; this.W.color.s = Math.max(25, s);
      this.updateColorPreview();
      EG.SFX.pop();
    };
    wheel.addEventListener('pointerdown', pick);
    wheel.addEventListener('pointermove', e => { if (e.buttons) pick(e); });
    const slider = root.querySelector('#l-slider');
    slider.oninput = () => { this.W.color.l = +slider.value; this.updateColorPreview(); };
    const words = root.querySelector('#color-words');
    EG.COLOR_WORDS.forEach(w => {
      const b = h(`<button>${EG.EMOTIONS[w.cat].symbol} ${w.t}</button>`);
      b.onclick = () => {
        const c = this.W.color;
        const base = EG.parseColor(c.h, c.s, c.l);
        this.W.parsed = { ...base, cat: w.cat, sub: EG.nearestEmotion(base.v, base.a, w.cat), intensity: w.it, confidence: 0.9, matched: [...base.matched, { w: w.t, c: w.cat, s: 1.5 }] };
        this.W.note = `今天的颜色像「${w.t}」`;
        EG.SFX.click();
        this.renderWizard();
      };
      words.appendChild(b);
    });
    this.updateColorPreview();
  },
  updateColorPreview() {
    const body = this._wizBody; if (!body) return;
    const c = this.W.color;
    const sw = body.querySelector('#color-sw'); if (!sw) return;
    sw.style.background = EG.hslStr(c.h, c.s, c.l);
    body.querySelector('#l-val').textContent = Math.round(c.l);
  },

  wizText(root, steps) {
    root.innerHTML = `${steps}
      <textarea id="text-input" maxlength="50" placeholder="今天怎么样？一两句话就好……"></textarea>
      <div class="char-count"><span id="tc">0</span>/50</div>
      <div id="text-extra"></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
        <button class="btn ghost" id="text-back">换一种方式</button>
        <button class="btn" id="text-go">让花园听一听</button>
      </div>
      <p class="quote">文字只在本地的花园里生根，不会被上传。</p>`;
    const ta = root.querySelector('#text-input');
    ta.focus();
    ta.oninput = () => root.querySelector('#tc').textContent = ta.value.length;
    root.querySelector('#text-back').onclick = () => { this.W.tab = null; this.renderWizard(); };
    root.querySelector('#text-go').onclick = () => {
      const text = ta.value.trim();
      if (!text) { EG.toast('写下一两个字也可以的'); return; }
      const r = EG.parseText(text);
      this.W.note = text;
      if (r && !r.fail) { this.W.parsed = r; EG.SFX.click(); this.renderWizard(); }
      else this.wizFallback(root.querySelector('#text-extra'));
    };
  },
  wizFallback(box) {
    const ans = { v: 0, a: 0 };
    box.innerHTML = '';
    EG.FALLBACK_Q.forEach((q, qi) => {
      const row = h(`<div style="margin-top:10px"><div style="font-size:.88rem;margin-bottom:6px">${q.q}</div>
        <div class="emo-swap">${q.opts.map((o, oi) => `<button data-qi="${qi}" data-oi="${oi}">${o.t}</button>`).join('')}</div></div>`);
      row.querySelectorAll('button').forEach(b => b.onclick = () => {
        const o = EG.FALLBACK_Q[+b.dataset.qi].opts[+b.dataset.oi];
        if (o.v !== undefined) ans.v = o.v; else ans.a = o.a;
        row.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        EG.SFX.pop();
        if ((ans.v !== 0 || b.dataset.qi === '0') && box.querySelectorAll('button.on').length >= 2) {
          const r = EG.parseFallback(ans.v || 0.2, ans.a || 0);
          this.W.parsed = r;
          setTimeout(() => this.renderWizard(), 240);
        }
      });
      box.appendChild(row);
    });
  },

  wizMusic(root, steps) {
    root.innerHTML = `${steps}
      <div class="music-sub">
        <button class="seg on" id="mus-lib">🎧 内置曲库</button>
        <button class="seg" id="mus-file">📁 分析我的音乐</button>
      </div>
      <div id="mus-box"></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn ghost" id="mus-back">换一种方式</button>
      </div>
      <p class="quote">导入的音乐只在本地分析，不会上传，也不保存文件。</p>`;
    const box = root.querySelector('#mus-box');
    root.querySelector('#mus-back').onclick = () => { EG.MusicPlayer.stop(); this.W.tab = null; this.renderWizard(); };
    const lib = () => {
      root.querySelector('#mus-lib').classList.add('on');
      root.querySelector('#mus-file').classList.remove('on');
      box.innerHTML = `<div class="track-list">${EG.MUSIC_LIB.map(t =>
        `<div class="track" data-id="${t.id}"><div><div class="t-name">${t.name}</div><div class="t-desc">${t.desc} · ${t.bpm} BPM</div></div><span class="t-play">▶</span></div>`).join('')}</div>`;
      box.querySelectorAll('.track').forEach(el => el.onclick = () => {
        const track = EG.MUSIC_LIB.find(t => t.id === el.dataset.id);
        box.querySelectorAll('.track').forEach(x => x.classList.remove('playing'));
        el.classList.add('playing');
        el.querySelector('.t-play').textContent = '⏸';
        EG.MusicPlayer.play(track);
        this.W.track = track;
        this.W.parsed = EG.parseTrack(track);
        this.W.note = `听了《${track.name}》`;
        EG.toast('选好了就点右下角「下一步」');
        this.addWizNext(box);
      });
      if (this.W.track) this.addWizNext(box);
    };
    const file = () => {
      root.querySelector('#mus-lib').classList.remove('on');
      root.querySelector('#mus-file').classList.add('on');
      EG.MusicPlayer.stop();
      box.innerHTML = `
        <div id="file-drop">点击选择一首本地音频文件<br><span style="font-size:.72rem">mp3 / wav / ogg / m4a 均可</span></div>
        <input type="file" id="file-input" accept="audio/*" style="display:none">`;
      const drop = box.querySelector('#file-drop');
      drop.onclick = () => box.querySelector('#file-input').click();
      box.querySelector('#file-input').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        box.innerHTML = `<div class="analyzing"><span class="spin">🌫️</span>正在听这首歌……<br><span style="font-size:.75rem">FFT 频谱 / 节拍 / 能量分析中</span></div>`;
        try {
          const buf = await EG.decodeAudioFile(f);
          await new Promise(r => setTimeout(r, 350));
          const r = EG.analyzeAudioBuffer(buf);
          this.W.parsed = r;
          this.W.note = `分析了《${f.name.slice(0, 20)}》`;
          box.innerHTML = `<div class="result-card" style="margin-top:8px">
            <div style="font-size:.8rem;color:var(--ink-l)">特征：${r.matched[0].w}</div>
            <div style="margin-top:6px">${emoTag(r.cat)} <span style="font-size:.8rem;color:var(--ink-l)">置信度 ${Math.round(r.confidence * 100)}%</span></div>
            <p class="quote">置信度不高也没关系，下一步可以手动微调。</p></div>`;
          this.addWizNext(box);
        } catch (err) {
          box.innerHTML = `<div class="analyzing">这首文件读不出来，换一首试试？🥺</div>`;
        }
      };
    };
    root.querySelector('#mus-lib').onclick = lib;
    root.querySelector('#mus-file').onclick = file;
    lib();
  },
  addWizNext(box) {
    if (box.querySelector('#mus-next')) return;
    const b = h(`<button class="btn" id="mus-next" style="margin-top:12px;width:100%">下一步 · 确认情绪</button>`);
    b.onclick = () => this.renderWizard();
    box.appendChild(b);
  },

  wizConfirm(root, steps) {
    const W = this.W, r = W.parsed;
    root.innerHTML = `${steps}
      <div class="result-card">
        <div style="font-size:.82rem;color:var(--ink-l)">我感受到……</div>
        <div class="result-emo">${EG.EMOTIONS[r.cat].symbol} <span style="color:${EG.EMOTIONS[r.cat].color}">${EG.EMOTIONS[r.cat].name}</span></div>
        <div class="result-sub">还带着一点${EG.EMOTIONS[r.sub].name} · 强度 <b id="it-val">${r.intensity}</b>/10 · 置信度 ${Math.round(r.confidence * 100)}%</div>
        <div class="intensity-row">
          <span style="font-size:.78rem;color:var(--ink-l)">微弱</span>
          <input type="range" id="it-slider" min="1" max="10" value="${r.intensity}">
          <span style="font-size:.78rem;color:var(--ink-l)">强烈</span>
        </div>
        <div class="emo-swap" id="emo-swap">${EG.EMO_LIST.map(c =>
          `<button data-c="${c}" class="${c === r.cat ? 'on' : ''}">${EG.EMOTIONS[c].symbol} ${EG.EMOTIONS[c].name}</button>`).join('')}</div>
        <div style="margin-top:10px;font-size:.78rem;color:var(--ink-l)">解析依据：${r.matched.map(m => m.w).join(' · ')}</div>
      </div>
      <p class="quote">「${EG.EMOTIONS[r.cat].quote}」</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
        <button class="btn ghost" id="cf-back">返回修改</button>
        <button class="btn" id="cf-next">下一步 · 选地播种</button>
      </div>`;
    const slider = root.querySelector('#it-slider');
    slider.oninput = () => { W.parsed.intensity = +slider.value; root.querySelector('#it-val').textContent = slider.value; };
    root.querySelectorAll('#emo-swap button').forEach(b => b.onclick = () => {
      W.parsed.cat = b.dataset.c;
      W.parsed.sub = EG.nearestEmotion(W.parsed.v || 0, W.parsed.a || 0, b.dataset.c);
      root.querySelectorAll('#emo-swap button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      EG.SFX.pop();
    });
    root.querySelector('#cf-back').onclick = () => { W.parsed = null; this.renderWizard(); };
    root.querySelector('#cf-next').onclick = () => {
      this._wizClose();
      const seed = {
        cat: W.parsed.cat, intensity: W.parsed.intensity,
        v: W.parsed.v ?? EG.EMOTIONS[W.parsed.cat].v, a: W.parsed.a ?? EG.EMOTIONS[W.parsed.cat].a,
        inputType: W.tab, note: W.note,
        seedStr: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      };
      EG.Garden.pendingSeed = seed;
      EG.Garden.mode = 'plant';
      this.setToolActive('plant');
      this.hint('点一块亮起的空地，把情绪种下去 🌱');
    };
  },

  /* ---------------- 工具条 ---------------- */
  setToolActive(name) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
    EG.Garden.mode = name === 'plant' ? 'plant' : name === 'harvest' ? 'harvest' : 'view';
  },
  hint(text) {
    const el = document.getElementById('tool-hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => el.classList.remove('show'), 4000);
  },

  /* ---------------- 图鉴 ---------------- */
  openDex(tab = 'plant') {
    const { body } = this.modal('图鉴 · 花园的记忆', `
      <div class="dex-tabs">
        <button class="seg ${tab === 'plant' ? 'on' : ''}" data-t="plant">🌿 植物</button>
        <button class="seg ${tab === 'event' ? 'on' : ''}" data-t="event">🌦️ 生态事件</button>
        <button class="seg ${tab === 'ach' ? 'on' : ''}" data-t="ach">🏅 成就</button>
      </div>
      <div id="dex-box"></div>`, { wide: true });
    body.querySelectorAll('.dex-tabs .seg').forEach(b => b.onclick = () => {
      body.querySelectorAll('.dex-tabs .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.renderDex(body.querySelector('#dex-box'), b.dataset.t);
    });
    this.renderDex(body.querySelector('#dex-box'), tab);
  },
  renderDex(box, tab) {
    const g = EG.G;
    if (tab === 'plant') {
      box.innerHTML = `<div style="font-size:.78rem;color:var(--ink-l);margin-bottom:8px">已收集 ${EG.dexFormCount(g)} / 72 种形态。同一株植物因你的情绪输入不同，模样也不会重样。</div><div class="dex-grid" id="dex-grid"></div>`;
      const grid = box.querySelector('#dex-grid');
      EG.PLANTS.forEach(sp => {
        const d = g.dex[sp.id];
        const card = h(`<div class="dex-card ${d ? '' : 'locked'}">
          <canvas></canvas>
          <div class="d-name">${d ? sp.name : '？？？'}</div>
          <div class="d-emo">${EG.EMOTIONS[sp.emo].symbol} ${EG.EMOTIONS[sp.emo].name}系 · ${sp.hours}h</div>
          <div class="vars">${[0, 1, 2].map(v => `<i class="${d && d.variants[v] ? 'on' : ''}"></i>`).join('')}</div>
        </div>`);
        grid.appendChild(card);
        const cv = card.querySelector('canvas');
        requestAnimationFrame(() => {
          if (d) EG.drawPlantThumb(cv, sp.id, 'dex' + sp.id, (d.variants[2] && 2) || (d.variants[1] && 1) || 0, 100);
          else { cv.width = 150; cv.height = 92; EG.drawPlantThumb(cv, sp.id, '???', 0, 8); }
        });
        card.onclick = () => {
          if (!d) { EG.toast('还没有遇见它——多表达，多绽放'); return; }
          this.modal(sp.name, `<div style="text-align:center">
            <canvas id="dex-big" style="width:220px;height:180px"></canvas>
            <div style="margin:6px 0">${emoTag(sp.emo)} <span class="tag" style="background:#7BA05B">喜${{ bright: '光', soft: '柔和光', dim: '阴' }[sp.pref]}</span></div>
            <p style="font-size:.88rem">${sp.desc}</p>
            <div style="font-size:.78rem;color:var(--ink-l);margin-top:6px">绽放 ${d.n} 次 · 生长周期约 ${sp.hours} 小时 · 音色：${EG.EMOTIONS[sp.emo].timbre}</div>
            <div style="font-size:.78rem;color:var(--ink-l)">形态：${[0, 1, 2].filter(v => d.variants[v]).map(v => EG.VARIANTS[v].name).join(' / ')}</div>
          </div>`);
          requestAnimationFrame(() => EG.drawPlantThumb(document.getElementById('dex-big'), sp.id, 'dex' + sp.id, (d.variants[2] && 2) || (d.variants[1] && 1) || 0, 100));
        };
      });
    } else if (tab === 'event') {
      box.innerHTML = EG.EVENTS.map(ev => `<div class="event-row"><span>${ev.icon}</span><span><b>${ev.name}</b><br><span style="font-size:.76rem;color:var(--ink-l)">${ev.desc}</span></span><span class="e-cnt">触发 ${g.eventsSeen[ev.id] || 0} 次</span></div>`).join('');
    } else {
      const done = Object.keys(g.ach).length;
      box.innerHTML = `<div style="font-size:.78rem;color:var(--ink-l);margin-bottom:6px">已解锁 ${done} / ${EG.ACHIEVEMENTS.length} 项成就</div>` +
        EG.ACHIEVEMENTS.map(a => `<div class="ach-row ${g.ach[a.id] ? 'done' : ''}">
          <div class="a-ico">${g.ach[a.id] ? a.icon : '🔒'}</div>
          <div><div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div></div>
          <div class="a-state">${g.ach[a.id] ? '✅' : ''}</div></div>`).join('');
    }
  },

  /* ---------------- 日志 ---------------- */
  calMonth: null,
  openDiary(tab = 'cal') {
    this.calMonth = EG.monthKey();
    const { body } = this.modal('情绪日志', `
      <div class="dex-tabs">
        <button class="seg ${tab === 'cal' ? 'on' : ''}" data-t="cal">📅 日历</button>
        <button class="seg ${tab === 'ring' ? 'on' : ''}" data-t="ring">🪵 情绪年轮</button>
        <button class="seg ${tab === 'journey' ? 'on' : ''}" data-t="journey">🧭 心灵旅程</button>
      </div>
      <div id="diary-box"></div>`, { wide: true });
    body.querySelectorAll('.dex-tabs .seg').forEach(b => b.onclick = () => {
      body.querySelectorAll('.dex-tabs .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.renderDiary(body.querySelector('#diary-box'), b.dataset.t);
    });
    this.renderDiary(body.querySelector('#diary-box'), tab);
  },
  renderDiary(box, tab) {
    const g = EG.G;
    if (tab === 'cal') {
      const tasks = g.tasks;
      const tk = [['record', '📝 记录 1 次情绪', 1], ['care', '🤲 照料 3 次', 3], ['harvest', '🌸 收获 1 株', 1]];
      const tasksHtml = tk.map(([k, name, goal]) => {
        const done = (tasks.progress[k] || 0) >= goal;
        const claimed = tasks.claimed[k];
        return `<div class="task-row"><div><div class="tk-name">${name}</div>
          <div class="tk-prog">${Math.min(tasks.progress[k] || 0, goal)}/${goal} · 奖励 +10 💠</div></div>
          <button class="btn small ${claimed || !done ? 'disabled' : 'gold'}" data-task="${k}">${claimed ? '已领取' : done ? '领取' : '进行中'}</button></div>`;
      }).join('');
      box.innerHTML = `
        <div style="margin-bottom:12px">${tasksHtml}</div>
        <div class="cal-head">
          <button id="cal-prev">‹</button>
          <b id="cal-title">${this.calMonth}</b>
          <button id="cal-next">›</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="diary-list" id="diary-list"><div style="text-align:center;color:var(--ink-l);font-size:.8rem;padding:8px">点选某一天，看看那天的心情</div></div>`;
      box.querySelectorAll('[data-task]').forEach(b => b.onclick = () => { if (EG.Game.claimTask(b.dataset.task)) this.renderDiary(box, 'cal'); this.refreshHUD(); });
      box.querySelector('#cal-prev').onclick = () => { this.shiftMonth(-1); this.renderDiary(box, 'cal'); };
      box.querySelector('#cal-next').onclick = () => { this.shiftMonth(1); this.renderDiary(box, 'cal'); };
      const [y, m] = this.calMonth.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const days = new Date(y, m, 0).getDate();
      const grid = box.querySelector('#cal-grid');
      '日一二三四五六'.split('').forEach(d => grid.appendChild(h(`<div class="dow">${d}</div>`)));
      for (let i = 0; i < first.getDay(); i++) grid.appendChild(h('<div class="cal-day empty"></div>'));
      const today = EG.dayKey();
      for (let d = 1; d <= days; d++) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const entries = g.diary.filter(e => EG.dayKey(new Date(e.t)) === key && ['color', 'text', 'music'].includes(e.type));
        const cell = h(`<div class="cal-day ${key === today ? 'today' : ''}"><span>${d}</span><span class="dots">${entries.slice(0, 4).map(e => `<i style="background:${EG.EMOTIONS[e.cat].color}"></i>`).join('')}</span></div>`);
        cell.onclick = () => {
          const list = box.querySelector('#diary-list');
          if (!entries.length) { list.innerHTML = `<div style="text-align:center;color:var(--ink-l);font-size:.8rem;padding:8px">${key} 这天很安静</div>`; return; }
          list.innerHTML = entries.map(e => `<div class="diary-item">
            <span style="width:10px;height:10px;border-radius:50%;background:${EG.EMOTIONS[e.cat].color};flex:none"></span>
            <span>${EG.EMOTIONS[e.cat].name}${e.intensity ? ' · ' + e.intensity + '/10' : ''}${e.text ? ' 「' + e.text + '」' : ''}</span>
            <span class="di-t">${EG.hhmm(e.t)}</span></div>`).join('');
        };
        grid.appendChild(cell);
      }
    } else if (tab === 'ring') {
      const months = Object.keys(g.months).sort();
      box.innerHTML = `<div class="ring-wrap">
        <canvas id="ring-canvas" width="300" height="300" style="width:300px;height:300px"></canvas>
        <div class="ring-legend">${EG.EMO_LIST.map(c => `<span><i style="background:${EG.EMOTIONS[c].color}"></i>${EG.EMOTIONS[c].name}</span>`).join('')}</div>
        <p style="font-size:.8rem;color:var(--ink-l);margin-top:8px">每月月末长出一圈年轮，颜色密度就是你当月的情绪结构。${months.length === 0 ? '这个月还没有记录，第一圈年轮在等你。' : `已攒下 ${months.length} 棵年轮树 🌲`}</p>
        <button class="btn ghost small" id="ring-share" style="margin-top:8px">📷 生成年轮分享卡</button>
      </div>`;
      this.drawRing(document.getElementById('ring-canvas'));
      box.querySelector('#ring-share').onclick = () => this.openShare(null, true);
    } else {
      const step = g.journeyStep;
      box.innerHTML = `<div style="font-size:.78rem;color:var(--ink-l);margin-bottom:6px">旅程 ${step} / 12 章 · 每一章都是一次温和的练习</div>` +
        EG.JOURNEY.map((j, i) => `<div class="journey-row ${i < step ? 'done' : ''}">
          <div class="j-no">${i < step ? '✓' : i + 1}</div>
          <div><div class="j-name">${j.name}</div><div class="j-desc">${j.desc}</div></div>
          <div class="j-rew">+${j.reward} 💠</div></div>`).join('');
    }
  },
  shiftMonth(d) {
    const [y, m] = this.calMonth.split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    this.calMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  },
  drawRing(canvas) {
    const g = EG.G;
    const ctx = canvas.getContext('2d');
    const cx = 150, cy = 150;
    ctx.clearRect(0, 0, 300, 300);
    /* 树干 */
    ctx.fillStyle = '#B08A5E';
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 7); ctx.fill();
    const months = Object.keys(g.months).sort().slice(-12);
    const total = months.length || 1;
    months.forEach((mk, idx) => {
      const data = g.months[mk];
      const sum = EG.EMO_LIST.reduce((s, c) => s + (data[c] || 0), 0);
      if (!sum) return;
      const r0 = 26 + idx * 19, r1 = r0 + 16;
      let a0 = -Math.PI / 2;
      for (const c of EG.EMO_LIST) {
        const frac = (data[c] || 0) / sum;
        if (frac <= 0) continue;
        const a1 = a0 + frac * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = EG.EMOTIONS[c].color;
        ctx.globalAlpha = 0.55 + 0.35 * (idx / total);
        ctx.fill();
        a0 = a1;
      }
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = 'rgba(120,90,60,.25)';
    for (let r = 26; r <= 26 + 12 * 19; r += 19) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
  },

  /* ---------------- 商店 ---------------- */
  openShop(tab = 'pot') {
    const { body } = this.modal('花园商店', `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="dex-tabs" style="margin:0">
          <button class="seg ${tab === 'pot' ? 'on' : ''}" data-t="pot">🪴 花盆</button>
          <button class="seg ${tab === 'item' ? 'on' : ''}" data-t="item">🧪 道具</button>
          <button class="seg ${tab === 'decor' ? 'on' : ''}" data-t="decor">✨ 装饰</button>
          <button class="seg ${tab === 'bag' ? 'on' : ''}" data-t="bag">🎒 背包</button>
        </div>
        <span class="chip" style="font-size:.85rem">💠 <b id="shop-crystal">${EG.G.crystals}</b></span>
      </div>
      <div id="shop-box"></div>`, { wide: true });
    body.querySelectorAll('.dex-tabs .seg').forEach(b => b.onclick = () => {
      body.querySelectorAll('.dex-tabs .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.renderShop(body.querySelector('#shop-box'), b.dataset.t);
      const c = body.querySelector('#shop-crystal'); if (c) c.textContent = EG.G.crystals;
    });
    this.renderShop(body.querySelector('#shop-box'), tab);
  },
  renderShop(box, tab) {
    const g = EG.G;
    if (tab === 'bag') {
      const items = EG.ITEMS.map(it => {
        const n = g.inv.items[it.id] || 0;
        return `<div class="shop-card"><div class="s-ico">${it.icon}</div><div class="s-name">${it.name} ×${n}</div>
          <div class="s-desc">${it.desc}</div>
          ${it.id === 'dew' ? `<button class="btn small ${n > 0 ? '' : 'disabled'}" data-usedew="1">使用</button>` : `<div class="owned" style="font-size:.72rem">${n > 0 ? '点一株植物使用' : '暂无存货'}</div>`}</div>`;
      }).join('');
      box.innerHTML = `<div class="shop-grid">${items}</div>`;
      const b = box.querySelector('[data-usedew]');
      if (b) b.onclick = () => { EG.Game.useDew(); this.refreshHUD(); };
      return;
    }
    const defs = tab === 'pot' ? EG.POTS.filter(p => p.price > 0) : tab === 'item' ? EG.ITEMS : EG.DECORS;
    box.innerHTML = `<div class="shop-grid">${defs.map(d => {
      const owned = tab === 'pot' ? g.inv.pots[d.id] : tab === 'decor' ? g.inv.decor[d.id] : false;
      return `<div class="shop-card">
        ${tab === 'pot' ? '<canvas></canvas>' : `<div class="s-ico">${d.icon || '🧪'}</div>`}
        <div class="s-name">${d.name}</div>
        <div class="s-desc">${d.desc || ''}</div>
        ${owned ? '<div class="owned">已拥有 ✓</div>' : `<button class="btn small gold" data-buy="${d.id}">💠 ${d.price}</button>`}
      </div>`;
    }).join('')}</div>`;
    if (tab === 'pot') {
      box.querySelectorAll('.shop-card canvas').forEach(cv => {
        requestAnimationFrame(() => {
          const potId = cv.parentElement.querySelector('[data-buy]')?.dataset.buy;
          if (!potId) return;
          cv.width = 150; cv.height = 64;
          const ctx = cv.getContext('2d');
          ctx.save(); ctx.translate(75, 44); ctx.scale(1.5, 1.5);
          EG.drawPot(ctx, EG.POT_BY_ID[potId], 1);
          ctx.restore();
        });
      });
    }
    box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      if (EG.Game.buy(tab, b.dataset.buy)) { this.refreshHUD(); this.renderShop(box, tab); const c = document.getElementById('shop-crystal'); if (c) c.textContent = EG.G.crystals; }
    });
  },

  /* ---------------- 设置 ---------------- */
  openSettings() {
    const g = EG.G;
    const { body } = this.modal('设置', `
      <div class="set-row"><div><div class="s-label">花园名</div><div class="s-sub">它会出现在分享卡片上</div></div><b>${g.name}</b></div>
      <div class="set-row"><div><div class="s-label">时间流速</div><div class="s-sub">植物按真实时间生长，演示时可加速</div></div>
        <div class="seg-group" id="sp-group">
          <button class="seg ${g.settings.speed === 1 ? 'on' : ''}" data-s="1">真实</button>
          <button class="seg ${g.settings.speed === 60 ? 'on' : ''}" data-s="60">×60</button>
          <button class="seg ${g.settings.speed === 360 ? 'on' : ''}" data-s="360">×360</button>
        </div></div>
      <div class="set-row"><div class="s-label">背景音乐</div><label class="switch"><input type="checkbox" id="set-bgm" ${g.settings.bgm ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><div class="s-label">音效</div><label class="switch"><input type="checkbox" id="set-sfx" ${g.settings.sfx ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><div><div class="s-label">432Hz 舒缓调音</div><div class="s-sub">把所有声音整体放软一点</div></div><label class="switch"><input type="checkbox" id="set-432" ${g.settings.four32 ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><div><div class="s-label">低刺激模式</div><div class="s-sub">粒子减半、关闭氛围闪烁</div></div><label class="switch"><input type="checkbox" id="set-lowfx" ${g.settings.lowFx ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><div><div class="s-label">高对比模式</div><div class="s-sub">更清晰的文字与描边</div></div><label class="switch"><input type="checkbox" id="set-hc" ${g.settings.highContrast ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><div class="s-label">全局字号 <b id="fs-val">${g.settings.fontScale}%</b></div>
        <input type="range" id="set-fs" min="80" max="140" step="10" value="${g.settings.fontScale}" style="width:140px;accent-color:var(--moss)"></div>
      <div class="set-row"><div><div class="s-label">冥想模式</div><div class="s-sub">放下界面，跟随呼吸待一会儿</div></div><button class="btn small ghost" id="set-med">开始 🧘</button></div>
      <div class="set-row"><div><div class="s-label">隐私说明</div><div class="s-sub">情绪日志只保存在这台设备的浏览器里；清除浏览器数据 = 删除全部记录。</div></div><button class="btn small ghost" id="set-reset">重置花园</button></div>
      <p style="font-size:.72rem;color:var(--ink-l);text-align:center;margin-top:12px">情绪花园 Emotion Garden · 网页版 V1.0<br>种下情绪，收获自己。</p>`);
    body.querySelectorAll('#sp-group .seg').forEach(b => b.onclick = () => {
      g.settings.speed = +b.dataset.s;
      body.querySelectorAll('#sp-group .seg').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      EG.Game.save();
    });
    const bindSwitch = (id, key, cb) => {
      body.querySelector(id).onchange = e => { g.settings[key] = e.target.checked; EG.Game.save(); this.refreshHUD(); if (cb) cb(e.target.checked); };
    };
    bindSwitch('#set-bgm', 'bgm', on => on ? EG.BGM.start() : EG.BGM.stop());
    bindSwitch('#set-sfx', 'sfx', () => EG.Audio.ensure() && EG.Audio.setVolume(EG.G.settings.bgm, EG.G.settings.sfx));
    bindSwitch('#set-432', 'four32', on => EG.Audio.four32 = on);
    bindSwitch('#set-lowfx', 'lowFx');
    bindSwitch('#set-hc', 'highContrast');
    body.querySelector('#set-fs').oninput = e => {
      g.settings.fontScale = +e.target.value;
      body.querySelector('#fs-val').textContent = e.target.value + '%';
      this.refreshHUD();
      EG.Game.save();
    };
    body.querySelector('#set-med').onclick = () => { this.closeTop(); this.openMeditation(); };
    body.querySelector('#set-reset').onclick = () => {
      if (confirm('真的要让这座花园回到最初的样子吗？所有记录都会消失。') && confirm('最后确认：这盆「重新开始」浇下去就长不回来啦，确定吗？')) {
        EG.Game.reset();
        location.reload();
      }
    };
  },

  /* ---------------- 分享卡片 ---------------- */
  openShare(pid, ring = false) {
    const g = EG.G;
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 960;
    const ctx = canvas.getContext('2d');
    /* 纸面 */
    const bg = ctx.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, '#F7F3E8'); bg.addColorStop(1, '#EDE6D2');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 720, 960);
    ctx.strokeStyle = 'rgba(123,160,91,.5)'; ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, 668, 908);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5F8547';
    ctx.font = '700 44px "Source Han Sans SC","Microsoft YaHei",sans-serif';
    ctx.fillText(g.name, 360, 108);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#8A887C';
    ctx.fillText(`${EG.SEASON_NAME[EG.season()]} · ${EG.dayKey()}`, 360, 148);
    if (ring) {
      const rc = document.createElement('canvas'); rc.width = rc.height = 300;
      const clone = { months: g.months };
      const gSave = EG.G; EG.G = Object.assign({}, g, { months: clone.months });
      this.drawRing(rc);
      EG.G = gSave;
      ctx.drawImage(rc, 210, 220, 300, 300);
      ctx.font = '26px sans-serif'; ctx.fillStyle = '#4A4A42';
      ctx.fillText('情绪年轮 · 每一圈都是一个月的你', 360, 600);
      void clone;
    } else {
      let pl = pid ? g.plants[pid] : Object.values(g.plants).filter(p => !p.withered).sort((a, b) => b.planted - a.planted)[0];
      if (pl) {
        const sp = EG.PLANT_BY_ID[pl.species];
        const p = EG.plantParams(pl.species, pl.seed, pl.variant);
        ctx.save();
        ctx.translate(360, 660);
        const sc = Math.min(4.2, 480 / Math.max(60, p.stemH + 60));
        ctx.scale(sc, sc);
        EG.drawPot(ctx, EG.POT_BY_ID[pl.pot] || EG.POT_BY_ID.pot_terra, 1);
        EG.drawPlantShape(ctx, p, { growth: pl.growth, time: 1, wind: 0.2 });
        ctx.restore();
        ctx.font = '700 40px "Source Han Sans SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#4A4A42';
        ctx.fillText(sp.name, 360, 760);
        const e = EG.EMOTIONS[pl.emo.cat];
        ctx.font = '28px sans-serif';
        ctx.fillStyle = e.color;
        ctx.fillText(`${e.symbol} ${e.name} · 强度 ${pl.emo.intensity}/10`, 360, 802);
        if (pl.note) { ctx.font = '24px sans-serif'; ctx.fillStyle = '#8A887C'; ctx.fillText(`「${pl.note.slice(0, 18)}」`, 360, 840); }
      } else {
        ctx.font = '32px sans-serif'; ctx.fillStyle = '#4A4A42';
        ctx.fillText('这座花园还在等第一颗种子', 360, 420);
        ctx.font = '26px sans-serif'; ctx.fillStyle = '#8A887C';
        ctx.fillText(`已记录 ${g.stats.recorded} 次情绪 · 收获 ${g.stats.harvested} 株`, 360, 480);
      }
    }
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#A8A294';
    ctx.fillText('情绪花园 Emotion Garden · 种下情绪，收获自己', 360, 908);
    const url = canvas.toDataURL('image/png');
    g.stats.shareCards++;
    const { body } = this.modal('分享卡片', `
      <img class="share-img" src="${url}" alt="分享卡片">
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <a class="btn" download="emotion-garden-${Date.now()}.png" href="${url}">⬇️ 保存图片</a>
      </div>
      <p class="quote">分享的是花，不是心情的原文——请放心。</p>`);
    EG.SFX.chime();
    void body;
  },

  /* ---------------- 冥想 ---------------- */
  openMeditation() {
    const ov = document.getElementById('meditation');
    ov.classList.add('show');
    const canvas = document.getElementById('med-canvas');
    const text = document.getElementById('med-text');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t0 = performance.now();
    const PH = [{ t: '吸气……', d: 4 }, { t: '屏息……', d: 4 }, { t: '呼气……', d: 6 }];
    let stopped = false;
    const loop = now => {
      if (stopped) return;
      const T = (now - t0) / 1000;
      const cyc = 14, tt = T % cyc;
      let ph = PH[0], acc = 0;
      for (const p of PH) { if (tt >= acc && tt < acc + p.d) { ph = p; break; } acc += p.d; }
      const phaseT = (tt - acc) / ph.d;
      let scale = 0.4;
      if (ph.t.startsWith('吸')) scale = 0.4 + phaseT * 0.5;
      else if (ph.t.startsWith('呼')) scale = 0.9 - phaseT * 0.5;
      else scale = 0.9;
      text.textContent = ph.t;
      const W = innerWidth, Hh = innerHeight;
      ctx.fillStyle = '#0e1a14'; ctx.fillRect(0, 0, W, Hh);
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath(); ctx.arc(W / 2, Hh / 2, 60 + i * 34 * scale, 0, 7);
        ctx.fillStyle = `rgba(120,180,140,${0.05 + i * 0.015})`; ctx.fill();
      }
      const grad = ctx.createRadialGradient(W / 2, Hh / 2, 4, W / 2, Hh / 2, 80 * scale);
      grad.addColorStop(0, 'rgba(190,235,200,.85)'); grad.addColorStop(1, 'rgba(190,235,200,.15)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(W / 2, Hh / 2, 80 * scale, 0, 7); ctx.fill();
      this._medRaf = requestAnimationFrame(loop);
    };
    this._medRaf = requestAnimationFrame(loop);
    document.getElementById('med-exit').onclick = () => {
      stopped = true;
      cancelAnimationFrame(this._medRaf);
      ov.classList.remove('show');
      EG.Game.addMeditation();
      const seed = {
        cat: 'calm', intensity: 4, v: 0.55, a: -0.75, inputType: 'color',
        note: '冥想时收获的安宁之种', seedStr: 'med' + Date.now().toString(36),
      };
      EG.Garden.pendingSeed = seed;
      EG.Garden.mode = 'plant';
      EG.toast('冥想结束，带走一颗「安宁之种」吧 🌱');
      EG.SFX.chime();
    };
  },

  /* ---------------- 回顾信 ---------------- */
  openLetter(summary) {
    const g = EG.G;
    const lines = summary.grown.length
      ? summary.grown.map(x => `<div class="stat-line"><span>${x.name}</span><span>${EG.STAGES[x.from]} → ${EG.STAGES[x.to]}</span></div>`).join('')
      : '<div class="stat-line"><span>植物们安静地待着</span><span>等你回来</span></div>';
    const { body, close } = this.modal('一封来自花园的信', `
      <div class="letter">
        <h3>回 顾 信</h3>
        <p>亲爱的 ${g.name} 的主人：</p>
        <p>你离开了 ${summary.gapH < 48 ? Math.round(summary.gapH) + ' 小时' : Math.round(summary.gapH / 24) + ' 天'}。你不在的时候，花园发生了一些小事：</p>
        ${lines}
        ${summary.long ? '<p style="margin-top:8px">离开的日子有点久，我们替你给每一株都浇了水（托管照料）。别担心，谁都有很忙的时候。</p>' : ''}
        <p style="margin-top:8px">慢慢来，花会等你。</p>
        <div class="sig">—— 你的花园 敬上</div>
      </div>
      <button class="btn full" id="letter-ok" style="margin-top:12px">我回来了</button>`, { static: true });
    body.querySelector('#letter-ok').onclick = () => { close(); if (!g.tutorial.done) EG.Tutorial.maybeStart(); };
  },

  /* ---------------- 首次启动 ---------------- */
  openFirstRun() {
    const { body, bd } = this.modal('欢迎来到情绪花园', `
      <div class="wlc-logo">
        <div class="big">🌿 情绪花园 🌿</div>
        <div class="sub">把情绪种进土里 · Emotion Garden</div>
      </div>
      <p class="wlc-desc">这里没有任务与失败，只有一座会呼吸的花园。<br>
      用<b>一种颜色、一句话、或一段音乐</b>说出此刻的心情，<br>
      它会变成一颗种子，在你手里慢慢开花。</p>
      <input id="name-input" maxlength="12" placeholder="给你的花园起个名字（如：向阳小院）">
      <div class="wlc-gap"></div>
      <canvas class="wlc-art" id="wlc-art" width="520" height="200"></canvas>
      <p class="quote wlc-quote">情绪没有好坏，每一种都值得被看见。</p>
      <div class="wlc-cta"><button class="btn full gold" id="start-btn">开始种下第一缕情绪</button></div>`, { static: true });
    /* 欢迎页中央的按钮：绝对定位在卡片垂直中线上 */
    bd.querySelector('.modal').classList.add('welcome');
    const input = body.querySelector('#name-input');
    input.focus();
    /* 欢迎页插画：程序化绘制的花园小景（只画一次） */
    const art = body.querySelector('#wlc-art');
    if (art) requestAnimationFrame(() => this.renderWelcomeArt(art));
    const go = () => {
      EG.Game.newGame(input.value.trim() || '秘密花园');
      this.closeTop();
      this.refreshHUD();
      EG.Garden.layout();
      EG.Tutorial.start();
      EG.toast('欢迎回家 🌱');
    };
    body.querySelector('#start-btn').onclick = go;
    input.onkeydown = e => { if (e.key === 'Enter') go(); };
  },

  /* 欢迎页插画：天空渐变 + 远山 + 草地 + 三株程序化植物（纯表现层） */
  renderWelcomeArt(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 520, H = canvas.clientHeight || 200;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const horizon = H * 0.62;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#BFE0EC'); sky.addColorStop(0.55, '#DDEFE4'); sky.addColorStop(1, '#F6F3DE');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
    /* 阳光 */
    const sun = ctx.createRadialGradient(W * 0.78, H * 0.2, 2, W * 0.78, H * 0.2, H * 0.72);
    sun.addColorStop(0, 'rgba(255,246,208,.95)'); sun.addColorStop(0.35, 'rgba(255,238,180,.34)');
    sun.addColorStop(1, 'rgba(255,238,180,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, horizon + 2);
    /* 远山三层 */
    [[-16, 12, 'rgba(176,198,212,.75)'], [-6, 9, 'rgba(156,190,152,.8)'], [4, 7, 'rgba(126,164,112,.88)']].forEach(([dy, amp, col]) => {
      ctx.beginPath(); ctx.moveTo(0, horizon + 6);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, horizon + dy - Math.sin(x / 90 + dy) * amp - Math.sin(x / 33) * amp * 0.28);
      ctx.lineTo(W, horizon + 8); ctx.lineTo(0, horizon + 8); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    });
    /* 草地 */
    const gr = ctx.createLinearGradient(0, horizon, 0, H);
    gr.addColorStop(0, '#A9CB86'); gr.addColorStop(1, '#6E9450');
    ctx.fillStyle = gr; ctx.fillRect(0, horizon, W, H - horizon);
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * W, y = horizon + 4 + Math.random() * (H - horizon - 4);
      const l = 3 + Math.random() * 5;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(72,106,50,.34)' : 'rgba(220,240,182,.34)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 3, y - l); ctx.stroke();
    }
    /* 三株植物（固定种子，纯装饰） */
    const picks = [['joy_daisy', 0], ['att_rose', 1], ['calm_mint', 0]];
    picks.forEach(([sp, vr], i) => {
      const p = EG.plantParams(sp, 'wlc' + sp, vr);
      ctx.save();
      ctx.translate(W * (0.2 + i * 0.3), horizon + 26 + i * 4);
      const sc = 0.62 - i * 0.04;
      ctx.scale(sc, sc);
      EG.drawPot(ctx, EG.POT_BY_ID.pot_terra, 0.9);
      EG.drawPlantShape(ctx, p, { growth: 100, time: 1.2 + i, wind: 0.28, wilt: 0 });
      ctx.restore();
    });
    /* 漂浮光点 */
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 1.6 + Math.random() * 3.6;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, 'rgba(255,252,226,.85)'); gg.addColorStop(1, 'rgba(255,252,226,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    /* 内描边 */
    ctx.strokeStyle = 'rgba(123,160,91,.35)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
  },
};

/* ---------------- 新手引导 ---------------- */
EG.Tutorial = {
  step: -1,   // -1 未开始 / 0 已完成
  start() {
    if (EG.G.tutorial.done) return;
    this.step = 1;
    EG.G.tutorial.step = 1;
    this.tip('第一步：点开 <b>🎨 种植</b>，用一种颜色说说今天的心情');
    document.getElementById('tool-plant').classList.add('tglow');
  },
  maybeStart() { if (EG.G && !EG.G.tutorial.done && this.step === -1) this.start(); },
  tip(html) {
    let el = document.getElementById('tutorial-tip');
    if (!el) {
      el = h(`<div id="tutorial-tip"></div>`);
      document.getElementById('hud').appendChild(el);
      const skip = h(`<button class="skip">跳过引导</button>`);
      skip.onclick = () => this.finish(true);
      el.appendChild(skip);
    }
    const skip = el.querySelector('.skip');
    el.innerHTML = html;
    el.appendChild(skip);
    el.style.display = 'block';
  },
  advance() {
    this.step++;
    EG.G.tutorial.step = this.step;
    document.querySelectorAll('.tglow').forEach(e => e.classList.remove('tglow'));
    if (this.step === 2) {
      this.tip('种子发芽了！<b>点一点它</b>，打开照料面板');
    } else if (this.step === 3) {
      this.tip('给它浇浇水吧 💧<br><span style="font-size:.75rem">（教学植物会长得特别快）</span>');
    } else if (this.step === 4) {
      this.tip('它开花啦！点开 <b>🌸 收获</b>，再点植株收获它');
      document.getElementById('tool-harvest').classList.add('tglow');
      EG.Garden.mode = 'harvest';
      EG.UI.setToolActive('harvest');
    } else if (this.step >= 5) {
      this.finish(false);
    }
  },
  onPlanted() { if (this.step === 1) this.advance(); },
  onWatered(pid) {
    const pl = EG.G.plants[pid];
    if (this.step === 3 && pl && (pl.tutorial || Object.keys(EG.G.plants).length === 1)) this.advance();
  },
  onHarvested() { if (this.step === 4) this.advance(); },
  finish(skipped) {
    this.step = 0;
    EG.G.tutorial.done = true;
    EG.G.tutorial.step = 0;
    /* 教学植物恢复正常生长 */
    for (const id in EG.G.plants) EG.G.plants[id].tutorial = false;
    document.querySelectorAll('.tglow').forEach(e => e.classList.remove('tglow'));
    const el = document.getElementById('tutorial-tip');
    if (el) el.style.display = 'none';
    if (!skipped) {
      /* 赠送纪念苗 */
      const g = EG.G;
      const free = g.plots.findIndex((p, i) => p.unlocked && !p.plantId && i < g.grid.size * g.grid.size);
      if (free >= 0) {
        const seed = { cat: 'attach', intensity: 6, v: 0.15, a: -0.35, inputType: 'color', note: '引导结束赠送的纪念苗', seedStr: 'memorial' + Date.now(), growth: 92, tutorial: false };
        const pl = EG.Game.plant(seed, free);
        if (pl) pl.bloomedAt = Date.now();
      }
      g.crystals += 30;
      EG.toast('教学完成！赠送纪念苗一株 + 30 💠');
    } else EG.toast('随时可以在角落的菜单里找到一切');
    EG.Game.save();
    EG.UI.refreshHUD();
  },
};

/* HUD 全局刷新钩子（供 game.js 调用） */
EG.uiRefresh = function () {
  EG.UI.refreshHUD();
  EG.UI.refreshCare();
};
