# -*- coding: utf-8 -*-
"""一次性补丁：修正 data_levels_b.js 中的逻辑问题"""
import io

p = 'js/data_levels_b.js'
s = io.open(p, encoding='utf-8').read()
n0 = len(s)

def rep(old, new, cnt=1):
    global s
    assert old in s, 'NOT FOUND: ' + old[:60]
    s = s.replace(old, new, cnt)

# 1. c5l04 悖论陷阱：两个 then 都不能等于初始状态，否则不会触发冲突
rep("""        R('rA', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'shutdown']]),
        R('rB', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'unstable']]),""",
"""        R('rA', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'shutdown']]),
        R('rB', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'flicker']]),""")
rep("'power.unstable': '输出紊乱', 'power.shutdown': '强制停机',",
    "'power.unstable': '输出紊乱', 'power.shutdown': '强制停机', 'power.flicker': '输出闪烁',")

# 2. c5l09 同理
rep("""        R('rX', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'dead']]),
        R('rY', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'on']]),""",
"""        R('rX', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'sputter']]),
        R('rY', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'on']]),""")
rep("'air.dead': '全天静默', 'air.on': '电波不断' }",
    "'air.dead': '全天静默', 'air.on': '电波不断', 'air.sputter': '断续喘息' }")

# 3. c6l09 重做：单独"两巷齐焊"会自相矛盾；双向总阀一步到位
rep("""      intro: '东巷修管、西巷修管，总阀只能认一个方向——都修，就是悖论。',
      tips: '先看两条规则的涟漪会不会在同一点冲突。"双向供水"的总阀是唯一的两全法。',
      entities: [{ id: 'pipeA', name: '东巷水管', icon: '🚰' }, { id: 'pipeB', name: '西巷水管', icon: '🚿' }, { id: 'valve', name: '总阀', icon: '🎛️' }],
      dict: { 'pipeA.burst': '爆裂', 'pipeA.fixed': '焊好', 'pipeB.burst': '爆裂', 'pipeB.fixed': '焊好', 'valve.old': '老旧单向', 'valve.east': '只供东巷', 'valve.west': '只供西巷', 'valve.dual': '双向供水', 'street.dry': '断水', 'street.festival': '庙会照常' },
      initial: [F('past', 0, 'pipeA', 'burst'), F('past', 1, 'pipeB', 'burst'), F('present', 0, 'valve', 'old'), F('future', 0, 'street', 'dry')],
      goals: [F('present', 0, 'valve', 'dual'), F('future', 0, 'street', 'festival')],
      shards: [
        SH('trigger', 'fixeast', '焊好东巷管', '🚰', 'pipeA', 'past', 'fixed'),
        SH('trigger', 'fixwest', '焊好西巷管', '🚿', 'pipeB', 'past', 'fixed'),
        SH('set', 'dual', '换双向总阀', '🎛️', 'valve', 'past', 'dual', { need: 'old' }),
      ],
      rules: [
        R('rA', ['past', 0, 'pipeA', 'fixed'], [['present', 0, 'valve', 'east']]),
        R('rB', ['past', 1, 'pipeB', 'fixed'], [['present', 0, 'valve', 'west']]),
        R('rC', ['present', 0, 'valve', 'east'], [['future', 0, 'street', 'festival']]),
        R('rD', ['present', 0, 'valve', 'west'], [['future', 0, 'street', 'festival']]),
        R('rE', ['present', 0, 'valve', 'dual'], [['future', 0, 'street', 'festival']]),
      ],
      story: ['s6_09'], hint: ['只焊东巷，再换双向总阀。', '两条焊管碎片如果都用，总阀会被写成两个方向——风暴。'],""",
"""      intro: '东西两条巷的水管同时爆裂。总阀是老式的，一次只能认一个方向。',
      tips: '如果一条涟漪把同一处写成两个样子，就是悖论风暴。"双向总阀"是两全法。',
      entities: [{ id: 'pipeA', name: '东巷水管', icon: '🚰' }, { id: 'pipeB', name: '西巷水管', icon: '🚿' }, { id: 'valve', name: '总阀', icon: '🎛️' }],
      dict: { 'pipeA.burst': '爆裂', 'pipeA.fixed': '焊好', 'pipeB.burst': '爆裂', 'pipeB.fixed': '焊好', 'valve.old': '老旧单向', 'valve.east': '只供东巷', 'valve.west': '只供西巷', 'valve.dual': '双向供水', 'street.dry': '断水', 'street.festival': '庙会照常' },
      initial: [F('past', 0, 'pipeA', 'burst'), F('past', 1, 'pipeB', 'burst'), F('past', 0, 'valve', 'old'), F('future', 0, 'street', 'dry')],
      goals: [F('present', 0, 'valve', 'dual'), F('future', 0, 'street', 'festival')],
      shards: [
        SH('plant', 'weldboth', '东西两巷一起焊', '🔧', 'pipeA', 'past', 'fixed', { anchor: { t: 'past', s: 1, st: 'fixed' } }),
        SH('set', 'dual', '换双向总阀', '🎛️', 'valve', 'past', 'dual', { need: 'old' }),
      ],
      rules: [
        R('rA', ['past', 0, 'pipeA', 'fixed'], [['present', 0, 'valve', 'east']]),
        R('rB', ['past', 1, 'pipeB', 'fixed'], [['present', 0, 'valve', 'west']]),
        R('rC', ['present', 0, 'valve', 'east'], [['future', 0, 'street', 'festival']]),
        R('rD', ['present', 0, 'valve', 'west'], [['future', 0, 'street', 'festival']]),
        R('rE', ['past', 0, 'valve', 'dual'], [['present', 0, 'valve', 'dual']]),
        R('rF', ['present', 0, 'valve', 'dual'], [['future', 0, 'street', 'festival']]),
      ],
      story: ['s6_09'], hint: ['换上双向总阀，一步到位。', '"两巷齐焊"会让总阀被同时写成"东巷"和"西巷"——风暴。'],""")

