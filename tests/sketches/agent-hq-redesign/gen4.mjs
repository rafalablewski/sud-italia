// Full Agent HQ — all 8 tabs polished to the Console standard, ONE file with a
// working top switcher. Real admin-v3 stylesheet inlined; actual .av3-* classes.
//   node gen4.mjs  → ../agent-hq-full.html
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AGENTS, AC, byId, FLEET, SALES, COST, APPR, mono, dot, kpi, stat, sec, secp, orgTree, chart, appr, srbar, sbadge } from "./_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "..", "..", "..", "src/app/themes/admin-v3/index.css"), "utf8");

const RAIL = `display:grid;grid-template-columns:repeat(auto-fit,minmax(184px,1fr));gap:10px`;

/* ---------------- Command center ---------------- */
const cmd = `
<div style="${RAIL.replace('184px','188px')}">${FLEET.map(s=>stat(...s)).join("")}</div>
${sec("Sales & growth")}<div style="${RAIL}">${SALES.map(k=>kpi(...k)).join("")}</div>
${sec("Cost & quality")}<div style="${RAIL}">${COST.map(k=>kpi(...k)).join("")}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:22px;align-items:start">
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Org & reporting</div><div class="av3-card-desc">click an agent to open it</div></div><div class="av3-card-body" style="padding:6px 14px">${orgTree()}</div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Activity</div><div class="av3-card-desc">runs · last 7 days</div></div><div class="av3-card-body">${chart()}</div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Recent activity</div></div><div class="av3-card-body" style="padding:4px 14px">${[["cfo","escalation","Food cost breached 36%","14:21","bad"],["cfo","run","Chat turn — 0.42 zł","14:20","info"],["cmo","approval","Tue espresso 2-for-1 executed","yest","warn"],["coo","run","Daily briefing contribution","08:01","info"]].map((e,i,ar)=>`<div style="display:flex;gap:9px;padding:9px 0;${i<ar.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:flex-start"><span class="av3-badge av3-badge-${e[4]}">${e[1]}</span><div style="flex:1"><div style="font-size:12px"><strong>${byId[e[0]].name}</strong> — ${e[2]}</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">${e[3]}</div></div></div>`).join("")}</div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Upcoming work</div></div><div class="av3-card-body" style="padding:4px 14px">${[["Re-cost the pizza line","cfo","queued"],["Tue daypart campaign","cmo","queued"],["Roster fix for Fri push","coo","running"]].map((w,i,ar)=>`<div style="display:flex;gap:9px;padding:8px 0;${i<ar.length-1?"border-bottom:1px solid var(--av3-line)":""};align-items:center"><span class="av3-badge av3-badge-${w[2]==="running"?"warn":"info"}">${w[2]}</span><span style="font-size:12.5px;flex:1">${w[0]}</span>${mono(byId[w[1]],22)}</div>`).join("")}</div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Daily digest</div><div class="av3-card-desc">Daily briefing · 11 Jun</div></div><div class="av3-card-body" style="padding:6px 14px">${APPR.map((a,i,ar)=>`<div style="display:flex;gap:8px;padding:6px 0;align-items:flex-start"><span class="av3-badge" style="background:color-mix(in oklab,var(${AC[a[0]]}) 16%,transparent);color:var(${AC[a[0]]})">${byId[a[0]].ini}</span><span style="font-size:12.5px;flex:1">${a[1]}</span></div>`).join("")}</div></div>
  <div class="av3-card av3-card-p"><div class="av3-card-title">Monthly cost</div><div style="font-family:var(--av3-mono);font-size:23px;font-weight:500;letter-spacing:-.01em;margin:9px 0 5px">214.80 zł</div><div style="display:flex;gap:18px;margin-top:8px"><div><div style="font-size:11px;color:var(--av3-subtle)">7 days</div><div style="font-family:var(--av3-mono);font-size:14px">37.10 zł</div></div><div><div style="font-size:11px;color:var(--av3-subtle)">Runs 7d</div><div style="font-family:var(--av3-mono);font-size:14px">59</div></div></div></div>
