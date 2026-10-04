window.__sfd = { log: [] };
function L(m){ window.__sfd.log.push(m); }
window.__cam = function(){ var g = SF.ui.game; return g ? { x: Math.round(g.cam.x), y: Math.round(g.cam.y), z: +g.cam.zoom.toFixed(2) } : null; };
setTimeout(function(){ var b=document.querySelector('#btn-sandbox'); if(b) b.click(); }, 200);
setTimeout(function(){ var b=document.querySelector('#btn-sandbox-start'); if(b) b.click(); }, 900);
setTimeout(function(){ var b=document.querySelector('#btn-land'); if(b) b.click(); }, 1600);
setTimeout(function(){ var c=document.querySelector('.site-card'); if(c) c.click(); }, 2300);
'setup'
