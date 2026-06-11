// Agent HQ redesign — 5 standalone mockups, generated from one source so the
// shared design-system CSS stays identical across them.
//   node gen.mjs   →  writes ../agent-hq-1-mission-control.html … -5-analyst.html
// Tokens + component rules are lifted 1:1 from src/app/themes/admin-v3/index.css
// (the real av3 dark theme); fonts are the same Inter / Fraunces / JetBrains Mono.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));

/* ----------------------------- shared tokens + components (av3) ----------------------------- */
const BASE = `
:root{
  --av3-bg:#0a0a0c; --av3-s1:#141417; --av3-s2:#1b1b1f; --av3-s3:#24242a; --av3-hover:#2c2c33;
  --av3-line:rgba(255,255,255,.07); --av3-line-strong:rgba(255,255,255,.13);
  --av3-fg:#f4f3f1; --av3-muted:#a6a099; --av3-subtle:#8a837b;
  --av3-brand:#c2384f; --av3-brand-soft:color-mix(in oklab,var(--av3-brand) 18%,var(--av3-s1));
  --av3-brand-line:color-mix(in oklab,var(--av3-brand) 42%,transparent); --av3-platinum:#cbb48a;
  --av3-ok:#34b27b; --av3-warn:#e0a93f; --av3-bad:#e8554f; --av3-info:#5f9bd6;
  --av3-ok-soft:color-mix(in oklab,var(--av3-ok) 16%,var(--av3-s1));
  --av3-warn-soft:color-mix(in oklab,var(--av3-warn) 16%,var(--av3-s1));
  --av3-bad-soft:color-mix(in oklab,var(--av3-bad) 16%,var(--av3-s1));
  --av3-info-soft:color-mix(in oklab,var(--av3-info) 16%,var(--av3-s1));
  --av3-brand-soft2:color-mix(in oklab,var(--av3-brand) 12%,var(--av3-s1));
  --av3-c1:#c2384f; --av3-c2:#cbb48a; --av3-c3:#5f9bd6; --av3-c4:#34b27b;
  --av3-c5:#d3884f; --av3-c6:#9b7ec0; --av3-c7:#e08aa2; --av3-c8:#80ac6e;
  --av3-r-sm:5px; --av3-r-md:8px; --av3-r-lg:11px; --av3-r-pill:999px;
  --av3-ui:"Inter",system-ui,sans-serif; --av3-display:"Fraunces",Georgia,serif;
  --av3-mono:"JetBrains Mono",ui-monospace,monospace;
  --av3-sh-2:0 8px 28px -8px rgba(0,0,0,.55);
}
*{box-sizing:border-box}
body{margin:0;background:var(--av3-bg);color:var(--av3-fg);font-family:var(--av3-ui);
  -webkit-font-smoothing:antialiased;padding:22px clamp(14px,3vw,40px) 60px;}
h1{font-family:var(--av3-display);font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0}
a{color:inherit}
.note{font-size:11.5px;color:var(--av3-subtle);background:var(--av3-s2);border:1px dashed var(--av3-line-strong);
  border-radius:var(--av3-r-md);padding:8px 12px;margin-bottom:16px}
.note b{color:var(--av3-platinum)}
.head{display:flex;align-items:center;gap:11px;margin-bottom:6px}
.glyph{width:34px;height:34px;border-radius:var(--av3-r-md);display:grid;place-items:center;
  background:var(--av3-brand-soft);color:var(--av3-brand);font-family:var(--av3-display);font-weight:600}
.sub{font-size:12.5px;color:var(--av3-muted)}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--av3-subtle);font-weight:600;margin:22px 2px 10px}
.eyebrow.platinum{color:var(--av3-platinum);font-weight:700}
.eyebrow:first-child{margin-top:0}

.card{background:var(--av3-s1);border:1px solid var(--av3-line);border-radius:var(--av3-r-lg)}
.card.pad{padding:14px}
.chead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:13px 14px;border-bottom:1px solid var(--av3-line)}
.ctitle{font-size:13px;font-weight:600}
.cdesc{font-size:11.5px;color:var(--av3-muted);margin-top:1px}
.cbody{padding:14px}

.chips{display:inline-flex;gap:2px;padding:2px;background:var(--av3-s2);border:1px solid var(--av3-line);border-radius:var(--av3-r-md);flex-wrap:wrap}
.chip{appearance:none;border:0;background:none;color:var(--av3-muted);font:inherit;font-size:12px;font-weight:500;
  padding:5px 11px;border-radius:6px;cursor:pointer}
.chip:hover{color:var(--av3-fg)}
.chip.on{background:var(--av3-s3);color:var(--av3-fg);box-shadow:inset 0 0 0 1px var(--av3-line-strong)}

.btn{appearance:none;font:inherit;font-size:12px;font-weight:500;height:30px;padding:0 11px;border-radius:var(--av3-r-md);
  border:1px solid var(--av3-line-strong);background:var(--av3-s2);color:var(--av3-fg);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn:hover{background:var(--av3-s3)}
.btn.pri{background:var(--av3-brand);border-color:var(--av3-brand);color:#fff}
.btn.ghost{background:transparent;border-color:transparent;color:var(--av3-muted)}
.btn.sm{height:26px;padding:0 9px;font-size:11.5px}

.badge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:var(--av3-r-pill);background:var(--av3-s3);color:var(--av3-muted)}
.badge.ok{background:var(--av3-ok-soft);color:var(--av3-ok)}
.badge.warn{background:var(--av3-warn-soft);color:var(--av3-warn)}
.badge.bad{background:var(--av3-bad-soft);color:color-mix(in oklab,var(--av3-bad) 80%,var(--av3-fg))}
.badge.info{background:var(--av3-info-soft);color:var(--av3-info)}
.badge.brand{background:var(--av3-brand-soft);color:color-mix(in oklab,var(--av3-brand) 70%,var(--av3-fg))}

.dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;display:inline-block}
.dot.g{background:var(--av3-ok)} .dot.y{background:var(--av3-warn)} .dot.r{background:var(--av3-bad)}
.dot.n{background:transparent;border:1.5px solid var(--av3-subtle)}

.mono{display:inline-flex;align-items:center;justify-content:center;border-radius:var(--av3-r-md);flex:0 0 auto;
  font-family:var(--av3-mono);font-weight:700;letter-spacing:.2px}

.kpi{position:relative;background:var(--av3-s1);border:1px solid var(--av3-line);border-radius:var(--av3-r-lg);
  padding:13px 14px 12px;overflow:hidden;transition:transform .12s ease,border-color .12s ease}
.kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--kpiac,var(--av3-subtle))}
.kpi:hover{transform:translateY(-1px);border-color:var(--av3-line-strong)}
.kpi .l{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.4px}
.kpi .v{font-family:var(--av3-mono);font-size:23px;font-weight:500;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.05;margin:9px 0 5px}
.kpi .f{font-size:11px;color:var(--av3-subtle)}
.rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}

.row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;
  padding:8px 9px;border:0;background:none;border-radius:var(--av3-r-sm);color:var(--av3-fg);font:inherit;font-size:13px;cursor:pointer}
.row:hover{background:var(--av3-hover)} .row.on{background:var(--av3-s3)}
.muted{color:var(--av3-subtle)} .mut{color:var(--av3-muted)}
.barwrap{height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden}
.barwrap>span{display:block;height:100%}
input,select,textarea{font-family:var(--av3-ui)}
.inp{width:100%;background:var(--av3-s2);border:1px solid var(--av3-line);color:var(--av3-fg);border-radius:var(--av3-r-md);padding:8px 10px;font-size:12.5px}
`;

