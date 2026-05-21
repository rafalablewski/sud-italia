"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  Textarea,
  useToast,
} from "./v2/ui";
import { locations as ALL_LOCATIONS } from "@/data/locations";

type Zone = "EU" | "NYC" | "SG";
type DohGrade = "A" | "B" | "C" | "Pending";

interface LocationCompliance {
  zone: Zone;
  dohGrade?: DohGrade | null;
  dohGradeIssued?: string | null;
  calorieDisclosureRequired?: boolean;
  halalCertId?: string | null;
  halalCertExpires?: string | null;
  gstRegistered?: boolean;
  gstNumber?: string | null;
  gstRateBps?: number;
  nutriGradeRequired?: boolean;
  packagingDisclosure?: string | null;
  pdpaConsentText?: string | null;
}

interface ComplianceConfig {
  defaultZone: Zone;
  byLocation: Record<string, LocationCompliance>;
}

const ZONE_LABELS: Record<Zone, string> = {
  EU: "EU / Poland (1169/2011 allergens, JPK_V7M VAT)",
  NYC: "New York City (§81.50 calorie + DOH letter grade + FRESH Act packaging + FDA Big-9 allergen)",
  SG: "Singapore (NEA Nutri-Grade + MUIS Halal + 9% GST + PDPA §13 consent)",
};

const ZONE_SHORT: Record<Zone, string> = {
  EU: "EU",
  NYC: "NYC",
  SG: "SG",
};

const ZONE_TONE: Record<Zone, "neutral" | "info" | "brand"> = {
  EU: "neutral",
  NYC: "info",
  SG: "brand",
};

function blankLocation(zone: Zone): LocationCompliance {
  return { zone };
}

