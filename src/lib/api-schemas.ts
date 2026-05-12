import { z } from "zod";
import { NextResponse } from "next/server";

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
    fulfillmentType: z.enum(["takeout", "delivery"]),
    slotId: stableId,
    slotDate: isoDate,
    slotTime: wallTime,
    deliveryAddress: z.string().max(500).optional(),
    tipAmount: z.number().int().nonnegative().max(100_000).optional(),
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
  );

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

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
