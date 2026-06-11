// Agent HQ redesign — round 2. ONE standalone file, 5 more directions.
// This time the REAL admin-v3 stylesheet is embedded verbatim and the markup
// uses the real .av3-* classes, so it is pixel-faithful to the live app (not a
// reconstruction). Run:  node gen2.mjs  → writes ../agent-hq-redesign-v2.html
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const css = readFileSync(join(ROOT, "src/app/themes/admin-v3/index.css"), "utf8");

/* data */
const AC = { ceo:"--av3-c4", coo:"--av3-c3", cfo:"--av3-ok", cmo:"--av3-c5", frontend:"--av3-c1", database:"--av3-c2", uxui:"--av3-c6", market:"--av3-c7", security:"--av3-c8" };
const A = [
  { id:"ceo", name:"CEO", role:"Strategy & vision", ini:"EO", status:"active", auth:"operator", model:"opus-4-8", runs:14, cost:"8.40", sr:96, reports:null, st:"y" },
  { id:"coo", name:"COO", role:"Operations", ini:"OO", status:"active", auth:"operator", model:"global", runs:11, cost:"5.10", sr:91, reports:"ceo", st:"y" },
  { id:"cfo", name:"CFO", role:"Finance", ini:"FO", status:"active", auth:"operator", model:"opus-4-8", runs:18, cost:"13.20", sr:88, reports:"ceo", st:"r" },
  { id:"cmo", name:"CMO", role:"Marketing", ini:"MO", status:"active", auth:"operator", model:"global", runs:9, cost:"4.30", sr:100, reports:"ceo", st:"g" },
  { id:"frontend", name:"Frontend Dev", role:"Ordering UX", ini:"FE", status:"active", auth:"observer", model:"global", runs:3, cost:"0.80", sr:100, reports:"cmo", st:"n" },
  { id:"database", name:"Database Optimizer", role:"Data & perf", ini:"DB", status:"paused", auth:"observer", model:"gemini-2.5-pro", runs:0, cost:"0.00", sr:null, reports:"coo", st:"n" },
  { id:"uxui", name:"UX/UI Designer", role:"Design & research", ini:"UX", status:"active", auth:"observer", model:"global", runs:2, cost:"0.50", sr:100, reports:"cmo", st:"n" },
  { id:"market", name:"Market Researcher", role:"Demand & competition", ini:"MKT", status:"active", auth:"observer", model:"global", runs:1, cost:"0.30", sr:100, reports:"cmo", st:"n" },
  { id:"security", name:"CSO", role:"Security & compliance", ini:"CSO", status:"active", auth:"observer", model:"global", runs:1, cost:"0.20", sr:null, reports:"coo", st:"n" },
];
const byId = Object.fromEntries(A.map(a=>[a.id,a]));
const FLEET = [["Active agents","8","of 9","--av3-c4"],["Runs today","26","","--av3-c3"],["Success · 7d","93%","59 runs","--av3-ok"],["Cost · 7d","37.10 zł","","--av3-c5"],["Scheduled","4","cadence","--av3-c6"]];
const SALES = [["Today's sales","4 280 zł","Goal 5 000","y"],["Avg ticket","58.40 zł","price/mix-led","g"],["Revenue growth","+6.2%","SSSG 30d","g"],["Refund rate","3.8%","< 3%","r"]];
const COST = [["Food cost %","36.1%","28–32%","r"],["Labour %","31.4%","25–30%","y"],["Prime cost %","67.5%","< 60%","r"],["Satisfaction","4.6/5","mean","g"]];
const ACT = [["cfo","escalation","Food cost breached 36% — needs a repricing call","14:21","bad"],["cfo","run","Chat turn — 0.42 zł","14:20","info"],["cmo","approval","Decision executed: Tue espresso 2-for-1","yest","warn"],["coo","run","Daily briefing contribution","08:01","info"],["security","schedule","Weekly self-review","Mon","ok"],["ceo","run","OKR review — prime cost focus","Mon","info"]];
const APPR = [["cfo","Reprice Margherita +2 zł","update_item_price"],["coo","86 burrata until delivery","mark_item_86"],["cmo","SMS lapsed cohort a Tue offer","send_sms"]];
const DAYS = [4,7,9,6,11,8,14];

