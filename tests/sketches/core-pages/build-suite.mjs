import fs from 'fs';
const dir = 'tests/sketches/core-pages';
const PAGES = [
  ['pos','POS','Line'],['kds','KDS','Line'],
  ['orders','Orders','⌘K'],
  ['svc-floor','Floor','Service'],['svc-slots','Slots','Service'],['svc-dispatch','Dispatch','Service'],
  ['g-inbox','Inbox','Guest'],['g-crm','CRM','Guest'],['g-loyalty','Loyalty','Guest'],['g-concierge','Concierge','Guest'],
  ['book','Book','⌘K'],
];
const FILES = {'pos':'01-pos.html','kds':'02-kds.html','orders':'03-orders.html','svc-floor':'04-service-floor.html','svc-slots':'05-service-slots.html','svc-dispatch':'06-service-dispatch.html','g-inbox':'07-guest-inbox.html','g-crm':'08-guest-crm.html','g-loyalty':'09-guest-loyalty.html','g-concierge':'10-guest-concierge.html','book':'11-book.html'};

function extract(html){
  const style = (html.match(/<style>([\s\S]*?)<\/style>/i)||[,''])[1];
  let body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)||[,''])[1];
  body = body.replace(/<script[\s\S]*?<\/script>/gi,'');
  return {style, body};
}
function prefixSel(s, scope){
  s=s.trim(); if(!s) return s;
  if(/^(:root|html|body)\b/.test(s)) return s.replace(/^(:root|html|body)/, scope);
  return scope+' '+s;
}
function walk(css, scope){
  let out=''; let i=0;
  while(i<css.length){
    const b=css.indexOf('{',i);
    if(b<0) break;
    const prelude=css.slice(i,b).trim();
    let depth=1,j=b+1;
    while(j<css.length&&depth>0){const c=css[j];if(c==='{')depth++;else if(c==='}')depth--;j++;}
    const inner=css.slice(b+1,j-1);
    if(prelude.startsWith('@')){
      if(/@(-webkit-)?keyframes/i.test(prelude)||/@font-face/i.test(prelude)) out+=prelude+'{'+inner+'}';
      else if(/@media|@supports/i.test(prelude)) out+=prelude+'{'+walk(inner,scope)+'}';
      // else drop (@import/@charset)
    } else {
      out+=prelude.split(',').map(s=>prefixSel(s,scope)).join(',')+'{'+inner+'}';
    }
    i=j;
  }
  return out;
}
function scopeCss(css, key){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const scope='#pg-'+key;
  // rename keyframes to avoid cross-page collisions
  const names=[]; let m; const re=/@(?:-webkit-)?keyframes\s+([A-Za-z0-9_-]+)/g;
  while((m=re.exec(css))) if(!names.includes(m[1])) names.push(m[1]);
  for(const nm of names){
    const rn=nm+'_'+key.replace(/[^a-z0-9]/gi,'');
    css=css.replace(new RegExp('(@(?:-webkit-)?keyframes\\s+)'+nm+'(?=[\\s{])','g'),(x,a)=>a+rn);
    // animation references: whole-word
    css=css.replace(new RegExp('(animation(?:-name)?\\s*:[^;}]*?[\\s:,])'+nm+'(?=[\\s,;}])','g'),(x,a)=>a+rn);
  }
  return walk(css, scope);
}

let styles='', sections='';
for(const [key,label,group] of PAGES){
  const {style,body}=extract(fs.readFileSync(`${dir}/${FILES[key]}`,'utf8'));
  styles+=`\n/* ===== ${key} ===== */\n`+scopeCss(style,key)+'\n';
  sections+=`<section class="pg" id="pg-${key}" data-key="${key}" aria-label="${label}">${body}</section>\n`;
}
let navHTML=''; let last=null;
for(const [key,label,group] of PAGES){ if(group!==last){navHTML+=`<span class="grp">${group}</span>`;last=group;} navHTML+=`<button class="pg-btn" data-key="${key}">${label}</button>`; }

