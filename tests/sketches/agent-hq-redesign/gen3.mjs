// Full builds of 3 chosen Agent HQ directions — Console, Daily Brief, Bento.
// Each is standalone with the REAL admin-v3 stylesheet inlined verbatim and the
// actual .av3-* classes. Console is fully interactive (agent + sub-tab switch).
//   node gen3.mjs  → ../agent-hq-console.html, ../agent-hq-daily-brief.html, ../agent-hq-bento.html
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const CSS = readFileSync(join(ROOT, "src/app/themes/admin-v3/index.css"), "utf8");

const AC = { ceo:"--av3-c4", coo:"--av3-c3", cfo:"--av3-ok", cmo:"--av3-c5", frontend:"--av3-c1", database:"--av3-c2", uxui:"--av3-c6", market:"--av3-c7", security:"--av3-c8" };

const AGENTS = [
  { id:"ceo", name:"CEO", title:"CEO — Visionary & Strategist", role:"Strategy & vision", ini:"EO", status:"active", auth:"operator", model:"opus-4-8", effort:"high", memory:"managed", runs:14, cost:"8.40", last:"2h ago", sr:96, reports:null, st:"y",
    mandate:"Set and defend the 12-month vision and the brand promise — a Margherita in Kraków tastes identical to one in Warszawa — and make the final call when the team disagrees.",
    resp:["Long-term strategy, brand positioning and competitive posture","Menu engineering & innovation bets","Goal-setting and OKRs with measurable targets","Hold the CFO, COO and CMO accountable, then decide"],
    kpis:[["Goal attainment","% of admin objectives met on time","87%"],["Revenue growth MoM","SSSG vs prior 30d","+6.2%"],["Decision quality","downstream outcomes of arbitrations",""]],
    guard:"Decisions must be grounded in unit economics — never chase growth that breaks the margin. Never invent numbers; pull them from tools.",
    esc:"A decision commits material spend, changes pricing chain-wide, or the executives can't converge — surface the trade-off and ask the human admin.",
    tone:"Decisive, big-picture, ambitious but grounded. Lead with the single most important thing and set a numbered OKR with an owner.",
    tools:["get_pnl_snapshot","get_menu_engineering","update_item_price","escalate_to_admin"], collab:["coo","cfo","cmo"],
    tl:[["run","OKR review — prime cost focus","Mon 08:02","info"],["run","Chat turn — 0.31 zł","today 09:40","info"],["edit","Mandate updated by Rafał","3 Jun","neutral"]],
    chat:[["u","Where should we focus next quarter? One OKR with a number."],["b","Prime cost is the constraint, not demand. OKR: prime cost ≤ 62% within 14 days (it's 67.5% now) — CFO owns the reprice, COO the roster. Hold new-site spend until we're back in band."]] },
  { id:"coo", name:"COO", title:"COO — Operations Master", role:"Operations", ini:"OO", status:"active", auth:"operator", model:"global", effort:"high", memory:"managed", runs:11, cost:"5.10", last:"1h ago", sr:91, reports:"ceo", st:"y",
    mandate:"Keep every service running clean and fast — convert the forecast into a staffing and prep plan and spot the bottleneck before it becomes a service failure.",
    resp:["Kitchen efficiency, prep/ticket times and throughput","Staff scheduling, coverage and performance","Inventory, par levels and supply chain","Quality control & food safety (HACCP), waste"],
    kpis:[["Labour cost %","25–30% healthy","31.4%"],["Refund / cancellation rate","< 3%","3.8%"],["Waste / service","minimise",""]],
    guard:"Food safety is never traded for speed. Flag HACCP risk plainly. Quantify every claim in hours, units, minutes or złoty.",
    esc:"A food-safety risk appears, a shift can't be covered, or a fix needs spend beyond your cap — stop and ask the human admin.",
    tone:"Practical, fast, checklist-driven. Flag the risk, quantify it, propose the concrete fix.",
    tools:["get_labor_cost","get_inventory_status","mark_item_86","escalate_to_admin"], collab:["ceo","cfo","cmo"],
    tl:[["run","Daily briefing contribution","today 08:01","info"],["schedule","Daily self-review","today 08:00","ok"]],
    chat:[["u","What's my biggest operational risk for tomorrow's service?"],["b","Friday dinner. You're one cook short on the projected covers and burrata is at par 0 until Thursday's delivery. Pull a Tue-lunch floater to Fri dinner and 86 the burrata special now."]] },
  { id:"cfo", name:"CFO", title:"CFO — Financial Guardian", role:"Finance", ini:"FO", status:"active", auth:"operator", model:"opus-4-8", effort:"high", memory:"managed", runs:18, cost:"13.20", last:"12m ago", sr:88, reports:"ceo", st:"r",
    mandate:"Guard the margin — translate operations into money and money into decisions, and never accept a headline number without the ratio behind it.",
    resp:["Full P&L: food cost %, labour cost %, prime cost, cash flow","Per-item profitability and pricing strategy","Budgeting, forecasting and break-even","Expense control and growth projections"],
    kpis:[["Food cost %","28–32% healthy, >35% red","36.1%"],["Prime cost %","< 60%, 55% excellent","67.5%"],["Average ticket","price/mix-led","58.40 zł"]],
    guard:"State the ratio vs benchmark before the recommendation. Price changes go via update_item_price for operator approval.",
    esc:"A metric breaches a red benchmark, a price change exceeds a band, or a leak needs a structural cut — stop and ask the human admin.",
    tone:"Precise, sceptical, benchmark-driven. State the ratio, name the leak in złoty, recommend the lever.",
    tools:["get_pnl_snapshot","get_labor_cost","update_item_price","escalate_to_admin"], collab:["ceo","coo","cmo"],
    tl:[["escalation","Food cost breached 36% — needs a repricing call","today 14:21","bad"],["run","Chat turn — 0.42 zł","today 14:20","info"],["approval","Decision executed: Margherita +2 zł","today 14:35","warn"]],
    chat:[["u","Which item is leaking margin, and what should I reprice it to?"],["t","get_pnl_snapshot"],["b","Food cost is 36.1% vs a 32% target — the Margherita is the drag at 41% item cost on the current cheese price. Reprice 25.90 → 27.90 zł; that lifts blended food cost back to ~31.5%. Want me to prepare the change for your approval?"]] },
  { id:"cmo", name:"CMO", title:"CMO — Marketing & Growth", role:"Marketing", ini:"MO", status:"active", auth:"operator", model:"global", effort:"high", memory:"managed", runs:9, cost:"4.30", last:"40m ago", sr:100, reports:"ceo", st:"g",
    mandate:"Own the top of the funnel and the repeat-visit loop — turn quiet dayparts into demand and protect the brand's reputation.",
    resp:["Marketing campaigns (social, email, local)","Customer loyalty, retention and reactivation","Reputation management","Promotions and upselling strategy"],
    kpis:[["Customer satisfaction","mean rating","4.6 / 5"],["Repeat / retention rate","retention","41%"],["Campaign-driven revenue","incremental",""]],
    guard:"Reach identified customers only, with consent + operator approval (send_sms). No spam. Predict the lift first.",
    esc:"A campaign would message a large segment, a discount would dent margin, or a reputation incident is escalating — ask the human admin.",
    tone:"Energetic, customer-obsessed, data-driven. Name the signal, propose the lever, predict the lift.",
    tools:["query_customers","get_feedback_summary","send_sms","escalate_to_admin"], collab:["ceo","coo","cfo"],
    tl:[["approval","Decision executed: Tue espresso 2-for-1","yest 18:40","warn"],["run","Cohort read — lapsed guests","yest 18:30","info"]],
    chat:[["u","Which daypart is slow, and what campaign would lift it?"],["b","Tue 14–17h is dead — 38% below the weekly mean. 240 guests lapsed >45 days. A 2-for-1 espresso SMS to that cohort should lift the daypart ~12% without denting margin. Approve the send?"]] },
  { id:"frontend", name:"Frontend Dev", title:"Frontend Developer — Ordering Experience", role:"Ordering UX", ini:"FE", status:"active", auth:"observer", model:"global", effort:"high", memory:"managed", runs:3, cost:"0.80", last:"1d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Own the customer-facing ordering experience — shrink the steps between “open menu” and “order paid” and raise conversion without breaking accessibility.",
    resp:["Ordering UI, cart and checkout friction","Cross-sell / upsell placement","Page performance and accessibility","Reading order/feedback data for drop-off"],
    kpis:[["Checkout conversion","raise",""],["Mobile drop-off","reduce",""]],
    guard:"Propose the smallest UI change that moves conversion. Flag accessibility + mobile plainly. Tie every claim to a number.",
    esc:"A change would touch checkout/payment flow or regress accessibility — ask the human admin.",
    tone:"Pragmatic engineer, conversion-minded, detail-obsessed about the funnel.",
    tools:["query_orders","get_feedback_summary","escalate_to_admin"], collab:["uxui","cmo"],
    tl:[["run","Funnel drop-off read","1d ago","info"]],
    chat:[["u","Where are customers dropping off?"],["b","Mobile checkout: 22% abandon at the address step. The field set is too long for one screen — collapse to phone + saved address and you recover most of it."]] },
  { id:"database", name:"Database Optimizer", title:"Database Optimizer — Data & Performance", role:"Data & perf", ini:"DB", status:"paused", auth:"observer", model:"gemini-2.5-pro", effort:"high", memory:"managed", runs:0, cost:"0.00", last:"—", sr:null, reports:"coo", st:"n",
    mandate:"Keep the numbers trustworthy — protect query performance and data integrity so every other agent can rely on the reports.",
    resp:["Query / report performance and hot paths","Data integrity across orders, customers, inventory, P&L","Schema and growth planning","Spotting anomalies that smell like data problems"],
    kpis:[["Report latency","< 500ms",""],["Anomaly count","minimise",""]],
    guard:"Ground every answer in the data the tools return. Never invent a number — if data is missing, say so.",
    esc:"Data appears corrupted, a report is materially inconsistent, or a fix needs a schema migration — ask the human admin.",
    tone:"Precise, systems-minded, allergic to data that doesn't reconcile.",
    tools:["query_orders","get_inventory_status","escalate_to_admin"], collab:["cfo","coo"],
    tl:[["edit","Paused by Rafał","2 Jun","neutral"]],
    chat:[["b","I'm paused. Set me Active in the editor to run."]] },
  { id:"uxui", name:"UX/UI Designer", title:"UX/UI Designer & Researcher", role:"Design & research", ini:"UX", status:"active", auth:"observer", model:"global", effort:"high", memory:"managed", runs:2, cost:"0.50", last:"2d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Advocate for the user — turn feedback and sentiment into design hypotheses so the experience is legible, persuasive and humane.",
    resp:["Usability and visual design","Customer-journey research","Turning feedback into design hypotheses","Keeping menu and loyalty surfaces legible"],
    kpis:[["Journey completion","raise",""],["UX sentiment","positive",""]],
    guard:"Cite the customer signal, name the usability problem, propose a concrete testable change.",
    esc:"A redesign would change a core journey or conflict with the brand system — ask the human admin.",
    tone:"Empathetic, evidence-led, opinionated about clarity.",
    tools:["get_feedback_summary","query_customers","escalate_to_admin"], collab:["frontend","cmo"],
    tl:[["run","Feedback theme synthesis","2d ago","info"]],
    chat:[["u","What does recent feedback say we should redesign?"],["b","“Hard to find vegan options” recurs (14 mentions/30d). Add a dietary filter chip row above the menu — testable, low-risk, addresses the top theme."]] },
  { id:"market", name:"Market Researcher", title:"Market Researcher — Demand & Competition", role:"Demand & competition", ini:"MKT", status:"active", auth:"observer", model:"global", effort:"high", memory:"managed", runs:1, cost:"0.30", last:"3d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Bring the outside view — read market trends, competitive posture and demand signals, and pressure-test expansion or menu bets.",
    resp:["Demand and trend analysis","Competitor and category awareness","Customer-segment opportunities","Pressure-testing expansion / menu bets"],
    kpis:[["Segment sizing","opportunity",""],["Positioning","competitive",""]],
    guard:"Bring evidence, not vibes. Be explicit when a claim is an inference. Never fabricate competitor figures.",
    esc:"A recommendation implies a major bet (new site, category) — frame the risk and ask the human admin.",
    tone:"Curious, analytical, externally focused.",
    tools:["query_customers","get_demand_forecast","escalate_to_admin"], collab:["cmo","ceo"],
    tl:[["run","Daypart demand scan","3d ago","info"]],
    chat:[["u","Biggest untapped opportunity right now?"],["b","Weekday lunch delivery within 2km — your repeat-delivery cohort is small but high-frequency, and no nearby competitor offers a sub-30-min lunch set. Worth a 4-week test."]] },
  { id:"security", name:"CSO", title:"CSO — Chief Security Officer", role:"Security & compliance", ini:"CSO", status:"active", auth:"observer", model:"global", effort:"high", memory:"managed", runs:1, cost:"0.20", last:"Mon", sr:null, reports:"coo", st:"n",
    mandate:"Protect customer, payment and staff data — enforce least privilege, keep a paper trail, and assume nothing is safe until it's verified.",
    resp:["Data protection (GDPR)","Access control and least-privilege review","Compliance posture (PCI, audit logging, retention)","Incident preparedness"],
    kpis:[["PII exposure","minimise",""],["Audit coverage","100%",""]],
    guard:"Name the risk, rate severity + likelihood, prescribe the control. Read access only — never expose raw PII.",
    esc:"A suspected breach, a PII exposure, or a compliance gap with regulatory exposure — ask the human admin immediately.",
    tone:"Measured, risk-aware, uncompromising on customer data.",
    tools:["query_orders","escalate_to_admin"], collab:["database","coo"],
    tl:[["schedule","Weekly self-review","Mon 09:00","ok"]],
    chat:[["u","Where's our biggest data-protection risk?"],["b","Manager accounts default to broad grants. Three managers can export customer data who don't need it — tighten the Permission Matrix to least-privilege and you cut the PII blast radius."]] },
];
const byId = Object.fromEntries(AGENTS.map(a=>[a.id,a]));
const FLEET = [["Active agents","8","of 9","--av3-c4"],["Runs today","26","","--av3-c3"],["Success · 7d","93%","59 runs","--av3-ok"],["Cost · 7d","37.10 zł","","--av3-c5"],["Scheduled","4","cadence","--av3-c6"]];
const SALES = [["Today's sales","4 280 zł","Goal 5 000","y"],["Avg ticket","58.40 zł","price/mix-led","g"],["Revenue growth","+6.2%","SSSG 30d","g"],["Refund rate","3.8%","< 3%","r"]];
const COST = [["Food cost %","36.1%","28–32%","r"],["Labour %","31.4%","25–30%","y"],["Prime cost %","67.5%","< 60%","r"],["Satisfaction","4.6/5","mean","g"]];
const APPR = [["cfo","Reprice Margherita +2 zł","update_item_price"],["coo","86 burrata until delivery","mark_item_86"],["cmo","SMS lapsed cohort a Tue offer","send_sms"]];
const DAYS = [4,7,9,6,11,8,14];

