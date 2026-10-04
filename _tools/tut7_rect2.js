(() => {
  const r = {};
  const g = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  ['hud-pause', 'hud-mode-chip', 'hud-level-name', 'hud-shards', 'hud-steps', 'hud-undo', 'hud-restart', 'hud-hint', 'hud-toast', 'hud-hint-box'].forEach(id => { r[id] = g(id); });
  r.hudActions = (() => { const e = document.querySelector('.hud-actions'); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })();
  r.hudStats = (() => { const e = document.querySelector('.hud-stats'); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })();
  r.chars = MMGame.debugChars();
  r.info = MMGame.debugInfo();
  r.state = MMGame.state;
  return JSON.stringify(r);
})()
