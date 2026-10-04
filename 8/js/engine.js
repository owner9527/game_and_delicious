/* ============================================================
 * 时间碎片 Time Shards — 因果引擎（Causal Engine）
 * 事件图(DAG) + 涟漪传播计算器 + 悖论检测器
 * 纯逻辑实现，独立于表现层，可在 Node 中直接运行自动化验证。
 *
 * 因果三定律（对应计划书 3.1）：
 *  1. 单向律：规则只允许 时间前进方向 的传播（作者数据约束 + 激活图环路检测兜底）
 *  2. 涟漪衰减律：每次传播衰减 30% 因果强度，低于阈值(min)涟漪消散
 *  3. 悖论惩罚律：同一事实被写成两个不同状态 / 激活图成环 → 时间风暴
 *     （扣 15 完整度，回退最近 3 步；满 3 次 → 时间崩塌）
 * ============================================================ */
(function (root) {
  'use strict';

  const TRACKS = ['past', 'present', 'future'];
  const TRACK_CN = { past: '过去', present: '现在', future: '未来' };
  const DECAY = 0.7;          // 涟漪衰减律
  const DEFAULT_MIN = 40;     // 低于此强度涟漪消散（100→70→49→34✕）
  const STORM_COST = 15;      // 悖论惩罚
  const WRONG_COST = 5;       // 无效操作惩罚
  const STORM_LIMIT = 3;      // 时间崩塌阈值
  const ROLLBACK_STEPS = 3;   // 风暴回退步数

  const kOf = (t, s, e) => t + ':' + s + ':' + e;

  /* ---------------- 撤销树节点 ---------------- */
  class OpNode {
    constructor(parent) {
      this.parent = parent;
      this.children = [];
      this.snap = null; // {facts, integrity, steps, storms, edges, linearLen, hiddenDone}
    }
  }
  function takeSnap(g) {
    return {
      facts: new Map(g.facts),
      integrity: g.integrity,
      steps: g.steps,
      storms: g.storms,
      edges: g.activeEdges.map(e => ({ ...e })),
      linearLen: g.linear.length,
      hiddenDone: new Set(g.hiddenDone),
    };
  }
  function applySnap(g, s) {
    g.facts = new Map(s.facts);
    g.integrity = s.integrity;
    g.steps = s.steps;
    g.storms = s.storms;
    g.activeEdges = s.edges.map(e => ({ ...e }));
    g.linear.length = s.linearLen;
    g.hiddenDone = new Set(s.hiddenDone);
    if (g.state === 'won') g.state = 'playing';
  }

  /* ---------------- 游戏实例 ---------------- */
  class Game {
    constructor(def) {
      this.def = def;
      this.facts = new Map();
      (def.initial || []).forEach(f => this.facts.set(kOf(f.t, f.s, f.e), { t: f.t, s: f.s, e: f.e, st: f.st }));
      this.integrity = 100;
      this.steps = 0;
      this.storms = 0;
      this.activeEdges = [];   // 已激活因果边 {from:{t,s}, to:{t,s}, e, st, strength, hop, rule}
      this.linear = [];        // 线性快照栈（风暴回退用）
      this.hiddenDone = new Set();
      this.root = new OpNode(null); this.root.snap = takeSnap(this);
      this.cur = this.root;
      this.undoCount = 0;
      this.state = 'playing';  // playing | won | collapsed
      this.msg = '';
      this.lastWave = [];      // 最近一次传播的动画事件
      this.dict = def.dict || {};
      this.entities = def.entities || [];
    }

    label(e, st) {
      const d = this.dict[e + '.' + st];
      return d != null ? d : st;
    }
    entName(e) {
      const m = this.entities.find(x => x.id === e);
      return m ? m.name : e;
    }
    cellName(c) { return TRACK_CN[c.t] + '线·' + (c.s + 1) + '号位'; }

    factsAt(t, s) {
      const out = [];
      for (const f of this.facts.values()) if (f.t === t && f.s === s) out.push(f);
      return out;
    }

    /* -------- 激活图成环检测（悖论惩罚律·因果环断裂） -------- */
    _pathExists(from, to) {
      // 是否已存在 from -> ... -> to 的激活路径
      const adj = new Map();
      for (const e of this.activeEdges) {
        const a = e.from.t + ':' + e.from.s, b = e.to.t + ':' + e.to.s;
        if (!adj.has(a)) adj.set(a, []);
        adj.get(a).push(b);
      }
      const seen = new Set();
      const stk = [from.t + ':' + from.s];
      while (stk.length) {
        const x = stk.pop();
        if (x === to.t + ':' + to.s) return true;
        if (seen.has(x)) continue;
        seen.add(x);
        (adj.get(x) || []).forEach(y => stk.push(y));
      }
      return false;
    }

    /* -------- 涟漪传播：BFS + 衰减 + 冲突检测 -------- */
    _propagate(direct) {
      const wave = direct.map(c => ({ ...c, hop: 0, strength: 100 }));
      this.lastWave = [];
      const written = new Map(); // key -> {st, src}
      const conflicts = [];
      let cycle = null;
      direct.forEach(c => written.set(kOf(c.t, c.s, c.e), { st: c.st, src: '玩家操作' }));
      let guard = 0;
      while (wave.length && guard++ < 500) {
        const cur = wave.shift();
        for (const rule of (this.def.rules || [])) {
          const w = rule.when;
          if (w.t !== cur.t || w.s !== cur.s || w.e !== cur.e || w.st !== cur.st) continue;
          const strength = Math.round(cur.strength * DECAY);
          const min = rule.min != null ? rule.min : DEFAULT_MIN;
          for (const th of rule.then) {
            if (strength < min) {
              this.lastWave.push({ type: 'blocked', from: { t: w.t, s: w.s }, to: { t: th.t, s: th.s }, e: th.e, st: th.st, strength });
              continue;
            }
            const k = kOf(th.t, th.s, th.e);
            const have = this.facts.get(k);
            if (have && have.st === th.st) continue; // 已满足
            // 成环检测（同格状态机链不构成因果环）
            if ((w.t !== th.t || w.s !== th.s) && this._pathExists({ t: th.t, s: th.s }, { t: w.t, s: w.s })) {
              cycle = { rule: rule.id || '?', e: th.e };
              continue;
            }
            const prev = written.get(k);
            if (prev && prev.st !== th.st) {
              // 同格状态机链：规则的 when 与 then 是同一对象的先后状态（如 四音→齐全、引导中→顺利）
              const selfLoop = (w.t === th.t && w.s === th.s && w.e === th.e);
              if (selfLoop || prev.src === '玩家操作') {
                written.set(k, { st: th.st, src: rule.id });
                this.facts.set(k, { t: th.t, s: th.s, e: th.e, st: th.st });
                this.activeEdges.push({
                  from: { t: w.t, s: w.s }, to: { t: th.t, s: th.s },
                  e: th.e, st: th.st, strength, hop: cur.hop + 1, rule: rule.id,
                });
                this.lastWave.push({ type: 'ripple', from: { t: w.t, s: w.s }, to: { t: th.t, s: th.s }, e: th.e, st: th.st, strength, hop: cur.hop + 1 });
                wave.push({ t: th.t, s: th.s, e: th.e, st: th.st, hop: cur.hop + 1, strength });
                continue;
              }
              if (prev.src !== '玩家操作' && !selfLoop) {
                conflicts.push({ k, a: prev.st, b: th.st, e: th.e });
                this.lastWave.push({ type: 'conflict', to: { t: th.t, s: th.s }, e: th.e });
                continue;
              }
            }
            written.set(k, { st: th.st, src: rule.id });
            this.facts.set(k, { t: th.t, s: th.s, e: th.e, st: th.st });
            this.activeEdges.push({
              from: { t: w.t, s: w.s }, to: { t: th.t, s: th.s },
              e: th.e, st: th.st, strength, hop: cur.hop + 1, rule: rule.id,
            });
            this.lastWave.push({
              type: 'ripple', from: { t: w.t, s: w.s }, to: { t: th.t, s: th.s },
              e: th.e, st: th.st, strength, hop: cur.hop + 1,
            });
            wave.push({ t: th.t, s: th.s, e: th.e, st: th.st, hop: cur.hop + 1, strength });
          }
        }
      }
      return { conflicts, cycle };
    }

    _storm(reason) {
      if (this.glued) { // 因果断水：抵消一次风暴惩罚（不扣完整度、不回退）
        this.glued = false;
        this.storms++;
        this.lastStorm = { reason, back: 0, glued: true };
        this.msg = '因果胶水抵消了一次时间风暴惩罚';
        return;
      }
      if (this.charmed) { // 悖论护符：抵消一次风暴（不惩罚、不回退）
        this.charmed = false;
        this.storms++;
        this.lastStorm = { reason, back: 0, charmed: true };
        this.msg = '悖论护符抵消了一次时间风暴';
        return;
      }
      // 先回退到快照；风暴次数与完整度惩罚跨回退累计（不随快照还原）
      const prevStorms = this.storms || 0;
      const prevIntegrity = this.integrity;
      let node = this.cur;
      const back = Math.min(ROLLBACK_STEPS, this.linear.length);
      for (let i = 0; i < back; i++) node = node.parent || node;
      this.cur = node;
      applySnap(this, node.snap);
      this.storms = prevStorms + 1;
      this.integrity = Math.max(0, prevIntegrity - STORM_COST);
      this.lastStorm = { reason, back };
      if (this.storms >= STORM_LIMIT) this.state = 'collapsed';
    }

    _invalid(code, msg) {
      this.integrity = Math.max(0, this.integrity - WRONG_COST);
      this.msg = msg || code;
      this.invalidOp = { code, msg };
      return false;
    }

    /* -------- 玩家操作入口 --------
     * op = { shardId, target:{t,s}, source?:{t,s} }
     */
    applyOp(op) {
      if (this.state !== 'playing') return false;
      this.invalidOp = null;
      this.msg = '';
      const shard = (this.def.shards || []).find(s => s.id === op.shardId);
      if (!shard) return this._invalid('NO_SHARD', '未知碎片');
      const tgt = op.target;
      if (!tgt || this.def.slots[tgt.t] == null || tgt.s < 0 || tgt.s >= this.def.slots[tgt.t])
        return this._invalid('BAD_CELL', '无效的时间节点');
      const locked = (this.def.interactive || TRACKS);
      if (!locked.includes(tgt.t))
        return this._invalid('LOCKED', '单向律：' + TRACK_CN[tgt.t] + '线当前不可直接操作');
      if (shard.track && shard.track !== tgt.t)
        return this._invalid('WRONG_TRACK', '该碎片只能作用于' + TRACK_CN[shard.track] + '线');

      const direct = [];
      if (shard.kind === 'set' || shard.kind === 'trigger' || shard.kind === 'plant') {
        const k = kOf(tgt.t, tgt.s, shard.entity);
        const have = this.facts.get(k);
        if (shard.kind === 'set' && !have)
          return this._invalid('NO_ENTITY', this.cellName(tgt) + '没有「' + this.entName(shard.entity) + '」');
        if (shard.need && (!have || have.st !== shard.need))
          return this._invalid('NEED_STATE', '需要「' + this.entName(shard.entity) + '」处于「' + this.label(shard.entity, shard.need) + '」');
        if (have && have.st === shard.setState)
          return this._invalid('NOOP', '已经是这个状态了');
        direct.push({ t: tgt.t, s: tgt.s, e: shard.entity, st: shard.setState });
        if (shard.kind === 'plant' && shard.anchor) { // 预置闭环：同一操作落两端
          direct.push({ t: shard.anchor.t, s: shard.anchor.s, e: shard.anchor.e || shard.entity, st: shard.anchor.st });
        }
      } else if (shard.kind === 'move') {
        const src = op.source;
        if (!src) return this._invalid('NO_SOURCE', '请先选择要移动的对象所在节点');
        if (!locked.includes(src.t))
          return this._invalid('LOCKED_SRC', '单向律：' + TRACK_CN[src.t] + '线当前不可直接操作');
        if (src.t !== tgt.t) return this._invalid('MOVE_TRACK', '只能在同一条时间线内移动');
        if (src.s === tgt.s) return this._invalid('SAME_CELL', '不能移动到原位置');
        const kf = kOf(src.t, src.s, shard.entity);
        const have = this.facts.get(kf);
        if (!have) return this._invalid('NO_SOURCE_ENT', this.cellName(src) + '没有「' + this.entName(shard.entity) + '」');
        if (shard.fromNeed && have.st !== shard.fromNeed)
          return this._invalid('NEED_STATE_SRC', '需要「' + this.entName(shard.entity) + '」处于「' + this.label(shard.entity, shard.fromNeed) + '」');
        const kt = kOf(tgt.t, tgt.s, shard.entity);
        const atT = this.facts.get(kt);
        if (atT && atT.st === shard.setState) return this._invalid('NOOP', '已经是这个状态了');
        direct.push({ t: src.t, s: src.s, e: shard.entity, st: shard.clearState || 'gone' });
        direct.push({ t: tgt.t, s: tgt.s, e: shard.entity, st: shard.setState });
      } else {
        return this._invalid('BAD_KIND', '未知碎片类型');
      }

      // —— 应用并传播 ——
      const preGoals = this.goalsDone();
      for (const d of direct) this.facts.set(kOf(d.t, d.s, d.e), { t: d.t, s: d.s, e: d.e, st: d.st });
      const { conflicts, cycle } = this._propagate(direct);

      // 提交快照到撤销树
      const node = new OpNode(this.cur);
      this.cur.children.push(node);
      this.cur = node;
      this.steps++;
      if (this.charmedPending) { this.charmed = true; this.charmedPending = false; }
      node.snap = takeSnap(this);
      this.linear.push(node);

      if (conflicts.length || cycle) {
        this._storm(cycle ? ('因果环断裂：' + this.entName(cycle.e)) : ('同刻异位悖论：' + this.entName(conflicts[0].e)));
        const waived = this.lastStorm && (this.lastStorm.charmed || this.lastStorm.glued);
        this.msg = waived
          ? ('⏳ 时间风暴被' + (this.lastStorm.charmed ? '悖论护符' : '因果胶水') + '抵消！' + (this.lastStorm.reason || ''))
          : ('⏳ 时间风暴！' + (this.lastStorm ? this.lastStorm.reason : '') + '（完整度 -' + STORM_COST + '，回退 3 步）');
        if (this.state === 'collapsed') return true;
        return true;
      }

      // 隐藏碎片目标
      for (const h of (this.def.hidden || [])) {
        const f = this.facts.get(kOf(h.t, h.s, h.e));
        if (f && f.st === h.st) this.hiddenDone.add(h.shardId);
      }
      this.msg = direct.length > 1 ? '因果已在两条线上同时锚定' : '操作完成，涟漪扩散中…';
      if (this.goalsDone()) this.state = 'won';
      else if (this.integrity <= 0) this.state = 'collapsed';
      void preGoals;
      return true;
    }

    goalsDone() {
      const goals = this.def.goals || [];
      if (!goals.length) return false; // 无目标关卡（如无限回环）不判定胜利
      return goals.every(g => {
        const f = this.facts.get(kOf(g.t, g.s, g.e));
        return f && f.st === g.st;
      });
    }
    goalStatus() {
      return (this.def.goals || []).map(g => {
        const f = this.facts.get(kOf(g.t, g.s, g.e));
        return { ...g, done: !!(f && f.st === g.st), now: f ? f.st : null };
      });
    }

    /* -------- 撤销/重做（树状回溯） -------- */
    canUndo() { return !!this.cur.parent; }
    canRedo() { return this.cur.children.length > 0; }
    undo() {
      if (!this.canUndo()) return false;
      this.cur = this.cur.parent;
      applySnap(this, this.cur.snap);
      this.undoCount++;
      this.msg = '已回溯到上一个时间节点';
      return true;
    }
    redo() {
      if (!this.canRedo()) return false;
      this.cur = this.cur.children[this.cur.children.length - 1];
      applySnap(this, this.cur.snap);
      this.msg = '已恢复到下一个时间节点';
      return true;
    }

    /* -------- 结算 -------- */
    stars() {
      const par = this.def.par || 1;
      if (this.steps <= par) return 3;
      if (this.steps <= Math.ceil(par * 1.5)) return 2;
      return 1;
    }
    score() {
      const par = this.def.par || 1;
      const stepsScore = this.steps <= par ? 30 : this.steps <= Math.ceil(par * 1.5) ? 18 : 8;
      const hidden = this.hiddenDone.size > 0 ? 20 : 0;
      return { integrity: Math.round(this.integrity * 0.5), steps: stepsScore, hidden, total: Math.round(this.integrity * 0.5) + stepsScore + hidden };
    }
    perfect() { return this.storms === 0 && this.undoCount === 0; }
    flawless() { return this.storms === 0 && this.integrity === 100; }

    /* -------- 长按预览：沿激活规则推演后果（不动真实状态） -------- */
    previewFrom(t, s) {
      const out = [];
      const facts = this.factsAt(t, s);
      const seen = new Set();
      let frontier = facts.map(f => ({ f, hop: 0, strength: 100 }));
      let depth = 0;
      while (frontier.length && depth < 4) {
        const next = [];
        for (const { f, hop, strength } of frontier) {
          for (const rule of (this.def.rules || [])) {
            const w = rule.when;
            if (w.t !== f.t || w.s !== f.s || w.e !== f.e || w.st !== f.st) continue;
            const min = rule.min != null ? rule.min : DEFAULT_MIN;
            for (const th of rule.then) {
              const ns = Math.round(strength * DECAY);
              const k = kOf(th.t, th.s, th.e);
              if (seen.has(k + '>' + th.st)) continue;
              seen.add(k + '>' + th.st);
              const cur = this.facts.get(k);
              const willChange = !(cur && cur.st === th.st);
              out.push({
                hop, depth, strength: ns,
                text: TRACK_CN[w.t] + '·' + this.entName(w.e) + '「' + this.label(w.e, w.st) + '」 → '
                  + TRACK_CN[th.t] + '·' + this.entName(th.e) + '「' + this.label(th.e, th.st) + '」',
                blocked: ns < min,
                willChange,
              });
              if (ns >= min && willChange) next.push({ f: { t: th.t, s: th.s, e: th.e, st: th.st }, hop: hop + 1, strength: ns });
            }
          }
        }
        frontier = next;
        depth++;
      }
      return out;
    }
  }

  /* -------- 无副作用的演示推演（供测试/生成器使用） --------
   * ops: [{shardId, target, source}] 依据关卡定义顺序执行
   */
  function simulate(def, ops) {
    const g = new Game(def);
    for (const op of ops) g.applyOp(op);
    return g;
  }

  const TSEngine = {
    TRACKS, TRACK_CN, DECAY, DEFAULT_MIN, STORM_COST, STORM_LIMIT,
    Game, simulate, kOf,
  };

  root.TSEngine = TSEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = TSEngine;
})(typeof window !== 'undefined' ? window : globalThis);