/* ---- shared static helpers (real av3 markup) ---- */
const acS = st=> st==="g"?"--av3-ok":st==="y"?"--av3-warn":st==="r"?"--av3-bad":"--av3-subtle";
const dot = st=>`<span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;display:inline-block;background:${st==="n"?"transparent":`var(${acS(st)})`};${st==="n"?"border:1.5px solid var(--av3-subtle)":""}"></span>`;
const mono = (a,s=30)=>`<span style="width:${s}px;height:${s}px;border-radius:var(--av3-r-md);flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;font-family:var(--av3-mono);font-weight:700;font-size:${s<=24?10:s>=38?13:11}px;background:color-mix(in oklab,var(${AC[a.id]}) 16%,transparent);color:var(${AC[a.id]})">${a.ini}</span>`;
const sbadge = a=>`<span class="av3-badge av3-badge-${a.status==="active"?"ok":a.status==="paused"?"warn":"neutral"}">${a.status}</span>`;
const kpi = (l,v,f,st)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${acS(st)})"><div class="av3-kpi-label">${dot(st)} ${l}</div><div class="av3-kpi-value">${v}</div><div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div></div>`;
const stat = (l,v,f,ac)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${ac})"><div class="av3-kpi-label">${l}</div><div class="av3-kpi-value">${v}</div>${f?`<div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div>`:""}</div>`;
const sec = (t,first)=>`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--av3-subtle);font-weight:600;margin:${first?"0":"22px"} 2px 10px">${t}</div>`;
const secp = (t,first)=>`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--av3-platinum);font-weight:700;margin:${first?"0":"20px"} 2px 10px">${t}</div>`;
const orgTree = ()=>{const kids=p=>AGENTS.filter(a=>a.reports===p);const r=(a,d)=>`<div><button class="av3-conv-row" style="margin-left:${d*18}px;width:calc(100% - ${d*18}px)"><span style="display:flex;align-items:center;gap:8px;min-width:0">${d>0?'<span style="color:var(--av3-subtle)">↳</span>':""}${mono(a,22)}<span style="font-size:12.5px;font-weight:600">${a.name}</span><span style="font-size:11px;color:var(--av3-subtle)">${a.role}</span></span>${dot(a.st)}</button>${kids(a.id).map(k=>r(k,d+1)).join("")}</div>`;return kids(null).map(a=>r(a,0)).join("");};
const chart = ()=>{const m=Math.max(...DAYS);const lab=["6d","5d","4d","3d","2d","1d","Today"];return `<div style="display:flex;align-items:flex-end;gap:8px;height:92px">${DAYS.map((n,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px"><span style="font-size:10px;color:var(--av3-subtle);font-family:var(--av3-mono)">${n}</span><div style="width:100%;height:${Math.max(4,n/m*64)}px;border-radius:5px 5px 0 0;background:${i===6?"var(--av3-brand)":"color-mix(in oklab,var(--av3-c3) 55%,transparent)"}"></div><span style="font-size:9.5px;color:var(--av3-subtle)">${lab[i]}</span></div>`).join("")}</div>`;};
const appr = ()=>APPR.map((a,i)=>`<div style="display:flex;gap:10px;padding:11px 0;${i<APPR.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start">${mono(byId[a[0]],26)}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600">${a[1]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${a[2]} · ${byId[a[0]].name}</div></div><button class="av3-btn av3-btn-primary av3-btn-sm">Action</button></div>`).join("");

