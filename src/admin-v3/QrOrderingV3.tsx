"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hash, QrCode, Tag, ToggleRight } from "lucide-react";
import type { QrOrderingSettings } from "@/lib/store";
import { Badge, Card, CardBody, CardHead, InfoButton, Kpi, SkeletonPage, Switch } from "./ui";

interface Loc {
  slug: string;
  name: string;
  city: string;
}

export function QrOrderingV3({ locations }: { locations: Loc[] }) {
  const [s, setS] = useState<QrOrderingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/qr-ordering").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setS(d);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Persist immediately on every toggle (Rule #7).
  const persist = (next: Partial<QrOrderingSettings>) =>
    fetch("/api/admin/qr-ordering", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setS(d); })
      .catch(() => {});

  const locOn = (slug: string) => (s ? (s.locations[slug] ?? true) : true);
  const liveLocations = useMemo(
    () => (s?.enabled ? locations.filter((l) => locOn(l.slug)).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, locations],
  );

  if (loading || !s) return <SkeletonPage />;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>QR ordering</h1>
          <div className="av3-pagehead-sub">Control in-restaurant QR table ordering (/qr) · changes save instantly</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="QR ordering" icon={QrCode} value={s.enabled ? "Live" : "Off"} accentVar={s.enabled ? "--av3-c4" : "--av3-c1"} info={
          <InfoButton title="QR ordering status"
            description="Whether seated guests can scan the table QR and order from /qr."
            institutional="At-table QR ordering lifts table turns and average check (guests re-order drinks/dessert without flagging a waiter) while cutting order-taking labour — the reason QSR-casual chains push it. The institutional gate is operational readiness, not the tech: only run it where the kitchen + POS can absorb guest-paced tickets, and keep a master kill-switch for a slammed service or a printer outage. Treat it as a channel you can turn down, not a one-way door."
            plain="Turn it on for Kraków and a four-top scans the code on table 12, adds two more pizzas and a Limonata mid-meal, and pays from their phone — no waiter round-trip. If the kitchen is drowning on a Saturday, flip the master switch off and the QR page shows 'ask a member of staff' until you turn it back on."
            tips="Keep it on at your steady sites; use the per-location toggles to dark-launch one restaurant first. Require a table number so every QR order is seated correctly. Print the table codes from core-v2 POS → QR → Print table QR. Flip the master off during a kitchen meltdown rather than letting tickets pile up."
            methodology="Master `enabled` AND the per-location override (isQrOrderingEnabled) in qr-ordering-settings.json (GET/PUT /api/admin/qr-ordering). The /qr page reads this server-side per request, so a toggle gates ordering on the next scan." />
        } />
        <Kpi label="Locations live" icon={ToggleRight} value={`${liveLocations}/${locations.length}`} accentVar="--av3-c2" />
        <Kpi label="Require table" icon={Hash} value={s.requireTableNumber ? "Yes" : "No"} accentVar="--av3-c3" />
        <Kpi label="Show prices" icon={Tag} value={s.showPrices ? "Yes" : "No"} accentVar="--av3-c5" />
      </div>

      <Card>
        <CardHead title="Master switch" description="The chain-wide on/off for QR table ordering." actions={
          <Badge tone={s.enabled ? "ok" : "neutral"} dot>{s.enabled ? "live" : "off"}</Badge>
        } />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 64px", alignItems: "center", padding: "10px 0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Enable QR ordering</div>
              <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                When off, /qr shows guests an &ldquo;ask a member of staff&rdquo; message everywhere. Print table codes from core-v2 POS → QR → Print table QR.
              </div>
            </div>
            <Switch aria-label="Enable QR ordering" checked={s.enabled} onChange={() => persist({ enabled: !s.enabled })} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Per-location" description="Dark-launch or pause QR ordering at a single restaurant. (Master must be on.)" />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {locations.map((l) => (
            <div key={l.slug} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 64px", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>{l.city}</div>
              </div>
              <Switch
                aria-label={`Enable QR ordering at ${l.name}`}
                checked={s.enabled && locOn(l.slug)}
                disabled={!s.enabled}
                onChange={() => persist({ locations: { [l.slug]: !locOn(l.slug) } })}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Options" />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 64px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Require a scanned table number</div>
              <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>Guests must open /qr from a table code (?table=…) — a bare /qr link can&rsquo;t order.</div>
            </div>
            <Switch aria-label="Require table number" checked={s.requireTableNumber} onChange={() => persist({ requireTableNumber: !s.requireTableNumber })} />
          </div>
          <div className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 64px", alignItems: "center", padding: "10px 0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Show prices on the QR menu</div>
              <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>Off hides per-item prices (the cart total still shows at checkout).</div>
            </div>
            <Switch aria-label="Show prices" checked={s.showPrices} onChange={() => persist({ showPrices: !s.showPrices })} />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