/* helpers (real av3 markup) */
const acStatus = st=> st==="g"?"--av3-ok":st==="y"?"--av3-warn":st==="r"?"--av3-bad":"--av3-subtle";
const dot = st=>`<span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;display:inline-block;background:${st==="n"?"transparent":`var(${acStatus(st)})`};${st==="n"?"border:1.5px solid var(--av3-subtle)":""}"></span>`;
const mono = (a,s=30)=>`<span style="width:${s}px;height:${s}px;border-radius:var(--av3-r-md);flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;font-family:var(--av3-mono);font-weight:700;font-size:${s<=24?10:11}px;background:color-mix(in oklab,var(${AC[a.id]}) 16%,transparent);color:var(${AC[a.id]})">${a.ini}</span>`;
const sbadge = a=>`<span class="av3-badge av3-badge-${a.status==="active"?"ok":a.status==="paused"?"warn":"neutral"}">${a.status}</span>`;
const kpi = (l,v,f,st)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${acStatus(st)})"><div class="av3-kpi-label">${dot(st)} ${l}</div><div class="av3-kpi-value">${v}</div><div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div></div>`;
const stat = (l,v,f,ac)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${ac})"><div class="av3-kpi-label">${l}</div><div class="av3-kpi-value">${v}</div>${f?`<div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div>`:""}</div>`;
const sec = t=>`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--av3-subtle);font-weight:600;margin:22px 2px 10px">${t}</div>`;
const feed = (n=6)=>ACT.slice(0,n).map((e,i)=>`<div style="display:flex;gap:9px;padding:9px 0;${i<n-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge av3-badge-${e[4]}">${e[1]}</span><div style="flex:1;min-width:0"><div style="font-size:12.5px"><strong>${byId[e[0]].name}</strong> — ${e[2]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${e[3]}</div></div></div>`).join("");
const appr = ()=>APPR.map((a,i)=>`<div style="display:flex;gap:10px;padding:11px 0;${i<APPR.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start">${mono(byId[a[0]],26)}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600">${a[1]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${a[2]} · ${byId[a[0]].name}</div></div><button class="av3-btn av3-btn-primary av3-btn-sm">Action</button></div>`).join("");
const chart = ()=>{const m=Math.max(...DAYS);const lab=["6d","5d","4d","3d","2d","1d","Today"];return `<div style="display:flex;align-items:flex-end;gap:8px;height:92px">${DAYS.map((n,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px"><span style="font-size:10px;color:var(--av3-subtle);font-family:var(--av3-mono)">${n}</span><div style="width:100%;height:${Math.max(4,n/m*64)}px;border-radius:5px 5px 0 0;background:${i===6?"var(--av3-brand)":"color-mix(in oklab,var(--av3-c3) 55%,transparent)"}"></div><span style="font-size:9.5px;color:var(--av3-subtle)">${lab[i]}</span></div>`).join("")}</div>`;};
const srbar = sr=>`<div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin-top:7px"><span style="display:block;height:100%;width:${sr??0}%;background:${sr==null?"transparent":sr>=90?"var(--av3-ok)":sr>=70?"var(--av3-warn)":"var(--av3-bad)"}"></span></div>`;
const orgTree = ()=>{const kids=p=>A.filter(a=>a.reports===p);const r=(a,d)=>`<div><button class="av3-conv-row" style="margin-left:${d*18}px;width:calc(100% - ${d*18}px)"><span style="display:flex;align-items:center;gap:8px;min-width:0">${d>0?'<span style="color:var(--av3-subtle)">↳</span>':""}${mono(a,22)}<span style="font-size:12.5px;font-weight:600">${a.name}</span><span style="font-size:11px;color:var(--av3-subtle)">${a.role}</span></span>${dot(a.st)}</button>${kids(a.id).map(k=>r(k,d+1)).join("")}</div>`;return kids(null).map(a=>r(a,0)).join("");};