const headChips = active => ["Command","Agents","Scorecards","Work","Approvals","Inbox","Reports","Settings"].map(s=>`<button class="av3-fchip ${s===active?"is-active":""}">${s}</button>`).join("");
const PAGEHEAD = (sub, active) => `<div class="av3-pagehead" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:11px"><span style="width:34px;height:34px;border-radius:var(--av3-r-md);display:grid;place-items:center;background:var(--av3-brand-soft);color:var(--av3-brand);font-family:var(--av3-display);font-weight:600">HQ</span><div><h1>Agent HQ</h1><div class="av3-pagehead-sub">${sub}</div></div></div><div class="av3-pagehead-actions"><div class="av3-filterchips">${headChips(active)}</div></div></div>`;

const EXTRA = `
.hqgrid{display:grid;gap:14px;align-items:start}
.hqgrid-side{grid-template-columns:268px minmax(0,1fr)}
@media(max-width:980px){.hqgrid-side{grid-template-columns:1fr}}
.brief{max-width:780px;margin:0 auto}
.bento{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
.bento .span2{grid-column:span 2}.bento .span2r{grid-column:span 2;grid-row:span 2}
@media(max-width:980px){.bento{grid-template-columns:1fr}.bento>*{grid-column:auto!important;grid-row:auto!important}}
`;

