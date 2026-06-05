"use client";

import { useCallback, useEffect, useState } from "react";
import { Languages as LangIcon } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead } from "./ui";

type Locale = "pl" | "en" | "de" | "en-SG";
const ALL: Locale[] = ["pl", "en", "de", "en-SG"];
const LABEL: Record<Locale, string> = { pl: "Polski", en: "English", de: "Deutsch", "en-SG": "English (Singapore)" };

export function LanguagesV3() {
  const [enabled, setEnabled] = useState<Record<Locale, boolean>>({ pl: true, en: true, de: false, "en-SG": false });
  const [def, setDef] = useState<Locale>("pl");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/languages").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setDef(d.defaultLocale ?? "pl");
      setEnabled({ pl: d.enabledLocales?.includes("pl") ?? true, en: d.enabledLocales?.includes("en") ?? false, de: d.enabledLocales?.includes("de") ?? false, "en-SG": d.enabledLocales?.includes("en-SG") ?? false });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const enabledList = ALL.filter((l) => enabled[l]);
    if (enabledList.length === 0) return;
    const safeDefault = enabledList.includes(def) ? def : enabledList[0];
    setSaving(true);
    try {
      const res = await fetch("/api/admin/languages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultLocale: safeDefault, enabledLocales: enabledList }) });
      if (res.ok) await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading languages…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Languages</h1>
          <div className="av3-pagehead-sub">Storefront locales offered to guests</div>
        </div>
        <div className="av3-pagehead-actions"><Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button></div>
      </div>
      <Card>
        <CardHead title="Locales" actions={<Badge tone="brand"><LangIcon style={{ width: 11, height: 11 }} /> default {LABEL[def]}</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {ALL.map((l) => (
            <div key={l} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{LABEL[l]}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{l}</div></div>
              <button type="button" className="av3-toggle" data-on={enabled[l]} onClick={() => setEnabled((e) => ({ ...e, [l]: !e[l] }))} style={{ height: 32 }}>{enabled[l] ? "On" : "Off"}</button>
              <button type="button" className="av3-toggle" data-on={def === l} disabled={!enabled[l]} onClick={() => setDef(l)} style={{ height: 32 }}>{def === l ? "Default" : "Set"}</button>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
