// 诊断:自然资源采集量统计
(() => {
  localStorage.setItem('tc_tut_off', '1');
  const R = {};
  G.main.newGame(4242, 'sandbox'); G.sim.speed = 0;
  const s = G.sim.state;
  const lp = __T.findBest('lumber', (x, y, d) => G.M.adjForest(x, y, d.w, d.h));
  const camp = G.B.place('lumber', lp.x, lp.y).b;
  R['放置'] = `(${camp.x},${camp.y}) 毗邻 ${camp.forest} 格`;
  R['木材上限'] = s.caps.wood + ' / 当前 ' + s.wood;
  R['初始蓄积'] = +G.NAT.near(camp, 'wood').total.toFixed(2);
  const rows = [];
  for (let d = 1; d <= 12; d++) {
    __T.run(1);
    rows.push({
      day: s.day, 蓄积: +G.NAT.near(camp, 'wood').total.toFixed(1),
      今日采集: +G.NAT.today.wood.toFixed(2), 今日生长: +G.NAT.growth.wood.toFixed(2),
      eff: camp.eff, bonus: +G.E.forestBonusOf(camp, G.E.prodMult()).toFixed(2),
      want: +G.E.wantOf(camp).out.wood.toFixed(2),
      lastOut: camp.lastOut ? +camp.lastOut.wood.toFixed(2) : 0,
      lastYield: +camp.lastYield.toFixed(2),
      木材库存: Math.round(s.wood), 溢出: +(s.lastOverflow.wood || 0).toFixed(1),
    });
  }
  R['逐日'] = rows;
  R['累计landed'] = +s.totalProd.wood.toFixed(1);
  G.sim.speed = 1;
  return R;
})()
