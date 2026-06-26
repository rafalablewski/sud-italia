import { NextResponse } from "next/server";
import { API_VERSION } from "@/lib/api/v1/envelope";

/**
 * `GET /api/v1/openapi.json` — the machine-readable contract for the native
 * apps. This is the **single source of truth** the Swift `CoreModels` package is
 * generated from (Apple's swift-openapi-generator), so the wire types can't
 * drift from the app's models (ARCHITECTURE §5). Hand-authored for now; a later
 * Stage-2 task derives it from the server Zod schemas (DECISION B).
 *
 * Served raw (not enveloped) — it's a standard OpenAPI document, consumed by
 * tooling, not by app feature code.
 */

const ERROR_RESPONSE = {
  description: "Error envelope",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Ottaviano API",
    version: "1.0.0",
    description:
      "Versioned facade consumed by the Ottaviano (customer) and OttavianoKDS " +
      "(operator) native apps. Additive-only within v1; breaking changes mint v2. " +
      "All responses use a single envelope: { data, meta? } | { error }.",
  },
  servers: [{ url: "/api/v1", description: "v1 facade (relative — host-portable)" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "bad_request",
                  "unauthorized",
                  "forbidden",
                  "not_found",
                  "conflict",
                  "rate_limited",
                  "validation_failed",
                  "internal",
                ],
              },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      TokenPair: {
        type: "object",
        required: ["accessToken", "refreshToken", "expiresIn", "tokenType"],
        properties: {
          accessToken: { type: "string", description: "HS256 JWT, ~15 min" },
          refreshToken: { type: "string", description: "Opaque, rotating, 30 days" },
          expiresIn: { type: "integer", description: "Access-token TTL (seconds)" },
          refreshExpiresIn: { type: "integer" },
          tokenType: { type: "string", enum: ["Bearer"] },
        },
      },
      User: {
        type: "object",
        required: ["id", "role", "scope"],
        properties: {
          id: { type: "string" },
          name: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          role: { type: "string" },
          scope: { type: "string", description: '"*" or comma-joined location slugs' },
        },
      },
      Location: {
        type: "object",
        required: ["slug", "name", "city", "currency"],
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          coordinates: {
            type: "object",
            properties: { lat: { type: "number" }, lng: { type: "number" } },
          },
          heroImage: { type: "string" },
          shortDescription: { type: "string" },
          hours: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string" },
                open: { type: "string" },
                close: { type: "string" },
              },
            },
          },
          currency: { type: "string", enum: ["PLN"] },
          servesAlcohol: { type: "boolean" },
          teamLead: { type: ["string", "null"] },
        },
      },
      MenuItem: {
        type: "object",
        required: ["id", "name", "price", "currency", "category", "available"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "integer", description: "Minor units (grosze)" },
          currency: { type: "string", enum: ["PLN"] },
          category: { type: "string" },
          image: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          available: { type: "boolean" },
          menuRole: { type: ["string", "null"] },
          allergens: { type: "array", items: { type: "string" } },
          prepTimeMinutes: { type: ["integer", "null"] },
          isLimited: { type: "boolean" },
          deliveryOnly: { type: "boolean" },
          disclosures: {
            type: "object",
            properties: {
              halalStatus: { type: ["string", "null"] },
              nutriGrade: { type: ["string", "null"] },
              containsPork: { type: "boolean" },
              containsAlcohol: { type: "boolean" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/auth/login": {
      post: {
        summary: "Operator sign-in → token pair",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                  totp: { type: "string" },
                  app: { type: "string", enum: ["ottaviano", "ottaviano-kds"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Tokens + user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/TokenPair" },
                        {
                          type: "object",
                          properties: { user: { $ref: "#/components/schemas/User" } },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "401": ERROR_RESPONSE,
          "422": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotate refresh token → new pair",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "New token pair",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/TokenPair" } },
                },
              },
            },
          },
          "401": ERROR_RESPONSE,
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Revoke a refresh token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Revoked" } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Current operator",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "401": ERROR_RESPONSE,
        },
      },
    },
    "/locations": {
      get: {
        summary: "Active locations (public)",
        responses: {
          "200": {
            description: "Locations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Location" } },
                  },
                },
              },
            },
          },
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
          "200": {
            description: "Menu items",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/MenuItem" } },
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
          "400": ERROR_RESPONSE,
          "404": ERROR_RESPONSE,
        },
      },
    },
  },
} as const;

export function GET() {
  const res = NextResponse.json(spec);
  res.headers.set("X-Ottaviano-API", API_VERSION);
  res.headers.set("Cache-Control", "public, max-age=300");
  return res;
}
