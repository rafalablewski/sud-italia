"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { guestTabs } from "./guestTabs";

interface CrmCustomer {
  phone: string;
  name: string;
  email: string | null;
  member: boolean;
  vip: boolean;
  birthday: string | null;
  totalSpent: number;
  orderCount: number;
  avgOrderValue: number;
  points: number;
  tier: string;
  lastOrderAt: string | null;
  lastDays: number | null;
  channels: string[];
  noShows: number;
  reliability: number;
  lifecycle: "new" | "active" | "repeat" | "lapsed";
  source: string;
  recent: { id: string; createdAt: string; total: number; fulfillment: string; location: string; items: { name: string; qty: number }[] }[];
  smsOptIn: boolean;
  emailOptIn: boolean;
}
interface NoteRow {
  id: string;
  phone: string;
  body: string;
  authoredBy?: string;
  createdAt: string;
}

const SEGS = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "members", label: "Members" },
  { key: "active", label: "Active" },
  { key: "repeat", label: "Repeat" },
  { key: "new", label: "New" },
  { key: "lapsed", label: "Lapsed" },
];
const SORTS = [
  { key: "ltv", label: "Value" },
  { key: "recent", label: "Recency" },
  { key: "orders", label: "Orders" },
  { key: "points", label: "Points" },
  { key: "name", label: "Name" },
];

const PERIODS = [
  { key: "all", label: "Any time" },
  { key: "1", label: "24h" },
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
];
const CHANNEL_LABEL: Record<string, string> = {
  "dine-in": "Dine-in",
  takeout: "Takeaway",
  takeaway: "Takeaway",
  delivery: "Delivery",
  whatsapp: "WhatsApp",
  web: "Web",
};
const chanLabel = (k: string) => CHANNEL_LABEL[k.toLowerCase()] ?? k.charAt(0).toUpperCase() + k.slice(1);

