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
