(async function () {
  // 帧率 sanity check(引导未激活 + 引导激活 两种状态, 各测 90 帧)
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  async function fps(tag) {
    const ts = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) { await raf(); const n = performance.now(); ts.push(n - last); last = n; }
    ts.sort((a, b) => a - b);
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    return { tag, frames: ts.length, avgFrameMs: +avg.toFixed(2), approxFps: +(1000 / avg).toFixed(1), p95FrameMs: +ts[Math.floor(ts.length * 0.95)].toFixed(2) };
  }
  Tutorial.finish(true);
  const a = await fps('no tutorial, in play');
  Tutorial.start('play');
  Tutorial.i = 1; Tutorial.render();
  const b = await fps('tutorial active (step 2, spotlight follows player)');
  Tutorial.stop();
  return 'FPS ' + JSON.stringify({ noTutorial: a, withTutorial: b });
})()
