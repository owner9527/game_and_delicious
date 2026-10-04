/* 关卡数据无头校验：node tools/validate.js */
global.window = {};
require("../js/levels.js");
const { LEVELS, parseLevel, CHAPTERS } = window.MMLevels;

let bad = 0;
LEVELS.forEach((def, i) => {
  const th = CHAPTERS[def.ch - 1].theme;
  const lv = parseLevel(def, th);
  const errs = [];
  const name = `${def.ch}-${(i % 6) + 1} ${def.name}`;

  if (lv.spawns.length !== 2) errs.push(`出生点=${lv.spawns.length} (应为2)`);
  else {
    const [a, b] = lv.spawns;
    if ((a.x < lv.W) === (b.x < lv.W)) errs.push("两个出生点在同一岸");
    // 出生点下方必须有地面
    for (const s of lv.spawns) {
      if (lv.grid[s.y + 1] && lv.grid[s.y + 1][s.x] !== "#" && lv.grid[s.y + 1][s.x] !== "=")
        errs.push(`出生点(${s.x},${s.y})下方无地面`);
    }
  }
  const leftE = lv.exits.filter((e) => e.x < lv.W).length;
  const rightE = lv.exits.length - leftE;
  if (leftE < 1 || rightE < 1) errs.push(`镜像之门 左${leftE}/右${rightE} (每岸至少1, 宽门多格为合法)`);
  const shardIds = Object.keys(lv.shards);
  if (shardIds.length !== 3) errs.push(`碎片槽=${shardIds.length} (应为3): ${shardIds}`);
  // 门与板配对
  if (lv.doors.G.length && !lv.plates.g.length) errs.push("有门G但无板g");
  if (lv.doors.H.length && !lv.plates.h.length && !lv.receivers.length) errs.push("有门H但无板h也无水晶");
  if (lv.doors.S.length && !lv.plates.s.length) errs.push("有门S但无板s");
  // 传送门配对
  const inA = lv.grid.flat().filter((c) => c === "o").length;
  const outA = lv.grid.flat().filter((c) => c === "O").length;
  if (inA !== outA) errs.push(`传送门o=${inA} O=${outA} 不配对`);
  // 门延伸只应占据空格（延伸在解析时写入 doors 列表，不改动 grid）
  for (const [g, cells] of Object.entries(lv.doors)) {
    for (const c of cells) {
      const ch = lv.grid[c.y][c.x];
      if (ch !== g && ch !== ".") errs.push(`门格(${c.x},${c.y})被 '${ch}' 占据`);
    }
  }
  // 原始地图行宽记录（解析器会自动补齐，无需一致）

  if (errs.length) {
    bad++;
    console.log(`✗ ${name}`);
    errs.forEach((e) => console.log(`   - ${e}`));
  } else {
    console.log(`✓ ${name}  [${def.mode}${def.beat ? " +beat" : ""}${def.right ? " +asym" : ""}]`);
  }
});
console.log(bad === 0 ? "\n全部关卡结构校验通过 ✓" : `\n${bad} 个关卡存在问题 ✗`);
process.exit(bad === 0 ? 0 : 1);