# 4. c6boss par 3 -> 2
rep("      id: 'c6boss', chapter: 6, index: 13, kind: 'boss', title: 'BOSS·闭环悖论对决', par: 3,",
    "      id: 'c6boss', chapter: 6, index: 13, kind: 'boss', title: 'BOSS·闭环悖论对决', par: 2,")

# 5. c7l01: rf2 强度门槛调低使目标可达；补充 q1..q4/full2 字典
rep("        R('rf2', ['present', 3, 'chime', 'full'], [['future', 3, 'chime', 'full2']]),",
    "        R('rf2', ['present', 3, 'chime', 'full'], [['future', 3, 'chime', 'full2']], { min: 25 }),")
rep("'chime.broken': '残缺', 'chime.full': '四音俱全' }",
    "'chime.broken': '残缺', 'chime.q1': '一音', 'chime.q2': '二音', 'chime.q3': '三音', 'chime.q4': '四音', 'chime.full': '四音俱全', 'chime.full2': '余音传世' }")

# 6. c7l02: 双目标改为 动力就位(过去) + 报时如约(现在)，删除导致 1 步通关的 r3
rep("""      initial: [F('past', 0, 'mainspring', 'slack'), F('past', 1, 'cam', 'skewed'), F('present', 1, 'bell', 'off')],
      goals: [F('present', 1, 'bell', 'sync')],
      shards: [
        SH('trigger', 'wind', '上满主发条', '🔩', 'mainspring', 'past', 'wound'),
        SH('set', 'align', '凸轮对齿', '⚙️', 'cam', 'past', 'aligned', { need: 'skewed' }),
      ],
      rules: [
        R('r1', ['past', 0, 'mainspring', 'wound'], [['past', 1, 'bell', 'powered']]),
        R('r2', ['past', 1, 'cam', 'aligned'], [['present', 1, 'bell', 'sync']]),
        R('r3', ['past', 1, 'bell', 'powered'], [['present', 1, 'bell', 'sync']]),
      ],
      story: ['s7_02'], hint: ['两条链各修一次。', '上发条 + 凸轮对齿。'],""",
"""      initial: [F('past', 0, 'mainspring', 'slack'), F('past', 1, 'cam', 'skewed'), F('present', 1, 'bell', 'off')],
      goals: [F('past', 1, 'bell', 'powered'), F('present', 1, 'bell', 'sync')],
      shards: [
        SH('trigger', 'wind', '上满主发条', '🔩', 'mainspring', 'past', 'wound'),
        SH('set', 'align', '凸轮对齿', '⚙️', 'cam', 'past', 'aligned', { need: 'skewed' }),
      ],
      rules: [
        R('r1', ['past', 0, 'mainspring', 'wound'], [['past', 1, 'bell', 'powered']]),
        R('r2', ['past', 1, 'cam', 'aligned'], [['present', 1, 'bell', 'sync']]),
      ],
      story: ['s7_02'], hint: ['动力与定拍是两个关键节点。', '上发条（1号位）+ 凸轮对齿（2号位）。'],""")
