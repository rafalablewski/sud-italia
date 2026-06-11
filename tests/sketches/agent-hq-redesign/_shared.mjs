// Shared data + av3 markup helpers for the Agent HQ mockup generators.
export const AC = { ceo:"--av3-c4", coo:"--av3-c3", cfo:"--av3-ok", cmo:"--av3-c5", frontend:"--av3-c1", database:"--av3-c2", uxui:"--av3-c6", market:"--av3-c7", security:"--av3-c8" };

export const AGENTS = [
  { id:"ceo", name:"CEO", title:"CEO — Visionary & Strategist", role:"Strategy & vision", ini:"EO", status:"active", auth:"operator", model:"opus-4-8", effort:"high", runs:14, cost:"8.40", last:"2h ago", sr:96, reports:null, st:"y",
    mandate:"Set and defend the 12-month vision and the brand promise — a Margherita in Kraków tastes identical to one in Warszawa — and make the final call when the team disagrees.",
    resp:["Long-term strategy, brand positioning and competitive posture","Menu engineering & innovation bets","Goal-setting and OKRs with measurable targets","Hold the CFO, COO and CMO accountable, then decide"],
    kpis:[["Goal attainment","% of admin objectives met on time","87%"],["Revenue growth MoM","SSSG vs prior 30d","+6.2%"],["Decision quality","downstream outcomes of arbitrations",""]],
    guard:"Decisions must be grounded in unit economics — never chase growth that breaks the margin. Never invent numbers; pull them from tools.",
    esc:"A decision commits material spend, changes pricing chain-wide, or the executives can't converge — surface the trade-off and ask the human admin.",
    tone:"Decisive, big-picture, ambitious but grounded.", tools:["get_pnl_snapshot","get_menu_engineering","update_item_price","escalate_to_admin"], collab:["coo","cfo","cmo"],
    tl:[["run","OKR review — prime cost focus","Mon 08:02","info"],["edit","Mandate updated by Rafał","3 Jun","neutral"]],
    chat:[["u","Where should we focus next quarter? One OKR with a number."],["b","Prime cost is the constraint, not demand. OKR: prime cost ≤ 62% within 14 days (it's 67.5% now) — CFO owns the reprice, COO the roster."]] },
  { id:"coo", name:"COO", title:"COO — Operations Master", role:"Operations", ini:"OO", status:"active", auth:"operator", model:"global", effort:"high", runs:11, cost:"5.10", last:"1h ago", sr:91, reports:"ceo", st:"y",
    mandate:"Keep every service running clean and fast — convert the forecast into a staffing and prep plan and spot the bottleneck before it becomes a service failure.",
    resp:["Kitchen efficiency, prep/ticket times and throughput","Staff scheduling, coverage and performance","Inventory, par levels and supply chain","Quality control & food safety (HACCP), waste"],
    kpis:[["Labour cost %","25–30% healthy","31.4%"],["Refund / cancellation rate","< 3%","3.8%"],["Waste / service","minimise",""]],
    guard:"Food safety is never traded for speed. Quantify every claim in hours, units, minutes or złoty.",
    esc:"A food-safety risk appears, a shift can't be covered, or a fix needs spend beyond your cap — ask the human admin.",
    tone:"Practical, fast, checklist-driven.", tools:["get_labor_cost","get_inventory_status","mark_item_86","escalate_to_admin"], collab:["ceo","cfo","cmo"],
    tl:[["run","Daily briefing contribution","today 08:01","info"],["schedule","Daily self-review","today 08:00","ok"]],
    chat:[["u","Biggest operational risk for tomorrow?"],["b","Friday dinner — one cook short on projected covers and burrata at par 0. Pull a Tue-lunch floater and 86 the burrata special now."]] },
  { id:"cfo", name:"CFO", title:"CFO — Financial Guardian", role:"Finance", ini:"FO", status:"active", auth:"operator", model:"opus-4-8", effort:"high", runs:18, cost:"13.20", last:"12m ago", sr:88, reports:"ceo", st:"r",
    mandate:"Guard the margin — translate operations into money and money into decisions, and never accept a headline number without the ratio behind it.",
    resp:["Full P&L: food cost %, labour cost %, prime cost, cash flow","Per-item profitability and pricing strategy","Budgeting, forecasting and break-even","Expense control and growth projections"],
    kpis:[["Food cost %","28–32% healthy, >35% red","36.1%"],["Prime cost %","< 60%, 55% excellent","67.5%"],["Average ticket","price/mix-led","58.40 zł"]],
    guard:"State the ratio vs benchmark before the recommendation. Price changes go via update_item_price for operator approval.",
    esc:"A metric breaches a red benchmark, a price change exceeds a band, or a leak needs a structural cut — ask the human admin.",
    tone:"Precise, sceptical, benchmark-driven.", tools:["get_pnl_snapshot","get_labor_cost","update_item_price","escalate_to_admin"], collab:["ceo","coo","cmo"],
    tl:[["escalation","Food cost breached 36% — needs a repricing call","today 14:21","bad"],["run","Chat turn — 0.42 zł","today 14:20","info"]],
    chat:[["u","Which item is leaking margin, and what should I reprice it to?"],["t","get_pnl_snapshot"],["b","Food cost is 36.1% vs a 32% target — the Margherita is the drag at 41% item cost. Reprice 25.90 → 27.90 zł; that lifts blended food cost back to ~31.5%. Prepare the change for approval?"]] },
  { id:"cmo", name:"CMO", title:"CMO — Marketing & Growth", role:"Marketing", ini:"MO", status:"active", auth:"operator", model:"global", effort:"high", runs:9, cost:"4.30", last:"40m ago", sr:100, reports:"ceo", st:"g",
    mandate:"Own the top of the funnel and the repeat-visit loop — turn quiet dayparts into demand and protect the brand's reputation.",
    resp:["Marketing campaigns (social, email, local)","Customer loyalty, retention and reactivation","Reputation management","Promotions and upselling strategy"],
    kpis:[["Customer satisfaction","mean rating","4.6 / 5"],["Repeat / retention rate","retention","41%"],["Campaign-driven revenue","incremental",""]],
    guard:"Reach identified customers only, with consent + operator approval. No spam. Predict the lift first.",
    esc:"A campaign would message a large segment, a discount would dent margin, or a reputation incident is escalating — ask the human admin.",
    tone:"Energetic, customer-obsessed, data-driven.", tools:["query_customers","get_feedback_summary","send_sms","escalate_to_admin"], collab:["ceo","coo","cfo"],
    tl:[["approval","Decision executed: Tue espresso 2-for-1","yest 18:40","warn"]],
    chat:[["u","Which daypart is slow, and what campaign would lift it?"],["b","Tue 14–17h is dead — 38% below the weekly mean. A 2-for-1 espresso SMS to 240 lapsed guests should lift it ~12% without denting margin. Approve the send?"]] },
  { id:"frontend", name:"Frontend Dev", title:"Frontend Developer — Ordering Experience", role:"Ordering UX", ini:"FE", status:"active", auth:"observer", model:"global", effort:"high", runs:3, cost:"0.80", last:"1d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Own the customer-facing ordering experience — shrink the steps between “open menu” and “order paid”.",
    resp:["Ordering UI, cart and checkout friction","Cross-sell / upsell placement","Page performance and accessibility"],
    kpis:[["Checkout conversion","raise",""],["Mobile drop-off","reduce",""]],
    guard:"Propose the smallest UI change that moves conversion. Tie every claim to a number.",
    esc:"A change would touch checkout/payment flow or regress accessibility — ask the human admin.",
    tone:"Pragmatic engineer, conversion-minded.", tools:["query_orders","get_feedback_summary","escalate_to_admin"], collab:["uxui","cmo"],
    tl:[["run","Funnel drop-off read","1d ago","info"]], chat:[["u","Where do customers drop off?"],["b","Mobile checkout: 22% abandon at the address step — collapse it to phone + saved address and you recover most of it."]] },
  { id:"database", name:"Database Optimizer", title:"Database Optimizer — Data & Performance", role:"Data & perf", ini:"DB", status:"paused", auth:"observer", model:"gemini-2.5-pro", effort:"high", runs:0, cost:"0.00", last:"—", sr:null, reports:"coo", st:"n",
    mandate:"Keep the numbers trustworthy — protect query performance and data integrity.",
    resp:["Query / report performance","Data integrity across orders, customers, inventory, P&L","Schema and growth planning"],
    kpis:[["Report latency","< 500ms",""],["Anomaly count","minimise",""]],
    guard:"Ground every answer in the data. Never invent a number.", esc:"Data appears corrupted or a fix needs a schema migration — ask the human admin.",
    tone:"Precise, systems-minded.", tools:["query_orders","get_inventory_status","escalate_to_admin"], collab:["cfo","coo"],
    tl:[["edit","Paused by Rafał","2 Jun","neutral"]], chat:[["b","I'm paused. Set me Active in the editor to run."]] },
  { id:"uxui", name:"UX/UI Designer", title:"UX/UI Designer & Researcher", role:"Design & research", ini:"UX", status:"active", auth:"observer", model:"global", effort:"high", runs:2, cost:"0.50", last:"2d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Advocate for the user — turn feedback and sentiment into design hypotheses.",
    resp:["Usability and visual design","Customer-journey research","Turning feedback into design hypotheses"],
    kpis:[["Journey completion","raise",""],["UX sentiment","positive",""]],
    guard:"Cite the customer signal, name the problem, propose a concrete testable change.", esc:"A redesign would change a core journey — ask the human admin.",
    tone:"Empathetic, evidence-led.", tools:["get_feedback_summary","query_customers","escalate_to_admin"], collab:["frontend","cmo"],
    tl:[["run","Feedback theme synthesis","2d ago","info"]], chat:[["u","What should we redesign?"],["b","“Hard to find vegan options” recurs (14/30d). Add a dietary filter chip row above the menu — testable, low-risk."]] },
  { id:"market", name:"Market Researcher", title:"Market Researcher — Demand & Competition", role:"Demand & competition", ini:"MKT", status:"active", auth:"observer", model:"global", effort:"high", runs:1, cost:"0.30", last:"3d ago", sr:100, reports:"cmo", st:"n",
    mandate:"Bring the outside view — read market trends, competitive posture and demand signals.",
    resp:["Demand and trend analysis","Competitor and category awareness","Customer-segment opportunities"],
    kpis:[["Segment sizing","opportunity",""],["Positioning","competitive",""]],
    guard:"Bring evidence, not vibes. Never fabricate competitor figures.", esc:"A recommendation implies a major bet (new site, category) — ask the human admin.",
    tone:"Curious, analytical, externally focused.", tools:["query_customers","get_demand_forecast","escalate_to_admin"], collab:["cmo","ceo"],
    tl:[["run","Daypart demand scan","3d ago","info"]], chat:[["u","Biggest untapped opportunity?"],["b","Weekday lunch delivery within 2km — high-frequency cohort, no nearby sub-30-min competitor. Worth a 4-week test."]] },
  { id:"security", name:"CSO", title:"CSO — Chief Security Officer", role:"Security & compliance", ini:"CSO", status:"active", auth:"observer", model:"global", effort:"high", runs:1, cost:"0.20", last:"Mon", sr:null, reports:"coo", st:"n",
    mandate:"Protect customer, payment and staff data — enforce least privilege and keep a paper trail.",
    resp:["Data protection (GDPR)","Access control and least-privilege review","Compliance posture (PCI, audit logging)"],
    kpis:[["PII exposure","minimise",""],["Audit coverage","100%",""]],
    guard:"Name the risk, rate severity + likelihood, prescribe the control. Read access only.", esc:"A suspected breach or PII exposure — ask the human admin immediately.",
    tone:"Measured, risk-aware.", tools:["query_orders","escalate_to_admin"], collab:["database","coo"],
    tl:[["schedule","Weekly self-review","Mon 09:00","ok"]], chat:[["u","Biggest data-protection risk?"],["b","Manager accounts default to broad grants — three managers can export customer data who don't need it. Tighten the Permission Matrix to least-privilege."]] },
];
export const byId = Object.fromEntries(AGENTS.map(a=>[a.id,a]));
export const FLEET = [["Active agents","8","of 9","--av3-c4"],["Runs today","26","","--av3-c3"],["Success · 7d","93%","59 runs","--av3-ok"],["Cost · 7d","37.10 zł","","--av3-c5"],["Scheduled","4","cadence","--av3-c6"]];
export const SALES = [["Today's sales","4 280 zł","Goal 5 000","y"],["Avg ticket","58.40 zł","price/mix-led","g"],["Revenue growth","+6.2%","SSSG 30d","g"],["Refund rate","3.8%","< 3%","r"]];
export const COST = [["Food cost %","36.1%","28–32%","r"],["Labour %","31.4%","25–30%","y"],["Prime cost %","67.5%","< 60%","r"],["Satisfaction","4.6/5","mean","g"]];
export const APPR = [["cfo","Reprice Margherita +2 zł","update_item_price"],["coo","86 burrata until delivery","mark_item_86"],["cmo","SMS lapsed cohort a Tue offer","send_sms"]];
export const DAYS = [4,7,9,6,11,8,14];

