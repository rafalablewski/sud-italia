"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
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
  Switch,
  Textarea,
  PageHero,
} from "./v2/ui";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

const SHIFTS = [
  { value: "open", label: "Opening" },
  { value: "mid", label: "Mid-shift" },
  { value: "close", label: "Closing" },
];
const SHIFT_LABEL: Record<string, string> = { open: "Opening", mid: "Mid-shift", close: "Closing" };

interface Handover {
  id: string;
  locationSlug: string;
  shift: string;
  cashCountedGrosze?: number;
  cashSessionId?: string;
  cashVarianceGrosze?: number;
  tempChecksOk: boolean;
  wasteNoted: boolean;
  equipmentOk: boolean;
  managerComment?: string;
  outgoingManager: string;
  incomingManager?: string;
  recordedAt: string;
}

interface CashSession {
  id: string;
  openedAt: string;
  closedAt?: string;
}

function startOfWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function varianceTone(g: number): "success" | "warning" | "danger" {
  const abs = Math.abs(g);
  if (abs < 200) return "success";
  if (abs < 1000) return "warning";
  return "danger";
}

/**
 * Shift handover (audit §11.2 / §12.4 #1). The end-of-shift sign-off tying cash
 * count (reconciled against the session for a real variance), temperature +
 * waste checks and a manager comment to a named outgoing manager. Per-location.
 */
