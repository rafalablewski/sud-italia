"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Percent, Plug, Radio } from "lucide-react";
import type { IntegrationConnection, IntegrationProviderId } from "@/lib/store";
import { Badge, Button, Card, CardBody, CardHead, Dialog, InfoButton, Kpi, SkeletonPage, Switch } from "./ui";

const PROVIDERS: { id: IntegrationProviderId; label: string; blurb: string }[] = [
  { id: "uber_eats", label: "Uber Eats", blurb: "Global delivery marketplace." },
  { id: "wolt", label: "Wolt", blurb: "Nordics + CEE delivery, strong in Poland." },
  { id: "glovo", label: "Glovo", blurb: "Q-commerce + food delivery across PL." },
  { id: "pyszne_pl", label: "Pyszne.pl", blurb: "Just Eat Takeaway's Polish brand." },
  { id: "bolt_food", label: "Bolt Food", blurb: "Bolt's delivery arm, growing in PL." },
  { id: "grab", label: "Grab", blurb: "Southeast-Asia super-app (for SE-Asia sites)." },
];
const LABEL: Record<IntegrationProviderId, string> = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.label])) as Record<IntegrationProviderId, string>;

function statusTone(s: IntegrationConnection["status"]) {
  return s === "connected" ? "ok" : s === "error" ? "bad" : "neutral";
}

export function IntegrationsV3() {
  const [conns, setConns] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IntegrationProviderId | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/integrations").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d?.connections) setConns(d.connections);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Persist one connection's patch immediately (Rule #7); the store merges it
  // over the stored value and returns the full settings.
  const persist = (patch: Partial<IntegrationConnection> & { provider: IntegrationProviderId }) =>
    fetch("/api/admin/integrations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connections: [patch] }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.connections) setConns(d.connections); })
      .catch(() => {});

  const byProvider = (id: IntegrationProviderId) => conns.find((c) => c.provider === id);

  const toggle = (c: IntegrationConnection) => {
    setConns((list) => list.map((x) => (x.provider === c.provider ? { ...x, enabled: !x.enabled } : x)));
    persist({ provider: c.provider, enabled: !c.enabled });
  };

  const connectedCount = useMemo(() => conns.filter((c) => c.status === "connected").length, [conns]);
  const liveCount = useMemo(() => conns.filter((c) => c.enabled).length, [conns]);
  const blendedCommission = useMemo(() => {
    const live = conns.filter((c) => c.enabled && typeof c.commissionPct === "number");
    if (live.length === 0) return null;
    return live.reduce((s, c) => s + (c.commissionPct ?? 0), 0) / live.length;
  }, [conns]);

  if (loading) return <SkeletonPage />;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Integrations</h1>
          <div className="av3-pagehead-sub">Delivery-marketplace connections · enable to show guests an &ldquo;also order on&rdquo; link · changes save instantly</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Connected" icon={Plug} value={`${connectedCount}/${PROVIDERS.length}`} accentVar="--av3-c4" info={
          <InfoButton title="Connected marketplaces"
            description="How many delivery marketplaces have a live, configured connection."
            institutional="Marketplaces are incremental demand you don't own — they trade reach for commission (25–30% on Uber/Wolt/Glovo, ~13% on Pyszne.pl). The institutional discipline is channel-level CM1: an order that nets positive after the marketplace's cut is accretive; one that doesn't is buying revenue at a loss. Benchmark: most independents run 2–3 marketplaces and treat them as marketing spend, not a moat. Over-listing fragments your ops and trains guests to pay the platform instead of you."
            plain="List on Wolt + Pyszne.pl and a tourist who's never heard of you orders an 85 zł pizza from their phone. Wolt keeps ~24 zł of it, but you'd never have met that guest otherwise — as long as the remaining ~61 zł still clears your food + labour on that order, it's found money. The moment a channel stops clearing, you pause it here, not renegotiate forever."
            tips="Connect the two or three marketplaces your guests actually use (in PL: Wolt, Pyszne.pl, Glovo). Set each one's real contract commission so the Calculator's channel economics are honest. Use the per-connection deep-link so your own site can point guests to the marketplace. Pause (disable) a channel whose net CM1 goes negative rather than discounting into it."
            methodology="Count of connections with status='connected' in integration-settings.json (PUT /api/admin/integrations). 'Connected' is set by the Connect/Test action once a store id is present; live order ingestion needs each marketplace's partner API." />
        } />
        <Kpi label="Live channels" icon={Radio} value={`${liveCount}`} accentVar="--av3-c2" />
        <Kpi label="Blended commission" icon={Percent} value={blendedCommission != null ? `${(blendedCommission * 100).toFixed(0)}%` : "—"} accentVar="--av3-c1" />
        <Kpi label="Shown to guests" icon={Link2} value={`${conns.filter((c) => c.enabled && c.orderUrl).length}`} accentVar="--av3-c3" />
      </div>

      <Card>
        <CardHead title="Marketplaces" description="Connect a marketplace, set its store id, commission and public order link, then enable it." />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {PROVIDERS.map((p) => {
            const c = byProvider(p.id);
            if (!c) return null;
            return (
              <div key={p.id} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr auto 110px 64px", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                  <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {p.blurb}
                    {typeof c.commissionPct === "number" && <> · {Math.round(c.commissionPct * 100)}% commission</>}
                    {c.storeId && <> · store {c.storeId}</>}
                  </div>
                </div>
                <Badge tone={statusTone(c.status)} dot>{c.status}</Badge>
                <Button variant="secondary" size="sm" onClick={() => setEditing(p.id)}>Configure</Button>
                <Switch aria-label={`Enable ${p.label}`} checked={c.enabled} onChange={() => toggle(c)} />
              </div>
            );
          })}
        </CardBody>
      </Card>

      {editing && (() => {
        const c = byProvider(editing);
        if (!c) return null;
        return <ConfigDialog conn={c} onClose={() => setEditing(null)} onPersist={persist} />;
      })()}
    </>
  );
}