</div>`;

/* ---------------- Agents (console — interactive via JS) ---------------- */
const agents = `
<div style="display:grid;grid-template-columns:minmax(0,268px) minmax(0,1fr);gap:14px;align-items:start">
  <div class="av3-card" style="position:sticky;top:14px"><div class="av3-card-head"><div class="av3-card-title">Agents</div><div class="av3-card-desc">pick one to open</div></div>
    <div class="av3-card-body" style="display:flex;flex-direction:column;gap:3px" id="agList">${AGENTS.map((a,i)=>`<button class="av3-conv-row" data-pick="${a.id}"><span style="display:flex;align-items:center;gap:9px;min-width:0">${mono(a,28)}<span style="min-width:0;text-align:left"><span style="display:block;font-size:12.5px;font-weight:600">${a.name}</span><span style="display:block;font-size:11px;color:var(--av3-subtle)">${a.role}</span></span></span>${sbadge(a)}</button>`).join("")}</div>
  </div>
  <div id="agPanel"></div>
</div>`;

/* ---------------- Scorecards ---------------- */
const scorecards = `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px;align-items:start">
${AGENTS.map(a=>`<div class="av3-card av3-card-p">
  <div style="display:flex;align-items:flex-start;gap:10px"><span style="margin-top:5px">${dot(a.st)}</span><div style="flex:1;min-width:0"><div style="font-family:var(--av3-display);font-size:17px;font-weight:600">${a.name}</div><div style="font-size:12px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:1px">${a.role} · ${a.model}</div></div><span class="av3-badge av3-badge-brand">${a.auth}</span></div>
  <div style="margin-top:16px"><div style="display:flex;justify-content:space-between;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600"><span>Success rate (7d)</span><span style="color:${a.sr==null?"var(--av3-subtle)":"var(--av3-fg)"}">${a.sr==null?"no runs":a.sr+"%"}</span></div>${srbar(a.sr)}</div>
  <div style="${RAIL};grid-template-columns:repeat(3,1fr);margin-top:14px">${stat("Runs 7d",String(a.runs),"","--av3-c3")}${stat("Cost 7d",a.cost+" zł","","--av3-c5")}${stat("Last run",a.last,"","--av3-c2")}</div>
  ${secp("KPIs — target vs actual")}
  ${a.kpis.map((k,i)=>`<div style="padding:10px 0;${i>0?"border-top:1px solid var(--av3-line)":""}"><div style="font-size:13px;font-weight:600">${k[0]}${k[1]?` <span style="font-weight:400;color:var(--av3-subtle)">· target ${k[1]}</span>`:""}</div><div style="font-size:12px;margin-top:3px;color:${k[2]?"var(--av3-fg)":"var(--av3-subtle)"}">${k[2]?`actual: <span style="font-family:var(--av3-mono)">${k[2]}</span>`:"no actual logged"}</div><div style="display:flex;gap:6px;margin-top:7px"><input class="av3-input" placeholder="log actual…" style="flex:1"><button class="av3-btn av3-btn-sm">Log</button></div></div>`).join("")}
</div>`).join("")}
</div>`;

/* ---------------- Work ---------------- */
const work = `
<div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Assign work</div><div class="av3-card-desc">create a task and drag it onto an agent — or pick one here</div></div>
  <div class="av3-card-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input class="av3-input" placeholder="Task title"><select class="av3-select"><option>Leave unassigned (drag later)</option>${AGENTS.map(a=>`<option>${a.name}</option>`).join("")}</select></div><textarea class="av3-input" placeholder="What should the agent do?" rows="2" style="margin-top:10px;font-family:var(--av3-ui)"></textarea><div style="margin-top:10px"><button class="av3-btn av3-btn-primary">Add work</button></div></div></div>