const zl = (g: number) => (g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const seen = (d: number | null) => (d == null ? "never" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`);

function rfm(c: CrmCustomer) {
  const d = c.lastDays ?? 999;
  const r = d <= 7 ? 100 : d <= 14 ? 86 : d <= 30 ? 66 : d <= 45 ? 46 : d <= 75 ? 26 : 9;
  const f = Math.min(100, c.orderCount * 9);
  const m = Math.min(100, Math.round(c.totalSpent / 1600));
  return { r, f, m, rel: c.reliability };
}
function health(c: CrmCustomer): number {
  if (c.orderCount === 0) return c.member ? 40 : 20;
  const { r, f, m, rel } = rfm(c);
  return Math.max(0, Math.round(0.38 * r + 0.22 * f + 0.15 * m + 0.25 * rel));
}
function healthTier(h: number): { label: string; tone: string } {
  if (h >= 70) return { label: "Loyal", tone: "ok" };
  if (h >= 50) return { label: "Steady", tone: "ok" };
  if (h >= 34) return { label: "Cooling", tone: "warn" };
  if (h >= 18) return { label: "At risk", tone: "bad" };
  return { label: "Churned", tone: "bad" };
}
function inSeg(c: CrmCustomer, seg: string): boolean {
  switch (seg) {
    case "all": return true;
    case "vip": return c.vip;
    case "members": return c.member;
    default: return c.vip ? false : c.lifecycle === seg;
  }
}

/**
 * Core v2 · Guest · Guests (CRM) — the customer book, wired to the same engine
 * as today's /core/guest/crm: GET /api/admin/crm, notes via customer-notes,
 * points via members/points, consent via …/consent. Roster + segments + health
 * + a profile drawer. Own cv- UI.
 */
export function CoreV2Crm() {
  const toast = useCoreToast();
  const { location } = useLocation();
  const [data, setData] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState("all");
  const [chan, setChan] = useState("all");
  const [recency, setRecency] = useState("all");
  const [sort, setSort] = useState("ltv");
  const [eraseOpen, setEraseOpen] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [ptAmount, setPtAmount] = useState("");
  const [ptReason, setPtReason] = useState("");
  const [msgChannel, setMsgChannel] = useState<"sms" | "email">("sms");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = location ? `?location=${encodeURIComponent(location)}` : "";
      const res = await fetch(`/api/admin/crm${q}`);
      const d = res.ok ? await res.json() : [];
      setData(Array.isArray(d) ? d : d.customers ?? []);
    } finally {
      setLoading(false);
    }
  }, [location]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setNotes([]);
      return;
    }
    fetch(`/api/admin/customer-notes?phone=${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setNotes(Array.isArray(d) ? d : d.notes ?? []))
      .catch(() => {});
  }, [selected]);

  // Channels actually present in the book — drives the channel filter chips.
  const channelKeys = useMemo(() => Array.from(new Set(data.flatMap((c) => c.channels))).sort(), [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recN = recency === "all" ? null : Number(recency);
    const rows = data.filter(
      (c) =>
        inSeg(c, seg) &&
        (chan === "all" || c.channels.includes(chan)) &&
        (recN == null || (c.lastDays != null && c.lastDays <= recN)) &&
        (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q)),
    );
    rows.sort((a, b) => {
      switch (sort) {
        case "recent": return (a.lastDays ?? 999) - (b.lastDays ?? 999);
        case "orders": return b.orderCount - a.orderCount;
        case "points": return b.points - a.points;
        case "name": return a.name.localeCompare(b.name);
        default: return b.totalSpent - a.totalSpent;
      }
    });
    return rows;
  }, [data, query, seg, chan, recency, sort]);

  const kpis = useMemo(() => {
    const members = data.filter((c) => c.member).length;
    const vip = data.filter((c) => c.vip).length;
    const ltv = data.reduce((s, c) => s + c.totalSpent, 0);
    return [
      { l: "Customers", v: String(data.length) },
      { l: "Members", v: String(members) },
      { l: "VIP", v: String(vip) },
      { l: "Total LTV", v: `${zl(ltv)} zł` },
    ];
  }, [data]);

  const cust = data.find((c) => c.phone === selected) ?? null;

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    const res = await fetch("/api/admin/customer-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selected, body: noteDraft.trim() }),
    });
    if (res.ok) {
      setNoteDraft("");
      const d = await res.json().catch(() => null);
      const row: NoteRow | null = d?.id ? d : d?.note ?? null;
      if (row) setNotes((n) => [row, ...n]);
      toast("Note added", "success");
    } else toast("Could not add note", "danger");
  };
  const delNote = async (id: string) => {
    const res = await fetch(`/api/admin/customer-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setNotes((n) => n.filter((x) => x.id !== id));
  };
  const adjustPoints = async () => {
    const amt = parseInt(ptAmount, 10);
    if (!selected || !Number.isFinite(amt) || amt === 0) return;
    const res = await fetch("/api/admin/members/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selected, amount: amt, reason: ptReason.trim() || "Manual adjustment" }),
    });
    if (res.ok) {
      setPtAmount("");
      setPtReason("");
      toast(`${amt > 0 ? "+" : ""}${amt} points`, "success");
      void load();
    } else toast("Could not adjust points", "danger");
  };
  const sendMessage = async () => {
    if (!selected || !msgBody.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(selected)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: msgChannel, body: msgBody.trim(), subject: msgChannel === "email" ? msgSubject.trim() || undefined : undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast(`${msgChannel === "sms" ? "SMS" : "Email"} sent`, "success");
        setMsgBody("");
        setMsgSubject("");
      } else toast(d.error || "Could not send (manager+ only)", "danger");
    } finally {
      setSending(false);
    }
  };

  // GDPR Art. 17 erasure — hard-deletes every record tied to the phone.
  const eraseCustomer = async () => {
    if (!selected || erasing) return;
    setErasing(true);
    try {
      const res = await fetch("/api/admin/gdpr/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selected, confirm: true }),
      });
      if (res.ok) {
        toast("Customer data erased", "success");
        setEraseOpen(false);
        setSelected(null);
        void load();
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast(d.error || "Could not erase (owner only)", "danger");
      }
    } finally {
      setErasing(false);
    }
  };

  const toggleConsent = async (patch: { smsOptIn?: boolean; emailOptIn?: boolean }) => {
    if (!selected) return;
    const res = await fetch(`/api/admin/customers/${encodeURIComponent(selected)}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setData((d) => d.map((c) => (c.phone === selected ? { ...c, ...patch } : c)));
    } else toast("Could not update consent", "danger");
  };

  return (
    <CoreV2Shell eyebrow="Guest Engagement" tabs={guestTabs("guests")}>
      <div className="cv-guest-inbox">
        <div className="cv-kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {kpis.map((k) => (
            <div className="k" key={k.l}>
              <div className="kl">{k.l}</div>
              <div className="kv mono">{k.v}</div>
            </div>
          ))}
        </div>

        <div className="cv-crm-filters">
          <div className="cv-search" style={{ maxWidth: 260 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email…" />
          </div>
          <div className="cv-segs">
            {SEGS.map((s) => (
              <button key={s.key} className={seg === s.key ? "on" : ""} onClick={() => setSeg(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="cv-sp" />
          <div className="cv-seg">
            {SORTS.map((s) => (
              <button key={s.key} className={sort === s.key ? "on" : ""} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cv-crm-filters2">
            <span className="cv-filter-l">Channel</span>
            <div className="cv-segs">
              <button className={chan === "all" ? "on" : ""} onClick={() => setChan("all")}>All</button>
              {channelKeys.map((k) => (
                <button key={k} className={chan === k ? "on" : ""} onClick={() => setChan(k)}>{chanLabel(k)}</button>
              ))}
            </div>
            <div className="cv-sp" />
            <span className="cv-filter-l">Seen</span>
            <div className="cv-seg">
              {PERIODS.map((p) => (
                <button key={p.key} className={recency === p.key ? "on" : ""} onClick={() => setRecency(p.key)}>{p.label}</button>
              ))}
            </div>
          </div>

        <div className="cv-crm-table-wrap">
          {loading ? (
            <div className="cv-kds-empty pad">Loading customer book…</div>
          ) : visible.length === 0 ? (
            <div className="cv-kds-empty pad">No customers match.</div>
          ) : (
            <table className="cv-tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Health</th>
                  <th className="num">Orders</th>
                  <th className="num">Points</th>
                  <th className="num">LTV</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const h = health(c);
                  const t = healthTier(h);
                  return (
                    <tr key={c.phone} onClick={() => setSelected(c.phone)}>
                      <td>
                        <div className="cv-cust-nm">
                          {c.name}
                          {c.vip && <span className="cv-pill vip">VIP</span>}
                          {c.member && <span className="cv-pill mem">★</span>}
                        </div>
                        <div className="cv-cust-sub">{c.channels.join(" · ") || c.phone}</div>
                      </td>
                      <td>
                        <span className={`cv-health t-${t.tone}`}>{t.label}</span>
                      </td>
                      <td className="num mono">{c.orderCount}</td>
                      <td className="num mono">{c.points}</td>
                      <td className="num mono">{zl(c.totalSpent)} zł</td>
                      <td className="cv-cust-sub">{seen(c.lastDays)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* profile drawer */}
      <CoreV2Dialog open={!!cust} onClose={() => setSelected(null)} title={cust?.name ?? ""} width={640}>
        {cust && (
          <div className="cv-profile">
            <div className="cv-profile-head">
              <span className="cv-av lg">{cust.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="row">
                  {cust.member ? <span className="cv-tier">★ {cust.tier}</span> : <span className="cv-pill">Contact · {cust.source}</span>}
                  {cust.vip && <span className="cv-pill vip">VIP</span>}
                </div>
                <div className="cv-cust-sub">{cust.phone}{cust.email ? ` · ${cust.email}` : " · no email"}</div>
              </div>
            </div>

            <div className="cv-stat-grid">
              <div><span className="sv">{zl(cust.totalSpent)} zł</span><span className="sl">Lifetime</span></div>
              <div><span className="sv">{zl(cust.avgOrderValue)} zł</span><span className="sl">Avg order</span></div>
              <div><span className="sv">{cust.orderCount}</span><span className="sl">Orders</span></div>
              <div><span className="sv">{cust.points}</span><span className="sl">Points</span></div>
              <div><span className="sv">{cust.reliability}%</span><span className="sl">Reliability</span></div>
              <div><span className={cust.noShows ? "sv bad" : "sv"}>{cust.noShows}</span><span className="sl">No-shows</span></div>
            </div>

            {/* consent */}
            <div className="cv-consent">
              <button className={cust.smsOptIn ? "on" : ""} onClick={() => void toggleConsent({ smsOptIn: !cust.smsOptIn })}>
                SMS {cust.smsOptIn ? "✓" : "✕"}
              </button>
              <button className={cust.emailOptIn ? "on" : ""} onClick={() => void toggleConsent({ emailOptIn: !cust.emailOptIn })}>
                Email {cust.emailOptIn ? "✓" : "✕"}
              </button>
              <a className="cv-gdpr" href={`/api/admin/gdpr/export?phone=${encodeURIComponent(cust.phone)}`} target="_blank" rel="noreferrer">
                GDPR export ↗
              </a>
              <button className="cv-gdpr danger" onClick={() => setEraseOpen(true)}>
                Erase ⚠
              </button>
            </div>

            {/* recent orders */}
            {cust.recent.length > 0 && (
              <>
                <h4 className="cv-profile-h">Recent orders</h4>
                <div className="cv-timeline">
                  {cust.recent.slice(0, 5).map((o) => (
                    <div className="cv-tl-row" key={o.id}>
                      <span className="mono">{zl(o.total)} zł</span>
                      <span className="cv-cust-sub">{o.fulfillment} · {o.location}</span>
                      <span className="cv-cust-sub">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* message */}
            <h4 className="cv-profile-h">Send a message</h4>
            <div className="cv-msg-compose">
              <div className="cv-seg" style={{ marginBottom: 8 }}>
                <button className={msgChannel === "sms" ? "on" : ""} onClick={() => setMsgChannel("sms")} disabled={!cust.smsOptIn} title={cust.smsOptIn ? "" : "No SMS consent"}>SMS</button>
                <button className={msgChannel === "email" ? "on" : ""} onClick={() => setMsgChannel("email")} disabled={!cust.email || !cust.emailOptIn} title={cust.email ? (cust.emailOptIn ? "" : "No email consent") : "No email on file"}>Email</button>
              </div>
              {msgChannel === "email" && (
                <input className="cv-inp" style={{ width: "100%", marginBottom: 8 }} value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} placeholder="Subject" />
              )}
              <textarea className="cv-textarea" rows={2} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder={`Message to ${cust.name.split(" ")[0]}…`} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button className="cv-btn primary" disabled={!msgBody.trim() || sending} onClick={() => void sendMessage()}>
                  Send {msgChannel === "sms" ? "SMS" : "email"}
                </button>
              </div>
            </div>

            {/* points */}
            <h4 className="cv-profile-h">Adjust points</h4>
            <div className="cv-points-row">
              <input className="cv-inp" value={ptAmount} onChange={(e) => setPtAmount(e.target.value)} placeholder="e.g. 50 or -20" />
              <input className="cv-inp" value={ptReason} onChange={(e) => setPtReason(e.target.value)} placeholder="Reason" />
              <button className="cv-btn primary" onClick={() => void adjustPoints()}>Apply</button>
            </div>

            {/* notes */}
            <h4 className="cv-profile-h">Notes</h4>
            <div className="cv-points-row">
              <input
                className="cv-inp"
                style={{ flex: 1 }}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addNote()}
                placeholder={`Add a note about ${cust.name.split(" ")[0]}…`}
              />
              <button className="cv-btn" onClick={() => void addNote()}>Add</button>
            </div>
            <div className="cv-notes">
              {notes.length === 0 ? (
                <div className="cv-ctx-empty">No notes yet.</div>
              ) : (
                notes.map((n) => (
                  <div className="cv-note" key={n.id}>
                    <div className="b">{n.body}</div>
                    <div className="m">
                      {n.authoredBy ?? "staff"} · {new Date(n.createdAt).toLocaleDateString("pl-PL")}
                      <button onClick={() => void delNote(n.id)} aria-label="Delete note">✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CoreV2Dialog>

      {/* GDPR erasure confirm */}
      <CoreV2Dialog
        open={eraseOpen && !!cust}
        onClose={() => setEraseOpen(false)}
        title="Erase customer data"
        footer={
          <>
            <button type="button" className="cv-btn ghost" onClick={() => setEraseOpen(false)} disabled={erasing}>Cancel</button>
            <button type="button" className="cv-btn danger" onClick={() => void eraseCustomer()} disabled={erasing}>
              {erasing ? "Erasing…" : "Erase permanently"}
            </button>
          </>
        }
      >
        <p className="cv-tender-note" style={{ lineHeight: 1.55 }}>
          This permanently deletes <b>{cust?.name}</b> ({cust?.phone}) and every record tied to that phone — profile,
          loyalty, notes and consent. This satisfies a <b>GDPR Art. 17</b> right-to-erasure request and <b>cannot be undone</b>.
        </p>
      </CoreV2Dialog>
    </CoreV2Shell>
  );
}
