/* ============================================================
 * 时间碎片 — main.js：存档 / 成就 / 启动
 * 存档：localStorage + CRC 校验 + 导出/导入（对应计划书 4.6）
 * 成就：5 组 48 个（对应计划书 4.4）
 * ============================================================ */
(function (root) {
  'use strict';
  const LV = root.TSLevels, ST = root.TSStory;
  const SAVE_KEY = 'timeshards_save_v1';

  function defaultSave() {
    return {
      v: 1,
      stardust: 0,
      cleared: {},          // levelId -> {stars, score, steps, hiddenIds}
      shards: [],           // 已收集叙事碎片 id
      ach: [],              // 已达成成就 id
      items: { watch: 1, glue: 0, mirror: 0, hourglass: 0, charm: 0 },
      settings: { sound: true, vol: 0.7, cb: false, bigfont: false, hicon: false, minimal: false },
      chapterEndingsSeen: {},   // ch -> ['surface','deeper']
      finalsSeen: [],           // 'a' | 'b' | 'c'
      labDate: '', labDone: 0,
      riftWeek: '', riftDone: false,
      helpSeen: false,
      endlessBest: 0,
      stats: { undoless: 0, flawless: 0, noStorm: 0, perfectLevels: 0 },
      startedAt: Date.now(),
    };
  }

  /* ---------- CRC32 ---------- */
  function crc32(str) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
    return ((crc ^ (-1)) >>> 0).toString(16);
  }

  /* ---------- 读写 ---------- */
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const idx = raw.lastIndexOf('|');
      const body = idx > 0 ? raw.slice(0, idx) : raw;
      const crc = idx > 0 ? raw.slice(idx + 1) : '';
      if (crc && crc32(body) !== crc) {
        console.warn('[TimeShards] 存档校验失败，使用默认存档');
        return defaultSave();
      }
      const data = JSON.parse(body);
      return Object.assign(defaultSave(), data);
    } catch (e) { return defaultSave(); }
  }
  function persist() {
    try {
      const body = JSON.stringify(save);
      localStorage.setItem(SAVE_KEY, body + '|' + crc32(body));
    } catch (e) { void e; }
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { void e; } }
  function exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(save)))); }
  function importSave(code) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!data || typeof data !== 'object' || !data.cleared) return false;
      save = Object.assign(defaultSave(), data);
      persist();
      return true;
    } catch (e) { return false; }
  }

  let save = loadSave();

  /* ---------- 解锁判定 ---------- */
  function isChapterUnlocked(ch) {
    if (ch <= 1) return true;
    const prev = LV.levelsOfChapter(ch - 1);
    return prev.some(l => save.cleared[l.id]);
  }
  function isLevelUnlocked(def) {
    if (def.kind === 'lab' || def.kind === 'rift' || def.id === 'endless') return true;
    if (!isChapterUnlocked(def.chapter)) return false;
    if (def.index <= 1) return true;
    const levels = LV.levelsOfChapter(def.chapter);
    const i = levels.findIndex(l => l.id === def.id);
    if (i <= 0) return true;
    return !!save.cleared[levels[i - 1].id];
  }
  function totalStars() {
    let s = 0;
    Object.values(save.cleared).forEach(c => { s += c.stars; });
    return s;
  }
  function progressPct() {
    let total = 0, done = 0;
    for (let ch = 1; ch <= 8; ch++) {
      LV.levelsOfChapter(ch).forEach(l => {
        total++;
        if (save.cleared[l.id]) done++;
      });
    }
    return total ? Math.round(done / total * 100) : 0;
  }

  /* ---------- 结算记录 ---------- */
  function recordClear(def, res) {
    const isNew = !save.cleared[def.id];
    const prev = save.cleared[def.id];
    save.cleared[def.id] = {
      stars: Math.max(res.stars, prev ? prev.stars : 0),
      score: Math.max(res.score, prev ? prev.score : 0),
      steps: prev ? Math.min(res.steps, prev.steps) : res.steps,
      noStorm: (prev && prev.noStorm) || !!res.noStorm,
      undoless: (prev && prev.undoless) || !!res.undoless,
    };
    let stardust = 0;
    const newShards = [];
    if (isNew) {
      stardust += 8 + res.stars * 4;
      (def.story || []).forEach(id => {
        if (ST.get(id) && !save.shards.includes(id)) { save.shards.push(id); newShards.push(id); }
      });
    }
    // 隐藏碎片
    (res.hiddenIds || []).forEach(id => {
      if (ST.get(id) && !save.shards.includes(id)) { save.shards.push(id); newShards.push(id); stardust += 6; }
    });
    // 完美统计
    if (isNew) {
      if (res.undoless) save.stats.undoless++;
      if (res.noStorm) save.stats.noStorm++;
      if (res.flawless) save.stats.flawless++;
      if (res.undoless && res.noStorm) save.stats.perfectLevels++;
    }
    // 模式结算
    let endingHTML = '';
    if (def.kind === 'lab') {
      const date = def.id.slice(4).replace(/_\d+$/, '');
      const idx = +def.id.slice(def.id.lastIndexOf('_') + 1);
      if (save.labDate !== date) { save.labDate = date; save.labDone = 0; }
      if (save.labDone <= idx) { stardust += 15 * (idx + 1 - save.labDone); save.labDone = idx + 1; }
    } else if (def.kind === 'rift') {
      const wk = def.id.slice(5);
      if (save.riftWeek !== wk || !save.riftDone) {
        save.riftWeek = wk; save.riftDone = true;
        stardust += 40;
        endingHTML = '<b style="color:var(--fut)">🌀 限定外观「裂隙观测者」已解锁</b>';
      }
    }
    // 章节结局
    if (def.kind === 'story' || def.kind === 'boss') {
      const levels = LV.levelsOfChapter(def.chapter);
      const allDone = levels.every(l => save.cleared[l.id]);
      if (allDone) {
        const seen = save.chapterEndingsSeen[def.chapter] = save.chapterEndingsSeen[def.chapter] || [];
        const chIds = ST.byChapter(def.chapter);
        const hasDeeper = chIds.some(id => ST.SHARDS[id].hidden && save.shards.includes(id));
        if (!seen.includes('surface')) {
          seen.push('surface');
          endingHTML += `<b>章节记忆</b><br>${ST.CHAPTER_ENDINGS[def.chapter].surface}`;
        }
        if (hasDeeper && !seen.includes('deeper')) {
          seen.push('deeper');
          endingHTML += `<br><br><b style="color:var(--para)">◈ 里层记忆</b><br>${ST.CHAPTER_ENDINGS[def.chapter].deeper}`;
        }
      }
      // 终局
      if (def.id === 'c8boss' && isNew) {
        const allHidden = Object.keys(ST.SHARDS).filter(k => ST.SHARDS[k].hidden).every(k => save.shards.includes(k));
        let fin = 'a';
        if (allHidden) fin = 'c';
        else if (save.shards.length >= 12) fin = 'b';
        if (!save.finalsSeen.includes(fin)) {
          save.finalsSeen.push(fin);
          const f = ST.FINAL_ENDINGS[fin];
          endingHTML += `<br><br><b style="color:var(--gold);letter-spacing:2px">${f.title}</b><br>${f.text}`;
        }
      }
    }
    if (stardust) save.stardust += stardust;
    persist();
    const newAch = evaluateAchievements();
    return { stardust, newShards, newAch, endingHTML };
  }

  /* ---------- 成就（5 组 48 个） ---------- */
  const ACH = [];
  function def_ach(id, icon, name, desc, check) { ACH.push({ id, icon, name, desc, check }); }

  // 因果大师（8）：每章无悖论通关全部主线
  for (let ch = 1; ch <= 8; ch++) {
    def_ach('causal_' + ch, '🛡️', `因果大师 · 第${ch}章`, `第 ${ch} 章全部关卡零时间风暴通关`, () => {
      return LV.levelsOfChapter(ch).every(l => {
        const c = save.cleared[l.id];
        return c && c.noStorm;
      });
    });
  }

  // 收藏家（10）
  const shardMilestones = [5, 15, 30, 50, 70, 90];
  shardMilestones.forEach((n, i) => def_ach('col_' + i, '🧩', `收藏家 ${['I','II','III','IV','V','VI'][i]}`, `收集 ${n} 枚叙事碎片`, () => save.shards.length >= n));
  def_ach('col_hidden3', '◈', '碎片之下的低语', '收集 3 枚「里层真相」碎片', () => save.shards.filter(id => ST.get(id) && ST.get(id).hidden).length >= 3);
  def_ach('col_hidden6', '◈◈', '帷幕之后', '收集 6 枚「里层真相」碎片', () => save.shards.filter(id => ST.get(id) && ST.get(id).hidden).length >= 6);
  def_ach('col_all', '🧩✦', '完整的钟塔镇', '收集全部叙事碎片', () => save.shards.filter(id => ST.get(id)).length >= ST.shardCount());
  def_ach('col_radio', '📻', '深夜守听人', '收录全部 12 条《环线广播合集》', () => { let n = 0; for (let i = 1; i <= 12; i++) if (save.shards.includes('b_' + String(i).padStart(2, '0'))) n++; return n >= 12; });

  // 速通者（8）
  for (let ch = 1; ch <= 8; ch++) {
    def_ach('speed_' + ch, '⚡', `速通者 · 第${ch}章`, `第 ${ch} 章全部关卡获得标准解（3 星）`, () => {
      return LV.levelsOfChapter(ch).every(l => save.cleared[l.id] && save.cleared[l.id].stars >= 3);
    });
  }

  // 完美回环（8）
  [[1, 'p1'], [10, 'p10'], [30, 'p30']].forEach(([n, k]) =>
    def_ach('perfect_' + k, '🔄', `完美回环 ${n}`, `${n} 个关卡零撤销零风暴一次通关`, () => save.stats.perfectLevels >= n));
  [[1, 'u1'], [15, 'u15'], [40, 'u40']].forEach(([n, k]) =>
    def_ach('undo_' + k, '↶', `不动如钟 ${n}`, `累计 ${n} 个关卡零撤销通关`, () => save.stats.undoless >= n));
  [[1, 'f1'], [20, 'f20']].forEach(([n, k]) =>
    def_ach('flaw_' + k, '✨', `因果无损 ${n}`, `累计 ${n} 个关卡满完整度通关`, () => save.stats.flawless >= n));

  // 时间考古学家（6）
  [1, 4, 8, 11].forEach((n, i) =>
    def_ach('arch_' + i, '⛏️', `时间考古学家 ${['I','II','III','IV'][i]}`, `发现 ${n} 枚隐藏碎片`, () => {
      let n2 = 0;
      Object.keys(ST.SHARDS).forEach(k => { const sh = ST.SHARDS[k]; if (sh.hidden && save.shards.includes(k)) n2++; });
      return n2 >= n;
    }));
  def_ach('arch_boss', '⚔️', '因果对决·全胜', '击败全部 6 场章末因果对决', () => {
    return ['c2boss', 'c3boss', 'c4boss', 'c5boss', 'c6boss', 'c8boss'].every(id => save.cleared[id]);
  });
  def_ach('arch_rift', '🌀', '裂隙行者', '通关一次时间裂隙', () => save.riftDone);

  // 命运观察者（8）
  def_ach('end_a', '🕰️', '钟声之下', '解锁终局 A', () => save.finalsSeen.includes('a'));
  def_ach('end_b', '🧬', '三线共生', '解锁终局 B', () => save.finalsSeen.includes('b'));
  def_ach('end_c', '◈', '第一次时间的实验', '解锁里层结局 C', () => save.finalsSeen.includes('c'));
  def_ach('watch_deep3', '📖', '里层记忆 III', '解锁 3 个章节的里层记忆', () => Object.values(save.chapterEndingsSeen).filter(v => v.includes('deeper')).length >= 3);
  def_ach('watch_deep6', '📖', '里层记忆 VI', '解锁 6 个章节的里层记忆', () => Object.values(save.chapterEndingsSeen).filter(v => v.includes('deeper')).length >= 6);
  def_ach('loop_60', '♾️', '回环守望者', '无限回环存活 60 秒', () => (save.endlessBest || 0) >= 60);
  def_ach('loop_180', '♾️✦', '时间 complete', '无限回环存活 180 秒', () => (save.endlessBest || 0) >= 180);
  def_ach('lab_first', '🧪', '实验室新人', '完成任意一日悖论实验室', () => save.labDone >= 3);

  function evaluateAchievements() {
    const fresh = [];
    ACH.forEach(a => {
      if (!save.ach.includes(a.id)) {
        let ok = false;
        try { ok = a.check(); } catch (e) { ok = false; }
        if (ok) { save.ach.push(a.id); fresh.push(a); }
      }
    });
    if (fresh.length) {
      persist();
      setTimeout(() => root.TSUI.toast('🏆 成就解锁：' + fresh[0].name + (fresh.length > 1 ? ` 等 ${fresh.length} 项` : ''), 3200), 400);
    }
    return fresh.map(a => a.id);
  }
  function allAchievements() {
    evaluateAchievements();
    return ACH.map(a => ({ ...a, done: save.ach.includes(a.id) }));
  }

  /* ---------- 设置 ---------- */
  function settingsApply() {
    const s = save.settings;
    document.body.classList.toggle('cb', !!s.cb);
    document.body.classList.toggle('bigfont', !!s.bigfont);
    document.body.classList.toggle('hicon', !!s.hicon);
    document.body.classList.toggle('minimal', !!s.minimal);
    if (root.TSAudio) {
      root.TSAudio.init();
      root.TSAudio.setVolume(s.vol);
      root.TSAudio.mute(!s.sound);
    }
  }

  /* ---------- 星尘 ---------- */
  function addStardust(n) { save.stardust += n; persist(); }

  root.TSMain = {
    get save() { return save; },
    persist, wipe, exportSave, importSave,
    isChapterUnlocked, isLevelUnlocked,
    totalStars, progressPct, recordClear,
    evaluateAchievements, allAchievements,
    settingsApply, addStardust,
  };

  /* ---------- 启动 ---------- */
  function boot() {
    root.TSUI.boot(save);
    console.log('%c时间碎片 Time Shards%c 三线并行因果解谜 · 可玩原型已启动',
      'color:#d99a4e;font-size:16px;font-weight:bold', 'color:#8fd8cf');
    console.log('关卡总数：', (function () { let n = 0; for (let ch = 1; ch <= 8; ch++) n += LV.levelsOfChapter(ch).length; return n; })());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
