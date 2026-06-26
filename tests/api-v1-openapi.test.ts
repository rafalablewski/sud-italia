import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";
import {
  OrderSchema,
  LoginBodySchema,
  OrderStatusPatchSchema,
} from "@/lib/api/v1/schemas";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import type { Order, MenuItem, CartItem } from "@/data/types";

// Run with:  npx tsx --test tests/api-v1-openapi.test.ts
//
// The contract is the seam the iOS apps are generated from — these lock its
// coherence (no dangling refs), the request schemas, the mapper↔schema
// agreement, and that the committed docs/native/openapi.json isn't stale.

test("OpenAPI document: every $ref resolves", () => {
  const doc = buildOpenApiDocument() as {
    components: { schemas: Record<string, unknown> };
  };
  const names = Object.keys(doc.components.schemas);
  const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/([A-Za-z]+)/g)].map(
    (m) => m[1],
  );
  const dangling = [...new Set(refs)].filter((r) => !names.includes(r));
  assert.deepEqual(dangling, [], `dangling refs: ${dangling.join(", ")}`);
  // The seven named schemas the apps decode.
  for (const s of ["ErrorEnvelope", "TokenPair", "User", "Location", "MenuItem", "OrderLine", "Order"]) {
    assert.ok(names.includes(s), `missing schema ${s}`);
  }
});

test("OpenAPI document: expected operations are present", () => {
  const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };
  assert.ok(doc.paths["/auth/login"].post);
  assert.ok(doc.paths["/orders"].get);
  assert.ok(doc.paths["/orders/{id}"].patch);
  assert.ok(doc.paths["/orders/stream"].get);
});

test("committed docs/native/openapi.json is in sync (run `npm run gen:openapi`)", () => {
  const committed = JSON.parse(
    readFileSync(join(process.cwd(), "docs", "native", "openapi.json"), "utf8"),
  );
  assert.deepEqual(committed, buildOpenApiDocument(), "openapi.json is stale — regenerate it");
});

test("request schemas validate + reject", () => {
  assert.equal(LoginBodySchema.safeParse({ password: "x" }).success, true);
  assert.equal(LoginBodySchema.safeParse({}).success, false); // password required
  assert.equal(LoginBodySchema.safeParse({ password: "x", email: "not-an-email" }).success, false);
  assert.equal(OrderStatusPatchSchema.safeParse({ status: "ready" }).success, true);
  assert.equal(OrderStatusPatchSchema.safeParse({ status: "teleported" }).success, false);
});

test("mapper output satisfies the published Order schema (runtime drift guard)", () => {
  const menuItem = {
    id: "pizza-margherita",
    name: "Margherita",
    description: "",
    price: 2790,
    cost: 900,
    category: "pizza",
    tags: [],
    available: true,
  } as MenuItem;
  const order = {
    id: "ord_1",
    locationSlug: "krakow",
    items: [{ menuItem, quantity: 2, locationSlug: "krakow", notes: "no basil" } as CartItem],
    totalAmount: 5580,
    status: "preparing",
    customerName: "Ada",
    customerPhone: "+48500100200",
    fulfillmentType: "takeout",
    slotId: "s1",
    slotDate: "2026-06-26",
    slotTime: "18:00",
    createdAt: "2026-06-26T16:00:00.000Z",
  } as Order;

  const parsed = OrderSchema.safeParse(toOrderDTO(order));
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
});
