import { z } from "zod";
import { NextResponse } from "next/server";
import { REFUND_REASON_CODES } from "@/data/types";
import { isPermissionKey } from "@/lib/permissions";

/**
 * Zod schemas for API request bodies. Every route that mutates state
 * should parse its body through one of these — that gives us:
 *
 * - A single source of truth for what the wire format actually accepts.
 * - Field-level error messages for the client without bespoke `if (!body.x)`
 *   chains in every handler.
 * - Type narrowing — the parsed result is the right TS type without casts.
 *
 * The schemas are intentionally strict-ish: `.strict()` rejects unknown keys
 * so an old client sending a deprecated field gets a 400 instead of silently
 * dropping data.
 *
 * Where business rules need cross-field validation (e.g. delivery requires
 * an address) we use `.refine()`. Where a field needs additional normalization
 * after parsing (E.164 phones, trimmed strings), the handler does that step —
 * the schema only validates the *shape*.
 */

// --- Reusable primitives -------------------------------------------------

/** Polish phone in any reasonable input format; handler normalizes to E.164. */
export const phoneInput = z.string().min(7).max(25);

/** Location slug: lowercase alphanum + hyphens, matching `slugs.ts`. */
export const locationSlug = z.string().regex(/^[a-z0-9-]+$/);

/** Money in grosze (integer, ≥ 0). */
export const grosze = z.number().int().nonnegative();

/** Stable id: short, non-empty. */
export const stableId = z.string().min(1).max(200);

/** ISO calendar date: YYYY-MM-DD. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Wall-clock time: HH:MM (24h). */
export const wallTime = z.string().regex(/^\d{2}:\d{2}$/);

/** Per-line cart notes — kitchen-facing free text, bounded length. */
export const cartNote = z.string().max(140).optional();

/** Phone-or-empty: optional opt-in field on signup forms. */
export const optionalPhone = phoneInput.optional();

// --- Public endpoint: POST /api/checkout ---------------------------------

const cartItemInput = z.object({
  id: stableId,
  quantity: z.number().int().positive().max(99),
  notes: cartNote,
  /** Modifier picks (audit §3 / §11.2). Re-validated against the live menu in
   *  createOrder before pricing, so a forged id can't lower the price. Capped to
   *  keep the payload bounded. */
  selectedModifiers: z
    .array(z.object({ groupId: stableId, optionId: stableId }))
    .max(20)
    .optional(),
});

/**
 * Checkout body schema. The handler still normalizes the phone to E.164
 * after parsing and re-validates the slot at write-time; this schema only
 * catches shape errors so the route doesn't have to.
 */
export const checkoutBodySchema = z
  .object({
    items: z.array(cartItemInput).min(1).max(50),
    locationSlug,
    customerName: z.string().min(1).max(120),
    customerPhone: phoneInput,
    fulfillmentType: z.enum(["takeout", "delivery", "dine-in"]),
    slotId: stableId,
    slotDate: isoDate,
    slotTime: wallTime,
    deliveryAddress: z.string().max(500).optional(),
    /** Guests for a dine-in reservation. Required (≥1) when
     *  fulfillmentType is "dine-in"; ignored otherwise. */
    partySize: z.number().int().positive().max(50).optional(),
    tipAmount: z.number().int().nonnegative().max(100_000).optional(),
    /** When set, the cart was checked out as a §3.2 bundle. The server
     *  re-resolves the bundle by id and recomputes its price, but caps
     *  the charged amount at what the client showed (see
     *  appliedBundlePriceGrosze) so an admin discount edit mid-checkout
     *  can never overcharge the customer. */
    appliedBundleId: z.string().min(1).max(80).optional(),
    /** Snapshot of the price the chip showed when the customer tapped the
     *  bundle. Server uses min(serverComputed, clientSnapshot) so a
     *  discount-percent drop between render and checkout is honoured for
     *  the customer (operator-protective for hikes, customer-protective
     *  for drops). Required when appliedBundleId is set. */
    appliedBundlePriceGrosze: z.number().int().nonnegative().max(1_000_000).optional(),
  })
  .refine(
    (data) =>
      data.fulfillmentType !== "delivery" ||
      (typeof data.deliveryAddress === "string" &&
        data.deliveryAddress.trim().length > 0),
    {
      message: "Delivery address is required when fulfillmentType is 'delivery'",
      path: ["deliveryAddress"],
    },
  )
  .refine(
    (data) =>
      data.fulfillmentType !== "dine-in" ||
      (typeof data.partySize === "number" && data.partySize > 0),
    {
      message: "Party size is required when fulfillmentType is 'dine-in'",
      path: ["partySize"],
    },
  );

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