/* ---------- 6. Console (master–detail with sub-tabs) ---------- */
const v6 = `
<div class="hqgrid hqgrid-side">
  <div class="av3-card av3-card-p" style="align-self:start">
    <div class="av3-card-title" style="margin-bottom:8px">Agents</div>
    ${A.map((a,i)=>`<button class="av3-conv-row ${i===2?"is-active":""}"><span style="display:flex;align-items:center;gap:9px;min-width:0">${mono(a,26)}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600">${a.name}</span><span style="display:block;font-size:11px;color:var(--av3-subtle)">${a.role}</span></span></span>${sbadge(a)}</button>`).join("")}
  </div>
  <div>
    <div class="av3-card"><div class="av3-card-head"><div style="display:flex;align-items:center;gap:10px">${mono(byId.cfo,34)}<div><div class="av3-card-title" style="font-size:16px">CFO — Financial Guardian</div><div class="av3-card-desc">Finance · reports to CEO · opus-4-8 · operator</div></div></div><div style="display:flex;gap:6px"><button class="av3-btn av3-btn-sm">Chat</button><button class="av3-btn av3-btn-primary av3-btn-sm">Edit</button></div></div>
      <div style="padding:12px 16px 0"><div class="av3-filterchips">${["Overview","Charter","Scorecard","Timeline","Chat"].map((t,i)=>`<button class="av3-fchip ${i===0?"is-active":""}">${t}</button>`).join("")}</div></div>
      <div class="av3-card-body">
        <div class="av3-kpi-rail" style="grid-template-columns:repeat(3,1fr)">${stat("Runs 7d","18","","--av3-c3")}${stat("Cost 7d","13.20 zł","","--av3-c5")}${stat("Last run","2h ago","","--av3-c2")}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.5px;margin-top:16px"><span>Success rate · 7d</span><span style="color:var(--av3-fg)">88%</span></div>${srbar(88)}
        ${sec("KPIs owned")}<div class="av3-kpi-rail">${COST.slice(0,3).map(k=>kpi(...k)).join("")}</div>
      </div>
    </div>
  </div>
</div>`;

/* ---------- 7. Activity stream ---------- */
const v7 = `
<div class="av3-kpi-rail" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">${FLEET.map(s=>stat(...s)).join("")}</div>
<div class="hqgrid hqgrid-stream">
  <div>
    <div class="av3-filterchips" style="margin-bottom:12px">${["All","Runs","Escalations","Approvals","Decisions"].map((t,i)=>`<button class="av3-fchip ${i===0?"is-active":""}">${t}</button>`).join("")}</div>
    ${[["Today",feed(3)],["Yesterday",ACT.slice(3,5).map((e,i)=>`<div style="display:flex;gap:9px;padding:9px 0;${i<1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge av3-badge-${e[4]}">${e[1]}</span><div style="flex:1"><div style="font-size:12.5px"><strong>${byId[e[0]].name}</strong> — ${e[2]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${e[3]}</div></div></div>`).join("")]].map(([t,html])=>`${sec(t)}<div class="av3-card av3-card-p">${html}</div>`).join("")}
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Needs you</div><span class="av3-badge av3-badge-bad">${APPR.length}</span></div><div class="av3-card-body" style="padding:4px 16px">${appr()}</div></div>
    <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Fleet</div></div><div class="av3-card-body" style="padding:6px 16px">${orgTree()}</div></div>
  </div>
</div>`;

/* ---------- 8. Daily brief (reading column) ---------- */
const v8 = `
<div class="brief">
  <div class="av3-card av3-card-p">
    <div style="font-family:var(--av3-display);font-size:24px;font-weight:600;letter-spacing:-.01em">Morning brief — Tue 11 Jun</div>
    <div style="font-size:13px;color:var(--av3-muted);margin-top:4px">Sales pacing to 86% of goal · prime cost is the fire · 3 actions waiting on you.</div>
  </div>
  ${sec("What needs attention")}
  <div class="av3-card av3-card-p">
    ${[["Food cost 36.1% — above the 35% red line","cfo"],["Prime cost 67.5% — over the 60% ceiling","cfo"],["Refund rate 3.8% — above 3%","coo"]].map((f,i)=>`<div style="display:flex;gap:10px;padding:9px 0;${i<2?"border-bottom:1px solid var(--av3-line)":""};align-items:center">${dot("r")}<span style="font-size:13px;flex:1">${f[0]}</span>${mono(byId[f[1]],22)}</div>`).join("")}
  </div>
  ${sec("Decisions from the board")}
  <div class="av3-card av3-card-p">
    ${APPR.map((a,i)=>`<div style="display:flex;gap:11px;padding:10px 0;${i<APPR.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge" style="background:color-mix(in oklab,var(${AC[a[0]]}) 16%,transparent);color:var(${AC[a[0]]})">${byId[a[0]].ini}</span><div style="flex:1"><div style="font-size:13.5px;font-weight:600">${a[1]}</div><div style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${a[2]}</div></div><button class="av3-btn av3-btn-primary av3-btn-sm">Approve</button></div>`).join("")}
  </div>
  ${sec("The desk")}
  <div class="av3-card av3-card-p">
    ${A.filter(a=>["ceo","coo","cfo","cmo"].includes(a.id)).map((a,i)=>`<div style="display:flex;gap:11px;padding:11px 0;${i<3?"border-bottom:1px solid var(--av3-line)":""}">${mono(a,28)}<div style="flex:1"><div style="font-size:11px;font-weight:700;color:var(${AC[a.id]})">${a.name}</div><div style="font-size:13px;line-height:1.55;margin-top:2px">${({ceo:"Hold prime cost under 62% in two weeks — CFO owns the reprice, COO the roster.",coo:"Pull one Tue-lunch floater to the dinner push; comps are the refund driver.",cfo:"Margherita is the leak at 41% item cost; +2 zł restores ~31.5% blended.",cmo:"Tue 14–17h is dead — a 2-for-1 espresso to 240 lapsed guests lifts it."})[a.id]}</div></div></div>`).join("")}
  </div>
