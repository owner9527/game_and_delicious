// 前后对照验证：用同一套自动开局协议分别跑「改动前备份(8900)」与「当前工作区(8899)」，
// 截图 + 抓报错 + 计算美术指标，输出对照表。
// 用法: node verify.mjs [--games=01,02] [--tag=after]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PY = 'C:\\Users\\32651\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const SHOTS = 'D:\\游戏\\_shots';
const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const only = opt('games', null)?.split(/[,+\s]+/).filter(Boolean) || null;

// 每款游戏的"进入实际画面"点击序列（坐标由各次实测得出；PowerShell 传参请用引号）
const CLICKS = {
  '01': ['640,386', '640,700'],
  '02': ['640,300'],
  '03': ['640,492', '880,545'],
  '04': ['640,353'],
  '05': ['548,465', '640,510'],
  '06': ['640,400'],
  '07': ['640,400'],
  '08': ['640,400', '640,400'],
  '09': ['640,400'],
  '10': ['640,400'],
};

const ENTRY = {
  '01': (b) => `${b}/1/${encodeURIComponent('余烬之城.html')}`,
  '02': (b) => `${b}/2/index.html`,
  '03': (b) => `${b}/3/index.html`,
  '04': (b) => `${b}/4/index.html`,
  '05': (b) => `${b}/5/index.html`,
  '06': (b) => `${b}/6/index.html`,
  '07': (b) => `${b}/7/index.html`,
  '08': (b) => `${b}/8/index.html`,
  '09': (b) => `${b}/9/index.html`,
  '10': (b) => `${b}/10/index.html`,
};
const NAMES = { '01': '余烬之城', '02': '星火拓荒', '03': '拓城记', '04': '深渊词条', '05': '幻境争锋', '06': '回声', '07': '镜像迷城', '08': '时间碎片', '09': '星穹拓荒', '10': '情绪花园' };

// 通用自动开局：点最像"开始/继续"的可见按钮
const AUTOSTART = `(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    let p=e,hidden=false;
    while(p&&p!==document.documentElement){const ps=getComputedStyle(p);
      if(ps.display==='none'||ps.visibility==='hidden'||parseFloat(ps.opacity)===0){hidden=true;break;} p=p.parentElement;}
    return !hidden&&r.width>12&&r.height>12;};
  const KW=/开始|新游戏|新的开始|继续|进入|出发|启程|确立|确定|play|start|new/i;
  const cands=[...document.querySelectorAll('button,a,[role=button],.btn,.tbtn,.menu-btn,.tbtn')].filter(vis);
  const hit=cands.find(e=>KW.test(e.textContent||''))||cands[0];
  if(hit){const t=(hit.textContent||'').trim().slice(0,16);hit.click();return 'clicked:'+t;}
  // 没有按钮时：直接点屏幕中心的最上层元素（有些游戏是"点击任意处开始"）
  const cx=Math.round(innerWidth/2), cy=Math.round(innerHeight/2);
  const el=document.elementFromPoint(cx,cy);
  if(el){el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:cx,clientY:cy}));
    return 'tapped:'+el.tagName+'#'+(el.id||'');}
  return 'none';
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function runProbe(url, out, evals, clicks) {
  return new Promise((resolve) => {
    const args = ['D:\\游戏\\_tools\\probe.mjs', url, out, '--wait=2600'];
    for (const c of clicks || []) args.push(`--click=${c}`);
    for (const e of evals) args.push(`--eval=${e}`);
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let b = ''; p.stdout.on('data', d => b += d); p.stderr.on('data', d => b += d);
    p.on('close', () => {
      let j = null; try { j = JSON.parse(b); } catch {}
      resolve(j || { errors: ['probe failed'], evalResult: null });
    });
  });
}

function metrics(png) {
  return new Promise((resolve) => {
    const p = spawn(PY, ['D:\\游戏\\_tools\\analyze.py', png, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let b = ''; p.stdout.on('data', d => b += d);
    p.on('close', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
  });
}

const games = Object.keys(ENTRY).filter(n => !only || only.includes(n));
const rows = [];

for (const n of games) {
  console.error(`[verify] >>> 开始 ${n}`);
  const rec = { n, name: NAMES[n] };
  try {
    for (const [phase, base] of [['A_before', 'http://127.0.0.1:8900'], ['B_after', 'http://127.0.0.1:8899']]) {
      // 有明确点击协议的游戏就不再跑"自动开局"，避免误点 HUD 按钮污染对照
      const auto = (CLICKS[n] && CLICKS[n].length) ? [] : [AUTOSTART];
      for (const [mode, clicks] of [['menu', []], ['play', CLICKS[n]]]) {
        const out = path.join(SHOTS, `${phase}_${n}_${mode}.png`);
        const r = await runProbe(ENTRY[n](base), out, auto, clicks);
        const errs = (r.errors || []).filter(e => !/favicon/.test(e));
        rec[phase + '_' + mode] = {
          errors: errs,
          start: r.evalResult,
          page: r.page,
          m: await metrics(out),
        };
      }
    }
  } catch (e) {
    rec.fatal = String(e && e.stack || e);
    console.error(`[verify] !!! ${n} 失败: ${rec.fatal}`);
  }
  rows.push(rec);
  console.error(`[verify] <<< 完成 ${n}`);
}
console.error(`[verify] 共处理 ${rows.length}/${games.length} 款`);

fs.writeFileSync(path.join(SHOTS, '_verify.json'), JSON.stringify(rows, null, 2));

const f = (v, d = 1) => (v === undefined || v === null ? '?' : Number(v).toFixed(d));
for (const mode of ['menu', 'play']) {
  console.log(`\n========== 画面：${mode === 'menu' ? '首屏/菜单' : '进入游戏后'} ==========`);
  console.log('编号 游戏       指标            改动前      改动后      变化');
  for (const r of rows) {
    const a = r['A_before_' + mode]?.m, b = r['B_after_' + mode]?.m;
    const items = [
      ['最大单色占比%', a?.dominant?.[0]?.pct, b?.dominant?.[0]?.pct, 'down'],
      ['精确颜色数', a?.unique_colors_exact, b?.unique_colors_exact, 'up'],
      ['色彩丰富度', a?.colorfulness, b?.colorfulness, 'up'],
      ['区块熵', a?.block_entropy, b?.block_entropy, 'up'],
      ['细节密度', a?.edge_density, b?.edge_density, 'up'],
      ['平均亮度', a?.mean_lum, b?.mean_lum, 'n/a'],
    ];
    items.forEach(([k, va, vb, dir], i) => {
      let delta = '';
      if (typeof va === 'number' && typeof vb === 'number') {
        const d = vb - va;
        const pct = va !== 0 ? (d / Math.abs(va)) * 100 : 0;
        const good = dir === 'up' ? d > 0 : dir === 'down' ? d < 0 : true;
        delta = `${d >= 0 ? '+' : ''}${d.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%) ${dir === 'n/a' ? '' : good ? '✔' : '✘'}`;
      }
      console.log(`${i === 0 ? r.n : '  '} ${i === 0 ? r.name.padEnd(9) : '         '} ${k.padEnd(14)} ${f(va, 2).padStart(10)} ${f(vb, 2).padStart(11)}   ${delta}`);
    });
    const e = r['B_after_' + mode]?.errors || [];
    console.log(`            报错: ${e.length === 0 ? '无 ✔' : e.length + ' 条 ✘ → ' + e[0].slice(0, 130)}`);
    console.log('');
  }
}