// --- Admin: orders -------------------------------------------------------

export const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

/** PUT /api/admin/orders — manual status change by an operator. */
export const orderStatusChangeSchema = z.object({
  orderId: stableId,
  status: orderStatusSchema,
});

/** DELETE /api/admin/orders — hard-delete (admin override). */
export const orderDeleteSchema = z.object({
  orderId: stableId,
});

/**
 * POST /api/admin/orders/[id]/refund. Partial refunds require a positive
 * amount in grosze; full refunds use the order total. reasonCode comes
 * from the closed list in data/types.ts so we can build reports keyed by
 * cause.
 */
export const refundBodySchema = z
  .object({
    type: z.enum(["full", "partial"]),
    amount: z.number().int().positive().optional(),
    reasonCode: z.enum(REFUND_REASON_CODES),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => data.type !== "partial" || typeof data.amount === "number",
    {
      message: "Partial refunds require a positive integer `amount` in grosze",
      path: ["amount"],
    },
  );

// --- Admin: slots --------------------------------------------------------

export const fulfillmentTypeSchema = z.enum(["takeout", "delivery", "dine-in"]);

/**
 * POST /api/admin/slots — accepts either a single slot (time + maxOrders) or
 * a bulk range (bulk: {startTime, endTime, interval}). We model the union
 * as separate optional fields with a refine so the error message points at
 * the right place if neither shape is supplied.
 */
export const slotCreateSchema = z
  .object({
    locationSlug,
    date: isoDate,
    fulfillmentTypes: z.array(fulfillmentTypeSchema).min(1).max(3),
    time: wallTime.optional(),
    maxOrders: z.number().int().positive().max(500).optional(),
    bulk: z
      .object({
        startTime: wallTime,
        endTime: wallTime,
        interval: z.number().int().positive().max(180),
      })
      .optional(),
  })
  .refine(
    (data) => (data.bulk ? true : !!data.time && data.maxOrders !== undefined),
    {
      message:
        "Provide either `bulk` for a range or both `time` + `maxOrders` for a single slot",
      path: ["time"],
    },
  );

/**
 * PUT /api/admin/slots — single update by id or bulk update by ids[]. The
 * updates payload is open-ended (status, maxOrders, fulfillmentTypes, etc.)
 * so we accept the loose record here and let the store reject unknown
 * fields downstream.
 */
export const slotUpdateSchema = z
  .object({
    id: stableId.optional(),
    ids: z.array(stableId).min(1).max(500).optional(),
    status: z.enum(["draft", "active"]).optional(),
    maxOrders: z.number().int().positive().max(500).optional(),
    fulfillmentTypes: z.array(fulfillmentTypeSchema).optional(),
  })
  .refine((data) => !!data.id || (Array.isArray(data.ids) && data.ids.length > 0), {
    message: "Provide `id` for a single update or `ids[]` for a bulk update",
    path: ["id"],
  });

// --- Admin: cash sessions ------------------------------------------------

/** POST /api/admin/cash — open a new session. */
export const cashOpenSchema = z.object({
  locationSlug,
  openingFloat: grosze.max(1_000_000),
  openedBy: z.string().min(1).max(120).optional(),
  notes: z.string().max(500).optional(),
});

/** POST /api/admin/haccp — record a HACCP temperature reading. `tempCelsius` is
 *  in tenths of a degree (so -180 = -18.0 °C), bounded to a sane probe range. */
export const tempLogCreateSchema = z.object({
  locationSlug,
  sensor: z.string().min(1).max(80),
  tempCelsius: z.number().int().min(-500).max(1500),
  recordedBy: z.string().min(1).max(120).optional(),
});

/** POST /api/admin/waste — log a discarded item (spoilage / prep error / etc.). */
export const wasteLogCreateSchema = z.object({
  locationSlug,
  item: z.string().min(1).max(120),
  quantity: z.number().positive().max(100_000),
  unit: z.string().min(1).max(24),
  reason: z.enum([
    "spoilage",
    "prep_error",
    "dropped",
    "overproduction",
    "customer_return",
    "expired",
    "other",
  ]),
  estimatedCostGrosze: z.number().int().nonnegative().max(10_000_000).optional(),
  notes: z.string().max(500).optional(),
  recordedBy: z.string().min(1).max(120).optional(),
});

/** POST /api/admin/handover — close a shift with a handover record. */
export const handoverCreateSchema = z.object({
  locationSlug,
  shift: z.enum(["open", "mid", "close"]),
  cashCountedGrosze: z.number().int().nonnegative().max(10_000_000).optional(),
  cashSessionId: z.string().max(80).optional(),
  tempChecksOk: z.boolean(),
  wasteNoted: z.boolean(),
  equipmentOk: z.boolean(),
  managerComment: z.string().max(2000).optional(),
  outgoingManager: z.string().min(1).max(120),
  incomingManager: z.string().max(120).optional(),
  recordedBy: z.string().min(1).max(120).optional(),
});

const cashDropKindSchema = z.enum(["sale", "drop", "payout", "adjust"]);

/** POST /api/admin/cash/[id]?action=drop — append a drop / payout / adjust. */
export const cashDropSchema = z.object({
  amountGrosze: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "amountGrosze must be non-zero" }),
  kind: cashDropKindSchema,
  notes: z.string().max(500).optional(),
  actor: z.string().min(1).max(120).optional(),
});