function page(title, sub, active, body, scriptBody=""){
  return `<!doctype html><html lang="en" data-admin-theme="dark"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Agent HQ — ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}${EXTRA}
body{padding:22px clamp(14px,3vw,40px) 60px}</style></head>
<body class="av3-root">
<div style="font-size:11.5px;color:var(--av3-subtle);background:var(--av3-s2);border:1px dashed var(--av3-line-strong);border-radius:var(--av3-r-md);padding:8px 12px;margin-bottom:16px">Agent HQ — <b style="color:var(--av3-platinum)">${title}</b> (full build) · real admin-v3 stylesheet, dark theme. Data illustrative.</div>
${PAGEHEAD(sub, active)}
${body}
${scriptBody?`<script>${scriptBody}</script>`:""}
</body></html>`;
}

/* =================== CONSOLE (interactive) =================== */
const consoleData = JSON.stringify(AGENTS.map(a=>({...a, ac:AC[a.id]})));
const consoleBody = `
<div class="hqgrid hqgrid-side">
  <div class="av3-card av3-card-p" style="align-self:start;position:sticky;top:14px">
    <div class="av3-card-title" style="margin-bottom:8px">Agents</div>
    <div id="agentList">${AGENTS.map((a,i)=>`<button class="av3-conv-row" data-pick="${a.id}" ${i===2?'aria-current="true"':""}><span style="display:flex;align-items:center;gap:9px;min-width:0">${mono(a,26)}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600">${a.name}</span><span style="display:block;font-size:11px;color:var(--av3-subtle)">${a.role}</span></span></span>${sbadge(a)}</button>`).join("")}</div>
  </div>
  <div id="panel"></div>
