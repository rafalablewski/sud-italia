"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Minus,
  Plus,
  ScanLine,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { IngredientCategory, IngredientUnit, StockMovementType } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import {
  BottomSheet,
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
} from "../v2/mobile";
import { BarcodeScanner } from "../v2/mobile/BarcodeScanner";
import { useActionTiming } from "../v2/mobile/useActionTiming";

interface StockRow {
  ingredientId: string;
  locationSlug: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  lastCountedAt?: string;
  updatedAt: string;
  name: string;
  unit: IngredientUnit;
  category: IngredientCategory;
  costPerUnit: number;
  supplier?: string;
}

type StatusFilter = "all" | "ok" | "low" | "out";

const FALLBACK_LOC = getActiveLocations()[0]?.slug ?? "krakow";

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  receive: "Receive",
  waste: "Waste",
  consume: "Consume",
  adjust: "Adjust",
};

function classify(row: StockRow): "ok" | "low" | "out" {
  if (row.onHand <= 0) return "out";
  if (row.onHand <= row.reorderPoint) return "low";
  return "ok";
}

/**
 * Mobile inventory. Two big design moves:
 *   1. No table — items appear as 2-line rows with an inline status pill.
 *   2. Adjust opens a bottom sheet with a Stepper instead of a modal-spinner.
 *      Big keypad-friendly +/- buttons + quick presets.
 */
export function MobileInventory() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const timing = useActionTiming();
  const [busy, setBusy] = useState<string | null>(null);

  // Mirror the global location when it changes — but stock is always scoped
  // to a single location, so empty means "use last known".
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const refresh = async () => {
    const r = await fetch(`/api/admin/stock?location=${pageLoc}`);
    if (!r.ok) return;
    const data = (await r.json()) as StockRow[];
    setStock(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoc]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stock
      .filter((s) => {
        if (filter === "all") return true;
        return classify(s) === filter;
      })
      .filter((s) => {
        if (!needle) return true;
        return s.name.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const ca = classify(a);
        const cb = classify(b);
        const rank = { out: 0, low: 1, ok: 2 } as const;
        if (rank[ca] !== rank[cb]) return rank[ca] - rank[cb];
        return a.name.localeCompare(b.name);
      });
  }, [stock, filter, q]);

  const counts = useMemo(() => {
    const m = { all: stock.length, ok: 0, low: 0, out: 0 };
    for (const s of stock) m[classify(s)]++;
    return m;
  }, [stock]);

  const applyMovement = async (
    row: StockRow,
    type: StockMovementType,
    qty: number,
    reason?: string,
  ) => {
    if (qty <= 0) return;
    setBusy(row.ingredientId);
    timing.start("inventory.adjust");
    // Optimistic — receive adds, waste/consume subtract, adjust sets directly.
    setStock((arr) =>
      arr.map((s) =>
        s.ingredientId === row.ingredientId
          ? {
              ...s,
              onHand:
                type === "receive"
                  ? s.onHand + qty
                  : type === "adjust"
                    ? qty
                    : Math.max(0, s.onHand - qty),
            }
          : s,
      ),
    );
    try {
      const r = await fetch("/api/admin/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: row.ingredientId,
          locationSlug: row.locationSlug,
          type,
          quantity: qty,
          reason,
        }),
      });
      if (!r.ok) throw new Error("movement failed");
      toast.success(`${MOVEMENT_LABEL[type]} · ${row.name}`);
    } catch {
      toast.error("Could not record movement");
      // Rollback by refetching.
      refresh();
    } finally {
      timing.stop("inventory.adjust", { type, qty });
      setBusy(null);
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ChipStrip ariaLabel="Stock status filter">
              <Chip label="All" active={filter === "all"} count={counts.all} onClick={() => setFilter("all")} />
              <Chip label="Out" active={filter === "out"} count={counts.out} onClick={() => setFilter("out")} />
              <Chip label="Low" active={filter === "low"} count={counts.low} onClick={() => setFilter("low")} />
              <Chip label="OK" active={filter === "ok"} count={counts.ok} onClick={() => setFilter("ok")} />
            </ChipStrip>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg-subtle)",
              }}
            >
              <Search className="h-4 w-4" aria-hidden />
              <input
                type="search"
                inputMode="search"
                placeholder="Search ingredients…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: 0,
                  color: "var(--fg)",
                  fontSize: "var(--m-text-base)",
                  fontFamily: "var(--font-ui)",
                }}
              />
            </label>
          </div>
        }
      >
        <PageHeader
          title="Stock"
          subtitle={pageLoc.toUpperCase()}
          actions={
            <button
              type="button"
              className="v2-m-icon-btn"
              aria-label="Scan barcode"
              onClick={() => setScanning(true)}
            >
              <ScanLine className="h-5 w-5" />
            </button>
          }
        />

        <ul role="list" className="v2-m-list">
          {filtered.map((row) => {
            const status = classify(row);
            const tone = status === "out" ? "danger" : status === "low" ? "warning" : "success";
            const pct = row.parLevel
              ? Math.min(100, (row.onHand / row.parLevel) * 100)
              : 100;
            return (
              <li key={`${row.ingredientId}-${row.locationSlug}`}>
                <button
                  type="button"
                  className="v2-m-list-row"
                  onClick={() => setEditing(row)}
                  disabled={busy === row.ingredientId}
                >
                  <span className={`v2-m-list-icon v2-m-tone-${tone}`}>
                    {status === "out" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Boxes className="h-4 w-4" />
                    )}
                  </span>
                  <span className="v2-m-list-stack">
                    <span className="v2-m-list-title">{row.name}</span>
                    <span className="v2-m-list-sub">
                      {row.onHand} {row.unit} · par {row.parLevel} · reorder {row.reorderPoint}
                    </span>
                    <ProgressBar pct={pct} tone={tone} />
                  </span>
                  <span className={`v2-m-pill v2-m-pill-${tone}`}>
                    {status === "out" ? "OUT" : status === "low" ? "LOW" : "OK"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {filtered.length === 0 && (
          <div className="v2-m-empty">
            <Boxes className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">No ingredients</div>
            <div className="v2-m-empty-desc">Nothing matches this filter.</div>
          </div>
        )}
      </MobilePage>

      <AdjustSheet
        row={editing}
        onClose={() => setEditing(null)}
        onCommit={(type, qty, reason) => {
          if (editing) applyMovement(editing, type, qty, reason);
          setEditing(null);
        }}
      />

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false);
          // Match against ingredient SKU (lowercased), then name fallback.
          const needle = code.trim().toLowerCase();
          const hit =
            stock.find((s) => s.name.toLowerCase().includes(needle)) ??
            null;
          if (hit) {
            setEditing(hit);
            toast.success("Matched", hit.name);
          } else {
            toast.warning("No match", code);
          }
        }}
      />
    </PullToRefresh>
  );
}

