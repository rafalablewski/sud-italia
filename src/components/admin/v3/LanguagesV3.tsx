"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Globe, Languages as LangIcon } from "lucide-react";
import { Badge, Card, CardBody, CardHead, Kpi } from "./ui";

type Locale = "pl" | "en" | "de" | "en-SG";
const ALL: Locale[] = ["pl", "en", "de", "en-SG"];
const LABEL: Record<Locale, string> = { pl: "Polski", en: "English", de: "Deutsch", "en-SG": "English (Singapore)" };

export function LanguagesV3() {
  const [enabled, setEnabled] = useState<Record<Locale, boolean>>({ pl: true, en: true, de: false, "en-SG": false });
  const [def, setDef] = useState<Locale>("pl");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/languages").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setDef(d.defaultLocale ?? "pl");
      setEnabled({ pl: d.enabledLocales?.includes("pl") ?? true, en: d.enabledLocales?.includes("en") ?? false, de: d.enabledLocales?.includes("de") ?? false, "en-SG": d.enabledLocales?.includes("en-SG") ?? false });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Persist on every toggle (rule #7); guard against an empty enabled-list.
  const persist = (en: Record<Locale, boolean>, df: Locale) => {
    const enabledList = ALL.filter((l) => en[l]);
    if (enabledList.length === 0) return;
    const safeDefault = enabledList.includes(df) ? df : enabledList[0];
    return fetch("/api/admin/languages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultLocale: safeDefault, enabledLocales: enabledList }) });
  };
  const toggleEnabled = (l: Locale) => {
    const en = { ...enabled, [l]: !enabled[l] };
    if (ALL.filter((x) => en[x]).length === 0) return; // never disable the last locale
    const df = en[def] ? def : (ALL.find((x) => en[x]) ?? "pl");
    setEnabled(en); setDef(df); persist(en, df);
  };
  const setDefault = (l: Locale) => { setDef(l); persist(enabled, l); };

  const enabledCount = useMemo(() => ALL.filter((l) => enabled[l]).length, [enabled]);

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading languages…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Languages</h1>
          <div className="av3-pagehead-sub">Storefront locales offered to guests · changes save instantly</div>
        </div>
      </div>
      <div className="av3-kpi-rail">
        <Kpi label="Default" icon={LangIcon} value={def.toUpperCase()} accentVar="--av3-c2" />
        <Kpi label="Enabled" icon={CheckCircle2} value={`${enabledCount}/${ALL.length}`} accentVar="--av3-c4" />
        <Kpi label="Translations" icon={Globe} value="Live" accentVar="--av3-c3" />
      </div>
      <Card>
        <CardHead title="Locales" actions={<Badge tone="brand"><LangIcon style={{ width: 11, height: 11 }} /> default {LABEL[def]}</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {ALL.map((l) => (
            <div key={l} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{LABEL[l]}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{l}</div></div>
              <button type="button" className="av3-toggle" data-on={enabled[l]} onClick={() => toggleEnabled(l)} style={{ height: 32 }}>{enabled[l] ? "On" : "Off"}</button>
              <button type="button" className="av3-toggle" data-on={def === l} disabled={!enabled[l]} onClick={() => setDefault(l)} style={{ height: 32 }}>{def === l ? "Default" : "Set"}</button>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