${sec("Drop onto an agent to assign")}
<div style="display:flex;flex-wrap:wrap;gap:8px">${AGENTS.filter(a=>a.status==="active").map(a=>`<div class="av3-card" style="padding:8px 12px;display:flex;align-items:center;gap:8px">${mono(a,24)}<span style="font-size:12.5px;font-weight:600">${a.name}</span></div>`).join("")}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:18px;align-items:start">
  ${[["Unassigned",[["Draft Q3 menu thesis",null,"unassigned"]]],["Queued",[["Re-cost the pizza line","cfo","queued"],["Tue daypart campaign","cmo","queued"],["Roster fix for Fri push","coo","running"]]],["Recent",[["Audit refund spikes","coo","done"],["Loyalty cohort read","cmo","done"]]]].map(([title,items])=>`<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--av3-subtle);font-weight:600;margin:0 2px 10px">${title} (${items.length})</div>${items.map(w=>`<div class="av3-card av3-card-pc" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="font-size:12.5px;font-weight:600">${w[0]}</div>${w[1]?mono(byId[w[1]],22):""}</div><div style="display:flex;gap:6px;margin-top:9px;align-items:center"><span class="av3-badge av3-badge-${w[2]==="done"?"ok":w[2]==="running"?"warn":w[2]==="queued"?"info":"neutral"}">${w[2]}</span>${w[2]==="queued"?'<button class="av3-btn av3-btn-sm" style="margin-left:auto">▶ Run</button>':""}</div></div>`).join("")}</div>`).join("")}
</div>`;

/* ---------------- Approvals ---------------- */
const approvals = `
<div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Pending approvals</div><div class="av3-card-desc">gated actions agents proposed — Action runs it via the owning agent; Done / Dismiss clear the queue</div></div>
  <div class="av3-card-body" style="padding:4px 16px">${appr()}</div></div>`;

/* ---------------- Inbox ---------------- */
const inboxChat = byId.cfo;
const inbox = `
<div class="av3-card" style="margin-bottom:12px"><div class="av3-card-head"><div class="av3-card-title">1 escalation from your agents</div><div class="av3-card-desc">an agent hit its escalation threshold</div></div>
  <div class="av3-card-body" style="padding:4px 16px"><div style="display:flex;gap:10px;padding:9px 0;align-items:flex-start"><span style="color:var(--av3-warn)">⚠</span><div style="flex:1"><div style="font-size:12.5px"><strong>CFO</strong> — Food cost breached 36% — needs a repricing call</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">high · 14:21</div></div><button class="av3-btn av3-btn-ghost av3-btn-sm">Open</button></div></div></div>
<div style="display:grid;grid-template-columns:minmax(0,240px) 1fr;gap:12px;align-items:start">
  <div class="av3-card"><div class="av3-card-body" style="display:flex;flex-direction:column;gap:3px">${AGENTS.map((a,i)=>`<button class="av3-conv-row ${i===2?"is-active":""}"><span style="display:flex;align-items:center;gap:9px;min-width:0">${mono(a,26)}<span style="min-width:0;text-align:left"><span style="display:block;font-size:12.5px;font-weight:600">${a.name}</span><span style="display:block;font-size:11px;color:var(--av3-subtle)">${a.status==="active"?a.auth:a.status}</span></span></span></button>`).join("")}</div></div>
  <div><div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">${inboxChat.name}</div><div class="av3-card-desc">${inboxChat.title}</div></div></div>
    <div class="av3-card" style="margin-top:0;border-top:0;border-radius:0 0 var(--av3-r-lg) var(--av3-r-lg)"><div class="av3-card-body"><div class="av3-chat-scroll" style="max-height:none">${inboxChat.chat.map(m=>m[0]==="u"?`<div class="av3-chat-user">${m[1]}</div>`:m[0]==="t"?`<div class="av3-tool is-ok"><div class="av3-tool-head"><span class="av3-tool-name">✓ ${m[1]}</span><span class="av3-badge av3-badge-ok">executed</span></div></div>`:`<div class="av3-chat-bot">${m[1]}</div>`).join("")}</div>
      <form class="av3-chat-composer" onsubmit="return false"><textarea class="av3-input av3-chat-input" rows="2" placeholder="Ask ${inboxChat.name}…"></textarea><button class="av3-btn av3-btn-primary">Send</button></form></div></div>
  </div>
