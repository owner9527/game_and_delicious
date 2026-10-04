/* ============================================================
 * 《回声》界面层 —— 菜单 / 存档 / 设置 / 成就 / 结算
 * 游戏内零文字；菜单每屏 ≤ 20 字（5.3），界面切换 400ms 声波缩放
 * ============================================================ */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const AU = () => window.EchoAudio;
  const LV = () => window.EchoLevels;
  const ACH_DEFS = [
    { id: 'a_wake', n: '初醒', d: '完成第一缕回声' },
    { id: 'a_nobait', n: '无声通过', d: '不用诱饵通过「静默者」' },
    { id: 'a_nohint', n: '无师自通', d: '前三章全程不用提示' },
    { id: 'a_frag', n: '碎片收藏家', d: '单章全部声之碎片' },
    { id: 'a_pure', n: '原声主义者', d: '静音音乐通关三次' },
    { id: 'a_chord', n: '和声钥匙', d: '首次以回声叠加开门' },
    { id: 'a_bait', n: '引开者', d: '首次用诱饵引开静默者' },
    { id: 'a_end', n: '静默终结', d: '揭开大静默的起源' }
  ];
  const CH_NAMES = ['唤醒', '和鸣', '深渊之厅', '大静默'];

  const App = {
    save: null, game: null, curCh: 1, curLevelIdx: 0, dailyMode: false, pending: null,

    init() {
      this.load();
      this.applySettingsToDom();
      this.bindActs();
      this.buildControls();
      this.showScreen('scr-boot');
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.game && this.game.state === 'play') this.pauseGame();
      });
    },

    /* ---------- 存档（4.6：子谜题自动存档 / 本地持久化） ---------- */
    load() {
      try { this.save = JSON.parse(localStorage.getItem('echo_save_v1') || 'null'); } catch (e) { }
      if (!this.save) this.save = {
        v: 1, unlocked: 1, rec: {}, ach: {}, xp: 0,
        set: { vol: .8, music: .55, sfx: .9, viz: 1, pure: 0, vibe: 1, lat: 0, theme: 0, vassist: 0, gentle: 0 },
        daily: {}, pureWins: 0, hintTaint: false
      };
      // 旧存档迁移：只补充新增设置键（0=关），既有键名与数据一律不动
      if (this.save.set.vassist == null) this.save.set.vassist = 0;
      if (this.save.set.gentle == null) this.save.set.gentle = 0;
    },
    store() { try { localStorage.setItem('echo_save_v1', JSON.stringify(this.save)); } catch (e) { } },
    resetSave() {
      localStorage.removeItem('echo_save_v1');
      this.load(); this.applySettingsToDom(); this.toast('回声已抹去');
    },

    xpLevel() { return Math.min(60, Math.floor(Math.sqrt((this.save.xp || 0) / 40)) + 1); },
    themeLocks() { return [1, 8, 16, 28]; },

    /* ---------- 屏幕管理 ---------- */
    showScreen(id) {
      $$('.screen').forEach(s => s.classList.remove('show'));
      const el = $('#' + id);
      if (el) el.classList.add('show');
      this.curScreen = id;
      // 氛围层（深空渐变/声波环/微粒）只在菜单类界面显露；游戏进行中与弹窗一律关闭，避免遮挡 canvas
      const ui = $('#ui');
      if (ui) ui.classList.toggle('ambient', !!el && !el.classList.contains('modal'));
      if (id === 'scr-main') this.refreshMain();
      if (id === 'scr-chapters') this.buildChapters();
      if (id === 'scr-settings') this.applySettingsToDom();
      if (id === 'scr-ach') this.buildAch();
    },
    refreshMain() {
      $('#lv-tag').textContent = '听感 · ' + this.xpLevel();
      $('#btn-continue').disabled = this.save.unlocked > LV().LEVELS.length && Object.keys(this.save.rec).length >= LV().LEVELS.length;
    },

    /* ---------- 关卡启动 ---------- */
    startLevel(def, mode) {
      this.dailyMode = mode === 'daily';
      this.curLevelIdx = LV().LEVELS.indexOf(def);
      this.showScreen(null);
      $('#ui').style.pointerEvents = 'none';
      $$('.screen').forEach(s => s.classList.remove('show'));
      AU() && AU().init();
      const set = this.save.set;
      this.game = new window.EchoGame($('#game'), {
        level: def, mode: mode || 'story',
        settings: this.gameSettings(),
        musicOff: set.music === 0,
        onPause: () => this.pauseGame(),
        onComplete: st => this.onComplete(def, st),
        onEvent: ev => { if (ev === 'door') this.maybeAch('a_chord', def.ch === 2 || def.ch === 3 || def.ch === 4); }
      });
      this.game.resize();
    },
    stopGame() {
      if (this.game) { this.game.destroy(); this.game = null; }
      $('#ui').style.pointerEvents = '';
    },
    pauseGame() {
      if (!this.game) return;
      this.game.state = 'paused';
      this.showScreen('scr-pause');
    },
    resumeGame() {
      if (!this.game) return;
      this.game.state = 'play';
      this.game.lastT = performance.now();
      $$('.screen').forEach(s => s.classList.remove('show'));
      $('#ui').classList.remove('ambient'); // 回到游戏：关闭菜单氛围层
    },

    /* ---------- 评级（4.1：时间40% + 碎片30% + 回放30%） ---------- */
    rate(def, st) {
      const par = def.par;
      const tP = Math.max(0, Math.min(1, par.time / Math.max(1, st.time)));
      const fP = st.fragsMax ? st.frags / st.fragsMax : 1;
      const pP = st.plays <= par.plays ? 1 : Math.max(0, par.plays / st.plays);
      const pts = tP * .4 + fP * .3 + pP * .3;
      return pts >= .85 ? 'S' : pts >= .65 ? 'A' : pts >= .45 ? 'B' : 'C';
    },
    onComplete(def, st) {
      const r = this.rate(def, st);
      const isStory = !def.daily && !def.sandbox;
      if (isStory) {
        const prev = this.save.rec[def.id];
        if (!prev || ['S', 'A', 'B', 'C'].indexOf(r) < ['S', 'A', 'B', 'C'].indexOf(prev.r) || st.frags > (prev.frags || 0))
          this.save.rec[def.id] = { r, frags: Math.max(st.frags, (prev && prev.frags) || 0), time: Math.min(st.time, (prev && prev.time) || 1e9) };
        this.save.unlocked = Math.max(this.save.unlocked, this.curLevelIdx + 2);
        const mult = { S: 1.5, A: 1.2, B: 1, C: .8 }[r];
        this.save.xp = (this.save.xp || 0) + Math.round(100 * mult + st.frags * 20);
        // 成就
        this.award('a_wake');
        if (def.id === 'l5' && st.baits === 0) this.award('a_nobait');
        if (def.id === 'l5' && st.baits > 0) this.award('a_bait');
        if (def.ch <= 3 && st.hints) this.save.hintTaint = true;
        if (['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].every(id => this.save.rec[id]) && !this.save.hintTaint) this.award('a_nohint');
        if (this.chFrags(def.ch)) this.award('a_frag');
        if (st.pure) { this.save.pureWins = (this.save.pureWins || 0) + 1; if (this.save.pureWins >= 3) this.award('a_pure'); }
        if (def.ch === 2 || def.ch === 3 || def.ch === 4) this.award('a_chord');
        if (def.id === 'l10') this.award('a_end');
      } else if (def.daily) {
        const d = new Date();
        const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        const prev = this.save.daily[key];
        if (!prev || ['S', 'A', 'B', 'C'].indexOf(r) < ['S', 'A', 'B', 'C'].indexOf(prev))
          this.save.daily[key] = r;
        this.save.xp = (this.save.xp || 0) + 60;
      } else {
        this.save.xp = (this.save.xp || 0) + 20;
      }
      this.store();
      this.pending = { def, st, r };
      this.showSettlement(def, st, r);
    },
    chFrags(ch) {
      const lvls = LV().LEVELS.filter(l => l.ch === ch);
      return lvls.length && lvls.every(l => this.save.rec[l.id] && this.save.rec[l.id].frags >= 3);
    },
    showSettlement(def, st, r) {
      $('#settle-rate').textContent = r;
      $('#settle-rate').className = 'rate r' + r;
      const fr = $('#settle-frags'); fr.innerHTML = '';
      for (let i = 0; i < Math.max(3, st.fragsMax); i++) {
        const el = document.createElement('i');
        if (i < st.frags) el.className = 'on';
        fr.appendChild(el);
      }
      const m = Math.floor(st.time / 60), s = Math.floor(st.time % 60);
      $('#st-time').textContent = m + ':' + String(s).padStart(2, '0');
      $('#st-plays').textContent = st.plays;
      const nextIdx = this.curLevelIdx + 1;
      const hasNext = !def.daily && !def.sandbox && (nextIdx < LV().LEVELS.length || def.id === 'l10');
      $('#btn-next').style.display = hasNext ? '' : 'none';
      this.showScreen('scr-settle');
    },
    showEnding() {
      this.stopGame();
      this.showScreen('scr-ending');
    },

    /* ---------- 成就 ---------- */
    award(id) {
      if (this.save.ach[id]) return;
      this.save.ach[id] = true;
      const def = ACH_DEFS.find(a => a.id === id);
      if (def) this.toast('回声印记 · ' + def.n);
      AU() && AU().playFragment(0);
      this.store();
    },
    maybeAch(id, cond) { if (cond) this.award(id); },
    buildAch() {
      const el = $('#ach-list'); el.innerHTML = '';
      for (const a of ACH_DEFS) {
        const got = !!this.save.ach[a.id];
        const d = document.createElement('div');
        d.className = 'ach-card ' + (got ? 'got' : 'locked');
        d.innerHTML = `<h4>${got ? '◆ ' : '◇ '}${a.n}</h4><p>${a.d}</p>`;
        el.appendChild(d);
      }
    },

    /* ---------- 章节 / 关卡选择 ---------- */
    buildChapters() {
      const g = $('#chapter-grid'); g.innerHTML = '';
      const lvls = LV().LEVELS;
      for (let ch = 1; ch <= 4; ch++) {
        const list = lvls.filter(l => l.ch === ch);
        const unlocked = this.save.unlocked > lvls.indexOf(list[0]);
        const card = document.createElement('div');
        card.className = 'ch-card' + (unlocked ? '' : ' lock');
        let bars = '', frags = 0, total = 0;
        for (const l of list) {
          const rec = this.save.rec[l.id];
          const cls = !rec ? '' : rec.r === 'S' ? 'gold' : 'done';
          bars += `<i class="${cls}"></i>`;
          frags += rec ? rec.frags : 0; total += 3;
        }
        card.innerHTML = `<div class="ch-num">${'一二三四'[ch - 1]}</div>
          <div style="font-size:13px;letter-spacing:.3em;margin-top:8px;color:#9fb2c3">${CH_NAMES[ch - 1]}</div>
          <div class="ch-bars">${bars}</div>
          <div class="ch-frag">碎片 ${frags}/${total}</div>`;
        if (unlocked) card.onclick = () => { AU() && AU().playUI('click'); this.curCh = ch; this.buildLevels(ch); this.showScreen('scr-levels'); };
        g.appendChild(card);
      }
    },
    buildLevels(ch) {
      $('#ch-title').textContent = '第' + '一二三四'[ch - 1] + '章 · ' + CH_NAMES[ch - 1];
      const g = $('#level-grid'); g.innerHTML = '';
      const lvls = LV().LEVELS;
      lvls.forEach((l, i) => {
        if (l.ch !== ch) return;
        const unlocked = i < this.save.unlocked;
        const rec = this.save.rec[l.id];
        const node = document.createElement('div');
        node.className = 'lv-node' + (unlocked ? '' : ' lock');
        let dots = '';
        for (let k = 0; k < 3; k++) dots += `<i class="${rec && k < rec.frags ? 'on' : ''}"></i>`;
        node.innerHTML = `<div class="num">${i + 1}</div>
          <div class="rate ${rec ? 'r' + rec.r : ''}">${rec ? rec.r : ''}</div>
          <div class="dots">${dots}</div>`;
        if (unlocked) node.onclick = () => { AU() && AU().playUI('open'); this.startLevel(l, 'story'); };
        g.appendChild(node);
      });
    },

    /* ---------- 操作说明 ---------- */
    buildControls() {
      const isTouch = 'ontouchstart' in window;
      $('#ctl-cols').innerHTML = `
        <div class="ctl-col"><h3>触屏</h3><dl>
          <dt>左侧拖动</dt><dd>移动</dd>
          <dt>◎ 按钮</dt><dd>探测音</dd>
          <dt>● 长按</dt><dd>录音</dd>
          <dt>▶ 按钮</dt><dd>回放</dd>
          <dt>··· 按钮</dt><dd>回声叠加</dd>
          <dt>➤ 按钮</dt><dd>投掷诱饵</dd>
          <dt>◐ 长按</dt><dd>声呐视野</dd>
        </dl></div>
        <div class="ctl-col"><h3>键盘</h3><dl>
          <dt>W A S D</dt><dd>移动</dd>
          <dt>空格 / 左键</dt><dd>探测音</dd>
          <dt>R 长按</dt><dd>录音</dd>
          <dt>E</dt><dd>回放</dd>
          <dt>C</dt><dd>回声叠加</dd>
          <dt>F</dt><dd>投掷诱饵</dd>
          <dt>G</dt><dd>丢弃声纹</dd>
          <dt>1 / 2 / 3</dt><dd>选择声纹槽</dd>
          <dt>Q 长按</dt><dd>声呐视野</dd>
          <dt>Esc</dt><dd>暂停</dd>
        </dl></div>
        <div class="ctl-col"><h3>聆听</h3><dl>
          <dt>回声延迟</dt><dd>距离</dd>
          <dt>音调</dt><dd>大小与材质</dd>
          <dt>音色</dt><dd>物体身份</dd>
          <dt>声像方位</dt><dd>声源方向</dd>
        </dl></div>`;
      if (isTouch) $('#ctl-cols').firstElementChild.style.borderColor = 'rgba(67,198,172,.4)';
    },

    /* ---------- 设置 ---------- */
    applySettingsToDom() {
      const s = this.save.set;
      $('#set-vol').value = s.vol; $('#set-music').value = s.music; $('#set-sfx').value = s.sfx;
      $('#set-lat').value = s.lat; $('#val-lat').textContent = (s.lat > 0 ? '+' : '') + s.lat + 'ms';
      $('#set-viz').classList.toggle('on', !!s.viz);
      $('#set-pure').classList.toggle('on', !!s.pure);
      $('#set-vibe').classList.toggle('on', !!s.vibe);
      $('#set-gentle').classList.toggle('on', !!s.gentle);
      const va = s.vassist | 0;
      $$('#set-vassist button').forEach(b => b.classList.toggle('on', (+b.dataset.v) === va));
      const dots = $('#theme-dots'); dots.innerHTML = '';
      const locks = this.themeLocks(), xl = this.xpLevel();
      window.EchoThemes.forEach((t, i) => {
        const b = document.createElement('button');
        b.style.background = t.env;
        const locked = xl < locks[i];
        if (locked) b.classList.add('lock');
        if ((s.theme || 0) === i) b.classList.add('on');
        b.title = '听感 ' + locks[i] + ' 解锁';
        b.onclick = () => {
          if (locked) { this.toast('听感 ' + locks[i] + ' 级解锁'); AU() && AU().playUI('deny'); return; }
          s.theme = i; this.store(); this.applySettingsToDom(); this.pushSettings(); AU() && AU().playUI('click');
        };
        dots.appendChild(b);
      });
    },
    pushSettings() {
      const s = this.save.set;
      AU() && AU().setVol('master', s.vol);
      AU() && AU().setVol('music', s.music);
      AU() && AU().setVol('sfx', s.sfx);
      AU() && AU().setLatency(s.lat);
      AU() && AU().setGentle(!!s.gentle); // 温和模式：峰值压限 + 压高频
      if (this.game) this.game.settings = this.gameSettings();
    },
    /* 引擎用的设置视图。视觉辅助≥基础时强制开启声纹可视化（否则辅助档没有可强化的画面） */
    gameSettings() {
      const s = this.save.set;
      return {
        viz: !!s.viz || (s.vassist | 0) >= 1,
        pure: !!s.pure, vibe: !!s.vibe, theme: s.theme || 0,
        vassist: s.vassist | 0
      };
    },

    /* ---------- 浮动提示 ---------- */
    toast(txt) {
      const t = $('#toast');
      const el = document.createElement('div');
      el.className = 'toast-item'; el.textContent = txt;
      t.appendChild(el); t.classList.add('show');
      setTimeout(() => { el.remove(); if (!t.children.length) t.classList.remove('show'); }, 2600);
    },

    /* ---------- 事件绑定 ---------- */
    bindActs() {
      document.body.addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        AU() && AU().init();
        const a = act.dataset.act;
        AU() && AU().playUI(a.includes('back') || a.includes('quit') ? 'back' : 'click');
        switch (a) {
          case 'intro-skip': this.showScreen('scr-main'); break;
          case 'continue': {
            const idx = Math.min(this.save.unlocked - 1, LV().LEVELS.length - 1);
            this.startLevel(LV().LEVELS[idx], 'story');
            break;
          }
          case 'chapters': this.showScreen('scr-chapters'); break;
          case 'back-chapters': this.showScreen('scr-chapters'); break;
          case 'back-main':
            if (this.game && this.game.state === 'paused') this.showScreen('scr-pause');
            else this.showScreen('scr-main');
            break;
          case 'daily': {
            const d = new Date();
            const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
            const r = this.save.daily[key];
            this.toast(r ? '今日' + r + ' · 再听一次' : '新的每日谜题');
            this.startLevel(LV().dailyLevel(key), 'daily');
            break;
          }
          case 'sandbox': this.startLevel(LV().SANDBOX, 'sandbox'); break;
          case 'guide': this.showScreen('scr-guide'); break;
          case 'controls-from-guide': this.showScreen('scr-controls'); break;
          case 'achievements': this.showScreen('scr-ach'); break;
          case 'settings': this.showScreen('scr-settings'); break;
          case 'ctl-from-pause': this.showScreen('scr-controls'); break;
          case 'resume': this.resumeGame(); break;
          case 'retry': {
            const def = this.pending ? this.pending.def : (this.game && this.game.L);
            this.stopGame();
            if (def) this.startLevel(def, def.daily ? 'daily' : def.sandbox ? 'sandbox' : 'story');
            break;
          }
          case 'quit-level': this.stopGame(); this.showScreen('scr-main'); break;
          case 'settle-retry': { const def = this.pending.def; this.stopGame(); this.startLevel(def, def.daily ? 'daily' : 'story'); break; }
          case 'settle-next': {
            const nx = LV().LEVELS[this.curLevelIdx + 1];
            this.stopGame();
            if (nx) {
              if (nx.id === 'l10') this.startLevel(nx, 'story');
              else this.startLevel(nx, 'story');
            } else this.showEnding();
            break;
          }
          case 'settle-menu': this.stopGame(); this.showScreen('scr-main'); break;
          case 'ending-done': this.showScreen('scr-main'); break;
          case 'reset-save': {
            const h = $('#reset-hint');
            if (h.classList.contains('show')) { this.resetSave(); h.classList.remove('show'); }
            else { h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 3000); }
            break;
          }
        }
      });
      // 启动页：任意点击进入
      $('#scr-boot').addEventListener('click', () => {
        AU() && AU().init();
        AU() && AU().playUI('open');
        this.pushSettings();
        if (!this.save.rec.l1) this.showScreen('scr-intro');
        else this.showScreen('scr-main');
      });
      // 设置滑杆
      const bindRange = (id, key, cb) => {
        $(id).addEventListener('input', e => {
          this.save.set[key] = parseFloat(e.target.value);
          if (cb) cb();
          AU() && AU().init(); this.pushSettings(); this.store();
        });
      };
      bindRange('#set-vol', 'vol'); bindRange('#set-music', 'music'); bindRange('#set-sfx', 'sfx');
      bindRange('#set-lat', 'lat', () => { $('#val-lat').textContent = (this.save.set.lat > 0 ? '+' : '') + this.save.set.lat + 'ms'; });
      const bindTgl = (id, key) => {
        $(id).addEventListener('click', () => {
          this.save.set[key] = this.save.set[key] ? 0 : 1;
          this.applySettingsToDom(); this.pushSettings(); this.store();
          AU() && AU().playUI('click');
        });
      };
      bindTgl('#set-viz', 'viz'); bindTgl('#set-pure', 'pure'); bindTgl('#set-vibe', 'vibe');
      bindTgl('#set-gentle', 'gentle');
      // 视觉辅助三档（0 关 / 1 基础 / 2 完整）
      $$('#set-vassist button').forEach(b => {
        b.addEventListener('click', () => {
          this.save.set.vassist = +b.dataset.v;
          this.applySettingsToDom(); this.pushSettings(); this.store();
          AU() && AU().playUI('click');
        });
      });
      // Esc 暂停 / 返回
      window.addEventListener('keydown', e => {
        if (e.code !== 'Escape') return;
        if (this.game && this.game.state === 'play') this.pauseGame();
        else if (this.game && this.game.state === 'paused' && this.curScreen === 'scr-pause') this.resumeGame();
      });
    }
  };

  window.EchoApp = App;
})();
