"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bot,
  Cake,
  Coffee,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { SegControl, SectionEyebrow } from "./command";
import { useFullscreen } from "./command/useFullscreen";
import { useToast } from "./v2/ui/Toast";

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
interface Flag {
  t: string;
  cls: string;
}
function healthFlags(c: CrmCustomer): Flag[] {
  const out: Flag[] = [];
  const bd = daysToBirthday(c.birthday);
  if (c.noShows > 0) out.push({ t: `${c.noShows} cancelled`, cls: "bad" });
  if (c.lifecycle === "lapsed") out.push({ t: `Lapsed ${c.lastDays}d`, cls: "bad" });
  if (!c.email) out.push({ t: "No email", cls: "warn" });
  if (bd != null && bd <= 14) out.push({ t: `Birthday ${bd}d`, cls: "gold" });
  if (c.vip) out.push({ t: "VIP", cls: "gold" });
  if (!c.member) out.push({ t: "Not enrolled", cls: "info" });
  if (out.length === 0) out.push({ t: "No flags — healthy", cls: "ok" });
  return out;
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
  { key: "krakow", label: "Kraków" },
  { key: "warszawa", label: "Warszawa" },
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
  const { active: fullscreen, enter: enterFs, exit: exitFs } = useFullscreen();
  const [data, setData] = useState<CrmCustomer[]>([]);
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
  const [clock, setClock] = useState("--:--:--");
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

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
    const noEmail = locPool.filter((c) => !c.email).length;
    const cancels = locPool.reduce((s, c) => s + c.noShows, 0);
    const ltv = locPool.reduce((s, c) => s + c.totalSpent, 0);
    return [
      { v: String(total), l: "Customers", cls: "" },
      { v: String(members), l: "Members", cls: "good" },
      { v: String(total - members), l: "Contacts", cls: "" },
      { v: String(noEmail), l: "No email", cls: noEmail > 0 ? "alert" : "" },
      { v: String(cancels), l: "Cancelled", cls: cancels > 0 ? "alert" : "" },
      { v: fmtPLN0(ltv), l: "Total LTV", cls: "" },
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
    <div className={`crm-atlas${fullscreen ? " is-fullscreen" : ""}`}>
      <header className="cmd-head">
        <div className="cmd-brand">
          <span className="cmd-wordmark">SUD ITALIA</span>
          <span className="cmd-label">Customer Relationships</span>
        </div>
        <div className="crm-ctl">
          <span className="crm-ctl-lbl">Loc</span>
          <SegControl
            ariaLabel="Location"
            options={LOCS.map((l) => ({ value: l.key, label: l.label }))}
            value={loc}
            onChange={setLoc}
          />
        </div>
        <div className="cmd-spacer" />
        <button type="button" className="cmd-btn" onClick={() => void load()} title="Refresh">
          <RefreshCw className={loading ? "crm-spin" : ""} /> Refresh
        </button>
        <button
          type="button"
          className="cmd-btn"
          onClick={() => (fullscreen ? exitFs() : enterFs())}
          title="Toggle fullscreen"
        >
          {fullscreen ? "Exit" : "Fullscreen"}
        </button>
        <div className="cmd-clock tabular">{clock}</div>
      </header>

      <section className="crm-bar" aria-label="Customer book">
        <SectionEyebrow icon={<Users className="h-3 w-3" />} label="Customer book">
          <span className="crm-kpis">
            {kpis.map((k) => (
              <span key={k.l} className={`crm-kpi ${k.cls}`}>
                <span className="crm-kpi-v tabular">{k.v}</span>
                <span className="crm-kpi-l">{k.l}</span>
              </span>
            ))}
          </span>
        </SectionEyebrow>

        <div className="crm-controls">
          <label className={`crm-search${query ? " has-q" : ""}`}>
            <Search />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or email…"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button type="button" className="crm-clr" onClick={() => setQuery("")} aria-label="Clear">
                ×
              </button>
            )}
          </label>
          <div className="crm-segchips" role="group" aria-label="Segment filter">
            {SEGS.map((s, i) =>
              "sep" in s ? (
                <span key={`sep-${i}`} className="crm-segsep" aria-hidden />
              ) : (
                <button
                  key={s.key}
                  type="button"
                  className={`crm-segchip ${s.cls}`}
                  aria-pressed={seg === s.key}
                  onClick={() => setSeg(s.key)}
                >
                  {s.key !== "all" && <i />}
                  <span>{s.label}</span>
                  <span className="crm-sc-n tabular">{locPool.filter((c) => inSeg(c, s.key)).length}</span>
                </button>
              ),
            )}
          </div>
          <div className="crm-sort">
            <span className="crm-ctl-lbl">Sort</span>
            <SegControl
              ariaLabel="Sort by"
              options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
            />
          </div>
        </div>

        <div className="crm-channels">
          <span className="crm-ctl-lbl">Channel</span>
          <div className="crm-chanchips" role="group" aria-label="Channel filter">
            <button
              type="button"
              className={`crm-chanchip${chan === "all" ? " on" : ""}`}
              aria-pressed={chan === "all"}
              onClick={() => setChan("all")}
            >
              <span>All</span>
              <span className="crm-cc-n tabular">{locPool.length}</span>
            </button>
            {CHANNEL_ORDER.map((k) => {
              const m = CHANNEL_META[k];
              const n = locPool.filter((c) => c.channels.includes(k)).length;
              return (
                <button
                  key={k}
                  type="button"
                  className={`crm-chanchip${chan === k ? " on" : ""}`}
                  aria-pressed={chan === k}
                  style={{ "--cc": m.color } as React.CSSProperties}
                  onClick={() => setChan(k)}
                >
                  <i style={{ background: m.color }} />
                  <span>{k}</span>
                  <span className="crm-cc-n tabular">{n}</span>
                </button>
              );
            })}
          </div>
          <span className="crm-sep2" />
          <span className="crm-ctl-lbl">Period</span>
          <SegControl
            ariaLabel="Period"
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            value={period}
            onChange={setPeriod}
          />
        </div>
      </section>

      <div className="crm-workspace">
        <section className="crm-list" aria-label="Customers">
          <div className="crm-list-head">
            <span>
              <b>{visible.length}</b> {visible.length === 1 ? "customer" : "customers"}
            </span>
            <span className="crm-list-sort">
              {chan === "all" ? "All channels" : chan} · by {SORTS.find((s) => s.key === sort)?.label}
            </span>
          </div>
          <div className="crm-list-scroll" ref={listRef}>
            {loading ? (
              <div className="crm-list-empty">Loading customer book…</div>
            ) : visible.length === 0 ? (
              <div className="crm-list-empty">
                <Coffee className="crm-le-emoji" />
                No customers match.
              </div>
            ) : (
              <>
                <div className="crm-grp">
                  <div className="crm-feed-head">
                    <span className="crm-fh-grp">
                      <span className="crm-fh-ic agentic">
                        <Bot />
                      </span>
                      Agentic customers
                    </span>
                    <span className="crm-fh-sub">{agentic.length}</span>
                  </div>
                  {agentic.length ? (
                    <div className="crm-book">
                      {agentic.map((c) => (
                        <CustRow key={c.phone} c={c} active={c.phone === selected} onSelect={setSelected} />
                      ))}
                    </div>
                  ) : (
                    <div className="crm-feed-empty">No WhatsApp customers match.</div>
                  )}
                </div>
                <div className="crm-grp">
                  <div className="crm-feed-head">
                    <span className="crm-fh-grp">
                      <span className="crm-fh-ic">
                        <Users />
                      </span>
                      Customers
                    </span>
                    <span className="crm-fh-sub">{regular.length}</span>
                  </div>
                  {regular.length ? (
                    <div className="crm-book">
                      {regular.map((c) => (
                        <CustRow key={c.phone} c={c} active={c.phone === selected} onSelect={setSelected} />
                      ))}
                    </div>
                  ) : (
                    <div className="crm-feed-empty">No customers match.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="crm-detail" aria-label="Customer detail">
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
            />
          ) : (
            <div className="crm-detail-empty">
              <span className="crm-de-emoji">🍕</span>
              <span>Select a customer to see their profile.</span>
            </div>
          )}
        </section>
      </div>

      <footer className="crm-foot">
        <div className="crm-legend">
          <span><i style={{ background: "var(--crm-gold)" }} />VIP</span>
          <span><i style={{ background: "var(--cmd-ready)" }} />Active</span>
          <span><i style={{ background: "var(--cmd-risk)" }} />Repeat</span>
          <span><i style={{ background: "var(--cmd-firing)" }} />New</span>
          <span><i style={{ background: "var(--cmd-late)" }} />Lapsed</span>
        </div>
        <div className="crm-kbd-hint">
          <span className="crm-kbd">↑</span>
          <span className="crm-kbd">↓</span> move · <span className="crm-kbd">Esc</span> clear
        </div>
      </footer>
    </div>
  );

  return (
    <>
      {fullscreen ? createPortal(board, document.body) : board}
      {compose && selectedCustomer &&
        createPortal(
          <ComposeModal
            customer={selectedCustomer}
            channel={compose.channel}
            onClose={() => setCompose(null)}
            onSend={(subject, body) => sendMessage(selectedCustomer, compose.channel, subject, body)}
          />,
          document.body,
        )}
    </>
  );
}