</div>`;
const consoleScript = `
const AGENTS=${consoleData};
const byId=Object.fromEntries(AGENTS.map(a=>[a.id,a]));
let cur="cfo", tab="overview";
const acS=st=>st==="g"?"--av3-ok":st==="y"?"--av3-warn":st==="r"?"--av3-bad":"--av3-subtle";
const dot=st=>'<span style="width:7px;height:7px;border-radius:50%;display:inline-block;background:'+(st==="n"?"transparent":"var("+acS(st)+")")+';'+(st==="n"?"border:1.5px solid var(--av3-subtle)":"")+'"></span>';
const mono=(a,s=30)=>'<span style="width:'+s+'px;height:'+s+'px;border-radius:var(--av3-r-md);display:inline-flex;align-items:center;justify-content:center;font-family:var(--av3-mono);font-weight:700;font-size:'+(s<=24?10:s>=38?13:11)+'px;background:color-mix(in oklab,var('+a.ac+') 16%,transparent);color:var('+a.ac+')">'+a.ini+'</span>';
const kpiT=(l,v,f,st)=>'<div class="av3-kpi" style="--av3-kpi-accent:var('+acS(st)+')"><div class="av3-kpi-label">'+dot(st)+' '+l+'</div><div class="av3-kpi-value">'+v+'</div><div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">'+f+'</span></div></div>';
const stat=(l,v,f)=>'<div class="av3-kpi" style="--av3-kpi-accent:var(--av3-c2)"><div class="av3-kpi-label">'+l+'</div><div class="av3-kpi-value">'+v+'</div>'+(f?'<div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">'+f+'</span></div>':'')+'</div>';
const eb=(t)=>'<div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--av3-platinum);font-weight:700;margin:18px 2px 10px">'+t+'</div>';
const srbar=sr=>'<div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin-top:7px"><span style="display:block;height:100%;width:'+(sr??0)+'%;background:'+(sr==null?"transparent":sr>=90?"var(--av3-ok)":sr>=70?"var(--av3-warn)":"var(--av3-bad)")+'"></span></div>';
const livePrompt=a=>['You are '+a.name+', the '+a.title+' of Ottaviano, a multi-location Neapolitan pizza restaurant chain.','','MANDATE','  '+a.mandate,'','RESPONSIBILITIES',...a.resp.map(r=>'  - '+r),'','TONE & COMMUNICATION','  '+a.tone,'','AUTHORITY','  '+(a.auth==="observer"?"You are READ-ONLY — analyse and advise, never call a mutating tool.":"You may operate gated levers; every change is preview → operator-approve → execute.")+' You retain durable memory across runs.','','GUARDRAILS & ETHICS','  '+a.guard,'','ESCALATION THRESHOLD','  '+a.esc].join("\\n");

function subtabs(){return ['overview','charter','scorecard','timeline','chat'].map(t=>'<button class="av3-fchip '+(t===tab?"is-active":"")+'" data-tab="'+t+'">'+(t[0].toUpperCase()+t.slice(1))+'</button>').join("");}

