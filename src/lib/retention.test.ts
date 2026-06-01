import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWinBackQueue, recommendBonusPoints, type RetentionConsent } from "./retention";
import type { IntelOrder } from "./customer-intelligence";

// Run with:  npx tsx --test src/lib/retention.test.ts

const NOW = new Date("2025-10-01T12:00:00Z");

/** `count` weekly orders ending `lastDaysAgo` before NOW, each `total` grosze. */
function weekly(phone: string, count: number, lastDaysAgo: number, total: number): IntelOrder[] {
  const out: IntelOrder[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = lastDaysAgo + (count - 1 - i) * 7;
    const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
    out.push({
      customerPhone: phone,
      items: [{ menuItem: { name: "Margherita", category: "pizza" }, quantity: 1 }],
      totalAmount: total,
      status: "completed",
      fulfillmentType: "delivery",
      createdAt: at,
      paidAt: at,
    });
  }
  return out;
}

function consent(map: Record<string, RetentionConsent>): Map<string, RetentionConsent> {
  return new Map(Object.entries(map));
}

test("recommendBonusPoints ladder scales with lifetime spend", () => {
  assert.equal(recommendBonusPoints(40_000), 120);
  assert.equal(recommendBonusPoints(20_000), 80);
  assert.equal(recommendBonusPoints(8_000), 50);
  assert.equal(recommendBonusPoints(2_000), 30);
});

test("queue includes only lapsed/high-risk guests, ranked by value-at-risk", () => {
  const big = weekly("+48500000001", 6, 120, 6_000); // lapsed, lifetime 36k
  const small = weekly("+48500000002", 3, 120, 2_000); // lapsed, lifetime 6k
  const regular = weekly("+48500000003", 6, 3, 6_000); // on cadence — excluded
  const q = buildWinBackQueue({
    orders: [...big, ...small, ...regular],
    consentByPhone: consent({}),
    now: NOW,
  });
  const phones = q.candidates.map((c) => c.phone);
  assert.ok(phones.includes("+48500000001"));
  assert.ok(phones.includes("+48500000002"));
  assert.ok(!phones.includes("+48500000003"), "on-cadence regular must not be queued");
  // big spender ranks first (higher value-at-risk)
  assert.equal(q.candidates[0].phone, "+48500000001");
  assert.ok(q.candidates[0].valueAtRiskGrosze > q.candidates[1].valueAtRiskGrosze);
  assert.equal(q.candidates[0].bonusPoints, 120);
});

test("channel recommendation respects per-channel consent", () => {
  const a = weekly("+48500000001", 4, 120, 6_000);
  const b = weekly("+48500000002", 4, 120, 6_000);
  const d = weekly("+48500000003", 4, 120, 6_000);
  const q = buildWinBackQueue({
    orders: [...a, ...b, ...d],
    consentByPhone: consent({
      "+48500000001": { name: "Ada", smsOptout: false }, // sms ok
      "+48500000002": { name: "Bo", smsOptout: true, email: "bo@x.io", emailOptout: false }, // email ok
      "+48500000003": { name: "Cy", smsOptout: true }, // no consented channel
    }),
    now: NOW,
  });
  const byPhone = new Map(q.candidates.map((c) => [c.phone, c]));
  assert.equal(byPhone.get("+48500000001")?.channel, "sms");
  assert.equal(byPhone.get("+48500000002")?.channel, "email");
  assert.equal(byPhone.get("+48500000003")?.channel, null);
  assert.equal(q.summary.reachable, 2);
  assert.equal(q.summary.needsConsent, 1);
});

test("cooldown excludes guests contacted recently", () => {
  const a = weekly("+48500000001", 4, 120, 6_000);
  const recent = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
  const q = buildWinBackQueue({
    orders: a,
    consentByPhone: consent({ "+48500000001": { name: "Ada", smsOptout: false } }),
    lastContactedByPhone: new Map([["+48500000001", recent]]),
    cooldownDays: 30,
    now: NOW,
  });
  assert.equal(q.candidates.length, 0, "contacted 5d ago, 30d cooldown → excluded");
});

test("drafted message names the guest and their go-to dish", () => {
  const a = weekly("+48500000001", 5, 120, 6_000);
  const q = buildWinBackQueue({
    orders: a,
    consentByPhone: consent({ "+48500000001": { name: "Ada Nowak", smsOptout: false } }),
    now: NOW,
  });
  const c = q.candidates[0];
  assert.match(c.message, /Ada/);
  assert.match(c.message, /Margherita/);
  assert.match(c.message, new RegExp(String(c.bonusPoints)));
});

test("minLifetimeSpend floor filters low-value lapsed guests", () => {
  const small = weekly("+48500000002", 2, 120, 2_000); // lifetime 4k
  const q = buildWinBackQueue({
    orders: small,
    consentByPhone: consent({}),
    minLifetimeSpendGrosze: 5_000,
    now: NOW,
  });
  assert.equal(q.candidates.length, 0);
});
