"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CircleDollarSign,
  ListPlus,
  Lock,
  MapPin,
  Plus,
  Unlock,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
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
  Select,
  Textarea,
} from "./v2/ui";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

interface CashDrop {
  id: string;
  amountGrosze: number;
  kind: "sale" | "drop" | "payout" | "adjust";
  at: string;
  notes?: string;
  actor?: string;
}

interface CashSession {
  id: string;
  locationSlug: string;
  openedAt: string;
  openingFloat: number;
  openedBy: string;
  drops: CashDrop[];
  closingCountGrosze?: number;
  closedAt?: string;
  closedBy?: string;
  varianceGrosze?: number;
  notes?: string;
}

const KIND_LABEL: Record<CashDrop["kind"], string> = {
  sale: "Cash sale",
  drop: "Bank drop",
  payout: "Payout",
  adjust: "Adjustment",
};

function expectedFromSession(s: CashSession): number {
  return s.openingFloat + s.drops.reduce((acc, d) => acc + d.amountGrosze, 0);
}

function fmtZl(grosze: number): string {
  return `${(grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function varianceTone(g: number): "success" | "warning" | "danger" {
  const abs = Math.abs(g);
  if (abs < 200) return "success"; // < 2 zł — within rounding tolerance
  if (abs < 1000) return "warning"; // < 10 zł — investigate
  return "danger";
}

export function AdminCash() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();

  // Cash sessions are per-location and the API rejects "all locations" reads
  // (a single drawer can't span trucks). When the sidebar is on "All
  // locations", default to the first active truck and let the user pick from
  // an in-page Select — mirrors the AdminInventory pattern.
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [dropDialogFor, setDropDialogFor] = useState<CashSession | null>(null);
  const [closeDialogFor, setCloseDialogFor] = useState<CashSession | null>(null);

  const locOptions = activeLocations.map((l) => ({ value: l.slug, label: l.city }));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cash?location=${encodeURIComponent(pageLoc)}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openSession = useMemo(
    () => sessions.find((s) => !s.closedAt && (s.locationSlug === pageLoc)),
    [sessions, pageLoc],
  );

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Cash management</h1>
          <p className="v2-page-subtitle">
            Open the till at the start of service, record drops, count at close. Variance &gt; 10 zł is the #1
            theft / over-ring signal — track every shift.
          </p>
        </div>
        <div className="v2-page-actions">
          <div className="v2-field-inline">
            <MapPin className="h-3.5 w-3.5 v2-muted" />
            <Select
              value={pageLoc}
              onChange={(e) => setPageLoc(e.target.value)}
              options={locOptions}
              aria-label="Cash session location"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Unlock className="h-3.5 w-3.5" />}
            onClick={() => setOpenDialog(true)}
            disabled={!!openSession}
            title={
              openSession
                ? "A session is already open for this location"
                : "Open a new cash session"
            }
          >
            Open session
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="v2-page-loading">Loading sessions…</div>
      ) : null}

      {!loading && openSession && (
        <Card>
          <CardHeader
            title={`Open session · ${openSession.locationSlug.toUpperCase()}`}
            description={`Opened ${new Date(openSession.openedAt).toLocaleString()} by ${openSession.openedBy}`}
            actions={
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button size="sm" variant="ghost" leadingIcon={<ListPlus className="h-3.5 w-3.5" />} onClick={() => setDropDialogFor(openSession)}>
                  Record drop / sale
                </Button>
                <Button size="sm" variant="primary" leadingIcon={<Lock className="h-3.5 w-3.5" />} onClick={() => setCloseDialogFor(openSession)}>
                  Close session
                </Button>
              </div>
            }
          />
          <CardBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <StatTile label="Opening float" value={fmtZl(openSession.openingFloat)} icon={<Banknote className="h-3.5 w-3.5" />} />
              <StatTile label="Drops / entries" value={openSession.drops.length.toString()} icon={<ListPlus className="h-3.5 w-3.5" />} />
              <StatTile
                label="Expected in drawer"
                value={fmtZl(expectedFromSession(openSession))}
                icon={<CircleDollarSign className="h-3.5 w-3.5" />}
              />
            </div>
            {openSession.drops.length === 0 ? (
              <p className="v2-muted" style={{ fontSize: "0.875rem" }}>
                No drops yet. Use Record drop / sale to log a cash sale, a bank drop, or a payout.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {openSession.drops
                  .slice()
                  .reverse()
                  .map((d) => (
                    <li
                      key={d.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8125rem", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Badge tone={d.amountGrosze < 0 ? "danger" : "success"} variant="soft">
                          {KIND_LABEL[d.kind]}
                        </Badge>
                        <span className="v2-muted">{new Date(d.at).toLocaleString()}</span>
                        {d.notes && <span className="v2-muted">· {d.notes}</span>}
                      </span>
                      <span className="mono">{(d.amountGrosze >= 0 ? "+" : "") + fmtZl(d.amountGrosze)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {!loading && sessions.length === 0 && (
        <Card>
          <CardBody>
            <EmptyState
              icon={Banknote}
              title="No cash sessions yet"
              description="Open your first session to start tracking the till. Drops, sales, and EOD variance will appear here."
              action={
                <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpenDialog(true)}>
                  Open session
                </Button>
              }
            />
          </CardBody>
        </Card>
      )}

      {!loading && sessions.length > 0 && (
        <Card>
          <CardHeader title="History" description={`${sessions.length} session${sessions.length === 1 ? "" : "s"} at this location.`} />
          <CardBody>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {sessions.map((s) => {
                const expected = expectedFromSession(s);
                const isClosed = !!s.closedAt;
                return (
                  <li
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: "0.5rem",
                      alignItems: "center",
                      padding: "0.5rem 0",
                      borderTop: "1px solid var(--border)",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span>
                      <Badge tone={isClosed ? "neutral" : "warning"} variant="soft">
                        {isClosed ? "Closed" : "Open"}
                      </Badge>
                      <span className="v2-muted" style={{ marginLeft: "0.5rem" }}>
                        {new Date(s.openedAt).toLocaleString()}
                      </span>
                    </span>
                    <span className="v2-muted">Opening {fmtZl(s.openingFloat)}</span>
                    <span className="v2-muted">Expected {fmtZl(expected)}</span>
                    {isClosed ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <span className="v2-muted">Counted {fmtZl(s.closingCountGrosze ?? 0)}</span>
                        <Badge tone={varianceTone(s.varianceGrosze ?? 0)} variant="soft">
                          {((s.varianceGrosze ?? 0) >= 0 ? "+" : "") + formatPrice(s.varianceGrosze ?? 0)}
                        </Badge>
                      </span>
                    ) : (
                      <span style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button size="sm" variant="ghost" onClick={() => setCloseDialogFor(s)}>
                          Close
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {openDialog && (
        <OpenDialog
          locationSlug={pageLoc}
          onClose={() => setOpenDialog(false)}
          onOpened={async () => {
            setOpenDialog(false);
            await fetchAll();
            toast.success("Cash session opened");
          }}
        />
      )}

      {dropDialogFor && (
        <DropDialog
          session={dropDialogFor}
          onClose={() => setDropDialogFor(null)}
          onSaved={async () => {
            setDropDialogFor(null);
            await fetchAll();
            toast.success("Drop recorded");
          }}
        />
      )}

      {closeDialogFor && (
        <CloseDialog
          session={closeDialogFor}
          onClose={() => setCloseDialogFor(null)}
          onClosed={async () => {
            setCloseDialogFor(null);
            await fetchAll();
            toast.success("Session closed");
          }}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 1rem", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>{value}</div>
    </div>
  );
}

function OpenDialog({
  locationSlug,
  onClose,
  onOpened,
}: {
  locationSlug: string;
  onClose: () => void;
  onOpened: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [floatStr, setFloatStr] = useState("200.00");
  const [openedBy, setOpenedBy] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const openingFloat = Math.round(parseFloat(floatStr || "0") * 100);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      toast.warning("Enter a valid opening float");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug,
          openingFloat,
          openedBy: openedBy.trim() || "admin",
        }),
      });
      if (res.ok) {
        await onOpened();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not open session", data?.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Open cash session — ${locationSlug.toUpperCase()}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Opening…" : "Open"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="Opening float (zł)"
          type="number"
          step="0.01"
          min="0"
          value={floatStr}
          onChange={(e) => setFloatStr(e.target.value)}
          description="Count the till before service. Stored in grosze."
        />
        <Input
          label="Opened by"
          value={openedBy}
          onChange={(e) => setOpenedBy(e.target.value)}
          placeholder="Manager name (optional)"
        />
      </div>
    </Dialog>
  );
}

function DropDialog({
  session,
  onClose,
  onSaved,
}: {
  session: CashSession;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<CashDrop["kind"]>("sale");
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    let amount = Math.round(parseFloat(amountStr || "0") * 100);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.warning("Enter a non-zero amount");
      return;
    }
    // Payouts and drops to the bank are negative — they leave the drawer.
    if (kind === "drop" || kind === "payout") {
      if (amount > 0) amount = -amount;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cash/${session.id}?action=drop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountGrosze: amount,
          kind,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        await onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not record drop", data?.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Record cash movement"
      description="Sales add to the drawer; bank drops and payouts remove cash."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Select
          label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CashDrop["kind"])}
          options={[
            { value: "sale", label: "Cash sale (+)" },
            { value: "drop", label: "Bank drop (−)" },
            { value: "payout", label: "Payout (−)" },
            { value: "adjust", label: "Adjustment" },
          ]}
        />
        <Input
          label="Amount (zł)"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          description={
            kind === "drop" || kind === "payout"
              ? "Enter a positive amount — the system records it as a negative drawer movement."
              : kind === "adjust"
                ? "Positive for over-ring corrections, negative for shortfalls."
                : "Always positive."
          }
        />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

function CloseDialog({
  session,
  onClose,
  onClosed,
}: {
  session: CashSession;
  onClose: () => void;
  onClosed: () => void | Promise<void>;
}) {
  const toast = useToast();
  const expected = expectedFromSession(session);
  const [countStr, setCountStr] = useState((expected / 100).toFixed(2));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const counted = Math.round(parseFloat(countStr || "0") * 100);
  const variance = Number.isFinite(counted) ? counted - expected : 0;

  const submit = async () => {
    if (!Number.isFinite(counted) || counted < 0) {
      toast.warning("Enter a valid count");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cash/${session.id}?action=close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingCountGrosze: counted,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        await onClosed();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not close session", data?.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Close cash session"
      description="Count the drawer and enter the total. Variance is computed automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Closing…" : "Close session"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <div style={{ display: "flex", gap: "0.5rem", flexDirection: "column", fontSize: "0.8125rem" }}>
          <span className="v2-muted">Opening + drops expects {fmtZl(expected)} in the drawer.</span>
        </div>
        <Input
          label="Counted total (zł)"
          type="number"
          step="0.01"
          value={countStr}
          onChange={(e) => setCountStr(e.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.875rem" }}>
          <span>Variance</span>
          <Badge tone={varianceTone(variance)} variant="soft">
            {(variance >= 0 ? "+" : "") + formatPrice(variance)}
          </Badge>
        </div>
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