function render(){
  const a=byId[cur];
  document.querySelectorAll('#agentList [data-pick]').forEach(b=>b.classList.toggle('is-active',b.dataset.pick===cur));
  let inner="";
  if(tab==="overview"){
    inner='<div class="av3-kpi-rail" style="grid-template-columns:repeat(4,1fr)">'+stat("Runs 7d",a.runs)+stat("Cost 7d",a.cost+" zł")+stat("Last run",a.last)+stat("Success 7d",a.sr==null?"—":a.sr+"%")+'</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.5px;margin-top:16px"><span>Success rate · 7d</span><span style="color:var(--av3-fg)">'+(a.sr==null?"no runs":a.sr+"%")+'</span></div>'+srbar(a.sr)
      +eb("KPIs it answers for")+'<div class="av3-kpi-rail">'+a.kpis.map(k=>kpiT(k[0],k[2]||"—",k[1],k[2]?"g":"n")).join("")+'</div>'
      +eb("Recent")+a.tl.map((e,i)=>'<div style="display:flex;gap:9px;padding:9px 0;'+(i<a.tl.length-1?"border-bottom:1px solid var(--av3-line)":"")+';align-items:flex-start"><span class="av3-badge av3-badge-'+e[3]+'">'+e[0]+'</span><div style="flex:1"><div style="font-size:12.5px">'+e[1]+'</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">'+e[2]+'</div></div></div>').join("");
  } else if(tab==="charter"){
    const row=(l,v)=>'<div style="margin-bottom:14px"><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600;margin-bottom:4px">'+l+'</div><div style="font-size:13px;line-height:1.55">'+v+'</div></div>';
    inner=row("Mandate",a.mandate)+row("Responsibilities",'<ul style="margin:0;padding-left:16px">'+a.resp.map(r=>'<li>'+r+'</li>').join("")+'</ul>')
      +row("KPIs",'<ul style="margin:0;padding-left:16px">'+a.kpis.map(k=>'<li>'+k[0]+' — target '+k[1]+'</li>').join("")+'</ul>')
      +row("Tone & communication",a.tone)+row("Guardrails & ethics",a.guard)+row("Escalation threshold",a.esc)
      +row("Tools",a.tools.map(t=>'<span class="av3-badge av3-badge-neutral" style="font-family:var(--av3-mono);margin:0 4px 4px 0;display:inline-flex">'+t+'</span>').join(""))
      +row("Collaborators",a.collab.map(c=>mono(byId[c],22)+' <span style="font-size:12px;margin:0 10px 0 4px">'+byId[c].name+'</span>').join(""))
      +'<details><summary style="cursor:pointer;font-size:12px;color:var(--av3-subtle)">Live system prompt — exactly what it runs on</summary><pre style="white-space:pre-wrap;font-size:11.5px;line-height:1.55;font-family:var(--av3-mono);background:var(--av3-s2);border:1px solid var(--av3-line);border-radius:var(--av3-r-md);padding:12px;margin-top:8px">'+livePrompt(a).replace(/</g,"&lt;")+'</pre></details>';
  } else if(tab==="scorecard"){
    inner='<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.5px"><span>Success rate · 7d</span><span style="color:var(--av3-fg)">'+(a.sr==null?"no runs":a.sr+"%")+'</span></div>'+srbar(a.sr)
      +'<div class="av3-kpi-rail" style="grid-template-columns:repeat(3,1fr);margin-top:14px">'+stat("Runs 7d",a.runs)+stat("Cost 7d",a.cost+" zł")+stat("Last run",a.last)+'</div>'
      +eb("KPIs — target vs actual")+a.kpis.map((k,i)=>'<div style="padding:10px 0;'+(i>0?"border-top:1px solid var(--av3-line)":"")+'"><div style="font-size:13px;font-weight:600">'+k[0]+' <span style="font-weight:400;color:var(--av3-subtle)">· target '+k[1]+'</span></div><div style="font-size:12px;margin-top:3px;color:'+(k[2]?"var(--av3-fg)":"var(--av3-subtle)")+'">'+(k[2]?'actual: <span style="font-family:var(--av3-mono)">'+k[2]+'</span>':"no actual logged")+'</div><div style="display:flex;gap:6px;margin-top:7px"><input class="av3-input" placeholder="log actual…" style="flex:1"><button class="av3-btn av3-btn-sm">Log</button></div></div>').join("");
  } else if(tab==="timeline"){
    inner=a.tl.map((e,i)=>'<div style="display:flex;gap:10px;padding:10px 0;'+(i<a.tl.length-1?"border-bottom:1px solid var(--av3-line)":"")+';align-items:flex-start"><span class="av3-badge av3-badge-'+e[3]+'">'+e[0]+'</span><div style="flex:1"><div style="font-size:12.5px">'+e[1]+'</div><div style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:3px">'+e[2]+'</div></div></div>').join("");
  } else {
    inner='<div class="av3-chat-scroll" style="max-height:none">'+a.chat.map(m=>m[0]==="u"?'<div class="av3-chat-user">'+m[1]+'</div>':m[0]==="t"?'<div class="av3-tool is-ok"><div class="av3-tool-head"><span class="av3-tool-name">✓ '+m[1]+'</span><span class="av3-badge av3-badge-ok">executed</span></div></div>':'<div class="av3-chat-bot">'+m[1]+'</div>').join("")+'</div>'
      +'<form class="av3-chat-composer" onsubmit="return false"><textarea class="av3-input av3-chat-input" rows="2" placeholder="Ask '+a.name+'…"></textarea><button class="av3-btn av3-btn-primary">Send</button></form>';
  }
  document.getElementById('panel').innerHTML=
    '<div class="av3-card"><div class="av3-card-head"><div style="display:flex;align-items:center;gap:10px">'+mono(a,34)+'<div><div class="av3-card-title" style="font-size:16px">'+a.title+'</div><div class="av3-card-desc">'+a.role+' · '+a.model+' · '+a.auth+' · effort '+a.effort+'</div></div></div><div style="display:flex;gap:6px">'+sbadgeJS(a)+'<button class="av3-btn av3-btn-primary av3-btn-sm">Edit</button></div></div>'
    +'<div style="padding:12px 16px 0"><div class="av3-filterchips">'+subtabs()+'</div></div><div class="av3-card-body">'+inner+'</div></div>';
}
function sbadgeJS(a){return '<span class="av3-badge av3-badge-'+(a.status==="active"?"ok":a.status==="paused"?"warn":"neutral")+'">'+a.status+'</span>';}
document.getElementById('agentList').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(b){cur=b.dataset.pick;tab="overview";render();}});
document.getElementById('panel').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();}});
render();
`;

/* =================== DAILY BRIEF =================== */
const deskLine = {ceo:"Hold prime cost under 62% in two weeks — CFO owns the reprice, COO the roster.",coo:"Pull one Tue-lunch floater to the Fri dinner push; comps are the refund driver.",cfo:"Margherita is the leak at 41% item cost; +2 zł restores ~31.5% blended.",cmo:"Tue 14–17h is dead — a 2-for-1 espresso to 240 lapsed guests lifts it ~12%."};
const briefBody = `
<div class="brief">
  <div class="av3-card av3-card-p">
    <div style="font-family:var(--av3-display);font-size:26px;font-weight:600;letter-spacing:-.01em">Morning brief — Tuesday, 11 June</div>
    <div style="font-size:13.5px;color:var(--av3-muted);margin-top:6px;line-height:1.55">Sales pacing to <strong style="color:var(--av3-fg)">86%</strong> of today's goal. Prime cost is the fire (67.5% vs 60% ceiling). Three board decisions are waiting on your approval. The board met at 08:01 — full transcript in Reports.</div>
  </div>

  ${sec("Fleet pulse")}
  <div class="av3-kpi-rail" style="grid-template-columns:repeat(5,1fr)">${FLEET.map(s=>stat(...s)).join("")}</div>

  ${sec("What needs attention")}
  <div class="av3-card av3-card-p">
    ${[["Food cost 36.1% — above the 35% red line","cfo","r"],["Prime cost 67.5% — over the 60% ceiling","cfo","r"],["Refund rate 3.8% — above 3%","coo","y"],["Labour 31.4% — drifting over 30%","coo","y"]].map((f,i,arr)=>`<div style="display:flex;gap:11px;padding:10px 0;${i<arr.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:center">${dot(f[2])}<span style="font-size:13.5px;flex:1">${f[0]}</span>${mono(byId[f[1]],22)}</div>`).join("")}
  </div>

  ${sec("One escalation")}
  <div class="av3-card av3-card-p" style="display:flex;gap:11px;align-items:flex-start;border-color:color-mix(in oklab,var(--av3-warn) 26%,var(--av3-line))">
    <span style="color:var(--av3-warn);font-size:18px;line-height:1">⚠</span>
    <div style="flex:1"><div style="font-size:13.5px"><strong>CFO</strong> — Food cost breached 36%; needs a repricing decision before lunch.</div><div style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:3px">severity high · today 14:21</div></div>
    <button class="av3-btn av3-btn-sm">Open CFO</button>
  </div>

  ${sec("Decisions from the board")}
  <div class="av3-card av3-card-p">
    ${APPR.map((a,i)=>`<div style="display:flex;gap:11px;padding:11px 0;${i<APPR.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge" style="background:color-mix(in oklab,var(${AC[a[0]]}) 16%,transparent);color:var(${AC[a[0]]})">${byId[a[0]].ini}</span><div style="flex:1"><div style="font-size:13.5px;font-weight:600">${a[1]}</div><div style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${a[2]} · ${byId[a[0]].name}</div></div><div style="display:flex;gap:6px"><button class="av3-btn av3-btn-primary av3-btn-sm">Approve</button><button class="av3-btn av3-btn-ghost av3-btn-sm">Dismiss</button></div></div>`).join("")}
  </div>

  ${sec("The desk")}
  <div class="av3-card av3-card-p">
    ${["ceo","coo","cfo","cmo"].map((id,i)=>`<div style="display:flex;gap:11px;padding:12px 0;${i<3?"border-bottom:1px solid var(--av3-line)":""}">${mono(byId[id],28)}<div style="flex:1"><div style="font-size:11px;font-weight:700;color:var(${AC[id]})">${byId[id].name}</div><div style="font-size:13.5px;line-height:1.55;margin-top:2px">${deskLine[id]}</div></div></div>`).join("")}
  </div>

  ${sec("Today's runs & cost")}
  <div class="av3-card av3-card-p">${chart()}<div style="font-size:12px;color:var(--av3-muted);margin-top:12px;display:flex;gap:18px"><span>26 runs today</span><span>·</span><span>37.10 zł this week</span><span>·</span><span>4 agents on a daily cadence</span></div></div>

  <div style="display:flex;gap:8px;justify-content:center;margin-top:20px">
    <button class="av3-btn av3-btn-primary">Run today's briefing</button>
    <button class="av3-btn">Export PDF</button>
  </div>
