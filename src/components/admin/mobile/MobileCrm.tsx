"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gift, MessageSquare, Plus, Send, Star, Trash2, User } from "lucide-react";
import { useToast } from "../v2/ui/Toast";
import {
  BottomSheet,
  ChipStrip,
  Chip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

interface CrmCustomer {
  phone: string;
  name: string;
  email: string | null;
  member: boolean;
  vip: boolean;
  totalSpent: number;
  orderCount: number;
  avgOrderValue: number;
  points: number;
  tier: string;
  lastOrderAt: string | null;
  lastDays: number | null;
  locations: string[];
  channels: string[];
  lifecycle: "new" | "active" | "repeat" | "lapsed";
  notesCount: number;
  smsOptIn: boolean;
  emailOptIn: boolean;
  recent: { id: string; createdAt: string; total: number; fulfillment: string; channel: string; location: string; items: { name: string; qty: number }[] }[];
}
interface NoteRow {
  id: string;
  phone: string;
  body: string;
  authoredBy?: string;
  createdAt: string;
}

type Seg = "all" | "vip" | "members" | "new" | "active" | "repeat" | "lapsed";

const SEGMENTS: { id: Seg; label: string }[] = [
  { id: "all", label: "All" },
  { id: "vip", label: "VIP" },
  { id: "new", label: "New" },
  { id: "active", label: "Active" },
  { id: "repeat", label: "Repeat" },
  { id: "lapsed", label: "Lapsed" },
  { id: "members", label: "Members" },
];

const fmtPLN0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function seenLabel(days: number | null): string {
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
function lifecycleTone(c: CrmCustomer): "success" | "warning" | "danger" | "neutral" {
  if (c.vip) return "warning";
  if (c.lifecycle === "lapsed") return "danger";
  if (c.lifecycle === "repeat" || c.lifecycle === "active") return "success";
  return "neutral";
}

function matchSeg(c: CrmCustomer, seg: Seg): boolean {
  if (seg === "all") return true;
  if (seg === "vip") return c.vip;
  if (seg === "members") return c.member;
  return c.vip ? false : c.lifecycle === seg;
}

/**
 * Mobile CRM (the Guests book). List → guest detail, both on the live
 * /api/admin/crm data. The detail surfaces the real actions: per-channel
 * consent (PATCH consent), a manual points bonus (POST members/points),
 * notes (customer-notes CRUD) and an SMS/email send (customers/<phone>/send)
 * — never cosmetic.
 */
export function MobileCrm() {
  const [data, setData] = useState<CrmCustomer[]>([]);
  const [seg, setSeg] = useState<Seg>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/crm");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data
      .filter((c) => matchSeg(c, seg))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [data, seg, query]);

  const patchCustomer = useCallback((phone: string, patch: Partial<CrmCustomer>) => {
    setData((prev) => prev.map((c) => (c.phone === phone ? { ...c, ...patch } : c)));
  }, []);

  if (active) {
    const customer = data.find((c) => c.phone === active);
    if (customer) {
      return (
        <GuestDetail
          customer={customer}
          onBack={() => setActive(null)}
          onPatch={(patch) => patchCustomer(customer.phone, patch)}
          onReload={load}
        />
      );
    }
  }

  const items: MobileListItem<CrmCustomer>[] = visible.map((c) => ({
    id: c.phone,
    data: c,
    icon: c.vip ? Star : User,
    iconTone: lifecycleTone(c),
    title: c.name || c.phone,
    subtitle: `${c.orderCount} order${c.orderCount === 1 ? "" : "s"} · ${seenLabel(c.lastDays)}${c.member ? " · member" : ""}`,
    trailing: fmtPLN0(c.totalSpent),
    onTap: (row) => setActive(row.phone),
  }));

  return (
    <PullToRefresh onRefresh={load}>
      <MobilePage>
        <PageHeader title="Guests" subtitle={`${visible.length} of ${data.length}`} />
        <div style={{ padding: "0 2px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email…"
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--fg)",
              fontSize: 16,
              outline: 0,
            }}
          />
          <ChipStrip ariaLabel="Segment">
            {SEGMENTS.map((s) => (
              <Chip key={s.id} label={s.label} active={seg === s.id} onClick={() => setSeg(s.id)} />
            ))}
          </ChipStrip>
        </div>
        {items.length === 0 ? (
          <div className="v2-m-empty">
            <div className="v2-m-empty-title">No guests match</div>
          </div>
        ) : (
          <MobileList items={items} virtualizeAt={68} />
        )}
      </MobilePage>
    </PullToRefresh>
  );
}