/* ----------------------------- data ----------------------------- */
const AC = { ceo:"--av3-c4", coo:"--av3-c3", cfo:"--av3-ok", cmo:"--av3-c5", frontend:"--av3-c1", database:"--av3-c2", uxui:"--av3-c6", market:"--av3-c7", security:"--av3-c8" };
const AGENTS = [
  { id:"ceo", name:"CEO", role:"Strategy & vision", ini:"EO", status:"active", auth:"operator", model:"opus-4-8", runs:14, cost:"8.40", sr:96, reports:null, st:"y",
    kpis:[["Goal attainment","% of admin objectives met on time","87%"],["Revenue growth MoM","SSSG vs prior 30d","+6.2%"],["Decision quality","downstream outcomes of arbitrations","—"]] },
  { id:"coo", name:"COO", role:"Operations", ini:"OO", status:"active", auth:"operator", model:"global", runs:11, cost:"5.10", sr:91, reports:"ceo", st:"y",
    kpis:[["Labour cost %","25–30% healthy","31.4%"],["Refund rate","< 3%","3.8%"],["Waste / service","minimise","—"]] },
  { id:"cfo", name:"CFO", role:"Finance", ini:"FO", status:"active", auth:"operator", model:"opus-4-8", runs:18, cost:"13.20", sr:88, reports:"ceo", st:"r",
    kpis:[["Food cost %","28–32% healthy","36.1%"],["Prime cost %","< 60%","67.5%"],["Average ticket","price/mix-led","58.40 zł"]] },
  { id:"cmo", name:"CMO", role:"Marketing", ini:"MO", status:"active", auth:"operator", model:"global", runs:9, cost:"4.30", sr:100, reports:"ceo", st:"g",
    kpis:[["Satisfaction","mean rating","4.6 / 5"],["Repeat rate","retention","41%"],["Campaign lift","incremental revenue","—"]] },
  { id:"frontend", name:"Frontend Dev", role:"Ordering UX", ini:"FE", status:"active", auth:"observer", model:"global", runs:3, cost:"0.80", sr:100, reports:"cmo", st:"n",
    kpis:[["Checkout conversion","raise","—"],["Mobile drop-off","reduce","—"]] },
  { id:"database", name:"Database Optimizer", role:"Data & perf", ini:"DB", status:"paused", auth:"observer", model:"gemini-2.5-pro", runs:0, cost:"0.00", sr:null, reports:"coo", st:"n",
    kpis:[["Report latency","< 500ms","—"],["Anomaly count","minimise","—"]] },
  { id:"uxui", name:"UX/UI Designer", role:"Design & research", ini:"UX", status:"active", auth:"observer", model:"global", runs:2, cost:"0.50", sr:100, reports:"cmo", st:"n",
    kpis:[["Journey completion","raise","—"],["UX sentiment","positive","—"]] },
  { id:"market", name:"Market Researcher", role:"Demand & competition", ini:"MKT", status:"active", auth:"observer", model:"global", runs:1, cost:"0.30", sr:100, reports:"cmo", st:"n",
    kpis:[["Segment sizing","opportunity","—"],["Positioning","competitive","—"]] },
  { id:"security", name:"CSO", role:"Security & compliance", ini:"CSO", status:"active", auth:"observer", model:"global", runs:1, cost:"0.20", sr:100, reports:"coo", st:"n",
    kpis:[["PII exposure","minimise","—"],["Audit coverage","100%","—"]] },
];
const byId = Object.fromEntries(AGENTS.map(a=>[a.id,a]));
const FLEET = [["Active agents","8","of 9","--av3-c4"],["Runs today","26","","--av3-c3"],["Success rate · 7d","93%","59 runs","--av3-ok"],["Cost · 7d","37.10 zł","","--av3-c5"],["Scheduled","4","on a cadence","--av3-c6"]];
const SALES = [["Today's sales","4 280 zł","Goal 5 000","y"],["Avg ticket","58.40 zł","price/mix-led","g"],["Revenue growth","+6.2%","SSSG 30d","g"],["Refund rate","3.8%","< 3%","r"]];
const COST = [["Food cost %","36.1%","28–32%","r"],["Labour %","31.4%","25–30%","y"],["Prime cost %","67.5%","< 60%","r"],["Satisfaction","4.6/5","mean","g"]];
const ACTIVITY = [["cfo","escalation","Food cost breached 36% — needs a repricing call","14:21"],["cfo","run","Chat turn — 0.42 zł","14:20"],["cmo","approval","Decision executed: Tue espresso 2-for-1","yest"],["coo","run","Daily briefing contribution","08:01"],["security","schedule","Weekly self-review","Mon"]];
const APPROVALS = [["cfo","Reprice Margherita +2 zł","update_item_price"],["coo","86 burrata until delivery","mark_item_86"],["cmo","SMS lapsed cohort a Tue offer","send_sms"]];
const WORK = { backlog:[["Draft Q3 menu thesis","ceo"]], queued:[["Re-cost the pizza line","cfo"],["Tue daypart campaign","cmo"]], running:[["Roster fix for Fri push","coo"]], done:[["Audit refund spikes","coo"],["Loyalty cohort read","cmo"]] };
const DAYS = [4,7,9,6,11,8,14];