</div>`;

/* =================== BENTO =================== */
const gauge = (pct,label,sub)=>`<div class="av3-card av3-card-p"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600">${label}</div><div style="display:flex;align-items:center;gap:14px;margin-top:8px"><div style="width:62px;height:62px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:conic-gradient(var(--av3-ok) ${pct*3.6}deg,var(--av3-s3) 0)"><span style="width:46px;height:46px;border-radius:50%;background:var(--av3-s1);display:grid;place-items:center;font-family:var(--av3-mono);font-weight:700;font-size:13px">${pct}%</span></div><div style="font-size:12px;color:var(--av3-muted)">${sub}</div></div></div>`;
const bentoBody = `
<div class="bento">
  <div class="av3-card av3-card-p span2r">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600">Today's sales</div>
    <div style="font-family:var(--av3-display);font-size:42px;font-weight:600;letter-spacing:-.01em;margin-top:6px">4 280 zł</div>
    <div style="font-size:12.5px;color:var(--av3-muted)">86% of the 5 000 zł goal</div>
    <div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin:10px 0 18px"><span style="display:block;height:100%;width:86%;background:var(--av3-warn)"></span></div>
    ${chart()}
  </div>
  ${gauge(93,"Fleet success · 7d","55 ok<br>4 failed")}
  <div class="av3-card av3-card-p"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600">Cost</div><div style="font-family:var(--av3-display);font-size:30px;font-weight:600;margin-top:6px">214.80 zł</div><div style="font-size:11.5px;color:var(--av3-muted)">month · 37.10 zł / 7d</div></div>

  <div class="av3-card span2r"><div class="av3-card-head"><div class="av3-card-title">Needs you</div><span class="av3-badge av3-badge-bad">${APPR.length}</span></div><div class="av3-card-body" style="padding:4px 16px">${appr()}</div></div>

  <div class="av3-card av3-card-p span2"><div class="av3-card-title" style="margin-bottom:10px">Cost & quality</div><div class="av3-kpi-rail" style="grid-template-columns:repeat(2,1fr)">${COST.map(k=>kpi(...k)).join("")}</div></div>

  <div class="av3-card span2"><div class="av3-card-head"><div class="av3-card-title">Fleet</div><div class="av3-card-desc">click an agent to edit</div></div><div class="av3-card-body" style="padding:6px 14px">${orgTree()}</div></div>

  <div class="av3-card span2"><div class="av3-card-head"><div class="av3-card-title">Recent activity</div></div><div class="av3-card-body" style="padding:4px 16px">
    ${[["cfo","escalation","Food cost breached 36% — needs a repricing call","14:21","bad"],["cfo","run","Chat turn — 0.42 zł","14:20","info"],["cmo","approval","Decision executed: Tue espresso 2-for-1","yest","warn"],["coo","run","Daily briefing contribution","08:01","info"]].map((e,i,arr)=>`<div style="display:flex;gap:9px;padding:9px 0;${i<arr.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge av3-badge-${e[4]}">${e[1]}</span><div style="flex:1"><div style="font-size:12.5px"><strong>${byId[e[0]].name}</strong> — ${e[2]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${e[3]}</div></div></div>`).join("")}
  </div></div>

  <div class="av3-card av3-card-p span2"><div class="av3-card-title" style="margin-bottom:10px">Upcoming work</div>
    ${[["Re-cost the pizza line","cfo","queued"],["Tue daypart campaign","cmo","queued"],["Roster fix for Fri push","coo","running"]].map((w,i,arr)=>`<div style="display:flex;gap:9px;padding:8px 0;${i<arr.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:center"><span class="av3-badge av3-badge-${w[2]==="running"?"warn":"info"}">${w[2]}</span><span style="font-size:12.5px;flex:1">${w[0]}</span>${mono(byId[w[1]],22)}</div>`).join("")}
  </div>
  <div class="av3-card av3-card-p span2"><div class="av3-card-title" style="margin-bottom:10px">Scheduled</div>
    ${["ceo","coo","cfo","cmo"].map((id,i,arr)=>`<div style="display:flex;gap:9px;padding:8px 0;${i<arr.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:center">${mono(byId[id],22)}<span style="font-size:12.5px;flex:1">${byId[id].name}</span><span class="av3-badge av3-badge-ok">daily</span><span style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono)">08:00</span></div>`).join("")}
  </div>
</div>`;

writeFileSync(join(HERE,"..","agent-hq-console.html"), page("Console","Master–detail console — agents left, a deep working panel right","Agents", consoleBody, consoleScript));
writeFileSync(join(HERE,"..","agent-hq-daily-brief.html"), page("Daily Brief","A reading-first morning brief for the fleet","Command", briefBody));
writeFileSync(join(HERE,"..","agent-hq-bento.html"), page("Bento Grid","An asymmetric tile dashboard for the fleet","Command", bentoBody));
console.log("wrote agent-hq-console.html, agent-hq-daily-brief.html, agent-hq-bento.html");
