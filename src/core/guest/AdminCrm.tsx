"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveLocations } from "@/data/locations";
import {
  Bot,
  Cake,
  Coffee,
  Download,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { CoreShell } from "@/core/shell/CoreShell";
import { GuestViewNav } from "@/core/guest/GuestViewNav";
import { Button, Dialog } from "@/ui";
import { useToast } from "@/ui/Toast";

/* ====================== Types (mirror /api/admin/crm) ====================== */
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
  agentic: boolean;
  noShows: number;
  reliability: number;
  lifecycle: "new" | "active" | "repeat" | "lapsed";
  source: string;
  favourites: { name: string; category: string; qty: number }[];
  recent: {
    id: string;
    createdAt: string;
    total: number;
    fulfillment: string;
    channel: string;
    location: string;
    items: { name: string; qty: number }[];
  }[];
  notesCount: number;
  smsOptIn: boolean;
  emailOptIn: boolean;
}

interface NoteRow {
  id: string;
  phone: string;
  body: string;
  tags?: string[];
  authoredBy?: string;
  createdAt: string;
}

/* ====================== Format helpers ====================== */
const fmtPLN0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
const fmtPLN = (g: number) =>
  `${(g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function seenLabel(days: number | null): string {
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)} mo ago`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}
/** "2 birthdays · 1 anniversary" from the greeting-trigger list. */
function triggerSummary(triggers: { trigger: "birthday" | "anniversary" }[]): string {
  const b = triggers.filter((t) => t.trigger === "birthday").length;
  const a = triggers.filter((t) => t.trigger === "anniversary").length;
  const parts: string[] = [];
  if (b > 0) parts.push(`${b} birthday${b === 1 ? "" : "s"}`);
  if (a > 0) parts.push(`${a} anniversar${a === 1 ? "y" : "ies"}`);
  return parts.join(" · ") || `${triggers.length} to greet`;
}

function daysToBirthday(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
}

/* ====================== Channel palette ====================== */
const CHANNEL_META: Record<string, { color: string; soft: string }> = {
  "Dine-in": { color: "var(--cmd-risk)", soft: "var(--cmd-risk-soft)" },
  Takeout: { color: "var(--cmd-firing)", soft: "var(--cmd-firing-soft)" },
  Delivery: { color: "var(--cmd-warn)", soft: "var(--cmd-warn-soft)" },
  WhatsApp: { color: "var(--crm-wa)", soft: "var(--crm-wa-soft)" },
  Web: { color: "var(--crm-cyan)", soft: "var(--crm-cyan-soft)" },
};
const CHANNEL_ORDER = ["Dine-in", "Takeout", "Delivery", "WhatsApp"];

