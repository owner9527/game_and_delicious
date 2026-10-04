/* ============================================================
 * 时间碎片 — 程序化音频（WebAudio，无外部资源）
 * 三线三套氛围配器（5.4）：过去=暖拨弦+黑胶底噪 / 现在=木吉他质感+环境白噪 / 未来=合成器+磁带失真
 * 切线 300ms 交叉淡入；音效：齿轮咬合（成功）、倒放钟声（悖论）、时间风暴、星尘结算
 * ============================================================ */
(function (root) {
  'use strict';

  const TSAudio = {
    ctx: null, master: null,
    ambGain: { past: null, present: null, future: null },
    ambNodes: { past: [], present: [], future: [] },
    cur: null, enabled: true, volume: 0.7,

    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (root.AudioContext || root.webkitAudioContext)();
      } catch (e) { this.enabled = false; return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
    mute(m) { if (this.master) this.master.gain.value = m ? 0 : this.volume; },

    /* ---------- 基础元件 ---------- */
    _osc(type, freq, t0, dur, peak, dest, glideTo) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return o;
    },
    _noise(t0, dur, peak, filterFreq, dest, type) {
      const c = this.ctx;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    },

    /* ---------- 音效 ---------- */
    tick() { // 拖拽吸附 / 选中
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this._osc('square', 2200, t, 0.05, 0.05);
    },
    gear() { // 操作成功：齿轮咬合（两声由远及近的咔哒 + 低频咬合）
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.06, 0.10, 3200, null, 'highpass');
      this._noise(t + 0.09, 0.08, 0.14, 2400, null, 'highpass');
      this._osc('triangle', 160, t + 0.10, 0.22, 0.12, null, 90);
    },
    wrong() { // 无效操作
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this._osc('sawtooth', 220, t, 0.16, 0.08, null, 150);
    },
    bellReverse() { // 悖论警报：倒放钟声（频率上滑 + 金属泛音）
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      [1, 2.76, 5.4].forEach((m, i) => {
        this._osc('sine', 130 * m, t, 0.9, 0.10 / (i + 1), null, 520 * m);
      });
      this._noise(t, 0.5, 0.05, 900);
    },
    storm() { // 时间风暴
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this.bellReverse();
      this._noise(t + 0.1, 1.1, 0.16, 500);
      this._osc('sawtooth', 70, t + 0.1, 1.0, 0.10, null, 45);
    },
    ripple() { // 涟漪扩散（轻柔上滑）
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this._osc('sine', 660, t, 0.30, 0.05, null, 990);
    },
    star(i) { // 结算星星（i: 0-2 递升琶音）
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const base = [523.25, 659.25, 783.99][i % 3];
      this._osc('triangle', base, t, 0.35, 0.10);
      this._osc('sine', base * 2, t, 0.30, 0.04);
    },
    chime() { // 通关和弦
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._osc('sine', f, t + i * 0.07, 0.8, 0.07));
    },
    collapse() { // 时间崩塌
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this._osc('sawtooth', 300, t, 1.4, 0.12, null, 30);
      this._noise(t, 1.3, 0.18, 300);
    },

    /* ---------- 三线氛围（持续音床） ---------- */
    _buildAmbience(track) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0;
      g.connect(this.master);
      const nodes = [g];
      const add = (n) => { nodes.push(n); return n; };
      if (track === 'past') {          // 暖琥珀：慢拨弦 + 黑胶噼啪
        add(this._lp(c, g, 900));
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 0.08; lg.gain.value = 2;
        lfo.connect(lg); lg.connect(nodes[1].frequency); lfo.start();
        [110, 164.8].forEach((f, i) => {
          const o = c.createOscillator(), og = c.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          og.gain.value = i ? 0.018 : 0.028;
          o.connect(og); og.connect(nodes[1]); o.start();
          add(o);
        });
      } else if (track === 'present') { // 蓝灰：五度长音 + 环境白噪
        add(this._lp(c, g, 700));
        [98, 146.8, 220].forEach((f, i) => {
          const o = c.createOscillator(), og = c.createGain();
          o.type = 'sine'; o.frequency.value = f;
          og.gain.value = i === 2 ? 0.010 : 0.020;
          o.connect(og); og.connect(nodes[1]); o.start();
          add(o);
        });
        const nz = this._noiseLoop(0.006, 1600);
        nz.out.connect(nodes[1]); nodes.push(nz.src);
      } else {                          // 青紫：合成器和声 + 磁带颤动
        add(this._lp(c, g, 1400));
        [123.5, 185, 246.9].forEach((f, i) => {
          const o = c.createOscillator(), og = c.createGain();
          o.type = i === 2 ? 'sawtooth' : 'sine'; o.frequency.value = f;
          og.gain.value = i === 2 ? 0.006 : 0.016;
          o.connect(og); og.connect(nodes[1]); o.start();
          add(o);
          const vib = c.createOscillator(), vg = c.createGain(); // 磁带失谐感
          vib.frequency.value = 0.7 + i * 0.3; vg.gain.value = f * 0.004;
          vib.connect(vg); vg.connect(o.frequency); vib.start();
          add(vib);
        });
      }
      return { gain: g, nodes };
    },
    _lp(c, dest, freq) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq;
      f.connect(dest);
      return f;
    },
    _noiseLoop(peak, filterFreq) {
      const c = this.ctx;
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = peak;
      src.connect(f); f.connect(g);
      src.start();
      return { src, out: g };
    },

    switchTo(track) { // 切线：300ms 交叉淡入
      if (!this.ctx || !this.enabled || this.cur === track) return;
      if (!this.ambGain[track]) {
        const built = this._buildAmbience(track);
        this.ambGain[track] = built.gain;
        this.ambNodes[track] = built.nodes;
      }
      const t = this.ctx.currentTime;
      ['past', 'present', 'future'].forEach(tr => {
        const g = this.ambGain[tr];
        if (!g) return;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(tr === track ? 1 : 0, t + 0.3);
      });
      this.cur = track;
    },
    stopAmbience() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      Object.values(this.ambGain).forEach(g => { if (g) { g.gain.cancelScheduledValues(t); g.gain.linearRampToValueAtTime(0, t + 0.3); } });
      this.cur = null;
    },
  };

  root.TSAudio = TSAudio;
})(typeof window !== 'undefined' ? window : globalThis);