/** POST /api/admin/cash/[id]?action=close — close out + reconcile. */
export const cashCloseSchema = z.object({
  closingCountGrosze: grosze.max(10_000_000),
  closedBy: z.string().min(1).max(120).optional(),
  notes: z.string().max(500).optional(),
});

/** PATCH /api/admin/cash/[id] — toggle the soft-hidden flag. */
export const cashPatchSchema = z.object({
  hidden: z.boolean(),
});

// --- Admin: loyalty -------------------------------------------------------

/**
 * POST /api/admin/members/points — manual point adjustment by a manager.
 * Amount can be positive (grant) or negative (deduct) but not zero. The
 * handler still normalizes the phone to PL E.164.
 */
export const pointsAdjustSchema = z
  .object({
    phone: phoneInput,
    amount: z
      .number()
      .int()
      .refine((n) => n !== 0, { message: "amount must be non-zero" })
      .refine((n) => Math.abs(n) <= 100_000, {
        message: "amount magnitude must be ≤ 100,000",
      }),
    reason: z.string().max(500).optional(),
  });

/** PUT /api/admin/members/profile — set DOB / email / display name. */
export const memberProfileSchema = z
  .object({
    phone: phoneInput,
    dob: isoDate.optional(),
    email: z.string().email().max(254).optional(),
    name: z.string().min(1).max(120).optional(),
  })
  .refine(
    (data) =>
      data.dob !== undefined ||
      data.email !== undefined ||
      data.name !== undefined,
    { message: "At least one of dob, email, name is required" },
  );

// --- Admin: customer notes ------------------------------------------------

/** POST /api/admin/customer-notes — attach a free-text note to a phone. */
export const customerNoteCreateSchema = z.object({
  phone: phoneInput,
  body: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  authoredBy: z.string().min(1).max(120).optional(),
});

// --- Admin: menu overrides -----------------------------------------------

// Audit §4.3 menu engineering. `null` is the explicit "clear back to seed"
// value; `undefined` (field absent) means "leave whatever's stored".
// `isoDate` is the shared YYYY-MM-DD schema defined near the top of this file.
const menuRoleEnum = z.enum(["hero", "profit-driver", "anchor", "lto"]);

