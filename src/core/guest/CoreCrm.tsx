"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { useCoreCache } from "@/lib/useCoreCache";
import { RefreshIcon } from "@/core/shell/toolIcons";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
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
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastDays: number | null;
  locations: string[];
  channels: string[];
  noShows: number;
  reliability: number;
  lifecycle: "new" | "active" | "repeat" | "lapsed";
  source: string;
  recent: { id: string; createdAt: string; total: number; fulfillment: string; location: string; items: { name: string; qty: number }[] }[];
  smsOptIn: boolean;
  emailOptIn: boolean;
  // whatsappOptIn is surfaced for parity with the mockup consent row; the CRM
  // payload + consent endpoint don't persist it yet (see DATA NEEDED).
  whatsappOptIn?: boolean;
}
interface NoteRow {
  id: string;
  phone: string;
  body: string;
  authoredBy?: string;
  createdAt: string;
}

// Location slug → display label (the roster meta + drawer subtitle read
// "segment · location" per the mockup, e.g. "VIP · Kraków").
const LOC_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };
const locLabel = (s: string) => (s ? LOC_LABEL[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1) : "");
const custLoc = (c: CrmCustomer) => locLabel(c.locations?.[0] ?? c.recent?.[0]?.location ?? "");

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
    // dense-console segments (mockup): Regular = an ordering non-VIP that isn't
    // brand-new; At-risk = ordered before but RFM health has slipped below 34.
    case "regular": return !c.vip && c.orderCount > 0 && c.lifecycle !== "new";
    case "atrisk": return c.orderCount > 0 && health(c) < 34;
    default: return c.vip ? false : c.lifecycle === seg;
  }
}
// Segment label mirroring inSeg() priority — drives the roster meta + drawer
// subtitle "segment · location" (mockup). VIP → At-risk → New → Regular.
function segLabel(c: CrmCustomer): string {
  if (c.vip) return "VIP";
  if (c.orderCount > 0 && health(c) < 34) return "At-risk";
  if (c.lifecycle === "new") return "New";
  if (c.orderCount > 0) return "Regular";
  return c.member ? "Member" : "Guest";
}
// Loyalty tier → gem class + avatar tint (bronze/silver/gold/platinum).
function gemClass(tier: string): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("platinum")) return "plat";
  if (t.includes("gold")) return "gold";
  if (t.includes("silver")) return "silver";
  return "bronze";
}
function avClass(c: CrmCustomer): string {
  const g = gemClass(c.tier);
  return g === "plat" ? "p" : g === "silver" ? "s" : g === "bronze" ? "b" : "g";
}
function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Core · Guest · Guests (CRM) — the customer book, wired to the same engine
 * as today's /core/guest/crm: GET /api/admin/crm, notes via customer-notes,
 * points via members/points, consent via …/consent. Roster + segments + health
 * + a profile drawer. Own core- UI.
 */
