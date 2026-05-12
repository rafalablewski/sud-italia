"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

interface OrderRow {
  id: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  locationSlug: string;
  fulfillmentType: string;
}

interface NoteRow {
  id: string;
  phone: string;
  body: string;
  tags?: string[];
  authoredBy?: string;
  createdAt: string;
}

interface PointAdjustment {
  phone: string;
  amount: number;
  reason?: string;
  adjustedBy?: string;
  adjustedAt: string;
}

interface Redemption {
  id: string;
  walletId: string | null;
  phone: string;
  points: number;
  rewardId: string;
  createdAt: string;
}

interface Member {
  phone: string;
  name?: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  signedUpAt?: string;
  /** ISO date of birth — powers birthday triggers. */
  dob?: string;
}

interface DetailData {
  phone: string;
  member: Member | null;
  orders: OrderRow[];
  totals: {
    totalSpent: number;
    orderCount: number;
    avgOrderValue: number;
    lastOrderAt?: string;
    firstOrderAt?: string;
    channels: string[];
    locations: string[];
    earnedPoints: number;
    manualPoints: number;
    redeemedPoints: number;
    spendablePoints: number;
    lifetimePoints: number;
  };
  adjustments: PointAdjustment[];
  redemptions: Redemption[];
  notes: NoteRow[];
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminCustomerDetail({ phoneEncoded }: { phoneEncoded: string }) {
  const toast = useToast();
  const phone = decodeURIComponent(phoneEncoded);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addNote = async () => {
    if (!noteBody.trim()) {
      toast.warning("Note body required");
      return;
    }
    setNoteBusy(true);
    try {
      const tags = noteTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/customer-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          body: noteBody,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Note added");
        setNoteBody("");
        setNoteTags("");
        setNoteDialogOpen(false);
        await fetchAll();
      } else {
        toast.error("Could not save note");
      }
    } finally {
      setNoteBusy(false);
    }
  };

