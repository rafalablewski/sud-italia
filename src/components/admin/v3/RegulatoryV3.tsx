"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Globe, MapPin, ShieldCheck } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { Badge, Card, CardBody, CardHead, Kpi, Switch } from "./ui";

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
  const all = useMemo(() => getActiveLocations(), []);
  const [cfg, setCfg] = useState<Config>({ defaultZone: "EU", byLocation: {} });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/regulatory-compliance").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res) setCfg({ defaultZone: res.defaultZone ?? "EU", byLocation: res.byLocation ?? {} });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const locFor = (slug: string): LocCompliance => cfg.byLocation[slug] ?? { zone: cfg.defaultZone };
  // Every toggle / select persists immediately (rule #7).
  const persist = (next: Config) => fetch("/api/admin/regulatory-compliance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
  const setLoc = (slug: string, patch: Partial<LocCompliance>) => {
    const next: Config = { ...cfg, byLocation: { ...cfg.byLocation, [slug]: { ...locFor(slug), ...patch } } };
    setCfg(next); persist(next);
  };
  const setDefaultZone = (z: Zone) => { const next = { ...cfg, defaultZone: z }; setCfg(next); persist(next); };

  const stats = useMemo(() => {
    const zones = new Set<Zone>([cfg.defaultZone]);
    let disclosures = 0;
    for (const l of all) {
      const lc = locFor(l.slug);
      zones.add(lc.zone);
      disclosures += (lc.calorieDisclosureRequired ? 1 : 0) + (lc.nutriGradeRequired ? 1 : 0) + (lc.gstRegistered ? 1 : 0);
    }
    return { sites: all.length, zones: zones.size, disclosures };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, all]);

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading regulatory disclosures…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Regulatory disclosures</h1>
          <div className="av3-pagehead-sub">Tag each site with its regulatory pack (EU / NYC / SG) · changes save instantly</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Sites" icon={MapPin} value={`${stats.sites}`} accentVar="--av3-c3" />
        <Kpi label="Default pack" icon={ShieldCheck} value={cfg.defaultZone} accentVar="--av3-c2" />
        <Kpi label="Zones in use" icon={Globe} value={`${stats.zones}`} accentVar="--av3-c4" />
        <Kpi label="Disclosures active" icon={CheckSquare} value={`${stats.disclosures}`} accentVar="--av3-c5" />
      </div>

      <Card>
        <CardHead title="Default pack" description="Applied to any site without an override" actions={<Badge tone="brand"><ShieldCheck style={{ width: 11, height: 11 }} /> {cfg.defaultZone}</Badge>} />
        <CardBody>
          <label className="av3-field" style={{ maxWidth: 480 }}><span className="av3-field-label">Default zone</span>
            <select className="av3-select" value={cfg.defaultZone} onChange={(e) => setDefaultZone(e.target.value as Zone)}>{ZONES.map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}</select>
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
                <Switch checked={!!lc.calorieDisclosureRequired} label="Calorie disclosure" onChange={() => setLoc(l.slug, { calorieDisclosureRequired: !lc.calorieDisclosureRequired })} />
                <Switch checked={!!lc.nutriGradeRequired} label="Nutri-Grade" onChange={() => setLoc(l.slug, { nutriGradeRequired: !lc.nutriGradeRequired })} />
                <Switch checked={!!lc.gstRegistered} label="GST registered" onChange={() => setLoc(l.slug, { gstRegistered: !lc.gstRegistered })} />
              </div>
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