/* ----------------------------- helpers ----------------------------- */
const mono = (a,s=30)=>`<span class="mono" style="width:${s}px;height:${s}px;font-size:${s<=26?10:11}px;background:color-mix(in oklab,var(${AC[a.id]}) 16%,transparent);color:var(${AC[a.id]})">${a.ini}</span>`;
const sbadge = a=>`<span class="badge ${a.status==="active"?"ok":a.status==="paused"?"warn":""}">${a.status}</span>`;
const kpiTile = (l,v,f,st)=>`<div class="kpi" style="--kpiac:var(${st==="g"?"--av3-ok":st==="y"?"--av3-warn":st==="r"?"--av3-bad":"--av3-subtle"})"><div class="l"><span class="dot ${st}"></span>${l}</div><div class="v">${v}</div><div class="f">${f}</div></div>`;
const stat = (l,v,f,ac)=>`<div class="kpi" style="--kpiac:var(${ac})"><div class="l">${l}</div><div class="v">${v}</div>${f?`<div class="f">${f}</div>`:""}</div>`;
const srbar = sr=>`<div class="barwrap" style="margin-top:7px"><span style="width:${sr??0}%;background:${sr==null?"transparent":sr>=90?"var(--av3-ok)":sr>=70?"var(--av3-warn)":"var(--av3-bad)"}"></span></div>`;