/* ====================== Relationship health (derived) ====================== */
function rfm(c: CrmCustomer) {
  const d = c.lastDays ?? 999;
  const r = d <= 7 ? 100 : d <= 14 ? 86 : d <= 30 ? 66 : d <= 45 ? 46 : d <= 75 ? 26 : 9;
  const f = Math.min(100, c.orderCount * 9);
  const m = Math.min(100, Math.round(c.totalSpent / 1600));
  const rel = c.reliability;
  return { r, f, m, rel };
}
function health(c: CrmCustomer): number {
  if (c.orderCount === 0) return c.member ? 40 : 20;
  const { r, f, m, rel } = rfm(c);
  return Math.max(0, Math.round(0.38 * r + 0.22 * f + 0.15 * m + 0.25 * rel));
}
function healthTier(h: number): { label: string; color: string } {
  if (h >= 70) return { label: "Loyal", color: "var(--cmd-ready)" };
  if (h >= 50) return { label: "Steady", color: "var(--cmd-ready)" };
  if (h >= 34) return { label: "Cooling", color: "var(--cmd-warn)" };
  if (h >= 18) return { label: "At risk", color: "var(--cmd-risk)" };
  return { label: "Churned", color: "var(--cmd-late)" };
}
function barColor(v: number): string {
  return v >= 67 ? "var(--cmd-ready)" : v >= 34 ? "var(--cmd-warn)" : "var(--cmd-late)";
}
function diagnosis(c: CrmCustomer): string {
  if (c.noShows >= 2) return "Reliability is the drag — repeated cancellations. Confirm the next order before firing it.";
  if (c.lifecycle === "lapsed") return `Slipping away — last seen ${seenLabel(c.lastDays)}. Win them back before they're gone.`;
  if (c.noShows > 0) return "Mostly dependable, but a cancellation on file — watch the next pickup.";
  if (c.orderCount === 0) return "In the book but no orders yet — nail the first order to start the habit.";
  if (health(c) >= 70) return "Strong relationship — recent, frequent and dependable.";
  if (c.lifecycle === "new") return "Brand new — nail the second order to lock in the habit.";
  return "Steady — room to grow frequency and check size.";
}
type Nba = { title: string; sub: string; cta: string; act: string; risk: number; cls: string };
function nextBestAction(c: CrmCustomer): Nba {
  const h = health(c);
  const risk = 100 - h;
  const bd = daysToBirthday(c.birthday);
  let title: string, sub: string, cta: string, act: string;
  if (c.noShows >= 2) {
    title = "Reliability — confirm before firing";
    sub = `${c.noShows} orders cancelled. Send a confirm-pickup text on the next order.`;
    cta = "Send SMS";
    act = "sms";
  } else if (c.lifecycle === "lapsed") {
    title = "Win-back — send a comeback code";
    sub = `Last seen ${seenLabel(c.lastDays)}. ${c.smsOptIn ? "SMS" : "Email"} −15% off the next order.`;
    cta = c.smsOptIn ? "Send SMS" : "Email";
    act = c.smsOptIn ? "sms" : "email";
  } else if (!c.email) {
    title = "Collect an email — close the data gap";
    sub = "No email on file. Capture it for receipts + offers.";
    cta = "Collect email";
    act = "collect";
  } else if (bd != null && bd <= 14) {
    title = "Birthday offer — free dolce";
    sub = `Birthday in ${bd} day${bd === 1 ? "" : "s"}. Comp a Tiramisù on the next visit.`;
    cta = "Send SMS";
    act = "sms";
  } else if (!c.member) {
    title = "Invite to loyalty — convert this contact";
    sub = `A regular we never enrolled (via ${c.source}). One tap turns them into a member.`;
    cta = "Invite";
    act = "invite";
  } else if (c.lifecycle === "new") {
    title = "Welcome — nudge the 2nd order";
    sub = "Double points on order #2 to lock in the habit.";
    cta = "Send SMS";
    act = "sms";
  } else if (c.vip) {
    title = "VIP — early access to the LTO";
    sub = "Offer the seasonal special before it hits the public menu.";
    cta = "Send SMS";
    act = "sms";
  } else {
    title = "Grow the check — pair a dessert";
    sub = "High-margin Tiramisù pairs with their usual main.";
    cta = "Send SMS";
    act = "sms";
  }
  return { title, sub, cta, act, risk, cls: risk >= 60 ? "high" : risk >= 35 ? "mid" : "low" };
}

/* ====================== Filter config ====================== */
const SEGS = [
  { key: "all", label: "All", cls: "" },
  { key: "vip", label: "VIP", cls: "s-vip" },
  { key: "active", label: "Active", cls: "s-active" },
  { key: "repeat", label: "Repeat", cls: "s-repeat" },
  { key: "new", label: "New", cls: "s-new" },
  { key: "lapsed", label: "Lapsed", cls: "s-lapsed" },
  { sep: true as const },
  { key: "members", label: "Members", cls: "s-members" },
  { key: "contacts", label: "Contacts", cls: "s-contacts" },
  { key: "noemail", label: "No email", cls: "s-noemail" },
  { key: "noshow", label: "Cancellations", cls: "s-noshow" },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "ltv", label: "Value" },
  { key: "recent", label: "Recent" },
  { key: "orders", label: "Orders" },
  { key: "points", label: "Points" },
  { key: "name", label: "A–Z" },
];
type SortKey = "ltv" | "recent" | "orders" | "points" | "name";
const PERIODS: { key: string; label: string; days: number }[] = [
  { key: "all", label: "All", days: Infinity },
  { key: "1", label: "24h", days: 1 },
  { key: "7", label: "7d", days: 7 },
  { key: "30", label: "30d", days: 30 },
];
const LOCS = [
  { key: "All", label: "All" },
  ...getActiveLocations().map((l) => ({ key: l.slug, label: l.city })),
];

function inSeg(c: CrmCustomer, seg: string): boolean {
  switch (seg) {
    case "all":
      return true;
    case "vip":
      return c.vip;
    case "members":
      return c.member;
    case "contacts":
      return !c.member;
    case "noemail":
      return !c.email;
    case "noshow":
      return c.noShows > 0;
    default:
      return c.vip ? false : c.lifecycle === seg;
  }
}

