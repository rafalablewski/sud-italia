"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { AdminUser, Location } from "@/data/types";
import { userCoversLocation } from "@/lib/user-locations";
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
  PageHero,
  Switch,
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
  // Managers (role === "manager") so each location row can show who runs it.
  const [managers, setManagers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    open: boolean;
    original: LocationRecord | null;
    form: FormState;
  }>({
    open: false,
    original: null,
    form: EMPTY_FORM,
  });
  const [confirmDelete, setConfirmDelete] = useState<LocationRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, usersRes] = await Promise.all([
        fetch("/api/admin/locations"),
        fetch("/api/admin/users"),
      ]);
      if (!locRes.ok) throw new Error("fetch failed");
      const data = (await locRes.json()) as { locations: LocationRecord[] };
      setList(data.locations);
      // Non-fatal: if the user list fails the table still renders, just without
      // the manager column populated.
      if (usersRes.ok) {
        const users = (await usersRes.json()) as AdminUser[];
        setManagers(
          Array.isArray(users)
            ? users.filter((u) => u.role === "manager" && u.status === "active")
            : [],
        );
      }
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
      const res = await fetch(`/api/admin/locations?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Location removed");
      void refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  const reseed = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/locations", { method: "PUT" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { seeded: number };
      toast.success(`Re-seeded ${data.seeded} location(s) from code`);
      void refresh();
    } catch {
      toast.error("Re-seed failed");
    } finally {
      setBusy(false);
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setEditing((s) => ({ ...s, form: { ...s.form, [key]: value } }));
  };

  const cols = useMemo<Column<LocationRecord>[]>(
    () => [
      {
        key: "slug",
        header: "Slug",
        cell: (l) => <code className="mono">{l.slug}</code>,
      },
      { key: "name", header: "Name", cell: (l) => l.name },
      { key: "city", header: "City", cell: (l) => l.city },
      {
        key: "manager",
        header: "Manager",
        cell: (l) => {
          // Managers whose scope covers this site (a multi-site or all-scope
          // manager shows on every location they cover).
          const mgrs = managers.filter((m) => userCoversLocation(m, l.slug));
          return mgrs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {mgrs.map((m) => (
                <Badge key={m.id} tone="info" variant="soft" title={m.email ?? m.name}>
                  {m.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="v2-muted">Unassigned</span>
          );
        },
      },
      {
        key: "active",
        header: "Status",
        cell: (l) =>
          l.isActive ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Draft</Badge>
          ),
      },
      {
        key: "coords",
        header: "Coords",
        cell: (l) =>
          `${l.coordinates.lat.toFixed(4)}, ${l.coordinates.lng.toFixed(4)}`,
        align: "right",
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (l) => (
          <div style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
            <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>
              Edit
            </Button>
            <button
              type="button"
              className="v2-mod-icon-btn"
              onClick={() => setConfirmDelete(l)}
              aria-label={`Delete ${l.name}`}
              title="Delete location"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [managers],
  );

  return (
    <div className="v2-page">
      <PageHero
        title="Locations"
        subtitle={
          <>
            Add a truck without a deploy. Active locations appear on the
            public landing page and in every admin tab. The hardcoded seed
            in <code className="mono">src/data/locations.ts</code> is the
            first-deploy fallback only.
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              onClick={reseed}
              title="Upsert the in-code seed into the DB"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Re-seed from code
            </Button>
            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add location
            </Button>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>All locations</h2>
            <span className="v2-detail-head-hint">
              {list.length} {list.length === 1 ? "row" : "rows"}
              {" · "}
              {list.filter((l) => l.isActive).length} active
            </span>
          </div>
          {loading ? (
            <div className="v2-page-loading">Loading Manage locations…</div>
          ) : list.length === 0 ? (
            <EmptyState
              title="No locations"
              description="Add the first truck or re-seed from the hardcoded list."
            />
          ) : (
            <Table flush columns={cols} rows={list} rowKey={(l) => l.slug} />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={editing.open}
        onClose={() => setEditing({ open: false, original: null, form: EMPTY_FORM })}
        title={editing.original ? `Edit ${editing.original.name}` : "New location"}
        description={
          editing.original
            ? "Slug is locked after creation — it's tied to historical orders + URLs."
            : "Active locations appear on the public landing and the admin location switcher."
        }
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() =>
                setEditing({ open: false, original: null, form: EMPTY_FORM })
              }
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editing.original ? "Save changes" : "Create location"}
            </Button>
          </>
        }
      >
        <div className="v2-detail-form">
          <div className="v2-detail-form-row" data-cols="3">
            <Input
              label="Slug"
              value={editing.form.slug}
              disabled={!!editing.original}
              onChange={(e) =>
                setField(
                  "slug",
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              placeholder="e.g. wroclaw"
              description={
                editing.original
                  ? "Locked — tied to historical orders."
                  : "3–60 chars · lowercase · digits · hyphens."
              }
            />
            <Input
              label="Name"
              value={editing.form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Sud Italia · Wrocław"
            />
            <Input
              label="City"
              value={editing.form.city}
              onChange={(e) => setField("city", e.target.value)}
              placeholder="Wrocław"
            />
          </div>

          <div className="v2-detail-form-row" data-cols="3">
            <Input
              label="Latitude"
              value={editing.form.lat}
              onChange={(e) => setField("lat", e.target.value)}
              placeholder="50.0614"
              inputMode="decimal"
            />
            <Input
              label="Longitude"
              value={editing.form.lng}
              onChange={(e) => setField("lng", e.target.value)}
              placeholder="19.9372"
              inputMode="decimal"
            />
            <Input
              label="Display order"
              value={editing.form.displayOrder}
              onChange={(e) => setField("displayOrder", e.target.value)}
              description="Lower numbers sort first."
            />
          </div>

          <Input
            label="Address"
            value={editing.form.address}
            onChange={(e) => setField("address", e.target.value)}
            placeholder="Rynek Główny, 31-042 Kraków"
          />

          <Input
            label="Hero image path"
            value={editing.form.heroImage}
            onChange={(e) => setField("heroImage", e.target.value)}
            placeholder="/images/locations/wroclaw-hero.jpg"
          />

          <Input
            label="Short description"
            value={editing.form.shortDescription}
            onChange={(e) => setField("shortDescription", e.target.value)}
            placeholder="Authentic Neapolitan pizza & pasta at Wrocław's Main Square"
          />

          <Textarea
            label="Description"
            value={editing.form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={3}
            placeholder="Long-form copy shown on the public location page."
          />

          <div className="v2-field">
            <div className="v2-detail-head" style={{ marginBottom: 8 }}>
              <h2>Hours</h2>
              <button
                type="button"
                className="v2-mod-add-group"
                onClick={() =>
                  setEditing((s) => ({
                    ...s,
                    form: {
                      ...s.form,
                      hours: [
                        ...s.form.hours,
                        { day: "", open: "11:00", close: "21:00" },
                      ],
                    },
                  }))
                }
              >
                + Add row
              </button>
            </div>
            <div className="v2-loc-hours">
              {editing.form.hours.map((h, i) => (
                <div key={i} className="v2-loc-hours-row">
                  <Input
                    value={h.day}
                    onChange={(e) =>
                      setEditing((s) => {
                        const next = [...s.form.hours];
                        next[i] = { ...next[i], day: e.target.value };
                        return { ...s, form: { ...s.form, hours: next } };
                      })
                    }
                    placeholder="Mon-Thu"
                    aria-label={`Hours row ${i + 1} day`}
                  />
                  <Input
                    type="time"
                    value={h.open}
                    onChange={(e) =>
                      setEditing((s) => {
                        const next = [...s.form.hours];
                        next[i] = { ...next[i], open: e.target.value };
                        return { ...s, form: { ...s.form, hours: next } };
                      })
                    }
                    aria-label={`Hours row ${i + 1} open`}
                  />
                  <Input
                    type="time"
                    value={h.close}
                    onChange={(e) =>
                      setEditing((s) => {
                        const next = [...s.form.hours];
                        next[i] = { ...next[i], close: e.target.value };
                        return { ...s, form: { ...s.form, hours: next } };
                      })
                    }
                    aria-label={`Hours row ${i + 1} close`}
                  />
                  <button
                    type="button"
                    className="v2-mod-icon-btn"
                    onClick={() =>
                      setEditing((s) => ({
                        ...s,
                        form: {
                          ...s.form,
                          hours: s.form.hours.filter((_, idx) => idx !== i),
                        },
                      }))
                    }
                    title="Remove this row"
                    aria-label={`Remove hours row ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="v2-detail-form-row" data-cols="2">
            <div className="v2-field">
              <label className="v2-field-label">Visibility</label>
              <label className="v2-detail-toggle">
                <Switch
                  checked={editing.form.isActive}
                  onChange={(v) => setField("isActive", v)}
                  label="Active — show on public site"
                />
                <span>Active — show on public site</span>
              </label>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Licensing</label>
              <label className="v2-detail-toggle">
                <Switch
                  checked={editing.form.servesAlcohol}
                  onChange={(v) => setField("servesAlcohol", v)}
                  label="Serves alcohol"
                />
                <span>Serves alcohol</span>
              </label>
            </div>
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