function shell(title, dir, body, extraCss=""){
  return `<!doctype html><html lang="en" data-admin-theme="dark"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Agent HQ — ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${BASE}${extraCss}</style></head>
<body class="av3-root">
<div class="note">Agent HQ redesign — <b>${title}</b>. ${dir} · real av3 tokens + fonts (dark theme). Static mockup; data illustrative.</div>
<div class="head"><span class="glyph">HQ</span><div><h1>Agent HQ</h1><div class="sub">AI agent fleet · All locations</div></div>
<div style="margin-left:auto" class="chips">${["Command","Agents","Scorecards","Work","Approvals","Inbox","Reports","Settings"].map((s,i)=>`<button class="chip ${i===0?"on":""}">${s}</button>`).join("")}</div></div>
${body}
</body></html>`;
}
const orgTree = (onclickless=true)=>{
  const kids = p=>AGENTS.filter(a=>a.reports===p);
  const r=(a,d)=>`<div><div class="row" style="margin-left:${d*18}px">${d>0?'<span class="muted" style="margin-right:2px">↳</span>':""}<span style="display:flex;align-items:center;gap:8px;min-width:0">${mono(a,22)}<b style="font-size:12.5px">${a.name}</b><span class="muted" style="font-size:11px">${a.role}</span></span><span class="dot ${a.st}"></span></div>${kids(a.id).map(k=>r(k,d+1)).join("")}</div>`;
  return kids(null).map(a=>r(a,0)).join("");
};
const activityFeed = (n=5)=>ACTIVITY.slice(0,n).map((e,i)=>`<div style="display:flex;gap:9px;padding:8px 0;${i<n-1?"border-bottom:1px solid var(--av3-line)":""}"><span class="badge ${e[1]==="escalation"?"bad":e[1]==="run"?"info":e[1]==="approval"?"warn":"ok"}">${e[1]}</span><div style="flex:1;min-width:0"><div style="font-size:12px"><b>${byId[e[0]].name}</b> — ${e[2]}</div><div class="muted" style="font-size:10.5px;font-family:var(--av3-mono)">${e[3]}</div></div></div>`).join("");
const approvalsList = ()=>APPROVALS.map((a,i)=>`<div style="display:flex;gap:10px;padding:10px 0;${i<APPROVALS.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start">${mono(byId[a[0]],26)}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600">${a[1]}</div><div class="muted" style="font-size:10.5px;font-family:var(--av3-mono);margin-top:2px">${a[2]} · ${byId[a[0]].name}</div></div><button class="btn pri sm">Action ›</button></div>`).join("");
const activityChart = ()=>{const m=Math.max(...DAYS);const lab=["6d","5d","4d","3d","2d","1d","Today"];return `<div style="display:flex;align-items:flex-end;gap:8px;height:90px">${DAYS.map((n,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px"><span class="muted" style="font-size:10px;font-family:var(--av3-mono)">${n}</span><div style="width:100%;height:${Math.max(4,n/m*64)}px;border-radius:5px 5px 0 0;background:${i===6?"var(--av3-brand)":"color-mix(in oklab,var(--av3-c3) 55%,transparent)"}"></div><span class="muted" style="font-size:9.5px">${lab[i]}</span></div>`).join("")}</div>`;};

/* ============================ 1. MISSION CONTROL ============================ */
const missionControl = shell("Mission Control",
  "A single-screen cockpit — agents always on the left, command in the centre, “needs you” on the right. No tab-hopping for the core loop.",
  `<div class="mc">
    <aside class="card pad" style="align-self:start">
      <div class="eyebrow" style="margin-top:0">Fleet</div>
      ${orgTree()}
      <div class="eyebrow">Scheduled</div>
      ${AGENTS.filter(a=>["ceo","coo","cfo","cmo"].includes(a.id)).map(a=>`<div class="row" style="cursor:default"><span style="display:flex;gap:8px;align-items:center">${mono(a,20)}<span style="font-size:12px">${a.name}</span></span><span class="badge ok">daily</span></div>`).join("")}
    </aside>
    <main>
      <div class="rail" style="grid-template-columns:repeat(5,1fr)">${FLEET.map(s=>stat(...s)).join("")}</div>
      <div class="eyebrow">Business signal</div>
      <div class="rail">${[...SALES,...COST].map(k=>kpiTile(...k)).join("")}</div>
      <div class="eyebrow">Activity · last 7 days</div>
      <div class="card pad">${activityChart()}</div>
    </main>
    <aside style="display:flex;flex-direction:column;gap:12px">
      <div class="card"><div class="chead"><div class="ctitle">Needs you</div><span class="badge bad">${APPROVALS.length}</span></div><div class="cbody" style="padding:6px 14px">${approvalsList()}</div></div>
      <div class="card"><div class="chead"><div class="ctitle">Escalations</div></div><div class="cbody" style="padding:6px 14px"><div style="display:flex;gap:9px;padding:8px 0;align-items:flex-start"><span style="color:var(--av3-warn)">⚠</span><div style="font-size:12px"><b>CFO</b> — Food cost breached 36% — needs a repricing call<div class="muted" style="font-size:10.5px;font-family:var(--av3-mono);margin-top:2px">high · 14:21</div></div></div></div></div>
      <div class="card"><div class="chead"><div class="ctitle">Recent</div></div><div class="cbody" style="padding:6px 14px">${activityFeed(4)}</div></div>
    </aside>
  </div>`,
  `.mc{display:grid;grid-template-columns:248px minmax(0,1fr) 320px;gap:14px;align-items:start}
   @media(max-width:1100px){.mc{grid-template-columns:1fr}}`);

/* ============================ 2. ORG GALAXY ============================ */
const orgGalaxy = shell("Org Chart First",
  "Hierarchy is the home. The reporting tree is the primary navigator; selecting a node opens its scorecard + charter beside it.",
  `<div class="og">
    <div class="card pad">
      <div class="eyebrow" style="margin-top:0">Reporting line</div>
      <div class="tree">
        ${(()=>{const node=a=>`<div class="tnode ${a.id==="cfo"?"sel":""}" style="border-color:color-mix(in oklab,var(${AC[a.id]}) 38%,var(--av3-line))">${mono(a,26)}<div style="min-width:0"><div style="font-size:12.5px;font-weight:600">${a.name}</div><div class="muted" style="font-size:10.5px">${a.role}</div></div><span class="dot ${a.st}" style="margin-left:auto"></span></div>`;
          const kids=p=>AGENTS.filter(a=>a.reports===p);
          const branch=a=>`<li>${node(a)}${kids(a.id).length?`<ul>${kids(a.id).map(branch).join("")}</ul>`:""}</li>`;
          return `<ul class="root">${kids(null).map(branch).join("")}</ul>`;})()}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card"><div class="chead"><div style="display:flex;align-items:center;gap:9px">${mono(byId.cfo,30)}<div><div class="ctitle" style="font-size:15px">CFO</div><div class="cdesc">Financial Guardian · reports to CEO</div></div></div><span class="badge brand">operator</span></div>
        <div class="cbody">
          <div style="display:flex;justify-content:space-between;font-size:11px" class="muted"><span style="text-transform:uppercase;letter-spacing:.5px">Success rate · 7d</span><span style="color:var(--av3-fg)">88%</span></div>${srbar(88)}
          <div class="rail" style="grid-template-columns:repeat(3,1fr);margin-top:14px">${stat("Runs 7d","18","","--av3-c3")}${stat("Cost 7d","13.20 zł","","--av3-c5")}${stat("Last run","2h ago","","--av3-c2")}</div>
          <div class="eyebrow platinum">KPIs — target vs actual</div>
          ${byId.cfo.kpis.map(k=>`<div style="padding:9px 0;border-top:1px solid var(--av3-line)"><div style="font-size:13px;font-weight:600">${k[0]} <span class="muted" style="font-weight:400">· target ${k[1]}</span></div><div style="font-size:12px;margin-top:3px" class="${k[2]==="—"?"muted":""}">${k[2]==="—"?"no actual logged":`actual: <span style="font-family:var(--av3-mono)">${k[2]}</span>`}</div></div>`).join("")}
        </div></div>
      <div class="card"><div class="chead"><div class="ctitle">Charter</div><button class="btn ghost sm">✎ Edit</button></div><div class="cbody" style="font-size:12.5px;line-height:1.55"><div class="muted" style="text-transform:uppercase;font-size:10.5px;letter-spacing:.5px;margin-bottom:3px">Mandate</div>Guard the margin — translate operations into money and money into decisions, and never accept a headline number without the ratio behind it.</div></div>
    </div>
  </div>`,
  `.og{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
   @media(max-width:1000px){.og{grid-template-columns:1fr}}
   .tree ul{list-style:none;margin:0;padding-left:18px;position:relative}
   .tree ul.root{padding-left:0}
   .tree li{position:relative;padding:5px 0}
   .tree ul:not(.root)>li::before{content:"";position:absolute;left:-10px;top:18px;width:10px;height:1px;background:var(--av3-line-strong)}
   .tree ul:not(.root)::before{content:"";position:absolute;left:0;top:-6px;bottom:14px;width:1px;background:var(--av3-line-strong)}
   .tnode{display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--av3-s2);border:1px solid var(--av3-line);border-radius:var(--av3-r-md)}
   .tnode.sel{box-shadow:inset 0 0 0 1px var(--av3-brand-line);background:var(--av3-brand-soft2)}`);

/* ============================ 3. PIPELINE ============================ */
const pipeline = shell("Workflow Pipeline",
  "Operations-first. The fleet is a pipeline — Backlog → Queued → Running → Review → Done — with agents as assignees. Approvals are a column, not a tab.",
  `<div class="rail" style="grid-template-columns:repeat(5,1fr);margin-bottom:6px">${FLEET.map(s=>stat(...s)).join("")}</div>
   <div class="eyebrow">Assignees</div>
   <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px">${AGENTS.filter(a=>a.status==="active").map(a=>`<span style="display:inline-flex;gap:7px;align-items:center;padding:5px 10px;background:var(--av3-s1);border:1px solid var(--av3-line);border-radius:var(--av3-r-pill)">${mono(a,20)}<span style="font-size:12px;font-weight:600">${a.name}</span></span>`).join("")}</div>
   <div class="pipe">
     ${[["Backlog",WORK.backlog,"n"],["Queued",WORK.queued,"info"],["Running",WORK.running,"warn"],["Review",APPROVALS.map(a=>[a[1],a[0]]),"brand"],["Done",WORK.done,"ok"]].map(([title,items,tone])=>`
       <div class="col"><div class="colhead"><span style="font-size:12px;font-weight:600">${title}</span><span class="badge ${tone}">${items.length}</span></div>
       ${items.map(it=>`<div class="card pad" style="padding:11px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="font-size:12.5px;font-weight:600">${it[0]}</div>${it[1]?mono(byId[it[1]],22):""}</div>${title==="Review"?`<div class="muted" style="font-size:10.5px;font-family:var(--av3-mono);margin-top:7px">gated action</div><button class="btn pri sm" style="margin-top:8px">Approve ›</button>`:title==="Running"?`<div class="barwrap" style="margin-top:9px"><span style="width:60%;background:var(--av3-warn)"></span></div>`:title==="Queued"?`<button class="btn sm" style="margin-top:8px">▶ Run</button>`:""}</div>`).join("")}
       </div>`).join("")}
   </div>`,
  `.pipe{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;align-items:start;margin-top:6px}
   @media(max-width:1100px){.pipe{grid-template-columns:repeat(2,1fr)}}
   .col{background:var(--av3-s1);border:1px solid var(--av3-line);border-radius:var(--av3-r-lg);padding:11px}
   .colhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}`);

/* ============================ 4. ROSTER GALLERY ============================ */
const rosterGallery = shell("Card Gallery",
  "People-first directory. Big agent cards as the home — each a mini-scorecard with a success ring + quick actions; click expands to the full panel.",
  `<div class="rail" style="grid-template-columns:repeat(5,1fr);margin-bottom:6px">${FLEET.map(s=>stat(...s)).join("")}</div>
   <div class="eyebrow">Agents</div>
   <div class="gallery">
   ${AGENTS.map(a=>{const ring=a.sr??0;return `<div class="card pad gcard">
     <div style="display:flex;gap:11px;align-items:flex-start">
       ${mono(a,40)}
       <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><b style="font-size:14px">${a.name}</b>${sbadge(a)}</div><div class="muted" style="font-size:11.5px;font-family:var(--av3-mono);margin-top:1px">${a.role} · ${a.model}</div></div>
       <div class="ring" style="background:conic-gradient(${ring>=90?"var(--av3-ok)":ring>=70?"var(--av3-warn)":"var(--av3-bad)"} ${ring*3.6}deg, var(--av3-s3) 0)"><span>${a.sr==null?"—":a.sr+"%"}</span></div>
     </div>
     <div class="rail" style="grid-template-columns:1fr 1fr;margin-top:12px">${stat("Runs 7d",String(a.runs),"","--av3-c3")}${stat("Cost 7d",a.cost+" zł","","--av3-c5")}</div>
     <div class="eyebrow platinum" style="margin:14px 0 7px">KPIs</div>
     ${a.kpis.slice(0,2).map(k=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0"><span class="mut">${k[0]}</span><span style="font-family:var(--av3-mono);color:${k[2]==="—"?"var(--av3-subtle)":"var(--av3-fg)"}">${k[2]}</span></div>`).join("")}
     <div style="display:flex;gap:7px;margin-top:11px"><button class="btn pri sm">Chat</button><button class="btn ghost sm">✎ Edit</button><span class="badge" style="margin-left:auto">${a.auth}</span></div>
   </div>`;}).join("")}
   </div>`,
  `.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
   .gcard{transition:transform .12s ease,border-color .12s ease} .gcard:hover{transform:translateY(-2px);border-color:var(--av3-line-strong)}
   .ring{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
   .ring>span{width:34px;height:34px;border-radius:50%;background:var(--av3-s1);display:grid;place-items:center;font-size:11px;font-weight:700;font-family:var(--av3-mono)}`);

/* ============================ 5. ANALYST ============================ */
const analyst = shell("Analyst Dashboard",
  "An exec / reporting view. Trends first — success-rate + cost over time, a KPI traffic-light grid, big spend headline — with a live feed sidebar.",
  `<div class="an">
    <main>
      <div class="rail" style="grid-template-columns:repeat(3,1fr)">
        <div class="card pad"><div class="kpi-l">Monthly AI cost</div><div style="font-family:var(--av3-display);font-size:34px;font-weight:600;letter-spacing:-.01em">214.80 zł</div><div class="muted" style="font-size:11.5px;margin-top:4px">7-day 37.10 zł · 59 runs</div></div>
        <div class="card pad"><div class="kpi-l">Fleet success · 7d</div><div style="display:flex;align-items:center;gap:14px;margin-top:6px"><div class="gauge" style="background:conic-gradient(var(--av3-ok) 335deg,var(--av3-s3) 0)"><span>93%</span></div><div class="muted" style="font-size:12px">55 ok<br>4 failed</div></div></div>
        <div class="card pad"><div class="kpi-l">Active / scheduled</div><div style="font-family:var(--av3-display);font-size:34px;font-weight:600">8<span class="muted" style="font-size:16px"> / 9</span></div><div class="muted" style="font-size:11.5px;margin-top:4px">4 on a daily cadence</div></div>
      </div>
      <div class="eyebrow">Runs · last 7 days</div>
      <div class="card pad">${activityChart()}</div>
      <div class="eyebrow">Cost by agent · 7d</div>
      <div class="card pad">${AGENTS.filter(a=>+a.cost>0).sort((a,b)=>+b.cost-+a.cost).map(a=>{const w=(+a.cost/13.2*100);return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0"><span style="width:120px;font-size:12px;display:flex;gap:7px;align-items:center">${mono(a,18)}${a.name}</span><div class="barwrap" style="flex:1"><span style="width:${w}%;background:var(${AC[a.id]})"></span></div><span style="width:60px;text-align:right;font-family:var(--av3-mono);font-size:11.5px">${a.cost} zł</span></div>`;}).join("")}</div>
      <div class="eyebrow">KPI board — target vs actual</div>
      <div class="rail">${[...SALES,...COST].map(k=>kpiTile(...k)).join("")}</div>
    </main>
    <aside style="display:flex;flex-direction:column;gap:12px">
      <div class="card"><div class="chead"><div class="ctitle">Inbox</div><span class="badge bad">1</span></div><div class="cbody" style="padding:6px 14px"><div style="display:flex;gap:9px;padding:8px 0;align-items:flex-start"><span style="color:var(--av3-warn)">⚠</span><div style="font-size:12px"><b>CFO</b> — escalation: repricing call needed<div class="muted" style="font-size:10.5px;font-family:var(--av3-mono);margin-top:2px">14:21</div></div></div></div></div>
      <div class="card"><div class="chead"><div class="ctitle">Approvals</div><span class="badge warn">${APPROVALS.length}</span></div><div class="cbody" style="padding:6px 14px">${approvalsList()}</div></div>
      <div class="card"><div class="chead"><div class="ctitle">Reports</div><button class="btn ghost sm">CSV · PDF</button></div><div class="cbody"><div class="row" style="cursor:default"><span style="font-size:12.5px">Daily briefing · 11 Jun</span><span class="badge">4 decisions</span></div><div class="row" style="cursor:default"><span style="font-size:12.5px">Weekly review · 9 Jun</span><span class="badge">5 decisions</span></div></div></div>
    </aside>
  </div>`,
  `.an{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
   @media(max-width:1050px){.an{grid-template-columns:1fr}}
   .kpi-l{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600;margin-bottom:8px}
   .gauge{width:62px;height:62px;border-radius:50%;display:grid;place-items:center}
   .gauge>span{width:46px;height:46px;border-radius:50%;background:var(--av3-s1);display:grid;place-items:center;font-family:var(--av3-mono);font-weight:700;font-size:13px}`);

/* ----------------------------- write ----------------------------- */
const files = {
  "agent-hq-1-mission-control.html": missionControl,
  "agent-hq-2-org-first.html": orgGalaxy,
  "agent-hq-3-pipeline.html": pipeline,
  "agent-hq-4-card-gallery.html": rosterGallery,
  "agent-hq-5-analyst.html": analyst,
};
for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(OUT, "..", name), html);
  console.log("wrote", name);
}
