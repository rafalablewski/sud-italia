import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedDrawerGrosze, cashVarianceGrosze } from "./cash-recon";
import type { CashDrop, CashSession } from "@/data/types";

// Run with:  npx tsx --test src/lib/cash-recon.test.ts
// All amounts are grosze (1 PLN = 100 grosze).

function drop(amountGrosze: number, kind: CashDrop["kind"] = "sale"): CashDrop {
  return { id: `d-${amountGrosze}-${kind}`, amountGrosze, kind, at: "2026-06-10T12:00:00.000Z" };
}

function session(openingFloat: number, drops: CashDrop[] = []): CashSession {
  return {
    id: "cash-1",
    locationSlug: "krakow",
    openedAt: "2026-06-10T08:00:00.000Z",
    openingFloat,
    openedBy: "Rafał Ablewski",
    drops,
  };
}

test("expected drawer with no drops is just the opening float", () => {
  assert.equal(expectedDrawerGrosze(session(20000)), 20000);
});

test("expected drawer adds the net of every drop (sales add, payouts subtract)", () => {
  // 200 PLN float + 150 PLN of sales − 50 PLN payout = 300 PLN.
  const s = session(20000, [drop(10000), drop(5000), drop(-5000, "payout")]);
  assert.equal(expectedDrawerGrosze(s), 30000);
});

test("variance is counted − expected: a perfectly counted drawer is zero", () => {
  const s = session(20000, [drop(10000)]); // expected 300 PLN
  assert.equal(cashVarianceGrosze(s, 30000), 0);
});

test("a short till reads negative, an over till reads positive", () => {
  const s = session(20000, [drop(10000)]); // expected 30000
  assert.equal(cashVarianceGrosze(s, 29500), -500); // 5 PLN missing
  assert.equal(cashVarianceGrosze(s, 30500), 500); // 5 PLN over
});

test("variance against an empty drawer equals the counted amount", () => {
  // No float, no drops — anything counted is pure over.
  assert.equal(cashVarianceGrosze(session(0), 1234), 1234);
});

test("net-zero drops (sale then equal payout) leave expected at the float", () => {
  const s = session(15000, [drop(8000, "sale"), drop(-8000, "payout")]);
  assert.equal(expectedDrawerGrosze(s), 15000);
  assert.equal(cashVarianceGrosze(s, 15000), 0);
});
