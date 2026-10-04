/*==ART==*/
/* 美术系统:全部为程序化生成的矢量图层(零外部资源,离线 file:// 可用)。
 * 层次约定(从后到前):
 *   天空多段渐变 → 远景剪影(1~2 层,越远越淡越偏冷) → 地面光泽 → 中景建筑/物件
 *   → 纹理地面(横向色带 + 铺装 + 接触阴影) → 光源辉光 → 雨丝/浮尘带 → 近景暗部框
 * 每个场景绑定一个主题(TH),主题同时驱动 CSS 端的分级/光晕变量。
 */
const ART = (function(){
  const W=1600, H=900;
  function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
  function rng(seed){ let t=seed>>>0; return function(){ t+=0x6D2B79F5; let r=Math.imul(t^t>>>15,1|t); r^=r+Math.imul(r^r>>>7,61|r); return ((r^r>>>14)>>>0)/4294967296; }; }
  const P2=n=>(Math.round(n*100)/100);
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const DEFS=`<defs>
    <filter id="blur1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="glow2" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="16"/></filter>
    <radialGradient id="gGroundShadow"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>`;

  /* ---------------- 主题表:每个地点一套天空 / 大气 / 地面 / 光效 ---------------- */
  const TH = {
    dawn:{top:'#1b1738',mid:'#5a3236',hor:'#bf7742',glow:'#ffd8a0',glowOp:.86,glowX:1080,glowY:600,sun:1,
      haze:'#e8c39a',hazeOp:.20,building:'#33243a',ground:'#191322',
      fx1:'rgba(255,186,112,.58)',fx2:'rgba(150,120,210,.26)',
      gr1:'rgba(255,168,84,.20)',gr2:'rgba(14,10,26,.52)',gr3:'linear-gradient(0deg, rgba(255,150,60,.05), rgba(255,150,60,0) 70%)',
      lx:'66%',ly:'62%',lx2:'26%',ly2:'26%'},
    metro:{top:'#0a121b',mid:'#13212d',hor:'#1b2e3c',glow:'#ffbf74',glowOp:.62,glowX:1220,glowY:370,sun:0,
      haze:'#9fc4dc',hazeOp:.15,building:'#070b11',ground:'#0a1017',
      fx1:'rgba(255,172,88,.50)',fx2:'rgba(96,150,190,.24)',
      gr1:'rgba(255,168,92,.14)',gr2:'rgba(4,9,16,.60)',gr3:'linear-gradient(0deg, rgba(255,150,70,.03), rgba(255,150,70,0) 70%)',
      lx:'76%',ly:'42%',lx2:'22%',ly2:'64%'},
    metro_night:{top:'#060a12',mid:'#0b1420',hor:'#101d2a',glow:'#ffb066',glowOp:.52,glowX:1210,glowY:370,sun:0,
      haze:'#8fb2cc',hazeOp:.13,building:'#05080d',ground:'#070c12',
      fx1:'rgba(255,160,80,.40)',fx2:'rgba(80,125,170,.24)',
      gr1:'rgba(255,150,70,.10)',gr2:'rgba(3,6,12,.66)',gr3:'linear-gradient(0deg, rgba(255,140,60,.025), rgba(255,140,60,0) 70%)',
      lx:'76%',ly:'40%',lx2:'20%',ly2:'66%'},
    gate:{top:'#070a0f',mid:'#0d151d',hor:'#18242e',glow:'#bcd6e8',glowOp:.50,glowX:800,glowY:430,sun:0,
      haze:'#9ab6c8',hazeOp:.13,building:'#070a0e',ground:'#080b0f',
      fx1:'rgba(150,196,226,.34)',fx2:'rgba(200,220,240,.18)',
      gr1:'rgba(150,190,230,.12)',gr2:'rgba(4,7,11,.66)',gr3:'linear-gradient(0deg, rgba(140,190,230,.03), rgba(140,190,230,0) 70%)',
      lx:'50%',ly:'46%',lx2:'18%',ly2:'30%'},
    street_rain:{top:'#4b4c44',mid:'#333d3c',hor:'#242e31',glow:'#e8c795',glowOp:.52,glowX:1330,glowY:500,sun:0,
      haze:'#d2d8cf',hazeOp:.22,building:'#151d1f',ground:'#0d1315',
      fx1:'rgba(232,199,149,.40)',fx2:'rgba(120,150,160,.22)',
      gr1:'rgba(226,206,170,.15)',gr2:'rgba(6,10,12,.56)',gr3:'linear-gradient(0deg, rgba(180,200,200,.04), rgba(180,200,200,0) 70%)',
      lx:'84%',ly:'56%',lx2:'24%',ly2:'24%'},
    store:{top:'#181410',mid:'#221b14',hor:'#2b2218',glow:'#ffcf8a',glowOp:.70,glowX:800,glowY:150,sun:0,
      haze:'#d8b98a',hazeOp:.13,building:'#0e0a07',ground:'#131009',
      fx1:'rgba(255,196,116,.52)',fx2:'rgba(180,130,80,.20)',
      gr1:'rgba(255,190,110,.16)',gr2:'rgba(12,8,5,.60)',gr3:'linear-gradient(0deg, rgba(255,180,100,.05), rgba(255,180,100,0) 70%)',
      lx:'50%',ly:'20%',lx2:'78%',ly2:'72%'},
    alley:{top:'#0a0f16',mid:'#0f1620',hor:'#182430',glow:'#ff8a4a',glowOp:.58,glowX:780,glowY:640,sun:0,
      haze:'#8fa6bd',hazeOp:.14,building:'#080c12',ground:'#090d12',
      fx1:'rgba(255,130,60,.44)',fx2:'rgba(80,120,170,.24)',
      gr1:'rgba(255,140,70,.12)',gr2:'rgba(4,8,14,.62)',gr3:'linear-gradient(0deg, rgba(255,130,60,.04), rgba(255,130,60,0) 70%)',
      lx:'49%',ly:'70%',lx2:'24%',ly2:'22%'},
    rooftop:{top:'#2c2440',mid:'#6a3d48',hor:'#c87540',glow:'#ffbe78',glowOp:.74,glowX:1240,glowY:600,sun:1,
      haze:'#f0b483',hazeOp:.24,building:'#1d1730',ground:'#150f22',
      fx1:'rgba(255,178,104,.52)',fx2:'rgba(150,110,200,.24)',
      gr1:'rgba(255,166,90,.19)',gr2:'rgba(16,10,28,.54)',gr3:'linear-gradient(0deg, rgba(255,150,80,.05), rgba(255,150,80,0) 70%)',
      lx:'78%',ly:'62%',lx2:'22%',ly2:'24%'},
    rooftop_night:{top:'#050a18',mid:'#081326',hor:'#122238',glow:'#e6edf6',glowOp:.72,glowX:1250,glowY:175,sun:0,
      haze:'#9db6d6',hazeOp:.14,building:'#0b1220',ground:'#080d17',
      fx1:'rgba(210,228,250,.40)',fx2:'rgba(90,130,190,.24)',
      gr1:'rgba(160,190,240,.13)',gr2:'rgba(3,6,14,.64)',gr3:'linear-gradient(0deg, rgba(150,180,240,.035), rgba(150,180,240,0) 70%)',
      lx:'78%',ly:'20%',lx2:'22%',ly2:'58%'},
    street_night:{top:'#0a1420',mid:'#0c1a29',hor:'#14293a',glow:'#93ffc2',glowOp:.60,glowX:1315,glowY:490,sun:0,
      haze:'#7fa8c8',hazeOp:.16,building:'#0a1018',ground:'#080d12',
      fx1:'rgba(120,240,170,.42)',fx2:'rgba(90,140,220,.26)',
      gr1:'rgba(120,230,170,.14)',gr2:'rgba(4,8,14,.62)',gr3:'linear-gradient(0deg, rgba(100,220,160,.04), rgba(100,220,160,0) 70%)',
      lx:'82%',ly:'58%',lx2:'20%',ly2:'24%'},
    hospital_out:{top:'#26332c',mid:'#18241e',hor:'#0f1a15',glow:'#a8f0c0',glowOp:.52,glowX:800,glowY:170,sun:0,
      haze:'#a8c9b4',hazeOp:.17,building:'#1b2620',ground:'#0c120e',
      fx1:'rgba(140,240,180,.34)',fx2:'rgba(90,140,120,.20)',
      gr1:'rgba(130,220,170,.12)',gr2:'rgba(5,10,8,.58)',gr3:'linear-gradient(0deg, rgba(120,220,170,.035), rgba(120,220,170,0) 70%)',
      lx:'50%',ly:'24%',lx2:'24%',ly2:'66%'},
    lobby:{top:'#0d1519',mid:'#131d22',hor:'#1a272c',glow:'#d6f2ef',glowOp:.50,glowX:800,glowY:160,sun:0,
      haze:'#a9c6cb',hazeOp:.13,building:'#0c1215',ground:'#0a1013',
      fx1:'rgba(190,238,232,.32)',fx2:'rgba(120,190,190,.20)',
      gr1:'rgba(170,230,225,.11)',gr2:'rgba(5,9,12,.60)',gr3:'linear-gradient(0deg, rgba(170,230,225,.035), rgba(170,230,225,0) 70%)',
      lx:'50%',ly:'22%',lx2:'80%',ly2:'70%'},
    ward:{top:'#0e1418',mid:'#151d22',hor:'#1e282e',glow:'#a8e8d0',glowOp:.46,glowX:1035,glowY:305,sun:0,
      haze:'#9fc0c6',hazeOp:.12,building:'#0d1216',ground:'#0a0e12',
      fx1:'rgba(180,230,210,.28)',fx2:'rgba(110,160,190,.20)',
      gr1:'rgba(160,220,200,.10)',gr2:'rgba(5,8,12,.62)',gr3:'linear-gradient(0deg, rgba(160,220,200,.03), rgba(160,220,200,0) 70%)',
      lx:'65%',ly:'36%',lx2:'26%',ly2:'72%'},
    lab:{top:'#06100e',mid:'#0a1a18',hor:'#122824',glow:'#66e8ff',glowOp:.60,glowX:900,glowY:500,sun:0,
      haze:'#8fe8dc',hazeOp:.15,building:'#081412',ground:'#081210',
      fx1:'rgba(100,230,255,.40)',fx2:'rgba(70,200,180,.24)',
      gr1:'rgba(90,225,220,.14)',gr2:'rgba(3,10,10,.60)',gr3:'linear-gradient(0deg, rgba(90,225,220,.04), rgba(90,225,220,0) 70%)',
      lx:'56%',ly:'56%',lx2:'22%',ly2:'30%'},
    garage:{top:'#080b0f',mid:'#0c1218',hor:'#131c24',glow:'#c8dcec',glowOp:.44,glowX:800,glowY:560,sun:0,
      haze:'#93aec4',hazeOp:.12,building:'#080c10',ground:'#080b0e',
      fx1:'rgba(170,205,235,.30)',fx2:'rgba(120,160,200,.20)',
      gr1:'rgba(150,190,225,.10)',gr2:'rgba(3,6,10,.64)',gr3:'linear-gradient(0deg, rgba(150,190,225,.03), rgba(150,190,225,0) 70%)',
      lx:'50%',ly:'60%',lx2:'20%',ly2:'28%'},
    fate:{top:'#04060a',mid:'#080d15',hor:'#0e1622',glow:'#ffb266',glowOp:.44,glowX:800,glowY:620,sun:0,
      haze:'#93a3bb',hazeOp:.10,building:'#070b12',ground:'#070a10',
      fx1:'rgba(255,168,90,.32)',fx2:'rgba(120,150,200,.22)',
      gr1:'rgba(255,160,90,.10)',gr2:'rgba(2,4,8,.66)',gr3:'linear-gradient(0deg, rgba(255,160,90,.025), rgba(255,160,90,0) 70%)',
      lx:'50%',ly:'66%',lx2:'26%',ly2:'24%'}
  };

  /* ---------------- 渐变工厂 ---------------- */
  function dsky(o){ if(o.def) return `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${o.def}</linearGradient>`;
    return `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`+
      `<stop offset="0" stop-color="${o.top}"/><stop offset=".55" stop-color="${o.mid}"/><stop offset="1" stop-color="${o.hor}"/></linearGradient>`; }
  function dglow2(id,x,y,c,op){ return `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${op}"/>`+
    `<stop offset=".42" stop-color="${c}" stop-opacity="${P2(op*.42)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`; }
  function dlin(id,a,b){ return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}" stop-opacity=".95"/>`+
    `<stop offset="1" stop-color="${b}" stop-opacity=".95"/></linearGradient>`; }
  function dvig(id,tint){ return `<radialGradient id="${id}" cx=".5" cy=".44" r=".78">`+
    `<stop offset=".40" stop-color="#000" stop-opacity="0"/><stop offset=".76" stop-color="#000" stop-opacity=".20"/>`+
    `<stop offset="1" stop-color="${tint||'#000'}" stop-opacity=".62"/></radialGradient>`; }

  /* ---------------- 层次零件 ---------------- */
  /* 多段天空:天顶→中天→地平线 */
  function sky(o){ return `<rect width="${W}" height="${H}" fill="url(#sky)"/>`; }
  /* 地平线光带 + 太阳/月/城市辉光 */
  function skyGlow(o){ let s='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#skyGlow)"/>';
    if(o.sun) s+=`<circle cx="${o.glowX}" cy="${o.glowY}" r="${o.sunR||62}" fill="url(#sunG)"/>`;
    else s+=`<circle cx="${o.glowX}" cy="${o.glowY}" r="${o.sunR||76}" fill="url(#moonG)"/>`;
    return s; }
  /* 大气透视:对下层剪影罩一层透明天空色(越淡越远) */
  function air(o,op,y0,y1){ return `<rect x="0" y="${y0||0}" width="${W}" height="${(y1!=null?y1:H)-(y0||0)}" fill="${o.haze}" opacity="${op}" class="svgFog"/>`; }
  /* 雨丝带(方位角 + 无缝平铺) */
  function rainBand(a,op,n,sp){ n=n||70; const ang=Math.abs((a||14)*Math.PI/180), len=70;
    const dx=Math.round(Math.sin(ang)*len), dy=Math.round(Math.cos(ang)*len), step=Math.round(W/n);
    let d=''; for(let x=-step;x<=W+step;x+=step){ d+='M'+x+',0 l'+dx+','+dy+' m'+(-dx)+','+(-dy)+' '; }
    return `<path class="rainband" d="${d}" stroke="rgba(206,224,240,${op})" stroke-width="2" fill="none" style="animation-duration:${sp||0.52}s"/>`; }
  /* 雨幕:竖向低透明度背景 */
  function rainVeil(){ return `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#rainG)"/>`; }
  /* 浮尘带 */
  function hazeBand(y,h,color,op,cls){ return `<rect class="${cls||'svgFog'}" x="-120" y="${y}" width="${W+240}" height="${h}" fill="${color}" opacity="${op}" filter="url(#blur1)"/>`; }
  /* 近景暗部框(只压边角,保留画面中段可读性) */
  function nearFrame(tint){ const c=tint||'#05070b';
    return `<path d="M0,0 H${W} V${H} H0 Z M-50,26 H${W+50} V${H-26} H-50 Z" fill="${c}" opacity=".22" filter="url(#blur2)"/>`+
      `<rect x="-40" y="${H}" width="${W+80}" height="90" fill="${c}" opacity=".34" filter="url(#blur2)"/>`; }
  /* 前景暗角(SVG 内,与 CSS 暗角叠加形成景深) */
  function foreVig(tint){ return `<rect width="${W}" height="${H}" fill="url(#vigR)" opacity=".6"/>`; }
  /* 中段提亮:压低暗部占比(只提亮不改色相),避免整屏近黑 */
  function midLift(tint,op){ return `<rect x="0" y="${(H*.10).toFixed(0)}" width="${W}" height="${(H*.74).toFixed(0)}" fill="${tint||'#8494a6'}" opacity="${op==null?.055:op}" filter="url(#blur1)"/>`; }
  /* 地面:横向明暗色带 + 可见铺装 + 近处大色块(避免"纯色矩形") */
  function paved(R,gy,dark,light){
    let s=`<rect x="0" y="${gy}" width="${W}" height="${H-gy}" fill="url(#gnd)"/>`;
    s+=`<rect x="0" y="${gy}" width="${W}" height="3" fill="${light}" opacity=".22"/>`;
    s+=`<rect x="0" y="${gy+4}" width="${W}" height="2" fill="#000" opacity=".5"/>`;
    for(let y=gy+24;y<H;y+=46){ const d=clamp((y-gy)/240,.25,1);
      s+=`<rect x="0" y="${P2(y)}" width="${W}" height="${P2(2+d*2)}" fill="${light}" opacity="${P2(.045*(1-d)+.02)}"/>`; }
    for(let i=0;i<7;i++){ const y=gy+34+i*38, k=.5+i*.13;
      s+=`<rect x="0" y="${P2(y)}" width="${W}" height="${P2(16+k*14)}" fill="${dark}" opacity="${P2(.24+k*.05)}" filter="url(#blur2)"/>`; }
    for(let x=20;x<W;x+=118){ const d2=.3+R()*.5;
      s+=`<path d="M${x},${P2(gy+8+R()*6)} l36,0 l6,${P2((H-gy)*.5+R()*70)} l-42,0 Z" fill="#000" opacity="${P2(.10+d2*.12)}"/>`; }
    for(let i=0;i<220;i++){ s+=`<rect x="${P2(R()*W)}" y="${P2(gy+R()*(H-gy))}" width="${P2(.6+R()*1.8)}" height="${P2(.6+R()*1.6)}" fill="${R()<.5?'#fff':light}" opacity="${P2(.04+R()*.13)}"/>`; }
    for(let i=0;i<26;i++){ const x=R()*W, y=gy+20+R()*(H-gy-30), rr=8+R()*30;
      s+=`<ellipse cx="${P2(x)}" cy="${P2(y)}" rx="${P2(rr)}" ry="${P2(rr*.32)}" fill="#000" opacity="${P2(.10+R()*.16)}" filter="url(#blur2)"/>`; }
    for(let i=0;i<10;i++){ const x=R()*W, y=gy+30+R()*(H-gy-40), rr=30+R()*80;
      s+=`<ellipse cx="${P2(x)}" cy="${P2(y)}" rx="${P2(rr)}" ry="${P2(rr*.2)}" fill="${light}" opacity="${P2(.03+R()*.05)}" filter="url(#blur1)"/>`; }
    if(R()<1){ for(let i=0;i<5;i++){ const x=R()*W;
      s+=`<path d="M${P2(x)},${P2(gy+10)} q${P2(8+R()*16)},${P2((H-gy)*.4)} ${P2(-6-R()*14)},${P2((H-gy)*.8)}" stroke="${dark}" stroke-width="${P2(1+R()*2)}" fill="none" opacity=".3"/>`; } }
    return s;
  }
  /* 建筑群剪影(带工业细节 / 破口 / 亮窗 / 楼顶小物件) */
  function ruinRow(R,o){
    let x=o.x!=null?o.x:-40, out=''; const to=o.to!=null?o.to:W+40; const c=o.color||'#0b1016';
    const wMin=o.wMin||46, wMax=o.wMax||118, hMin=o.hMin||70, hMax=o.hMax||280, y0=o.y||700;
    while(x<to){
      const w=wMin+R()*(wMax-wMin), h=hMin+R()*(hMax-hMin), y=y0-h;
      if(R()<.62){
        let p='M'+P2(x)+','+P2(y+R()*22)+' ';
        const seg=Math.max(3,Math.floor(w/26));
        for(let i=0;i<=seg;i++) p+='L'+P2(x+w*i/seg)+','+P2(y+R()*30)+' ';
        p+='L'+P2(x+w)+','+y0+' L'+P2(x)+','+y0+' Z';
        out+=`<path d="${p}" fill="${c}"/>`;
      } else {
        out+=`<rect x="${P2(x)}" y="${P2(y)}" width="${P2(w)}" height="${P2(h)}" fill="${c}"/>`;
        if(R()<.5) out+=`<path d="M${P2(x+w*.55)},${P2(y)} l${P2(w*.4)},0 l0,${P2(h*.22)} l${P2(-w*.22)},0 Z" fill="rgba(0,0,0,.55)"/>`;
        if(o.deco!==false){
          if(R()<.34) out+=`<rect x="${P2(x+w*.5-1.6)}" y="${P2(y-26-R()*34)}" width="3" height="${P2(26+R()*34)}" fill="${c}"/>`;
          if(R()<.3) out+=`<rect x="${P2(x+w*.16)}" y="${P2(y-12)}" width="${P2(w*.2)}" height="12" fill="${c}"/>`;
          if(R()<.24) out+=`<path d="M${P2(x+w*.68)},${P2(y)} l0,${P2(-14)} l${P2(w*.1)},0 l0,14 Z" fill="${c}"/>`;
        }
      }
      if(o.lit){ const nw=1+Math.floor(R()*5);
        for(let i=0;i<nw;i++){ if(R()<.62){
          const ww=R()<.3?3:5;
          out+=`<rect x="${P2(x+4+R()*Math.max(6,w-12))}" y="${P2(y+8+R()*h*.72)}" width="${ww}" height="${P2(ww*1.3)}" fill="${o.lit}" opacity="${P2(.2+R()*.5)}"/>`; } } }
      if(o.wire!==false && R()<.4) out+=`<path d="M${P2(x+w*.3)},${P2(y-8)} q${P2(w*.4)},${P2(12+R()*16)} ${P2(w*.7)},${P2(-2)}" stroke="${c}" stroke-width="1.6" fill="none" opacity=".8"/>`;
      x+=w+R()*(o.gap!=null?o.gap:22);
    }
    return out;
  }
  /* 随机亮窗阵列(给近景建筑用) */
  function windows(R,x,y,w,h,cols,rows,lit,base){
    let s=`<rect x="${P2(x)}" y="${P2(y)}" width="${P2(w)}" height="${P2(h)}" fill="${base||'#0b1116'}" opacity=".85"/>`;
    const cw=w/cols, ch=h/rows;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const on=R()<.34;
      s+=`<rect x="${P2(x+c*cw+cw*.22)}" y="${P2(y+r*ch+ch*.22)}" width="${P2(cw*.56)}" height="${P2(ch*.5)}" fill="${on?lit:'#05080c'}" opacity="${on?P2(.25+R()*.55):.85}"/>`; }
    return s;
  }
  /* 墙面板:垂直色带 + 铆钉 + 污渍 + 边缘高光(避免大面积纯色) */
  function wallPanels(R,x0,x1,y0,y1,base,dark,light,step){
    let s=`<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="url(#wall)"/>`;
    step=step||72;
    for(let x=x0;x<x1;x+=step){
      s+=`<rect x="${P2(x)}" y="${y0}" width="1.6" height="${P2(y1-y0)}" fill="#000" opacity=".30"/>`;
      s+=`<rect x="${P2(x+1.6)}" y="${y0}" width="1.4" height="${P2(y1-y0)}" fill="${light}" opacity=".10"/>`;
    }
    const rows=Math.max(1,Math.floor((y1-y0)/96));
    for(let r=0;r<rows;r++) s+=`<rect x="${x0}" y="${P2(y0+r*96)}" width="${x1-x0}" height="1.8" fill="#000" opacity=".22"/>`;
    for(let i=0;i<46;i++) s+=`<circle cx="${P2(x0+R()*(x1-x0))}" cy="${P2(y0+R()*(y1-y0))}" r="${P2(.8+R()*1.8)}" fill="${R()<.5?light:dark}" opacity="${P2(.10+R()*.28)}"/>`;
    for(let i=0;i<16;i++){ const rx=R()*(x1-x0), ry=y0+R()*(y1-y0), rw=14+R()*90, rh=8+R()*70;
      s+=`<ellipse cx="${P2(x0+rx)}" cy="${P2(ry)}" rx="${P2(rw)}" ry="${P2(rh)}" fill="${dark}" opacity="${P2(.10+R()*.22)}" filter="url(#blur2)"/>`; }
    s+=`<rect x="${x0}" y="${P2(y1-3)}" width="${x1-x0}" height="3" fill="#000" opacity=".4"/>`;
    return s;
  }
  /* 管道与线缆 */
  function pipeRow(R,y,color,a,b){
    let s=`<rect x="0" y="${P2(y)}" width="${W}" height="12" rx="6" fill="${color}" opacity=".95"/>`;
    s+=`<rect x="0" y="${P2(y+1)}" width="${W}" height="3" rx="1.5" fill="rgba(255,255,255,.10)"/>`;
    for(let x=60;x<W;x+=140) s+=`<rect x="${x}" y="${P2(y-3)}" width="10" height="18" rx="3" fill="${color}"/>`;
    if(a!=null) s+=`<path d="M0,${P2(a)} Q${W*.4},${P2(a+26)} ${W},${P2(b!=null?b:a+10)}" stroke="${color}" stroke-width="3" fill="none" opacity=".8"/>`;
    if(b!=null) s+=`<path d="M0,${P2(b+30)} Q${W*.5},${P2(b+52)} ${W},${P2(b+22)}" stroke="${color}" stroke-width="2" fill="none" opacity=".55"/>`;
    return s;
  }
  /* 金属格栅 / 排水沟 */
  function grate(x,y,w,h,color,bars){
    let s=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}" stroke="rgba(0,0,0,.6)"/>`;
    bars=bars||Math.max(3,Math.floor(w/16));
    for(let i=1;i<bars;i++) s+=`<rect x="${P2(x+i*w/bars)}" y="${P2(y+2)}" width="2" height="${h-4}" fill="#05080b" opacity=".85"/>`;
    s+=`<rect x="${x}" y="${y}" width="${w}" height="2" fill="rgba(255,255,255,.10)"/>`;
    return s;
  }
  /* 垃圾 / 碎石 / 杂物 */
  function debris(R,y,color,n,spread){
    let s=''; n=n||26; spread=spread||110;
    for(let i=0;i<n;i++){ const x=R()*W, yy=y+ (R()-.4)*spread, w=2+R()*12, h=1.4+R()*5;
      s+=`<rect x="${P2(x)}" y="${P2(yy)}" width="${P2(w)}" height="${P2(h)}" rx="1" fill="${color}" opacity="${P2(.35+R()*.5)}" transform="rotate(${P2((R()-.5)*22)} ${P2(x)} ${P2(yy)})"/>`; }
    return s;
  }
  /* 接触阴影:物件底部的软椭圆 */
  function contact(x,y,rx,op){ return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx*.22}" fill="url(#gGroundShadow)" opacity="${op||.7}"/>`; }
  /* 模糊雾块 */
  function fog(y,h,fill,op,cls){ return `<rect class="${cls||'svgFog'}" x="-120" y="${y}" width="${W+240}" height="${h}" fill="${fill}" opacity="${op}" filter="url(#blur1)"/>`; }
  /* 径向辉光 */
  function glow(x,y,r,color,op,cls){ return `<circle class="${cls||''}" cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${op}" filter="url(#glow2)"/>`; }
  /* 光锥 */
  function lightCone(x,yTop,wTop,wBot,yBot,color,op){
    return `<polygon points="${P2(x-wTop/2)},${yTop} ${P2(x+wTop/2)},${yTop} ${P2(x+wBot/2)},${yBot} ${P2(x-wBot/2)},${yBot}" fill="${color}" opacity="${op}" filter="url(#blur2)"/>`;
  }

  /* ---------------- 旧零件(保留原签名,内部加细节) ---------------- */
  function car(x,y,s,color){
    s=s||1; const w=210*s, h=58*s;
    return contact(x+w*.5,y,44*s,.55)+`<g fill="${color}"><rect x="${x}" y="${y-h}" width="${w}" height="${h*0.72}" rx="${10*s}"/>`+
      `<path d="M${x+w*0.22},${y-h} L${x+w*0.3},${y-h-38*s} L${x+w*0.62},${y-h-38*s} L${x+w*0.74},${y-h} Z"/>`+
      `<rect x="${x+w*0.31}" y="${y-h-32*s}" width="${w*0.12}" height="${22*s}" fill="#080c10" opacity=".92"/>`+
      `<rect x="${x+w*0.47}" y="${y-h-32*s}" width="${w*0.12}" height="${22*s}" fill="#080c10" opacity=".92"/>`+
      `<rect x="${x}" y="${y-h*0.5}" width="${w}" height="3" fill="rgba(255,255,255,.07)"/></g>`+
      `<circle cx="${x+w*0.24}" cy="${y-4}" r="${15*s}" fill="#0a0e12"/><circle cx="${x+w*0.78}" cy="${y-4}" r="${15*s}" fill="#0a0e12"/>`;
  }
  function lamp(x,y,on){
    let s=contact(x,y,26,.55)+`<rect x="${x-3}" y="${y-190}" width="6" height="190" fill="#0b1014"/><path d="M${x-3},${y-190} L${x-26},${y-165} L${x+26},${y-165} L${x+3},${y-190} Z" fill="#0b1014"/>`;
    if(on) s+=glow(x,y-158,26,'rgba(255,205,130,.85)',.9,'flick')+lightCone(x,y-150,48,150,y,'rgba(255,205,130,.07)',1);
    return s;
  }
  function figure(x,y,h,opt){
    opt=opt||{}; const c=opt.c||'#070a0e'; const hd=h*.13;
    return contact(x,y,hd*1.1,.6)+`<g fill="${c}"><circle cx="${x}" cy="${P2(y-h+hd)}" r="${P2(hd*.62)}"/>`+
      (opt.ponytail?`<path d="M${P2(x+hd*.4)},${P2(y-h+hd*.7)} q ${P2(hd*.8)},${P2(hd*1.6)} ${P2(hd*.2)},${P2(hd*2.4)} l ${P2(-hd*.5)},0 q ${P2(hd*.4)},${P2(-hd*1.2)} ${P2(-hd*.2)},${P2(-hd*2)} Z"/>`:'')+
      `<path d="M${P2(x-hd*.55)},${P2(y-h+hd*1.5)} q ${P2(hd*.55)},${P2(-hd*.5)} ${P2(hd*1.1)},0 L${P2(x+hd*.8)},${P2(y-h*.36)} L${P2(x-hd*.8)},${P2(y-h*.36)} Z"/>`+
      `<rect x="${P2(x-hd*.5)}" y="${P2(y-h*.4)}" width="${P2(hd*.42)}" height="${P2(h*.4)}" rx="${P2(hd*.2)}"/>`+
      `<rect x="${P2(x+hd*.08)}" y="${P2(y-h*.4)}" width="${P2(hd*.42)}" height="${P2(h*.4)}" rx="${P2(hd*.2)}"/>`+
      (opt.rifle?`<rect x="${P2(x+hd*.5)}" y="${P2(y-h*.72)}" width="${P2(h*.34)}" height="${P2(hd*.34)}" transform="rotate(18 ${x} ${P2(y-h*.6)})"/>`:'')+
      (opt.sit?`<rect x="${P2(x-hd*.9)}" y="${P2(y-h*.18)}" width="${P2(hd*1.8)}" height="${P2(h*.18)}" rx="${P2(hd*.3)}"/>`:'')+`</g>`;
  }
  function tankCyl(x,y,w,h,color){
    return contact(x,y,w*.6,.6)+`<g><rect x="${P2(x-w/2)}" y="${P2(y-h)}" width="${w}" height="${h}" fill="${color}"/>`+
      `<rect x="${P2(x-w/2)}" y="${P2(y-h)}" width="${P2(w*.18)}" height="${h}" fill="rgba(255,255,255,.06)"/>`+
      `<ellipse cx="${x}" cy="${P2(y-h)}" rx="${P2(w/2)}" ry="${P2(w*0.16)}" fill="${color}"/>`+
      `<ellipse cx="${x}" cy="${P2(y-h)}" rx="${P2(w/2-6)}" ry="${Math.max(2,w*0.16-3)}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="2"/>`+
      `<rect x="${P2(x-w/2+4)}" y="${P2(y-h-24)}" width="5" height="24" fill="${color}"/><rect x="${P2(x+w/2-9)}" y="${P2(y-h-24)}" width="5" height="24" fill="${color}"/></g>`;
  }
  function rails(y){
    let out=`<rect x="0" y="${y}" width="${W}" height="5" fill="#0d1114"/>`;
    out+=`<rect x="0" y="${y}" width="${W}" height="2" fill="rgba(255,255,255,.12)"/>`;
    for(let x=-20;x<W+40;x+=46){ out+=`<path d="M${x},${y+6} l26,0 l-6,9 l-26,0 Z" fill="#0b0e12"/>`; }
    out+=`<rect x="0" y="${P2(y+16)}" width="${W}" height="4" fill="#080b0e"/>`;
    return out;
  }
  function pickup(x,y,s,color){
    s=s||1; const w=340*s, h=86*s;
    return contact(x+w*.5,y,120*s,.6)+`<g fill="${color}"><rect x="${x}" y="${P2(y-h)}" width="${w}" height="${P2(h*.6)}" rx="${8*s}"/>`+
      `<rect x="${x}" y="${P2(y-h)}" width="${w}" height="3" fill="rgba(255,255,255,.08)"/>`+
      `<path d="M${P2(x+w*.28)},${P2(y-h)} L${P2(x+w*.36)},${P2(y-h-46*s)} L${P2(x+w*.66)},${P2(y-h-46*s)} L${P2(x+w*.72)},${P2(y-h)} Z"/>`+
      `<rect x="${P2(x+w*.37)}" y="${P2(y-h-38*s)}" width="${P2(w*.11)}" height="${P2(28*s)}" fill="#070a0d"/>`+
      `<rect x="${P2(x+w*.51)}" y="${P2(y-h-38*s)}" width="${P2(w*.11)}" height="${P2(28*s)}" fill="#070a0d"/></g>`+
      `<circle cx="${P2(x+w*.2)}" cy="${P2(y-6)}" r="${20*s}" fill="#0a0e12"/><circle cx="${P2(x+w*.78)}" cy="${P2(y-6)}" r="${20*s}" fill="#0a0e12"/>`;
  }
  function hzStripe(x,y,w,h){
    let out='<g>';
    for(let i=0;i<w;i+=34){ out+=`<path d="M${P2(x+i)},${P2(y+h)} l17,0 l17,${P2(-h)} l${-17},0 Z" fill="#b3762f" opacity=".5"/>`; }
    return out+'</g>';
  }
  function glassTank(x,y,w,h,liquid,bright){
    const liq=`<defs><linearGradient id="lt${x}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${liquid}" stop-opacity="${bright?0.95:0.55}"/><stop offset="1" stop-color="#06110f"/></linearGradient></defs>`;
    return liq+contact(x,y,w*.62,.6)+`<g><rect x="${P2(x-w/2)}" y="${P2(y-h)}" width="${w}" height="${h}" rx="${P2(w/2)}" fill="url(#lt${x})" stroke="rgba(140,220,200,.25)" stroke-width="3"/>`+
      `<rect x="${P2(x-w/2+3)}" y="${P2(y-h+6)}" width="4" height="${P2(h-14)}" rx="2" fill="rgba(255,255,255,.16)"/>`+
      `<rect x="${P2(x-w/2-8)}" y="${P2(y-h-14)}" width="${P2(w+16)}" height="12" rx="5" fill="#0d1517"/>`+
      `<rect x="${P2(x-w/2-8)}" y="${P2(y-6)}" width="${P2(w+16)}" height="12" rx="5" fill="#0d1517"/>`+
      (bright?`<ellipse cx="${x}" cy="${P2(y-h*.55)}" rx="${P2(w*.18)}" ry="${P2(h*.2)}" fill="#06110f" opacity=".8"/>`:'')+
      `<circle cx="${P2(x-w*.15)}" cy="${P2(y-h*.3)}" r="5" fill="rgba(255,255,255,.25)"/><circle cx="${P2(x+w*.12)}" cy="${P2(y-h*.62)}" r="4" fill="rgba(255,255,255,.2)"/></g>`;
  }

  /* ---------------- 场景表 ---------------- */
  const SCENES = {
    /* 标题画面:废土城市天际线 + 黎明微光(压暗角、远山两层、近景轨道) */
    titleart:{
      p:'ember', theme:'dawn',
      draw(R){
        const o=TH.dawn;
        let s=sky(o);
        /* 云层(低透明度椭圆,缓慢漂移) */
        for(let i=0;i<8;i++){ const cx=R()*W, cy=90+R()*300, rx=180+R()*340, ry=30+R()*60;
          s+=`<ellipse class="svgFog2" cx="${P2(cx)}" cy="${P2(cy)}" rx="${P2(rx)}" ry="${P2(ry)}" fill="${i%2?'#5d3b46':'#2c2440'}" opacity="${P2(.16+R()*.22)}" filter="url(#blur1)"/>`; }
        /* 星点(高处,稀薄) */
        for(let i=0;i<46;i++) s+=`<circle cx="${P2(R()*W)}" cy="${P2(R()*360)}" r="${P2(R()*1.3+.3)}" fill="rgba(220,232,255,${P2(.08+R()*.3)})"/>`;
        s+=skyGlow(Object.assign({},o,{sunR:70}));
        /* 第一层远景剪影(最淡最冷,大气透视) */
        s+=ruinRow(R,{y:640,color:'#4a3a52',hMin:50,hMax:170,wMin:34,wMax:86,gap:16,deco:false,wire:false});
        s+=air(o,.46,470,660);
        /* 第二层中远景:倒塌的高塔与吊臂 */
        s+=ruinRow(R,{y:690,color:'#33253c',hMin:70,hMax:250,wMin:44,wMax:118,gap:22,lit:'rgba(255,190,120,.35)'});
        s+=`<path d="M1180,690 l0,-232 l14,0 l0,196 l96,-58 l6,14 l-106,64 l0,16 Z" fill="#2a1f34"/>`;
        s+=`<path d="M1186,470 l-150,84 l4,10 l152,-86 Z" fill="#2a1f34"/>`;
        s+=air(o,.40,560,700);
        /* 第三层近景废墟 + 亮窗 */
        s+=ruinRow(R,{y:730,color:'#23182c',hMin:100,hMax:300,wMin:76,wMax:170,gap:28,lit:'rgba(255,196,120,.45)'});
        /* 雾霾带 */
        s+=hazeBand(560,180,'#e8c39a',.16)+hazeBand(640,220,'#f0cda0',.13,'svgFog2');
        /* 地面:荒地 + 轨道 */
        s+=paved(R,736,'#120d1c','#e0b184');
        s+=rails(770);
        /* 断轨枕木 */
        for(let i=0;i<9;i++){ const x=R()*W; s+=`<rect x="${P2(x)}" y="${P2(760+R()*60)}" width="${P2(40+R()*70)}" height="${P2(8+R()*6)}" rx="2" fill="#120d1a" transform="rotate(${P2((R()-.5)*16)} ${P2(x)} ${P2(770+R()*50)})" opacity=".9"/>`; }
        s+=debris(R,790,'#0e0a16',34,90);
        /* 光源:远处篝火 + 近景信号灯 */
        s+=glow(1080,600,150,'rgba(255,190,110,.55)',.75)+`<circle cx="1080" cy="600" r="26" fill="#ffd9a0" opacity=".92" class="flick"/>`;
        s+=glow(300,742,54,'rgba(255,140,60,.55)',.55,'flick')+lightCone(300,736,40,180,900,'rgba(255,170,90,.09)',1);
        s+=glow(1420,752,46,'rgba(255,140,60,.45)',.45,'flick');
        s+=midLift('#8494a6')+nearFrame('#0b0713');
        return s;
      }
    },
    /* 七号站台·电台室(夜) */
    metro_night:{
      p:'dustlow', theme:'metro_night',
      draw(R){
        const o=TH.metro_night;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,470,'#0f1c27','#050a11','#d8e8f4',96);
        /* 吊顶灯槽(夜色里给顶部中调,避免上半屏死黑) */
        [360,760,1160].forEach(x=>{ s+=`<rect x="${x}" y="46" width="200" height="12" rx="5" fill="#0a141c"/>`+
          `<rect x="${x+10}" y="58" width="180" height="7" rx="3" fill="rgba(196,224,244,.42)"/>`;
          s+=glow(x+100,70,190,'rgba(190,220,245,.34)',.5);
          s+=lightCone(x+100,62,300,880,760,'rgba(196,224,244,.06)',1); });
        s+=pipeRow(R,300,'#0d1a24',210,236)+pipeRow(R,340,'#0d1a24');
        [180,420,660,900].forEach(x=>{ s+=`<rect x="${x}" y="60" width="56" height="470" fill="#0a131c"/>`+
          `<rect x="${x}" y="60" width="9" height="470" fill="rgba(255,255,255,.07)"/>`+
          `<rect x="${x+47}" y="60" width="9" height="470" fill="rgba(0,0,0,.45)"/>`+
          `<rect x="${x-4}" y="60" width="64" height="9" fill="#0d1822"/>`; });
        /* 电台机柜 + 暖光窗口 */
        s+=`<rect x="1000" y="240" width="430" height="290" rx="12" fill="#081019"/>`;
        s+=wallPanels(R,1010,1420,250,520,'#0d1a25','#050c13','#e2eef8',70);
        s+=`<rect x="1040" y="270" width="360" height="180" rx="8" fill="rgba(255,177,92,.16)"/>`;
        s+=`<rect x="1048" y="278" width="344" height="164" rx="6" fill="rgba(255,207,138,.20)" class="flick"/>`;
        s+=`<rect x="1048" y="278" width="344" height="10" fill="rgba(255,230,190,.22)"/>`;
        s+=glow(1210,370,140,'rgba(255,170,80,.6)',.6);
        s+=lightCone(1210,250,120,520,760,'rgba(255,180,110,.07)',1);
        s+=`<rect x="1000" y="530" width="430" height="24" rx="8" fill="#070e15"/>`;
        s+=`<rect x="470" y="150" width="260" height="66" rx="8" fill="#060d14" stroke="rgba(127,216,208,.42)" stroke-width="2"/>`;
        s+=`<text x="600" y="193" text-anchor="middle" font-size="30" letter-spacing="10" fill="#7fd8d0" opacity=".92">七号站台</text>`;
        s+=`<rect x="470" y="150" width="260" height="4" fill="rgba(180,240,235,.35)"/>`;
        s+=hazeBand(200,300,'#0d1a26',.6,'svgFog2');
        /* 地面:水泥站台 + 磨损 + 排水沟 */
        s+=paved(R,700,'#05090e','#9fc4dc');
        s+=grate(880,790,180,34,'#0a1014')+grate(1360,830,150,30,'#0a1014');
        s+=debris(R,760,'#0a1015',22,60);
        s+=figure(260,830,120+R()*30,{c:'#04070b'})+figure(760,838,116+R()*24,{c:'#04070b'});
        s+=glow(300,660,60,'rgba(255,70,60,.45)',.4,'flick')+glow(1350,676,60,'rgba(255,70,60,.4)',.35,'flick');
        s+=`<rect x="292" y="576" width="18" height="18" fill="#ff5f4a" opacity=".72" class="flick"/>`;
        s+=midLift('#8494a6')+nearFrame('#04070c');
        return s;
      }
    },
    /* 七号站台·电台室 */
    metro:{
      p:'dust', theme:'metro',
      draw(R){
        const o=TH.metro;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,470,o.mid,'#050a11','#d2e4f2',96);
        s+=pipeRow(R,306,'#0a141c',222,246)+pipeRow(R,344,'#0a141c');
        [180,420,660,900].forEach(x=>{ s+=`<rect x="${x}" y="50" width="56" height="480" fill="#071019"/>`+
          `<rect x="${x}" y="50" width="9" height="480" fill="rgba(255,255,255,.06)"/>`+
          `<rect x="${x+47}" y="50" width="9" height="480" fill="rgba(0,0,0,.45)"/>`; });
        s+=`<rect x="1000" y="230" width="440" height="300" rx="12" fill="#08111a"/>`;
        s+=wallPanels(R,1010,1430,240,530,'#0b151e','#050b12','#dce8f2',70);
        s+=`<rect x="1040" y="262" width="370" height="190" rx="8" fill="rgba(255,177,92,.18)"/>`;
        s+=`<rect x="1048" y="270" width="354" height="174" rx="6" fill="rgba(255,207,138,.22)" class="flick"/>`;
        s+=`<rect x="1048" y="270" width="354" height="12" fill="rgba(255,235,200,.24)"/>`;
        s+=glow(1225,368,150,'rgba(255,170,80,.62)',.62);
        s+=lightCone(1225,240,130,540,780,'rgba(255,180,110,.075)',1);
        s+=`<rect x="1000" y="540" width="440" height="26" rx="8" fill="#081019"/>`;
        s+=`<rect x="1100" y="418" width="74" height="54" rx="6" fill="#0a151d" stroke="rgba(255,207,138,.4)"/>`;
        s+=`<rect x="1240" y="430" width="48" height="42" rx="4" fill="#0a151d" stroke="rgba(127,216,208,.4)"/>`;
        s+=`<rect x="460" y="140" width="280" height="68" rx="8" fill="#07111a" stroke="rgba(127,216,208,.5)" stroke-width="2"/>`;
        s+=`<text x="600" y="184" text-anchor="middle" font-size="32" letter-spacing="11" fill="#7fd8d0">七号站台</text>`;
        s+=`<rect x="460" y="140" width="280" height="4" fill="rgba(180,240,235,.4)"/>`;
        s+=hazeBand(190,320,'#10202e',.55,'svgFog2');
        s+=paved(R,700,'#060b11','#9fc4dc');
        s+=crate(R,300,742)+`<rect x="316" y="754" width="12" height="60" fill="#0a1219"/><rect x="472" y="754" width="12" height="60" fill="#0a1219"/>`;
        s+=grate(940,800,170,32,'#0b1218');
        s+=debris(R,750,'#0b1218',24,64);
        s+=lamp(800,700,true);
        s+=figure(1230,846,124,{c:'#050a10'});
        s+=midLift('#8494a6')+nearFrame('#050a10');
        return s;
      }
    },
    /* 气闸门 */
    gate:{
      p:'dustlow', theme:'gate',
      draw(R){
        const o=TH.gate;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,720,o.mid,'#05090e','#c8dcea',120);
        s+=pipeRow(R,150,'#081016',120,168)+pipeRow(R,640,'#081016');
        for(let i=0;i<9;i++){ const x=40+i*180; s+=`<rect x="${x}" y="88" width="16" height="470" fill="#060c12" opacity=".85"/>`; }
        s+=`<rect x="560" y="140" width="480" height="560" rx="18" fill="#05080c" stroke="#141b22" stroke-width="10"/>`;
        s+=`<rect x="600" y="180" width="400" height="520" fill="#03050a"/>`;
        /* 门缝透光 + 门体铆钉 */
        for(let x=608;x<1000;x+=48) s+=`<circle cx="${x}" cy="196" r="3.4" fill="#1a232b"/><circle cx="${x}" cy="686" r="3.4" fill="#1a232b"/>`;
        s+=`<polygon points="600,180 1000,180 1000,700 600,700" fill="rgba(120,170,210,.06)"/>`;
        s+=glow(800,430,190,'rgba(140,190,230,.32)',.5)+lightCone(800,180,300,760,880,'rgba(150,200,235,.07)',1);
        s+=hzStripe(560,660,480,26);
        s+=`<rect x="120" y="90" width="1360" height="20" fill="#0a1016"/><rect x="120" y="90" width="1360" height="3" fill="rgba(255,255,255,.07)"/>`;
        s+=`<rect x="120" y="110" width="1360" height="8" fill="#06090e"/>`;
        [160,460,1120,1420].forEach(x=>{ s+=`<rect x="${x}" y="88" width="16" height="44" fill="#0b1218"/><circle cx="${x+8}" cy="140" r="5" fill="#141c23"/>`; });
        s+=paved(R,700,'#05080c','#9ab6c8');
        s+=`<polygon points="600,700 1000,700 1140,900 460,900" fill="rgba(130,180,220,.05)"/>`;
        s+=grate(180,760,140,40,'#080d12')+grate(1280,780,150,40,'#080d12');
        s+=debris(R,760,'#080d12',30,80);
        s+=glow(268,124,26,'rgba(255,80,70,.5)',.4,'flick')+glow(1428,124,26,'rgba(120,230,160,.5)',.45,'flick');
        s+=midLift('#8494a6')+nearFrame('#04070b');
        return s;
      }
    },
    /* 灰雨旧街(黄昏) */
    street_rain:{
      p:'rain', theme:'street_rain',
      draw(R){
        const o=TH.street_rain;
        let s=sky(o);
        for(let i=0;i<7;i++) s+=`<ellipse class="svgFog2" cx="${P2(R()*W)}" cy="${P2(70+R()*240)}" rx="${P2(200+R()*320)}" ry="${P2(26+R()*44)}" fill="#565a52" opacity="${P2(.12+R()*.18)}" filter="url(#blur1)"/>`;
        s+=skyGlow(o);
        s+=ruinRow(R,{y:590,color:'#3c4647',hMin:70,hMax:240,wMin:40,wMax:100,gap:16,deco:false,wire:false});
        s+=air(o,.52,400,600);
        s+=ruinRow(R,{y:660,color:'#232d2f',hMin:80,hMax:290,wMin:48,wMax:124,gap:20,lit:'rgba(255,190,120,.35)'});
        s+=air(o,.34,520,680);
        s+=ruinRow(R,{y:700,color:'#141c1e',hMin:60,hMax:210,wMin:60,wMax:150,gap:24,lit:'rgba(255,196,120,.45)'});
        s+=hazeBand(520,200,'#d2d8cf',.24)+hazeBand(600,220,'#e6e2d4',.18,'svgFog2');
        s+=paved(R,702,'#0a1012','#d8d6c4');
        s+=`<polygon points="0,700 ${W},700 ${W},900 0,900" fill="rgba(120,140,145,.05)"/>`;
        s+=car(120,766,1,'#0b1013')+car(560,782,1.2,'#0a0e11')+car(1080,770,1.05,'#0b1014');
        s+=lamp(380,730,false)+lamp(1240,742,true);
        /* 倾斜的路牌(手绘感) */
        s+=`<rect x="60" y="380" width="242" height="122" rx="8" fill="#0e1518" opacity=".88" transform="rotate(-2 180 440)"/>`;
        s+=`<rect x="60" y="380" width="242" height="4" fill="rgba(255,255,255,.09)" transform="rotate(-2 180 440)"/>`;
        s+=`<text x="180" y="452" text-anchor="middle" font-size="34" letter-spacing="8" fill="rgba(200,220,225,.45)">旧街</text>`;
        s+=debris(R,790,'#0a0f11',30,90);
        s+=hazeBand(660,240,'#c8d2d4',.10);
        s+=rainVeil()+rainBand(16,.16,80,.5);
        s+=midLift('#8494a6')+nearFrame('#080d10');
        return s;
      }
    },
    /* 便利店 */
    store:{
      p:'dust', theme:'store',
      draw(R){
        const o=TH.store;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,700,'#171310','#0a0705','#e0c49a',110);
        /* 货架 + 商品 */
        for(let i=0;i<4;i++){ const x=110+i*358;
          s+=`<rect x="${x}" y="180" width="310" height="18" fill="#0b0805"/><rect x="${x}" y="180" width="310" height="3" fill="rgba(255,220,170,.10)"/>`;
          s+=`<rect x="${x}" y="320" width="310" height="18" fill="#0b0805"/><rect x="${x}" y="320" width="310" height="3" fill="rgba(255,220,170,.10)"/>`;
          s+=`<rect x="${x}" y="460" width="310" height="18" fill="#0b0805"/><rect x="${x}" y="460" width="310" height="3" fill="rgba(255,220,170,.10)"/>`;
          s+=`<rect x="${x}" y="180" width="13" height="520" fill="#090705"/><rect x="${x+297}" y="180" width="13" height="520" fill="#090705"/>`;
          for(let j=0;j<5;j++){ if(R()<.62){ const cw=30+R()*12, ch=22+R()*10;
            s+=`<rect x="${P2(x+18+j*58)}" y="${P2(200-R()*6)}" width="${P2(cw)}" height="${P2(ch)}" rx="4" fill="${['#2a2118','#33261a','#1f1812'][Math.floor(R()*3)]}"/>`;
            s+=`<rect x="${P2(x+18+j*58)}" y="${P2(200-R()*6)}" width="${P2(cw)}" height="3" fill="rgba(255,220,170,.12)"/>`; }
            if(R()<.5){ const cw=28+R()*12, ch=20+R()*10;
              s+=`<rect x="${P2(x+18+j*58)}" y="${P2(340)}" width="${P2(cw)}" height="${P2(ch)}" rx="4" fill="#241c14"/>`; } }
        }
        /* 冷柜(玻璃 + 内亮) */
        s+=`<rect x="1170" y="410" width="350" height="300" rx="6" fill="#0d0b08"/>`;
        s+=`<rect x="1178" y="420" width="334" height="282" rx="4" fill="rgba(150,200,215,.10)"/>`;
        s+=`<rect x="1178" y="420" width="334" height="8" fill="rgba(220,240,250,.18)"/>`;
        s+=`<rect x="1170" y="402" width="350" height="14" rx="4" fill="#0a0806"/>`;
        s+=`<rect x="1330" y="420" width="4" height="282" fill="rgba(200,230,240,.14)"/>`;
        s+=glow(1345,560,90,'rgba(150,210,230,.28)',.4);
        /* 顶灯 + 光锥 */
        s+=`<rect x="660" y="96" width="290" height="16" rx="6" fill="#12100c"/>`;
        s+=`<rect x="672" y="108" width="266" height="8" rx="3" fill="#ffcf8a" opacity=".9" class="flick"/>`;
        s+=glow(800,116,150,'rgba(255,190,110,.6)',.8,'flick');
        s+=lightCone(800,120,300,900,780,'rgba(255,200,120,.075)',1);
        s+=hazeBand(200,320,'#3a2f1e',.30,'svgFog2');
        s+=paved(R,700,'#0a0805','#e0c49a');
        /* 翻倒的货架 + 收银台 */
        s+=`<rect x="240" y="742" width="480" height="92" rx="10" fill="#0b0906" transform="rotate(-1.5 480 788)"/>`;
        s+=`<rect x="240" y="742" width="480" height="4" fill="rgba(255,220,170,.07)" transform="rotate(-1.5 480 788)"/>`;
        s+=contact(250,864,40,.7)+`<circle cx="250" cy="860" r="34" fill="#0a0805"/>`;
        s+=contact(700,868,32,.7)+`<circle cx="700" cy="866" r="26" fill="#0a0805"/>`;
        s+=figure(880,864,190,{c:'#0a0805',sit:true});
        s+=debris(R,780,'#0b0805',34,80);
        s+=fog(380,260,'rgba(40,32,20,.30)',.6);
        s+=midLift('#8494a6')+nearFrame('#080604');
        return s;
      }
    },
    /* 断巷 */
    alley:{
      p:'dustlow', theme:'alley',
      draw(R){
        const o=TH.alley;
        let s=sky(o);
        /* 两侧高楼夹成的窄天光 */
        s+=`<polygon points="0,0 540,90 540,900 0,900" fill="#0a0e14"/>`;
        s+=`<polygon points="1600,0 1060,90 1060,900 1600,900" fill="#0e1319"/>`;
        s+=wallPanels(R,0,540,60,860,'#16202a','#060a10','#ccdae8',74);
        s+=wallPanels(R,1060,1600,60,860,'#1a242f','#070c12','#d6e2ee',74);
        /* 砖砌分割线 + 窗洞(给大面积墙以中调细节,避免近黑色块) */
        for(let y=180;y<860;y+=64) s+=`<rect x="0" y="${y}" width="540" height="3" fill="rgba(200,220,240,.055)"/>`;
        for(let y=180;y<860;y+=64) s+=`<rect x="1060" y="${y}" width="540" height="3" fill="rgba(200,220,240,.06)"/>`;
        s+=`<rect x="120" y="230" width="140" height="180" rx="4" fill="#060a10"/>`;
        s+=`<rect x="128" y="238" width="124" height="164" rx="3" fill="rgba(255,186,110,.10)" class="flick"/>`;
        s+=glow(190,320,160,'rgba(255,176,96,.28)',.4,'flick');
        s+=lightCone(190,320,150,520,830,'rgba(255,180,100,.05)',1);
        s+=`<rect x="1310" y="290" width="150" height="200" rx="4" fill="#070c12"/>`;
        s+=`<rect x="1318" y="298" width="134" height="184" rx="3" fill="rgba(170,200,235,.09)"/>`;
        s+=glow(1385,390,150,'rgba(150,190,230,.20)',.34);
        /* 空调外机 / 铁艺阳台 / 外挂楼梯 */
        for(let i=0;i<5;i++){ const y=380+i*96;
          s+=`<rect x="430" y="${y}" width="110" height="62" rx="4" fill="#0d141b"/><rect x="436" y="${y+5}" width="98" height="8" fill="#070c11"/><rect x="436" y="${y+20}" width="98" height="8" fill="#070c11"/><rect x="436" y="${y+35}" width="98" height="8" fill="#070c11"/>`;
          s+=`<rect x="1084" y="${y+40}" width="110" height="62" rx="4" fill="#0f161d"/><rect x="1090" y="${y+45}" width="98" height="8" fill="#080d12"/>`; }
        s+=`<path d="M1100,300 l-70,0 l0,320 l70,0 Z" fill="none" stroke="rgba(150,180,210,.13)" stroke-width="4"/>`;
        for(let y=320;y<620;y+=34) s+=`<rect x="1032" y="${y}" width="68" height="4" fill="rgba(150,180,210,.12)"/>`;
        for(let i=0;i<7;i++){ const x=40+i*78; s+=`<rect x="${x}" y="${P2(120+i*36)}" width="7" height="${P2(700-i*50)}" fill="#070a0e"/>`; }
        for(let i=0;i<6;i++){ const x=1100+R()*430; s+=`<rect x="${P2(x)}" y="${P2(100+R()*300)}" width="9" height="${P2(420+R()*180)}" fill="#080c10"/>`; }
        s+=pipeRow(R,140,'#070b0f',96,150)+pipeRow(R,760,'#070b0f');
        /* 过街的晾衣绳与破布 */
        s+=`<path d="M540,140 Q800,250 1060,120" stroke="#06090d" stroke-width="5" fill="none"/>`;
        s+=`<path d="M540,230 Q800,340 1060,204" stroke="#06090d" stroke-width="4" fill="none"/>`;
        for(let i=0;i<7;i++){ const t=i/6, x=560+t*470, y=155+Math.sin(t*Math.PI)*80;
          s+=`<rect x="${P2(x)}" y="${P2(y)}" width="${P2(26+R()*20)}" height="${P2(30+R()*54)}" rx="3" fill="#0b1015" opacity=".9" transform="rotate(${P2((R()-.5)*14)} ${P2(x)} ${P2(y)})"/>`; }
        /* 楼间的天桥残段 */
        s+=`<rect x="620" y="150" width="360" height="96" fill="#06090d"/>`;
        s+=`<rect x="620" y="150" width="360" height="5" fill="rgba(255,255,255,.05)"/>`;
        s+=`<path d="M700,246 l40,0 l0,40 l-40,0 Z" fill="#04070a"/><path d="M880,246 l34,0 l0,34 l-34,0 Z" fill="#04070a"/>`;
        /* 远处一点天光 */
        s+=glow(800,300,170,'rgba(150,180,220,.20)',.4)+hazeBand(180,260,'#7f95ad',.10,'svgFog2');
        s+=paved(R,790,'#070a0e','#9db0c4');
        /* 油桶火堆:接触阴影 + 火 + 光锥 + 火星 */
        s+=contact(780,796,110,.75);
        s+=`<rect x="688" y="640" width="184" height="156" rx="14" fill="#0b0e12"/>`;
        s+=`<rect x="688" y="632" width="184" height="18" rx="6" fill="#10141a"/>`;
        s+=`<rect x="700" y="660" width="160" height="4" fill="rgba(255,255,255,.06)"/>`;
        s+=glow(780,600,150,'rgba(255,120,50,.66)',.7,'flick');
        s+=lightCone(780,640,170,700,900,'rgba(255,140,60,.10)',1);
        s+=`<path d="M760,634 q18,-46 26,-16 q14,-34 22,10 q10,-22 14,10" stroke="rgba(255,190,120,.5)" stroke-width="6" fill="none" class="flick"/>`;
        /* 血迹与涂鸦 */
        s+=`<path d="M660,470 q40,-24 78,0 q34,20 66,-6" stroke="rgba(190,60,50,.45)" stroke-width="8" fill="none" stroke-linecap="round"/>`;
        s+=`<path d="M180,320 l60,0 l0,60 l-60,0 Z" stroke="rgba(230,190,90,.28)" stroke-width="4" fill="none"/>`;
        s+=`<path d="M1370,300 q30,-40 60,0 q-30,50 -60,0" stroke="rgba(230,190,90,.22)" stroke-width="4" fill="none"/>`;
        s+=debris(R,800,'#080b0f',30,80);
        s+=midLift('#8494a6')+nearFrame('#05080c');
        return s;
      }
    },
    /* 天台·黄昏 */
    rooftop:{
      p:'ash', theme:'rooftop',
      draw(R){
        const o=TH.rooftop;
        let s=sky(o);
        for(let i=0;i<7;i++) s+=`<ellipse class="svgFog2" cx="${P2(R()*W)}" cy="${P2(70+R()*230)}" rx="${P2(210+R()*330)}" ry="${P2(24+R()*46)}" fill="#3a2b48" opacity="${P2(.16+R()*.2)}" filter="url(#blur1)"/>`;
        s+=skyGlow(o);
        s+=ruinRow(R,{y:600,color:'#4a3350',hMin:60,hMax:210,wMin:36,wMax:92,gap:16,deco:false,wire:false});
        s+=air(o,.5,420,610);
        s+=ruinRow(R,{y:660,color:'#2c2040',hMin:80,hMax:280,wMin:48,wMax:120,gap:22,lit:'rgba(255,205,140,.35)'});
        s+=air(o,.36,540,680);
        /* 云海 */
        s+=hazeBand(560,150,'#f0b483',.22)+hazeBand(620,180,'#ffcf9c',.16,'svgFog2');
        /* 天台地面:防水层 + 碎石 + 女儿墙 */
        s+=paved(R,660,'#120d1e','#f0b483');
        for(let x=20;x<W;x+=52){ s+=`<rect x="${x}" y="600" width="8" height="68" fill="#0c0917"/>`; }
        s+=`<rect x="0" y="592" width="${W}" height="10" fill="#0d0a18"/><rect x="0" y="592" width="${W}" height="3" fill="rgba(255,210,160,.16)"/>`;
        /* 排风管 + 水箱(接触阴影) */
        s+=tankCyl(280,660,150,190,'#1b2230')+tankCyl(1210,660,170,230,'#1b2230');
        s+=`<rect x="520" y="700" width="210" height="64" rx="8" fill="#120e1c"/><rect x="520" y="700" width="210" height="4" fill="rgba(255,220,180,.10)"/>`;
        /* 天线与警示灯 */
        s+=`<rect x="1180" y="374" width="4" height="70" fill="#141a26"/><circle cx="1182" cy="370" r="5" fill="rgba(255,120,80,.85)" class="flick"/>`;
        s+=glow(1182,370,40,'rgba(255,120,80,.5)',.5,'flick');
        s+=`<path d="M1182,392 l-34,26 M1182,412 l30,20 M1182,432 l-40,18" stroke="#141a26" stroke-width="3" fill="none"/>`;
        s+=figure(1212,436,120,{ponytail:true,rifle:true});
        s+=glow(1240,420,120,'rgba(255,170,90,.35)',.4);
        s+=debris(R,700,'#120e1c',30,80);
        s+=midLift('#8494a6')+nearFrame('#0d0916');
        return s;
      }
    },
    /* 天台·夜 */
    rooftop_night:{
      p:'ash', theme:'rooftop_night',
      draw(R){
        const o=TH.rooftop_night;
        let s=sky(o);
        for(let i=0;i<70;i++) s+=`<circle cx="${P2(R()*W)}" cy="${P2(R()*430)}" r="${P2(R()*1.5+.35)}" fill="rgba(220,235,255,${P2(.18+R()*.55)})"/>`;
        for(let i=0;i<5;i++) s+=`<ellipse class="svgFog2" cx="${P2(R()*W)}" cy="${P2(90+R()*220)}" rx="${P2(220+R()*320)}" ry="${P2(24+R()*40)}" fill="#16233c" opacity="${P2(.16+R()*.2)}" filter="url(#blur1)"/>`;
        s+=skyGlow(Object.assign({},o,{sunR:50}));
        s+=ruinRow(R,{y:600,color:'#1a2740',hMin:60,hMax:200,wMin:36,wMax:90,gap:16,deco:false,wire:false});
        s+=air(o,.5,420,610);
        s+=ruinRow(R,{y:660,color:'#0e1729',hMin:70,hMax:260,wMin:48,wMax:120,gap:22,lit:'rgba(255,205,130,.4)'});
        s+=air(o,.34,540,680);
        s+=hazeBand(580,190,'#9db6d6',.16)+hazeBand(650,180,'#c3d6ee',.10,'svgFog2');
        s+=paved(R,660,'#070c15','#9db6d6');
        for(let x=20;x<W;x+=52){ s+=`<rect x="${x}" y="600" width="8" height="68" fill="#060a12"/>`; }
        s+=`<rect x="0" y="592" width="${W}" height="10" fill="#060a12"/><rect x="0" y="592" width="${W}" height="3" fill="rgba(190,215,250,.18)"/>`;
        s+=tankCyl(280,660,150,190,'#0d1524')+tankCyl(1210,660,170,230,'#0d1524');
        s+=`<rect x="520" y="700" width="210" height="64" rx="8" fill="#0a1120"/>`;
        s+=figure(1212,436,120,{ponytail:true,sit:true,c:'#060a12'});
        s+=glow(1212,470,80,'rgba(180,210,250,.28)',.35);
        s+=debris(R,700,'#0a1120',26,70);
        s+=midLift('#8494a6')+nearFrame('#050912');
        return s;
      }
    },
    /* 雨夜旧街 */
    street_night:{
      p:'rain', theme:'street_night',
      draw(R){
        const o=TH.street_night;
        let s=sky(o);
        s+=ruinRow(R,{y:600,color:'#16283c',hMin:60,hMax:220,wMin:38,wMax:96,gap:16,deco:false,wire:false});
        s+=air(o,.48,430,610);
        s+=ruinRow(R,{y:660,color:'#0d1a2b',hMin:80,hMax:280,wMin:48,wMax:124,gap:20,lit:'rgba(255,190,120,.35)'});
        s+=air(o,.32,540,680);
        s+=ruinRow(R,{y:700,color:'#081120',hMin:60,hMax:200,wMin:60,wMax:150,gap:24,lit:'rgba(160,255,200,.35)'});
        s+=hazeBand(520,210,'#7fa8c8',.18)+hazeBand(600,220,'#9dc4dc',.12,'svgFog2');
        s+=paved(R,702,'#060b12','#8fb6d6');
        s+=`<polygon points="0,700 ${W},700 ${W},900 0,900" fill="rgba(90,140,180,.07)"/>`;
        s+=car(180,772,1.1,'#080f18')+car(880,784,1.25,'#070d15');
        s+=lamp(520,742,false);
        /* 便利店霓虹 */
        s+=`<rect x="1150" y="424" width="340" height="140" rx="10" fill="#08111c" stroke="rgba(159,232,184,.4)" stroke-width="3"/>`;
        s+=`<rect x="1158" y="432" width="324" height="124" rx="6" fill="rgba(120,255,190,.07)"/>`;
        s+=`<text x="1320" y="512" text-anchor="middle" font-size="46" letter-spacing="14" fill="#9fe8b8" opacity=".9" class="flick">便利店</text>`;
        s+=glow(1320,470,180,'rgba(120,230,160,.45)',.6,'flick');
        s+=lightCone(1320,560,220,620,830,'rgba(120,230,160,.10)',1);
        s+=`<polygon points="1240,566 1400,566 1430,780 1215,780" fill="rgba(130,240,180,.07)"/>`;
        s+=figure(1060,802,110,{c:'#05080c'});
        s+=`<rect x="1020" y="722" width="92" height="72" rx="6" fill="#0a1119" transform="rotate(-8 1065 757)"/>`;
        s+=debris(R,790,'#081019',30,86);
        s+=rainVeil()+rainBand(18,.18,80,.5);
        s+=midLift('#8494a6')+nearFrame('#050a12');
        return s;
      }
    },
    /* 圣愈医院·前广场 */
    hospital_out:{
      p:'dust', theme:'hospital_out',
      draw(R){
        const o=TH.hospital_out;
        let s=sky(o);
        s+=`<ellipse class="svgFog2" cx="${W*.5}" cy="200" rx="560" ry="150" fill="#3c5548" opacity=".22" filter="url(#blur1)"/>`;
        /* 两翼远楼 */
        s+=ruinRow(R,{x:-40,to:400,y:600,color:'#243129',hMin:90,hMax:230,wMin:60,wMax:130,gap:20,deco:false,wire:false});
        s+=ruinRow(R,{x:1200,to:1660,y:600,color:'#243129',hMin:90,hMax:230,wMin:60,wMax:130,gap:20,deco:false,wire:false});
        s+=air(o,.42,420,620);
        /* 主楼:窗格阵列(逐窗明暗) + 立面分层 */
        s+=`<rect x="420" y="170" width="760" height="580" fill="#243129"/>`;
        s+=windows(R,432,182,736,548,10,7,'rgba(160,240,190,.55)','#1b2620');
        s+=`<rect x="420" y="170" width="760" height="16" fill="#1d2822"/><rect x="420" y="170" width="760" height="4" fill="rgba(200,255,220,.12)"/>`;
        s+=`<rect x="420" y="170" width="14" height="580" fill="rgba(255,255,255,.05)"/>`;
        s+=`<rect x="1166" y="170" width="14" height="580" fill="rgba(0,0,0,.35)"/>`;
        s+=`<rect x="770" y="640" width="66" height="110" fill="#141d18"/>`;
        s+=`<rect x="760" y="622" width="86" height="24" rx="3" fill="#2c3a31"/>`;
        /* 绿十字 */
        s+=`<rect x="806" y="112" width="22" height="76" fill="#9fe8b8" opacity=".88"/>`;
        s+=`<rect x="778" y="140" width="78" height="22" fill="#9fe8b8" opacity=".88"/>`;
        s+=glow(817,148,190,'rgba(120,230,160,.5)',.62,'flick');
        s+=lightCone(817,120,220,700,760,'rgba(120,230,160,.07)',1);
        s+=hazeBand(480,220,'#a8c9b4',.20);
        s+=paved(R,744,'#0a0f0c','#a8c9b4');
        /* 广场车辆与残骸 */
        s+=car(120,806,1.15,'#0d1210')+car(1240,814,1.2,'#0d1210')+car(620,834,1.35,'#0d1210');
        s+=`<rect x="20" y="642" width="152" height="14" fill="#0e1410" opacity=".85" transform="rotate(-3 96 649)"/>`;
        s+=grate(560,800,180,34,'#0a100d');
        s+=debris(R,790,'#0a100d',32,86);
        s+=midLift('#8494a6')+nearFrame('#070c0a');
        return s;
      }
    },
    /* 医院大厅 */
    lobby:{
      p:'dust', theme:'lobby',
      draw(R){
        const o=TH.lobby;
        let s=sky(o);
        /* 后墙 + 高处窗带 */
        s+=wallPanels(R,0,W,0,560,o.mid,'#060a0d','#cfe8e4',120);
        s+=`<rect x="180" y="88" width="270" height="18" rx="4" fill="#cfe8e4" opacity=".72"/>`;
        s+=glow(315,108,160,'rgba(200,240,235,.42)',.55);
        s+=lightCone(315,96,260,860,700,'rgba(200,240,235,.06)',1);
        s+=`<rect x="1140" y="88" width="270" height="18" rx="4" fill="#cfe8e4" opacity=".72" class="flick"/>`;
        s+=glow(1275,108,150,'rgba(200,240,235,.36)',.45,'flick');
        /* 服务台 */
        s+=`<rect x="560" y="262" width="440" height="230" fill="#0b1114"/>`;
        s+=windows(R,570,272,420,210,6,3,'rgba(180,235,230,.4)','#0a1013');
        s+=`<rect x="640" y="182" width="330" height="66" rx="6" fill="#0a1013" stroke="rgba(159,232,184,.32)"/>`;
        s+=`<text x="805" y="224" text-anchor="middle" font-size="30" letter-spacing="12" fill="#9fe8b8" opacity=".8">圣愈医院</text>`;
        /* 柱列 */
        [140,420,1060,1340].forEach(x=>{ s+=`<rect x="${x}" y="70" width="64" height="650" fill="#0a1114"/>`+
          `<rect x="${x}" y="70" width="11" height="650" fill="rgba(255,255,255,.05)"/>`+
          `<rect x="${x+53}" y="70" width="11" height="650" fill="rgba(0,0,0,.4)"/>`+
          `<rect x="${x-6}" y="70" width="76" height="10" fill="#0c1417"/><rect x="${x-6}" y="700" width="76" height="12" fill="#0c1417"/>`; });
        /* 指示屏 */
        s+=`<rect x="760" y="470" width="94" height="56" rx="4" fill="#0b1417" stroke="rgba(127,216,208,.4)"/>`;
        s+=`<rect x="768" y="478" width="78" height="40" fill="rgba(127,216,208,.18)" class="flick"/>`;
        s+=`<rect x="580" y="520" width="440" height="132" rx="10" fill="#090f12"/>`;
        s+=`<rect x="580" y="514" width="440" height="12" rx="4" fill="#0e1820"/>`;
        s+=`<rect x="580" y="514" width="440" height="3" fill="rgba(200,240,235,.14)"/>`;
        /* 候诊椅阵列(带接触阴影) */
        for(let i=0;i<5;i++){ const x=140+i*92; s+=`<rect x="${x}" y="642" width="72" height="18" rx="6" fill="#0a1013"/><rect x="${x+4}" y="660" width="8" height="42" fill="#0a1013"/><rect x="${x+60}" y="660" width="8" height="42" fill="#0a1013"/>`; }
        for(let i=0;i<3;i++){ const x=940+i*182; s+=contact(x+75,700,80,.5)+`<rect x="${x}" y="620" width="152" height="22" rx="9" fill="rgba(201,210,212,.32)"/><rect x="${x+10}" y="642" width="10" height="58" fill="#090e11"/><rect x="${x+132}" y="642" width="10" height="58" fill="#090e11"/>`; }
        s+=hazeBand(240,300,'#a9c6cb',.14,'svgFog2');
        s+=paved(R,700,'#080d10','#a9c6cb');
        s+=debris(R,760,'#090e11',30,80);
        s+=midLift('#8494a6')+nearFrame('#060a0d');
        return s;
      }
    },
    /* 三楼住院部 */
    ward:{
      p:'dust', theme:'ward',
      draw(R){
        const o=TH.ward;
        let s=sky(o);
        /* 走廊透视:两侧墙 + 天花 + 地面 */
        s+=`<polygon points="0,0 520,140 520,760 0,900" fill="#11181d"/>`;
        s+=wallPanels(R,0,540,120,880,'#131a1f','#070c10','#c6d6dc',80);
        s+=`<polygon points="1600,0 1080,140 1080,760 1600,900" fill="#0f1419"/>`;
        s+=wallPanels(R,1060,1600,120,880,'#11171c','#070b0f','#c6d6dc',80);
        s+=`<rect x="520" y="140" width="560" height="620" fill="#0b1014"/>`;
        s+=`<polygon points="0,0 520,140 1080,140 1600,0" fill="#161d23"/>`;
        s+=`<polygon points="0,900 520,760 1080,760 1600,900" fill="#0a0e12"/>`;
        s+=`<rect x="520" y="140" width="560" height="8" fill="rgba(255,255,255,.05)"/>`;
        /* 尽头的窗与门 */
        s+=`<rect x="700" y="330" width="200" height="300" fill="#080c10" stroke="#161d23" stroke-width="6"/>`;
        s+=`<rect x="710" y="340" width="180" height="140" fill="rgba(160,230,210,.10)"/>`;
        s+=`<rect x="710" y="340" width="180" height="5" fill="rgba(200,245,230,.2)"/>`;
        s+=glow(800,400,150,'rgba(160,230,210,.34)',.5);
        s+=lightCone(800,340,220,700,860,'rgba(160,230,210,.06)',1);
        /* 病房门 + 门牌 07 */
        [620,860].forEach(x=>{ s+=`<rect x="${x}" y="200" width="112" height="424" fill="#0f151a" stroke="#161d23" stroke-width="3"/>`+
          `<rect x="${x}" y="200" width="112" height="5" fill="rgba(255,255,255,.06)"/>`+
          `<circle cx="${x+90}" cy="420" r="5" fill="#242c33"/>`; });
        s+=`<rect x="980" y="200" width="112" height="424" fill="#0f151a" stroke="#161d23" stroke-width="3"/>`;
        s+=`<text x="1036" y="260" text-anchor="middle" font-size="34" letter-spacing="4" fill="rgba(159,232,184,.85)">07</text>`;
        s+=`<rect x="1024" y="300" width="11" height="11" fill="rgba(255,177,92,.9)" class="flick"/>`;
        s+=glow(1030,305,60,'rgba(255,177,92,.5)',.5,'flick');
        s+=pieRow(R,1160,240);
        /* 病床 */
        s+=`<rect x="960" y="620" width="156" height="92" rx="8" fill="#0c1115"/><rect x="960" y="620" width="156" height="4" fill="rgba(200,240,230,.10)"/>`;
        s+=`<rect x="1000" y="578" width="62" height="48" rx="6" fill="#10161b"/><path d="M1030,578 l-14,-42 M1030,578 l0,-54 M1030,578 l17,-40" stroke="#181f25" stroke-width="5" fill="none"/>`;
        s+=`<rect x="300" y="120" width="210" height="14" rx="4" fill="#cfe8e4" opacity=".5" class="flick"/>`;
        s+=glow(405,128,150,'rgba(200,240,235,.3)',.4,'flick');
        s+=hazeBand(260,280,'#9fc0c6',.12,'svgFog2');
        s+=paved(R,760,'#080c10','#9fc0c6');
        s+=debris(R,800,'#090d11',26,70);
        s+=midLift('#8494a6')+nearFrame('#060a0e');
        return s;
      }
    },
    /* 地下实验室 */
    lab:{
      p:'sparkle', theme:'lab',
      draw(R){
        const o=TH.lab;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,700,'#0a1a18','#040d0c','#8fe8dc',130);
        s+=pipeRow(R,70,'#081413',60,90)+pipeRow(R,126,'#081413');
        [200,540,880,1220].forEach(x=>{ s+=`<rect x="${x}" y="24" width="18" height="140" fill="#081514"/><circle cx="${x+9}" cy="166" r="12" fill="#0c1a19"/>`+
          `<circle cx="${x+9}" cy="166" r="5" fill="rgba(120,240,220,.4)"/>`; });
        s+=`<rect x="0" y="60" width="${W}" height="18" fill="#071311"/><rect x="0" y="60" width="${W}" height="3" fill="rgba(160,255,235,.12)"/>`;
        /* 培养舱阵列 */
        s+=glassTank(220,700,110,380,'#3fe8c0',false);
        s+=glassTank(430,700,110,380,'#35d8c8',false);
        s+=glassTank(640,700,110,380,'#3fe8c0',false);
        s+=glassTank(900,720,130,420,'#66e8ff',true);
        s+=glow(900,500,200,'rgba(90,220,255,.42)',.6);
        s+=lightCone(900,320,200,760,880,'rgba(110,230,255,.07)',1);
        s+=glassTank(1160,700,110,380,'#35d8c8',false);
        s+=glassTank(1370,700,110,380,'#3fe8c0',false);
        s+=hazeBand(420,260,'#5fd8c4',.10,'svgFog2');
        s+=paved(R,700,'#06100f','#8fe8dc');
        /* 终端台与进度条 */
        s+=`<rect x="1180" y="700" width="330" height="94" rx="10" fill="#081413"/><rect x="1180" y="700" width="330" height="4" fill="rgba(150,255,235,.12)"/>`;
        s+=`<rect x="1230" y="654" width="150" height="46" rx="6" fill="#0a1717" stroke="rgba(120,200,255,.4)"/>`;
        s+=`<rect x="1240" y="664" width="130" height="26" fill="rgba(80,170,255,.20)" class="flick"/>`;
        s+=`<text x="1305" y="684" text-anchor="middle" font-size="15" letter-spacing="2" fill="rgba(160,215,255,.85)">91%</text>`;
        /* 蓝箱子 */
        s+=`<rect x="120" y="640" width="190" height="120" rx="10" fill="#173a86"/>`;
        s+=`<rect x="120" y="640" width="190" height="6" fill="rgba(190,220,255,.22)"/>`;
        s+=glow(215,700,150,'rgba(70,130,255,.55)',.6);
        s+=contact(215,764,110,.7);
        s+=`<rect x="120" y="640" width="190" height="120" rx="10" fill="none" stroke="rgba(140,180,255,.5)" stroke-width="3"/>`;
        s+=`<text x="215" y="712" text-anchor="middle" font-size="30" letter-spacing="10" fill="#cfe0ff" opacity=".92">青空</text>`;
        s+=debris(R,760,'#071312',24,66);
        s+=midLift('#8494a6')+nearFrame('#04100f');
        return s;
      }
    },
    /* 地下车库 */
    garage:{
      p:'dustlow', theme:'garage',
      draw(R){
        const o=TH.garage;
        let s=sky(o);
        s+=wallPanels(R,0,W,0,760,'#111b24','#05090d','#d2e4f2',150);
        s+=`<rect x="290" y="116" width="1020" height="560" fill="#141d26"/>`;
        /* 卷帘门(横向板条) */
        for(let y=132;y<500;y+=18) s+=`<rect x="300" y="${y}" width="1000" height="3" fill="#090e13" opacity=".7"/><rect x="300" y="${y+3}" width="1000" height="2" fill="rgba(210,230,245,.09)"/>`;
        s+=`<rect x="290" y="116" width="1020" height="8" fill="rgba(210,232,250,.16)"/>`;
        s+=`<rect x="290" y="486" width="1020" height="18" fill="#0d141a"/>`;
        s+=`<rect x="300" y="500" width="1000" height="180" fill="#0a1016"/>`;
        s+=`<rect x="300" y="500" width="1000" height="4" fill="rgba(200,225,245,.10)"/>`;
        /* 顶灯与管线:给暗顶补中调 */
        s+=pipeRow(R,120,'#0a1219',70,96);
        [520,800,1080].forEach(x=>{ s+=`<rect x="${x}" y="146" width="120" height="14" rx="4" fill="#0e171f"/>`+
          `<rect x="${x+8}" y="160" width="104" height="8" rx="3" fill="rgba(206,228,246,.40)"/>`;
          s+=glow(x+60,172,190,'rgba(200,225,245,.32)',.5); });
        /* 立柱(带受光边) */
        [420,1180].forEach(x=>{ s+=`<rect x="${x}" y="116" width="72" height="560" fill="#0e161e"/>`+
          `<rect x="${x}" y="116" width="14" height="560" fill="rgba(210,232,250,.10)"/>`+
          `<rect x="${x+62}" y="116" width="10" height="560" fill="rgba(0,0,0,.35)"/>`+
          hzStripe(x,640,72,24); });
        s+=`<polygon points="520,560 1080,560 1000,700 600,700" fill="rgba(150,190,220,.12)"/>`;
        s+=glow(800,560,200,'rgba(160,200,230,.34)',.55);
        s+=lightCone(800,510,320,820,900,'rgba(170,205,235,.06)',1);
        /* 地面 + 车位线 + 接触阴影 */
        s+=paved(R,690,'#080d12','#c8dcec');
        for(let i=0;i<6;i++){ const x=60+i*250; s+=`<rect x="${x}" y="${P2(726)}" width="6" height="${P2(150)}" fill="rgba(220,235,250,.16)" transform="rotate(${P2((R()-.5)*3)} ${x} 800)"/>`; }
        s+=pickup(480,782,1.25,'#0a0e12');
        /* 油桶与躺倒的机车 */
        s+=tankCyl(1220,780,90,140,'#0b1015')+tankCyl(1340,800,80,120,'#0b1015');
        s+=contact(1000,830,120,.6);
        s+=`<rect x="700" y="118" width="12" height="250" fill="#0b1016"/><path d="M700,120 q10,120 -6,240" stroke="#0b1016" stroke-width="6" fill="none"/>`;
        s+=pipeRow(R,180,'#080d12',120,150);
        s+=hazeBand(300,320,'#93aec4',.10,'svgFog2');
        s+=debris(R,780,'#070b0f',30,80);
        s+=midLift('#8494a6')+nearFrame('#04070a');
        return s;
      }
    },
    /* 黎明·轨道尽头 */
    dawn:{
      p:'ember', theme:'dawn',
      draw(R){
        const o=TH.dawn;
        let s=sky(o);
        for(let i=0;i<7;i++) s+=`<ellipse class="svgFog2" cx="${P2(R()*W)}" cy="${P2(80+R()*260)}" rx="${P2(220+R()*340)}" ry="${P2(24+R()*48)}" fill="#6b4250" opacity="${P2(.14+R()*.2)}" filter="url(#blur1)"/>`;
        s+=skyGlow(Object.assign({},o,{sunR:64}));
        s+=ruinRow(R,{y:600,color:'#553e5a',hMin:50,hMax:190,wMin:34,wMax:88,gap:16,deco:false,wire:false});
        s+=air(o,.48,430,610);
        s+=ruinRow(R,{y:660,color:'#2c1f38',hMin:70,hMax:250,wMin:46,wMax:116,gap:22,lit:'rgba(255,210,150,.4)'});
        s+=air(o,.34,540,680);
        /* 光柱(体积光) */
        s+=`<rect x="900" y="120" width="700" height="780" fill="rgba(225,228,232,.18)" filter="url(#blur1)" class="svgFog"/>`;
        s+=`<rect x="1080" y="60" width="560" height="840" fill="rgba(210,214,220,.12)" filter="url(#blur1)" class="svgFog2"/>`;
        s+=hazeBand(580,210,'#e8c39a',.20)+hazeBand(650,200,'#ffd9a8',.14,'svgFog2');
        /* 站台与轨道 */
        s+=paved(R,620,'#100c18','#f0b483');
        s+=rails(720);
        for(let x=60;x<900;x+=180){ s+=contact(x,780,22,.6)+`<rect x="${x}" y="560" width="15" height="220" fill="#0e0a15"/><rect x="${x}" y="560" width="3" height="220" fill="rgba(255,220,180,.10)"/>`; }
        /* 列车(近景) */
        s+=`<g fill="#141020"><rect x="1180" y="540" width="430" height="200" rx="16"/><rect x="1300" y="462" width="250" height="96" rx="16"/></g>`;
        s+=`<rect x="1320" y="486" width="90" height="44" rx="6" fill="rgba(255,220,170,.30)"/><rect x="1440" y="486" width="90" height="44" rx="6" fill="rgba(255,220,170,.22)"/>`;
        s+=glow(1245,588,110,'rgba(255,220,160,.9)',.9);
        s+=`<polygon points="1210,575 900,660 900,730 1210,615" fill="rgba(255,210,150,.22)"/>`;
        s+=lightCone(1245,540,220,760,880,'rgba(255,215,160,.10)',1);
        s+=figure(300,862,150,{c:'#0a0810'})+figure(380,870,120,{c:'#0a0810'})+figure(340,874,84,{c:'#0a0810'});
        s+=debris(R,760,'#100c18',32,84);
        s+=midLift('#8494a6')+nearFrame('#0b0713');
        return s;
      }
    },
    /* 终局 · 抽象 */
    fate:{
      p:'ash', theme:'fate',
      draw(R){
        const o=TH.fate;
        let s=sky(o);
        for(let i=0;i<90;i++) s+=`<circle cx="${P2(R()*W)}" cy="${P2(R()*600)}" r="${P2(R()*1.4+.3)}" fill="rgba(210,225,245,${P2(.1+R()*.45)})"/>`;
        s+=`<ellipse class="svgFog2" cx="${W*.5}" cy="260" rx="700" ry="180" fill="#1d2740" opacity=".18" filter="url(#blur1)"/>`;
        s+=glow(800,620,240,'rgba(255,170,90,.34)',.5,'flick');
        s+=`<rect x="0" y="560" width="${W}" height="3" fill="rgba(200,215,235,.12)"/>`;
        s+=`<rect x="0" y="562" width="${W}" height="70" fill="rgba(210,224,244,.05)" filter="url(#blur1)"/>`;
        s+=hazeBand(560,120,'#93a3bb',.14)+hazeBand(640,200,'#b7c6de',.09,'svgFog2');
        s+=paved(R,600,'#05080d','#93a3bb');
        s+=fog(380,320,'rgba(140,160,190,.06)',.6);
        s+=midLift('#8494a6')+nearFrame('#03060a');
        return s;
      }
    }
  };

  /* 容器形状:站台木箱(内联小零件) */
  function crate(R,x,y){
    let s=contact(x+34,y+58,40,.6);
    s+=`<rect x="${x}" y="${y}" width="200" height="72" rx="6" fill="#0c1319"/>`;
    s+=`<rect x="${x}" y="${y}" width="200" height="4" fill="rgba(255,255,255,.07)"/>`;
    for(let i=0;i<3;i++) s+=`<rect x="${x+12+i*62}" y="${y+8}" width="48" height="56" rx="3" fill="#080e13"/>`;
    return s;
  }
  /* 墙上的配电箱/管线小物件 */
  function pieRow(R,x,y){
    let s=`<rect x="${x}" y="${y}" width="66" height="92" rx="6" fill="#0b1216" stroke="#141c22" stroke-width="3"/>`;
    s+=`<rect x="${x+7}" y="${y+8}" width="52" height="30" rx="3" fill="#080d11"/>`;
    s+=`<circle cx="${x+14}" cy="${y+62}" r="4" fill="rgba(255,90,70,.7)" class="flick"/><circle cx="${x+30}" cy="${y+62}" r="4" fill="rgba(150,220,180,.6)"/>`;
    s+=`<path d="M${x+66},${y+20} q40,10 60,44" stroke="#0a1116" stroke-width="4" fill="none"/>`;
    return s;
  }

  /* ---------------- 渲染 ---------------- */
  function render(sceneKey, seedStr){
    const sc = SCENES[sceneKey] || SCENES.fate;
    const th = TH[sc.theme||'fate'] || TH.fate;
    const R = rng(hash((seedStr||'x')+'|'+sceneKey));
    const defs = `<defs>`+
      dsky(th)+
      `<radialGradient id="skyGlow" cx="0.5" cy="1"><stop offset="0" stop-color="${th.glow}" stop-opacity="${P2(th.glowOp*.8)}"/>`+
      `<stop offset=".5" stop-color="${th.glow}" stop-opacity="${P2(th.glowOp*.26)}"/><stop offset="1" stop-color="${th.glow}" stop-opacity="0"/></radialGradient>`+
      dglow2('sunG',0,0,th.glow,.95)+dglow2('moonG',0,0,'#e8f0ff',.85)+
      dlin('gnd',th.ground,th.building)+dlin('wall',th.mid,th.building)+
      `<linearGradient id="rainG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8d8e6" stop-opacity=".05"/><stop offset="1" stop-color="#c8d8e6" stop-opacity=".01"/></linearGradient>`+
      dvig('vigR',th.building)+
      `</defs>`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">`+
      defs+DEFS+sc.draw(R)+`</svg>`;
    return { svg, particles: sc.p, theme: sc.theme||'fate', th };
  }
  return { render, THEMES: TH, SCENES };
})();
/*==END-ART==*/
