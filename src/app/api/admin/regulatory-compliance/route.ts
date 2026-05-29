import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  DEFAULT_COMPLIANCE_CONFIG,
  getSettings,
  updateSettings,
} from "@/lib/store";
import { parseBody } from "@/lib/api-schemas";

const zoneEnum = z.enum(["EU", "NYC", "SG"]);
const dohGradeEnum = z.enum(["A", "B", "C", "Pending"]);

const locationComplianceSchema = z.object({
  zone: zoneEnum,
  dohGrade: dohGradeEnum.nullable().optional(),
  dohGradeIssued: z.string().max(20).nullable().optional(),
  calorieDisclosureRequired: z.boolean().optional(),
  halalCertId: z.string().max(80).nullable().optional(),
  halalCertExpires: z.string().max(20).nullable().optional(),
  gstRegistered: z.boolean().optional(),
  gstNumber: z.string().max(40).nullable().optional(),
  gstRateBps: z.number().int().min(0).max(5000).optional(),
  vatRateBps: z.number().int().min(0).max(5000).optional(),
  nutriGradeRequired: z.boolean().optional(),
  packagingDisclosure: z.string().max(1000).nullable().optional(),
  pdpaConsentText: z.string().max(3000).nullable().optional(),
});

const complianceConfigSchema = z.object({
  defaultZone: zoneEnum,
  byLocation: z.record(z.string().min(1).max(80), locationComplianceSchema),
});

export const GET = withAdmin({}, async () => {
  const settings = await getSettings();
  return NextResponse.json(settings.compliance ?? DEFAULT_COMPLIANCE_CONFIG);
});

export const PUT = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, complianceConfigSchema);
    if ("error" in parsed) return parsed.error;
    const before = (await getSettings()).compliance;
    const after = await updateSettings({ compliance: parsed.data });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "settings.compliance.update",
      entityType: "settings",
      before,
      after: after.compliance,
    });
    return NextResponse.json(after.compliance);
  },
);
