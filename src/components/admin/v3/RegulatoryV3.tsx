"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { Badge, Button, Card, CardBody, CardHead } from "./ui";

type Zone = "EU" | "NYC" | "SG";
const ZONES: Zone[] = ["EU", "NYC", "SG"];
const ZONE_LABEL: Record<Zone, string> = {
  EU: "EU / Poland — 1169/2011 allergens, JPK_V7M VAT",
  NYC: "New York City — §81.50 calorie + DOH grade + FRESH Act",
  SG: "Singapore — NEA Nutri-Grade + MUIS Halal + 9% GST + PDPA",
};

interface LocCompliance {
  zone: Zone;
  calorieDisclosureRequired?: boolean;
  nutriGradeRequired?: boolean;
  gstRegistered?: boolean;
  [k: string]: unknown;
}
interface Config { defaultZone: Zone; byLocation: Record<string, LocCompliance> }

export function RegulatoryV3() {
  const all = useState(() => getActiveLocations())[0];
  const [cfg, setCfg] = useState<Config>({ defaultZone: "EU", byLocation: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/regulatory-compliance").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res) setCfg({ defaultZone: res.defaultZone ?? "EU", byLocation: res.byLocation ?? {} });
    setLoading(false); setDirty(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const locFor = (slug: string): LocCompliance => cfg.byLocation[slug] ?? { zone: cfg.defaultZone };
  const setLoc = (slug: string, patch: Partial<LocCompliance>) => {
    setCfg((c) => ({ ...c, byLocation: { ...c.byLocation, [slug]: { ...locFor(slug), ...patch } } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/regulatory-compliance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      if (res.ok) await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading regulatory disclosures…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Regulatory disclosures</h1>
          <div className="av3-pagehead-sub">Tag each site with its regulatory pack (EU / NYC / SG)</div>
        </div>
        <div className="av3-pagehead-actions"><Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save</Button></div>
      </div>

      <Card>
        <CardHead title="Default pack" description="Applied to any site without an override" actions={<Badge tone="brand"><ShieldCheck style={{ width: 11, height: 11 }} /> {cfg.defaultZone}</Badge>} />
        <CardBody>
          <label className="av3-field" style={{ maxWidth: 480 }}><span className="av3-field-label">Default zone</span>
            <select className="av3-select" value={cfg.defaultZone} onChange={(e) => { setCfg((c) => ({ ...c, defaultZone: e.target.value as Zone })); setDirty(true); }}>{ZONES.map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}</select>
          </label>
        </CardBody>
      </Card>

      {all.map((l) => {
        const lc = locFor(l.slug);
        return (
          <Card key={l.slug}>
            <CardHead title={l.city} description={ZONE_LABEL[lc.zone]} actions={<Badge tone={lc.zone === "EU" ? "neutral" : lc.zone === "NYC" ? "info" : "brand"}>{lc.zone}</Badge>} />
            <CardBody>
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Pack</span><select className="av3-select" value={lc.zone} onChange={(e) => setLoc(l.slug, { zone: e.target.value as Zone })}>{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
                <button type="button" className="av3-toggle" data-on={!!lc.calorieDisclosureRequired} onClick={() => setLoc(l.slug, { calorieDisclosureRequired: !lc.calorieDisclosureRequired })} style={{ height: 32, padding: "0 12px" }}>Calorie disclosure {lc.calorieDisclosureRequired ? "✓" : "✕"}</button>
                <button type="button" className="av3-toggle" data-on={!!lc.nutriGradeRequired} onClick={() => setLoc(l.slug, { nutriGradeRequired: !lc.nutriGradeRequired })} style={{ height: 32, padding: "0 12px" }}>Nutri-Grade {lc.nutriGradeRequired ? "✓" : "✕"}</button>
                <button type="button" className="av3-toggle" data-on={!!lc.gstRegistered} onClick={() => setLoc(l.slug, { gstRegistered: !lc.gstRegistered })} style={{ height: 32, padding: "0 12px" }}>GST registered {lc.gstRegistered ? "✓" : "✕"}</button>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
