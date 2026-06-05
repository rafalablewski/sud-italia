"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Card, CardBody, CardHead, Kpi } from "./ui";
import { Layers } from "lucide-react";

interface Bundle { id: string; name: string; active?: boolean; description?: string; [k: string]: unknown }
type LocationConfig = { bundles?: Bundle[]; [k: string]: unknown };
type Settings = Record<string, LocationConfig>;

export function UpsellV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = (await fetch("/api/admin/upsell").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))) as Settings;
    setSettings(res && typeof res === "object" ? res : {});
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cfg = settings[loc] ?? {};
  const bundles = (cfg.bundles ?? []) as Bundle[];

  const toggle = async (id: string) => {
    const next = bundles.map((b) => (b.id === id ? { ...b, active: !(b.active ?? true) } : b));
    setSaving(true);
    try {
      const config = { ...cfg, bundles: next };
      const res = await fetch("/api/admin/upsell", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationSlug: loc, config }) });
      if (res.ok) setSettings((s) => ({ ...s, [loc]: config }));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading bundles…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Upsell</h1>
          <div className="av3-pagehead-sub">Bundle ladders · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Bundles" icon={Layers} value={`${bundles.length}`} accentVar="--av3-c2" />
        <Kpi label="Active" icon={Layers} value={`${bundles.filter((b) => b.active ?? true).length}`} accentVar="--av3-c4" />
      </div>

      <Card>
        <CardHead title="Bundle ladders" description="Activate or pause each ladder. Full ladder pricing is edited in the classic Upsell admin." actions={<Badge tone="neutral">{city}</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {bundles.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No bundles</div><div className="av3-empty-text">This location uses the default bundle ladders. Configure custom ones in the classic admin.</div></div>
          ) : (
            bundles.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                  {b.description && <div className="av3-cell-muted" style={{ fontSize: 11 }}>{b.description}</div>}
                </div>
                <button type="button" className="av3-toggle" data-on={b.active ?? true} disabled={saving} onClick={() => toggle(b.id)} style={{ padding: "0 12px" }}>{(b.active ?? true) ? "Live" : "Paused"}</button>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
