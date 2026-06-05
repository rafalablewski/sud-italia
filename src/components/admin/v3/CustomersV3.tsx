"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, Coins, Download, PartyPopper, Plus, Repeat, ShieldAlert, Trash2, Users, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHead, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  totalSpent: number; // grosze
  orderCount: number;
  lastOrderAt?: string;
  lifetimePoints?: number;
}
interface TriggerRow { phone: string; name: string; trigger: "birthday" | "anniversary"; years: number }

interface DetailOrder { id: string; createdAt: string; status: string; totalAmount: number; itemCount: number; locationSlug: string; fulfillmentType: string }
interface NoteRow { id: string; body: string; tags?: string[]; authoredBy?: string; createdAt: string }
interface Adjustment { phone: string; amount: number; reason?: string; adjustedBy?: string; adjustedAt: string }
interface Redemption { id: string; points: number; rewardId: string; createdAt: string }
interface Member { phone: string; name?: string; nickname?: string; email?: string; dob?: string }
interface Detail {
  phone: string;
  member: Member | null;
  orders: DetailOrder[];
  totals: {
    totalSpent: number; orderCount: number; avgOrderValue: number; lastOrderAt?: string; firstOrderAt?: string;
    channels: string[]; locations: string[]; earnedPoints: number; manualPoints: number; redeemedPoints: number;
    spendablePoints: number; lifetimePoints: number;
  };
  adjustments: Adjustment[];
  redemptions: Redemption[];
  notes: NoteRow[];
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "2-digit" }) : "—";
}
function fmtDateTime(iso?: string) {
  return iso ? new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}
function statusTone(s: string): BadgeTone {
  if (s === "completed") return "ok";
  if (s === "cancelled") return "bad";
  if (s === "preparing" || s === "ready" || s === "confirmed") return "info";
  if (s === "pending") return "warn";
  return "neutral";
}