/* ====================== Customer row ====================== */
function ChannelChips({ channels }: { channels: string[] }) {
  return (
    <span className="crm-chans">
      {channels.map((ch) => {
        const m = CHANNEL_META[ch] ?? { color: "var(--cmd-faint)", soft: "transparent" };
        return (
          <span
            key={ch}
            className="crm-ch-chip"
            title={ch}
            style={{ color: m.color, borderColor: `${m.color}55`, background: m.soft }}
          >
            <ChannelIcon ch={ch} />
          </span>
        );
      })}
    </span>
  );
}
function ChannelIcon({ ch }: { ch: string }) {
  if (ch === "WhatsApp") return <MessageCircle />;
  if (ch === "Delivery") return <MapPin />;
  if (ch === "Dine-in") return <Coffee />;
  return <Phone />;
}

function CustRow({ c, active, onSelect }: { c: CrmCustomer; active: boolean; onSelect: (p: string) => void }) {
  const seg = c.vip ? "vip" : c.lifecycle;
  const h = health(c);
  const cold = c.lastDays != null && c.lastDays > 45;
  return (
    <button
      type="button"
      className={`crm-cust seg-${seg}${active ? " active" : ""}`}
      onClick={() => onSelect(c.phone)}
    >
      <span className="crm-avatar">{initials(c.name)}</span>
      <span className="crm-c-main">
        <span className="crm-c-row1">
          <span className="crm-c-name">{c.name}</span>
          {c.vip && <span className="crm-c-vip">VIP</span>}
          {c.noShows > 0 && (
            <span className="crm-c-warn" title={`${c.noShows} order(s) cancelled`}>
              ⚠ {c.noShows}
            </span>
          )}
          <ChannelChips channels={c.channels} />
        </span>
        <span className="crm-c-sub">
          <span className="crm-c-phone">{c.phone}</span>
          <span className="crm-c-dot" />
          <span className={`crm-c-seen${cold ? " cold" : ""}`}>{seenLabel(c.lastDays)}</span>
          <span className="crm-c-dot" />
          <span className="tabular">{c.orderCount} ord</span>
          {!c.email && (
            <>
              <span className="crm-c-dot" />
              <span className="crm-c-noem">no email</span>
            </>
          )}
        </span>
      </span>
      <span className="crm-c-fig">
        <span className="crm-c-ltv tabular">{fmtPLN0(c.totalSpent)}</span>
        {c.member ? (
          <span className="crm-c-pts tabular">
            <Star /> {c.points.toLocaleString("pl-PL")}
          </span>
        ) : (
          <span className="crm-c-contact" title={`Captured via ${c.source}`}>
            Contact
          </span>
        )}
      </span>
      <span className="crm-c-health">
        <i style={{ width: `${h}%`, background: healthTier(h).color }} />
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
}) {
  const seg = c.vip ? "vip" : c.lifecycle;
  const segLabel: Record<string, string> = {
    vip: "VIP",
    active: "Active",
    repeat: "Repeat",
    new: "New",
    lapsed: "Lapsed",
  };
  const h = health(c);
  const ht = healthTier(h);
  const { r, f, m, rel } = rfm(c);
  const bd = daysToBirthday(c.birthday);
  const nba = nextBestAction(c);
  const flags = healthFlags(c);
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const arc = ((h / 100) * CIRC).toFixed(1);
  const completeChecks = [!!c.name && c.name !== "Guest", true, !!c.email, c.smsOptIn || c.emailOptIn];
  const have = completeChecks.filter(Boolean).length;
  const earlier = Math.max(0, c.orderCount - c.recent.length);

  const fct = (lbl: string, v: number) => (
    <div className="crm-factor">
      <span className="crm-fc-lbl">
        {lbl}
        <b className="tabular">{v}</b>
      </span>
      <span className="crm-fc-track">
        <i style={{ width: `${v}%`, background: barColor(v) }} />
      </span>
    </div>
  );

  // Real identity signals only — phone (always), email (if held), WhatsApp
  // (if they've ordered via the agent). No fabricated card/device hashes.
  const signals: { label: string; val: string; tag: string }[] = [
    { label: "Phone", val: c.phone, tag: "Primary key" },
  ];
  if (c.email) signals.push({ label: "Email", val: c.email, tag: c.emailOptIn ? "Opted in" : "" });
  if (c.channels.includes("WhatsApp")) signals.push({ label: "WhatsApp", val: c.phone, tag: "Verified" });

  return (
    <div className="crm-detail-scroll">
      <div className={`crm-prof${c.vip ? " is-vip" : ""}`}>
        <div className="crm-prof-top">
          <span className="crm-prof-av">{initials(c.name)}</span>
          <div className="crm-prof-id">
            <div className="crm-prof-name-row">
              <span className="crm-prof-name">{c.name}</span>
              <span className={`crm-badge seg-${seg}`}>{seg === "vip" ? "★ VIP" : segLabel[c.lifecycle]}</span>
              {c.member ? (
                <span className="crm-badge member">
                  <Star /> Member · {c.tier}
                </span>
              ) : (
                <span className="crm-badge contact">Contact · not enrolled</span>
              )}
            </div>
            <div className="crm-prof-meta">
              <span className="crm-pm mono">{c.phone}</span>
              <span className="crm-pipe" />
              <span className="crm-pm">
                <ChannelChips channels={c.channels} /> {c.channels.join(" · ") || "—"}
              </span>
              {c.locations.length > 0 && (
                <>
                  <span className="crm-pipe" />
                  <span className="crm-pm">
                    <MapPin /> {c.locations.join(", ")}
                  </span>
                </>
              )}
              <span className="crm-pipe" />
              {c.email ? (
                <span className="crm-pm">
                  <Mail /> {c.email}
                </span>
              ) : (
                <span className="crm-pm" style={{ color: "var(--cmd-warn)" }}>
                  <Mail /> no email on file
                </span>
              )}
              {c.firstOrderAt && (
                <>
                  <span className="crm-pipe" />
                  <span className="crm-pm">Since {fmtDate(c.firstOrderAt)}</span>
                </>
              )}
              {bd != null && bd <= 30 && (
                <>
                  <span className="crm-pipe" />
                  <span className="crm-pm" style={{ color: "var(--crm-gold)" }}>
                    <Cake /> Birthday in {bd}d
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {c.noShows > 0 && (
          <div className="crm-noshow-banner">
            <AlertTriangle />
            <span className="crm-nb-text">
              <b>
                {c.noShows} cancelled order{c.noShows > 1 ? "s" : ""}
              </b>{" "}
              — reliability {c.reliability}%. Confirm the next order before firing it.
            </span>
          </div>
        )}

        <div className="crm-actions">
          <button
            className="crm-act-btn primary"
            type="button"
            disabled={!c.smsOptIn}
            onClick={() => onCompose("sms")}
            title={c.smsOptIn ? "Send an SMS" : "Customer opted out of SMS"}
          >
            <MessageCircle /> {c.smsOptIn ? "Text" : "SMS off"}
          </button>
          {c.email ? (
            <button
              className="crm-act-btn"
              type="button"
              disabled={!c.emailOptIn}
              onClick={() => onCompose("email")}
            >
              <Mail /> Email
            </button>
          ) : (
            <button className="crm-act-btn warnbtn" type="button" onClick={() => setCollecting(true)}>
              <Mail /> Collect email
            </button>
          )}
          {c.member ? (
            <button className="crm-act-btn" type="button" onClick={onPoints}>
              <Star /> +50 points
            </button>
          ) : (
            <button className="crm-act-btn goldbtn" type="button" onClick={onInvite}>
              <Star /> Invite to loyalty
            </button>
          )}
        </div>
      </div>

      {/* Relationship health */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Relationship health <span className="crm-sh-sep" />
          <span className="crm-health-badge" style={{ color: ht.color, borderColor: ht.color }}>
            {ht.label}
          </span>
        </div>
        <div className="crm-health-card">
          <div className="crm-health-left">
            <div className="crm-gauge">
              <svg viewBox="0 0 128 128" className="crm-gauge-svg">
                <circle className="crm-gauge-track" cx="64" cy="64" r={R} />
                <circle
                  className="crm-gauge-fill"
                  cx="64"
                  cy="64"
                  r={R}
                  style={{ stroke: ht.color, strokeDasharray: `${arc} ${CIRC.toFixed(1)}` }}
                />
              </svg>
              <div className="crm-gauge-center">
                <span className="crm-gauge-num tabular" style={{ color: ht.color }}>
                  {h}
                </span>
                <span className="crm-gauge-max">/100</span>
              </div>
            </div>
            <span className="crm-gauge-tier" style={{ color: ht.color }}>
              {ht.label}
            </span>
          </div>
          <div className="crm-health-right">
            <p className="crm-diag">{diagnosis(c)}</p>
            <div className="crm-factors">
              {fct("Recency", r)}
              {fct("Frequency", f)}
              {fct("Monetary", m)}
              {fct("Reliability", rel)}
            </div>
            <div className="crm-flags">
              {flags.map((fl, i) => (
                <span key={i} className={`crm-flag ${fl.cls}`}>
                  {fl.t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Next best action */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Next best action <span className="crm-sh-sep" />
        </div>
        <div className="crm-ai-card">
          <div className="crm-ai-head">
            <span className="crm-ai-badge">
              <Sparkles /> AI
            </span>
            <span className="crm-ai-title">Recommended for {c.name.split(" ")[0]}</span>
            <span className={`crm-ai-risk ${nba.cls}`}>churn {nba.risk}%</span>
          </div>
          <button className="crm-ai-offer" type="button" onClick={() => onNba(nba.act)}>
            <span className="crm-ai-of-main">
              <span className="crm-ai-of-title">{nba.title}</span>
              <span className="crm-ai-of-sub">{nba.sub}</span>
            </span>
            <span className="crm-ai-of-cta">{nba.cta}</span>
          </button>
        </div>
      </div>

      {/* Lifetime */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Lifetime <span className="crm-sh-sep" />
        </div>
        <div className="crm-stats">
          <div className="crm-stat">
            <span className="crm-s-val tabular">{fmtPLN0(c.totalSpent)}</span>
            <span className="crm-s-lbl">Lifetime value</span>
          </div>
          <div className="crm-stat">
            <span className="crm-s-val tabular">{c.orderCount}</span>
            <span className="crm-s-lbl">Orders</span>
          </div>
          <div className="crm-stat">
            <span className="crm-s-val tabular">{fmtPLN(c.avgOrderValue)}</span>
            <span className="crm-s-lbl">Avg order</span>
          </div>
          <div className={`crm-stat${c.noShows > 0 ? " warnstat" : ""}`}>
            <span className="crm-s-val tabular">{c.noShows}</span>
            <span className="crm-s-lbl">Cancelled</span>
            <span className="crm-s-sub">{c.reliability}% reliable</span>
          </div>
          <div className="crm-stat">
            <span className="crm-s-val tabular">{seenLabel(c.lastDays)}</span>
            <span className="crm-s-lbl">Last order</span>
            <span className="crm-s-sub">{fmtDate(c.lastOrderAt)}</span>
          </div>
        </div>
      </div>

      {/* Contact & data */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Contact &amp; data <span className="crm-sh-sep" />
          <span className={`crm-comp-pill ${have < 4 ? "partial" : "full"}`}>{have}/4 on file</span>
        </div>
        <div className="crm-comp-bar">
          <i style={{ width: `${Math.round((have / 4) * 100)}%` }} />
        </div>
        <div className="crm-data-grid">
          <div className="crm-data-row">
            <span className="crm-dr-ic">
              <Phone />
            </span>
            <span className="crm-dr-k">Phone</span>
            <span className="crm-dr-v mono">{c.phone}</span>
            <span className="crm-dr-ok">on file</span>
          </div>
          <div className={`crm-data-row${c.email ? "" : " missing"}`}>
            <span className="crm-dr-ic">
              <Mail />
            </span>
            <span className="crm-dr-k">Email</span>
            {c.email ? (
              <>
                <span className="crm-dr-v">{c.email}</span>
                <span className="crm-dr-ok">on file</span>
              </>
            ) : collecting ? (
              <span className="crm-collect-inline">
                <input
                  className="crm-note-input"
                  type="email"
                  value={emailDraft}
                  placeholder="name@email.com"
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSaveEmail()}
                  autoFocus
                />
                <button className="crm-note-save" type="button" onClick={onSaveEmail}>
                  Save
                </button>
              </span>
            ) : (
              <>
                <span className="crm-dr-v crm-dr-missing">Not collected yet</span>
                <button className="crm-collect-btn" type="button" onClick={() => setCollecting(true)}>
                  Collect
                </button>
              </>
            )}
          </div>
          <div className="crm-data-row">
            <span className="crm-dr-ic">
              <Sparkles />
            </span>
            <span className="crm-dr-k">Captured via</span>
            <span className="crm-dr-v">{c.source}</span>
          </div>
          <div className="crm-data-row">
            <span className="crm-dr-ic">
              <Users />
            </span>
            <span className="crm-dr-k">Channels</span>
            <span className="crm-dr-v" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <ChannelChips channels={c.channels} /> {c.channels.join(" · ") || "—"}
            </span>
          </div>
        </div>
        <div className="crm-consent">
          <button
            className="crm-toggle"
            type="button"
            aria-pressed={c.smsOptIn}
            onClick={() => onToggleConsent("sms")}
          >
            <span className="crm-sw" />
            <MessageCircle /> SMS marketing
          </button>
          <button
            className="crm-toggle"
            type="button"
            aria-pressed={c.emailOptIn}
            disabled={!c.email}
            onClick={() => onToggleConsent("email")}
          >
            <span className="crm-sw" />
            <Mail /> Email marketing
          </button>
        </div>
      </div>

      {/* Loyalty */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Loyalty <span className="crm-sh-sep" />
        </div>
        {c.member ? (
          <div className="crm-loyalty-card">
            <div className="crm-lc-top">
              <span className={`crm-tier-pill tier-${c.tier}`}>{c.tier}</span>
              <span className="crm-lc-pts tabular">{c.points.toLocaleString("pl-PL")} pts</span>
              <span className="crm-lc-value tabular">≈ {fmtPLN(c.points * 10)} in rewards</span>
            </div>
            <div className="crm-lc-note">
              Earning points on every order. 1 pt per zł spent + manual bonuses.
            </div>
          </div>
        ) : (
          <div className="crm-loyalty-card nonmember">
            <div className="crm-nm-text">
              Not enrolled — first captured via <b>{c.source}</b>. We hold their contact data, but they aren&apos;t
              earning points yet.
            </div>
            <button className="crm-nm-invite" type="button" onClick={onInvite}>
              Invite to loyalty →
            </button>
          </div>
        )}
      </div>

      {/* Identity & channels (real signals) */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Identity &amp; channels <span className="crm-sh-sep" />
          <span className="crm-id-conf">
            {signals.length} signal{signals.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="crm-id-graph">
          {signals.map((s) => (
            <div key={s.label} className="crm-id-sig">
              <span className="crm-id-ic">
                {s.label === "Phone" ? <Phone /> : s.label === "Email" ? <Mail /> : <MessageCircle />}
              </span>
              <span className="crm-id-body">
                <span className="crm-id-k">{s.label}</span>
                <span className="crm-id-v mono">{s.val}</span>
              </span>
              {s.tag && <span className="crm-id-tag">{s.tag}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Favourites */}
      {c.favourites.length > 0 && (
        <div className="crm-sec">
          <div className="crm-sec-head">
            Favourites <span className="crm-sh-sep" />
          </div>
          <div className="crm-favs">
            {c.favourites.map((fv) => (
              <span key={fv.name} className="crm-fav">
                {fv.name}
                <span className="crm-fv-n tabular">×{fv.qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Order history */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Order history <span className="crm-sh-n tabular">{c.orderCount}</span>
          <span className="crm-sh-sep" />
        </div>
        {c.recent.length === 0 ? (
          <div className="crm-note-empty">No orders yet.</div>
        ) : (
          <div className="crm-hist">
            {c.recent.map((o) => (
              <div key={o.id} className="crm-horder">
                <span className="crm-ho-chan" title={o.fulfillment}>
                  <ChannelIcon ch={o.fulfillment} />
                </span>
                <span className="crm-ho-body">
                  <span className="crm-ho-items">
                    {o.items.map((i) => (i.qty > 1 ? `${i.qty}× ` : "") + i.name).join(", ")}
                  </span>
                  <span className="crm-ho-meta">
                    {fmtDate(o.createdAt)} · {o.fulfillment} · {o.location}
                  </span>
                </span>
                <span className="crm-ho-total tabular">{fmtPLN(o.total)}</span>
              </div>
            ))}
          </div>
        )}
        {earlier > 0 && (
          <div className="crm-hist-more">
            + {earlier} earlier order{earlier === 1 ? "" : "s"} · {fmtPLN0(c.totalSpent)} lifetime
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="crm-sec">
        <div className="crm-sec-head">
          Notes <span className="crm-sh-n tabular">{notes.length}</span>
          <span className="crm-sh-sep" />
        </div>
        <div className="crm-notes">
          {notes.length ? (
            notes.map((n) => (
              <div key={n.id} className="crm-note">
                <div className="crm-note-head">
                  <b>{n.authoredBy ?? "admin"}</b> · {fmtDate(n.createdAt)}
                  <button
                    type="button"
                    className="crm-note-del"
                    onClick={() => onRemoveNote(n.id)}
                    aria-label="Delete note"
                  >
                    <Trash2 />
                  </button>
                </div>
                <div className="crm-note-body">{n.body}</div>
              </div>
            ))
          ) : (
            <div className="crm-note-empty">No notes yet — add context the next operator should know.</div>
          )}
        </div>
        <div className="crm-note-add">
          <input
            className="crm-note-input"
            type="text"
            value={noteDraft}
            placeholder={`Add a note about ${c.name.split(" ")[0]}…`}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddNote()}
          />
          <button className="crm-note-save" type="button" onClick={onAddNote}>
            Save
          </button>
        </div>
      </div>
    </div>
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="crm-modal open" role="dialog" aria-modal="true">
      <div className="crm-modal-backdrop" onClick={onClose} />
      <div className="crm-modal-sheet">
        <div className="crm-modal-head">
          <span className="crm-mh-ic">{channel === "sms" ? <MessageCircle /> : <Mail />}</span>
          <span className="crm-mh-title">
            {channel === "sms" ? "Text" : "Email"} {customer.name}
          </span>
          <button className="crm-modal-x" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="crm-modal-body">
          {channel === "email" && (
            <input
              className="crm-note-input"
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}
          <textarea
            className="crm-modal-textarea"
            rows={5}
            placeholder={`Message to ${customer.name.split(" ")[0]}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="crm-modal-foot">
          <button className="crm-act-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="crm-act-btn primary"
            type="button"
            disabled={!body.trim() || (channel === "email" && !subject.trim())}
            onClick={() => onSend(subject, body)}
          >
            Send {channel === "sms" ? "SMS" : "email"}
          </button>
        </div>
      </div>
    </div>
  );
}