  const removeNote = async (id: string) => {
    const res = await fetch(`/api/admin/customer-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Note removed");
      await fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <Link href="/admin/customers" className="v2-link-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
          </Link>
        </header>
        <div className="v2-page-loading">Loading customer…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="v2-page">
        <Link href="/admin/customers" className="v2-link-back">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
        </Link>
        <Card>
          <CardBody>
            <EmptyState icon={Phone} title="Customer not found" description={phone} />
          </CardBody>
        </Card>
      </div>
    );
  }

  const fullName =
    [data.member?.name, data.member?.lastName].filter(Boolean).join(" ") ||
    data.member?.nickname ||
    data.orders[0]?.id ||
    data.phone;

  const orderCols: Column<OrderRow>[] = [
    {
      key: "id",
      header: "Order",
      cell: (o) => <span className="mono">{o.id.slice(-6).toUpperCase()}</span>,
      sortValue: (o) => o.id,
      width: "100px",
    },
    {
      key: "date",
      header: "Date",
      cell: (o) => fmtDateTime(o.createdAt),
      sortValue: (o) => o.createdAt,
    },
    {
      key: "loc",
      header: "Location",
      cell: (o) => <Badge tone="neutral" variant="outline">{o.locationSlug}</Badge>,
    },
    {
      key: "channel",
      header: "Channel",
      cell: (o) => o.fulfillmentType,
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      cell: (o) => o.itemCount,
      sortValue: (o) => o.itemCount,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (o) => formatPrice(o.totalAmount),
      sortValue: (o) => o.totalAmount,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => <Badge tone="neutral" variant="soft">{o.status}</Badge>,
    },
  ];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <Link href="/admin/customers" className="v2-link-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
          </Link>
          <h1 className="v2-page-title">{fullName}</h1>
          <p className="v2-page-subtitle v2-inline">
            <Phone className="h-3 w-3 v2-muted" />
            <span className="mono">{data.phone}</span>
            {data.member?.email && (
              <>
                <Mail className="h-3 w-3 v2-muted" />
                {data.member.email}
              </>
            )}
            {data.member?.signedUpAt && (
              <>
                <Sparkles className="h-3 w-3 v2-muted" />
                Member since {fmtDate(data.member.signedUpAt)}
              </>
            )}
          </p>
        </div>
        <div className="v2-page-actions">
          <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNoteDialogOpen(true)}>
            Add note
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Lifetime spend"
          value={data.totals.totalSpent / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={ShoppingBag}
          tone="brand"
          hint={`${data.totals.orderCount} order${data.totals.orderCount === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Avg order"
          value={data.totals.avgOrderValue / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          icon={ShoppingBag}
          tone="info"
        />
        <KpiCard
          label="Spendable points"
          value={data.totals.spendablePoints}
          icon={Coins}
          tone="success"
          hint={`${data.totals.earnedPoints} earned + ${data.totals.manualPoints} bonus`}
        />
        <KpiCard
          label="Last order"
          value={0}
          display={fmtDate(data.totals.lastOrderAt)}
          icon={CalendarDays}
          tone="neutral"
          hint={data.totals.firstOrderAt ? `First: ${fmtDate(data.totals.firstOrderAt)}` : undefined}
        />
      </section>

      <section className="v2-grid-2-1">
        <Card padding="none">
          <CardHeader title="Order history" description={`${data.orders.length} non-pending orders`} />
          <CardBody>
            {data.orders.length === 0 ? (
              <EmptyState icon={ShoppingBag} title="No orders yet" compact />
            ) : (
              <Table rows={data.orders} columns={orderCols} rowKey={(o) => o.id} defaultSort={{ key: "date", dir: "desc" }} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Notes" description={`${data.notes.length} entr${data.notes.length === 1 ? "y" : "ies"}`} actions={<Tag className="h-4 w-4 v2-muted" />} />
          <CardBody>
            {data.notes.length === 0 ? (
              <EmptyState icon={Tag} title="No notes yet" description="Capture allergies, preferences, complaints — anything the team should know." compact />
            ) : (
              <ul className="v2-notes-list">
                {data.notes.map((n) => (
                  <li key={n.id} className="v2-note">
                    <div className="v2-note-body">{n.body}</div>
                    <div className="v2-note-foot">
                      <span className="v2-muted">
                        {n.authoredBy ?? "admin"} · {fmtDateTime(n.createdAt)}
                      </span>
                      {n.tags && n.tags.length > 0 && (
                        <span className="v2-inline">
                          {n.tags.map((t) => (
                            <Badge key={t} tone="neutral" variant="outline" icon={<Tag className="h-3 w-3" />}>
                              {t}
                            </Badge>
                          ))}
                        </span>
                      )}
                      <button type="button" className="v2-note-delete" onClick={() => removeNote(n.id)} aria-label="Delete note">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <ProfileEditor
        phone={data.phone}
        member={data.member}
        onSaved={fetchAll}
      />

      <section className="v2-grid-2">
        <Card>
          <CardHeader title="Channels & locations" description="Where this customer prefers to order" />
          <CardBody>
            <div className="v2-chip-grid">
              <div>
                <div className="v2-card-desc">Channels</div>
                {data.totals.channels.length === 0 ? (
                  <span className="v2-muted">—</span>
                ) : (
                  <span className="v2-inline">
                    {data.totals.channels.map((c) => (
                      <Badge key={c} tone="info" variant="soft">{c}</Badge>
                    ))}
                  </span>
                )}
              </div>
              <div>
                <div className="v2-card-desc">Locations</div>
                {data.totals.locations.length === 0 ? (
                  <span className="v2-muted">—</span>
                ) : (
                  <span className="v2-inline">
                    {data.totals.locations.map((l) => (
                      <Badge key={l} tone="neutral" variant="outline" icon={<MapPin className="h-3 w-3" />}>
                        {l}
                      </Badge>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Redemptions" description={`${data.redemptions.length} reward redemption${data.redemptions.length === 1 ? "" : "s"}`} />
          <CardBody>
            {data.redemptions.length === 0 ? (
              <EmptyState icon={Coins} title="No redemptions yet" compact />
            ) : (
              <ul className="v2-redeem-list">
                {data.redemptions.map((r) => (
                  <li key={r.id}>
                    <span>{r.rewardId}</span>
                    <span className="tabular v2-muted">−{r.points} pts</span>
                    <span className="v2-muted">{fmtDateTime(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <Dialog
        open={noteDialogOpen}
        onClose={() => setNoteDialogOpen(false)}
        size="md"
        title={`New note · ${fullName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteDialogOpen(false)} disabled={noteBusy}>Cancel</Button>
            <Button variant="primary" onClick={addNote} loading={noteBusy}>Save note</Button>
          </>
        }
      >
        <div className="v2-stack-12">
          <Textarea label="Note" rows={4} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="e.g. 'Gluten-free, always orders Margherita without crust'" />
          <Input
            label="Tags"
            value={noteTags}
            onChange={(e) => setNoteTags(e.target.value)}
            description="Comma-separated. Use to bucket notes by topic (e.g. 'allergy, VIP, refund')."
          />
        </div>
      </Dialog>
    </div>
  );
}

/**
 * Inline editor for the optional profile fields we use for CRM triggers
 * today (DOB + email). Saving creates a stub `LoyaltyMember` row if the
 * customer has never explicitly signed up — that way a manager who learns
 * a customer's birthday can record it immediately without forcing the
 * customer through a separate signup flow.
 */
function ProfileEditor({
  phone,
  member,
  onSaved,
}: {
  phone: string;
  member: Member | null;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [dob, setDob] = useState(member?.dob ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [busy, setBusy] = useState(false);

  const dirty = (dob || "") !== (member?.dob ?? "") || (email || "") !== (member?.email ?? "");

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/members/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          dob: dob || undefined,
          email: email.trim() || undefined,
          name: member?.name || member?.nickname,
        }),
      });
      if (res.ok) {
        toast.success("Profile saved");
        await onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not save", data?.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Profile"
        description="Optional fields. DOB powers birthday triggers; email enables receipt + reactivation campaigns."
      />
      <CardBody>
        <div className="v2-form-row-2">
          <Input
            label="Date of birth"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          <Button variant="primary" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