</div>`;

/* ---------------- Reports ---------------- */
const tx = [["coo","Refund rate 3.8% and labour 31.4% — both drifting. Pull one Tue-lunch floater to the dinner push and cut comps."],["cfo","Food cost 36.1% is the fire — a red breach. Margherita is the leak; +2 zł restores ~31.5% blended."],["cmo","Tue 14–17h is dead. A 2-for-1 espresso to 240 lapsed guests lifts the daypart without denting margin."],["ceo","OKR: prime cost under 62% in 2 weeks. CFO owns the reprice, COO the roster, CMO the daypart push."]];
const reports = `
<div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Reports</div><div class="av3-card-desc">daily briefings & weekly reviews — transcript, decisions, spend</div></div>
  <div class="av3-card-body"><button class="av3-btn av3-btn-primary">Run daily briefing</button> <button class="av3-btn">Run weekly review</button></div></div>
<div class="av3-filterchips" style="margin-top:12px"><button class="av3-fchip is-active">Daily · 11 Jun</button><button class="av3-fchip">Weekly · 9 Jun</button><button class="av3-fchip">Daily · 10 Jun</button></div>
<div class="av3-card" style="margin-top:12px"><div class="av3-card-head"><div><div class="av3-card-title">Daily briefing — All locations</div><div class="av3-card-desc">11 Jun 2026, 08:01 · session cost 1.84 zł</div></div><div style="display:flex;gap:6px"><button class="av3-btn av3-btn-ghost av3-btn-sm">CSV</button><button class="av3-btn av3-btn-ghost av3-btn-sm">PDF</button></div></div>
  <div class="av3-card-body"><div style="font-size:12px;color:var(--av3-muted);margin-bottom:12px"><strong style="color:var(--av3-fg)">Agenda:</strong> 4 off-target metrics.</div>
  ${tx.map((c,i)=>`<div style="display:flex;gap:11px;padding:12px 0;${i<tx.length-1?"border-bottom:1px solid var(--av3-line)":""}">${mono(byId[c[0]],30)}<div><div style="font-size:11px;font-weight:700;color:var(${AC[c[0]]})">${byId[c[0]].name}</div><div style="font-size:13px;line-height:1.6;margin-top:2px">${c[1]}</div></div></div>`).join("")}
  <div style="font-size:12px;font-weight:700;margin:14px 0 8px">Decisions</div>
  ${APPR.map(a=>`<div style="display:flex;gap:10px;padding:8px 0;align-items:flex-start"><span class="av3-badge" style="background:color-mix(in oklab,var(${AC[a[0]]}) 16%,transparent);color:var(${AC[a[0]]})">${byId[a[0]].ini}</span><div style="flex:1"><div style="font-size:13px;font-weight:600">${a[1]}</div><div style="font-size:11px;font-family:var(--av3-mono);color:var(--av3-subtle);margin-top:2px">${a[2]}</div></div></div>`).join("")}</div></div>`;

/* ---------------- Settings ---------------- */
const sw = (on,label)=>`<button class="av3-switch" aria-checked="${on}"><span class="av3-switch-track"><span class="av3-switch-thumb"></span></span><span class="av3-switch-label">${label}</span></button>`;
const settings = `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;align-items:start">
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">AI model</div><div class="av3-card-desc">the model the whole fleet runs on</div></div><div class="av3-card-body"><select class="av3-select" style="width:100%"><option>Claude Opus 4.8</option><option>Claude Sonnet 4.6</option><option>Claude Haiku 4.5</option><option>Gemini 2.5 Pro</option></select><div style="font-size:11px;color:var(--av3-subtle);margin-top:8px">Per-agent overrides inherit this when set to “Global model”.</div></div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Daily AI budget</div><div class="av3-card-desc">fleet-wide spend ceiling</div></div><div class="av3-card-body">
    <div style="font-family:var(--av3-mono);font-size:23px;font-weight:500">37.10 zł <span style="font-size:13px;color:var(--av3-subtle)">/ 1000.00 today</span></div>
    <div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin:8px 0 16px"><span style="display:block;height:100%;width:4%;background:var(--av3-ok)"></span></div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600;margin-bottom:5px">Daily cap (PLN)</div>
    <div style="display:flex;gap:8px"><input class="av3-input" placeholder="blank = env / default" style="flex:1"><button class="av3-btn av3-btn-primary">Save</button></div></div></div>
  <div class="av3-card"><div class="av3-card-head"><div class="av3-card-title">Automation</div><div class="av3-card-desc">fleet scheduling defaults</div></div><div class="av3-card-body">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0"><div><div style="font-size:13px;font-weight:600">Auto daily briefing</div><div style="font-size:11.5px;color:var(--av3-subtle);margin-top:2px">the briefing cron convenes the board each morning</div></div>${sw(true,"")}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--av3-line)"><div style="font-size:13px;font-weight:600">Briefing time</div><input type="time" class="av3-input" value="08:00" style="width:130px"></div></div></div>
