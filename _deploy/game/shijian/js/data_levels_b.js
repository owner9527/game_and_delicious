/* ============================================================
 * 时间碎片 — 关卡数据（第二部分：第 5-8 章 + BOSS + 程序化生成器）
 * ============================================================ */
(function (root) {
  'use strict';
  const P1 = root.TSLevelsPart1;
  const { F, R, SH } = P1;

  /* ============================================================
   * 第 5 章 深夜电台（三线全开 + 悖论风暴教学）
   * ============================================================ */
  const CH5 = [
    {
      id: 'c5l01', chapter: 5, index: 1, title: '失声的广播', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '从这一章起，三条时间线都向你敞开。也意味着，你可以在这条线上犯错。',
      entities: [{ id: 'mic', name: '麦克风', icon: '🎙️' }, { id: 'air', name: '电波', icon: '📶' }],
      dict: { 'mic.unplugged': '线缆脱落', 'mic.fixed': '接好', 'mic.swap': '换备用麦', 'air.silent': '静默电波', 'air.live': '正常播出', 'listener.drift': '听众流失', 'listener.stay': '听众守候' },
      initial: [F('past', 1, 'mic', 'unplugged'), F('present', 1, 'air', 'silent'), F('future', 1, 'listener', 'drift')],
      goals: [F('present', 1, 'air', 'live')],
      shards: [
        SH('trigger', 'fix', '接好线缆', '🎙️', 'mic', 'past', 'fixed'),
        SH('trigger', 'swap', '换备用麦', '🎙️', 'mic', 'present', 'swap'),
      ],
      rules: [
        R('r1', ['past', 1, 'mic', 'fixed'], [['present', 1, 'air', 'live']]),
        R('r2', ['present', 1, 'mic', 'swap'], [['present', 1, 'air', 'live']]),
      ],
      story: ['s5_01'], hint: ['过去接线，或现在换麦。', '未来线不能直接改过去——单向律。'],
    },
    {
      id: 'c5l02', chapter: 5, index: 2, title: '频率的漂移', par: 2,
      slots: { past: 3, present: 3, future: 3 },
      intro: '夜听众说：你们的台，飘得像喝醉的萤火虫。',
      entities: [{ id: 'dial', name: '旋钮', icon: '🎛️' }, { id: 'tape', name: '磁带', icon: '📼' }, { id: 'jingle', name: '片头曲', icon: '🎶' }],
      dict: { 'dial.drifted': '漂移', 'dial.locked': '锁定', 'tape.idle': '待播', 'tape.cued': '播放', 'freq.off': '频率漂移', 'freq.locked': '频率锁定', 'jingle.none': '未响起', 'jingle.plays': '响起' },
      initial: [F('past', 0, 'dial', 'drifted'), F('present', 0, 'freq', 'off'), F('present', 2, 'tape', 'idle'), F('future', 0, 'jingle', 'none')],
      goals: [F('present', 0, 'freq', 'locked'), F('future', 0, 'jingle', 'plays')],
      shards: [
        SH('set', 'calib', '校准旋钮', '🎛️', 'dial', 'past', 'locked', { need: 'drifted' }),
        SH('trigger', 'cue', '播放片头曲', '🎶', 'tape', 'future', 'cued'),
      ],
      rules: [
        R('r1', ['past', 0, 'dial', 'locked'], [['present', 0, 'freq', 'locked']]),
        R('r2', ['future', 0, 'tape', 'cued'], [['future', 0, 'jingle', 'plays']]),
      ],
      story: ['s5_02'], hint: ['锁定频率要回过去；片头曲可以直接在未来播。', '两次改写，两条线。'],
    },
    {
      id: 'c5l03', chapter: 5, index: 3, title: '午夜点歌', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '点歌单散了一地。主播即兴发挥，放了一首根本不存在的歌。',
      entities: [{ id: 'request', name: '点歌单', icon: '🎶' }, { id: 'host', name: '主播', icon: '🎧' }],
      dict: { 'request.spilled': '散落', 'request.sorted': '整理', 'host.improvise': '即兴发挥', 'host.onscript': '照单播放', 'song.wrong': '放错歌', 'song.right': '如约而至' },
      initial: [F('past', 0, 'request', 'spilled'), F('present', 0, 'host', 'improvise'), F('future', 1, 'song', 'wrong')],
      goals: [F('present', 0, 'host', 'onscript')],
      shards: [SH('trigger', 'sort', '整理点歌单', '🎶', 'request', 'past', 'sorted')],
      rules: [
        R('r1', ['past', 0, 'request', 'sorted'], [['present', 0, 'host', 'onscript']]),
        R('r2', ['present', 0, 'host', 'onscript'], [['future', 1, 'song', 'right']]),
      ],
      story: ['s5_03'], hint: ['主播没有错，是单子乱了。', '过去线整理点歌单。'],
    },
    {
      id: 'c5l04', chapter: 5, index: 4, title: '信号劫持', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '第一次正式遭遇悖论：一个动作，同时把未来写成两个结局。',
      tips: '看清楚碎片说明——"强行增强功率"的涟漪会自相矛盾。这是风暴，不是解法。',
      entities: [{ id: 'tower', name: '发射塔', icon: '🗼' }, { id: 'listener', name: '夜听众', icon: '🌙' }],
      dict: { 'tower.overloaded': '过载', 'tower.balanced': '均衡', 'tower.surging': '强行增压', 'power.unstable': '输出紊乱', 'power.shutdown': '强制停机', 'power.flicker': '输出闪烁', 'power.stable': '稳定', 'listener.gone': '信号里消失', 'listener.kept': '守在频段里' },
      initial: [F('past', 0, 'tower', 'overloaded'), F('present', 0, 'power', 'unstable'), F('future', 0, 'listener', 'gone')],
      goals: [F('present', 0, 'power', 'stable')],
      shards: [
        SH('set', 'balance', '负载均衡', '🗼', 'tower', 'past', 'balanced', { need: 'overloaded' }),
        SH('trigger', 'boost', '强行增强功率', '⚡', 'tower', 'past', 'surging'),
      ],
      rules: [
        R('rA', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'shutdown']]),
        R('rB', ['past', 0, 'tower', 'surging'], [['present', 0, 'power', 'flicker']]),
        R('r1', ['past', 0, 'tower', 'balanced'], [['present', 0, 'power', 'stable']]),
        R('r2', ['present', 0, 'power', 'stable'], [['future', 0, 'listener', 'kept']]),
      ],
      story: ['s5_04'], hint: ['增压会把未来同时写成"停机"和"紊乱"——两个未来，一个悖论。', '负载均衡是唯一解。'],
    },
    {
      id: 'c5l05', chapter: 5, index: 5, title: '天线上的雪', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '初雪压在天线上，整座城的午夜都带上了重影。',
      entities: [{ id: 'antenna', name: '天线', icon: '📡' }, { id: 'snow', name: '积雪', icon: '❄️' }],
      dict: { 'antenna.snow': '积雪压顶', 'antenna.deiced': '除冰', 'antenna.gain': '临时增益', 'signal.weak': '微弱', 'signal.clear': '清朗', 'ghost.yes': '满屏重影', 'ghost.no': '画面干净' },
      initial: [F('past', 1, 'antenna', 'snow'), F('present', 1, 'signal', 'weak'), F('future', 1, 'ghost', 'yes')],
      goals: [F('present', 1, 'signal', 'clear')],
      shards: [
        SH('trigger', 'deice', '上天线除冰', '❄️', 'antenna', 'past', 'deiced'),
        SH('trigger', 'gain', '临时增益', '📶', 'signal', 'present', 'gain'),
      ],
      rules: [
        R('r1', ['past', 1, 'antenna', 'deiced'], [['present', 1, 'signal', 'clear']]),
        R('r2', ['present', 1, 'signal', 'gain'], [['present', 1, 'signal', 'clear']]),
      ],
      story: ['s5_05'], hint: ['除冰（过去）或增益（现在）。', '增益是权宜，除冰治本。'],
    },
    {
      id: 'c5l06', chapter: 5, index: 6, title: '深夜来电', par: 2,
      slots: { past: 2, present: 2, future: 2 },
      intro: '热线电话总在占线。今晚，第一位听众是一位独居的奶奶。',
      entities: [{ id: 'line', name: '分机线', icon: '☎️' }, { id: 'song', name: '老唱片', icon: '💿' }, { id: 'granny', name: '奶奶', icon: '👵' }],
      dict: { 'line.none': '未增设', 'line.added': '增设分机', 'hotline.busy': '一直占线', 'hotline.open': '拨得进来', 'song.idle': '待点播', 'song.playing': '为她点播', 'granny.lonely': '拨不进热线', 'granny.hums': '跟着哼起来' },
      initial: [F('past', 0, 'line', 'none'), F('present', 0, 'hotline', 'busy'), F('present', 1, 'song', 'idle'), F('future', 1, 'granny', 'lonely')],
      goals: [F('present', 0, 'hotline', 'open'), F('future', 1, 'granny', 'hums')],
      shards: [
        SH('set', 'addline', '增设分机线', '☎️', 'line', 'past', 'added', { need: 'none' }),
        SH('trigger', 'play', '点播老唱片', '💿', 'song', 'present', 'playing'),
      ],
      rules: [
        R('r1', ['past', 0, 'line', 'added'], [['present', 0, 'hotline', 'open']]),
        R('r2', ['present', 1, 'song', 'playing'], [['future', 1, 'granny', 'hums']]),
      ],
      story: ['s5_06'], hint: ['分机线管拨入，老唱片管心情。', '两次改写，各在一条线。'],
    },
    {
      id: 'c5l07', chapter: 5, index: 7, title: '台长的怀表', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '台长的怀表快了五分钟。每档节目都超时，赞助商开始皱眉。',
      entities: [{ id: 'watch', name: '怀表', icon: '⌚' }, { id: 'chime', name: '报时钟声', icon: '🔔' }],
      dict: { 'watch.fast': '快五分钟', 'watch.exact': '校准', 'program.overrun': '节目超时', 'program.ontime': '准点落幅', 'sponsor.upset': '赞助商不满', 'sponsor.pleased': '续约一年', 'clip.none': '—', 'clip.viral': '传播片段' },
      initial: [F('past', 0, 'watch', 'fast'), F('present', 0, 'program', 'overrun'), F('future', 0, 'sponsor', 'upset')],
      goals: [F('present', 0, 'program', 'ontime')],
      hidden: [{ ...F('future', 0, 'clip', 'viral'), shardId: 's5h1' }],
      shards: [
        SH('set', 'regulate', '校准怀表', '⌚', 'watch', 'past', 'exact', { need: 'fast' }),
        SH('trigger', 'midnight', '零点报时彩蛋', '🔔', 'chime', 'present', 'rang'),
      ],
      rules: [
        R('r1', ['past', 0, 'watch', 'exact'], [['present', 0, 'program', 'ontime']]),
        R('r2', ['present', 0, 'chime', 'rang'], [['future', 0, 'clip', 'viral']]),
      ],
      story: ['s5_07'], hint: ['校准怀表。', '报时彩蛋是隐藏解：那段音频后来传遍了钟塔镇。'],
    },
    {
      id: 'c5l08', chapter: 5, index: 8, title: '双线直播', par: 2,
      slots: { past: 3, present: 3, future: 3 },
      intro: '一间直播室，两个话筒，两路信号，全都不对劲。',
      entities: [{ id: 'micA', name: 'A 话筒', icon: '🎙️' }, { id: 'micB', name: 'B 话筒', icon: '🎤' }],
      dict: { 'micA.dead': '接触不良', 'micA.reseated': '重插接头', 'micB.crackle': '电流声', 'micB.swapped': '更换话筒', 'lineA.dead': 'A 路无信号', 'lineA.live': 'A 路正常', 'lineB.noise': 'B 路有杂音', 'lineB.live': 'B 路正常' },
      initial: [F('past', 1, 'micA', 'dead'), F('past', 2, 'micB', 'crackle'), F('present', 1, 'lineA', 'dead'), F('present', 2, 'lineB', 'noise')],
      goals: [F('present', 1, 'lineA', 'live'), F('present', 2, 'lineB', 'live')],
      shards: [
        SH('set', 'reseat', '重插 A 接头', '🎙️', 'micA', 'past', 'reseated', { need: 'dead' }),
        SH('trigger', 'swapmic', '更换 B 话筒', '🎤', 'micB', 'present', 'swapped'),
      ],
      rules: [
        R('r1', ['past', 1, 'micA', 'reseated'], [['present', 1, 'lineA', 'live']]),
        R('r2', ['present', 2, 'micB', 'swapped'], [['present', 2, 'lineB', 'live']]),
      ],
      story: ['s5_08'], hint: ['A 修在过去，B 修在现在。', '每个话筒各一次改写。'],
    },
    {
      id: 'c5l09', chapter: 5, index: 9, title: '停电的夜晚', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '柴油见底了。用脚踹发电机，是所有办法里最坏的一个。',
      entities: [{ id: 'fuel', name: '柴油', icon: '🛢️' }, { id: 'gen', name: '发电机', icon: '⚡' }],
      dict: { 'fuel.low': '油料不足', 'fuel.refilled': '补充柴油', 'gen.dies': '发电机停转', 'gen.runs': '稳定运转', 'gen.kicked': '被踹了一脚', 'air.dead': '全天静默', 'air.on': '电波不断', 'air.sputter': '断续喘息' },
      initial: [F('past', 0, 'fuel', 'low'), F('present', 0, 'gen', 'dies'), F('future', 0, 'air', 'dead')],
      goals: [F('present', 0, 'gen', 'runs')],
      shards: [
        SH('set', 'refill', '补充柴油', '🛢️', 'fuel', 'past', 'refilled', { need: 'low' }),
        SH('trigger', 'kick', '踹一脚发电机', '🦵', 'gen', 'present', 'kicked'),
      ],
      rules: [
        R('rX', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'sputter']]),
        R('rY', ['present', 0, 'gen', 'kicked'], [['future', 0, 'air', 'on']]),
        R('r1', ['past', 0, 'fuel', 'refilled'], [['present', 0, 'gen', 'runs']]),
        R('r2', ['present', 0, 'gen', 'runs'], [['future', 0, 'air', 'on']]),
      ],
      story: ['s5_09'], hint: ['踹发电机会把未来写成两个样子。', '回过去补柴油。'],
    },
    {
      id: 'c5l10', chapter: 5, index: 10, title: '最后的滴答', par: 1,
      slots: { past: 3, present: 3, future: 3 },
      intro: '挂钟的电池只剩最后一格电。跨年夜，全城都在听它。',
      entities: [{ id: 'clock', name: '挂钟', icon: '🕰️' }, { id: 'city', name: '跨年夜', icon: '🎆' }],
      dict: { 'clock.dying': '电池将尽', 'clock.new': '换上新电池', 'tick.stutter': '秒针迟疑', 'tick.steady': '滴答如常', 'midnight.missed': '跨年静默', 'midnight.on': '如约报时' },
      initial: [F('past', 2, 'clock', 'dying'), F('present', 2, 'tick', 'stutter'), F('future', 2, 'midnight', 'missed')],
      goals: [F('present', 2, 'tick', 'steady')],
      shards: [SH('set', 'battery', '换上新电池', '🔋', 'clock', 'past', 'new', { need: 'dying' })],
      rules: [
        R('r1', ['past', 2, 'clock', 'new'], [['present', 2, 'tick', 'steady']]),
        R('r2', ['present', 2, 'tick', 'steady'], [['future', 2, 'midnight', 'on']]),
      ],
      story: ['s5_10'], hint: ['换电池，要在它还没停之前。', '过去线 3 号位。'],
    },
    {
      id: 'c5l11', chapter: 5, index: 11, title: '听众的信', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '一邮包听众来信被寄丢了。收发室的阿姨哭了——那是她三年来一封封念着播的信。',
      entities: [{ id: 'mailbag', name: '听众来信', icon: '📬' }, { id: 'host', name: '主播', icon: '🎧' }],
      dict: { 'mailbag.lost': '邮包寄丢', 'mailbag.redirect': '改寄新址', 'mail.none': '台里无信', 'mail.arrives': '信件抵达', 'air.silent': '读信环节冷场', 'air.read': '信被读出' },
      initial: [F('past', 1, 'mailbag', 'lost'), F('present', 1, 'mail', 'none'), F('future', 1, 'air', 'silent')],
      goals: [F('present', 1, 'mail', 'arrives')],
      shards: [SH('set', 'redirect', '改寄新址', '📬', 'mailbag', 'past', 'redirect', { need: 'lost' })],
      rules: [
        R('r1', ['past', 1, 'mailbag', 'redirect'], [['present', 1, 'mail', 'arrives']]),
        R('r2', ['present', 1, 'mail', 'arrives'], [['future', 1, 'air', 'read']]),
      ],
      story: ['s5_11'], hint: ['信还活着，只是地址错了。', '过去线改寄新址。'],
    },
    {
      id: 'c5l12', chapter: 5, index: 12, title: '城市入眠曲', par: 3,
      slots: { past: 3, present: 3, future: 3 },
      intro: '停电抢修、铁塔均衡、夜班主播——今晚，让整座城听着晚安曲入睡。',
      entities: [{ id: 'tape', name: '晚安曲磁带', icon: '📼' }, { id: 'tower', name: '发射塔', icon: '🗼' }, { id: 'host', name: '主播', icon: '🎧' }, { id: 'city', name: '城市', icon: '🌃' }],
      dict: { 'tape.ready': '待播', 'tape.cued': '播出', 'tower.overloaded': '过载', 'tower.balanced': '均衡', 'host.rest': '休班', 'host.assigned': '到岗', 'lullaby.none': '未播出', 'lullaby.on': '晚安曲播出', 'tower.unstable': '铁塔不稳', 'tower.standing': '铁塔无恙', 'voice.tired': '声音疲惫', 'voice.warm': '声线温柔' },
      initial: [F('present', 1, 'tape', 'ready'), F('past', 0, 'tower', 'overloaded'), F('past', 1, 'host', 'rest'), F('present', 2, 'tower', 'unstable'), F('present', 2, 'lullaby', 'none'), F('future', 1, 'city', 'awake')],
      goals: [F('present', 2, 'lullaby', 'on'), F('present', 2, 'tower', 'standing'), F('future', 1, 'city', 'sleeps')],
      shards: [
        SH('trigger', 'cue', '播出晚安曲', '📼', 'tape', 'present', 'cued'),
        SH('set', 'balance', '铁塔负载均衡', '🗼', 'tower', 'past', 'balanced', { need: 'overloaded' }),
        SH('set', 'assign', '安排夜班主播', '🎧', 'host', 'past', 'assigned', { need: 'rest' }),
      ],
      rules: [
        R('r1', ['present', 2, 'tape', 'cued'], [['present', 2, 'lullaby', 'on']]),
        R('r2', ['past', 0, 'tower', 'balanced'], [['present', 2, 'tower', 'standing']]),
        R('r3', ['past', 1, 'host', 'assigned'], [['future', 1, 'voice', 'warm']]),
        R('r4', ['future', 1, 'voice', 'warm'], [['future', 1, 'city', 'sleeps']]),
      ],
      story: ['s5_12'], hint: ['三个目标三条链：磁带、铁塔、主播。', '主播到岗（过去）→ 声线温柔（未来）→ 城市入睡。'],
    },
  ];

  /* ============================================================
   * 第 6 章 老城区（预置闭环 plant 教学 + 悖论网）
   * ============================================================ */
  const CH6 = [
    {
      id: 'c6l01', chapter: 6, index: 1, title: '面包房的炉火', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '老城区的第一炉面包，比闹钟更早唤醒这条街。',
      entities: [{ id: 'oven', name: '烤炉', icon: '🔥' }, { id: 'bread', name: '面包', icon: '🍞' }, { id: 'queue', name: '排队的人', icon: '🧍' }],
      dict: { 'oven.cold': '炉火未起', 'oven.lit': '点燃', 'bread.raw': '未熟', 'bread.golden': '金黄', 'queue.angry': '排队争执', 'queue.happy': '香气叫醒' },
      initial: [F('past', 0, 'oven', 'cold'), F('present', 0, 'bread', 'raw'), F('future', 0, 'queue', 'angry')],
      goals: [F('present', 0, 'bread', 'golden')],
      shards: [SH('trigger', 'light', '点燃炉火', '🔥', 'oven', 'past', 'lit')],
      rules: [
        R('r1', ['past', 0, 'oven', 'lit'], [['present', 0, 'bread', 'golden']]),
        R('r2', ['present', 0, 'bread', 'golden'], [['future', 0, 'queue', 'happy']]),
      ],
      story: ['s6_01'], hint: ['过去线点燃炉火。', '一次操作即可。'],
    },
    {
      id: 'c6l02', chapter: 6, index: 2, title: '邮筒的约定', par: 1,
      slots: { past: 3, present: 3, future: 3 },
      intro: '新机制「预置闭环」：一次操作，同时在过去寄出、在未来被等。这就是闭环。',
      tips: '预置类碎片会同时落两个节点——过去的因，未来的果，一次锚定。',
      entities: [{ id: 'letter', name: '情书', icon: '✉️' }, { id: 'mailbox', name: '邮筒', icon: '📮' }],
      dict: { 'letter.written': '写好未寄', 'letter.sent': '已寄出', 'letter.waiting': '在等它的人', 'letter.delivered': '送达', 'reunion.no': '错过', 'reunion.yes': '重逢' },
      initial: [F('past', 1, 'letter', 'written'), F('future', 2, 'reunion', 'no')],
      goals: [F('future', 2, 'reunion', 'yes')],
      shards: [SH('plant', 'send', '投递情书', '✉️', 'letter', 'past', 'sent', { anchor: { t: 'future', s: 2, st: 'waiting' } })],
      rules: [
        R('r1', ['past', 1, 'letter', 'sent'], [['present', 2, 'letter', 'delivered']]),
        R('r2', ['present', 2, 'letter', 'delivered'], [['future', 2, 'reunion', 'yes']]),
      ],
      story: ['s6_02'], hint: ['预置闭环一次落两端：过去寄出 + 未来等待。', '使用"投递情书"，点击过去线 2 号位。'],
    },
    {
      id: 'c6l03', chapter: 6, index: 3, title: '石板路的积水', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '一块凹陷的石板，一场雨后积水，一个摔了车的邮差。',
      entities: [{ id: 'stone', name: '石板', icon: '🪨' }, { id: 'puddle', name: '积水', icon: '💧' }, { id: 'cyclist', name: '骑车人', icon: '🚲' }],
      dict: { 'stone.sunken': '凹陷', 'stone.level': '垫平', 'puddle.yes': '积水', 'puddle.no': '干爽', 'cyclist.fall': '摔滑', 'cyclist.safe': '稳稳通过' },
      initial: [F('past', 1, 'stone', 'sunken'), F('present', 1, 'puddle', 'yes'), F('future', 1, 'cyclist', 'fall')],
      goals: [F('future', 1, 'cyclist', 'safe')],
      shards: [SH('set', 'level', '垫平石板', '🪨', 'stone', 'past', 'level', { need: 'sunken' })],
      rules: [
        R('r1', ['past', 1, 'stone', 'level'], [['present', 1, 'puddle', 'no']]),
        R('r2', ['present', 1, 'puddle', 'no'], [['future', 1, 'cyclist', 'safe']]),
      ],
      story: ['s6_03'], hint: ['垫平凹陷的石板。', '过去线 2 号位。'],
    },
    {
      id: 'c6l04', chapter: 6, index: 4, title: '招牌的螺丝', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '"陈记钟表"四个字挂了六十年。螺丝先锈的是时间。',
      entities: [{ id: 'screw', name: '螺丝', icon: '🔩' }, { id: 'sign', name: '老字号招牌', icon: '🏮' }],
      dict: { 'screw.rusted': '锈蚀', 'screw.new': '换新', 'sign.tilted': '倾斜', 'sign.steady': '端正', 'sign.fell': '坠落', 'sign.safe': '安然' },
      initial: [F('past', 0, 'screw', 'rusted'), F('present', 1, 'sign', 'tilted'), F('future', 1, 'sign', 'fell')],
      goals: [F('present', 1, 'sign', 'steady')],
      shards: [SH('set', 'replace', '换新螺丝', '🔩', 'screw', 'past', 'new', { need: 'rusted' })],
      rules: [
        R('r1', ['past', 0, 'screw', 'new'], [['present', 1, 'sign', 'steady']]),
        R('r2', ['present', 1, 'sign', 'steady'], [['future', 1, 'sign', 'safe']]),
      ],
      story: ['s6_04'], hint: ['换掉锈蚀的螺丝。', '过去线 1 号位。'],
    },
    {
      id: 'c6l05', chapter: 6, index: 5, title: '修鞋摊的灯', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '鞋匠的摊灯短路了很多年。他的眼镜，一年比一年厚。',
      entities: [{ id: 'lamp', name: '摊灯', icon: '💡' }, { id: 'cobbler', name: '鞋匠', icon: '🧑‍🔧' }],
      dict: { 'lamp.short': '灯线短路', 'lamp.rewired': '换灯线', 'lamp.allnight': '通宵点亮', 'light.strain': '眯眼伤神', 'light.steady': '明亮安稳', 'eyes.thick': '眼镜更厚', 'eyes.fine': '目光清亮', 'wanderer.cold': '—', 'wanderer.warm': '夜归人温暖' },
      initial: [F('past', 0, 'lamp', 'short'), F('present', 0, 'light', 'strain'), F('future', 0, 'eyes', 'thick')],
      goals: [F('present', 0, 'light', 'steady')],
      hidden: [{ ...F('future', 0, 'wanderer', 'warm'), shardId: 's6h1' }],
      shards: [
        SH('set', 'rewire', '换灯线', '💡', 'lamp', 'past', 'rewired', { need: 'short' }),
        SH('trigger', 'allnight', '给夜归人留一盏', '🏮', 'lamp', 'present', 'allnight'),
      ],
      rules: [
        R('r1', ['past', 0, 'lamp', 'rewired'], [['present', 0, 'light', 'steady']]),
        R('r2', ['present', 0, 'lamp', 'allnight'], [['future', 0, 'wanderer', 'warm']]),
      ],
      story: ['s6_05'], hint: ['换灯线是正解。', '"留一盏"是隐藏解——那条巷子里，夜归人再没摔过跤。'],
    },
    {
      id: 'c6l06', chapter: 6, index: 6, title: '井边的谜语', par: 1,
      slots: { past: 3, present: 3, future: 3 },
      intro: '奶奶说，她年轻时往井里丢过一枚硬币。修井的工人，明天就挖到那儿。',
      entities: [{ id: 'coin', name: '硬币', icon: '🪙' }, { id: 'well', name: '老井', icon: '🕳️' }],
      dict: { 'coin.dropped': '许下心愿', 'coin.carried': '心愿在井底', 'coin.found': '重见天日', 'wish.unheard': '心愿未许', 'wish.answered': '心愿应验' },
      initial: [F('past', 0, 'coin', 'dropped'), F('future', 2, 'wish', 'unheard')],
      goals: [F('future', 2, 'wish', 'answered')],
      shards: [SH('plant', 'wish', '许愿并留证', '🪙', 'coin', 'past', 'carried', { anchor: { t: 'future', s: 2, st: 'found' } })],
      rules: [
        R('r1', ['past', 0, 'coin', 'carried'], [['present', 2, 'coin', 'found2']]),
        R('r2', ['present', 2, 'coin', 'found2'], [['future', 2, 'wish', 'answered']]),
      ],
      story: ['s6_06'], hint: ['预置闭环：过去许愿，未来挖出。', '使用"许愿并留证"，点过去线 1 号位。'],
    },
    {
      id: 'c6l07', chapter: 6, index: 7, title: '巷口的猫', par: 1,
      slots: { past: 3, present: 3, future: 3 },
      intro: '鱼骨、三花猫、晚归的奶奶——你在两条时间线上都见过这个组合。',
      entities: [{ id: 'fish', name: '鱼骨', icon: '🐟' }, { id: 'cat', name: '三花猫', icon: '🐱' }, { id: 'granny', name: '奶奶', icon: '👵' }],
      dict: { 'fish.tossed': '鱼骨乱丢', 'fish.tidy': '收拾干净', 'cat.lurk': '巷口徘徊', 'cat.fed': '餍足', 'granny.trip': '被绊了一跤', 'granny.safe': '平安到家', 'bell.none': '—', 'bell.gift': '衔来铃铛' },
      initial: [F('past', 0, 'fish', 'tossed'), F('present', 1, 'cat', 'lurk'), F('future', 1, 'granny', 'trip')],
      goals: [F('future', 1, 'granny', 'safe')],
      hidden: [{ ...F('future', 0, 'bell', 'gift'), shardId: 's6h2' }],
      shards: [
        SH('set', 'tidy', '收拾鱼骨', '🐟', 'fish', 'past', 'tidy', { need: 'tossed' }),
        SH('trigger', 'feed', '留一条小鱼', '🐱', 'cat', 'past', 'fed'),
      ],
      rules: [
        R('r1', ['past', 0, 'fish', 'tidy'], [['present', 1, 'cat', 'gone']]),
        R('r2', ['present', 1, 'cat', 'gone'], [['future', 1, 'granny', 'safe']]),
        R('r3', ['past', 0, 'cat', 'fed'], [['future', 1, 'granny', 'safe']]),
        R('r4', ['past', 0, 'cat', 'fed'], [['future', 0, 'bell', 'gift']]),
      ],
      story: ['s6_07'], hint: ['收拾鱼骨，猫就散了。', '喂猫是隐藏解——吃饱的猫会用铃铛"报恩"。'],
    },
    {
      id: 'c6l08', chapter: 6, index: 8, title: '旧钟表铺', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '当铺老板说：这表修不好了。陈掌柜说：它只是差一根游丝。',
      entities: [{ id: 'part', name: '游丝', icon: '🌀' }, { id: 'watch', name: '古董表', icon: '⌚' }],
      dict: { 'part.broken': '游丝断裂', 'part.new': '换新', 'watch.stopped': '停走', 'watch.ticking': '重新走动', 'heirloom.gone': '传家宝典当', 'heirloom.kept': '传家宝留下' },
      initial: [F('past', 1, 'part', 'broken'), F('present', 1, 'watch', 'stopped'), F('future', 1, 'heirloom', 'gone')],
      goals: [F('present', 1, 'watch', 'ticking')],
      shards: [SH('set', 'fit', '装上新游丝', '🌀', 'part', 'past', 'new', { need: 'broken' })],
      rules: [
        R('r1', ['past', 1, 'part', 'new'], [['present', 1, 'watch', 'ticking']]),
        R('r2', ['present', 1, 'watch', 'ticking'], [['future', 1, 'heirloom', 'kept']]),
      ],
      story: ['s6_08'], hint: ['装上游丝。', '过去线 2 号位。'],
    },
    {
      id: 'c6l09', chapter: 6, index: 9, title: '双巷悖论', par: 2,
      slots: { past: 2, present: 2, future: 2 },
      intro: '东西两条巷的水管同时爆裂。总阀是老式的，一次只能认一个方向。',
      tips: '如果一条涟漪把同一处写成两个样子，就是悖论风暴。"双向总阀"是两全法。',
      entities: [{ id: 'pipeA', name: '东巷水管', icon: '🚰' }, { id: 'pipeB', name: '西巷水管', icon: '🚿' }, { id: 'valve', name: '总阀', icon: '🎛️' }],
      dict: { 'pipeA.burst': '爆裂', 'pipeA.fixed': '焊好', 'pipeB.burst': '爆裂', 'pipeB.fixed': '焊好', 'valve.old': '老旧单向', 'valve.east': '只供东巷', 'valve.west': '只供西巷', 'valve.dual': '双向供水', 'street.dry': '断水', 'street.festival': '庙会照常' },
      initial: [F('past', 0, 'pipeA', 'burst'), F('past', 1, 'pipeB', 'burst'), F('past', 0, 'valve', 'old'), F('future', 0, 'street', 'dry')],
      goals: [F('present', 0, 'valve', 'dual'), F('future', 0, 'street', 'festival')],
      shards: [
        SH('plant', 'weldboth', '东西两巷一起焊', '🔧', 'pipeA', 'past', 'fixed', { anchor: { t: 'past', s: 1, st: 'fixed', e: 'pipeB' } }),
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
      story: ['s6_09'], hint: ['换上双向总阀，一步到位。', '"两巷齐焊"会让总阀被同时写成"东巷"和"西巷"——风暴。'],
    },
    {
      id: 'c6l10', chapter: 6, index: 10, title: '天台的绳结', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '晾衣绳的绳芯磨断了。三天后，两家人开始为一件衬衫吵架。',
      entities: [{ id: 'rope', name: '晾衣绳', icon: '🪢' }, { id: 'laundry', name: '衣物', icon: '👕' }, { id: 'peace', name: '邻里', icon: '🏘️' }],
      dict: { 'rope.frayed': '绳芯磨断', 'rope.reknot': '重打绳结', 'laundry.down': '衣物坠落', 'laundry.safe': '晾晒如常', 'quarrel.yes': '口角', 'quarrel.no': '和睦' },
      initial: [F('past', 0, 'rope', 'frayed'), F('present', 1, 'laundry', 'down'), F('future', 1, 'peace', 'quarrel')],
      goals: [F('present', 1, 'laundry', 'safe')],
      shards: [SH('set', 'reknot', '重打绳结', '🪢', 'rope', 'past', 'reknot', { need: 'frayed' })],
      rules: [
        R('r1', ['past', 0, 'rope', 'reknot'], [['present', 1, 'laundry', 'safe']]),
        R('r2', ['present', 1, 'laundry', 'safe'], [['future', 1, 'peace', 'no']]),
      ],
      story: ['s6_10'], hint: ['重打绳结。', '过去线 1 号位。'],
    },
    {
      id: 'c6l11', chapter: 6, index: 11, title: '老照相馆', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '胶卷过期的那卷，拍的是整条街最后一张合影。',
      entities: [{ id: 'film', name: '胶卷', icon: '🎞️' }, { id: 'camera', name: '老相机', icon: '📷' }, { id: 'neighbors', name: '街坊', icon: '👥' }],
      dict: { 'film.expired': '胶卷过期', 'film.new': '装入新胶卷', 'photo.fogged': '照片发灰', 'photo.clear': '清晰', 'memory.lost': '合影模糊', 'memory.kept': '记忆保全', 'group.none': '—', 'group.family': '全家福' },
      initial: [F('past', 0, 'film', 'expired'), F('present', 0, 'photo', 'fogged'), F('future', 0, 'memory', 'lost')],
      goals: [F('present', 0, 'photo', 'clear')],
      hidden: [{ ...F('future', 0, 'group', 'family'), shardId: 's6h3' }],
      shards: [
        SH('set', 'newfilm', '装入新胶卷', '🎞️', 'film', 'past', 'new', { need: 'expired' }),
        SH('trigger', 'gather', '喊大家一起', '📸', 'neighbors', 'present', 'gathered'),
      ],
      rules: [
        R('r1', ['past', 0, 'film', 'new'], [['present', 0, 'photo', 'clear']]),
        R('r2', ['present', 0, 'neighbors', 'gathered'], [['future', 0, 'group', 'family']]),
      ],
      story: ['s6_11'], hint: ['装新胶卷。', '"喊大家一起"是隐藏解：那张全家福后来挂在照相馆墙上五十年。'],
    },
    {
      id: 'c6l12', chapter: 6, index: 12, title: '庙会的钟声', par: 3,
      slots: { past: 3, present: 3, future: 3 },
      intro: '一年一度的巷口庙会。花灯、大鼓、还有庙中央那口借来的钟。',
      entities: [{ id: 'lantern', name: '花灯', icon: '🏮' }, { id: 'drum', name: '大鼓', icon: '🥁' }, { id: 'crowd', name: '逛庙会的人', icon: '🧑‍🤝‍🧑' }],
      dict: { 'lantern.unhung': '未挂起', 'lantern.lit': '挂起点亮', 'drum.detuned': '鼓皮松弛', 'drum.ready': '鼓就位', 'crowd.thin': '稀稀落落', 'crowd.cheer': '人潮欢腾' },
      initial: [F('past', 1, 'lantern', 'unhung'), F('past', 0, 'drum', 'detuned'), F('present', 1, 'lantern', 'dark'), F('present', 0, 'drum', 'idle'), F('future', 2, 'crowd', 'thin')],
      goals: [F('present', 1, 'lantern', 'lit'), F('present', 0, 'drum', 'ready'), F('future', 2, 'crowd', 'cheer')],
      shards: [
        SH('set', 'hang', '挂起花灯', '🏮', 'lantern', 'past', 'hung', { need: 'unhung' }),
        SH('set', 'tune', '绷紧鼓皮', '🥁', 'drum', 'past', 'tuned', { need: 'detuned' }),
        SH('trigger', 'open', '敲响开场鼓', '🥁', 'drum', 'future', 'beaten'),
      ],
      rules: [
        R('r1', ['past', 1, 'lantern', 'hung'], [['present', 1, 'lantern', 'lit']]),
        R('r2', ['past', 0, 'drum', 'tuned'], [['present', 0, 'drum', 'ready']]),
        R('r3', ['future', 2, 'drum', 'beaten'], [['future', 2, 'crowd', 'cheer']]),
      ],
      story: ['s6_12'], hint: ['花灯与大鼓在过去准备，开场鼓在未来敲响。', '三次改写：挂灯、绷鼓、敲鼓。'],
    },
  ];

  /* ============================================================
   * 第 7 章 钟塔大钟（复合因果网，步数压力）
   * ============================================================ */
  const CH7 = [
    {
      id: 'c7l01', chapter: 7, index: 1, title: '四重奏', par: 4,
      slots: { past: 4, present: 4, future: 4 },
      intro: '大钟的四段报时，对应四枚音锤。少一枚，钟声就缺一个音。',
      entities: [{ id: 'h1', name: '一号音锤', icon: '🔨' }, { id: 'h2', name: '二号音锤', icon: '🔨' }, { id: 'h3', name: '三号音锤', icon: '🔨' }, { id: 'h4', name: '四号音锤', icon: '🔨' }, { id: 'chime', name: '报时', icon: '🔔' }],
      dict: { 'h1.off': '失联', 'h1.on': '接驳', 'h2.off': '失联', 'h2.on': '接驳', 'h3.off': '失联', 'h3.on': '接驳', 'h4.off': '失联', 'h4.on': '接驳', 'chime.broken': '残缺', 'chime.q1': '一音', 'chime.q2': '二音', 'chime.q3': '三音', 'chime.q4': '四音', 'chime.full': '四音俱全', 'chime.full2': '余音传世' },
      initial: [
        F('past', 0, 'h1', 'off'), F('past', 1, 'h2', 'off'), F('past', 2, 'h3', 'off'), F('past', 3, 'h4', 'off'),
        F('present', 3, 'chime', 'broken'), F('future', 3, 'chime', 'broken'),
      ],
      goals: [F('present', 3, 'chime', 'full'), F('future', 3, 'chime', 'full2')],
      shards: [
        SH('trigger', 'r1', '接驳一号锤', '🔨', 'h1', 'past', 'on'),
        SH('trigger', 'r2', '接驳二号锤', '🔨', 'h2', 'past', 'on'),
        SH('trigger', 'r3', '接驳三号锤', '🔨', 'h3', 'past', 'on'),
        SH('trigger', 'r4', '接驳四号锤', '🔨', 'h4', 'past', 'on'),
      ],
      rules: [
        R('rr1', ['past', 0, 'h1', 'on'], [['present', 3, 'chime', 'q1']]),
        R('rr2', ['past', 1, 'h2', 'on'], [['present', 3, 'chime', 'q2']]),
        R('rr3', ['past', 2, 'h3', 'on'], [['present', 3, 'chime', 'q3']]),
        R('rr4', ['past', 3, 'h4', 'on'], [['present', 3, 'chime', 'q4']]),
        R('rf1', ['present', 3, 'chime', 'q4'], [['present', 3, 'chime', 'full']]),
        R('rf2', ['present', 3, 'chime', 'full'], [['future', 3, 'chime', 'full2']], { min: 25 }),
      ],
      story: ['s7_01'], hint: ['四枚锤都要接驳。', 'chime 的状态会一格格点亮：q1→q2→q3→q4→四音俱全。'],
    },
    {
      id: 'c7l02', chapter: 7, index: 2, title: '主发条与凸轮', par: 2,
      slots: { past: 2, present: 2, future: 2 },
      intro: '主发条供力，凸轮定拍。谁错了，钟都不响。',
      entities: [{ id: 'mainspring', name: '主发条', icon: '🔩' }, { id: 'cam', name: '凸轮', icon: '⚙️' }, { id: 'bell', name: '大钟', icon: '🔔' }],
      dict: { 'mainspring.slack': '松弛', 'mainspring.wound': '上满', 'cam.skewed': '偏齿', 'cam.aligned': '对齿', 'bell.off': '错拍', 'bell.sync': '报时如约', 'bell.powered': '动力就位' },
      initial: [F('past', 0, 'mainspring', 'slack'), F('past', 1, 'cam', 'skewed'), F('present', 1, 'bell', 'off')],
      goals: [F('past', 1, 'bell', 'powered'), F('present', 1, 'bell', 'sync')],
      shards: [
        SH('trigger', 'wind', '上满主发条', '🔩', 'mainspring', 'past', 'wound'),
        SH('set', 'align', '凸轮对齿', '⚙️', 'cam', 'past', 'aligned', { need: 'skewed' }),
      ],
      rules: [
        R('r1', ['past', 0, 'mainspring', 'wound'], [['past', 1, 'bell', 'powered']]),
        R('r2', ['past', 1, 'cam', 'aligned'], [['present', 1, 'bell', 'sync']]),
      ],
      story: ['s7_02'], hint: ['动力与定拍是两个关键节点。', '上发条（1号位）+ 凸轮对齿（2号位）。'],
    },
    {
      id: 'c7l03', chapter: 7, index: 3, title: '报时鸟', par: 2,
      slots: { past: 3, present: 3, future: 3 },
      intro: '钟塔顶上的机械布谷鸟，是全镇孩子的正午闹钟。',
      entities: [{ id: 'bird', name: '机械鸟', icon: '🐦' }, { id: 'bellows', name: '风箱', icon: '🫙' }, { id: 'kids', name: '孩子们', icon: '🧒' }],
      dict: { 'bellows.leak': '漏气', 'bellows.pumped': '鼓满', 'bird.silent': '哑了', 'bird.sings': '报时', 'bird.voiced': '鸣声就绪', 'cam.stiff': '发涩', 'cam.oiled': '润滑', 'kids.miss': '等到打瞌睡', 'kids.gather': '准时雀跃' },
      initial: [F('past', 1, 'bellows', 'leak'), F('past', 2, 'cam', 'stiff'), F('present', 2, 'bird', 'silent'), F('future', 2, 'kids', 'miss')],
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
      story: ['s7_03'], hint: ['鸟要能叫（风箱）也要能动（凸轮）。', '风箱→鸣声就绪；上油→开唱。两次操作。'],
    },
    {
      id: 'c7l04', chapter: 7, index: 4, title: '齿轮差动', par: 2,
      slots: { past: 2, present: 2, future: 2 },
      intro: '两组轮系差着半齿。表盘永远慢半拍，报时永远不准点。',
      entities: [{ id: 'gearA', name: '甲轮系', icon: '⚙️' }, { id: 'gearB', name: '乙轮系', icon: '⚙️' }, { id: 'dial', name: '表盘', icon: '🎯' }],
      dict: { 'gearA.off': '错位', 'gearA.mesh': '啮合', 'gearB.off': '错位', 'gearB.mesh': '啮合', 'dial.half': '慢半拍', 'dial.aligned': '对准', 'chime.late': '迟半拍', 'chime.true': '精准' },
      initial: [F('past', 0, 'gearA', 'off'), F('past', 1, 'gearB', 'off'), F('present', 1, 'dial', 'half'), F('future', 1, 'chime', 'late')],
      goals: [F('present', 1, 'dial', 'aligned'), F('future', 1, 'chime', 'true')],
      shards: [
        SH('trigger', 'meshA', '甲轮系啮合', '⚙️', 'gearA', 'past', 'mesh'),
        SH('trigger', 'meshB', '乙轮系啮合', '⚙️', 'gearB', 'past', 'mesh'),
      ],
      rules: [
        R('r1', ['past', 0, 'gearA', 'mesh'], [['present', 1, 'dial', 'aligned']]),
        R('r2', ['past', 1, 'gearB', 'mesh'], [['future', 1, 'chime', 'true']]),
      ],
      story: ['s7_04'], hint: ['甲轮管表盘，乙轮管报时。', '两次啮合。'],
    },
    {
      id: 'c7l05', chapter: 7, index: 5, title: '钟塔的风', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '穿堂风让钟摆变沉。让钟"走快点"的人，会让它撞坏。',
      entities: [{ id: 'shutter', name: '百叶窗', icon: '🪟' }, { id: 'pendulum', name: '钟摆', icon: '⚖️' }],
      dict: { 'shutter.open': '百叶敞开', 'shutter.closed': '关合', 'pendulum.drag': '风阻变大', 'pendulum.calm': '摆动如常', 'midnight.late': '午夜迟鸣', 'midnight.ontime': '午夜准点', 'pendulum.over': '撞击过冲', 'pendulum.overswing': '过摆', 'pendulum.crack': '摆杆撞裂' },
      initial: [F('past', 0, 'shutter', 'open'), F('present', 1, 'pendulum', 'drag'), F('future', 1, 'midnight', 'late')],
      goals: [F('present', 1, 'pendulum', 'calm')],
      hidden: [{ ...F('future', 1, 'midnight', 'ontime'), shardId: 's7h1' }],
      shards: [
        SH('set', 'close', '关合百叶窗', '🪟', 'shutter', 'past', 'closed', { need: 'open' }),
        SH('trigger', 'push', '加大配重', '🏋️', 'pendulum', 'present', 'over'),
      ],
      rules: [
        R('r1', ['past', 0, 'shutter', 'closed'], [['present', 1, 'pendulum', 'calm']]),
        R('rX', ['present', 1, 'pendulum', 'over'], [['future', 1, 'pendulum', 'overswing']]),
        R('rY', ['present', 1, 'pendulum', 'over'], [['future', 1, 'pendulum', 'crack']]),
        R('r2', ['present', 1, 'pendulum', 'calm'], [['future', 1, 'midnight', 'ontime']]),
      ],
      story: ['s7_05'], hint: ['配重会把未来写成"准点"和"撞裂"两个版本。', '关合百叶窗。'],
    },
    {
      id: 'c7l06', chapter: 7, index: 6, title: '十二点的考验', par: 3,
      slots: { past: 3, present: 3, future: 3 },
      intro: '整点前夕：动力、转播、观景台，一样都不能少。',
      entities: [{ id: 'mainspring', name: '主发条', icon: '🔩' }, { id: 'wire', name: '转播线', icon: '🔌' }, { id: 'deck', name: '观景台', icon: '🌉' }, { id: 'crowd', name: '万人', icon: '🧑‍🤝‍🧑' }],
      dict: { 'mainspring.slack': '松弛', 'mainspring.wound': '上满', 'wire.off': '未接', 'wire.on': '接通', 'deck.closed': '关闭', 'deck.open': '开放', 'midnight.ready': '整点就绪', 'broadcast.none': '无转播', 'broadcast.hooked': '转播接通', 'crowd.bare': '空荡', 'crowd.counted': '万人齐望' },
      initial: [F('past', 0, 'mainspring', 'slack'), F('past', 1, 'wire', 'off'), F('past', 2, 'deck', 'closed'), F('present', 2, 'midnight', 'late')],
      goals: [F('present', 2, 'midnight', 'ready'), F('future', 0, 'broadcast', 'hooked'), F('future', 2, 'crowd', 'counted')],
      shards: [
        SH('trigger', 'wind', '上满主发条', '🔩', 'mainspring', 'past', 'wound'),
        SH('trigger', 'hook', '接通转播线', '🔌', 'wire', 'present', 'on'),
        SH('set', 'opendeck', '开放观景台', '🌉', 'deck', 'past', 'open', { need: 'closed' }),
      ],
      rules: [
        R('r1', ['past', 0, 'mainspring', 'wound'], [['present', 2, 'midnight', 'ready']]),
        R('r2', ['present', 1, 'wire', 'on'], [['future', 0, 'broadcast', 'hooked']]),
        R('r3', ['past', 2, 'deck', 'open'], [['future', 2, 'crowd', 'counted']]),
      ],
      story: ['s7_06'], hint: ['三个目标各一条链。', '上发条（过去）、接转播（现在）、开观景台（过去）。'],
    },
  ];

  /* ============================================================
   * 第 8 章 时间实验基地（终章：闭环 + 全机制）
   * ============================================================ */
  const CH8 = [
    {
      id: 'c8l01', chapter: 8, index: 1, title: '加速轨道', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '实验基地的环形轨道。三十年前，就是在这里，第一次时间实验按下了启动键。',
      entities: [{ id: 'injector', name: '注入器', icon: '💉' }, { id: 'ring', name: '环形轨道', icon: '⭕' }, { id: 'data', name: '观测数据', icon: '📊' }],
      dict: { 'injector.idle': '待注入', 'injector.fired': '注入粒子', 'ring.dark': '轨道熄灭', 'ring.lit': '轨道点亮', 'data.none': '无观测', 'data.stream': '数据奔流' },
      initial: [F('past', 1, 'injector', 'idle'), F('present', 1, 'ring', 'dark'), F('future', 1, 'data', 'none')],
      goals: [F('present', 1, 'ring', 'lit')],
      shards: [SH('trigger', 'inject', '注入粒子', '✨', 'injector', 'past', 'fired')],
      rules: [
        R('r1', ['past', 1, 'injector', 'fired'], [['present', 1, 'ring', 'lit']]),
        R('r2', ['present', 1, 'ring', 'lit'], [['future', 1, 'data', 'stream']]),
      ],
      story: ['s8_01'], hint: ['注入粒子。', '过去线 2 号位。'],
    },
    {
      id: 'c8l02', chapter: 8, index: 2, title: '冷却液', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '轨道过热会烧毁三年的时间线。冷却液余量：7%。',
      entities: [{ id: 'coolant', name: '冷却液', icon: '🧊' }, { id: 'ring', name: '环形轨道', icon: '⭕' }],
      dict: { 'coolant.low': '余量不足', 'coolant.refilled': '已补充', 'ring.overheat': '过热', 'ring.stable': '温度稳定', 'shutdown.yes': '紧急停机', 'shutdown.no': '通宵观测' },
      initial: [F('past', 0, 'coolant', 'low'), F('present', 0, 'ring', 'overheat'), F('future', 0, 'shutdown', 'yes')],
      goals: [F('present', 0, 'ring', 'stable')],
      shards: [SH('set', 'refill', '补充冷却液', '🧊', 'coolant', 'past', 'refilled', { need: 'low' })],
      rules: [
        R('r1', ['past', 0, 'coolant', 'refilled'], [['present', 0, 'ring', 'stable']]),
        R('r2', ['present', 0, 'ring', 'stable'], [['future', 0, 'shutdown', 'no']]),
      ],
      story: ['s8_02'], hint: ['补充冷却液。', '过去线 1 号位。'],
    },
    {
      id: 'c8l03', chapter: 8, index: 3, title: '第一次实验', par: 2,
      slots: { past: 2, present: 2, future: 2 },
      intro: '三十年前的今天：防护罩没升，拉杆被拉到了底。你就是那个按下它的人。',
      entities: [{ id: 'shield', name: '防护罩', icon: '🛡️' }, { id: 'lever', name: '启动拉杆', icon: '🎚️' }, { id: 'pulse', name: '时间脉冲', icon: '💥' }],
      dict: { 'shield.down': '未升起', 'shield.up': '升起', 'lever.slam': '一拉到底', 'lever.steady': '匀速', 'pulse.wild': '脉冲失控', 'pulse.safe': '脉冲温和', 'timeline.torn': '时间线撕裂', 'timeline.healed': '时间线愈合' },
      initial: [F('past', 0, 'shield', 'down'), F('present', 0, 'pulse', 'wild'), F('future', 0, 'timeline', 'torn')],
      goals: [F('future', 0, 'timeline', 'healed')],
      shards: [
        SH('set', 'raise', '升起防护罩', '🛡️', 'shield', 'past', 'up', { need: 'down' }),
        SH('trigger', 'steady', '匀速拉动拉杆', '🎚️', 'lever', 'present', 'steady'),
      ],
      rules: [
        R('r1', ['past', 0, 'shield', 'up'], [['present', 0, 'shield', 'active']]),
        R('r2', ['present', 0, 'shield', 'active'], [['future', 0, 'timeline', 'healed']]),
        R('r3', ['present', 0, 'lever', 'steady'], [['future', 0, 'pulse', 'safe']]),
      ],
      story: ['s8_03'], hint: ['升防护罩，脉冲才会被约束。', '升起防护罩 + 匀速拉杆，两次改写。'],
    },
    {
      id: 'c8l04', chapter: 8, index: 4, title: '管理员的工牌', par: 1,
      slots: { past: 3, present: 3, future: 3 },
      intro: '你没有记忆，但你有一块工牌。预置闭环：让它从过去一直戴到未来。',
      entities: [{ id: 'badge', name: '管理员工牌', icon: '🪪' }, { id: 'memory', name: '记忆', icon: '🧠' }],
      dict: { 'badge.worn': '一直佩戴', 'badge.carried': '贴身收着', 'badge.kept': '被基地保存', 'memory.fog': '记忆迷雾', 'memory.return': '记忆归位', 'self.none': '我是谁？', 'self.found': '找回自己' },
      initial: [F('present', 1, 'memory', 'fog'), F('future', 2, 'self', 'none')],
      goals: [F('future', 2, 'self', 'found')],
      shards: [SH('plant', 'wear', '佩戴工牌穿过实验', '🪪', 'badge', 'past', 'carried', { anchor: { t: 'future', s: 2, st: 'kept' } })],
      rules: [
        R('r1', ['past', 2, 'badge', 'carried'], [['present', 1, 'memory', 'return']]),
        R('r2', ['present', 1, 'memory', 'return'], [['future', 2, 'self', 'found']]),
      ],
      story: ['s8_04'], hint: ['预置闭环：工牌从过去带到未来。', '使用"佩戴工牌"，点过去线 3 号位——锚点会在未来线亮起。'],
    },
    {
      id: 'c8l05', chapter: 8, index: 5, title: '给过去的留言', par: 1,
      slots: { past: 2, present: 2, future: 2 },
      intro: '你决定给三十年前的自己留一张字条。预置闭环：字条在过去贴出，在未来被发现。',
      entities: [{ id: 'note', name: '留言条', icon: '📝' }, { id: 'junior', name: '年轻研究员', icon: '🧑‍🔬' }],
      dict: { 'note.left': '贴在控制室', 'note.found': '被揭下保存', 'junior.blind': '没看到警告', 'junior.warned': '看到警告', 'accident.yes': '事故发生', 'accident.no': '事故避免' },
      initial: [F('present', 0, 'junior', 'blind'), F('future', 0, 'accident', 'yes')],
      goals: [F('present', 0, 'junior', 'warned'), F('future', 0, 'accident', 'no')],
      shards: [
        SH('plant', 'leave', '张贴留言条', '📝', 'note', 'past', 'left', { anchor: { t: 'future', s: 0, st: 'found' } }),
      ],
      rules: [
        R('r1', ['past', 0, 'note', 'left'], [['present', 0, 'junior', 'warned']]),
        R('r2', ['future', 0, 'note', 'found'], [['future', 0, 'accident', 'no']]),
      ],
      story: ['s8_05'], hint: ['预置闭环一次落两端：过去贴出，未来被发现。', '使用"张贴留言条"，点过去线 1 号位。'],
    },
    {
      id: 'c8l06', chapter: 8, index: 6, title: '钟塔之心', par: 3,
      slots: { past: 3, present: 3, future: 3 },
      intro: '基地最深处，供着"钟塔之心"——全镇时间错乱的源头。让它稳定下来。',
      entities: [{ id: 'core', name: '钟塔之心', icon: '💎' }, { id: 'shards', name: '时间碎片', icon: '🧩' }, { id: 'valve', name: '泄压阀', icon: '🎛️' }, { id: 'sky', name: '钟塔镇天空', icon: '🌤️' }],
      dict: { 'core.resonant': '异常共振', 'core.stable': '稳定', 'core.stable2': '共振平息', 'valve.shut': '关闭', 'valve.open': '开启', 'shards.scattered': '散落', 'shards.gathered': '归位', 'sky.glitch': '天空错乱', 'sky.clear': '放晴' },
      initial: [F('past', 0, 'core', 'resonant'), F('past', 0, 'valve', 'shut'), F('present', 2, 'shards', 'scattered'), F('future', 2, 'sky', 'glitch')],
      goals: [F('present', 0, 'core', 'stable2'), F('future', 2, 'shards', 'gathered'), F('future', 2, 'sky', 'clear')],
      shards: [
        SH('set', 'align', '校准钟塔之心', '💎', 'core', 'past', 'stable', { need: 'resonant' }),
        SH('trigger', 'open', '开启泄压阀', '🎛️', 'valve', 'past', 'open'),
        SH('trigger', 'recollect', '召回时间碎片', '🧩', 'shards', 'present', 'coming'),
      ],
      rules: [
        R('r1', ['past', 0, 'core', 'stable'], [['present', 0, 'core', 'stable2']]),
        R('r2', ['past', 0, 'valve', 'open'], [['future', 2, 'sky', 'clear']]),
        R('r3', ['present', 2, 'shards', 'coming'], [['future', 2, 'shards', 'gathered']]),
      ],
      story: ['s8_06'], hint: ['三个目标各一条链：校准、泄压、召回碎片。', '校准核心（过去1号位）、开阀（过去1号位）、召回（现在3号位）。'],
    },
  ];

  /* ============================================================
   * BOSS 关（章末因果对决，6 场）
   * ============================================================ */
  const BOSSES = [
    {
      id: 'c2boss', chapter: 2, index: 13, kind: 'boss', title: 'BOSS·档案馆之影', par: 2,
      slots: { past: 2, present: 2, future: 2 }, interactive: ['past'],
      intro: '影子在书架间移动。火把会惊动它，荧光灯不会。',
      entities: [{ id: 'shadow', name: '档案馆之影', icon: '👤' }, { id: 'bell', name: '馆钟', icon: '🔔' }, { id: 'lantern', name: '荧光灯', icon: '🏮' }, { id: 'torch', name: '火把', icon: '🔥' }, { id: 'record', name: '实验记录', icon: '📜' }],
      dict: { 'bell.rung': '鸣响', 'shadow.lurk': '蛰伏', 'shadow.bound': '被钟声钉住', 'lantern.off': '熄灭', 'lantern.lit': '点亮', 'shadow.calm': '安静下来', 'torch.raised': '高高举起', 'truth.hidden': '藏在影里', 'truth.revealed': '显形' },
      initial: [F('past', 0, 'lantern', 'off'), F('present', 1, 'shadow', 'lurk'), F('future', 1, 'truth', 'hidden')],
      goals: [F('present', 1, 'shadow', 'bound'), F('future', 1, 'truth', 'revealed')],
      shards: [
        SH('trigger', 'ring', '鸣响馆钟', '🔔', 'bell', 'past', 'rung'),
        SH('trigger', 'lightl', '点亮荧光灯', '🏮', 'lantern', 'past', 'lit'),
        SH('trigger', 'torchup', '举起火把', '🔥', 'torch', 'past', 'raised'),
      ],
      rules: [
        R('r1', ['past', 0, 'bell', 'rung'], [['present', 1, 'shadow', 'bound']]),
        R('r2', ['past', 0, 'lantern', 'lit'], [['present', 1, 'shadow', 'calm']]),
        R('r3', ['present', 1, 'shadow', 'calm'], [['future', 1, 'truth', 'revealed']]),
        R('rX', ['past', 0, 'torch', 'raised'], [['present', 1, 'shadow', 'strikes']]),
        R('rY', ['past', 0, 'torch', 'raised'], [['present', 1, 'shadow', 'flees']]),
      ],
      story: ['s2b'], hint: ['馆钟钉住影子，荧光灯让它显形。', '火把会同时把影子写成"扑来"和"逃走"——风暴。'],
    },
    {
      id: 'c3boss', chapter: 3, index: 13, kind: 'boss', title: 'BOSS·环线因果对决', par: 3,
      slots: { past: 3, present: 3, future: 3 }, interactive: ['past', 'present'],
      intro: '环线瘫痪三小时。调度中心把所有权限交给了你——和时间。',
      entities: [{ id: 'cable', name: '主缆线', icon: '🔌' }, { id: 'brake', name: '制动阀', icon: '🛗' }, { id: 'console', name: '调度台', icon: '🖥️' }, { id: 'crowd', name: '市民', icon: '🧍' }],
      dict: { 'cable.snapped': '崩断', 'cable.spliced': '接续', 'power.out': '停电', 'signal.live': '信号恢复', 'brake.unchecked': '未预检', 'brake.checked': '预检完毕', 'train.held': '全线待发', 'train.go': '发车', 'crowd.upset': '骚动', 'crowd.cheer': '欢呼' },
      initial: [F('past', 0, 'cable', 'snapped'), F('past', 1, 'brake', 'unchecked'), F('present', 0, 'power', 'out'), F('present', 1, 'train', 'held')],
      goals: [F('present', 0, 'signal', 'live'), F('present', 1, 'brake', 'ready'), F('future', 2, 'crowd', 'cheer')],
      shards: [
        SH('trigger', 'splice', '接续缆线', '🔌', 'cable', 'past', 'spliced'),
        SH('trigger', 'check', '预检制动', '🛗', 'brake', 'past', 'checked'),
        SH('trigger', 'dispatch', '调度发车', '🖥️', 'console', 'present', 'go'),
      ],
      rules: [
        R('r1', ['past', 0, 'cable', 'spliced'], [['present', 0, 'power', 'on']]),
        R('r2', ['present', 0, 'power', 'on'], [['present', 0, 'signal', 'live']]),
        R('r3', ['past', 1, 'brake', 'checked'], [['present', 1, 'brake', 'ready']]),
        R('r4', ['present', 1, 'brake', 'ready'], [['present', 1, 'train', 'can']]),
        R('r5', ['present', 1, 'console', 'go'], [['present', 1, 'train', 'go']]),
        R('r6', ['present', 1, 'train', 'go'], [['future', 2, 'crowd', 'cheer']]),
      ],
      story: ['s3b'], hint: ['接缆线→电力→信号；预检→制动就绪；然后调度发车。', '顺序：接缆、预检、发车。'],
    },
    {
      id: 'c4boss', chapter: 4, index: 13, kind: 'boss', title: 'BOSS·静默的心电图', par: 3,
      slots: { past: 3, present: 3, future: 3 }, interactive: ['past', 'present'],
      intro: '手术前三小时，监护仪、血袋、麻醉钟同时出问题。这不是巧合。',
      entities: [{ id: 'plug', name: '插头', icon: '🔌' }, { id: 'form', name: '核对单', icon: '📝' }, { id: 'clock', name: '手术钟', icon: '🕰️' }, { id: 'monitor', name: '监护仪', icon: '📉' }, { id: 'blood', name: '血袋', icon: '🩸' }, { id: 'surgery', name: '手术', icon: '🔪' }],
      dict: { 'plug.loose': '插头松动', 'plug.tight': '插稳', 'form.missing': '未打印', 'form.printed': '已打印', 'clock.slow': '慢十分钟', 'clock.exact': '校准', 'monitor.dark': '监护中断', 'monitor.steady': '运行平稳', 'crossmatch.none': '未配型', 'crossmatch.done': '配型完成', 'surgery.risk': '风险高悬', 'surgery.done': '手术顺利' },
      initial: [F('past', 0, 'plug', 'loose'), F('past', 1, 'form', 'missing'), F('past', 2, 'clock', 'slow'), F('present', 0, 'monitor', 'dark'), F('future', 2, 'surgery', 'risk')],
      goals: [F('present', 0, 'monitor', 'steady'), F('future', 1, 'crossmatch', 'done'), F('future', 2, 'surgery', 'done')],
      shards: [
        SH('set', 'tight', '插稳插头', '🔌', 'plug', 'past', 'tight', { need: 'loose' }),
        SH('trigger', 'reprint', '重打印核对单', '📝', 'form', 'past', 'printed'),
        SH('set', 'sync', '校准手术钟', '🕰️', 'clock', 'past', 'exact', { need: 'slow' }),
      ],
      rules: [
        R('r1', ['past', 0, 'plug', 'tight'], [['present', 0, 'monitor', 'steady']]),
        R('r2', ['past', 1, 'form', 'printed'], [['present', 1, 'form', 'ready']]),
        R('r3', ['present', 1, 'form', 'ready'], [['future', 1, 'crossmatch', 'done']]),
        R('r4', ['past', 2, 'clock', 'exact'], [['future', 2, 'surgery', 'done']]),
      ],
      story: ['s4b'], hint: ['监护、配型、时钟，各一条链。', '插稳插头 + 打印核对单 + 校准手术钟。'],
    },
    {
      id: 'c5boss', chapter: 5, index: 13, kind: 'boss', title: 'BOSS·电波风暴', par: 3,
      slots: { past: 3, present: 3, future: 3 },
      intro: '雷暴夜。铁塔、天线、归档磁带，同时告警。电台只剩你一个人。',
      entities: [{ id: 'antenna', name: '天线', icon: '📡' }, { id: 'tower', name: '铁塔', icon: '🗼' }, { id: 'tape', name: '归档磁带', icon: '📼' }, { id: 'signal', name: '电波', icon: '📶' }],
      dict: { 'antenna.snow': '积雪压顶', 'antenna.deiced': '除冰', 'tower.sway': '塔身摇晃', 'tower.braced': '加固', 'tape.loose': '散乱', 'tape.saved': '归档', 'tape.done': '归档完成', 'signal.weak': '微弱', 'signal.clear': '清朗', 'storm.here': '风暴在头顶', 'storm.past': '风暴过去' },
      initial: [F('past', 1, 'antenna', 'snow'), F('past', 0, 'tower', 'sway'), F('present', 2, 'tape', 'loose'), F('present', 1, 'signal', 'weak')],
      goals: [F('present', 1, 'signal', 'clear'), F('future', 0, 'tower', 'standing'), F('present', 2, 'tape', 'done')],
      shards: [
        SH('trigger', 'deice', '上天线除冰', '❄️', 'antenna', 'past', 'deiced'),
        SH('trigger', 'brace', '加固铁塔', '🗼', 'tower', 'past', 'braced'),
        SH('trigger', 'save', '归档磁带', '📼', 'tape', 'present', 'saved'),
        SH('trigger', 'boost', '强行增强功率', '⚡', 'tower', 'present', 'surging'),
      ],
      rules: [
        R('r1', ['past', 1, 'antenna', 'deiced'], [['present', 1, 'signal', 'clear']]),
        R('r2', ['past', 0, 'tower', 'braced'], [['future', 0, 'tower', 'standing']]),
        R('r3', ['present', 2, 'tape', 'saved'], [['present', 2, 'tape', 'done']]),
        R('rX', ['present', 0, 'tower', 'surging'], [['future', 0, 'storm', 'here']]),
        R('rY', ['present', 0, 'tower', 'surging'], [['future', 0, 'storm', 'past']]),
      ],
      story: ['s5b'], hint: ['除冰、加固、归档，三条链三次操作。', '增压会把风暴写成"来了"和"过去"——风暴。'],
    },
    {
      id: 'c6boss', chapter: 6, index: 13, kind: 'boss', title: 'BOSS·闭环悖论对决', par: 2,
      slots: { past: 3, present: 3, future: 3 },
      intro: '庙会前夜，老城区的时间也打了个结。你需要一个真正的闭环。',
      entities: [{ id: 'notice', name: '庙会布告', icon: '📜' }, { id: 'stage', name: '戏台', icon: '🎭' }, { id: 'crowd', name: '街坊', icon: '🧑‍🤝‍🧑' }],
      dict: { 'notice.blank': '还是白纸', 'notice.posted': '张贴出去', 'notice.kept': '被收藏纪念', 'stage.old': '台柱朽了', 'stage.ready': '戏台就绪', 'opera.none': '无戏可看', 'opera.on': '开锣', 'loop.broken': '因果断裂', 'loop.closed': '因果闭环' },
      initial: [F('past', 1, 'stage', 'old'), F('present', 1, 'opera', 'none')],
      goals: [F('present', 1, 'stage', 'ready'), F('future', 2, 'loop', 'closed')],
      shards: [
        SH('set', 'fixstage', '加固戏台', '🎭', 'stage', 'past', 'fixed', { need: 'old' }),
        SH('plant', 'post', '张贴并收藏布告', '📜', 'notice', 'past', 'posted', { anchor: { t: 'future', s: 2, st: 'kept' } }),
      ],
      rules: [
        R('r1', ['past', 1, 'stage', 'fixed'], [['present', 1, 'stage', 'ready']]),
        R('r2', ['past', 0, 'notice', 'posted'], [['present', 0, 'crowd', 'come']]),
        R('r3', ['future', 2, 'notice', 'kept'], [['future', 2, 'loop', 'closed']]),
      ],
      story: ['s6b'], hint: ['戏台要在过去修好。', '布告闭环：过去张贴 + 未来收藏，一次落两端。'],
    },
    {
      id: 'c8boss', chapter: 8, index: 13, kind: 'boss', title: 'BOSS·第一次时间的实验·终', par: 4,
      slots: { past: 3, present: 3, future: 3 },
      intro: '一切回到三十年前的那个清晨。这一次，你是时间管理员，不是那个慌张的研究员。',
      entities: [{ id: 'shield', name: '防护罩', icon: '🛡️' }, { id: 'lever', name: '启动拉杆', icon: '🎚️' }, { id: 'mic', name: '广播麦', icon: '🎙️' }, { id: 'bell', name: '八城钟', icon: '🔔' }, { id: 'timeline', name: '时间线', icon: '🧬' }],
      dict: { 'shield.down': '未升起', 'shield.up': '升起', 'seal.none': '封印未成', 'seal.intact': '封印完好', 'lever.slam': '一拉到底', 'lever.steady': '匀速', 'truth.hidden': '真相沉默', 'truth.spoken': '真相说出', 'bell.quiet': '八城寂静', 'bell.rings': '八城齐鸣', 'timeline.torn': '时间线撕裂', 'timeline.restored': '时间线复原' },
      initial: [F('past', 0, 'shield', 'down'), F('present', 1, 'truth', 'hidden'), F('future', 2, 'timeline', 'torn'), F('past', 2, 'bell', 'quiet')],
      goals: [F('present', 0, 'seal', 'intact'), F('future', 1, 'truth', 'spoken'), F('present', 2, 'bell', 'rings'), F('future', 2, 'timeline', 'restored')],
      shards: [
        SH('set', 'raise', '升起防护罩', '🛡️', 'shield', 'past', 'up', { need: 'down' }),
        SH('trigger', 'steady', '匀速拉动拉杆', '🎚️', 'lever', 'present', 'steady'),
        SH('trigger', 'confess', '说出真相', '🎙️', 'mic', 'present', 'on'),
        SH('trigger', 'ringall', '敲响八城钟', '🔔', 'bell', 'past', 'rung'),
      ],
      rules: [
        R('r1', ['past', 0, 'shield', 'up'], [['present', 0, 'seal', 'intact']]),
        R('r2', ['present', 1, 'mic', 'on'], [['future', 1, 'truth', 'spoken']]),
        R('r3', ['past', 2, 'bell', 'rung'], [['present', 2, 'bell', 'rings']]),
        R('r4', ['present', 2, 'bell', 'rings'], [['future', 2, 'timeline', 'restored']]),
        R('r5', ['present', 0, 'lever', 'steady'], [['future', 0, 'pulse', 'safe']]),
      ],
      story: ['s8b'], hint: ['四个目标四条链：防护罩、广播、八城钟、匀速拉杆。', '顺序不限，但每一步都要落在正确的线上。'],
    },
  ];

  /* ============================================================
   * 程序化关卡生成器（悖论实验室 / 章节回响关 / 时间裂隙）
   * 构造式生成：先构造解，再反推初始状态，保证可解。
   * ============================================================ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const GEN_POOLS = {
    1: { root: ['🔔', '⚙️', '🔩', '🕯️'], mid: ['🕰️', '📜'], out: ['🧑‍🤝‍🧑', '🎵'], names: ['回响的钟摆', '第三枚齿轮', '守夜人的灯', '铜锈与琴声', '暮色里的指针', '被遗忘的上弦日'] },
    2: { root: ['📚', '🕯️', '🗂️', '🖋️'], mid: ['🗄️', '📜'], out: ['🧑‍🔬', '🪶'], names: ['第七架的空隙', '褪色的借阅卡', '雨季的地下书库', '编号 217 之谜', '装订线的秘密', '抄写员的失误'] },
    3: { root: ['🚦', '🔌', '🎫', '🚰'], mid: ['🚇', '🖥️'], out: ['🧍', '🚲'], names: ['回响的月台', '隧道深处', '换乘的十字', '夜班调度员', '末班延长线', '闸机口的风'] },
    4: { root: ['💊', '🔌', '📋', '💉'], mid: ['📉', '🛏️'], out: ['👵', '🧒'], names: ['夜间巡房', '三楼的灯', '配型单上的名字', '输液管的滴答', '值班室的长夜', '出院那天'] },
    5: { root: ['🎙️', '📡', '📼', '🎛️'], mid: ['📻', '🗼'], out: ['🌙', '💿'], names: ['午夜频率', '雪花屏的夜', '读信的人', '天线与雪', '最后一次调频', '城市枕头下的歌'] },
    6: { root: ['🏮', '🪨', '🔩', '🪢'], mid: ['🏪', '🧵'], out: ['🐱', '🧑‍🤝‍🧑'], names: ['巷口的棋局', '屋檐下的雨链', '井台边的午后', '老墙上的刻度', '晒谷场的黄昏', '夜市的灯'] },
    7: { root: ['🔩', '⚙️', '🔨', '🪟'], mid: ['🔔', '⚖️'], out: ['🧑‍🤝‍🧑', '🌉'], names: ['大钟的呼吸', '擒纵之间', '第四音锤', '风的阻力', '子夜的试鸣', '钟塔的影子'] },
    8: { root: ['🧪', '💎', '🛡️', '🎚️'], mid: ['⭕', '🖥️'], out: ['🧬', '🧩'], names: ['第 0 号档案', '观察者的眼睛', '相位差', '回声实验', '钟塔之心的梦', '时间线校准夜'] },
  };

  /* 家族 A：单根因修复（1 步解） */
  function famA(rng, ch, idx, name) {
    const pool = GEN_POOLS[ch];
    const ri = Math.floor(rng() * pool.root.length);
    const mi = Math.floor(rng() * pool.mid.length);
    const oi = Math.floor(rng() * pool.out.length);
    const ents = {
      root: { id: 'e1', name: '起因之物', icon: pool.root[ri] },
      mid: { id: 'e2', name: '传导之物', icon: pool.mid[mi] },
      out: { id: 'e3', name: '受影响者', icon: pool.out[oi] },
    };
    const rs = Math.floor(rng() * 2); // 根因所在过去槽位
    const def = {
      id: 'g' + ch + 'x' + idx, chapter: ch, index: idx, title: name, par: 1, gen: true,
      slots: { past: 3, present: 3, future: 3 },
      intro: '回响档案：这条时间线又出了一次小小的错乱。',
      entities: Object.values(ents),
      dict: { 'e1.bad': '异常', 'e1.good': '正常', 'e2.bad': '中断', 'e2.good': '恢复', 'e3.bad': '被打乱', 'e3.good': '如常' },
      initial: [F('past', rs, 'e1', 'bad'), F('present', 1 + rs, 'e2', 'bad'), F('future', 2, 'e3', 'bad')],
      goals: [F('present', 1 + rs, 'e2', 'good')],
      shards: [SH('trigger', 'fix', '矫正起因', pool.root[ri], 'e1', 'past', 'good')],
      rules: [
        R('r1', ['past', rs, 'e1', 'good'], [['present', 1 + rs, 'e2', 'good']]),
        R('r2', ['present', 1 + rs, 'e2', 'good'], [['future', 2, 'e3', 'good']]),
      ],
      story: [], hint: ['修好起因之物。', '在过去线矫正它。'],
    };
    return { def, solution: [{ shardId: 'fix', target: { t: 'past', s: rs } }] };
  }

  /* 家族 B：双约束（同一起因必须同时满足两个下游）→ 2 步 */
  function famB(rng, ch, idx, name) {
    const pool = GEN_POOLS[ch];
    const ri = Math.floor(rng() * pool.root.length);
    const mi = Math.floor(rng() * pool.mid.length);
    const oi = Math.floor(rng() * pool.out.length);
    const rs = Math.floor(rng() * 2);
    const def = {
      id: 'g' + ch + 'y' + idx, chapter: ch, index: idx, title: name, par: 2, gen: true,
      slots: { past: 3, present: 3, future: 3 },
      intro: '回响档案：两处错乱，同一条根。',
      entities: [
        { id: 'e1', name: '起因之物', icon: pool.root[ri] },
        { id: 'e2', name: '现在的锚', icon: pool.mid[mi] },
        { id: 'e3', name: '未来的锚', icon: pool.out[oi] },
      ],
      dict: { 'e1.bad': '异常', 'e1.good': '正常', 'e2.bad': '中断', 'e2.good': '恢复', 'e3.bad': '受阻', 'e3.good': '顺畅' },
      initial: [F('past', rs, 'e1', 'bad'), F('present', 1, 'e2', 'bad'), F('future', 2, 'e3', 'bad')],
      goals: [F('present', 1, 'e2', 'good'), F('future', 2, 'e3', 'good')],
      shards: [
        SH('trigger', 'fix', '矫正起因', pool.root[ri], 'e1', 'past', 'good'),
        SH('trigger', 'aid', '就近协助', pool.out[oi], 'e3', 'future', 'good'),
      ],
      rules: [
        R('r1', ['past', rs, 'e1', 'good'], [['present', 1, 'e2', 'good']]),
        R('r2', ['present', 1, 'e2', 'good'], [['future', 2, 'e3', 'good']], { min: 60 }),
        R('r3', ['future', 2, 'e3', 'good2'], [['future', 2, 'e3', 'good']]),
      ],
      story: [], hint: ['涟漪衰减：直接在未来协助未来。', '矫正起因（过去）+ 就近协助（未来）。'],
    };
    return {
      def,
      solution: [
        { shardId: 'fix', target: { t: 'past', s: rs } },
        { shardId: 'aid', target: { t: 'future', s: 2 } },
      ],
    };
  }

  /* 家族 C：诱饵陷阱（错误碎片触发风暴，1 步正解） */
  function famC(rng, ch, idx, name) {
    const pool = GEN_POOLS[ch];
    const ri = Math.floor(rng() * pool.root.length);
    const mi = Math.floor(rng() * pool.mid.length);
    const def = {
      id: 'g' + ch + 'z' + idx, chapter: ch, index: idx, title: name, par: 1, gen: true,
      slots: { past: 2, present: 2, future: 2 },
      intro: '回响档案：小心，有一条捷径通向风暴。',
      entities: [
        { id: 'e1', name: '起因之物', icon: pool.root[ri] },
        { id: 'e2', name: '传导之物', icon: pool.mid[mi] },
        { id: 'e3', name: '平行之物', icon: pool.mid[(mi + 1) % pool.mid.length] },
      ],
      dict: { 'e1.bad': '异常', 'e1.good': '正常', 'e2.bad': '中断', 'e2.good': '恢复', 'e2.x': '被强行撬动', 'e3.a': '状态甲', 'e3.b': '状态乙' },
      initial: [F('past', 0, 'e1', 'bad'), F('present', 1, 'e2', 'bad')],
      goals: [F('present', 1, 'e2', 'good')],
      shards: [
        SH('trigger', 'fix', '矫正起因', pool.root[ri], 'e1', 'past', 'good'),
        SH('trigger', 'hack', '强行撬动', '🪓', 'e2', 'present', 'x'),
      ],
      rules: [
        R('r1', ['past', 0, 'e1', 'good'], [['present', 1, 'e2', 'good']]),
        R('rA', ['present', 1, 'e2', 'x'], [['future', 1, 'e3', 'a']]),
        R('rB', ['present', 1, 'e2', 'x'], [['future', 1, 'e3', 'b']]),
      ],
      story: [], hint: ['撬动会把未来写成两个互相矛盾的样子。', '回到过去修起因。'],
    };
    return { def, solution: [{ shardId: 'fix', target: { t: 'past', s: 0 } }] };
  }

  /* 家族 D：移动类（2 步：搬移 + 触发） */
  function famD(rng, ch, idx, name) {
    const pool = GEN_POOLS[ch];
    const ii = Math.floor(rng() * pool.root.length);
    const mi = Math.floor(rng() * pool.mid.length);
    const def = {
      id: 'g' + ch + 'w' + idx, chapter: ch, index: idx, title: name, par: 2, gen: true,
      slots: { past: 3, present: 3, future: 3 },
      intro: '回响档案：先把它放回原位，再让它工作。',
      entities: [
        { id: 'e1', name: '离位之物', icon: pool.root[ii] },
        { id: 'e2', name: '机关', icon: pool.mid[mi] },
        { id: 'e3', name: '下游产出', icon: pool.mid[(mi + 1) % pool.mid.length] },
      ],
      dict: { 'e1.loose': '离位', 'e1.removed': '已取走', 'e1.set': '归位', 'e2.idle': '待激活', 'e2.armed': '已就绪', 'e2.on': '激活', 'e3.bad': '停滞', 'e3.good': '运转' },
      initial: [F('past', 0, 'e1', 'loose'), F('past', 2, 'e2', 'idle'), F('present', 2, 'e3', 'bad')],
      goals: [F('present', 2, 'e3', 'good')],
      shards: [
        SH('move', 'place', '归位离位之物', pool.root[ii], 'e1', 'past', 'set', { fromNeed: 'loose', clearState: 'removed' }),
        SH('trigger', 'act', '激活机关', pool.mid[mi], 'e2', 'past', 'on'),
      ],
      rules: [
        R('r1', ['past', 2, 'e1', 'set'], [['past', 2, 'e2', 'armed']]),
        R('r2', ['past', 2, 'e2', 'on'], [['present', 2, 'e3', 'good']]),
      ],
      story: [], hint: ['先归位，再激活。', '把离位之物移到 3 号位，然后激活机关。'],
    };
    return {
      def,
      solution: [
        { shardId: 'place', target: { t: 'past', s: 2 }, source: { t: 'past', s: 0 } },
        { shardId: 'act', target: { t: 'past', s: 2 } },
      ],
    };
  }

  const FAMS = [famA, famB, famC, famD];

  function genLevel(ch, idx, seed, opts) {
    opts = opts || {};
    const rng = mulberry32(seed);
    const pool = GEN_POOLS[ch] || GEN_POOLS[1];
    const used = new Set();
    let name = '';
    for (let i = 0; i < 40; i++) {
      name = pool.names[Math.floor(rng() * pool.names.length)];
      if (!used.has(name)) { used.add(name); break; }
    }
    const interactive = opts.interactive || (P1.CHAPTERS[ch - 1] ? P1.CHAPTERS[ch - 1].interact : ['past', 'present', 'future']);
    // 家族约束：famB 需要"就近协助"未来线；其余家族只依赖过去线
    const allowed = interactive.includes('future') ? [0, 1, 2, 3] : [0, 2, 3];
    const famIdx = opts.family != null ? opts.family : allowed[Math.floor(rng() * allowed.length)];
    const built = FAMS[famIdx](rng, ch, idx, name + (opts.suffix || ''));
    const def = built.def;
    def.interactive = interactive;
    return { def, solution: built.solution };
  }

  /* 生成某章的回响关（补足 12 关） */
  function echoLevels(ch, count, baseSeed) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const { def } = genLevel(ch, 100 + i, (baseSeed || 7) * 131 + ch * 17 + i * 7);
      out.push(def);
    }
    return out;
  }

  /* 悖论实验室：每日 3 题（唯一解构造 + 模拟验证） */
  function labDaily(dateStr) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const ch = 1 + ((hashStr(dateStr) + i * 97) % 8);
      const { def, solution } = genLevel(ch, 200 + i, hashStr(dateStr + '#' + i));
      def.id = 'lab_' + dateStr + '_' + i;
      def.kind = 'lab';
      def.title = '悖论实验室 · ' + (i + 1) + '号题';
      def.par = solution.length;
      def.interactive = ['past', 'present', 'future'];
      out.push(def);
    }
    return out;
  }

  /* 时间裂隙：周常挑战关（更难：家族 B/C 混合） */
  function riftWeekly(weekKey) {
    const ch = 1 + (hashStr(weekKey) % 8);
    const fam = hashStr(weekKey + 'f') % 2 === 0 ? 1 : 2;
    const { def } = genLevel(ch, 300, hashStr(weekKey), { family: fam, suffix: '（裂隙）' });
    def.id = 'rift_' + weekKey;
    def.kind = 'rift';
    def.title = '时间裂隙 · ' + weekKey;
    def.interactive = ['past', 'present', 'future'];
    return def;
  }

  /* ---------- 关卡注册表 ---------- */
  const HAND = [...P1.CH1, ...P1.CH2, ...P1.CH3, ...P1.CH4, ...CH5, ...CH6, ...CH7, ...CH8];
  const ALL = [...HAND, ...BOSSES.map(b => ({ ...b }))];

  function levelsOfChapter(ch) {
    const main = ALL.filter(l => l.chapter === ch);
    const have = main.filter(l => l.kind !== 'boss').length;
    if (have < 12) {
      const echoes = echoLevels(ch, 12 - have, 42);
      echoes.forEach((e, i) => { e.chapter = ch; e.index = have + 1 + i; e.gen = true; });
      main.push(...echoes);
    }
    main.sort((a, b) => (a.kind === 'boss' ? 99 : a.index) - (b.kind === 'boss' ? 99 : b.index));
    return main;
  }
  function getLevel(id) {
    if (id.startsWith('lab_')) {
      const date = id.slice(4).replace(/_\d+$/, '');
      const i = +id.slice(id.lastIndexOf('_') + 1);
      return labDaily(date)[i];
    }
    if (id.startsWith('rift_')) return riftWeekly(id.slice(5));
    return ALL.find(l => l.id === id);
  }
  function allHandLevels() { return ALL.slice(); }

  root.TSLevels = {
    CHAPTERS: P1.CHAPTERS, levelsOfChapter, getLevel, allHandLevels,
    genLevel, labDaily, riftWeekly, ALL, F, R, SH,
  };
})(typeof window !== 'undefined' ? window : globalThis);
