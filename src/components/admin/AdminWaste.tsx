"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  PageHero,
} from "./v2/ui";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

const REASONS: { value: string; label: string }[] = [
  { value: "spoilage", label: "Spoilage" },
  { value: "prep_error", label: "Prep error" },
  { value: "dropped", label: "Dropped / damaged" },
  { value: "overproduction", label: "Over-production" },
  { value: "customer_return", label: "Customer return" },
  { value: "expired", label: "Expired" },
  { value: "other", label: "Other" },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

interface WasteEntry {
  id: string;
  locationSlug: string;
  item: string;
  quantity: number;
  unit: string;
  reason: string;
  estimatedCostGrosze?: number;
  notes?: string;
  recordedBy?: string;
  recordedAt: string;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Waste log (audit §11.2 / §12.4 #4). Reason-coded, line-fast log of food
 * discarded outside a sale, rolled up to a daily write-off cost. Per-location.
 */
export function AdminWaste() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(
    globalLoc && globalLoc !== "all" ? globalLoc : FALLBACK_LOC,
  );
  useEffect(() => {
    if (globalLoc && globalLoc !== "all") setPageLoc(globalLoc);
  }, [globalLoc]);

  const [logs, setLogs] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [reason, setReason] = useState("spoilage");
  const [costStr, setCostStr] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ location: pageLoc, from: startOfTodayIso() });
      const res = await fetch(`/api/admin/waste?${qs.toString()}`);
      setLogs(res.ok ? await res.json() : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCostToday = useMemo(
    () => logs.reduce((sum, l) => sum + (l.estimatedCostGrosze ?? 0), 0),
    [logs],
  );

  const qtyNum = parseFloat(quantity);
  const canSubmit = item.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0 && unit.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const costGrosze =
        costStr.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(costStr) * 100));
      const res = await fetch("/api/admin/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug: pageLoc,
          item: item.trim(),
          quantity: qtyNum,
          unit: unit.trim(),
          reason,
          estimatedCostGrosze: Number.isFinite(costGrosze as number) ? costGrosze : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Waste logged", `${qtyNum} ${unit} ${item.trim()} · ${REASON_LABEL[reason]}`);
        setItem("");
        setQuantity("");
        setCostStr("");
        setNotes("");
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not log waste", data.error || "Try again.");
      }
    } catch {
      toast.error("Could not log waste", "Network error.");
    } finally {
      setSaving(false);
    }
  };

  const locName = activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

  return (
    <div className="v2-page">
      <PageHero
        title="Waste log"
        subtitle="Reason-coded record of food binned outside a sale. Rolls up to a daily write-off cost — the number that quietly eats margin."
        location={{ value: pageLoc, onChange: setPageLoc }}
      />

      <section className="v2-kpi-grid">
        <Card padding="compact">
          <div className="v2-kds-stat">
            <Trash2 className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{logs.length}</div>
              <div className="v2-kds-stat-label">Entries today</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <Trash2 className="h-4 w-4" style={{ color: totalCostToday > 0 ? "var(--warning)" : "var(--success)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{formatPrice(totalCostToday)}</div>
              <div className="v2-kds-stat-label">Written off today</div>
            </div>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Log waste" />
        <CardBody>
          <div className="v2-form-row-2">
            <Input
              label="Item"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="e.g. fior di latte, dough balls"
            />
            <Select
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              options={REASONS}
            />
          </div>
          <div className="v2-form-row-2" style={{ marginTop: "0.75rem" }}>
            <Input
              label="Quantity"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="kg / units / L"
            />
          </div>
          <div className="v2-form-row-2" style={{ marginTop: "0.75rem" }}>
            <Input
              label="Estimated cost (optional)"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              trailingAdornment={<span className="v2-muted">zł</span>}
              description="Roughly what this write-off cost — feeds the daily total."
            />
            <Input
              label="Note (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. fridge left open overnight"
            />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={saving || !canSubmit}
              leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              {saving ? "Logging…" : "Log waste"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Today's waste"
          description={`${logs.length} entr${logs.length === 1 ? "y" : "ies"} at ${locName}.`}
        />
        <CardBody>
          {loading ? (
            <div className="v2-page-loading">Loading…</div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="No waste logged today"
              description="A clean day — or it just hasn't been logged. Record spoilage and prep errors as they happen."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {logs.map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {l.quantity} {l.unit} · {l.item}
                    </div>
                    {l.notes && (
                      <div className="v2-muted" style={{ fontSize: "0.8125rem" }}>{l.notes}</div>
                    )}
                  </div>
                  <Badge tone="neutral">{REASON_LABEL[l.reason] ?? l.reason}</Badge>
                  {typeof l.estimatedCostGrosze === "number" && (
                    <span className="tabular" style={{ fontWeight: 600 }}>
                      {formatPrice(l.estimatedCostGrosze)}
                    </span>
                  )}
                  <span className="v2-muted tabular" style={{ minWidth: 56, textAlign: "right", fontSize: "0.8125rem" }}>
                    {new Date(l.recordedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
