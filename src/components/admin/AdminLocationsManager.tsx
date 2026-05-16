"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Location } from "@/data/types";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";

interface LocationRecord extends Location {
  displayOrder?: number;
}

interface FormState {
  slug: string;
  name: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  heroImage: string;
  shortDescription: string;
  description: string;
  hours: { day: string; open: string; close: string }[];
  isActive: boolean;
  servesAlcohol: boolean;
  displayOrder: string;
}

const EMPTY_FORM: FormState = {
  slug: "",
  name: "",
  city: "",
  address: "",
  lat: "",
  lng: "",
  heroImage: "",
  shortDescription: "",
  description: "",
  hours: [
    { day: "Mon-Thu", open: "11:00", close: "21:00" },
    { day: "Fri-Sat", open: "11:00", close: "22:00" },
    { day: "Sun", open: "12:00", close: "20:00" },
  ],
  isActive: false,
  servesAlcohol: false,
  displayOrder: "0",
};

function locToForm(loc: LocationRecord): FormState {
  return {
    slug: loc.slug,
    name: loc.name,
    city: loc.city,
    address: loc.address,
    lat: String(loc.coordinates.lat),
    lng: String(loc.coordinates.lng),
    heroImage: loc.heroImage || "",
    shortDescription: loc.shortDescription || "",
    description: loc.description || "",
    hours: loc.hours?.length ? loc.hours : EMPTY_FORM.hours,
    isActive: loc.isActive,
    servesAlcohol: !!loc.servesAlcohol,
    displayOrder: String(loc.displayOrder ?? 0),
  };
}

function formToPayload(form: FormState) {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    city: form.city.trim(),
    address: form.address.trim(),
    coordinates: { lat: parseFloat(form.lat), lng: parseFloat(form.lng) },
    heroImage: form.heroImage.trim(),
    shortDescription: form.shortDescription.trim(),
    description: form.description.trim(),
    hours: form.hours.filter((h) => h.day && h.open && h.close),
    isActive: form.isActive,
    servesAlcohol: form.servesAlcohol,
    currency: "PLN" as const,
    displayOrder: parseInt(form.displayOrder, 10) || 0,
  };
}

