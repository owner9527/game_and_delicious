# -*- coding: utf-8 -*-
"""一次性补丁：修数据槽位/规则槽位/隐藏碎片/生成器家族约束"""
import io

# ---------- data_levels.js ----------
p = 'js/data_levels.js'
s = io.open(p, encoding='utf-8').read()

def rep1(old, new):
    global s
    assert old in s, 'NOT FOUND L1: ' + old[:70]
    s = s.replace(old, new, 1)

# c1l06：油灯移动目标在 3 号位，规则 when 应为 slot 2
rep1("        R('r1', ['past', 0, 'lamp', 'shelf'], [['past', 1, 'blueprint', 'intact']]),",
     "        R('r1', ['past', 2, 'lamp', 'shelf'], [['past', 1, 'blueprint', 'intact']]),")
# c2l01：蜡烛移动目标在 3 号位
rep1("        R('r1', ['past', 0, 'candle', 'desk'], [['past', 1, 'page', 'intact']]),",
     "        R('r1', ['past', 2, 'candle', 'desk'], [['past', 1, 'page', 'intact']]),")
# c2l07：墨水瓶加盖目标在 3 号位
rep1("        R('r1', ['past', 0, 'ink', 'capped'], [['past', 1, 'letter', 'clean']]),",
     "        R('r1', ['past', 2, 'ink', 'capped'], [['past', 1, 'letter', 'clean']]),")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('levels1 patched')

# ---------- data_levels_b.js ----------
p = 'js/data_levels_b.js'
s = io.open(p, encoding='utf-8').read()

def rep2(old, new):
    global s
    assert old in s, 'NOT FOUND L2: ' + old[:70]
    s = s.replace(old, new, 1)

# c5l10 槽位 2 -> 3（数据用到 3 号位）
rep2("      id: 'c5l10', chapter: 5, index: 10, title: '最后的滴答', par: 1,\n      slots: { past: 2, present: 2, future: 2 },",
     "      id: 'c5l10', chapter: 5, index: 10, title: '最后的滴答', par: 1,\n      slots: { past: 3, present: 3, future: 3 },")
# c7l05 增加隐藏碎片（午夜准点 → 报时鸟秘密）
rep2("      goals: [F('present', 1, 'pendulum', 'calm')],\n      shards: [\n        SH('set', 'close', '关合百叶窗', '🪟', 'shutter', 'past', 'closed', { need: 'open' }),",
     "      goals: [F('present', 1, 'pendulum', 'calm')],\n      hidden: [{ ...F('future', 1, 'midnight', 'ontime'), shardId: 's7h1' }],\n      shards: [\n        SH('set', 'close', '关合百叶窗', '🪟', 'shutter', 'past', 'closed', { need: 'open' }),")
# genLevel：按可交互线约束家族（famB 需要未来线）
rep2("""    const famIdx = opts.family != null ? opts.family : Math.floor(rng() * FAMS.length);
    const built = FAMS[famIdx](rng, ch, idx, name + (opts.suffix || ''));
    const def = built.def;
    const interactive = P1.CHAPTERS[ch - 1] ? P1.CHAPTERS[ch - 1].interact : ['past', 'present', 'future'];
    def.interactive = opts.interactive || interactive;
    return { def, solution: built.solution };""",
"""    const interactive = opts.interactive || (P1.CHAPTERS[ch - 1] ? P1.CHAPTERS[ch - 1].interact : ['past', 'present', 'future']);
    // 家族约束：famB 需要"就近协助"未来线；其余家族只依赖过去线
    const allowed = interactive.includes('future') ? [0, 1, 2, 3] : [0, 2, 3];
    const famIdx = opts.family != null ? opts.family : allowed[Math.floor(rng() * allowed.length)];
    const built = FAMS[famIdx](rng, ch, idx, name + (opts.suffix || ''));
    const def = built.def;
    def.interactive = interactive;
    return { def, solution: built.solution };""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('levels2 patched')

# ---------- tests/run_tests.cjs ----------
p = 'tests/run_tests.cjs'
s = io.open(p, encoding='utf-8').read()

def rep3(old, new):
    global s
    assert old in s, 'NOT FOUND T: ' + old[:70]
    s = s.replace(old, new, 1)

# 关卡计数口径：主线 96 + BOSS 6 = 102；每章主线 12
rep3("""  const all = LV.allHandLevels();
  T('主线+BOSS 关卡总数 = 102（8×12+6）', all.length === 96 + 6, all.length);
  T('BOSS 数量 = 6', all.filter(l => l.kind === 'boss').length === 6);""",
"""  const all = LV.allHandLevels();
  let totalAll = 0, mainCount = 0, bossCount = 0;
  for (let ch = 1; ch <= 8; ch++) {
    LV.levelsOfChapter(ch).forEach(l => {
      totalAll++;
      if (l.kind === 'boss') bossCount++; else mainCount++;
    });
  }
  T('关卡总数 = 102（8×12 主线 + 6 BOSS）', totalAll === 102 && mainCount === 96 && bossCount === 6, `total=${totalAll} main=${mainCount} boss=${bossCount}`);
  T('BOSS 数量 = 6', bossCount === 6);""")
rep3("""  // 每章 12 关
  for (let ch = 1; ch <= 8; ch++) {
    T(`第 ${ch} 章 = 12 关`, LV.levelsOfChapter(ch).length === 12, LV.levelsOfChapter(ch).length);
  }""",
"""  // 每章主线 12 关（BOSS 为额外第 13 关）
  for (let ch = 1; ch <= 8; ch++) {
    const ls = LV.levelsOfChapter(ch);
    T(`第 ${ch} 章 = 12 主线关`, ls.filter(l => l.kind !== 'boss').length === 12, ls.length);
  }""")
# fuzz：以全开放交互测试四个家族
rep3("""        const { def, solution } = LV.genLevel(ch, 900 + n, seed * 7919 + fam * 131 + ch);""",
"""        const { def, solution } = LV.genLevel(ch, 900 + n, seed * 7919 + fam * 131 + ch, { family: fam, interactive: ['past', 'present', 'future'] });""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tests patched')