function ProgressBar({ pct, tone }: { pct: number; tone: "success" | "warning" | "danger" }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: "100%",
        height: 3,
        background: "var(--surface-3)",
        borderRadius: 2,
        marginTop: 6,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${pct}%`,
          background: `var(--${tone})`,
          transition: "width 220ms cubic-bezier(0.32,0.72,0,1)",
        }}
      />
    </span>
  );
}

function AdjustSheet({
  row,
  onClose,
  onCommit,
}: {
  row: StockRow | null;
  onClose: () => void;
  onCommit: (type: StockMovementType, qty: number, reason?: string) => void;
}) {
  const [type, setType] = useState<StockMovementType>("receive");
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (row) {
      setType("receive");
      setQty(1);
      setReason("");
    }
  }, [row]);

  if (!row) return null;

  const adjustingToHand = type === "adjust";
  const projected =
    type === "receive"
      ? row.onHand + qty
      : type === "adjust"
        ? qty
        : Math.max(0, row.onHand - qty);

  return (
    <BottomSheet
      open={!!row}
      onClose={onClose}
      title={row.name}
      size="auto"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={qty <= 0}
          onClick={() => onCommit(type, qty, reason || undefined)}
        >
          {type === "adjust"
            ? `Set to ${qty} ${row.unit}`
            : `${MOVEMENT_LABEL[type]} ${qty} ${row.unit}`}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SegmentControl<StockMovementType>
          value={type}
          onChange={setType}
          options={[
            { value: "receive", label: "Receive" },
            { value: "waste", label: "Waste" },
            { value: "consume", label: "Consume" },
            { value: "adjust", label: "Adjust" },
          ]}
          ariaLabel="Movement type"
        />

        <div
          style={{
            padding: 14,
            background: "var(--surface-2)",
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: "1fr 56px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: 0.06 }}>
              {adjustingToHand ? "New on-hand" : "Quantity"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.02 }} className="tabular">
              {qty} <span style={{ fontSize: 14, color: "var(--fg-subtle)", fontWeight: 500 }}>{row.unit}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              className="v2-m-btn v2-m-btn-ghost"
              aria-label="Increase"
              onClick={() => setQty((n) => Math.min(99999, n + 1))}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="v2-m-btn v2-m-btn-ghost"
              aria-label="Decrease"
              onClick={() => setQty((n) => Math.max(0, n - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[1, 5, 10, 25].map((preset) => (
            <button
              key={preset}
              type="button"
              className="v2-m-chip"
              onClick={() => setQty(preset)}
              style={{ justifyContent: "center" }}
            >
              {preset}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--fg)",
            fontSize: 16,
            outline: 0,
            fontFamily: "var(--font-ui)",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: "var(--surface-2)",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>Current</span>
          <span className="tabular" style={{ fontWeight: 600 }}>
            {row.onHand} → <span style={{ color: projected < row.reorderPoint ? "var(--warning)" : "var(--fg)" }}>{projected}</span> {row.unit}
            {projected > row.onHand ? (
              <TrendingUp className="inline h-3.5 w-3.5 ml-1" style={{ color: "var(--success)" }} />
            ) : projected < row.onHand ? (
              <TrendingDown className="inline h-3.5 w-3.5 ml-1" style={{ color: "var(--warning)" }} />
            ) : null}
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
