"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Map as MapIcon } from "lucide-react";
import type { ExpansionChecklist } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import {
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  Section,
  type MobileListItem,
} from "../v2/mobile";

interface CardData {
  slug: string;
  city: string;
  isActive: boolean;
  checklist: ExpansionChecklist | null;
}

/**
 * Mobile expansion — checklist readout per planned/active location.
 * Tap to expand and tick items; full editing (notes, dependencies) is
 * desktop-only.
 */
export function MobileExpansion() {
  const [list, setList] = useState<ExpansionChecklist[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/expansion");
    if (!r.ok) return;
    const data = await r.json();
    setList(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const cards: CardData[] = useMemo(() => {
    const map = new Map(list.map((c) => [c.locationSlug, c]));
    const active = getActiveLocations();
    const activeSlugs = new Set(active.map((l) => l.slug));
    const out: CardData[] = active.map((l) => ({
      slug: l.slug,
      city: l.city,
      isActive: true,
      checklist: map.get(l.slug) ?? null,
    }));
    for (const c of list) {
      if (!activeSlugs.has(c.locationSlug)) {
        out.push({
          slug: c.locationSlug,
          city: c.city ?? c.locationSlug,
          isActive: false,
          checklist: c,
        });
      }
    }
    return out;
  }, [list]);

  const items: MobileListItem<CardData>[] = cards.map((c) => {
    const total = c.checklist?.items.length ?? 0;
    const done = c.checklist?.items.filter((i) => i.done).length ?? 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const tone: "success" | "warning" | "info" | "neutral" =
      total === 0
        ? "neutral"
        : pct >= 80
          ? "success"
          : pct >= 40
            ? "warning"
            : "info";
    return {
      id: c.slug,
      data: c,
      icon: MapIcon,
      iconTone: c.isActive ? "success" : tone,
      title: c.city,
      subtitle: total === 0 ? "No checklist yet" : `${done} of ${total} done`,
      status: total === 0 ? { label: "Pending", tone: "neutral" } : { label: `${pct}%`, tone },
      onTap: (row) =>
        setOpenSlug((prev) => (prev === row.slug ? null : row.slug)),
    };
  });

  const toggle = async (slug: string, itemId: string, currentDone: boolean) => {
    setBusyId(itemId);
    try {
      const r = await fetch(`/api/admin/expansion/${encodeURIComponent(slug)}/items/${encodeURIComponent(itemId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !currentDone }),
      });
      if (r.ok) refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage>
        <PageHeader title="Expansion" subtitle={`${cards.length} location${cards.length === 1 ? "" : "s"}`} />
        <MobileList items={items} />

        {openSlug && (() => {
          const card = cards.find((c) => c.slug === openSlug);
          if (!card?.checklist) return null;
          type Item = (typeof card.checklist.items)[number];
          const sections = new Map<string, Item[]>();
          for (const it of card.checklist.items) {
            const cur = sections.get(it.category) ?? [];
            cur.push(it);
            sections.set(it.category, cur);
          }
          const entries: [string, Item[]][] = Array.from(sections.entries());
          return (
            <Section title={`${card.city} · checklist`}>
              {entries.map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: 0.06,
                      padding: "8px 4px 4px",
                    }}
                  >
                    {cat}
                  </div>
                  <ul role="list" className="v2-m-list">
                    {items.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          className="v2-m-list-row"
                          disabled={busyId === it.id}
                          onClick={() => toggle(card.slug, it.id, it.done)}
                        >
                          {it.done ? (
                            <CheckCircle2 className="v2-m-list-icon" style={{ color: "var(--success)" }} aria-hidden />
                          ) : (
                            <Circle className="v2-m-list-icon" style={{ color: "var(--fg-disabled)" }} aria-hidden />
                          )}
                          <span className="v2-m-list-stack">
                            <span className="v2-m-list-title" style={{ textDecoration: it.done ? "line-through" : undefined, opacity: it.done ? 0.7 : 1 }}>
                              {it.label}
                            </span>
                            {it.notes && <span className="v2-m-list-sub">{it.notes}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Section>
          );
        })()}
      </MobilePage>
    </PullToRefresh>
  );
}