rep("'bell.off': '错拍', 'bell.sync': '报时如约' }",
    "'bell.off': '错拍', 'bell.sync': '报时如约', 'bell.powered': '动力就位' }")

# 7. c7l03: 目标改为 鸣声就绪(过去) + 报时(现在)，删除 r3
rep("""      initial: [F('past', 1, 'bellows', 'leak'), F('past', 2, 'cam', 'stiff'), F('present', 2, 'bird', 'silent'), F('future', 2, 'kids', 'miss')],
      goals: [F('present', 2, 'bird', 'sings'), F('future', 2, 'kids', 'gather')],
      shards: [
        SH('trigger', 'pump', '鼓满风箱', '🫙', 'bellows', 'past', 'pumped'),
        SH('trigger', 'oil', '给凸轮上油', '🛢️', 'cam', 'past', 'oiled'),
      ],
      rules: [
        R('r1', ['past', 1, 'bellows', 'pumped'], [['past', 2, 'bird', 'voiced']]),
        R('r2', ['past', 2, 'cam', 'oiled'], [['present', 2, 'bird', 'sings']]),
        R('r3', ['past', 2, 'bird', 'voiced'], [['present', 2, 'bird', 'sings']]),
        R('r4', ['present', 2, 'bird', 'sings'], [['future', 2, 'kids', 'gather']]),
      ],
      story: ['s7_03'], hint: ['鸟要能叫（风箱）也要能动（凸轮）。', '两次操作。'],""",
"""      initial: [F('past', 1, 'bellows', 'leak'), F('past', 2, 'cam', 'stiff'), F('present', 2, 'bird', 'silent'), F('future', 2, 'kids', 'miss')],
      goals: [F('past', 2, 'bird', 'voiced'), F('present', 2, 'bird', 'sings')],
      shards: [
        SH('trigger', 'pump', '鼓满风箱', '🫙', 'bellows', 'past', 'pumped'),
        SH('trigger', 'oil', '给凸轮上油', '🛢️', 'cam', 'past', 'oiled'),
      ],
      rules: [
        R('r1', ['past', 1, 'bellows', 'pumped'], [['past', 2, 'bird', 'voiced']]),
        R('r2', ['past', 2, 'cam', 'oiled'], [['present', 2, 'bird', 'sings']]),
        R('r4', ['present', 2, 'bird', 'sings'], [['future', 2, 'kids', 'gather']]),
      ],
      story: ['s7_03'], hint: ['鸟要能叫（风箱）也要能动（凸轮）。', '风箱→鸣声就绪；上油→开唱。两次操作。'],""")
rep("'bird.silent': '哑了', 'bird.sings': '报时',",
    "'bird.silent': '哑了', 'bird.sings': '报时', 'bird.voiced': '鸣声就绪',")

# 8. c7l05: 陷阱改为同键冲突
rep("""        R('rX', ['present', 1, 'pendulum', 'over'], [['future', 1, 'midnight', 'ontime']]),
        R('rY', ['present', 1, 'pendulum', 'over'], [['future', 1, 'pendulum', 'broken']]),""",
"""        R('rX', ['present', 1, 'pendulum', 'over'], [['future', 1, 'pendulum', 'overswing']]),
        R('rY', ['present', 1, 'pendulum', 'over'], [['future', 1, 'pendulum', 'crack']]),""")
rep("'pendulum.over': '撞击过冲', 'pendulum.broken': '摆杆撞裂' }",
    "'pendulum.over': '撞击过冲', 'pendulum.overswing': '过摆', 'pendulum.crack': '摆杆撞裂' }")

# 9. c8l04 提示与规则槽位对齐（3号位）
rep("      story: ['s8_04'], hint: ['预置闭环：工牌从过去带到未来。', '使用\"佩戴工牌\"，点过去线任意位置——注意锚点在未来线。'],",
    "      story: ['s8_04'], hint: ['预置闭环：工牌从过去带到未来。', '使用\"佩戴工牌\"，点过去线 3 号位——锚点会在未来线亮起。'],")

