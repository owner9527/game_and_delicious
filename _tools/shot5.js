(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); document.getElementById('gNext').click(); await s(500); return document.getElementById('gStep').textContent; })()