const menuCategoryEnum = z.enum([
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
]);

const menuTagEnum = z.enum(["vegetarian", "vegan", "spicy", "gluten-free"]);

// Audit §3 — modifier groups (Crust, Premium toppings, etc.). Round-trip
// through MenuOverride.modifierGroups. `null` clears back to seed.
const modifierOptionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  priceDelta: grosze.max(20_000),
  costDelta: grosze.max(20_000).optional(),
  flagOnKds: z.boolean().optional(),
});
const modifierGroupSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  minSelections: z.number().int().min(0).max(10).optional(),
  maxSelections: z.number().int().min(1).max(10).optional(),
  options: z.array(modifierOptionSchema).min(1).max(20),
});

// Regulatory disclosures — audit §11.1. Per-item flags surfaced on the
// customer card and the admin editor. Stored as override fields so the
// operator can adjust without touching the seed menu files.
const halalStatusEnum = z.enum(["halal", "non-halal", "uncertified"]);
const nutriGradeEnum = z.enum(["A", "B", "C", "D"]);
const allergenEnum = z.enum([
  "gluten",
  "dairy",
  "eggs",
  "fish",
  "shellfish",
  "nuts",
  "peanuts",
  "soy",
  "celery",
  "mustard",
  "sesame",
  "sulfites",
  "lupin",
  "molluscs",
]);

const menuOverrideEditSchema = z.object({
  price: grosze.max(100_000).optional(),
  cost: grosze.max(100_000).optional(),
  available: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  menuRole: menuRoleEnum.nullable().optional(),
  isLimited: z.boolean().nullable().optional(),
  limitedUntil: isoDate.nullable().optional(),
  // Audit §3 — channel economics + packaging cost + per-item modifiers.
  deliveryOnly: z.boolean().nullable().optional(),
  packagingCost: grosze.max(5_000).nullable().optional(),
  modifierGroups: z.array(modifierGroupSchema).max(8).nullable().optional(),
  // Standardised per-product fields — every menu item exposes the same
  // editable surface on /admin/menu, including SKU, category, and tags.
  sku: z.string().min(1).max(60).nullable().optional(),
  category: menuCategoryEnum.nullable().optional(),
  tags: z.array(menuTagEnum).max(8).nullable().optional(),
  // Soft-delete for seed rows — `true` hides from customer + admin lists,
  // `null` / unset restores. Custom rows hard-delete via the custom API.
  hidden: z.boolean().nullable().optional(),
  // Audit §11.1 — per-item regulatory disclosures.
  halalStatus: halalStatusEnum.nullable().optional(),
  nutriGrade: nutriGradeEnum.nullable().optional(),
  containsPork: z.boolean().nullable().optional(),
  containsAlcohol: z.boolean().nullable().optional(),
  // Per-portion kcal override (NYC §81.50, EU 1169 opt-in).
  calories: z.number().int().min(0).max(5_000).nullable().optional(),
  // EU 1169/2011 + FDA Big-9 allergens. `null` clears the override
  // (falls back to kodawari seed); `[]` declares "no major allergens"
  // explicitly. Capped at 14 (the full Allergen union from data/types).
  allergens: z.array(allergenEnum).max(14).nullable().optional(),
});

/**
 * PUT /api/admin/menu — single override (id + fields) or bulk
 * ({items: {id: fields}}). Refined so the caller picks exactly one shape.
 */
