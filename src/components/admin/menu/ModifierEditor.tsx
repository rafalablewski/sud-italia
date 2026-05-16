"use client";

// Per-location modifier editor with a location lens. Group structure
// (label, min/max, option labels, KDS flag) propagates chain-wide via
// `updateStructure`, so customer-visible option sets and KDS routing
// stay consistent across trucks. Per-option `priceDelta` + `costDelta`
// follow the lens at the top of the card — operators pick one truck,
// see that truck's prices, retune, and switch to the next.
//
// Side-by-side columns were the previous shape but stopped scaling
// around 5 trucks; at 20 the table became unscannable. The lens
// keeps the UI at a fixed two-column width regardless of fleet size.
// Each option row carries a small "varies: X–Y zł" chip + "→ all"
// button so divergences across the chain stay visible from the
// single-location view, and one click can fan a price out everywhere.

import type { ModifierGroup, ModifierOption } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { Button, Input, Select } from "../v2/ui";

export interface ModifierEditorLocation {
  slug: string;
  city: string;
}

interface ModifierEditorProps {
  present: ModifierEditorLocation[];
  groupsByLoc: Record<string, ModifierGroup[]>;
  setGroupsByLoc: (
    next:
      | Record<string, ModifierGroup[]>
      | ((prev: Record<string, ModifierGroup[]>) => Record<string, ModifierGroup[]>),
  ) => void;
  selectedLoc: string;
  onSelectLoc: (slug: string) => void;
}