</div>`;

const SECTIONS = [["command","Command center",cmd],["agents","Agents",agents],["scorecards","Scorecards",scorecards],["work","Work",work],["approvals","Approvals",approvals],["inbox","Inbox",inbox],["reports","Reports",reports],["settings","Settings",settings]];

/* console browser script (Agents tab) */
const consoleData = JSON.stringify(AGENTS.map(a=>({...a,ac:AC[a.id]})));
const consoleScript = `
const CA=${consoleData};const cbyId=Object.fromEntries(CA.map(a=>[a.id,a]));let ccur="cfo",ctab="overview";
const cacS=s=>s==="g"?"--av3-ok":s==="y"?"--av3-warn":s==="r"?"--av3-bad":"--av3-subtle";
const cdot=s=>'<span style="width:7px;height:7px;border-radius:50%;display:inline-block;background:'+(s==="n"?"transparent":"var("+cacS(s)+")")+';'+(s==="n"?"border:1.5px solid var(--av3-subtle)":"")+'"></span>';
const cmono=(a,s=30)=>'<span style="width:'+s+'px;height:'+s+'px;border-radius:var(--av3-r-md);display:inline-flex;align-items:center;justify-content:center;font-family:var(--av3-mono);font-weight:700;font-size:'+(s<=24?10:11)+'px;background:color-mix(in oklab,var('+a.ac+') 16%,transparent);color:var('+a.ac+')">'+a.ini+'</span>';
const cstat=(l,v,ac)=>'<div class="av3-kpi" style="--av3-kpi-accent:var('+ac+')"><div class="av3-kpi-label">'+l+'</div><div class="av3-kpi-value">'+v+'</div></div>';
const ceb=t=>'<div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--av3-platinum);font-weight:700;margin:18px 2px 10px">'+t+'</div>';
const cbar=sr=>'<div style="height:6px;border-radius:999px;background:var(--av3-s3);overflow:hidden;margin-top:7px"><span style="display:block;height:100%;width:'+(sr??0)+'%;background:'+(sr==null?"transparent":sr>=90?"var(--av3-ok)":sr>=70?"var(--av3-warn)":"var(--av3-bad)")+'"></span></div>';
const cprompt=a=>['You are '+a.name+', the '+a.title+'.','','MANDATE\\n  '+a.mandate,'RESPONSIBILITIES\\n'+a.resp.map(r=>"  - "+r).join("\\n"),'TONE\\n  '+a.tone,'GUARDRAILS\\n  '+a.guard,'ESCALATION\\n  '+a.esc].join("\\n\\n");
function crender(){const a=cbyId[ccur];
 document.querySelectorAll('#agList [data-pick]').forEach(b=>b.classList.toggle('is-active',b.dataset.pick===ccur));
 const T=['overview','charter','scorecard','timeline','chat'];let inner="";
 if(ctab==="overview"){inner='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'+cstat("Runs 7d",a.runs,"--av3-c3")+cstat("Cost 7d",a.cost+" zł","--av3-c5")+cstat("Last run",a.last,"--av3-c2")+cstat("Success 7d",a.sr==null?"—":a.sr+"%","--av3-ok")+'</div>'+'<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.5px;margin-top:16px"><span>Success rate · 7d</span><span style="color:var(--av3-fg)">'+(a.sr==null?"no runs":a.sr+"%")+'</span></div>'+cbar(a.sr)+ceb("Recent")+a.tl.map((e,i)=>'<div style="display:flex;gap:9px;padding:9px 0;'+(i<a.tl.length-1?"border-bottom:1px solid var(--av3-line)":"")+'"><span class="av3-badge av3-badge-'+e[3]+'">'+e[0]+'</span><div style="flex:1"><div style="font-size:12.5px">'+e[1]+'</div><div style="font-size:10.5px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:2px">'+e[2]+'</div></div></div>').join("");}
 else if(ctab==="charter"){const row=(l,v)=>'<div style="margin-bottom:14px"><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--av3-subtle);font-weight:600;margin-bottom:4px">'+l+'</div><div style="font-size:13px;line-height:1.55">'+v+'</div></div>';inner=row("Mandate",a.mandate)+row("Responsibilities","<ul style='margin:0;padding-left:16px'>"+a.resp.map(r=>"<li>"+r+"</li>").join("")+"</ul>")+row("KPIs","<ul style='margin:0;padding-left:16px'>"+a.kpis.map(k=>"<li>"+k[0]+(k[1]?" — target "+k[1]:"")+"</li>").join("")+"</ul>")+row("Tone",a.tone)+row("Guardrails & ethics",a.guard)+row("Escalation threshold",a.esc)+row("Tools",a.tools.map(t=>'<span class="av3-badge av3-badge-neutral" style="font-family:var(--av3-mono);margin:0 4px 4px 0;display:inline-flex">'+t+'</span>').join(""))+'<details><summary style="cursor:pointer;font-size:12px;color:var(--av3-subtle)">Live system prompt</summary><pre style="white-space:pre-wrap;font-size:11.5px;line-height:1.55;font-family:var(--av3-mono);background:var(--av3-s2);border:1px solid var(--av3-line);border-radius:var(--av3-r-md);padding:12px;margin-top:8px">'+cprompt(a).replace(/</g,"&lt;")+'</pre></details>';}
 else if(ctab==="scorecard"){inner='<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--av3-muted);text-transform:uppercase;letter-spacing:.5px"><span>Success rate · 7d</span><span style="color:var(--av3-fg)">'+(a.sr==null?"no runs":a.sr+"%")+'</span></div>'+cbar(a.sr)+'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">'+cstat("Runs 7d",a.runs,"--av3-c3")+cstat("Cost 7d",a.cost+" zł","--av3-c5")+cstat("Last run",a.last,"--av3-c2")+'</div>'+ceb("KPIs — target vs actual")+a.kpis.map((k,i)=>'<div style="padding:10px 0;'+(i>0?"border-top:1px solid var(--av3-line)":"")+'"><div style="font-size:13px;font-weight:600">'+k[0]+(k[1]?' <span style="font-weight:400;color:var(--av3-subtle)">· target '+k[1]+'</span>':"")+'</div><div style="font-size:12px;margin-top:3px;color:'+(k[2]?"var(--av3-fg)":"var(--av3-subtle)")+'">'+(k[2]?'actual: <span style="font-family:var(--av3-mono)">'+k[2]+'</span>':"no actual logged")+'</div><div style="display:flex;gap:6px;margin-top:7px"><input class="av3-input" placeholder="log actual…" style="flex:1"><button class="av3-btn av3-btn-sm">Log</button></div></div>').join("");}
 else if(ctab==="timeline"){inner=a.tl.map((e,i)=>'<div style="display:flex;gap:10px;padding:10px 0;'+(i<a.tl.length-1?"border-bottom:1px solid var(--av3-line)":"")+'"><span class="av3-badge av3-badge-'+e[3]+'">'+e[0]+'</span><div style="flex:1"><div style="font-size:12.5px">'+e[1]+'</div><div style="font-size:11px;color:var(--av3-subtle);font-family:var(--av3-mono);margin-top:3px">'+e[2]+'</div></div></div>').join("");}
 else{inner='<div class="av3-chat-scroll" style="max-height:none">'+a.chat.map(m=>m[0]==="u"?'<div class="av3-chat-user">'+m[1]+'</div>':m[0]==="t"?'<div class="av3-tool is-ok"><div class="av3-tool-head"><span class="av3-tool-name">✓ '+m[1]+'</span><span class="av3-badge av3-badge-ok">executed</span></div></div>':'<div class="av3-chat-bot">'+m[1]+'</div>').join("")+'</div><form class="av3-chat-composer" onsubmit="return false"><textarea class="av3-input av3-chat-input" rows="2" placeholder="Ask '+a.name+'…"></textarea><button class="av3-btn av3-btn-primary">Send</button></form>';}
 document.getElementById('agPanel').innerHTML='<div class="av3-card"><div class="av3-card-head"><div style="display:flex;align-items:center;gap:10px">'+cmono(a,32)+'<div><div class="av3-card-title" style="font-size:16px">'+a.name+'</div><div class="av3-card-desc">'+a.title+' · '+a.model+' · '+a.auth+'</div></div></div><button class="av3-btn av3-btn-primary av3-btn-sm">Edit</button></div><div style="padding:12px 16px 0"><div class="av3-filterchips">'+T.map(t=>'<button class="av3-fchip '+(t===ctab?"is-active":"")+'" data-ctab="'+t+'">'+(t[0].toUpperCase()+t.slice(1))+'</button>').join("")+'</div></div><div class="av3-card-body">'+inner+'</div></div>';
}
document.getElementById('agList').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(b){ccur=b.dataset.pick;ctab="overview";crender();}});
document.getElementById('agPanel').addEventListener('click',e=>{const b=e.target.closest('[data-ctab]');if(b){ctab=b.dataset.ctab;crender();}});
crender();
`;

const switcher = `<div class="av3-filterchips">${SECTIONS.map(([id,label],i)=>`<button class="av3-fchip ${i===0?"is-active":""}" data-sec="${id}">${label}</button>`).join("")}</div>`;
const body = SECTIONS.map(([id,,html],i)=>`<section class="hqsec" data-sec="${id}" style="${i===0?"":"display:none"}">${html}</section>`).join("");

const html = `<!doctype html><html lang="en" data-admin-theme="dark"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Agent HQ — full (8 tabs)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}
body{padding:22px clamp(14px,3vw,40px) 60px}</style></head>
<body class="av3-root">
<div style="font-size:11.5px;color:var(--av3-subtle);background:var(--av3-s2);border:1px dashed var(--av3-line-strong);border-radius:var(--av3-r-md);padding:8px 12px;margin-bottom:16px">Agent HQ — <b style="color:var(--av3-platinum)">all 8 tabs, polished</b> · real admin-v3 stylesheet, dark theme. Use the chips to switch tabs; the Agents tab is interactive. Data illustrative.</div>
<div class="av3-pagehead" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:11px"><span style="width:34px;height:34px;border-radius:var(--av3-r-md);display:grid;place-items:center;background:var(--av3-brand-soft);color:var(--av3-brand);font-family:var(--av3-display);font-weight:600">HQ</span><div><h1>Agent HQ</h1><div class="av3-pagehead-sub">AI agent fleet · All locations</div></div></div></div>
<div id="hqsw" style="margin-bottom:18px">${switcher}</div>
${body}
<script>
const sw=document.getElementById('hqsw');
sw.addEventListener('click',e=>{const b=e.target.closest('[data-sec]');if(!b)return;[...sw.querySelectorAll('[data-sec]')].forEach(c=>c.classList.toggle('is-active',c===b));document.querySelectorAll('.hqsec').forEach(s=>s.style.display=s.dataset.sec===b.dataset.sec?"":"none");window.scrollTo({top:0,behavior:'smooth'});});
${consoleScript}
</script>
</body></html>`;

writeFileSync(join(HERE, "..", "agent-hq-full.html"), html);
console.log("wrote agent-hq-full.html");