export const menuOverridePutSchema = z
  .object({
    id: stableId.optional(),
    items: z.record(stableId, menuOverrideEditSchema).optional(),
    price: grosze.max(100_000).optional(),
    cost: grosze.max(100_000).optional(),
    available: z.boolean().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    menuRole: menuRoleEnum.nullable().optional(),
    isLimited: z.boolean().nullable().optional(),
    limitedUntil: isoDate.nullable().optional(),
    deliveryOnly: z.boolean().nullable().optional(),
    packagingCost: grosze.max(5_000).nullable().optional(),
    modifierGroups: z.array(modifierGroupSchema).max(8).nullable().optional(),
    sku: z.string().min(1).max(60).nullable().optional(),
    category: menuCategoryEnum.nullable().optional(),
    tags: z.array(menuTagEnum).max(8).nullable().optional(),
    hidden: z.boolean().nullable().optional(),
    halalStatus: halalStatusEnum.nullable().optional(),
    nutriGrade: nutriGradeEnum.nullable().optional(),
    containsPork: z.boolean().nullable().optional(),
    containsAlcohol: z.boolean().nullable().optional(),
    calories: z.number().int().min(0).max(5_000).nullable().optional(),
    allergens: z.array(allergenEnum).max(14).nullable().optional(),
  })
  .refine((data) => !!data.id || !!data.items, {
    message: "Provide either `id` for single override or `items` map for bulk",
    path: ["id"],
  });

/** Patch shape for the bulk-edit action — the field-by-field subset of
 *  menuOverrideEditSchema that we allow operators to set in one go. Each
 *  field is optional; only the keys actually present are applied. Identity
 *  fields (name, sku, hidden) are intentionally excluded — those make no
 *  sense as a chain-wide bulk patch. */
const menuBulkEditPatchSchema = z
  .object({
    price: grosze.max(100_000).optional(),
    cost: grosze.max(100_000).optional(),
    available: z.boolean().optional(),
    description: z.string().max(1000).optional(),
    category: menuCategoryEnum.optional(),
    tags: z.array(menuTagEnum).max(8).optional(),
    menuRole: menuRoleEnum.nullable().optional(),
    isLimited: z.boolean().nullable().optional(),
    limitedUntil: isoDate.nullable().optional(),
    deliveryOnly: z.boolean().nullable().optional(),
    packagingCost: grosze.max(5_000).nullable().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: "patch must contain at least one field",
  });

/** POST /api/admin/menu/bulk — reset overrides, clone across locations,
 *  bulk-edit fields, or bulk-delete (custom items hard-delete; seed items
 *  soft-hide via override). `scope` controls cross-location fan-out for
 *  `edit` and `delete`: "current" touches just the given ids, "all" also
 *  resolves the matching twin in every other active location (matched
 *  case-insensitively by item name). Defaults to "current". */
export const menuBulkActionSchema = z
  .object({
    action: z.enum(["reset", "clone_to", "delete", "edit"]),
    ids: z.array(stableId).min(1).max(500),
    target: locationSlug.optional(),
    scope: z.enum(["current", "all"]).optional(),
    patch: menuBulkEditPatchSchema.optional(),
  })
  .refine((data) => data.action !== "clone_to" || !!data.target, {
    message: "clone_to requires a `target` location slug",
    path: ["target"],
  })
  .refine((data) => data.action !== "edit" || !!data.patch, {
    message: "edit requires a `patch` object",
    path: ["patch"],
  });

// --- Admin: custom menu items --------------------------------------------
//
// Operators can add SKUs alongside the static seed catalogue (regional
// LTOs, franchisee one-offs, market-day specials). Stored in
// `custom-menu-items.json` and merged into getMenuWithOverrides().

/** POST /api/admin/menu/custom — create a new admin-managed menu item. */
export const customMenuItemCreateSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, digits, and hyphens only"),
  locationSlug,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  price: grosze.max(100_000),
  cost: grosze.max(100_000),
  category: menuCategoryEnum,
  tags: z.array(menuTagEnum).max(8).default([]),
  available: z.boolean().default(true),
  deliveryOnly: z.boolean().optional(),
  packagingCost: grosze.max(5_000).optional(),
  modifierGroups: z.array(modifierGroupSchema).max(8).optional(),
  sku: z.string().max(60).optional(),
  // Audit §11.1 — per-item regulatory disclosures, mirrored from the
  // override schema so custom items can carry the same fields without
  // going through /api/admin/menu PUT first.
  halalStatus: halalStatusEnum.optional(),
  nutriGrade: nutriGradeEnum.optional(),
  containsPork: z.boolean().optional(),
  containsAlcohol: z.boolean().optional(),
  calories: z.number().int().min(0).max(5_000).optional(),
  allergens: z.array(allergenEnum).max(14).optional(),
});