function GuestDetail({
  customer,
  onBack,
  onPatch,
  onReload,
}: {
  customer: CrmCustomer;
  onBack: () => void;
  onPatch: (patch: Partial<CrmCustomer>) => void;
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [compose, setCompose] = useState<"sms" | "email" | null>(null);
  const [busy, setBusy] = useState(false);
  const c = customer;

  const loadNotes = useCallback(async () => {
    const r = await fetch(`/api/admin/customer-notes?phone=${encodeURIComponent(c.phone)}`);
    setNotes(r.ok ? await r.json() : []);
  }, [c.phone]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const toggleConsent = async (kind: "sms" | "email") => {
    const next = kind === "sms" ? !c.smsOptIn : !c.emailOptIn;
    onPatch(kind === "sms" ? { smsOptIn: next } : { emailOptIn: next });
    const res = await fetch(`/api/admin/customers/${encodeURIComponent(c.phone)}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "sms" ? { smsOptIn: next } : { emailOptIn: next }),
    });
    if (res.ok) {
      toast.success(`${kind === "sms" ? "SMS" : "Email"} marketing ${next ? "opted in" : "opted out"}`);
    } else {
      onPatch(kind === "sms" ? { smsOptIn: !next } : { emailOptIn: !next });
      toast.error("Could not save consent");
    }
  };

  const award = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/members/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, amount: 50, reason: "CRM manual bonus" }),
      });
      if (res.ok) {
        onPatch({ points: c.points + 50 });
        toast.success(`+50 points → ${c.name.split(" ")[0]}`);
        await onReload();
      } else toast.error("Could not add points");
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    const body = noteDraft.trim();
    if (!body) return;
    const res = await fetch("/api/admin/customer-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: c.phone, body }),
    });
    if (res.ok) {
      setNoteDraft("");
      await loadNotes();
      onPatch({ notesCount: c.notesCount + 1 });
      toast.success("Note saved");
    } else toast.error("Could not save note");
  };

  const removeNote = async (id: string) => {
    const res = await fetch(`/api/admin/customer-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      onPatch({ notesCount: Math.max(0, c.notesCount - 1) });
    } else toast.error("Could not delete note");
  };

  const stats: { l: string; v: string }[] = [
    { l: "Orders", v: String(c.orderCount) },
    { l: "Spent", v: fmtPLN0(c.totalSpent) },
    { l: "Avg order", v: fmtPLN0(c.avgOrderValue) },
    { l: "Points", v: c.points.toLocaleString("pl-PL") },
  ];

  return (
    <MobilePage>
      <PageHeader
        title={c.name || c.phone}
        subtitle={`${c.phone}${c.tier ? ` · ${c.tier}` : ""}`}
        actions={
          <button type="button" className="v2-m-icon-btn" aria-label="Back" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 2px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {stats.map((s) => (
            <div key={s.l} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 13px" }}>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{s.l}</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: "var(--fg)", marginTop: 3 }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: "var(--fg-subtle)", lineHeight: 1.45 }}>
          {c.lifecycle === "lapsed"
            ? `Slipping away — last seen ${seenLabel(c.lastDays)}. Win them back before they're gone.`
            : c.lifecycle === "new"
              ? "Brand new — nail the second order to lock in the habit."
              : c.vip
                ? "VIP — your most valuable relationship. Treat accordingly."
                : `Last order ${fmtDate(c.lastOrderAt)} · ${c.channels.join(", ") || "no channel yet"}`}
        </div>

        {/* quick actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="v2-m-btn" onClick={award} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Gift className="h-4 w-4" /> +50 pts
          </button>
          <button type="button" className="v2-m-btn" onClick={() => setCompose("sms")} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <MessageSquare className="h-4 w-4" /> SMS
          </button>
          <button type="button" className="v2-m-btn" onClick={() => setCompose("email")} disabled={!c.email} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Send className="h-4 w-4" /> Email
          </button>
        </div>

        {/* consent */}
        <Card title="Marketing consent">
          <ConsentRow label="SMS marketing" checked={c.smsOptIn} onChange={() => void toggleConsent("sms")} />
          <ConsentRow label="Email marketing" checked={c.emailOptIn} disabled={!c.email} onChange={() => void toggleConsent("email")} />
        </Card>

        {/* notes */}
        <Card title={`Notes${c.notesCount ? ` · ${c.notesCount}` : ""}`}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addNote();
                }
              }}
              placeholder="Add a note…"
              style={{ flex: 1, padding: "9px 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)", fontSize: 15, outline: 0 }}
            />
            <button type="button" className="v2-m-btn v2-m-btn-primary" onClick={() => void addNote()} aria-label="Add note" disabled={!noteDraft.trim()} style={{ width: 44, minWidth: 44, padding: 0 }}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {notes.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "var(--fg)", lineHeight: 1.4 }}>{n.body}</div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 3 }}>
                  {n.authoredBy ?? "admin"} · {fmtDate(n.createdAt)}
                </div>
              </div>
              <button type="button" className="v2-m-icon-btn" aria-label="Delete note" onClick={() => void removeNote(n.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Card>

        {/* recent orders */}
        {c.recent.length > 0 && (
          <Card title="Recent orders">
            {c.recent.slice(0, 5).map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 8, fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ") || o.fulfillment}
                  </div>
                  <div style={{ color: "var(--fg-subtle)", fontSize: 11, marginTop: 2 }}>
                    {fmtDate(o.createdAt)} · {o.fulfillment} · {o.channel}
                  </div>
                </div>
                <div style={{ color: "var(--fg)", fontWeight: 600, flex: "none" }}>{fmtPLN0(o.total)}</div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {compose && (
        <ComposeSheet
          customer={c}
          channel={compose}
          onClose={() => setCompose(null)}
          onSent={() => setCompose(null)}
        />
      )}
    </MobilePage>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08, color: "var(--fg-subtle)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function ConsentRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", opacity: disabled ? 0.5 : 1 }}>
      <span style={{ flex: 1, fontSize: 14, color: "var(--fg)" }}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ width: 22, height: 22, accentColor: "var(--brand)" }}
      />
    </label>
  );
}

function ComposeSheet({
  customer,
  channel,
  onClose,
  onSent,
}: {
  customer: CrmCustomer;
  channel: "sms" | "email";
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(customer.phone)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, body, subject: channel === "email" ? subject : undefined }),
      });
      if (res.ok) {
        toast.success(`${channel === "sms" ? "SMS" : "Email"} sent → ${customer.name.split(" ")[0]}`);
        onSent();
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error("Could not send", j?.error);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`${channel === "sms" ? "SMS" : "Email"} → ${customer.name}`}
      footer={
        <button type="button" className="v2-m-btn v2-m-btn-primary" onClick={send} disabled={sending || !body.trim()} style={{ width: "100%" }}>
          {sending ? "Sending…" : `Send ${channel === "sms" ? "SMS" : "email"}`}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {channel === "email" && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            style={{ padding: "10px 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)", fontSize: 15, outline: 0 }}
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Write your ${channel === "sms" ? "text" : "email"}…`}
          rows={5}
          style={{ padding: "10px 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)", fontSize: 15, outline: 0, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
    </BottomSheet>
  );
}
