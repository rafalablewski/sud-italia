"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  Hammer,
  MapPin,
  Megaphone,
  Plus,
  Scale,
  Truck,
  UserCheck,
} from "lucide-react";
import type { ExpansionChecklist, ExpansionChecklistItem } from "@/data/types";
import { locations as allLocations } from "@/data/locations";
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
  PageHero,
  Select,
  Tabs,
  Textarea,
} from "./v2/ui";

type Category = ExpansionChecklistItem["category"];

const CATEGORY_LABEL: Record<Category, string> = {
  legal: "Legal",
  site: "Site",
  supply: "Supply",
  people: "People",
  ops: "Ops",
  marketing: "Marketing",
};

const CATEGORY_ICON: Record<Category, typeof MapPin> = {
  legal: Scale,
  site: Hammer,
  supply: Truck,
  people: UserCheck,
  ops: FileText,
  marketing: Megaphone,
};

const DEFAULT_ITEMS: Omit<ExpansionChecklistItem, "id" | "done">[] = [
  { label: "Register local business entity", category: "legal" },
  { label: "Obtain food handling permits", category: "legal" },
  { label: "Secure liability + property insurance", category: "legal" },
  { label: "Sign commercial lease / parking permit", category: "site" },
  { label: "Install kitchen equipment + utilities", category: "site" },
  { label: "Confirm Wi-Fi and POS connectivity", category: "site" },
  { label: "Onboard local ingredient suppliers", category: "supply" },
  { label: "Stocktake opening inventory", category: "supply" },
  { label: "Hire manager + kitchen crew", category: "people" },
  { label: "Run staff training (Neapolitan standards)", category: "people" },
  { label: "Configure menu + per-location overrides", category: "ops" },
  { label: "Configure time slots + capacity", category: "ops" },
  { label: "Localize loyalty + promotions", category: "ops" },
  { label: "Soft launch with invite list", category: "marketing" },
  { label: "Press + influencer outreach", category: "marketing" },
];

