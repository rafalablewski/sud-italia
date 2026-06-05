"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import type { Location } from "@/data/types";
import { Badge, Button, Dialog, Kpi, Table, type ColumnV3 } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ManageLocationsV3() {
  const [list, setList] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [reseeding, setReseeding] = useState(false);
  const [edit, setEdit] = useState<Location | "new" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/locations").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setList(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const reseed = async () => { setReseeding(true); try { const r = await fetch("/api/admin/locations", { method: "PUT" }); if (r.ok) await load(); } finally { setReseeding(false); } };
  const remove = async (slug: string) => { const r = await fetch(`/api/admin/locations?slug=${encodeURIComponent(slug)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const cols: ColumnV3<Location>[] = [
    { key: "city", header: "City", render: (l) => <span style={{ fontWeight: 600 }}>{l.city}</span> },
    { key: "slug", header: "Slug", render: (l) => <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)" }}>{l.slug}</span> },
    { key: "addr", header: "Address", render: (l) => <span className="av3-cell-muted">{l.address}</span> },
    { key: "st", header: "Status", render: (l) => <Badge tone={l.isActive ? "ok" : "info"} dot>{l.isActive ? "Active" : "Planned"}</Badge> },
    { key: "del", header: "", render: (l) => <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={(e) => { e.stopPropagation(); remove(l.slug); }}><X /></button> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Manage locations</h1>
          <div className="av3-pagehead-sub">Sites · hours · coordinates · status</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" loading={reseeding} onClick={reseed}>Re-seed from code</Button>
          <Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add location</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Locations" icon={MapPin} value={`${list.length}`} accentVar="--av3-c3" />
        <Kpi label="Active" icon={MapPin} value={`${list.filter((l) => l.isActive).length}`} accentVar="--av3-c4" />
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading locations…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {list.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No locations</div><div className="av3-empty-text">Add a site or re-seed from code.</div></div>
          ) : (
            <Table columns={cols} rows={list} rowKey={(l) => l.slug} onRowClick={(l) => setEdit(l)} />
          )}
        </div>
      )}

      {edit && <LocationDialog location={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={async () => { await load(); setEdit(null); }} />}
    </>
  );
}

function LocationDialog({ location, onClose, onSaved }: { location: Location | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(location?.name ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [slug, setSlug] = useState(location?.slug ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [lat, setLat] = useState(String(location?.coordinates.lat ?? ""));
  const [lng, setLng] = useState(String(location?.coordinates.lng ?? ""));
  const [isActive, setIsActive] = useState(location?.isActive ?? false);
  const [servesAlcohol, setServesAlcohol] = useState(location?.servesAlcohol ?? false);
  const [hours, setHours] = useState<{ day: string; open: string; close: string }[]>(location?.hours?.length ? location.hours : [{ day: "Mon-Sun", open: "11:00", close: "21:00" }]);
  const [saving, setSaving] = useState(false);

  const setHour = (i: number, patch: Partial<{ day: string; open: string; close: string }>) => setHours((a) => a.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const save = async () => {
    const s = (slug || city).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!city.trim() || !s) return;
    setSaving(true);
    try {
      // Round-trip the full record so description / heroImage / currency etc.
      // are preserved when editing (the POST upserts by slug).
      const payload = {
        ...(location ?? {}),
        slug: s,
        name: name.trim() || city.trim(),
        city: city.trim(),
        address: address.trim(),
        lat: Number(lat) || 0,
        lng: Number(lng) || 0,
        coordinates: { lat: Number(lat) || 0, lng: Number(lng) || 0 },
        hours,
        isActive,
        servesAlcohol,
        currency: "PLN",
      };
      const res = await fetch("/api/admin/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={location ? location.city : "New location"} width={560}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!city.trim()} onClick={save}>Save</Button></>}>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">City</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Slug</span><input className="av3-input" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!location} placeholder="auto" /></label>
      </div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Address</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Lat</span><input className="av3-input" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Lng</span><input className="av3-input" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Active</span><button type="button" className="av3-toggle" data-on={isActive} onClick={() => setIsActive((v) => !v)} style={{ height: 32 }}>{isActive ? "Yes" : "No"}</button></label>
        <label className="av3-field"><span className="av3-field-label">Alcohol</span><button type="button" className="av3-toggle" data-on={servesAlcohol} onClick={() => setServesAlcohol((v) => !v)} style={{ height: 32 }}>{servesAlcohol ? "Yes" : "No"}</button></label>
      </div>
      <div className="av3-subhead">Opening hours</div>
      {hours.map((h, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 30px", gap: 8, alignItems: "center", padding: "5px 0" }}>
          <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={h.day} onChange={(e) => setHour(i, { day: e.target.value })} placeholder="Mon-Fri" />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={h.open} onChange={(e) => setHour(i, { open: e.target.value })} />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={h.close} onChange={(e) => setHour(i, { close: e.target.value })} />
          <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => setHours((a) => a.filter((_, idx) => idx !== i))}><X /></button>
        </div>
      ))}
      <div style={{ marginTop: 8 }}><Button variant="secondary" size="sm" onClick={() => setHours((a) => [...a, { day: DAYS[0], open: "11:00", close: "21:00" }])}><Plus className="av3-btn-ico" /> Add hours row</Button></div>
    </Dialog>
  );
}