export function CoreCrm() {
  const toast = useCoreToast();
  const { location } = useLocation();
  // Cached by location so returning to CRM re-renders the last book instantly;
  // the loading placeholder now only shows when there's genuinely nothing yet.
  const [data, setData] = useCoreCache<CrmCustomer[]>(`core:crm:${location}`, []);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState("all");
  const [sort, setSort] = useState("recent");
  const [tierF, setTierF] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [ptAmount, setPtAmount] = useState("");
  const [ptReason] = useState("");

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data.filter(
      (c) =>
        inSeg(c, seg) &&
        (tierF == null || gemClass(c.tier) === tierF) &&
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
  }, [data, query, seg, tierF, sort]);

  // Land with the top guest already open in the inspector — the mockup shows the
  // customer book with a profile in view, not an empty rail. Auto-select the
  // first visible row when nothing is selected (or the current pick fell out of
  // the active filter/segment), so the inspector reads populated on load and
  // stays populated as the operator filters. A manual pick always wins.
  useEffect(() => {
    if (loading || visible.length === 0) return;
    if (selected && visible.some((c) => c.phone === selected)) return;
    setSelected(visible[0].phone);
  }, [loading, visible, selected]);

  // Live counts for the labelled segment chips (mockup).
  const segCounts = useMemo(() => ({
    all: data.length,
    vip: data.filter((c) => inSeg(c, "vip")).length,
    regular: data.filter((c) => inSeg(c, "regular")).length,
    new: data.filter((c) => inSeg(c, "new")).length,
    atrisk: data.filter((c) => inSeg(c, "atrisk")).length,
  }), [data]);

  // Dense-console stat strip — every figure derived from the live customer book
  // (Rule #1): guests · VIPs · new · at-risk (RFM health < 34) · avg spend ·
  // repeat rate (guests with 2+ orders).
  const stat = useMemo(() => {
    const n = data.length;
    const vip = data.filter((c) => c.vip).length;
    const fresh = data.filter((c) => c.lifecycle === "new").length;
    const atRisk = data.filter((c) => c.orderCount > 0 && health(c) < 34).length;
    const withOrders = data.filter((c) => c.orderCount > 0);
    const avgSpend = withOrders.length ? Math.round(withOrders.reduce((s, c) => s + c.totalSpent, 0) / withOrders.length) : 0;
    const repeat = data.filter((c) => c.orderCount > 1).length;
    return {
      guests: n,
      members: data.filter((c) => c.member).length,
      vip,
      vipPct: n ? Math.round((vip / n) * 100) : 0,
      fresh,
      atRisk,
      avgSpend,
      repeatPct: n ? Math.round((repeat / n) * 100) : 0,
    };
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
      toast(`${amt > 0 ? "+" : ""}${amt} points`, "success");
      void load();
    } else toast("Could not adjust points", "danger");
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

  const toggleConsent = async (patch: { smsOptIn?: boolean; emailOptIn?: boolean; whatsappOptIn?: boolean }) => {
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
    <CoreShell eyebrow="Guest Engagement" tabs={guestTabs("guests")}>
      <div className="core-guest-inbox">
        {/* Unified ActionBar — identity (Guest · CRM) · filters left (search ·
            segment chips · loyalty-tier gems) · sort + Refresh right. */}
        <CoreSurfToolbar
          ariaLabel="Customer-book filters"
          section="Guest"
          page="CRM"
          sub={<>customer book · rfm health · consent &amp; points</>}
          left={
            <>
              <div className="core-crm-search">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email…" aria-label="Search customers" />
              </div>
              <div className="core-fsep" />
              <div className="core-segchips" role="group" aria-label="Segment">
                {([["all", "All"], ["vip", "VIP"], ["regular", "Regular"], ["new", "New"], ["atrisk", "At-risk"]] as const).map(([k, label]) => (
                  <button key={k} className={seg === k ? `on${k === "all" ? " brand" : ""}` : ""} onClick={() => setSeg(k)} aria-pressed={seg === k}>
                    {label} <span className="ct">{segCounts[k]}</span>
                  </button>
                ))}
              </div>
              <div className="core-fsep" />
              <div className="core-gems" role="group" aria-label="Loyalty tier">
                {([["bronze", "Bronze"], ["silver", "Silver"], ["gold", "Gold"], ["plat", "Platinum"]] as const).map(([k, label]) => (
                  <span key={k} className={tierF === k ? "core-gemchip on" : "core-gemchip"} role="button" tabIndex={0}
                    onClick={() => setTierF((t) => (t === k ? null : k))}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTierF((t) => (t === k ? null : k)); } }}>
                    <span className={`core-gem ${k}`} />{label}
                  </span>
                ))}
              </div>
            </>
          }
          right={
            <>
              <span className="core-crm-sortlbl">sort</span>
              <div className="core-seg" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                {([["recent", "recent"], ["ltv", "spend"], ["orders", "visits"]] as const).map(([k, label]) => (
                  <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{label}</button>
                ))}
              </div>
              <button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>
            </>
          }
        />
        {/* dense-console 6-up stat strip — every figure from the live book (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Customer-book metrics">
          <div className="cell">
            <span className="lab">Guests</span>
            <span className="val">{stat.guests}</span>
            <span className="delta">{stat.members} member{stat.members === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">VIPs</span>
            <span className="val brand">{stat.vip}</span>
            <span className="delta">{stat.vipPct}% of book</span>
          </div>
          <div className="cell">
            <span className="lab">New</span>
            <span className="val info">{stat.fresh}</span>
            <span className="delta">first-time guests</span>
          </div>
          <div className="cell">
            <span className="lab">At-risk</span>
            <span className={stat.atRisk > 0 ? "val danger" : "val"}>{stat.atRisk}</span>
            <span className={stat.atRisk > 0 ? "delta dn" : "delta"}>{stat.atRisk > 0 ? "win-back due" : "book healthy"}</span>
          </div>
          <div className="cell">
            <span className="lab">Avg spend</span>
            <span className="val basil">{zl(stat.avgSpend)}<small> zł</small></span>
            <span className="delta">per active guest</span>
          </div>
          <div className="cell">
            <span className="lab">Repeat rate</span>
            <span className="val amber">{stat.repeatPct}<small>%</small></span>
            <span className="delta">2+ orders</span>
          </div>
        </div>

        <div className={`core-crm-grid${cust ? "" : " solo"}`}>
          <div className="core-roster">
          {loading && data.length === 0 ? (
            <div className="core-kds-empty pad">Loading customer book…</div>
          ) : visible.length === 0 ? (
            <div className="core-kds-empty pad">No customers match.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Phone</th>
                  <th className="num">Visits</th>
                  <th>Last seen</th>
                  <th className="num">Spend</th>
                  <th>Tier</th>
                  <th>RFM health</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const h = health(c);
                  const t = healthTier(h);
                  const bar = t.tone === "ok" ? "hi" : t.tone === "warn" ? "mid" : "lo";
                  const gem = gemClass(c.tier);
                  const tierLabel = gem === "plat" ? "Platinum" : gem.charAt(0).toUpperCase() + gem.slice(1);
                  return (
                    <tr key={c.phone} className={selected === c.phone ? "sel" : undefined} onClick={() => setSelected(c.phone)}>
                      <td>
                        <div className="core-g-name">
                          <span className={`core-g-av ${avClass(c)}`}>{initials(c.name)}</span>
                          <div>
                            <div className="core-g-nm">{c.name}</div>
                            <div className="core-g-meta">{segLabel(c)}{custLoc(c) ? ` · ${custLoc(c)}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="ph">{c.phone}</span></td>
                      <td className="num">{c.orderCount}</td>
                      <td><span className="ls">{seen(c.lastDays)}</span></td>
                      <td className="num">{zl(c.totalSpent)} zł</td>
                      <td>
                        <div className="core-tiercell"><span className={`core-gem ${gem}`} />{tierLabel}</div>
                      </td>
                      <td>
                        <div className="core-rfm">
                          <div className="track"><i className={bar} style={{ width: `${Math.min(100, h)}%` }} /></div>
                          <span className={`sc ${bar}`}>{h}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>

          {/* persistent profile panel (mockup drawer) */}
          {cust && (
            <aside className="core-drawer">
              <div className="dh">
                <span className={`av ${avClass(cust)}`}>{initials(cust.name)}</span>
                <div className="who">
                  <div className="n">{cust.name} <span className={`core-gem ${gemClass(cust.tier)}`} style={{ width: 11, height: 11 }} /></div>
                  <div className="sub">{[segLabel(cust), custLoc(cust), (() => {
                    const d = cust.firstOrderAt ? new Date(cust.firstOrderAt) : null;
                    return d && !isNaN(d.getTime()) ? `guest since ${d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : null;
                  })()].filter(Boolean).join(" · ")}</div>
                </div>
              </div>

              <div className="core-dsec">
                <div className="core-dsec-lab">Lifetime</div>
                <div className="core-dstat-grid">
                  <div className="core-dstat"><div className="v">{cust.orderCount}</div><div className="k">Visits</div></div>
                  <div className="core-dstat"><div className="v brand">{zl(cust.totalSpent)}<small> zł</small></div><div className="k">Spend</div></div>
                  <div className="core-dstat"><div className="v">{zl(cust.avgOrderValue)}<small> zł</small></div><div className="k">Avg</div></div>
                  <div className="core-dstat"><div className="v basil">{cust.points}</div><div className="k">Points</div></div>
                </div>
              </div>

              <div className="core-dsec">
                <div className="core-dsec-lab">Consent</div>
                <div className="core-consent2">
                  <div className="row">
                    <span className="cn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>SMS</span>
                    <div className={cust.smsOptIn ? "core-tog on" : "core-tog"} role="switch" aria-checked={cust.smsOptIn} tabIndex={0} onClick={() => void toggleConsent({ smsOptIn: !cust.smsOptIn })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggleConsent({ smsOptIn: !cust.smsOptIn }); } }}><i /></div>
                  </div>
                  <div className="row">
                    <span className="cn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>Email</span>
                    <div className={cust.emailOptIn ? "core-tog on" : "core-tog"} role="switch" aria-checked={cust.emailOptIn} tabIndex={0} onClick={() => void toggleConsent({ emailOptIn: !cust.emailOptIn })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggleConsent({ emailOptIn: !cust.emailOptIn }); } }}><i /></div>
                  </div>
                  <div className="row">
                    <span className="cn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5z" /></svg>WhatsApp</span>
                    <div className={cust.whatsappOptIn ? "core-tog on" : "core-tog"} role="switch" aria-checked={!!cust.whatsappOptIn} tabIndex={0} onClick={() => void toggleConsent({ whatsappOptIn: !cust.whatsappOptIn })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggleConsent({ whatsappOptIn: !cust.whatsappOptIn }); } }}><i /></div>
                  </div>
                </div>
              </div>

              {cust.recent.length > 0 && (
                <div className="core-dsec">
                  <div className="core-dsec-lab">Recent orders <span className="more">view all ›</span></div>
                  <div className="core-dtimeline">
                    {cust.recent.slice(0, 3).map((o) => (
                      <div className="core-dtl" key={o.id}>
                        <span className="dot on" />
                        <div className="body">
                          <div className="t">{o.items.map((i) => i.name).join(" · ") || "Order"} <b>{zl(o.total)} zł</b></div>
                          <div className="m">{o.fulfillment} · {o.location} · {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="core-dsec">
                <div className="core-dsec-lab">Adjust points</div>
                <div className="core-dpoints">
                  <div className="core-dstepper">
                    <button type="button" onClick={() => setPtAmount((v) => String((parseInt(v, 10) || 0) - 10))}>−</button>
                    <span className="num">{(parseInt(ptAmount, 10) || 0) > 0 ? "+" : ""}{parseInt(ptAmount, 10) || 0}</span>
                    <button type="button" onClick={() => setPtAmount((v) => String((parseInt(v, 10) || 0) + 10))}>+</button>
                  </div>
                  <button type="button" className="apply" disabled={!parseInt(ptAmount, 10)} onClick={() => void adjustPoints()}>Apply</button>
                  <span className="bal">balance <b>{cust.points}</b></span>
                </div>
              </div>

              <div className="core-dsec">
                <div className="core-dsec-lab">Notes {notes.length > 0 && <span className="more" onClick={() => void delNote(notes[0].id)}>clear latest</span>}</div>
                <textarea className="core-dnotes" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add a private note…" />
                <button type="button" className="core-dsave" onClick={() => void addNote()}>Save profile</button>
                {notes.length > 0 && (
                  <div className="core-notes" style={{ marginTop: 9 }}>
                    {notes.slice(0, 4).map((n) => (
                      <div className="core-note" key={n.id}>
                        <div className="b">{n.body}</div>
                        <div className="m">{n.authoredBy ?? "staff"} · {new Date(n.createdAt).toLocaleDateString("pl-PL")}<button onClick={() => void delNote(n.id)} aria-label="Delete note">✕</button></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="core-dsec core-gdpr">
                <div className="core-dsec-lab">Data <a className="more" href={`/api/admin/gdpr/export?phone=${encodeURIComponent(cust.phone)}`} target="_blank" rel="noreferrer">export ↗</a></div>
                <button type="button" className="core-dsave core-gdpr-erase" onClick={() => setEraseOpen(true)}>Erase customer (GDPR Art. 17)</button>
              </div>
            </aside>
          )}
        </div>
      </div>


      {/* GDPR erasure confirm */}
      <CoreDialog
        open={eraseOpen && !!cust}
        onClose={() => setEraseOpen(false)}
        title="Erase customer data"
        footer={
          <>
            <button type="button" className="core-btn ghost" onClick={() => setEraseOpen(false)} disabled={erasing}>Cancel</button>
            <button type="button" className="core-btn danger" onClick={() => void eraseCustomer()} disabled={erasing}>
              {erasing ? "Erasing…" : "Erase permanently"}
            </button>
          </>
        }
      >
        <p className="core-tender-note" style={{ lineHeight: 1.55 }}>
          This permanently deletes <b>{cust?.name}</b> ({cust?.phone}) and every record tied to that phone — profile,
          loyalty, notes and consent. This satisfies a <b>GDPR Art. 17</b> right-to-erasure request and <b>cannot be undone</b>.
        </p>
      </CoreDialog>
    </CoreShell>
  );
}
