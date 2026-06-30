import { z, type ZodType } from "zod";
import { API_VERSION } from "./envelope";
import {
  apiRegistry,
  LoginBodySchema,
  RefreshBodySchema,
  LogoutBodySchema,
  OrderStatusPatchSchema,
  CustomerAuthRequestSchema,
  CustomerAuthVerifySchema,
  OrderCreateSchema,
  UpsellRequestSchema,
} from "./schemas";

/**
 * Builds the `/api/v1` OpenAPI 3.1 document FROM the Zod contract (schemas.ts).
 * Component schemas come from the registry (shared `$ref`s); request bodies are
 * converted inline. Hand-authored here are only the things Zod can't express:
 * the path/operation wiring, security, and prose. Result is the codegen source
 * for the Swift `CoreModels` package (swift-openapi-generator).
 */

type JsonObject = Record<string, unknown>;

/** Strip JSON-Schema-only keys OpenAPI 3.1 components don't want. */
function clean(schema: JsonObject): JsonObject {
  const { $schema: _s, $id: _i, ...rest } = schema;
  void _s;
  void _i;
  return rest;
}

/** Inline a single schema (request bodies) generated straight from Zod. */
function inline(schema: ZodType): JsonObject {
  return clean(z.toJSONSchema(schema, { target: "draft-2020-12" }) as JsonObject);
}

function componentSchemas(): JsonObject {
  const out = z.toJSONSchema(apiRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: "draft-2020-12",
  }) as { schemas: Record<string, JsonObject> };
  const cleaned: JsonObject = {};
  for (const [id, schema] of Object.entries(out.schemas)) cleaned[id] = clean(schema);
  return cleaned;
}

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });

const ERROR_RESPONSE = {
  description: "Error envelope",
  content: { "application/json": { schema: ref("ErrorEnvelope") } },
};

/** A success envelope wrapping `data` (+ optional `meta`). */
function dataResponse(description: string, data: object, withMeta = false) {
  const properties: JsonObject = { data };
  if (withMeta) properties.meta = { type: "object" };
  return {
    description,
    content: { "application/json": { schema: { type: "object", properties } } },
  };
}

function jsonBody(schema: ZodType) {
  return { required: true, content: { "application/json": { schema: inline(schema) } } };
}