export function AdminRegulatoryCompliance() {
  const toast = useToast();
  const [config, setConfig] = useState<ComplianceConfig | null>(null);
  const [defaultZone, setDefaultZone] = useState<Zone>("EU");
  const [draft, setDraft] = useState<Record<string, LocationCompliance>>({});
  const [activeSlug, setActiveSlug] = useState<string>(ALL_LOCATIONS[0]?.slug ?? "");
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/admin/regulatory-compliance");
    if (!res.ok) return;
    const data: ComplianceConfig = await res.json();
    setConfig(data);
    setDefaultZone(data.defaultZone);
    const next: Record<string, LocationCompliance> = {};
    for (const loc of ALL_LOCATIONS) {
      next[loc.slug] = data.byLocation[loc.slug] ?? blankLocation(data.defaultZone);
    }
    setDraft(next);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const active = activeSlug ? draft[activeSlug] : undefined;

  const setActive = (next: LocationCompliance) => {
    setDraft((prev) => ({ ...prev, [activeSlug]: next }));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const byLocation: Record<string, LocationCompliance> = {};
      for (const [slug, value] of Object.entries(draft)) {
        // Skip a location entirely if it's still at the default zone with
        // no other fields populated — keeps the persisted blob small.
        const hasOverride =
          value.zone !== defaultZone ||
          value.dohGrade ||
          value.dohGradeIssued ||
          value.calorieDisclosureRequired ||
          value.halalCertId ||
          value.halalCertExpires ||
          value.gstRegistered ||
          value.gstNumber ||
          typeof value.gstRateBps === "number" ||
          value.nutriGradeRequired ||
          value.packagingDisclosure ||
          value.pdpaConsentText;
        if (hasOverride) byLocation[slug] = value;
      }
      const res = await fetch("/api/admin/regulatory-compliance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultZone, byLocation }),
      });
      if (res.ok) {
        toast.success("Regulatory disclosures saved");
        await fetchConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not save", (err as { error?: string }).error);
      }
    } finally {
      setSaving(false);
    }
  };

  const zoneSummary = useMemo(() => {
    const counts: Record<Zone, number> = { EU: 0, NYC: 0, SG: 0 };
    for (const loc of ALL_LOCATIONS) {
      const z = draft[loc.slug]?.zone ?? defaultZone;
      counts[z] += 1;
    }
    return counts;
  }, [draft, defaultZone]);

  if (!config) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <h1 className="v2-page-title">Regulatory compliance</h1>
        </header>
        <p className="admin-text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Regulatory disclosures
          </h1>
          <p className="v2-page-subtitle">
            Tag each location with its regulatory pack (EU / NYC / SG) and
            fill the customer-visible disclosures the local authority
            requires. The customer site renders the matching chrome —
            DOH letter grade banner for NYC, Nutri-Grade badges + GST line
            + PDPA consent for SG, allergen chips everywhere — driven by
            what you fill in here. Nothing is inferred; if a field is
            blank, the customer sees no claim.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:gap-6">
        <Card>
          <CardHeader title="Default regulatory pack" description="Applied to any location not tagged below." />
          <CardBody>
            <div className="flex items-center gap-3">
              <Select
                value={defaultZone}
                onChange={(e) => setDefaultZone(e.target.value as Zone)}
              >
                {(["EU", "NYC", "SG"] as Zone[]).map((z) => (
                  <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                ))}
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["EU", "NYC", "SG"] as Zone[]).map((z) => (
                <Badge key={z} tone={ZONE_TONE[z]} variant="soft">
                  {ZONE_SHORT[z]}: {zoneSummary[z]} location{zoneSummary[z] === 1 ? "" : "s"}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Per-location disclosures"
            description="Pick a location, set its zone, fill the fields. Empty fields = no claim shown."
          />
          <CardBody>
            <div className="flex flex-wrap gap-2 mb-4">
              {ALL_LOCATIONS.map((loc) => {
                const z = draft[loc.slug]?.zone ?? defaultZone;
                const isActive = activeSlug === loc.slug;
                return (
                  <button
                    key={loc.slug}
                    onClick={() => setActiveSlug(loc.slug)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      isActive
                        ? "bg-italia-red text-white"
                        : "bg-white/5 admin-text hover:bg-white/10"
                    }`}
                  >
                    {loc.city} · {ZONE_SHORT[z]}
                  </button>
                );
              })}
            </div>

            {active && (
              <div className="grid gap-4">
                <div>
                  <label className="block admin-text-secondary text-xs mb-1">
                    Regulatory zone
                  </label>
                  <Select
                    value={active.zone}
                    onChange={(e) => setActive({ ...active, zone: e.target.value as Zone })}
                  >
                    {(["EU", "NYC", "SG"] as Zone[]).map((z) => (
                      <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                    ))}
                  </Select>
                </div>

                {active.zone === "NYC" && (
                  <div className="grid gap-4 rounded-lg border border-blue-400/30 bg-blue-500/5 p-4">
                    <div className="admin-text text-sm font-semibold">
                      NYC disclosures (Health Code §81.50/§81.51 + FRESH Act)
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          DOH letter grade
                        </label>
                        <Select
                          value={active.dohGrade ?? ""}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              dohGrade: (e.target.value || null) as DohGrade | null,
                            })
                          }
                        >
                          <option value="">— Not posted —</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="Pending">Pending (Grade Pending placard)</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          Grade issued (ISO date)
                        </label>
                        <Input
                          type="date"
                          value={active.dohGradeIssued ?? ""}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              dohGradeIssued: e.target.value || null,
                            })
                          }
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 admin-text text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!active.calorieDisclosureRequired}
                        onChange={(e) =>
                          setActive({
                            ...active,
                            calorieDisclosureRequired: e.target.checked,
                          })
                        }
                      />
                      Show per-item kcal next to every price (§81.50)
                    </label>

                    <div>
                      <label className="block admin-text-secondary text-xs mb-1">
                        FRESH Act packaging disclosure (rendered in cart)
                      </label>
                      <Textarea
                        rows={3}
                        value={active.packagingDisclosure ?? ""}
                        onChange={(e) =>
                          setActive({
                            ...active,
                            packagingDisclosure: e.target.value || null,
                          })
                        }
                        placeholder="e.g. Packaging contains recyclable PET (pizza box outer), bagasse (sides), and PLA (cutlery). No expanded polystyrene."
                      />
                    </div>
                  </div>
                )}

                {active.zone === "SG" && (
                  <div className="grid gap-4 rounded-lg border border-purple-400/30 bg-purple-500/5 p-4">
                    <div className="admin-text text-sm font-semibold">
                      Singapore disclosures (NEA + MUIS + IRAS + PDPA)
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          MUIS Halal certificate number
                        </label>
                        <Input
                          value={active.halalCertId ?? ""}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              halalCertId: e.target.value || null,
                            })
                          }
                          placeholder="e.g. MUIS-EE-123456"
                        />
                      </div>
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          Halal cert expires (ISO date)
                        </label>
                        <Input
                          type="date"
                          value={active.halalCertExpires ?? ""}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              halalCertExpires: e.target.value || null,
                            })
                          }
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 admin-text text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!active.nutriGradeRequired}
                        onChange={(e) =>
                          setActive({
                            ...active,
                            nutriGradeRequired: e.target.checked,
                          })
                        }
                      />
                      Surface NEA Nutri-Grade badges on beverages with a grade set
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 admin-text text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!active.gstRegistered}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              gstRegistered: e.target.checked,
                            })
                          }
                        />
                        GST-registered (IRAS)
                      </label>
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          GST number
                        </label>
                        <Input
                          value={active.gstNumber ?? ""}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              gstNumber: e.target.value || null,
                            })
                          }
                          placeholder="e.g. 201234567M"
                        />
                      </div>
                      <div>
                        <label className="block admin-text-secondary text-xs mb-1">
                          GST rate (basis points, 900 = 9 %)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={5000}
                          value={active.gstRateBps ?? 900}
                          onChange={(e) =>
                            setActive({
                              ...active,
                              gstRateBps: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block admin-text-secondary text-xs mb-1">
                        PDPA §13 consent text (shown before phone collection)
                      </label>
                      <Textarea
                        rows={4}
                        value={active.pdpaConsentText ?? ""}
                        onChange={(e) =>
                          setActive({
                            ...active,
                            pdpaConsentText: e.target.value || null,
                          })
                        }
                        placeholder="e.g. Sud Italia Pte Ltd collects your name, mobile number, and order history under PDPA §13 to process this order, send the receipt, and run loyalty. Tap our privacy notice for full details and withdrawal."
                      />
                    </div>
                  </div>
                )}

                {active.zone === "EU" && (
                  <div className="grid gap-3 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-4">
                    <div className="admin-text text-sm font-semibold">
                      EU / Poland defaults
                    </div>
                    <p className="admin-text-secondary text-xs leading-relaxed">
                      EU 1169/2011 allergen labels render automatically from
                      each item's <code>allergens</code> field; no further
                      operator action required. Polish JPK_V7M VAT exports
                      live at <code>/admin/reports</code>.
                    </p>
                    <label className="flex items-center gap-2 admin-text text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!active.calorieDisclosureRequired}
                        onChange={(e) =>
                          setActive({
                            ...active,
                            calorieDisclosureRequired: e.target.checked,
                          })
                        }
                      />
                      Show per-item kcal voluntarily (UK 2022 Calorie Labelling
                      style — useful if you serve UK tourists or franchise into
                      the UK)
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving} variant="primary">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save disclosures"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
