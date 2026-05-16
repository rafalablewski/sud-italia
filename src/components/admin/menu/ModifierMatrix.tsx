"use client";

// Side-by-side grid for editing modifier options across every present
// location. Group structure (label, min/max, option labels, KDS flag) is
// shared — edits propagate to every variant's ModifierGroup[]. Per-option
// priceDelta + costDelta are independent per location, so Szczecin can
// charge +5 zł for Sourdough while Lublin charges +3 zł without forking
// the option ids that customers + KDS rely on.
//
// Scales horizontally: location columns sit inside an overflow-x scroller
// so the option labels + KDS column stay pinned while operators sweep
// across 20 trucks. Each pricing cell has an inline "→ all" button to
// spread one value across every location when prices have diverged.

import type { ModifierGroup, ModifierOption } from "@/data/types";
import { Button, Input } from "../v2/ui";

export interface ModifierMatrixLocation {
  slug: string;
  city: string;
}

interface ModifierMatrixProps {
  present: ModifierMatrixLocation[];
  groupsByLoc: Record<string, ModifierGroup[]>;
  setGroupsByLoc: (
    next:
      | Record<string, ModifierGroup[]>
      | ((prev: Record<string, ModifierGroup[]>) => Record<string, ModifierGroup[]>),
  ) => void;
}

export function ModifierMatrix({
  present,
  groupsByLoc,
  setGroupsByLoc,
}: ModifierMatrixProps) {
  // Canonical structure = first present variant's groups. Other variants
  // can have drifted historic data; the matrix lifts the canonical names /
  // KDS flags / option ids so the operator sees one consistent structure,
  // and per-location priceDelta is read independently from each variant.
  const canonical = present[0] ? groupsByLoc[present[0].slug] ?? [] : [];

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

  const applyPriceDeltaToAll = (gid: string, oid: string, sourceSlug: string) => {
    const source = groupsByLoc[sourceSlug]
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
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
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

          {/* Pricing matrix — one row per option, one column per location */}
          <div style={{ overflowX: "auto" }}>
            <table className="v2-mod-matrix">
              <thead>
                <tr>
                  <th style={{ minWidth: 160, textAlign: "left" }}>Option</th>
                  <th style={{ width: 48 }} title="Highlight on KDS ticket">
                    KDS
                  </th>
                  {present.map((v) => (
                    <th key={v.slug} style={{ minWidth: 110 }}>
                      {v.city}
                    </th>
                  ))}
                  <th style={{ width: 96 }} aria-label="Bulk actions" />
                </tr>
              </thead>
              <tbody>
                {group.options.map((option) => {
                  const prices = present.map(
                    (v) => readOption(v.slug, group.id, option.id)?.priceDelta ?? 0,
                  );
                  const varies = new Set(prices).size > 1;
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
                      {present.map((v) => {
                        const opt = readOption(v.slug, group.id, option.id);
                        const priceDelta = opt?.priceDelta ?? 0;
                        const costDelta = opt?.costDelta;
                        return (
                          <td key={v.slug}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={(priceDelta / 100).toFixed(2)}
                                onChange={(e) =>
                                  setOptionPriceDelta(
                                    v.slug,
                                    group.id,
                                    option.id,
                                    Math.max(
                                      0,
                                      Math.round(
                                        parseFloat(e.target.value || "0") * 100,
                                      ),
                                    ),
                                  )
                                }
                                trailingAdornment={<span className="v2-muted">zł</span>}
                                aria-label={`${option.label} price at ${v.city}`}
                              />
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
                                    v.slug,
                                    group.id,
                                    option.id,
                                    raw === ""
                                      ? undefined
                                      : Math.max(
                                          0,
                                          Math.round(parseFloat(raw) * 100),
                                        ),
                                  );
                                }}
                                placeholder="cost δ"
                                trailingAdornment={<span className="v2-muted">zł</span>}
                                aria-label={`${option.label} cost at ${v.city}`}
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            alignItems: "stretch",
                          }}
                        >
                          {varies && present.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                applyPriceDeltaToAll(
                                  group.id,
                                  option.id,
                                  present[0].slug,
                                )
                              }
                              title="Copy the first location's price to every location"
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
          </div>

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
