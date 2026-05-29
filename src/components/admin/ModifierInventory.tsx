"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { MenuItem, ModifierGroup } from "@/data/types";
import { getMenu } from "@/data/menus/seed";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";

type LiveMenuItem = MenuItem & { _hidden?: boolean };

/**
 * Admin /admin/upsell → Item modifiers tab.
 *
 * Live inventory of every menu item that carries a `modifierGroups` payload.
 * Each row renders the group label, selection bounds, and the option list
 * with priceDelta + KDS-flag chips.
 *
 * Per-item editing lives on /admin/menu (the item-edit dialog has the
 * canonical override surface — modifiers attach to the item, not to the
 * upsell config). This view reads from /api/admin/menu so it reflects
 * operator overrides + custom items, not the static seed.
 */
export function ModifierInventory() {
  const trucks = useMemo(() => getActiveLocations(), []);
  const [liveMenus, setLiveMenus] = useState<Record<string, MenuItem[]>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        trucks.map(async (l) => {
          try {
            const r = await fetch(`/api/admin/menu?location=${l.slug}`);
            if (!r.ok) return null;
            const items = (await r.json()) as LiveMenuItem[];
            return [l.slug, items.filter((m) => !m._hidden)] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, MenuItem[]> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setLiveMenus(next);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [trucks]);

  const groupedByTruck = useMemo(() => {
    return trucks.map((l) => {
      // Live menu when the fetch landed, seed catalogue as fallback so
      // the view still renders if /api/admin/menu is unreachable.
      const items = liveMenus[l.slug] ?? getMenu(l.slug);
      return {
        slug: l.slug,
        name: l.city,
        items: items.filter((m) => (m.modifierGroups?.length ?? 0) > 0),
      };
    });
  }, [trucks, liveMenus]);

  const totalItems = groupedByTruck.reduce(
    (s, t) => s + t.items.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-[var(--warning)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="admin-text font-semibold text-sm">
              Item modifiers — live
            </p>
            <p className="admin-text-secondary text-xs mt-1 leading-relaxed">
              Customers pick crust types, premium toppings, and spice levels
              in the item detail drawer. Selections add a priceDelta to the
              line and a costDelta to the food-cost basis used by the bundle
              margin alert. Modifiers flagged with{" "}
              <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand)] font-medium text-[10px]">
                KDS
              </span>{" "}
              surface as highlighted callouts on the kitchen ticket.
            </p>
            <p className="admin-text-secondary text-xs mt-2">
              Editing modifiers happens on{" "}
              <code className="text-[var(--warning)]">/admin/menu</code> — the
              per-item dialog carries the modifier-group editor. This view
              is the operator&apos;s read-only inventory.
            </p>
          </div>
        </div>
      </div>

      {totalItems === 0 && (
        <div className="glass-card p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-[var(--warning)] mx-auto mb-2" />
          <p className="admin-text text-sm">
            No items have modifier groups configured.
          </p>
          <p className="admin-text-secondary text-xs mt-1">
            Open <code>/admin/menu</code> and edit a pizza to add a crust
            or premium-topping group.
          </p>
        </div>
      )}

      {groupedByTruck.map((truck) => (
        <section key={truck.slug} className="space-y-3">
          <h3 className="admin-text font-semibold text-sm">
            {truck.name}
            <span className="ml-2 admin-text-secondary text-xs font-normal">
              · {truck.items.length} item{truck.items.length === 1 ? "" : "s"}
            </span>
          </h3>

          {truck.items.length === 0 && (
            <p className="admin-text-secondary text-xs italic">
              No items here yet.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {truck.items.map((item) => (
              <ItemModifierCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemModifierCard({ item }: { item: MenuItem }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="admin-text font-semibold text-sm leading-tight">
          {item.name}
        </p>
        <span className="admin-text-secondary text-xs">
          {formatPrice(item.price)} base
        </span>
      </div>
      <p className="admin-text-secondary text-xs">{item.description}</p>

      {(item.modifierGroups ?? []).map((group) => (
        <ModifierGroupView key={group.id} group={group} />
      ))}
    </div>
  );
}

function ModifierGroupView({ group }: { group: ModifierGroup }) {
  const min = group.minSelections ?? 0;
  const max = group.maxSelections ?? group.options.length;
  const isRequired = min >= 1;
  const isMulti = max > 1;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="admin-text text-xs font-semibold">{group.label}</p>
        <span className="admin-text-secondary text-[10px] uppercase tracking-wide">
          {isRequired ? "Required" : "Optional"} · {isMulti ? `pick up to ${max}` : "pick 1"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {group.options.map((opt) => (
          <li
            key={opt.id}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="admin-text">
              {opt.label}
              {opt.flagOnKds && (
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand)] font-medium text-[10px]">
                  KDS
                </span>
              )}
            </span>
            <span className="admin-text-secondary tabular-nums">
              {opt.priceDelta > 0 ? `+${formatPrice(opt.priceDelta)}` : "—"}
              {typeof opt.costDelta === "number" && opt.priceDelta > 0 && (
                <span className="ml-2 text-[10px]">
                  ({Math.round(((opt.priceDelta - opt.costDelta) / opt.priceDelta) * 100)}% GM)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
