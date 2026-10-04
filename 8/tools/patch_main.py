# -*- coding: utf-8 -*-
"""一次性补丁：main.js 零风暴成就判定"""
import io

p = 'js/main.js'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:70]
    s = s.replace(old, new, 1)

# 1. recordClear 记录 noStorm
rep("""    save.cleared[def.id] = {
      stars: Math.max(res.stars, prev ? prev.stars : 0),
      score: Math.max(res.score, prev ? prev.score : 0),
      steps: prev ? Math.min(res.steps, prev.steps) : res.steps,
    };""",
"""    save.cleared[def.id] = {
      stars: Math.max(res.stars, prev ? prev.stars : 0),
      score: Math.max(res.score, prev ? prev.score : 0),
      steps: prev ? Math.min(res.steps, prev.steps) : res.steps,
      noStorm: (prev && prev.noStorm) || !!res.noStorm,
      undoless: (prev && prev.undoless) || !!res.undoless,
    };""")

# 2. 成就判定直接读 cleared 记录
rep("""  // 因果大师（8）：每章无悖论通关全部主线
  for (let ch = 1; ch <= 8; ch++) {
    def_ach('causal_' + ch, '🛡️', `因果大师 · 第${ch}章`, `第 ${ch} 章全部关卡零时间风暴通关`, () => {
      return LV.levelsOfChapter(ch).every(l => {
        const c = save.cleared[l.id];
        return c && (c.noStorm || (c.meta && c.meta.noStorm));
      }) && noStormChapters[ch] === true;
    });
  }
  // noStormChapters: 用独立表记录（避免旧存档问题）
  const noStormChapters = {};
  function markNoStorm(chapter) { noStormChapters[chapter] = true; }""",
"""  // 因果大师（8）：每章无悖论通关全部主线
  for (let ch = 1; ch <= 8; ch++) {
    def_ach('causal_' + ch, '🛡️', `因果大师 · 第${ch}章`, `第 ${ch} 章全部关卡零时间风暴通关`, () => {
      return LV.levelsOfChapter(ch).every(l => {
        const c = save.cleared[l.id];
        return c && c.noStorm;
      });
    });
  }""")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('MAIN PATCH OK')