export function AdminHandover() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  // Site comes from the shell scope (topbar ScopeSwitcher); "all" → first truck.
  const pageLoc = globalLoc && globalLoc !== "all" ? globalLoc : FALLBACK_LOC;

  const [history, setHistory] = useState<Handover[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [shift, setShift] = useState("close");
  const [cashSessionId, setCashSessionId] = useState("");
  const [cashCountedStr, setCashCountedStr] = useState("");
  const [tempChecksOk, setTempChecksOk] = useState(true);
  const [wasteNoted, setWasteNoted] = useState(true);
  const [equipmentOk, setEquipmentOk] = useState(true);
  const [outgoing, setOutgoing] = useState("");
  const [incoming, setIncoming] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, cRes] = await Promise.all([
        fetch(`/api/admin/handover?location=${encodeURIComponent(pageLoc)}&from=${encodeURIComponent(startOfWeekIso())}`),
        fetch(`/api/admin/cash?location=${encodeURIComponent(pageLoc)}`),
      ]);
      setHistory(hRes.ok ? await hRes.json() : []);
      setSessions(cRes.ok ? await cRes.json() : []);
    } catch {
      setHistory([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionOptions = useMemo(
    () => [
      { value: "", label: "— no cash reconciliation —" },
      ...sessions.map((s) => ({
        value: s.id,
        label: `${s.closedAt ? "Closed" : "Open"} · opened ${new Date(s.openedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      })),
    ],
    [sessions],
  );

  const canSubmit = outgoing.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const counted =
        cashCountedStr.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(cashCountedStr) * 100));
      const res = await fetch("/api/admin/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug: pageLoc,
          shift,
          cashSessionId: cashSessionId || undefined,
          cashCountedGrosze: Number.isFinite(counted as number) ? counted : undefined,
          tempChecksOk,
          wasteNoted,
          equipmentOk,
          outgoingManager: outgoing.trim(),
          incomingManager: incoming.trim() || undefined,
          managerComment: comment.trim() || undefined,
        }),
      });
      if (res.ok) {
        const saved: Handover = await res.json();
        const v = saved.cashVarianceGrosze;
        toast.success(
          "Handover recorded",
          typeof v === "number"
            ? `Cash variance ${v >= 0 ? "+" : ""}${formatPrice(v)}`
            : `${SHIFT_LABEL[saved.shift]} signed off`,
        );
        setCashCountedStr("");
        setComment("");
        setIncoming("");
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not record handover", data.error || "Try again.");
      }
    } catch {
      toast.error("Could not record handover", "Network error.");
    } finally {
      setSaving(false);
    }
  };

  const locName = activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

  return (
    <div className="v2-page">
      <PageHero
        title="Shift handover"
        subtitle="The end-of-shift sign-off: count the drawer (reconciled against the cash session), confirm temps + waste are logged, leave a note, name the outgoing manager."      />

      <Card>
        <CardHeader title="Record a handover" />
        <CardBody>
          <div className="v2-form-row-2">
            <Select label="Shift" value={shift} onChange={(e) => setShift(e.target.value)} options={SHIFTS} />
            <Select
              label="Cash session"
              value={cashSessionId}
              onChange={(e) => setCashSessionId(e.target.value)}
              options={sessionOptions}
            />
          </div>
          <div className="v2-form-row-2" style={{ marginTop: "0.75rem" }}>
            <Input
              label="Cash counted in drawer"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={cashCountedStr}
              onChange={(e) => setCashCountedStr(e.target.value)}
              trailingAdornment={<span className="v2-muted">zł</span>}
              description={cashSessionId ? "Variance vs the session's expected total is computed on save." : "Pick a cash session to compute variance."}
            />
            <Input
              label="Outgoing manager"
              value={outgoing}
              onChange={(e) => setOutgoing(e.target.value)}
              placeholder="Who's signing off this shift"
            />
          </div>
          <div className="v2-form-row-2" style={{ marginTop: "0.75rem" }}>
            <Input
              label="Incoming manager (optional)"
              value={incoming}
              onChange={(e) => setIncoming(e.target.value)}
              placeholder="Who's taking over"
            />
            <div />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span>Temperature checks logged this shift</span>
              <Switch checked={tempChecksOk} onChange={setTempChecksOk} label="Temperature checks logged" />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span>Waste logged this shift</span>
              <Switch checked={wasteNoted} onChange={setWasteNoted} label="Waste logged" />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span>Equipment / close-down checklist OK</span>
              <Switch checked={equipmentOk} onChange={setEquipmentOk} label="Equipment OK" />
            </label>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <Textarea
              label="Manager comment (optional)"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything the next shift needs to know — supplier no-show, oven running hot, VIP booking at 7pm…"
            />
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={saving || !canSubmit}
              leadingIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
            >
              {saving ? "Recording…" : "Record handover"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent handovers" description={`Last 7 days at ${locName}.`} />
        <CardBody>
          {loading ? (
            <div className="v2-page-loading">Loading…</div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No handovers recorded yet"
              description="Record the first shift sign-off above. Cash variance and the temp/waste checklist are captured each time."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    padding: "0.6rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <Badge tone="neutral">{SHIFT_LABEL[h.shift] ?? h.shift}</Badge>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600 }}>
                      {h.outgoingManager}
                      {h.incomingManager ? ` → ${h.incomingManager}` : ""}
                    </div>
                    {h.managerComment && (
                      <div className="v2-muted" style={{ fontSize: "0.8125rem" }}>{h.managerComment}</div>
                    )}
                  </div>
                  {typeof h.cashVarianceGrosze === "number" && (
                    <Badge tone={varianceTone(h.cashVarianceGrosze)}>
                      Cash {h.cashVarianceGrosze >= 0 ? "+" : ""}{formatPrice(h.cashVarianceGrosze)}
                    </Badge>
                  )}
                  <Badge tone={h.tempChecksOk ? "success" : "danger"}>Temp {h.tempChecksOk ? "✓" : "✗"}</Badge>
                  <Badge tone={h.wasteNoted ? "success" : "danger"}>Waste {h.wasteNoted ? "✓" : "✗"}</Badge>
                  <Badge tone={h.equipmentOk ? "success" : "danger"}>Equip {h.equipmentOk ? "✓" : "✗"}</Badge>
                  <span className="v2-muted tabular" style={{ fontSize: "0.8125rem" }}>
                    {new Date(h.recordedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