export function ModifierMatrix({
  present,
  groupsByLoc,
  setGroupsByLoc,
  selectedLoc,
  onSelectLoc,
}: ModifierEditorProps) {
  // Canonical structure = first present variant's groups. Other variants
  // can have drifted historic data; the editor lifts the canonical names /
  // KDS flags / option ids so the operator sees one consistent structure,
  // and per-location priceDelta is read independently from each variant.
  const canonical = present[0] ? groupsByLoc[present[0].slug] ?? [] : [];
  const activeSlug =
    selectedLoc && present.some((v) => v.slug === selectedLoc)
      ? selectedLoc
      : present[0]?.slug ?? "";
  const activeCity =
    present.find((v) => v.slug === activeSlug)?.city ?? activeSlug;

  const updateStructure = (
    mutator: (groups: ModifierGroup[]) => ModifierGroup[],
  ) => {
    setGroupsByLoc((prev) => {
      const next: Record<string, ModifierGroup[]> = {};
      for (const v of present) {
        next[v.slug] = mutator(prev[v.slug] ?? []);
      }
      return { ...prev, ...next };
    });
  };

  const updateOneLocation = (
    slug: string,
    mutator: (groups: ModifierGroup[]) => ModifierGroup[],
  ) => {
    setGroupsByLoc((prev) => ({
      ...prev,
      [slug]: mutator(prev[slug] ?? []),
    }));
  };

  const addGroup = () => {
    const id = `mod-${Math.random().toString(36).slice(2, 8)}`;
    const optionId = `opt-${Math.random().toString(36).slice(2, 8)}`;
    updateStructure((groups) => [
      ...groups,
      {
        id,
        label: "New group",
        minSelections: 0,
        maxSelections: 1,
        options: [{ id: optionId, label: "Standard", priceDelta: 0 }],
      },
    ]);
  };

  const removeGroup = (gid: string) => {
    updateStructure((groups) => groups.filter((g) => g.id !== gid));
  };

  const setGroupField = (
    gid: string,
    patch: Partial<Omit<ModifierGroup, "options" | "id">>,
  ) => {
    updateStructure((groups) =>
      groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)),
    );
  };

  const addOption = (gid: string) => {
    const oid = `opt-${Math.random().toString(36).slice(2, 8)}`;
    updateStructure((groups) =>
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: [
                ...g.options,
                { id: oid, label: "New option", priceDelta: 0 },
              ],
            }
          : g,
      ),
    );
  };

  const removeOption = (gid: string, oid: string) => {
    updateStructure((groups) =>
      groups.map((g) =>
        g.id === gid ? { ...g, options: g.options.filter((o) => o.id !== oid) } : g,
      ),
    );
  };

  const setOptionStructure = (
    gid: string,
    oid: string,
    patch: Partial<Pick<ModifierOption, "label" | "flagOnKds">>,
  ) => {
    updateStructure((groups) =>
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: g.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
            }
          : g,
      ),
    );
  };

  const setOptionPriceDelta = (
    slug: string,
    gid: string,
    oid: string,
    priceDelta: number,
  ) => {
    updateOneLocation(slug, (groups) =>
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: g.options.map((o) =>
                o.id === oid ? { ...o, priceDelta } : o,
              ),
            }
          : g,
      ),
    );
  };

  const setOptionCostDelta = (
    slug: string,
    gid: string,
    oid: string,
    costDelta: number | undefined,
  ) => {
    updateOneLocation(slug, (groups) =>
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: g.options.map((o) => (o.id === oid ? { ...o, costDelta } : o)),
            }
          : g,
      ),
    );
  };

  /** Push the active lens' price for one option out to every truck. */
  const applyPriceDeltaToAll = (gid: string, oid: string) => {
    const source = groupsByLoc[activeSlug]
      ?.find((g) => g.id === gid)
      ?.options.find((o) => o.id === oid);
    if (!source) return;
    const price = source.priceDelta;
    setGroupsByLoc((prev) => {
      const next: Record<string, ModifierGroup[]> = { ...prev };
      for (const v of present) {
        next[v.slug] = (prev[v.slug] ?? []).map((g) =>
          g.id === gid
            ? {
                ...g,
                options: g.options.map((o) =>
                  o.id === oid ? { ...o, priceDelta: price } : o,
                ),
              }
            : g,
        );
      }
      return next;
    });
  };

  const readOption = (
    slug: string,
    gid: string,
    oid: string,
  ): ModifierOption | undefined =>
    groupsByLoc[slug]?.find((g) => g.id === gid)?.options.find((o) => o.id === oid);

  /** Price spread across every present truck so the active-lens row can
   *  surface "5,00–7,00 zł" when other locations diverge from what's on
   *  screen. Returns null when every truck agrees (no chip needed). */
  const priceVariance = (
    gid: string,
    oid: string,
  ): { min: number; max: number } | null => {
    if (present.length <= 1) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const v of present) {
      const d = readOption(v.slug, gid, oid)?.priceDelta ?? 0;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (min === max) return null;
    return { min, max };
  };

  if (present.length === 0) {
    return (
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--fg-muted)",
          fontStyle: "italic",
        }}
      >
        Add the product to at least one location to edit modifiers.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            minWidth: 0,
            flex: 1,
          }}
        >
          <label
            htmlFor="modifier-lens"
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Editing pricing for:
          </label>
          <div style={{ minWidth: 180 }}>
            <Select
              id="modifier-lens"
              value={activeSlug}
              onChange={(e) => onSelectLoc(e.target.value)}
              options={present.map((v) => ({ value: v.slug, label: v.city }))}
              aria-label="Modifier pricing lens"
            />
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={addGroup}>
          + Add group
        </Button>
      </div>

      {canonical.length === 0 && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--fg-muted)",
            fontStyle: "italic",
          }}
        >
          No modifier groups. Customers see the standard price only.
        </p>
      )}

      {canonical.map((group) => (
        <div
          key={group.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            padding: "0.625rem 0.75rem",
          }}
        >
          {/* Structural header — propagates across every location */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: "0.5rem",
              alignItems: "end",
            }}
          >
            <Input
              label="Group label"
              value={group.label}
              onChange={(e) => setGroupField(group.id, { label: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              max={10}
              label="Min picks"
              value={String(group.minSelections ?? 0)}
              onChange={(e) =>
                setGroupField(group.id, {
                  minSelections: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
            <Input
              type="number"
              min={1}
              max={10}
              label="Max picks"
              value={String(group.maxSelections ?? 1)}
              onChange={(e) =>
                setGroupField(group.id, {
                  maxSelections: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
            <Button size="sm" variant="ghost" onClick={() => removeGroup(group.id)}>
              Remove group
            </Button>
          </div>

          {/* Option rows — pricing belongs to the active lens; the
           *  variance chip surfaces other trucks' divergent prices so
           *  operators see the chain spread without leaving this view. */}
          <table className="v2-mod-matrix">
            <thead>
              <tr>
                <th style={{ minWidth: 160, textAlign: "left" }}>Option</th>
                <th style={{ width: 48 }} title="Highlight on KDS ticket">
                  KDS
                </th>
                <th style={{ minWidth: 110 }}>Price ({activeCity})</th>
                <th style={{ minWidth: 110 }}>Cost ({activeCity})</th>
                <th style={{ minWidth: 140, textAlign: "left" }}>Across chain</th>
                <th style={{ width: 96 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {group.options.map((option) => {
                const opt = readOption(activeSlug, group.id, option.id);
                const priceDelta = opt?.priceDelta ?? 0;
                const costDelta = opt?.costDelta;
                const variance = priceVariance(group.id, option.id);
                return (
                  <tr key={option.id}>
                    <td>
                      <Input
                        value={option.label}
                        onChange={(e) =>
                          setOptionStructure(group.id, option.id, {
                            label: e.target.value,
                          })
                        }
                        aria-label="Option label"
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!option.flagOnKds}
                        onChange={(e) =>
                          setOptionStructure(group.id, option.id, {
                            flagOnKds: e.target.checked || undefined,
                          })
                        }
                        aria-label={`KDS highlight for ${option.label}`}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(priceDelta / 100).toFixed(2)}
                        onChange={(e) =>
                          setOptionPriceDelta(
                            activeSlug,
                            group.id,
                            option.id,
                            Math.max(
                              0,
                              Math.round(parseFloat(e.target.value || "0") * 100),
                            ),
                          )
                        }
                        trailingAdornment={<span className="v2-muted">zł</span>}
                        aria-label={`${option.label} price at ${activeCity}`}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          typeof costDelta === "number"
                            ? (costDelta / 100).toFixed(2)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          setOptionCostDelta(
                            activeSlug,
                            group.id,
                            option.id,
                            raw === ""
                              ? undefined
                              : Math.max(0, Math.round(parseFloat(raw) * 100)),
                          );
                        }}
                        placeholder="cost δ"
                        trailingAdornment={<span className="v2-muted">zł</span>}
                        aria-label={`${option.label} cost at ${activeCity}`}
                      />
                    </td>
                    <td>
                      {variance ? (
                        <span
                          className="v2-mod-variance"
                          title="Prices across the chain — switch the lens to retune another truck"
                        >
                          {formatPrice(variance.min)}–{formatPrice(variance.max)}
                        </span>
                      ) : present.length > 1 ? (
                        <span
                          className="v2-muted"
                          style={{ fontSize: "var(--text-2xs)" }}
                        >
                          uniform
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "stretch",
                        }}
                      >
                        {present.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => applyPriceDeltaToAll(group.id, option.id)}
                            title={`Copy ${activeCity}'s price to every location`}
                            disabled={!variance}
                          >
                            → all
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeOption(group.id, option.id)}
                          style={{ color: "var(--danger)" }}
                          title="Remove option (chain-wide)"
                        >
                          ×
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div>
            <Button size="sm" variant="ghost" onClick={() => addOption(group.id)}>
              + Add option
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
