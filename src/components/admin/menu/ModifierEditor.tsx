"use client";

// Per-location modifier editor with a location lens. Group structure
// (label, min/max, option labels, KDS flag) propagates chain-wide;
// per-option priceDelta + costDelta follow the lens at the top of the
// card. Side-by-side columns were the previous shape but stopped
// scaling around 5 trucks; the lens keeps the rendered surface at a
// fixed width regardless of fleet size.
//
// Visuals are deliberately quiet: inputs read as plain text until you
// hover or focus them, native number spinners are suppressed, and
// remove buttons fade in on row hover so a populated group looks like
// a calm list rather than a forest of chrome.

import { MapPin, X } from "lucide-react";
import type { ModifierGroup, ModifierOption } from "@/data/types";
import { formatPrice } from "@/lib/utils";

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
  /** The active truck for per-option priceDelta / costDelta editing.
   *  Comes from the page-level scope bar — the matrix doesn't own a
   *  lens of its own anymore. */
  selectedLoc: string;
}

export function ModifierMatrix({
  present,
  groupsByLoc,
  setGroupsByLoc,
  selectedLoc,
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
      <div className="v2-mod-empty">
        Add the product to at least one location to edit modifiers.
      </div>
    );
  }

  return (
    <div className="v2-mod-editor">
      <div className="v2-mod-editor-toolbar">
        <span className="v2-mod-lens-static">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Pricing for <strong>{activeCity}</strong>
        </span>
        <button type="button" className="v2-mod-add-group" onClick={addGroup}>
          + Add group
        </button>
      </div>

      {canonical.length === 0 ? (
        <div className="v2-mod-empty">
          No modifier groups yet. Customers see the standard price only.
        </div>
      ) : (
        canonical.map((group) => (
          <div key={group.id} className="v2-mod-group">
            <div className="v2-mod-group-head">
              <input
                className="v2-mod-group-title"
                value={group.label}
                onChange={(e) => setGroupField(group.id, { label: e.target.value })}
                aria-label="Group label"
              />
              <div className="v2-mod-group-meta">
                <label>
                  Min
                  <input
                    type="number"
                    className="v2-mod-num"
                    min={0}
                    max={10}
                    value={String(group.minSelections ?? 0)}
                    onChange={(e) =>
                      setGroupField(group.id, {
                        minSelections: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    aria-label={`${group.label} minimum selections`}
                  />
                </label>
                <label>
                  Max
                  <input
                    type="number"
                    className="v2-mod-num"
                    min={1}
                    max={10}
                    value={String(group.maxSelections ?? 1)}
                    onChange={(e) =>
                      setGroupField(group.id, {
                        maxSelections: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    aria-label={`${group.label} maximum selections`}
                  />
                </label>
              </div>
              <button
                type="button"
                className="v2-mod-icon-btn"
                onClick={() => removeGroup(group.id)}
                aria-label={`Remove group ${group.label}`}
                title="Remove group (chain-wide)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="v2-mod-rows">
              {group.options.map((option) => {
                const opt = readOption(activeSlug, group.id, option.id);
                const priceDelta = opt?.priceDelta ?? 0;
                const costDelta = opt?.costDelta;
                const variance = priceVariance(group.id, option.id);
                return (
                  <div key={option.id} className="v2-mod-row">
                    <input
                      className="v2-mod-row-label-input"
                      value={option.label}
                      onChange={(e) =>
                        setOptionStructure(group.id, option.id, {
                          label: e.target.value,
                        })
                      }
                      aria-label="Option label"
                    />
                    <input
                      type="checkbox"
                      className="v2-mod-kds"
                      checked={!!option.flagOnKds}
                      onChange={(e) =>
                        setOptionStructure(group.id, option.id, {
                          flagOnKds: e.target.checked || undefined,
                        })
                      }
                      aria-label={`KDS highlight for ${option.label}`}
                      title="Highlight on the KDS ticket"
                    />
                    <div className="v2-mod-money">
                      <input
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
                        aria-label={`${option.label} price at ${activeCity}`}
                      />
                      <span className="v2-mod-money-suffix">zł</span>
                    </div>
                    <div className="v2-mod-money">
                      <input
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
                        placeholder="—"
                        aria-label={`${option.label} cost at ${activeCity}`}
                      />
                      <span className="v2-mod-money-suffix">zł</span>
                    </div>
                    <span className="v2-mod-across">
                      {variance ? (
                        <>
                          <span
                            className="v2-mod-across-spread"
                            title="Price spread across every truck"
                          >
                            {formatPrice(variance.min)}–{formatPrice(variance.max)}
                          </span>
                          <button
                            type="button"
                            className="v2-mod-across-fan"
                            onClick={() => applyPriceDeltaToAll(group.id, option.id)}
                            title={`Apply ${activeCity}'s price to every location`}
                          >
                            → all
                          </button>
                        </>
                      ) : present.length > 1 ? (
                        <>
                          <span className="v2-mod-across-uniform">uniform</span>
                          <span aria-hidden />
                        </>
                      ) : (
                        <>
                          <span aria-hidden />
                          <span aria-hidden />
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      className="v2-mod-icon-btn v2-mod-row-remove"
                      onClick={() => removeOption(group.id, option.id)}
                      aria-label={`Remove ${option.label}`}
                      title="Remove option (chain-wide)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="v2-mod-foot">
              <button type="button" onClick={() => addOption(group.id)}>
                + Add option
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
