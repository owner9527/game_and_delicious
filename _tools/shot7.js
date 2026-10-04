(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); document.getElementById('tut-next').click(); await s(600); return document.getElementById('tut-step').textContent; })()