export function buildOpenApiDocument(): JsonObject {
  return {
    openapi: "3.1.0",
    info: {
      title: "Ottaviano API",
      version: "1.0.0",
      description:
        "Versioned facade consumed by the Ottaviano (customer) and OttavianoKDS " +
        "(operator) native apps. GENERATED from the server Zod contract " +
        "(src/lib/api/v1/schemas.ts). Additive-only within v1; breaking changes " +
        "mint v2. Every response uses one envelope: { data, meta? } | { error }.",
    },
    servers: [{ url: "/api/v1", description: "v1 facade (relative — host-portable)" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: componentSchemas(),
    },
    paths: {
      "/auth/login": {
        post: {
          summary: "Operator sign-in → token pair",
          requestBody: jsonBody(LoginBodySchema),
          responses: {
            "200": dataResponse("Tokens + user", {
              allOf: [ref("TokenPair"), { type: "object", properties: { user: ref("User") } }],
            }),
            "401": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
            "429": ERROR_RESPONSE,
          },
        },
      },
      "/auth/refresh": {
        post: {
          summary: "Rotate refresh token → new pair",
          requestBody: jsonBody(RefreshBodySchema),
          responses: { "200": dataResponse("New token pair", ref("TokenPair")), "401": ERROR_RESPONSE },
        },
      },
      "/auth/logout": {
        post: {
          summary: "Revoke a refresh token",
          requestBody: jsonBody(LogoutBodySchema),
          responses: { "200": { description: "Revoked" } },
        },
      },
      "/auth/me": {
        get: {
          summary: "Current operator",
          security: [{ bearerAuth: [] }],
          responses: { "200": dataResponse("User", ref("User")), "401": ERROR_RESPONSE },
        },
      },
      "/customer/auth/request": {
        post: {
          summary: "Send a phone login code (customer app)",
          requestBody: jsonBody(CustomerAuthRequestSchema),
          responses: {
            "200": dataResponse("Code sent (devCode present only in non-prod with no SMS provider)", {
              type: "object",
            }),
            "422": ERROR_RESPONSE,
            "429": ERROR_RESPONSE,
          },
        },
      },
      "/customer/auth/verify": {
        post: {
          summary: "Verify code → customer token pair",
          requestBody: jsonBody(CustomerAuthVerifySchema),
          responses: {
            "200": dataResponse("Tokens + customer", {
              allOf: [
                ref("TokenPair"),
                { type: "object", properties: { customer: { type: "object" } } },
              ],
            }),
            "401": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
          },
        },
      },
      "/customer/me": {
        get: {
          summary: "Signed-in customer profile + loyalty",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": dataResponse("Customer profile", ref("CustomerProfile")),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
      },
      "/customer/orders": {
        get: {
          summary: "The customer's own orders (history + active)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": dataResponse("Orders, newest first", { type: "array", items: ref("Order") }, true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
      },
      "/customer/orders/{id}": {
        get: {
          summary: "One of the customer's own orders (ownership-gated)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Order", ref("Order")),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
          },
        },
      },
      "/customer/orders/{id}/stream": {
        get: {
          summary: "Live order tracking (SSE; Bearer header)",
          description:
            "SSE; each `data:` frame is { order: Order }. Ownership-gated. Powers the " +
            "order tracker / Live Activity.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "text/event-stream of { order }" },
            "401": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
          },
        },
      },
      "/locations": {
        get: {
          summary: "Active locations (public)",
          responses: {
            "200": dataResponse("Locations", { type: "array", items: ref("Location") }),
          },
        },
      },
      "/menu": {
        get: {
          summary: "Menu for a location (public)",
          parameters: [
            {
              name: "location",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Location slug, e.g. krakow",
            },
          ],
          responses: {
            "200": dataResponse("Menu items", { type: "array", items: ref("MenuItem") }, true),
            "400": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
          },
        },
      },
      "/settings/public": {
        get: {
          summary: "Public storefront programme config (public)",
          description:
            "Loyalty tier ladder + rewards catalogue + referral, the combo-deal ladder, and the speed-guarantee / delivery / tip / min-order config the customer app's Menu, Cart and Rewards surfaces read. Operator-tuned; ships customer copy only.",
          responses: {
            "200": dataResponse("Public settings", ref("PublicSettings")),
            "500": ERROR_RESPONSE,
          },
        },
      },
      "/upsell": {
        post: {
          summary: "Cross-sell suggestions for a cart (public)",
          description:
            "Runs the storefront getCartSuggestions engine over the live menu — the customer twin of the staff POS suggestions panel. Body `{ locationSlug, itemIds }`.",
          requestBody: jsonBody(UpsellRequestSchema),
          responses: {
            "200": dataResponse("Suggestions", { type: "array", items: ref("UpsellSuggestion") }, true),
            "400": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
          },
        },
      },
      "/orders": {
        get: {
          summary: "Operator order board (location-scoped)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "location", in: "query", required: false, schema: { type: "string" } },
            { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": dataResponse("Orders, newest first", { type: "array", items: ref("Order") }, true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
        post: {
          summary: "Create an order (customer app / guest) — server-priced, idempotent",
          description:
            "Zero-friction: no auth required (guest supplies name+phone); a customer " +
            "Bearer token supplies the phone instead. Pass an Idempotency-Key header to " +
            "make retries safe. Created unpaid; payment is a later increment.",
          requestBody: jsonBody(OrderCreateSchema),
          responses: {
            "201": dataResponse("Created order", ref("Order"), true),
            "200": dataResponse("Existing order (idempotent replay)", ref("Order"), true),
            "409": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
            "429": ERROR_RESPONSE,
          },
        },
      },
      "/orders/{id}": {
        get: {
          summary: "Order detail (location-scoped)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Order", ref("Order")),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
          },
        },
        patch: {
          summary: "Advance order status (KDS bump) — idempotent",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody(OrderStatusPatchSchema),
          responses: {
            "200": dataResponse("Updated order (meta.changed=false on a no-op)", ref("Order"), true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
          },
        },
      },
      "/orders/{id}/recall": {
        post: {
          summary: "Recall a mis-bumped order (completed → ready)",
          description:
            "Un-bump a fat-fingered completion so the ticket reappears on the expo " +
            "column. Only completed orders are recallable; otherwise 409.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Recalled order", ref("Order"), true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
            "409": ERROR_RESPONSE,
          },
        },
      },
      "/orders/{id}/settle": {
        post: {
          summary: "Mark an order paid (counter settle) — idempotent",
          description:
            "Stamps paidAt (cash / terminal at the counter) and confirms a pending " +
            "order so it fires. meta.changed=false when already paid.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Settled order (meta.changed=false if already paid)", ref("Order"), true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
          },
        },
      },
      "/orders/{id}/receipt": {
        post: {
          summary: "Render/print a thermal receipt",
          description:
            "mode=printed when a printer host is configured, else mode=simulated " +
            "with the exact plain-text preview the app can show or share.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Receipt result", {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["printed", "simulated"] },
                bytes: { type: "integer" },
                preview: { type: "string" },
                printer: { type: "string" },
              },
            }),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "404": ERROR_RESPONSE,
            "503": ERROR_RESPONSE,
          },
        },
      },
      "/admin/kds/fleet": {
        get: {
          summary: "Owner fleet board (Atlas) — cross-truck KDS health",
          description:
            "Live KDS health for every active truck: counts, predicted-ready/at-risk, " +
            "capacity-vs-demand pace, rate metrics, promise accuracy + on-shift, and a " +
            "fleet benchmark. Owner-level; respects token scope. Inherently cross-location.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "includeSimulated", in: "query", required: false, schema: { type: "string", enum: ["1"] } },
          ],
          responses: {
            "200": dataResponse("Fleet board", ref("FleetBoard"), true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
      },
      "/admin/floor/tables": {
        get: {
          summary: "Floor tables for the POS dine-in table picker",
          description:
            "Read-only list of a location's floor tables (id, number, seats, zone, " +
            "status). Staff+; location-scoped + required. Twin of web /api/admin/floor/tables.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "location", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": dataResponse("Floor tables", { type: "array", items: ref("FloorTable") }, true),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
          },
        },
      },
      "/admin/kds/floor-ops": {
        get: {
          summary: "Manager KDS floor-ops header (throughput + on-shift)",
          description:
            "Throughput (orders completed in the last 60 min) + staff on the clock for " +
            "the KDS KPI strip. Manager+; honors scope. With ?location= it reflects that " +
            "truck; without one it aggregates across the operator's scoped locations.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "location", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            "200": dataResponse("Floor-ops signals", ref("FloorOps")),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
      },
      "/admin/pos/suggestions": {
        post: {
          summary: "Cross-sell suggestions for a POS ticket",
          description:
            "Runs the storefront getCartSuggestions engine over the ticket's item " +
            "ids against the live menu. Body { locationSlug, itemIds }.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": dataResponse(
              "Suggested items",
              {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    price: { type: "integer" },
                    reason: { type: "string" },
                  },
                },
              },
              true,
            ),
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
            "422": ERROR_RESPONSE,
          },
        },
      },
      "/orders/{id}/payment-intent": {
        post: {
          summary: "Start payment for an order (Stripe PaymentIntent / Apple Pay)",
          description:
            "Creates a Stripe PaymentIntent for the order's server-authoritative total " +
            "and returns the client secret for the iOS PaymentSheet (Apple Pay + cards). " +
            "Idempotent per order. Webhook payment_intent.succeeded marks the order paid.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": dataResponse("Payment intent", ref("PaymentIntent")),
            "404": ERROR_RESPONSE,
            "409": ERROR_RESPONSE,
            "503": ERROR_RESPONSE,
          },
        },
      },
      "/orders/stream": {
        get: {
          summary: "Live operator board (Server-Sent Events; Bearer header)",
          description:
            "SSE stream; each `data:` frame is { orders: Order[] }. Location-scoped " +
            "like /orders. The native app reads it as an AsyncSequence.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "location", in: "query", required: false, schema: { type: "string" } }],
          responses: {
            "200": { description: "text/event-stream of { orders }" },
            "401": ERROR_RESPONSE,
            "403": ERROR_RESPONSE,
          },
        },
      },
      "/openapi.json": {
        get: { summary: "This document", responses: { "200": { description: "OpenAPI 3.1" } } },
      },
    },
    "x-ottaviano-api-version": API_VERSION,
  };
}