export function AdminCrm() {
  const toast = useToast();
  const [data, setData] = useState<CrmCustomer[]>([]);
  // "Send today" greeting triggers (birthdays + first-order anniversaries),
  // computed server-side from real DOB / first-order data.
  const [triggers, setTriggers] = useState<{ phone: string; trigger: "birthday" | "anniversary" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState("all");
  const [chan, setChan] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sort, setSort] = useState<SortKey>("ltv");
  const [loc, setLoc] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [compose, setCompose] = useState<{ channel: "sms" | "email" } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/crm");
      if (res.ok) {
        const list: CrmCustomer[] = await res.json();
        setData(list);
        setSelected((prev) => (prev && list.some((c) => c.phone === prev) ? prev : list[0]?.phone ?? null));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load today's greeting triggers once (birthdays + anniversaries).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/admin/campaigns/triggers");
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { triggers?: { phone: string; trigger: "birthday" | "anniversary" }[] };
        if (!cancelled) setTriggers(Array.isArray(d.triggers) ? d.triggers : []);
      } catch {
        /* leave empty — the prompt just hides */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCustomer = useMemo(
    () => data.find((c) => c.phone === selected) ?? null,
    [data, selected],
  );

  // Fetch notes whenever the selected customer changes.
  useEffect(() => {
    if (!selected) {
      setNotes([]);
      return;
    }
    setCollecting(false);
    let cancelled = false;
    fetch(`/api/admin/customer-notes?phone=${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((n) => {
        if (!cancelled) setNotes(Array.isArray(n) ? n : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const locPool = useMemo(
    () => data.filter((c) => loc === "All" || c.locations.includes(loc) || c.locations.length === 0),
    [data, loc],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const periodDays = PERIODS.find((p) => p.key === period)?.days ?? Infinity;
    const list = locPool.filter((c) => {
      if (!inSeg(c, seg)) return false;
      if (chan !== "all" && !c.channels.includes(chan)) return false;
      if (periodDays !== Infinity && (c.lastDays == null || c.lastDays > periodDays)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        (c.email?.toLowerCase().includes(q) ?? false)
      );
    });
    const cmp: Record<SortKey, (a: CrmCustomer, b: CrmCustomer) => number> = {
      ltv: (a, b) => b.totalSpent - a.totalSpent,
      recent: (a, b) => (a.lastDays ?? 9999) - (b.lastDays ?? 9999),
      orders: (a, b) => b.orderCount - a.orderCount,
      points: (a, b) => b.points - a.points,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(cmp[sort]);
  }, [locPool, query, seg, chan, period, sort]);

  // Keep a valid selection within the filtered set.
  useEffect(() => {
    if (visible.length && !visible.some((c) => c.phone === selected)) {
      setSelected(visible[0].phone);
    }
  }, [visible, selected]);

  const agentic = useMemo(() => visible.filter((c) => c.agentic), [visible]);
  const regular = useMemo(() => visible.filter((c) => !c.agentic), [visible]);

  const kpis = useMemo(() => {
    const total = locPool.length;
    const members = locPool.filter((c) => c.member).length;
    const vip = locPool.filter((c) => c.vip).length;
    const ltv = locPool.reduce((s, c) => s + c.totalSpent, 0);
    return [
      { v: String(total), l: "Customers", sub: "all-time", cls: "" },
      { v: String(members), l: "Members", sub: "loyalty enrolled", cls: "" },
      { v: String(vip), l: "VIP", sub: "top by LTV", cls: "" },
      { v: fmtPLN0(ltv), l: "Total LTV", sub: "lifetime", cls: "" },
    ];
  }, [locPool]);

  /* ---- actions ---- */
  const reloadKeepSelection = useCallback(async () => {
    await load();
  }, [load]);

  const awardPoints = async (c: CrmCustomer) => {
    const res = await fetch("/api/admin/members/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, amount: 50, reason: "CRM manual bonus" }),
    });
    if (res.ok) {
      toast.success(`+50 points → ${c.name.split(" ")[0]}`);
      await reloadKeepSelection();
    } else {
      toast.error("Could not add points");
    }
  };

  const invite = async (c: CrmCustomer) => {
    const res = await fetch("/api/admin/members/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, name: c.name === "Guest" ? undefined : c.name }),
    });
    if (res.ok) {
      toast.success(`Enrolled in loyalty → ${c.name.split(" ")[0]}`);
      await reloadKeepSelection();
    } else {
      toast.error("Could not enroll");
    }
  };

  const saveEmail = async (c: CrmCustomer) => {
    const email = emailDraft.trim();
    if (!email) return;
    const res = await fetch("/api/admin/members/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, email, name: c.name === "Guest" ? undefined : c.name }),
    });
    if (res.ok) {
      toast.success(`Email saved → ${c.name.split(" ")[0]}`);
      setEmailDraft("");
      setCollecting(false);
      await reloadKeepSelection();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error("Could not save email", j?.error);
    }
  };

  const toggleConsent = async (c: CrmCustomer, kind: "sms" | "email") => {
    const next = kind === "sms" ? !c.smsOptIn : !c.emailOptIn;
    // optimistic
    setData((prev) =>
      prev.map((x) =>
        x.phone === c.phone ? { ...x, [kind === "sms" ? "smsOptIn" : "emailOptIn"]: next } : x,
      ),
    );
    const res = await fetch(`/api/admin/customers/${encodeURIComponent(c.phone)}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "sms" ? { smsOptIn: next } : { emailOptIn: next }),
    });
    if (res.ok) {
      toast.success(`${kind === "sms" ? "SMS" : "Email"} marketing ${next ? "opted in" : "opted out"} — saved`);
    } else {
      toast.error("Could not save consent");
      await reloadKeepSelection();
    }
  };

  const addNote = async (c: CrmCustomer) => {
    const body = noteDraft.trim();
    if (!body) return;
    const res = await fetch("/api/admin/customer-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, body }),
    });
    if (res.ok) {
      setNoteDraft("");
      const fresh = await fetch(`/api/admin/customer-notes?phone=${encodeURIComponent(c.phone)}`).then((r) =>
        r.ok ? r.json() : [],
      );
      setNotes(Array.isArray(fresh) ? fresh : []);
      setData((prev) => prev.map((x) => (x.phone === c.phone ? { ...x, notesCount: x.notesCount + 1 } : x)));
      toast.success(`Note saved → ${c.name.split(" ")[0]}`);
    } else {
      toast.error("Could not save note");
    }
  };

  const removeNote = async (c: CrmCustomer, id: string) => {
    const res = await fetch(`/api/admin/customer-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setData((prev) =>
        prev.map((x) => (x.phone === c.phone ? { ...x, notesCount: Math.max(0, x.notesCount - 1) } : x)),
      );
    }
  };

  // GDPR — DSAR export downloads the full record; erase is a hard delete
  // (owner-only, enforced server-side) gated behind an explicit confirm.
  const exportCustomer = (c: CrmCustomer) => {
    window.open(`/api/admin/gdpr/export?phone=${encodeURIComponent(c.phone)}`, "_blank");
  };

  const eraseCustomer = async (c: CrmCustomer) => {
    if (!window.confirm(`Erase ALL data for ${c.name}? This permanently deletes their orders, loyalty, notes and consents. This cannot be undone.`)) {
      return;
    }
    const res = await fetch("/api/admin/gdpr/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, confirm: true }),
    });
    if (res.ok) {
      toast.success(`Erased — ${c.name} removed under GDPR Art. 17`);
      setSelected(null);
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error("Could not erase", res.status === 403 ? "Owner only." : d?.error || "Try again.");
    }
  };

  const runNba = (c: CrmCustomer, act: string) => {
    if (act === "invite") void invite(c);
    else if (act === "collect") {
      setCollecting(true);
      toast.info("Capture an email below");
    } else if (act === "sms") setCompose({ channel: "sms" });
    else if (act === "email") setCompose({ channel: "email" });
  };

  const sendMessage = async (c: CrmCustomer, channel: "sms" | "email", subject: string, body: string) => {
    const res = await fetch(`/api/admin/customers/${encodeURIComponent(c.phone)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, body, subject: channel === "email" ? subject : undefined }),
    });
    if (res.ok) {
      toast.success(`${channel === "sms" ? "SMS" : "Email"} sent → ${c.name.split(" ")[0]}`);
      setCompose(null);
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error("Could not send", j?.error);
    }
  };

  /* ---- keyboard nav ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "Escape" && query) {
        setQuery("");
        return;
      }
      if (typing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
        const ids = visible.map((c) => c.phone);
        if (!ids.length) return;
        const i = ids.indexOf(selected ?? "");
        const dir = e.key === "ArrowDown" || e.key === "j" ? 1 : -1;
        const ni = Math.max(0, Math.min(ids.length - 1, (i < 0 ? 0 : i) + dir));
        setSelected(ids[ni]);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, query]);

  const board = (
    <CoreShell
      eyebrow="Guest Engagement"
      viewnav={<GuestViewNav current="guests" counts={{ guests: data.length }} />}
      right={
        <>
          <button type="button" className="btn ghost icon" onClick={() => void load()} title="Refresh">
            <RefreshCw className={loading ? "crm-spin" : ""} />
          </button>
          <div className="seg">
            {LOCS.map((l) => (
              <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => setLoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="crm-page">
        <div className="intro">
          <h1>Guest · Guests — the customer book (CRM)</h1>
          <p>
            Every guest across POS, web, WhatsApp &amp; delivery in one roster. Segment / channel /
            recency filters, sort by value · recency · orders · points, and a profile drawer with LTV,
            points, order timeline and contact.
          </p>
        </div>
        <div className="crm-kpis">
          {kpis.map((k) => (
            <div key={k.l} className={`bk${k.cls ? ` ${k.cls}` : ""}`}>
              <div className="l">{k.l}</div>
              <div className="v tnum">{k.v}</div>
              {k.sub && <div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>
        <div className="crm">
          <section className="book" aria-label="Customer book">
            <div className="book-filters">
            <div className="book-search">
              <Search />
              <input
                className="input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, email…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="filters">
              {SEGS.map((s) =>
                "sep" in s ? null : (
                  <button
                    key={s.key}
                    type="button"
                    className={`fchip${seg === s.key ? " on" : ""}`}
                    aria-pressed={seg === s.key}
                    onClick={() => setSeg(s.key)}
                  >
                    {s.label}
                    <span className="n">{locPool.filter((c) => inSeg(c, s.key)).length}</span>
                  </button>
                ),
              )}
            </div>
            <div className="filters">
              <button
                type="button"
                className={`fchip${chan === "all" ? " on" : ""}`}
                aria-pressed={chan === "all"}
                onClick={() => setChan("all")}
              >
                All<span className="n">{locPool.length}</span>
              </button>
              {CHANNEL_ORDER.map((k) => {
                const m = CHANNEL_META[k];
                const n = locPool.filter((c) => c.channels.includes(k)).length;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`fchip${chan === k ? " on" : ""}`}
                    aria-pressed={chan === k}
                    onClick={() => setChan(k)}
                  >
                    <span className="cdot" style={{ background: m.color }} />
                    {k}
                    <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="seg" style={{ flex: 1 }}>
                {PERIODS.map((p) => (
                  <button key={p.key} type="button" className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="seg">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" className={sort === s.key ? "on" : ""} onClick={() => setSort(s.key as SortKey)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {triggers.length > 0 && (
            <button type="button" className="promo" onClick={() => setSelected(triggers[0].phone)} title="Reach out with a greeting today">
              <Cake />
              <span style={{ flex: 1, fontSize: "12.5px" }}>Send today · {triggerSummary(triggers)}</span>
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--platinum)" }}>Open →</span>
            </button>
          )}

          <div className="book-list" ref={listRef}>
            {loading ? (
              <div className="pane-msg">Loading customer book…</div>
            ) : visible.length === 0 ? (
              <div className="pane-msg">No customers match.</div>
            ) : (
              <>
                <div className="grp-h">
                  <Bot width={13} height={13} /> Agentic · WhatsApp / Voice
                  <span style={{ marginLeft: "auto" }}>{agentic.length}</span>
                </div>
                {agentic.length ? (
                  agentic.map((c) => <CustRow key={c.phone} c={c} active={c.phone === selected} onSelect={setSelected} />)
                ) : (
                  <div className="pane-msg">No agentic customers match.</div>
                )}
                <div className="grp-h">
                  <Users width={13} height={13} /> Customers · staff channels
                  <span style={{ marginLeft: "auto" }}>{regular.length}</span>
                </div>
                {regular.length ? (
                  regular.map((c) => <CustRow key={c.phone} c={c} active={c.phone === selected} onSelect={setSelected} />)
                ) : (
                  <div className="pane-msg">No customers match.</div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="profile" aria-label="Customer detail">
          {selectedCustomer ? (
            <Detail
              c={selectedCustomer}
              notes={notes}
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              collecting={collecting}
              emailDraft={emailDraft}
              setEmailDraft={setEmailDraft}
              setCollecting={setCollecting}
              onPoints={() => awardPoints(selectedCustomer)}
              onInvite={() => invite(selectedCustomer)}
              onSaveEmail={() => saveEmail(selectedCustomer)}
              onToggleConsent={(k) => toggleConsent(selectedCustomer, k)}
              onAddNote={() => addNote(selectedCustomer)}
              onRemoveNote={(id) => removeNote(selectedCustomer, id)}
              onNba={(act) => runNba(selectedCustomer, act)}
              onCompose={(channel) => setCompose({ channel })}
              onExport={() => exportCustomer(selectedCustomer)}
              onErase={() => void eraseCustomer(selectedCustomer)}
            />
          ) : (
            <div className="thread-empty">Select a customer to see their profile.</div>
          )}
        </section>
        </div>
      </div>
    </CoreShell>
  );

  return (
    <>
      {board}
      {compose && selectedCustomer && (
        <ComposeModal
          customer={selectedCustomer}
          channel={compose.channel}
          onClose={() => setCompose(null)}
          onSend={(subject, body) => sendMessage(selectedCustomer, compose.channel, subject, body)}
        />
      )}
    </>
  );
}

/* ====================== Customer row ====================== */
function ChannelIcon({ ch }: { ch: string }) {
  if (ch === "WhatsApp") return <MessageCircle />;
  if (ch === "Delivery") return <MapPin />;
  if (ch === "Dine-in") return <Coffee />;
  return <Phone />;
}