function defaultItemsWithIds(): ExpansionChecklistItem[] {
  return DEFAULT_ITEMS.map((d, i) => ({
    id: `default-${i}-${d.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
    label: d.label,
    category: d.category,
    done: false,
  }));
}

interface LocationCardData {
  slug: string;
  city: string;
  isActive: boolean;
  checklist: ExpansionChecklist | null;
}

export function AdminExpansion() {
  return <AdminExpansionDesktop />;
}

function AdminExpansionDesktop() {
  const toast = useToast();
  const [list, setList] = useState<ExpansionChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/expansion");
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const rows: LocationCardData[] = useMemo(() => {
    const checklistMap = new Map(list.map((c) => [c.locationSlug, c]));
    const knownSlugs = new Set(allLocations.map((l) => l.slug));
    const out: LocationCardData[] = allLocations.map((l) => ({
      slug: l.slug,
      city: l.city,
      isActive: l.isActive,
      checklist: checklistMap.get(l.slug) ?? null,
    }));
    // Add any custom (planned-only) slugs the team has saved checklists for
    for (const c of list) {
      if (!knownSlugs.has(c.locationSlug)) {
        out.push({
          slug: c.locationSlug,
          city: c.city ?? c.locationSlug,
          isActive: false,
          checklist: c,
        });
      }
    }
    return out.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.city.localeCompare(b.city));
  }, [list]);

  const selectedRow = rows.find((r) => r.slug === selected) ?? null;

  const persist = async (updated: ExpansionChecklist) => {
    const res = await fetch("/api/admin/expansion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const saved: ExpansionChecklist = await res.json();
      setList((arr) => {
        const next = arr.filter((c) => c.locationSlug !== saved.locationSlug);
        next.push(saved);
        return next;
      });
      toast.success("Saved");
    } else {
      toast.error("Could not save");
    }
  };

  const ensureChecklist = (row: LocationCardData): ExpansionChecklist => {
    if (row.checklist) return row.checklist;
    return {
      locationSlug: row.slug,
      city: row.city,
      items: defaultItemsWithIds(),
      updatedAt: new Date().toISOString(),
    };
  };

  const toggleItem = async (row: LocationCardData, itemId: string) => {
    const current = ensureChecklist(row);
    const items = current.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i));
    await persist({ ...current, items });
  };

  const addCustomItem = async (row: LocationCardData, label: string, category: Category) => {
    if (!label.trim()) return;
    const current = ensureChecklist(row);
    const items: ExpansionChecklistItem[] = [
      ...current.items,
      {
        id: `it-${Date.now().toString(36)}`,
        label: label.trim(),
        category,
        done: false,
      },
    ];
    await persist({ ...current, items });
  };

  const updateNotes = async (row: LocationCardData, notes: string) => {
    const current = ensureChecklist(row);
    await persist({ ...current, notes });
  };

  const addPlannedLocation = async (slug: string, city: string) => {
    if (!slug.trim() || !city.trim()) return;
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (rows.some((r) => r.slug === cleanSlug)) {
      toast.warning("Location already exists");
      return;
    }
    await persist({
      locationSlug: cleanSlug,
      city: city.trim(),
      items: defaultItemsWithIds(),
      updatedAt: new Date().toISOString(),
    });
    setAddOpen(false);
    setSelected(cleanSlug);
  };

  if (loading) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Expansion</h1>
          </div>
        </header>
        <div className="v2-page-loading">Loading Expansion…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <PageHero
        title="Expansion"
        subtitle="Per-location readiness checklist + notes. Active locations track gaps; planned locations let you start prepping months ahead."
        actions={
          <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
            Plan new location
          </Button>
        }
      />

      <div className="v2-grid-2-1">
        <div className="v2-rewards-grid">
          {rows.map((r) => {
            const cl = r.checklist;
            const total = cl?.items.length ?? DEFAULT_ITEMS.length;
            const done = cl?.items.filter((i) => i.done).length ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <button
                type="button"
                key={r.slug}
                className={`v2-exp-card ${selected === r.slug ? "is-active" : ""}`}
                onClick={() => setSelected(r.slug)}
              >
                <div className="v2-exp-card-head">
                  <MapPin className="h-4 w-4 v2-muted" />
                  <span>{r.city}</span>
                  <Badge tone={r.isActive ? "success" : "warning"} variant="soft" dot>
                    {r.isActive ? "Live" : "Planned"}
                  </Badge>
                </div>
                <div className="v2-exp-card-meter" aria-hidden>
                  <div className={`v2-slot-meter-bar v2-slot-meter-${pct >= 90 ? "success" : pct >= 50 ? "info" : "warning"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="v2-exp-card-foot">
                  <span className="tabular">{done}/{total}</span>
                  <span className="v2-muted">readiness</span>
                </div>
              </button>
            );
          })}
        </div>

        <div>
          {selectedRow ? (
            <ChecklistEditor
              row={selectedRow}
              onToggle={(id) => toggleItem(selectedRow, id)}
              onAddItem={(label, category) => addCustomItem(selectedRow, label, category)}
              onUpdateNotes={(notes) => updateNotes(selectedRow, notes)}
            />
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={MapPin}
                  title="Pick a location"
                  description="Select a location card to view or edit its readiness checklist."
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <AddLocationDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={addPlannedLocation} />
    </div>
  );
}

interface ChecklistEditorProps {
  row: LocationCardData;
  onToggle: (itemId: string) => Promise<void> | void;
  onAddItem: (label: string, category: Category) => Promise<void> | void;
  onUpdateNotes: (notes: string) => Promise<void> | void;
}

function ChecklistEditor({ row, onToggle, onAddItem, onUpdateNotes }: ChecklistEditorProps) {
  const checklist = row.checklist;
  const items = checklist?.items ?? defaultItemsWithIds();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftCategory, setDraftCategory] = useState<Category>("ops");
  const [draftNotes, setDraftNotes] = useState(checklist?.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    setDraftNotes(checklist?.notes ?? "");
    setNotesDirty(false);
  }, [checklist?.locationSlug, checklist?.notes]);

  const grouped = useMemo(() => {
    const map = new Map<Category, ExpansionChecklistItem[]>();
    for (const cat of Object.keys(CATEGORY_LABEL) as Category[]) map.set(cat, []);
    for (const i of items) {
      if (filter !== "all" && i.category !== filter) continue;
      map.get(i.category)?.push(i);
    }
    return map;
  }, [items, filter]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleAdd = async () => {
    if (!draftLabel.trim()) return;
    await onAddItem(draftLabel, draftCategory);
    setDraftLabel("");
  };

  return (
    <Card>
      <CardHeader
        title={row.city}
        description={`${done}/${total} done · ${pct}% ready`}
        actions={<Badge tone={pct >= 90 ? "success" : pct >= 50 ? "info" : "warning"} variant="soft" dot>{pct}%</Badge>}
      />
      <CardBody>
        <Tabs
          value={filter}
          onChange={(v) => setFilter(v as Category | "all")}
          tabs={[
            { value: "all", label: "All", count: total },
            ...(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({
              value: c,
              label: CATEGORY_LABEL[c],
              count: items.filter((i) => i.category === c).length,
            })),
          ]}
          variant="pill"
          ariaLabel="Category filter"
        />

        <div className="v2-stack-12">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            const Icon = CATEGORY_ICON[cat];
            return (
              <div key={cat}>
                <div className="v2-exp-section-h">
                  <Icon className="h-3.5 w-3.5 v2-muted" /> {CATEGORY_LABEL[cat]}
                </div>
                <ul className="v2-exp-items">
                  {list.map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => onToggle(it.id)} className="v2-exp-item">
                        {it.done ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} /> : <Circle className="h-4 w-4 v2-muted" />}
                        <span style={{ textDecoration: it.done ? "line-through" : undefined, color: it.done ? "var(--fg-subtle)" : undefined }}>
                          {it.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="v2-rcp-add">
            <Input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Custom checklist item…"
              aria-label="Custom item"
            />
            <Select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value as Category)}
              options={(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
              aria-label="Category"
            />
            <Button leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={handleAdd} disabled={!draftLabel.trim()}>
              Add
            </Button>
          </div>

          <Textarea
            label="Notes"
            rows={3}
            value={draftNotes}
            onChange={(e) => {
              setDraftNotes(e.target.value);
              setNotesDirty(true);
            }}
            onBlur={async () => {
              if (notesDirty) {
                await onUpdateNotes(draftNotes);
                setNotesDirty(false);
              }
            }}
            placeholder="Lease ref number, supplier contacts, blocker notes…"
          />
        </div>
      </CardBody>
    </Card>
  );
}

function AddLocationDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (slug: string, city: string) => Promise<void> | void }) {
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlug("");
    setCity("");
    setBusy(false);
  }, [open]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!slug.trim() || !city.trim()) return;
    setBusy(true);
    await onSubmit(slug, city);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Plan a new location"
      description="Starts the checklist for a location that isn't live yet."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Create plan</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Wrocław" />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g. wroclaw"
          description="Used as a key. Lowercase, no spaces."
        />
      </div>
    </Dialog>
  );
}