export function CustomersV3() {
  const [list, setList] = useState<CustomerSummary[]>([]);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openPhone, setOpenPhone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res, trig] = await Promise.all([
      fetch("/api/admin/customers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/campaigns/triggers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const arr: CustomerSummary[] = Array.isArray(res) ? res : Array.isArray(res?.customers) ? res.customers : [];
    setList(arr);
    setTriggers(trig && Array.isArray(trig.triggers) ? trig.triggers : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle)) : list;
    return [...filtered].sort((a, b) => b.totalSpent - a.totalSpent);
  }, [list, q]);

  const totalCustomers = list.length;
  const repeat = list.filter((c) => c.orderCount >= 2).length;
  const totalRevenue = list.reduce((s, c) => s + c.totalSpent, 0);

  const cols: ColumnV3<CustomerSummary>[] = [
    { key: "name", header: "Customer", render: (c) => <span style={{ fontWeight: 600 }}>{c.name || "—"}</span> },
    { key: "phone", header: "Phone", render: (c) => <span className="av3-cell-muted" style={{ fontFamily: "var(--av3-mono)" }}>{c.phone}</span> },
    { key: "orders", header: "Orders", num: true, render: (c) => c.orderCount.toLocaleString("pl-PL") },
    { key: "spent", header: "Total spent", num: true, render: (c) => formatPrice(c.totalSpent) },
    { key: "pts", header: "Points", num: true, render: (c) => (c.lifetimePoints ?? 0).toLocaleString("pl-PL") },
    { key: "last", header: "Last order", render: (c) => <span className="av3-cell-muted">{fmtDate(c.lastOrderAt)}</span> },
    { key: "tag", header: "", render: (c) => (c.orderCount >= 2 ? <Badge tone="ok">Repeat</Badge> : <Badge tone="neutral">New</Badge>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Customers</h1>
          <div className="av3-pagehead-sub">Phone-based directory · derived from real orders</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Customers" icon={Users} value={totalCustomers.toLocaleString("pl-PL")} accentVar="--av3-c3" />
        <Kpi label="Repeat" icon={Repeat} value={`${repeat}`} accentVar="--av3-c4" />
        <Kpi label="Lifetime revenue" icon={Wallet} value={formatPrice(totalRevenue)} accentVar="--av3-c2" />
      </div>

      {triggers.length > 0 && (
        <Card>
          <CardHead title="Send today" description="Customers with a birthday or first-order anniversary today — reach out on the spot." />
          <CardBody>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {triggers.map((t, i) => (
                <div key={`${t.phone}-${t.trigger}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "7px 0", borderTop: i ? "1px solid var(--av3-line)" : undefined }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {t.trigger === "birthday" ? <Cake style={{ width: 14, height: 14, color: "var(--av3-brand)", flexShrink: 0 }} /> : <PartyPopper style={{ width: 14, height: 14, color: "var(--av3-warn)", flexShrink: 0 }} />}
                    <button type="button" onClick={() => setOpenPhone(t.phone)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 500, fontSize: 13, padding: 0 }}>
                      {t.name || "Customer"}
                    </button>
                    <a href={`tel:${t.phone}`} className="av3-cell-muted" style={{ fontFamily: "var(--av3-mono)", fontSize: 12, textDecoration: "none" }}>{t.phone}</a>
                  </span>
                  <span className="av3-cell-muted" style={{ whiteSpace: "nowrap" }}>{t.trigger === "birthday" ? `birthday · turning ${t.years}` : `${t.years}-yr anniversary`}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 260, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" />
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
      </div>

      {loading && list.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading customers…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No customers</div><div className="av3-empty-text">{q ? "No match for that search." : "Customers appear here once orders are placed."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(c) => c.phone} onRowClick={(c) => setOpenPhone(c.phone)} />
          )}
        </div>
      )}

      {openPhone && <CustomerDetailDialog phone={openPhone} onClose={() => setOpenPhone(null)} onChanged={load} />}
    </>
  );
}

// ── detail dialog — order history, points, notes, GDPR (v2 AdminCustomerDetail parity) ──
function CustomerDetailDialog({ phone, onClose, onChanged }: { phone: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  // profile editor
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  // note composer
  const [noteBody, setNoteBody] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  // gdpr
  const [confirmErase, setConfirmErase] = useState(false);
  const [erasing, setErasing] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res) {
      setData(res);
      setDob(res.member?.dob ?? "");
      setEmail(res.member?.email ?? "");
    }
    setLoading(false);
  }, [phone]);
  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const profileDirty = (dob || "") !== (data?.member?.dob ?? "") || (email || "") !== (data?.member?.email ?? "");

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await fetch("/api/admin/members/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, dob: dob || undefined, email: email.trim() || undefined, name: data?.member?.name || data?.member?.nickname }),
      });
      await fetchDetail();
      onChanged();
    } finally { setSavingProfile(false); }
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      const tags = noteTags.split(",").map((t) => t.trim()).filter(Boolean);
      await fetch("/api/admin/customer-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, body: noteBody, tags: tags.length ? tags : undefined }),
      });
      setNoteBody(""); setNoteTags("");
      await fetchDetail();
    } finally { setNoteBusy(false); }
  };
  const removeNote = async (id: string) => {
    await fetch(`/api/admin/customer-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetchDetail();
  };

  const exportData = () => { window.location.href = `/api/admin/gdpr/export?phone=${encodeURIComponent(phone)}`; };
  const erase = async () => {
    setErasing(true);
    try {
      const res = await fetch("/api/admin/gdpr/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, confirm: true }) });
      if (res.ok) { onChanged(); onClose(); }
    } finally { setErasing(false); setConfirmErase(false); }
  };

  const t = data?.totals;
  const name = data?.member?.name || data?.member?.nickname || "Customer";

  return (
    <Dialog
      open
      onClose={onClose}
      title={name}
      subtitle={phone}
      headerExtra={t ? (t.orderCount >= 2 ? <Badge tone="ok">Repeat</Badge> : <Badge tone="neutral">New</Badge>) : undefined}
      width={760}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <Button variant="ghost" size="sm" onClick={exportData}><Download className="av3-btn-ico" /> Export (GDPR Art. 15)</Button>
          {confirmErase ? (
            <>
              <span className="av3-cell-muted" style={{ fontSize: 12 }}>Permanently redact this customer?</span>
              <Button variant="danger" size="sm" loading={erasing} onClick={erase}>Confirm erase</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmErase(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmErase(true)}><ShieldAlert className="av3-btn-ico" /> Erase (Art. 17)</Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {loading || !data ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading customer…</div>
      ) : (
        <>
          {/* summary + points breakdown */}
          <div className="av3-od-grid">
            <div className="av3-od-field"><div className="k">Orders</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{t!.orderCount}</div></div>
            <div className="av3-od-field"><div className="k">Total spent</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(t!.totalSpent)}</div></div>
            <div className="av3-od-field"><div className="k">Avg order</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(t!.avgOrderValue)}</div></div>
            <div className="av3-od-field"><div className="k">Spendable points</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{t!.spendablePoints.toLocaleString("pl-PL")}</div></div>
            <div className="av3-od-field"><div className="k">First order</div><div className="v">{fmtDate(t!.firstOrderAt)}</div></div>
            <div className="av3-od-field"><div className="k">Last order</div><div className="v">{fmtDate(t!.lastOrderAt)}</div></div>
            <div className="av3-od-field"><div className="k">Channels</div><div className="v">{t!.channels.join(", ") || "—"}</div></div>
            <div className="av3-od-field"><div className="k">Locations</div><div className="v">{t!.locations.join(", ") || "—"}</div></div>
          </div>
          <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 14 }}>
            Points: {t!.earnedPoints.toLocaleString("pl-PL")} earned · {t!.manualPoints >= 0 ? "+" : ""}{t!.manualPoints.toLocaleString("pl-PL")} manual · −{t!.redeemedPoints.toLocaleString("pl-PL")} redeemed
          </div>

          {/* profile editor */}
          <Card padding="compact" className="av3-detail-sect">
            <CardHead title="Profile" description="DOB powers birthday triggers; email enables receipt + reactivation campaigns." />
            <div className="av3-formrow" style={{ marginTop: 8 }}>
              <label className="av3-field"><span className="av3-field-label">Date of birth</span><input className="av3-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional@email.com" /></label>
              <div style={{ display: "flex", alignItems: "flex-end" }}><Button variant="primary" size="sm" disabled={!profileDirty} loading={savingProfile} onClick={saveProfile}>Save profile</Button></div>
            </div>
          </Card>

          {/* order history */}
          <div className="av3-section-label av3-detail-sect-label">Order history · {data.orders.length}</div>
          {data.orders.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No orders.</div> : (
            <div className="av3-detail-list">
              {data.orders.map((o) => (
                <div className="av3-od-line" key={o.id}>
                  <span><span className="q">#{o.id.slice(-6)}</span>{o.locationSlug} · {o.fulfillmentType} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    <span className="av3-cell-muted">{fmtDateTime(o.createdAt)}</span>
                    <span className="lp">{formatPrice(o.totalAmount)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* point adjustments */}
          <div className="av3-section-label av3-detail-sect-label">Point adjustments · {data.adjustments.length}</div>
          {data.adjustments.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No manual adjustments.</div> : (
            <div className="av3-detail-list">
              {data.adjustments.map((a, i) => (
                <div className="av3-od-line" key={i}>
                  <span>{a.reason || "Manual adjustment"}<span className="av3-od-note">{a.adjustedBy ?? "admin"} · {fmtDateTime(a.adjustedAt)}</span></span>
                  <span className="lp" style={{ color: a.amount >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{a.amount >= 0 ? "+" : ""}{a.amount} pts</span>
                </div>
              ))}
            </div>
          )}

          {/* redemptions */}
          <div className="av3-section-label av3-detail-sect-label">Redemptions · {data.redemptions.length}</div>
          {data.redemptions.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No redemptions.</div> : (
            <div className="av3-detail-list">
              {data.redemptions.map((r) => (
                <div className="av3-od-line" key={r.id}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Coins style={{ width: 13, height: 13, color: "var(--av3-platinum)" }} /> {r.rewardId}</span>
                  <span><span className="av3-cell-muted">{fmtDateTime(r.createdAt)}</span> <span className="lp">−{r.points} pts</span></span>
                </div>
              ))}
            </div>
          )}

          {/* notes */}
          <div className="av3-section-label av3-detail-sect-label">Notes · {data.notes.length}</div>
          <div className="av3-formrow-note">
            <input className="av3-input" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note (e.g. allergy, VIP, complaint follow-up)…" />
            <input className="av3-input" style={{ maxWidth: 160 }} value={noteTags} onChange={(e) => setNoteTags(e.target.value)} placeholder="tags, comma-sep" />
            <Button variant="secondary" size="sm" loading={noteBusy} disabled={!noteBody.trim()} onClick={addNote}><Plus className="av3-btn-ico" /> Add</Button>
          </div>
          {data.notes.length > 0 && (
            <div className="av3-detail-list" style={{ marginTop: 8 }}>
              {data.notes.map((n) => (
                <div className="av3-od-line" key={n.id} style={{ alignItems: "flex-start" }}>
                  <span style={{ minWidth: 0 }}>{n.body}
                    <span className="av3-od-note">{n.authoredBy ?? "admin"} · {fmtDateTime(n.createdAt)}{n.tags?.length ? ` · ${n.tags.join(", ")}` : ""}</span>
                  </span>
                  <button type="button" className="av3-iconbtn-sm" onClick={() => removeNote(n.id)} aria-label="Remove note"><Trash2 /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