# 10. c8l05: 预置闭环一步双目标
rep("""      goals: [F('present', 0, 'junior', 'warned'), F('future', 0, 'accident', 'no')],
      shards: [
        SH('plant', 'leave', '张贴留言条', '📝', 'note', 'past', 'left', { anchor: { t: 'future', s: 0, st: 'found' } }),
        SH('trigger', 'recall', '唤醒学妹的记忆', '💭', 'junior', 'present', 'remember'),
      ],
      rules: [
        R('r1', ['past', 0, 'note', 'left'], [['present', 0, 'junior', 'warned']]),
        R('r2', ['future', 0, 'note', 'found'], [['future', 0, 'accident', 'no']]),
      ],
      story: ['s8_05'], hint: ['预置闭环会同时完成两个目标的一半。', '留言条 + 唤醒记忆，两次改写。'],""",
"""      goals: [F('present', 0, 'junior', 'warned'), F('future', 0, 'accident', 'no')],
      shards: [
        SH('plant', 'leave', '张贴留言条', '📝', 'note', 'past', 'left', { anchor: { t: 'future', s: 0, st: 'found' } }),
      ],
      rules: [
        R('r1', ['past', 0, 'note', 'left'], [['present', 0, 'junior', 'warned']]),
        R('r2', ['future', 0, 'note', 'found'], [['future', 0, 'accident', 'no']]),
      ],
      story: ['s8_05'], hint: ['预置闭环一次落两端：过去贴出，未来被发现。', '使用\"张贴留言条\"，点过去线 1 号位。'],""")
rep("      id: 'c8l05', chapter: 8, index: 5, title: '给过去的留言', par: 2,",
    "      id: 'c8l05', chapter: 8, index: 5, title: '给过去的留言', par: 1,")

# 11. c8l06: 目标 stable2 与规则一致
rep("      goals: [F('present', 0, 'core', 'stable'), F('future', 2, 'shards', 'gathered'), F('future', 2, 'sky', 'clear')],",
    "      goals: [F('present', 0, 'core', 'stable2'), F('future', 2, 'shards', 'gathered'), F('future', 2, 'sky', 'clear')],")
rep("'core.resonant': '异常共振', 'core.stable': '稳定',",
    "'core.resonant': '异常共振', 'core.stable': '稳定', 'core.stable2': '共振平息',")

# 12. famD: entities 补 e3，字典补 armed
rep("""      entities: [
        { id: 'e1', name: '离位之物', icon: pool.root[ii] },
        { id: 'e2', name: '机关', icon: pool.mid[mi] },
      ],
      dict: { 'e1.loose': '离位', 'e1.removed': '已取走', 'e1.set': '归位', 'e2.idle': '待激活', 'e2.on': '激活', 'e3.bad': '停滞', 'e3.good': '运转' },""",
"""      entities: [
        { id: 'e1', name: '离位之物', icon: pool.root[ii] },
        { id: 'e2', name: '机关', icon: pool.mid[mi] },
        { id: 'e3', name: '下游产出', icon: pool.mid[(mi + 1) % pool.mid.length] },
      ],
      dict: { 'e1.loose': '离位', 'e1.removed': '已取走', 'e1.set': '归位', 'e2.idle': '待激活', 'e2.armed': '已就绪', 'e2.on': '激活', 'e3.bad': '停滞', 'e3.good': '运转' },""")

# 13. c3boss: 目标改为三个可独立达成者，保证 par3 诚实
rep("""      initial: [F('past', 0, 'cable', 'snapped'), F('past', 1, 'brake', 'unchecked'), F('present', 0, 'power', 'out'), F('present', 1, 'train', 'held')],
      goals: [F('present', 0, 'signal', 'live'), F('present', 1, 'train', 'go'), F('future', 2, 'crowd', 'cheer')],""",
"""      initial: [F('past', 0, 'cable', 'snapped'), F('past', 1, 'brake', 'unchecked'), F('present', 0, 'power', 'out'), F('present', 1, 'train', 'held')],
      goals: [F('present', 0, 'signal', 'live'), F('present', 1, 'brake', 'ready'), F('future', 2, 'crowd', 'cheer')],""")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ALL EDITS OK, size', n0, '->', len(s))
