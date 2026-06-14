import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mergePosTab,
  savePosTab,
  getPosTab,
  getPosTabs,
  linkPosTabOrder,
  deletePosTab,
} from "./store";
import type { PosTab } from "@/data/types";

// Run with:  npx tsx --test src/lib/pos-tabs.test.ts
//
// Phase 3 (m3) — POS open checks split from one global `pos-tabs.json` blob into
// per-location keys. Two concerns are pinned here:
//   1. mergePosTab — the pure upsert/validation rules (server-owned fields,
//      sentKds-clears-on-edit), unchanged by the split.
//   2. per-location CRUD against the real FS store, using a unique throwaway
//      location slug so it never collides with seeded data or other tests.

// --- mergePosTab (pure) ---------------------------------------------------

test("mergePosTab mints an id and defaults a fresh check", () => {
  const tab = mergePosTab({ locationSlug: "krakow", name: "Window 1" }, undefined);
  assert.ok(tab.id);
  assert.equal(tab.locationSlug, "krakow");
  assert.equal(tab.name, "Window 1");
  assert.equal(tab.status, "open");
  assert.deepEqual(tab.items, []);
  assert.equal(tab.sentKds, false);
});

test("mergePosTab preserves server-owned orderId/firedCourses from existing", () => {
  const existing: PosTab = {
    id: "T1",
    locationSlug: "krakow",
    name: "Tab",
    channel: "dine-in",
    status: "pay",
    items: [],
    sentKds: true,
    orderId: "pos-abc",
    firedCourses: ["main"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  // A client PUT trying to forge orderId / firedCourses must be ignored.
  const merged = mergePosTab(
    { id: "T1", locationSlug: "krakow", orderId: "pos-HIJACK", firedCourses: ["dessert"] } as Partial<PosTab> & { locationSlug: string },
    existing,
  );
  assert.equal(merged.orderId, "pos-abc");
  assert.deepEqual(merged.firedCourses, ["main"]);
  assert.equal(merged.createdAt, existing.createdAt); // createdAt preserved
});

test("mergePosTab clears sentKds when the lines change", () => {
  const existing: PosTab = {
    id: "T2",
    locationSlug: "krakow",
    name: "Tab",
    channel: "takeout",
    status: "pay",
    items: [{ menuItemId: "krk-pizza-margherita", quantity: 1 }],
    sentKds: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  // Adding a line must un-send the check, even if the client still claims sentKds.
  const merged = mergePosTab(
    {
      id: "T2",
      locationSlug: "krakow",
      sentKds: true,
      items: [
        { menuItemId: "krk-pizza-margherita", quantity: 1 },
        { menuItemId: "krk-pizza-diavola", quantity: 1 },
      ],
    },
    existing,
  );
  assert.equal(merged.sentKds, false);
});

test("mergePosTab keeps sentKds when items are unchanged", () => {
  const existing: PosTab = {
    id: "T3",
    locationSlug: "krakow",
    name: "Tab",
    channel: "takeout",
    status: "pay",
    items: [{ menuItemId: "krk-pizza-margherita", quantity: 2 }],
    sentKds: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const merged = mergePosTab(
    { id: "T3", locationSlug: "krakow", items: [{ menuItemId: "krk-pizza-margherita", quantity: 2 }], sentKds: true },
    existing,
  );
  assert.equal(merged.sentKds, true);
});

// --- per-location CRUD (FS store) ----------------------------------------

test("per-location CRUD round-trips and stays scoped to its location", async () => {
  // Unique throwaway location so the test never touches real / seeded data.
  const loc = `test-loc-${randomUUID().slice(0, 8)}`;

  const created = await savePosTab({ locationSlug: loc, name: "Check A", status: "open", items: [] });
  assert.ok(created.id);

  // Readable by id (fast path: location supplied) and listed under its location.
  const fetched = await getPosTab(created.id, loc);
  assert.equal(fetched?.id, created.id);
  const list = await getPosTabs(loc);
  assert.deepEqual(
    list.map((t) => t.id),
    [created.id],
  );

  // A different location's list never sees it.
  const otherLoc = `test-loc-${randomUUID().slice(0, 8)}`;
  assert.deepEqual(await getPosTabs(otherLoc), []);

  // Server-side order link (the send/charge actuator path), location supplied.
  const linked = await linkPosTabOrder(created.id, { orderId: "pos-xyz", sentKds: true, status: "pay" }, loc);
  assert.equal(linked?.orderId, "pos-xyz");
  assert.equal(linked?.sentKds, true);

  // Delete removes it from its location's key.
  assert.equal(await deletePosTab(created.id, loc), true);
  assert.deepEqual(await getPosTabs(loc), []);
  // A second delete is a no-op (already gone).
  assert.equal(await deletePosTab(created.id, loc), false);
});

test("an edit (mustExist) NEVER resurrects a voided check", async () => {
  // The bug: a debounced/in-flight PUT that lands a beat AFTER the DELETE used
  // to re-insert the voided check via savePosTab's upsert, so it reappeared on
  // the next cross-till poll (after the client tombstone expired ~12s later).
  // An edit must be update-only: a save aimed at an already-voided id is dropped.
  const loc = `test-loc-${randomUUID().slice(0, 8)}`;

  const tab = await savePosTab({ locationSlug: loc, name: "Window 1", status: "open", items: [] });
  assert.equal(await deletePosTab(tab.id, loc), true);

  // Late edit lands after the void — must be a no-op (null), check stays gone.
  const stale = await savePosTab(
    {
      id: tab.id,
      locationSlug: loc,
      name: "Window 1",
      status: "open",
      items: [{ menuItemId: "krk-pizza-margherita", quantity: 1 }],
    },
    { mustExist: true },
  );
  assert.equal(stale, null);
  assert.deepEqual(await getPosTabs(loc), []);

  // A normal edit of a LIVE check still applies (the fix can't break editing).
  const live = await savePosTab({ locationSlug: loc, name: "Window 2", status: "open", items: [] });
  const edited = await savePosTab(
    { id: live.id, locationSlug: loc, items: [{ menuItemId: "krk-pizza-margherita", quantity: 3 }] },
    { mustExist: true },
  );
  assert.equal(edited?.items[0]?.quantity, 3);
  await deletePosTab(live.id, loc);
});