function CustRow({ c, active, onSelect }: { c: CrmCustomer; active: boolean; onSelect: (p: string) => void }) {
  const h = health(c);
  const ht = healthTier(h);
  const firstCh = c.channels[0];
  const m = firstCh ? CHANNEL_META[firstCh] : null;
  return (
    <button type="button" className={`cust${active ? " on" : ""}`} onClick={() => onSelect(c.phone)}>
      <span className="av">{initials(c.name)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="nm">
          <span>{c.name}</span>
          {c.vip && (
            <span className="badge brand" style={{ height: 15, fontSize: 9, padding: "0 5px" }}>
              VIP
            </span>
          )}
          {c.noShows > 0 && <span className="warnpill">⚠ {c.noShows}</span>}
        </span>
        <span className="sub">
          {m && <span className="cdot" style={{ background: m.color }} />}
          <span>{firstCh ?? "—"}</span>
          <span>· {c.orderCount} ord</span>
          <span>· {seenLabel(c.lastDays)}</span>
          {!c.email && <span style={{ color: "var(--warning)" }}>· no email</span>}
        </span>
      </span>
      <span className="right">
        <span className="ltv">{fmtPLN0(c.totalSpent)}</span>
        <span className="hp">
          <i style={{ width: `${h}%`, background: ht.color }} />
        </span>
      </span>
    </button>
  );
}

/* ====================== Detail ====================== */
function Detail({
  c,
  notes,
  noteDraft,
  setNoteDraft,
  collecting,
  emailDraft,
  setEmailDraft,
  setCollecting,
  onPoints,
  onInvite,
  onSaveEmail,
  onToggleConsent,
  onAddNote,
  onRemoveNote,
  onNba,
  onCompose,
  onExport,
  onErase,
}: {
  c: CrmCustomer;
  notes: NoteRow[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  collecting: boolean;
  emailDraft: string;
  setEmailDraft: (v: string) => void;
  setCollecting: (v: boolean) => void;
  onPoints: () => void;
  onInvite: () => void;
  onSaveEmail: () => void;
  onToggleConsent: (k: "sms" | "email") => void;
  onAddNote: () => void;
  onRemoveNote: (id: string) => void;
  onNba: (act: string) => void;
  onCompose: (channel: "sms" | "email") => void;
  onExport: () => void;
  onErase: () => void;
}) {
  const h = health(c);
  const ht = healthTier(h);
  const { r, f, m, rel } = rfm(c);
  const bd = daysToBirthday(c.birthday);
  const nba = nextBestAction(c);
  const R = 37;
  const CIRC = 2 * Math.PI * R;
  const arc = ((h / 100) * CIRC).toFixed(1);
  const earlier = Math.max(0, c.orderCount - c.recent.length);

  const signals: { label: string; val: string; tag: string }[] = [
    { label: "Phone", val: c.phone, tag: "Primary key" },
  ];
  if (c.email) signals.push({ label: "Email", val: c.email, tag: c.emailOptIn ? "Opted in" : "" });
  if (c.channels.includes("WhatsApp")) signals.push({ label: "WhatsApp", val: c.phone, tag: "Verified" });

  const factor = (lbl: string, v: number) => (
    <div className="rfm-row">
      <span>{lbl}</span>
      <span className="meter">
        <i style={{ width: `${v}%`, background: barColor(v) }} />
      </span>
      <span className="num">{v}</span>
    </div>
  );

  return (
    <>
      <div className="pf-head">
        <div className="pf-av">{initials(c.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pf-name">
            {c.name}
            {c.vip && (
              <span className="badge brand">
                <span className="d" />
                VIP
              </span>
            )}
            {c.member ? (
              <span className="badge platinum">
                <span className="d" />
                {c.tier}
              </span>
            ) : (
              <span className="badge neutral">Contact</span>
            )}
          </div>
          <div className="pf-meta">
            <span className="mono">{c.phone}</span>
            {c.email ? <span>{c.email}</span> : <span style={{ color: "var(--warning)" }}>no email on file</span>}
            {c.locations.length > 0 && <span>{c.locations.join(", ")}</span>}
            {c.firstOrderAt && <span>Since {fmtDate(c.firstOrderAt)}</span>}
            {bd != null && bd <= 30 && <span style={{ color: "var(--platinum)" }}>Birthday in {bd}d</span>}
          </div>
        </div>
        <div className="pf-actions">
          <button className="btn primary" type="button" disabled={!c.smsOptIn} onClick={() => onCompose("sms")}>
            <MessageCircle /> {c.smsOptIn ? "Text" : "SMS off"}
          </button>
          {c.email ? (
            <button className="btn" type="button" disabled={!c.emailOptIn} onClick={() => onCompose("email")}>
              <Mail /> Email
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => setCollecting(true)}>
              <Mail /> Collect email
            </button>
          )}
          {c.member ? (
            <button className="btn" type="button" onClick={onPoints}>
              <Star /> +50 pts
            </button>
          ) : (
            <button className="btn" type="button" onClick={onInvite}>
              <Star /> Invite
            </button>
          )}
        </div>
      </div>

      {c.noShows > 0 && (
        <div className="pf-cancel">
          {c.noShows} cancelled order{c.noShows > 1 ? "s" : ""} — reliability {c.reliability}%. Confirm the next
          order before firing it.
        </div>
      )}

      <div className="pf-grid">
        <div className="panel">
          <div className="eyebrow">Relationship health</div>
          <div className="health">
            <div className="ring">
              <svg viewBox="0 0 84 84" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="42" cy="42" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
                <circle
                  cx="42"
                  cy="42"
                  r={R}
                  fill="none"
                  stroke={ht.color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${arc} ${CIRC.toFixed(1)}`}
                />
              </svg>
              <div className="c">
                <b style={{ color: ht.color }}>{h}</b>
                <span>{ht.label}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tier" style={{ color: ht.color }}>
                {ht.label}
              </div>
              <div className="diag">{diagnosis(c)}</div>
            </div>
          </div>
          <div className="rfm" style={{ marginTop: 14 }}>
            {factor("Recency", r)}
            {factor("Frequency", f)}
            {factor("Monetary", m)}
            {factor("Reliability", rel)}
          </div>
        </div>

        <div className="panel nba">
          <div className="eyebrow">Next best action</div>
          <div className="risk">
            Churn risk <b>{nba.risk}%</b>
          </div>
          <div className="rec">{nba.title}</div>
          <p className="subtle" style={{ fontSize: "12.5px", lineHeight: 1.5 }}>
            {nba.sub}
          </p>
          <button className="btn primary" type="button" style={{ marginTop: 12 }} onClick={() => onNba(nba.act)}>
            {nba.cta}
          </button>
        </div>

        <div className="panel span2">
          <div className="eyebrow">Lifetime</div>
          <div className="stat-grid">
            <div className="s">
              <div className="l">Lifetime value</div>
              <div className="v tnum">{fmtPLN0(c.totalSpent)}</div>
            </div>
            <div className="s">
              <div className="l">Orders</div>
              <div className="v tnum">{c.orderCount}</div>
            </div>
            <div className="s">
              <div className="l">Avg order</div>
              <div className="v tnum">{fmtPLN(c.avgOrderValue)}</div>
            </div>
            <div className="s">
              <div className="l">Reliability</div>
              <div className="v tnum">{c.reliability}%</div>
            </div>
            <div className="s">
              <div className="l">Last order</div>
              <div className="v">{seenLabel(c.lastDays)}</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="eyebrow">Identity &amp; channels</div>
          <div className="ident">
            {signals.map((s) => (
              <div key={s.label} className="id-row">
                <span className="ic">
                  {s.label === "Phone" ? <Phone /> : s.label === "Email" ? <Mail /> : <MessageCircle />}
                </span>
                <span>
                  <span style={{ color: "var(--fg-subtle)" }}>{s.label}</span>{" "}
                  <span className="v mono">{s.val}</span>
                </span>
                {s.tag && (
                  <span className="tag badge neutral" style={{ marginLeft: "auto" }}>
                    {s.tag}
                  </span>
                )}
              </div>
            ))}
            {!c.email && collecting && (
              <div className="id-row">
                <input
                  className="input"
                  type="email"
                  value={emailDraft}
                  placeholder="name@email.com"
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSaveEmail()}
                  autoFocus
                />
                <button className="btn primary" type="button" onClick={onSaveEmail}>
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="eyebrow">Favourites &amp; loyalty</div>
          {c.favourites.length > 0 && (
            <div className="taglist" style={{ marginBottom: 12 }}>
              {c.favourites.map((fv) => (
                <span key={fv.name} className="tg">
                  {fv.name} <span className="mono">×{fv.qty}</span>
                </span>
              ))}
            </div>
          )}
          {c.member ? (
            <div className="kv">
              <span className="k">Points</span>
              <span className="v mono">
                {c.points.toLocaleString("pl-PL")} · ≈ {fmtPLN(c.points * 10)}
              </span>
            </div>
          ) : (
            <button className="btn" type="button" onClick={onInvite}>
              <Star /> Invite to loyalty
            </button>
          )}
          <div className="consent-row">
            <span>SMS marketing</span>
            <button
              type="button"
              className={`sw-toggle${c.smsOptIn ? " on" : ""}`}
              aria-pressed={c.smsOptIn}
              aria-label="Toggle SMS marketing"
              onClick={() => onToggleConsent("sms")}
            />
          </div>
          <div className="consent-row">
            <span>Email marketing</span>
            <button
              type="button"
              className={`sw-toggle${c.emailOptIn ? " on" : ""}`}
              aria-pressed={c.emailOptIn}
              aria-label="Toggle email marketing"
              disabled={!c.email}
              onClick={() => onToggleConsent("email")}
            />
          </div>
        </div>

        <div className="panel span2">
          <div className="eyebrow">Concierge notes</div>
          {notes.length ? (
            notes.map((n) => (
              <div key={n.id} className="note">
                {n.body}
                <div className="a">
                  <b>{n.authoredBy ?? "admin"}</b> · {fmtDate(n.createdAt)}
                  <button
                    type="button"
                    className="btn ghost icon"
                    style={{ marginLeft: "auto", height: 24, width: 24 }}
                    onClick={() => onRemoveNote(n.id)}
                    aria-label="Delete note"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="subtle" style={{ fontSize: "12.5px" }}>
              No notes yet — add context the next operator should know.
            </p>
          )}
          <div className="note-add">
            <input
              className="input"
              type="text"
              value={noteDraft}
              placeholder={`Add a note about ${c.name.split(" ")[0]}…`}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddNote()}
            />
            <button className="btn primary" type="button" onClick={onAddNote}>
              Save
            </button>
          </div>
        </div>

        <div className="panel span2">
          <div className="eyebrow">Recent orders</div>
          {c.recent.length === 0 ? (
            <p className="subtle" style={{ fontSize: "12.5px" }}>
              No orders yet.
            </p>
          ) : (
            c.recent.map((o) => (
              <div key={o.id} className="ord">
                <span className="dt">{fmtDate(o.createdAt)}</span>
                <span className="ic" style={{ color: "var(--platinum)" }}>
                  <ChannelIcon ch={o.fulfillment} />
                </span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.items.map((i) => (i.qty > 1 ? `${i.qty}× ` : "") + i.name).join(", ")}
                </span>
                <span className="amt">{fmtPLN(o.total)}</span>
              </div>
            ))
          )}
          {earlier > 0 && (
            <p className="subtle" style={{ fontSize: "11.5px", marginTop: 8 }}>
              + {earlier} earlier order{earlier === 1 ? "" : "s"} · {fmtPLN0(c.totalSpent)} lifetime
            </p>
          )}
        </div>

        <div className="panel span2">
          <div className="eyebrow">Privacy · GDPR</div>
          <div className="gdpr">
            <button type="button" className="btn" onClick={onExport}>
              <Download /> Export data (DSAR)
            </button>
            <button type="button" className="btn ghost" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={onErase}>
              <ShieldAlert /> Erase customer
            </button>
          </div>
          <p className="subtle" style={{ fontSize: 11, marginTop: 9, lineHeight: 1.5 }}>
            Export hands the guest their full record (Art. 15). Erase permanently deletes every row tied to
            this phone (Art. 17) — owner-only, irreversible.
          </p>
        </div>
      </div>
    </>
  );
}

/* ====================== Compose modal ====================== */
function ComposeModal({
  customer,
  channel,
  onClose,
  onSend,
}: {
  customer: CrmCustomer;
  channel: "sms" | "email";
  onClose: () => void;
  onSend: (subject: string, body: string) => void;
}) {
  // Mounted only while composing (parent gates on `compose`), so state starts
  // fresh each open — no reset effect needed.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const canSend = !!body.trim() && (channel !== "email" || !!subject.trim());

  return (
    <Dialog
      open
      onClose={onClose}
      theme="core"
      size="md"
      title={`${channel === "sms" ? "Text" : "Email"} ${customer.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSend} onClick={() => onSend(subject, body)}>
            Send {channel === "sms" ? "SMS" : "email"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {channel === "email" && (
          <textarea
            className="v2-input"
            rows={1}
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ resize: "none" }}
          />
        )}
        <textarea
          className="v2-input"
          rows={5}
          placeholder={`Message to ${customer.name.split(" ")[0]}…`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ resize: "vertical" }}
        />
      </div>
    </Dialog>
  );
}