const out=`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Core — Dense Glass Console · Suite (all pages)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..600&display=swap" rel="stylesheet">
<style>
:root{--mono:"JetBrains Mono",ui-monospace,monospace;--ui:"Inter",system-ui,sans-serif;--bg:#0a0806;--ink:#fbf6ee;--ink-2:#d9cbba;--ink-3:#9a8b79;--line:rgba(255,247,235,.14);--line-2:rgba(255,247,235,.24);--brand:#e86b3e;--brand-bright:#ff9463;--brand-wash:rgba(232,107,62,.18);--basil:#7dc464;--panel-2:rgba(255,255,255,.05);--panel-3:rgba(255,255,255,.11);}
*{box-sizing:border-box;}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ui);}
.suitebar{position:fixed;top:0;left:0;right:0;z-index:9000;height:46px;display:flex;align-items:center;gap:12px;padding:0 14px;background:linear-gradient(150deg,rgba(255,255,255,.08),rgba(255,255,255,.02)),rgba(10,8,6,.82);-webkit-backdrop-filter:blur(20px) saturate(160%);backdrop-filter:blur(20px) saturate(160%);border-bottom:1px solid var(--line-2);box-shadow:0 8px 30px -14px rgba(0,0,0,.85);font-family:var(--mono);}
.brand{font-size:12px;letter-spacing:.05em;color:var(--ink-3);white-space:nowrap;}
.brand b{color:var(--basil);font-weight:600;}.brand i{color:var(--brand-bright);font-style:normal;}
.snav{display:flex;align-items:center;gap:5px;overflow-x:auto;scrollbar-width:none;flex:1;}
.snav::-webkit-scrollbar{display:none;}
.grp{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink-3);padding:0 3px 0 10px;white-space:nowrap;opacity:.65;}
.pg-btn{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);white-space:nowrap;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:5px 11px;cursor:pointer;transition:.13s;}
.pg-btn:hover{background:var(--panel-3);color:var(--ink);}
.pg-btn.on{color:var(--ink);background:var(--brand-wash);border-color:rgba(232,107,62,.55);box-shadow:0 0 16px -5px var(--brand);}
.khint{font-family:var(--mono);font-size:10px;color:var(--ink-3);white-space:nowrap;}
.khint kbd{background:var(--panel-3);border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--ink-2);}
#stage{margin-top:46px;}
.pg{display:none;min-height:calc(100vh - 46px);position:relative;}
.pg.active{display:block;}
.pg .cmdbar{top:46px !important;}
${styles}
</style></head>
<body>
<div class="suitebar">
  <div class="brand"><b>core</b> &#10095; dense glass console</div>
  <div class="snav" id="snav">${navHTML}</div>
  <div class="khint">switch surface &middot; <kbd>&larr;</kbd><kbd>&rarr;</kbd></div>
</div>
<div id="stage">
${sections}
</div>
<script>
const KEYS=${JSON.stringify(PAGES.map(p=>p[0]))};
const snav=document.getElementById('snav');
let idx=0;
function show(i){
  idx=(i+KEYS.length)%KEYS.length;const key=KEYS[idx];
  document.querySelectorAll('.pg').forEach(s=>s.classList.toggle('active',s.dataset.key===key));
  snav.querySelectorAll('.pg-btn').forEach(b=>b.classList.toggle('on',b.dataset.key===key));
  const on=snav.querySelector('.pg-btn.on');if(on)on.scrollIntoView({inline:'center',block:'nearest'});
  window.scrollTo(0,0);
}
snav.addEventListener('click',e=>{const b=e.target.closest('.pg-btn');if(b)show(KEYS.indexOf(b.dataset.key));});
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(idx+1);else if(e.key==='ArrowLeft')show(idx-1);});
// generic lens-rail expand-on-click (works across all embedded pages)
document.addEventListener('click',e=>{const pin=e.target.closest('.pg .pin');if(pin){const l=pin.closest('.lens');if(l)l.classList.toggle('open');}});
show(0);
</script>
</body></html>`;
fs.writeFileSync('tests/sketches/core-dense-console-suite.html', out);
console.log('wrote suite', (out.length/1024|0)+'KB');