/** PATCH /api/admin/menu/custom — partial edit of an admin-created item.
 *  `newId` triggers a rename: the row's id is replaced atomically while
 *  preserving createdAt/locationSlug. */
export const customMenuItemUpdateSchema = z.object({
  newId: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, digits, and hyphens only")
    .optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  price: grosze.max(100_000).optional(),
  cost: grosze.max(100_000).optional(),
  category: menuCategoryEnum.optional(),
  tags: z.array(menuTagEnum).max(8).optional(),
  available: z.boolean().optional(),
  deliveryOnly: z.boolean().optional(),
  packagingCost: grosze.max(5_000).optional(),
  modifierGroups: z.array(modifierGroupSchema).max(8).optional(),
  sku: z.string().max(60).optional(),
  halalStatus: halalStatusEnum.nullable().optional(),
  nutriGrade: nutriGradeEnum.nullable().optional(),
  containsPork: z.boolean().nullable().optional(),
  containsAlcohol: z.boolean().nullable().optional(),
  calories: z.number().int().min(0).max(5_000).nullable().optional(),
  allergens: z.array(allergenEnum).max(14).nullable().optional(),
});

// --- Admin: users (RBAC) -------------------------------------------------

export const adminRoleSchema = z.enum(["owner", "manager", "staff", "kitchen"]);
export const adminUserStatusSchema = z.enum(["active", "disabled"]);

/** POST + PUT /api/admin/users — upsert an operator account. */
export const adminUserUpsertSchema = z.object({
  id: stableId.optional(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(254).optional(),
  role: adminRoleSchema,
  status: adminUserStatusSchema,
  locationSlug: locationSlug.optional(),
  // Multi-location scope (a manager can run several sites). An array sets the
  // exact set, null clears it, omitted leaves it untouched.
  locationSlugs: z.array(locationSlug).max(50).nullable().optional(),
  notes: z.string().max(2000).optional(),
  /**
   * Granular permission grant (action-level keys). An array sets a custom
   * grant, `null` clears it back to role defaults, omitted leaves it
   * untouched. Each entry must be a known permission key.
   */
  permissions: z
    .array(z.string().refine(isPermissionKey, "Unknown permission key"))
    .max(200)
    .nullable()
    .optional(),
});

// --- Admin: settings (brand-level) ---------------------------------------

/**
 * PUT /api/admin/settings — the settings shape is open-ended (brand fields,
 * feature flags, theme, etc.). We accept any JSON object and let the
 * store apply its own merge semantics. The size cap (10 KB stringified)
 * keeps a malicious client from blasting megabytes into kv_store.
 */
export const settingsUpdateSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => JSON.stringify(obj).length <= 10_000, {
    message: "Settings payload must be ≤ 10 KB stringified",
  });

// --- Admin: GDPR ---------------------------------------------------------

/** POST /api/admin/gdpr/delete — irreversible. `confirm: true` is mandatory. */
export const gdprDeleteSchema = z.object({
  phone: phoneInput,
  confirm: z.literal(true),
});

// --- Public: admin login -------------------------------------------------

/** POST /api/admin/login — shared password + optional bound email. */
export const adminLoginSchema = z.object({
  password: z.string().min(1).max(500),
  email: z.string().email().max(254).optional().or(z.literal("")),
  // Optional 6-digit TOTP code, required only when the resolved account (or the
  // shared session via ADMIN_TOTP_SECRET) has MFA enabled.
  totp: z.string().regex(/^\d{6}$/).optional().or(z.literal("")),
});

// --- Helpers -------------------------------------------------------------

/**
 * Parse a Next.js request body against a schema. On success returns
 * `{data}` with the validated value. On failure returns `{error}` — a
 * 400 NextResponse with a `details` array describing each field-level
 * issue. Drop in at the top of any handler:
 *
 *   const parsed = await parseBody(req, mySchema);
 *   if ("error" in parsed) return parsed.error;
 *   const body = parsed.data;
 */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    // z.ZodError.issues is the stable shape: { path: (string|number)[], message: string, code: string }
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
    return {
      error: NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}