</div>`;

/* ---------- 9. Bento grid ---------- */
const v9 = `
<div class="bento">
  <div class="av3-card av3-card-p b-hero">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600">Today's sales</div>
    <div style="font-family:var(--av3-display);font-size:40px;font-weight:600;letter-spacing:-.01em;margin-top:6px">4 280 zł</div>
    <div style="font-size:12.5px;color:var(--av3-muted)">86% of the 5 000 zł goal</div>
    <div style="margin-top:14px">${chart()}</div>
  </div>
  <div class="av3-kpi b-a" style="--av3-kpi-accent:var(--av3-ok)"><div class="av3-kpi-label">Success · 7d</div><div class="av3-kpi-value">93%</div><div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">59 runs</span></div></div>
  <div class="av3-kpi b-b" style="--av3-kpi-accent:var(--av3-c5)"><div class="av3-kpi-label">Cost · 7d</div><div class="av3-kpi-value">37.10 zł</div></div>
  <div class="av3-card av3-card-p b-needs"><div class="av3-card-title" style="margin-bottom:4px">Needs you</div>${appr()}</div>
  <div class="av3-card av3-card-p b-cost"><div class="av3-card-title" style="margin-bottom:10px">Cost & quality</div><div class="av3-kpi-rail" style="grid-template-columns:repeat(2,1fr)">${COST.map(k=>kpi(...k)).join("")}</div></div>
  <div class="av3-card av3-card-p b-fleet"><div class="av3-card-title" style="margin-bottom:6px">Fleet</div>${orgTree()}</div>
  <div class="av3-card av3-card-p b-feed"><div class="av3-card-title" style="margin-bottom:4px">Recent activity</div>${feed(4)}</div>
</div>`;

/* ---------- 10. Fleet table ---------- */
const v10 = `
<div class="av3-kpi-rail" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">${FLEET.map(s=>stat(...s)).join("")}</div>
${sec("Fleet")}
<div class="av3-card" style="overflow:hidden">
  <table class="ftable">
    <thead><tr><th>Agent</th><th>Status</th><th>Model</th><th>Authority</th><th style="text-align:right">Runs 7d</th><th style="text-align:right">Cost 7d</th><th style="text-align:right">Success</th><th>Reports to</th><th></th></tr></thead>
    <tbody>
    ${A.map(a=>`<tr><td><span style="display:flex;align-items:center;gap:9px">${mono(a,24)}<span><span style="display:block;font-weight:600;font-size:12.5px">${a.name}</span><span style="display:block;font-size:11px;color:var(--av3-subtle)">${a.role}</span></span></span></td>
      <td><span style="display:inline-flex;align-items:center;gap:6px">${dot(a.st)}${sbadge(a)}</span></td>
      <td style="font-family:var(--av3-mono);font-size:11.5px;color:var(--av3-muted)">${a.model}</td>
      <td><span class="av3-badge av3-badge-neutral">${a.auth}</span></td>
      <td style="text-align:right;font-family:var(--av3-mono);font-size:12px">${a.runs}</td>
      <td style="text-align:right;font-family:var(--av3-mono);font-size:12px">${a.cost} zł</td>
      <td style="text-align:right;font-family:var(--av3-mono);font-size:12px;color:${a.sr==null?"var(--av3-subtle)":a.sr>=90?"var(--av3-ok)":a.sr>=70?"var(--av3-warn)":"var(--av3-bad)"}">${a.sr==null?"—":a.sr+"%"}</td>
      <td style="font-size:12px;color:var(--av3-muted)">${a.reports?byId[a.reports].name:"—"}</td>
      <td style="text-align:right"><button class="av3-btn av3-btn-ghost av3-btn-sm">Open</button></td></tr>`).join("")}
    </tbody>
  </table>
