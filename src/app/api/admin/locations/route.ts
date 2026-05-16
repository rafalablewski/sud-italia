import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import {
  deleteLocation,
  getAllLocationsAsync,
  seedLocationsFromCode,
  upsertLocation,
} from "@/lib/locations-store";
import { appendAuditLog } from "@/lib/store";
import type { Location } from "@/data/types";

/**
 * Audit §2 "Scalability (ops) — Hardcoded locations". Adding a third
 * truck used to mean a code change to `src/data/locations.ts` plus a
 * deploy. This route lets an owner add / edit / archive locations
 * without touching the repo. Reads cache for 30s in-process via
 * `locations-store`; writes invalidate.
 */

const locationSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, hyphens"),
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  address: z.string().min(1).max(240),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  heroImage: z.string().max(500).default(""),
  description: z.string().max(2000).default(""),
  shortDescription: z.string().max(300).default(""),
  hours: z
    .array(
      z.object({
        day: z.string().min(1),
        open: z.string().regex(/^\d{2}:\d{2}$/),
        close: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .default([]),
  isActive: z.boolean().default(false),
  currency: z.literal("PLN").default("PLN"),
  servesAlcohol: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

export const GET = withAdmin(
  { roles: ["manager"] },
  async () => {
    const list = await getAllLocationsAsync();
    return NextResponse.json({ locations: list });
  },
);

export const POST = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const body = await req.json().catch(() => null);
    const parsed = locationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { displayOrder, ...rest } = parsed.data;
    const location: Location = rest;
    const saved = await upsertLocation(location, displayOrder);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "location.upsert",
      entityType: "location",
      entityId: saved.slug,
      after: { ...saved, displayOrder },
    });
    return NextResponse.json({ location: saved });
  },
);

export const DELETE = withAdmin(
  { roles: ["owner"] },
  async (req, _ctx, { user }) => {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "missing_slug" }, { status: 400 });
    }
    const removed = await deleteLocation(slug);
    if (!removed) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await appendAuditLog({
      actor: user.email || user.id,
      action: "location.delete",
      entityType: "location",
      entityId: slug,
    });
    return NextResponse.json({ ok: true });
  },
);

/** Convenience: re-seed from the hardcoded src/data/locations.ts list. */
export const PUT = withAdmin(
  { roles: ["owner"] },
  async (_req, _ctx, { user }) => {
    const result = await seedLocationsFromCode();
    await appendAuditLog({
      actor: user.email || user.id,
      action: "location.seed",
      entityType: "location",
      entityId: "bulk",
      after: result,
    });
    return NextResponse.json(result);
  },
);