function ConfigDialog({
  conn,
  onClose,
  onPersist,
}: {
  conn: IntegrationConnection;
  onClose: () => void;
  onPersist: (patch: Partial<IntegrationConnection> & { provider: IntegrationProviderId }) => Promise<void>;
}) {
  const [storeId, setStoreId] = useState(conn.storeId ?? "");
  const [orderUrl, setOrderUrl] = useState(conn.orderUrl ?? "");
  const [commission, setCommission] = useState(conn.commissionPct != null ? String(Math.round(conn.commissionPct * 100)) : "");
  const [autoAccept, setAutoAccept] = useState(!!conn.autoAccept);
  const [status, setStatus] = useState(conn.status);
  const [saving, setSaving] = useState(false);

  const base = (): Partial<IntegrationConnection> & { provider: IntegrationProviderId } => ({
    provider: conn.provider,
    storeId: storeId.trim(),
    orderUrl: orderUrl.trim(),
    commissionPct: commission.trim() ? Math.max(0, Math.min(100, Number(commission) || 0)) / 100 : undefined,
    autoAccept,
  });

  const save = async () => {
    setSaving(true);
    try { await onPersist({ ...base(), status }); onClose(); } finally { setSaving(false); }
  };
  // "Connect"/"Test" is the honest extent without the marketplace's partner
  // API: a store id is required to be considered connected.
  const connect = async () => {
    setSaving(true);
    try {
      const ok = !!storeId.trim();
      const next = ok ? "connected" : "error";
      setStatus(next);
      await onPersist({ ...base(), status: next, enabled: ok ? true : conn.enabled, lastConnectedAt: ok ? new Date().toISOString() : conn.lastConnectedAt });
      if (ok) onClose();
    } finally { setSaving(false); }
  };
  const disconnect = async () => {
    setSaving(true);
    try { setStatus("disconnected"); await onPersist({ ...base(), status: "disconnected", enabled: false }); onClose(); } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} title={LABEL[conn.provider]} headerExtra={<Badge tone={statusTone(status)} dot>{status}</Badge>} width={520}
      footer={
        <>
          {conn.status === "connected"
            ? <Button variant="danger" size="sm" loading={saving} onClick={disconnect} style={{ marginRight: "auto" }}>Disconnect</Button>
            : <Button variant="primary" size="sm" loading={saving} onClick={connect} style={{ marginRight: "auto" }}>Connect</Button>}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={save}>Save</Button>
        </>
      }>
      <label className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Store / merchant id on {LABEL[conn.provider]}</span>
        <input className="av3-input" value={storeId} placeholder="e.g. 4821-krakow" onChange={(e) => setStoreId(e.target.value)} />
      </label>
      <label className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Public order link (shown to guests)</span>
        <input className="av3-input" value={orderUrl} placeholder="https://wolt.com/…/ottaviano" onChange={(e) => setOrderUrl(e.target.value)} />
      </label>
      <div className="av3-formrow" style={{ gridTemplateColumns: "140px 1fr", marginBottom: 4, alignItems: "center", gap: 12 }}>
        <label className="av3-field">
          <span className="av3-field-label">Commission %</span>
          <input className="av3-input" type="number" min={0} max={100} value={commission} placeholder="27" onChange={(e) => setCommission(e.target.value)} />
        </label>
        <label className="av3-switch-row" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <Switch aria-label="Auto-accept orders" checked={autoAccept} onChange={setAutoAccept} />
          <span style={{ fontSize: 12.5 }}>Auto-accept incoming orders</span>
        </label>
      </div>
      <p className="av3-cell-muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 10 }}>
        Connection management only. Live order ingestion requires {LABEL[conn.provider]}&rsquo;s partner API + webhook; the
        commission feeds the Calculator&rsquo;s channel economics and the public order link surfaces on the storefront.
      </p>
    </Dialog>
  );
}