export function AdminLocationsManager() {
  const toast = useToast();
  const [list, setList] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ open: boolean; original: LocationRecord | null; form: FormState }>({
    open: false,
    original: null,
    form: EMPTY_FORM,
  });
  const [confirmDelete, setConfirmDelete] = useState<LocationRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/locations");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { locations: LocationRecord[] };
      setList(data.locations);
    } catch {
      toast.error("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing({ open: true, original: null, form: EMPTY_FORM });
  };
  const openEdit = (loc: LocationRecord) => {
    setEditing({ open: true, original: loc, form: locToForm(loc) });
  };

  const save = async () => {
    const payload = formToPayload(editing.form);
    if (!payload.slug || !payload.name || !payload.city) {
      toast.error("Slug, name and city are required");
      return;
    }
    if (!Number.isFinite(payload.coordinates.lat) || !Number.isFinite(payload.coordinates.lng)) {
      toast.error("Coordinates must be numeric");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "save failed");
      }
      toast.success(editing.original ? "Location updated" : "Location created");
      setEditing({ open: false, original: null, form: EMPTY_FORM });
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (slug: string) => {
    try {
      const res = await fetch(`/api/admin/locations?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Location removed");
      void refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  const reseed = async () => {
    try {
      const res = await fetch("/api/admin/locations", { method: "PUT" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { seeded: number };
      toast.success(`Re-seeded ${data.seeded} location(s) from code`);
      void refresh();
    } catch {
      toast.error("Re-seed failed");
    }
  };

  const cols = useMemo<Column<LocationRecord>[]>(
    () => [
      {
        key: "slug",
        header: "Slug",
        cell: (l) => <code className="text-sm font-mono">{l.slug}</code>,
      },
      { key: "name", header: "Name", cell: (l) => l.name },
      { key: "city", header: "City", cell: (l) => l.city },
      {
        key: "active",
        header: "Status",
        cell: (l) =>
          l.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Draft</Badge>,
      },
      {
        key: "coords",
        header: "Coords",
        cell: (l) => `${l.coordinates.lat.toFixed(4)}, ${l.coordinates.lng.toFixed(4)}`,
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (l) => (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(l)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MapPin size={22} /> Locations
          </h1>
          <p className="text-sm opacity-70 mt-1">
            Add a new truck without a deploy. Active locations show up on the public landing page and
            in every dashboard tab. The hardcoded seed in <code>src/data/locations.ts</code> is the
            first-deploy fallback only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reseed} title="Upsert the in-code seed into the DB">
            <RefreshCw size={14} /> Re-seed from code
          </Button>
          <Button onClick={openCreate}>
            <Plus size={14} /> Add location
          </Button>
        </div>
      </div>

      <Card>
        <CardBody>
          {loading ? (
            <div className="py-10 text-center opacity-60">Loading…</div>
          ) : list.length === 0 ? (
            <EmptyState
              title="No locations"
              description="Add the first truck or re-seed from the hardcoded list."
            />
          ) : (
            <Table columns={cols} rows={list} rowKey={(l) => l.slug} />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={editing.open}
        onClose={() => setEditing({ open: false, original: null, form: EMPTY_FORM })}
        title={editing.original ? `Edit ${editing.original.name}` : "New location"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Slug"
              value={editing.form.slug}
              disabled={!!editing.original}
              onChange={(e) =>
                setEditing((s) => ({ ...s, form: { ...s.form, slug: e.target.value.toLowerCase() } }))
              }
              placeholder="e.g. wroclaw"
            />
            <Input
              label="Display order"
              value={editing.form.displayOrder}
              onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, displayOrder: e.target.value } }))}
            />
            <Input
              label="Name"
              value={editing.form.name}
              onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))}
            />
            <Input
              label="City"
              value={editing.form.city}
              onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, city: e.target.value } }))}
            />
            <Input
              label="Latitude"
              value={editing.form.lat}
              onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, lat: e.target.value } }))}
              placeholder="50.0614"
            />
            <Input
              label="Longitude"
              value={editing.form.lng}
              onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, lng: e.target.value } }))}
              placeholder="19.9372"
            />
            <div className="col-span-2">
              <Input
                label="Address"
                value={editing.form.address}
                onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, address: e.target.value } }))}
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Hero image path"
                value={editing.form.heroImage}
                onChange={(e) =>
                  setEditing((s) => ({ ...s, form: { ...s.form, heroImage: e.target.value } }))
                }
                placeholder="/images/locations/wroclaw-hero.jpg"
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Short description"
                value={editing.form.shortDescription}
                onChange={(e) =>
                  setEditing((s) => ({ ...s, form: { ...s.form, shortDescription: e.target.value } }))
                }
              />
            </div>
            <div className="col-span-2">
              <Textarea
                label="Description"
                value={editing.form.description}
                onChange={(e) =>
                  setEditing((s) => ({ ...s, form: { ...s.form, description: e.target.value } }))
                }
                rows={4}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Hours</div>
            {editing.form.hours.map((h, i) => (
              <div key={i} className="grid grid-cols-7 gap-2 items-center">
                <Input
                  className="col-span-3"
                  value={h.day}
                  onChange={(e) =>
                    setEditing((s) => {
                      const next = [...s.form.hours];
                      next[i] = { ...next[i], day: e.target.value };
                      return { ...s, form: { ...s.form, hours: next } };
                    })
                  }
                  placeholder="Mon-Thu"
                />
                <Input
                  className="col-span-2"
                  value={h.open}
                  onChange={(e) =>
                    setEditing((s) => {
                      const next = [...s.form.hours];
                      next[i] = { ...next[i], open: e.target.value };
                      return { ...s, form: { ...s.form, hours: next } };
                    })
                  }
                />
                <Input
                  className="col-span-2"
                  value={h.close}
                  onChange={(e) =>
                    setEditing((s) => {
                      const next = [...s.form.hours];
                      next[i] = { ...next[i], close: e.target.value };
                      return { ...s, form: { ...s.form, hours: next } };
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setEditing((s) => ({
                  ...s,
                  form: {
                    ...s.form,
                    hours: [...s.form.hours, { day: "", open: "11:00", close: "21:00" }],
                  },
                }))
              }
            >
              + Add row
            </Button>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.isActive}
                onChange={(e) =>
                  setEditing((s) => ({ ...s, form: { ...s.form, isActive: e.target.checked } }))
                }
              />
              Active (visible on public site)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.servesAlcohol}
                onChange={(e) =>
                  setEditing((s) => ({ ...s, form: { ...s.form, servesAlcohol: e.target.checked } }))
                }
              />
              Serves alcohol
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setEditing({ open: false, original: null, form: EMPTY_FORM })}
            >
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name ?? ""}?`}
        description="The location row will be removed. The hardcoded seed in src/data/locations.ts is unaffected."
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await remove(confirmDelete.slug);
        }}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