</div>`;

const VARIANTS = [
  ["6","Console","Master–detail with sub-tabs — agent list left, a deep working panel (Overview/Charter/Scorecard/Timeline/Chat) right.", v6],
  ["7","Activity Stream","The home is a chronological feed of everything the fleet did, with filters; KPIs as a top strip + a right rail for what needs you.", v7],
  ["8","Daily Brief","A reading-optimised single column — morning headline, what needs attention, board decisions, the desk's one-liners.", v8],
  ["9","Bento Grid","An asymmetric dashboard of varied-size tiles — sales hero, success/cost stats, needs-you, cost board, fleet, feed.", v10 ? v9 : v9],
  ["10","Fleet Table","A dense data-grid of every agent (status/model/authority/runs/cost/success/owner) over a KPI strip — spreadsheet/ops feel.", v10],
];

const EXTRA = `
.hqgrid{display:grid;gap:14px;align-items:start}
.hqgrid-side{grid-template-columns:260px minmax(0,1fr)}
.hqgrid-stream{grid-template-columns:minmax(0,1fr) 320px}
@media(max-width:1000px){.hqgrid-side,.hqgrid-stream{grid-template-columns:1fr}}
.brief{max-width:760px;margin:0 auto}
.bento{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
.bento .b-hero{grid-column:span 2;grid-row:span 2}
.bento .b-needs{grid-column:span 2;grid-row:span 2}
.bento .b-cost{grid-column:span 2}
.bento .b-fleet{grid-column:span 2}
.bento .b-feed{grid-column:span 2}
@media(max-width:1000px){.bento{grid-template-columns:1fr}.bento>*{grid-column:auto!important}}
.ftable{width:100%;border-collapse:collapse;font-size:12.5px}
.ftable th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--av3-subtle);font-weight:600;padding:11px 14px;border-bottom:1px solid var(--av3-line)}
.ftable td{padding:10px 14px;border-bottom:1px solid var(--av3-line)}
.ftable tbody tr:last-child td{border-bottom:0}
.ftable tbody tr:hover{background:var(--av3-hover)}
.variant{display:none}
.variant.show{display:block}
`;

const switcher = VARIANTS.map(([n,t],i)=>`<button class="av3-fchip ${i===0?"is-active":""}" data-go="${n}">${n}. ${t}</button>`).join("");
const sections = VARIANTS.map(([n,t,d,body],i)=>`<section class="variant ${i===0?"show":""}" data-v="${n}">
  <div style="font-size:12px;color:var(--av3-subtle);background:var(--av3-s2);border:1px dashed var(--av3-line-strong);border-radius:var(--av3-r-md);padding:8px 12px;margin-bottom:16px"><b style="color:var(--av3-platinum)">${n}. ${t}</b> — ${d}</div>
  ${body}
</section>`).join("");

const html = `<!doctype html><html lang="en" data-admin-theme="dark"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Agent HQ — redesigns v2</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
/* ===== REAL admin-v3 stylesheet, inlined verbatim ===== */
${css}
/* ===== mockup-only layout helpers ===== */
${EXTRA}
body{padding:22px clamp(14px,3vw,40px) 60px}
</style></head>
<body class="av3-root">
  <div class="av3-pagehead" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:11px">
      <span style="width:34px;height:34px;border-radius:var(--av3-r-md);display:grid;place-items:center;background:var(--av3-brand-soft);color:var(--av3-brand);font-family:var(--av3-display);font-weight:600">HQ</span>
      <div><h1>Agent HQ</h1><div class="av3-pagehead-sub">5 redesign directions · real admin-v3 stylesheet, inlined</div></div>
    </div>
  </div>
  <div class="av3-filterchips" id="sw" style="margin-bottom:18px">${switcher}</div>
  ${sections}
  <script>
    const sw=document.getElementById('sw');
    sw.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(!b)return;
      [...sw.children].forEach(c=>c.classList.toggle('is-active',c===b));
      document.querySelectorAll('.variant').forEach(s=>s.classList.toggle('show',s.dataset.v===b.dataset.go));
      window.scrollTo({top:0,behavior:'smooth'});});
  </script>
</body></html>`;

writeFileSync(join(HERE, "..", "agent-hq-redesign-v2.html"), html);
console.log("wrote agent-hq-redesign-v2.html");
