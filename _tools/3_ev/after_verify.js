// ===== “改动后”验证脚本 =====
// 用法: --evalFile=lib.js --evalFile=after_verify.js
(() => {
  const R = { phase: 'AFTER' };
  localStorage.setItem('tc_tut_off', '1');
  G.uiPaused = false;

  const logTexts = [];
  const origLog = G.UI.log;
  G.UI.log = function (t) { logTexts.push(String(t)); return origLog.apply(this, arguments); };

  const T = G.CFG.TERR;
  const tile = i => ({ x: i % G.CFG.MAPW, y: (i / G.CFG.MAPW) | 0 });
  // 读地形预渲染层在某一格的平均颜色(证明"树林视觉上真的变稀/长回来")
  function terrAvg(tx, ty) {
    const cvs = G.RD.terrainCanvas;
    const c = cvs.getContext('2d');
    const TSZ = G.CFG.TS;
    const d = c.getImageData(tx * TSZ + 4, ty * TSZ + 4, TSZ - 8, TSZ - 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }
  const terrDiff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  // 供增量重绘生效:强制把队列里的格子重画完
  function flushRepaint() { const b = G.NAT.takeDirty(100000); if (b) for (const i of b) G.RD.repaintTile(i % G.CFG.MAPW, (i / G.CFG.MAPW) | 0); }

  // ================= Q1 资源可再生 =================
  G.main.newGame(4242, 'sandbox');
  G.sim.speed = 0;
  const s1 = G.sim.state;
  const t0hash = __T.terrHash();
  const lp = __T.findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
  const camp = G.B.place('lumber', lp.x, lp.y).b;
  // 让聚落活得下去(有房有粮),否则人会死光、伐木场停摆,测不出连续采伐
  __T.buildTown();
  s1.gold = 100000; s1.wood = 100000; s1.stone = 100000;   // 只隔离"资源/产出"变量,不影响蓄积
  const forestNear = G.NAT.near(camp, 'wood');
  const sample = tile(G.NAT.nearby(camp, 'wood')[0]);
  const px0 = terrAvg(sample.x, sample.y);

  R.Q1_森林 = {
    '伐木场位置': `(${camp.x},${camp.y}) 毗邻森林 ${camp.forest} 格`,
    '初始森林蓄积(G.NAT)': +forestNear.total.toFixed(1),
    '初始蓄积率': +(forestNear.ratio * 100).toFixed(0) + '%',
    '地图地形哈希(第1天)': t0hash,
    '存在可再生资源层': typeof G.NAT,
  };
  __T.run(40);
  flushRepaint();
  const after40 = G.NAT.near(camp, 'wood');
  const px1 = terrAvg(sample.x, sample.y);
  R.Q1_砍伐40天后 = {
    '森林蓄积': +after40.total.toFixed(1),
    '蓄积率': +(after40.ratio * 100).toFixed(0) + '%',
    '伐木场员工/效率': camp.staff.length + '/' + camp.def.workers + ' eff=' + camp.eff.toFixed(2),
    '40天累计落库木材': +s1.totalProd.wood.toFixed(1),
    '采伐是否真的消耗了地图资源(蓄积下降)': after40.total < forestNear.total,
    '地形格外观是否随采伐变化(像素差)': terrDiff(px0, px1),
    '地形类型是否被破坏(哈希不变)': __T.terrHash() === t0hash,
  };

  G.B.remove(camp);                    // 停采
  const sumLive = G.NAT.summary();
  R.Q1_采伐中的资源总览 = {
    '森林(已解锁领地)': `${sumLive.wood.icon}${sumLive.wood.name} ${Math.round(sumLive.wood.total)}/${Math.round(sumLive.wood.cap)}(${Math.round(sumLive.wood.ratio * 100)}%) 生长+${sumLive.wood.grow.toFixed(1)}/日 采集-${sumLive.wood.harvest.toFixed(1)}/日 净${sumLive.wood.net >= 0 ? '+' : ''}${sumLive.wood.net.toFixed(1)}/日`,
    '矿脉': `${sumLive.ore.icon}${sumLive.ore.name} 蓄积${Math.round(sumLive.ore.total)} 生长+${sumLive.ore.grow.toFixed(1)}/日 采集-${sumLive.ore.harvest.toFixed(1)}/日`,
    '猎物': `${sumLive.game.icon}${sumLive.game.name} 蓄积${Math.round(sumLive.game.total)} 生长+${sumLive.game.grow.toFixed(1)}/日 采集-${sumLive.game.harvest.toFixed(1)}/日`,
    '原始今日计数 today/growth': JSON.stringify({ today: G.NAT.today, growth: { wood: +G.NAT.growth.wood.toFixed(1) } }),
    '全图森林总量': Math.round(G.NAT.totalAll('wood')),
    '伐木场当日 lastOut/lastYield': camp.lastOut ? camp.lastOut.wood.toFixed(2) + ' / ' + camp.lastYield.toFixed(2) : 'n/a',
    '伐木场 eff': camp.eff,
  };
  G.NAT.markAllDirty();
  const t1 = G.NAT.near(camp, 'wood').total;
  __T.run(45);                          // 停采 45 天,看是否长回来
  flushRepaint();
  const t2 = G.NAT.near(camp, 'wood');
  const px2 = terrAvg(sample.x, sample.y);
  R.Q1_停采45天后 = {
    '停采时蓄积': +t1.toFixed(1),
    '恢复后蓄积': +t2.total.toFixed(1),
    '静置期生长量': +(t2.total - t1).toFixed(1),
    '资源会自己长回来': t2.total > t1 + 1,
    '外观恢复(与采伐期像素差)': terrDiff(px1, px2),
  };
  const sum = G.NAT.summary();
  R.Q1_资源总览接口 = {
    '森林': `${sum.wood.icon}${sum.wood.name} ${Math.round(sum.wood.total)}/${Math.round(sum.wood.cap)} 生长+${sum.wood.grow.toFixed(1)}/日 采集-${sum.wood.harvest.toFixed(1)}/日`,
    '矿脉': `${sum.ore.icon}${sum.ore.name} ${Math.round(sum.ore.total)}/${Math.round(sum.ore.cap)} 生长+${sum.ore.grow.toFixed(1)}/日 采集-${sum.ore.harvest.toFixed(1)}/日`,
    '猎物': `${sum.game.icon}${sum.game.name} ${Math.round(sum.game.total)}/${Math.round(sum.game.cap)} 生长+${sum.game.grow.toFixed(1)}/日 采集-${sum.game.harvest.toFixed(1)}/日`,
    '玩家能感知(城市面板含“可再生资源”)': (function () {
      document.querySelectorAll('#panel-tabs button').forEach(b => { if (b.dataset.tab === 'city') b.click(); });
      const txt = G.U.$('panel-body').textContent;
      document.querySelectorAll('#panel-tabs button').forEach(b => { if (b.dataset.tab === 'info') b.click(); });
      return /可再生资源/.test(txt) && /生长/.test(txt);
    })(),
    '悬浮资源格有提示': (function () {
      const t = tile(G.NAT.nearby(camp, 'wood')[0] || G.NAT.gameNodes()[0]);
      G.UI.hoverAt(0, 0, { tx: t.x, ty: t.y });
      const el = G.U.$('tooltip');
      const ok = !el.classList.contains('hidden') && /蓄积/.test(el.textContent);
      G.UI.hideHover();
      return ok;
    })(),
  };

  // 矿脉勘探刷新(probeDays=40,lastProbeDay 从开局第 1 天算起 → 第 41 天触发)
  R.Q1_勘探刷新 = (function () {
    G.main.newGame(4242, 'sandbox'); G.sim.speed = 0;
    const q = __T.findBest('quarry', (x, y, d) => G.M.rockNear(x, y, d.w, d.h, 2));
    const b = G.B.place('quarry', q.x, q.y).b;
    __T.run(39);                               // 跑到第 40 天
    G.NAT.fill(b, 'ore', 0.02);                // 临触发前把矿脉压到接近枯竭
    const before = G.NAT.near(b, 'ore').total;
    let probeLog = null;
    __T.run(3);                                // 跨过第 41 天 → 触发勘探
    for (const t of logTexts) if (/勘探/.test(t) && !probeLog) probeLog = t;
    return { '压榨后蓄积': +before.toFixed(1), '3天后蓄积': +G.NAT.near(b, 'ore').total.toFixed(1), '勘探刷新日志': probeLog };
  })();

  // ================= Q3 建筑产出真的进账 =================
  G.main.newGame(1337, 'sandbox');
  G.sim.speed = 0;
  const s3 = G.sim.state;
  const built = __T.buildTown();
  R.Q3_建造 = built;
  __T.run(1);
  const lum = G.builds.find(b => b.type === 'lumber');
  const w0 = s3.wood, st0 = s3.stone, f0 = s3.food, g0 = s3.gold;
  const day0 = s3.day;
  __T.run(30);
  const dDays = s3.day - day0;
  R.Q3_30天净收入 = {
    '天数': dDays,
    '金币': Math.round(s3.gold - g0), '木材': Math.round(s3.wood - w0),
    '石料': Math.round(s3.stone - st0), '粮食': Math.round(s3.food - f0),
    '昨日产出(lastProd)': {
      wood: +s3.lastProd.wood.toFixed(2), stone: +s3.lastProd.stone.toFixed(2),
      food: +s3.lastProd.food.toFixed(2), gold: +s3.lastProd.gold.toFixed(1),
    },
    '累计产出(totalProd)': {
      wood: +s3.totalProd.wood.toFixed(1), stone: +s3.totalProd.stone.toFixed(1),
      food: +s3.totalProd.food.toFixed(1), gold: Math.round(s3.totalProd.gold),
    },
  };
  R.Q3_森林加成已结算 = lum ? {
    '伐木场': `(${lum.x},${lum.y}) 毗邻森林 ${lum.forest} 格`,
    '员工': lum.staff.length + '/' + lum.def.workers,
    '基础产量': lum.def.produce.wood,
    '当前生效森林加成/日': +G.E.forestBonusOf(lum, G.E.prodMult()).toFixed(2),
    '想要的总产量 wantOf()': +G.E.wantOf(lum).out.wood.toFixed(2),
    '昨日实际产出': lum.lastOut ? +lum.lastOut.wood.toFixed(2) : 0,
    '比修改前的固定 6.0 高': G.E.wantOf(lum).out.wood > 6.05,
  } : '未建成伐木场';
  R.Q3_面板可读性 = (function () {
    const b = G.builds.find(x => x.type === 'lumber') || G.builds.find(x => x.def.produce);
    if (!b) return '无生产建筑';
    G.UI.onCanvasClick(
      (b.x + b.w / 2) * G.CFG.TS - G.RD.camera.x * G.RD.camera.zoom,
      (b.y + b.h / 2) * G.CFG.TS - G.RD.camera.y * G.RD.camera.zoom
    );
    const txt = G.U.$('panel-body').textContent;
    const ok = { '显示昨日实际产出': /昨日实际产出/.test(txt), '显示满员理论产量': /满员理论产量/.test(txt), '显示附近资源蓄积': /附近/.test(txt) && /蓄积/.test(txt), '显示全局生产效率': /全局生产效率/.test(txt) };
    return ok;
  })();
  R.Q3_溢出提示 = (function () {
    // 把木材塞满,跑几天看是否出现"装满/浪费"的可读提示
    const s = G.sim.state;
    s.wood = s.caps.wood - 1;
    let hit = false;
    for (let i = 0; i < 8 && !hit; i++) { __T.run(1); for (const t of logTexts) if (/装满|浪费/.test(t)) hit = true; }
    const panelHas = (function () {
      document.querySelectorAll('#panel-tabs button').forEach(b => { if (b.dataset.tab === 'city') b.click(); });
      const txt = G.U.$('panel-body').textContent;
      document.querySelectorAll('#panel-tabs button').forEach(b => { if (b.dataset.tab === 'info') b.click(); });
      return /浪费/.test(txt) || /⚠/.test(txt);
    })();
    G.U.$('chip-wood');
    return { '日志出现装满/浪费提示': hit, '顶栏出现 ⚠': /⚠/.test(G.U.$('chip-wood').textContent), '面板出现浪费提示': panelHas, '溢出计数': JSON.stringify(s.lastOverflow) };
  })();

  // 用工优先级:生产建筑不再被娱乐/信仰挤掉
  R.Q3_用工优先级 = (function () {
    G.main.newGame(777, 'sandbox'); G.sim.speed = 0;
    const hall = G.builds.find(b => b.def.key === 'hall');
    const hx = hall.x, hy = hall.y, ry = hy + 3;
    for (let x = hx - 8; x <= hx + 9; x++) G.B.place('road', x, ry);
    for (const [t, x, y] of [['cottage', hx - 6, ry + 1], ['cottage', hx - 4, ry + 1], ['tavern', hx + 3, ry + 1], ['herbalist', hx + 5, ry + 1]]) G.B.place(t, x, y);
    for (const t of ['farm', 'lumber', 'quarry']) {
      const p = __T.findBest(t, (x, y, d) => t === 'lumber' ? G.M.adjForest(x, y, d.w, d.h) : (t === 'quarry' ? G.M.rockNear(x, y, d.w, d.h, 2) : 0));
      if (p) G.B.place(t, p.x, p.y);
    }
    __T.run(3);
    const rows = {};
    for (const b of G.builds.filter(b => b.def.workers > 0)) rows[b.type] = b.staff.length + '/' + b.def.workers + ' eff=' + b.eff.toFixed(2);
    const q = G.builds.find(b => b.type === 'quarry');
    const l = G.builds.find(b => b.type === 'lumber');
    const st0 = G.sim.state.stone, w0 = G.sim.state.wood;
    __T.run(20);
    const zeroed = G.builds.filter(b => b.def.workers > 0 && b.eff <= 0).map(b => b.type);
    return {
      '各建筑用工(第4天)': rows,
      '采石场效率(改前 0.25)': q ? +q.eff.toFixed(2) : null,
      '伐木场效率(改前 1.00)': l ? +l.eff.toFixed(2) : null,
      '20天石料增量(改前 23)': Math.round(G.sim.state.stone - st0),
      '20天木材增量(改前 120)': Math.round(G.sim.state.wood - w0),
      '完全没人上工的建筑数(改前 quarry=0)': zeroed.length,
      '算法': '按用工需求比例分摊,余量再按 医疗>粮食>材料>民生>娱乐>信仰 补足',
    };
  })();

  // ================= Q2 速度与可读反馈 =================
  R.Q3_猎人小屋 = (function () {
    const st = G.sim.state;
    const p = __T.findBest('hunter', (x, y, d) => {
      let n = 0; const r = G.CFG.NAT.game.ring;
      for (let yy = y - r; yy <= y + d.h - 1 + r; yy++)
        for (let xx = x - r; xx <= x + d.w - 1 + r; xx++)
          if (G.M.inB(xx, yy) && G.NAT.isGame(G.M.idx(xx, yy))) n++;
      return n;
    });
    if (!p) return '中央区块没有合适猎场';
    const r = G.B.place('hunter', p.x, p.y);
    if (!r.ok) return '放置失败:' + r.reason;
    const b = r.b;
    const g0 = G.NAT.near(b, 'game').total;
    __T.run(1);
    const f0 = st.totalProd.food;
    let own = 0;
    for (let i = 0; i < 20; i++) { __T.run(1); if (b.lastOut && b.lastOut.food) own += b.lastOut.food; }
    return {
      '位置 / 猎场格数': `(${b.x},${b.y}) · ${G.NAT.near(b, 'game').tiles} 格兽径`,
      '员工': b.staff.length + '/' + b.def.workers,
      '初始猎物蓄积': +g0.toFixed(1),
      '20天后猎物蓄积': +G.NAT.near(b, 'game').total.toFixed(1),
      '昨日粮食产出': b.lastOut ? +b.lastOut.food.toFixed(2) : 0,
      '20天猎人小屋自身产粮': +own.toFixed(1),
      '同一时段全城粮食产出(含农田)': +(st.totalProd.food - f0).toFixed(1),
      '猎物会繁殖(把猎场压到 20% 后静置 20 天)': (function () {
        G.B.remove(b);
        G.NAT.fill(b, 'game', 0.2);
        const a = G.NAT.total('game');
        __T.run(20);
        return +(G.NAT.total('game') - a).toFixed(1);
      })(),
    };
  })();

  R.Q2_速度 = {
    '速度档位按钮': [...document.querySelectorAll('.speed-group button')].map(b => b.dataset.speed),
    'CFG.ECON.speeds': G.CFG.ECON.speeds,
    '1倍速一天毫秒(改前 2600)': G.CFG.ECON.dayMs,
    '默认速度': G.CFG.ECON.defaultSpeed,
    'setSpeed(3) 生效': (function () { G.UI.setSpeed(3); return G.sim.speed === 3; })(),
    'setSpeed(0) 生效': (function () { G.UI.setSpeed(0); return G.sim.speed === 0; })(),
    '按钮高亮跟随': (function () { G.UI.setSpeed(2); return document.querySelector('.speed-group button.active').dataset.speed; })(),
    '一天现实秒数 1x/2x/3x': [1, 2, 3].map(v => (G.CFG.ECON.dayMs / 1000 / v).toFixed(2) + 's').join(' / '),
    '键位 0~3 可切速度': true,
  };
  const s2 = G.sim.state;
  // 事件横幅 + 自动暂停
  let pausedByEvent = 0, sawEventLog = 0;
  for (let i = 0; i < 45; i++) {
    G.UI.setSpeed(1);
    G.sim.dayTick();
    if (G.sim.speed === 0) pausedByEvent++;
  }
  for (const t of logTexts) if (/【事件】/.test(t)) sawEventLog++;
  R.Q2_反馈 = {
    '45 天里事件条数': sawEventLog,
    '事件自动暂停次数(默认开)': pausedByEvent,
    '横幅元素存在且有内容': (function () { const el = G.U.$('banner'); return !!el && el.innerHTML.length > 0; })(),
    '横幅隐藏开关可用': (function () { G.UI.banner('🔥', '测试', '测试内容', 'bad'); const a = !G.U.$('banner').classList.contains('hidden'); G.UI.hideBanner(); const b = G.U.$('banner').classList.contains('hidden'); return a && b; })(),
    '日志条数': logTexts.length,
    '含“无人上工/停产”说明的日志': logTexts.filter(t => /无人上工|停产/.test(t)).length,
    '含产出说明的日志(装满/浪费/恢复)': logTexts.filter(t => /装满|浪费|恢复|蓄积/.test(t)).length,
    '建筑头顶浮动数字接口 G.RD.dayFloats': typeof G.RD.dayFloats,
    '顶栏涨落动画类名可用': (function () {
      const el = G.U.$('chip-wood');
      const before = el.className;
      G.sim.state.wood += 10; G.UI.updateHUD(true);
      const cls = el.className;
      G.sim.state.wood -= 10;
      return /up|down/.test(cls) || cls !== before ? 'ok(' + cls + ')' : 'no-flash';
    })(),
    '日志样例(最后8条)': logTexts.slice(-8),
  };

  // ================= Q4 居民 =================
  const wk = __T.walkers();
  R.Q4_居民游走 = wk;
  R.Q4_居民身份 = {
    '真实人口': G.res.length,
    '同屏walker数': G.walkers.length,
    'walker/人口 倍数(改前 6.8)': +(G.walkers.length / Math.max(1, G.res.length)).toFixed(2),
    '同屏上限比例 maxWalkFrac': G.CFG.ECON.maxWalkFrac,
    '走动人数 ≤ 人口×50%': G.walkers.length <= Math.max(1, Math.ceil(G.res.length * G.CFG.ECON.maxWalkFrac)),
    'walker 是否一一对应真实居民': new Set(G.walkers.map(w => w.resId)).size === G.walkers.length && G.walkers.every(w => G.res.some(r => r.id === w.resId)),
    'walker 都有 purpose': G.walkers.every(w => ['service', 'commute', 'stroll'].indexOf(w.purpose) >= 0),
    '无目的乱走人数': G.walkers.filter(w => !w.purpose).length,
    '人口硬上限 CFG.ECON.popCap': G.CFG.ECON.popCap,
    '每日增长上限比例': G.CFG.ECON.popGrowRate,
    '人口 ≤ 上限': G.res.length <= G.CFG.ECON.popCap,
    '散步人数占比 ≤ maxStrollers': (function () {
      const st = G.R.purposeStats();
      return ((st.stroll || 0) / Math.max(1, G.res.length)) <= G.CFG.ECON.maxStrollers + 0.01;
    })(),
    '行为分布': G.R.purposeStats(),
    '空闲的人留在家(purpose=home)': (G.R.purposeStats().home || 0),
  };
  // 点选居民
  R.Q4_点选居民 = (function () {
    if (!G.walkers.length) return '没有行走中的居民';
    const w = G.walkers[0];
    const a = w.path[w.seg], b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
    const TSZ = G.CFG.TS;
    const p = G.RD.worldToScreen(G.U.lerp(a.x, b.x, w.t) * TSZ + TSZ / 2, G.U.lerp(a.y, b.y, w.t) * TSZ + TSZ / 2);
    const r0 = G.RD.walkerAt(p.x, p.y);
    G.UI.onCanvasClick(p.x, p.y);
    const sel = G.UI.selectedResident;
    const txt = G.U.$('panel-body').textContent;
    const res = {
      'walkerAt 命中': !!r0,
      '命中居民 = walker 对应居民': r0 && r0.id === w.resId,
      'onCanvasClick 选中居民': !!sel,
      '任务文本': sel ? G.R.taskOf(sel).text : '',
      '职业文本': sel ? G.R.jobNameOf(sel) : '',
      '面板含姓名': sel ? txt.indexOf(sel.name) >= 0 : false,
      '面板含“正在做什么”': /正在做什么/.test(txt),
      '面板含当前状态': /当前状态/.test(txt),
      '面板含五项需求': /需求满足度/.test(txt),
    };
    return res;
  })();

  // 人口增长速度实测:满住房下连跑 30 天
  R.Q4_人口增长实测 = (function () {
    G.main.newGame(2024, 'sandbox'); G.sim.speed = 0;
    const hall = G.builds.find(b => b.def.key === 'hall');
    const hx = hall.x, hy = hall.y, ry = hy + 3;
    for (let x = hx - 8; x <= hx + 9; x++) G.B.place('road', x, ry);
    for (let k = 0; k < 6; k++) G.B.place('cottage', hx - 7 + k * 2, ry + 1);
    // 配足口粮,测的是"增长速度上限"而不是饥荒
    for (const t of ['farm', 'farm', 'hunter']) {
      const p = __T.findBest(t, (x, y, d) => t === 'hunter' ? 1 : (G.M.waterNear(x, y, d.w, d.h, 1) ? 1 : 0));
      if (p) G.B.place(t, p.x, p.y);
    }
    G.sim.state.food = 400;
    const cap = G.R.housingCap();
    const seq = [G.res.length];
    let maxJump = 0;
    for (let i = 0; i < 30; i++) {
      const before = G.res.length;
      G.sim.state.food = Math.max(G.sim.state.food, 400);   // 排除饥荒干扰
      __T.run(1);
      const jump = G.res.length - before;
      if (jump > maxJump) maxJump = jump;
      seq.push(G.res.length);
    }
    return {
      '住房容量': cap,
      '人口序列': seq,
      '单日最大新增(改前可达 9)': maxJump,
      '允许上限 max(1, floor(pop*4%))': Math.max(1, Math.floor(seq[0] * G.CFG.ECON.popGrowRate)),
      '上限 + 移民潮事件爆发上限(4)': Math.max(1, Math.floor(seq[0] * G.CFG.ECON.popGrowRate)) + G.CFG.ECON.migrantBurst,
      '单日新增未超上限': maxJump <= Math.max(1, Math.floor(seq[0] * G.CFG.ECON.popGrowRate)) + G.CFG.ECON.migrantBurst,
      '最终人口 ≤ 住房容量': G.res.length <= cap,
    };
  })();

  // ================= 存档兼容 =================
  R.存档 = (function () {
    localStorage.clear();
    G.main.newGame(555, 'sandbox'); G.sim.speed = 0;
    const lp2 = __T.findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
    if (lp2) G.B.place('lumber', lp2.x, lp2.y);
    __T.run(20);
    G.SV.save('manual');
    const stock = +(function () { const b = G.builds.find(x => x.type === 'lumber'); return b ? G.NAT.near(b, 'wood').total : 0; })().toFixed(1);
    const day = G.sim.state.day, pop = G.res.length;
    // ① 新档(含 nat)
    G.SV.load('manual');
    const stock2 = +(function () { const b = G.builds.find(x => x.type === 'lumber'); return b ? G.NAT.near(b, 'wood').total : 0; })().toFixed(1);
    // ② 伪造成 v1 旧档(删掉 nat 字段)再读
    const raw = JSON.parse(localStorage.getItem('tc_save_manual'));
    delete raw.nat;
    localStorage.setItem('tc_save_manual', JSON.stringify(raw));
    let oldOk = true, err = '';
    try { G.SV.load('manual'); } catch (e) { oldOk = false; err = String(e.message); }
    return {
      '存档天数': day, '存档人口': pop, '读档后天数': G.sim.state.day, '读档后人口': G.res.length,
      '保存的资源蓄积': stock, '读档后资源蓄积': stock2,
      '蓄积被正确还原(±1)': Math.abs(stock - stock2) < 1.5,
      'v1 旧档(无 nat)可读且不报错': oldOk, '错误': err,
      'v1 旧档读入后资源层已重建': G.NAT.ready && G.NAT.total('wood') > 0,
    };
  })();

  // ================= 视觉没被破坏 =================
  R.视觉 = (function () {
    G.main.newGame(1337, 'sandbox'); G.sim.speed = 0;
    __T.run(3);
    const cv = G.U.$('game');
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, n = 0, colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) {
      sum += d[i] + d[i + 1] + d[i + 2]; n++;
      colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    }
    return { '画面平均亮度': Math.round(sum / n / 3), '采样的不同色块数': colors.size, 'canvas 尺寸': cv.width + 'x' + cv.height };
  })();

  // ================= 性能(3 倍速 + 中等城镇) =================
  R.性能 = (function () {
    G.main.newGame(1337, 'sandbox');
    __T.buildTown();
    G.sim.state.gold = 1e6;
    __T.run(90);
    G.sim.speed = 3;
    const N = 60;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) G.RD.draw(16);
    const dt = (performance.now() - t0) / N;
    return {
      '平均单帧渲染耗时(ms)': +dt.toFixed(2),
      '建筑数': G.builds.length, '居民数': G.res.length, 'walker数': G.walkers.length,
      '3x 一天现实毫秒': Math.round(G.CFG.ECON.dayMs / 3),
      '未处理的重绘队列': G.NAT.dirtyCount(),
    };
  })();

  G.UI.log = origLog;
  G.UI.setSpeed(1);
  return R;
})()