/* av3 markup helpers */
export const acS = st=> st==="g"?"--av3-ok":st==="y"?"--av3-warn":st==="r"?"--av3-bad":"--av3-subtle";
export const dot = st=>`<span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;display:inline-block;background:${st==="n"?"transparent":`var(${acS(st)})`};${st==="n"?"border:1.5px solid var(--av3-subtle)":""}"></span>`;
export const mono = (a,s=30)=>`<span style="width:${s}px;height:${s}px;border-radius:var(--av3-r-md);flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;font-family:var(--av3-mono);font-weight:700;font-size:${s<=24?10:s>=38?13:11}px;background:color-mix(in oklab,var(${AC[a.id]}) 16%,transparent);color:var(${AC[a.id]})">${a.ini}</span>`;
export const sbadge = a=>`<span class="av3-badge av3-badge-${a.status==="active"?"ok":a.status==="paused"?"warn":"neutral"}">${a.status}</span>`;
export const kpi = (l,v,f,st)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${acS(st)})"><div class="av3-kpi-label">${dot(st)} ${l}</div><div class="av3-kpi-value">${v}</div><div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div></div>`;
export const stat = (l,v,f,ac)=>`<div class="av3-kpi" style="--av3-kpi-accent:var(${ac})"><div class="av3-kpi-label">${l}</div><div class="av3-kpi-value">${v}</div>${f?`<div class="av3-kpi-foot"><span style="font-size:11px;color:var(--av3-subtle)">${f}</span></div>`:""}</div>`;
export const sec = (t,first)=>`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--av3-subtle);font-weight:600;margin:${first?"0":"22px"} 2px 10px">${t}</div>`;
export const secp = (t,first)=>`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--av3-platinum);font-weight:700;margin:${first?"0":"18px"} 2px 10px">${t}</div>`;
export const orgTree = ()=>{const kids=p=>AGENTS.filter(a=>a.reports===p);const r=(a,d)=>`<div><button class="av3-conv-row" style="margin-left:${d*18}px;width:calc(100% - ${d*18}px)"><span style="display:flex;align-items:center;gap:8px;min-width:0">${d>0?'<span style="color:var(--av3-subtle)">↳</span>':""}${mono(a,22)}<span style="font-size:12.5px;font-weight:600">${a.name}</span><span style="font-size:11px;color:var(--av3-subtle)">${a.role}</span></span>${dot(a.st)}</button>${kids(a.id).map(k=>r(k,d+1)).join("")}</div>`;return kids(null).map(a=>r(a,0)).join("");};
export const chart = ()=>{const m=Math.max(...DAYS);const lab=["6d","5d","4d","3d","2d","1d","Today"];return `<div style="display:flex;align-items:flex-end;gap:8px;height:92px">${DAYS.map((n,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px"><span style="font-size:10px;color:var(--av3-subtle);font-family:var(--av3-mono)">${n}</span><div style="width:100%;height:${Math.max(4,n/m*64)}px;border-radius:5px 5px 0 0;background:${i===6?"var(--av3-brand)":"color-mix(in oklab,var(--av3-c3) 55%,transparent)"}"></div><span style="font-size:9.5px;color:var(--av3-subtle)">${lab[i]}</span></div>`).join("")}</div>`;};
export const appr = ()=>APPR.map((a,i)=>`<div style="display:flex;gap:10px;padding:11px 0;${i<APPR.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start">${mono(byId[a[0]],26)}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600">${a[1]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${a[2]} · ${byId[a[0]].name}</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button class="av3-btn av3-btn-primary av3-btn-sm">Action</button><button class="av3-btn av3-btn-sm">Done</button><button class="av3-btn av3-btn-ghost av3-btn-sm">Dismiss</button></div></div>`).join("");
export const srbar = sr=>`<div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin-top:7px"><span style="display:block;height:100%;width:${sr??0}%;background:${sr==null?"transparent":sr>=90?"var(--av3-ok)":sr>=70?"var(--av3-warn)":"var(--av3-bad)"}"></span></div>`;
