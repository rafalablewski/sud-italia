import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlPhoneE164, phonesEqualPl, sumManualPointsForPhone } from "./phone";

// Run with:  npx tsx --test src/lib/phone.test.ts
// Manual loyalty points are keyed by whatever phone string was stored at the
// time. If normalization/summation drops a legacy key, a customer silently
// loses points — so the matching rule is a money path.

test("normalizes every common PL mobile variant to the same E.164", () => {
  for (const v of ["662123456", "0662123456", "48662123456", "+48662123456", "+48 662 123 456", "+48 662-123-456", "0048662123456"]) {
    assert.equal(normalizePlPhoneE164(v), "+48662123456", `failed on ${v}`);
  }
});

test("rejects numbers that aren't a 9-digit PL mobile", () => {
  assert.equal(normalizePlPhoneE164(""), null);
  assert.equal(normalizePlPhoneE164("12345"), null); // too short
  assert.equal(normalizePlPhoneE164("abc"), null); // no digits
  assert.equal(normalizePlPhoneE164("6621234567"), null); // 10 digits, not 0-prefixed
});

test("phonesEqualPl matches across formats, and falls back to trim-compare for non-PL", () => {
  assert.ok(phonesEqualPl("0662123456", "+48662123456"));
  assert.ok(!phonesEqualPl("662123456", "662999999"));
  // Both un-normalizable → exact trim compare (so foreign numbers still match themselves).
  assert.ok(phonesEqualPl("  +1 555 0100 ", "+1 555 0100"));
  assert.ok(!phonesEqualPl("+1 555 0100", "+1 555 0199"));
});

test("sums manual points across every legacy key that is the same PL mobile", () => {
  const totals = {
    "+48662123456": 50,
    "0662123456": 20, // same person, legacy format
    "662123456": 5, // same person, bare national
    "+48700000000": 999, // someone else — must NOT be counted
  };
  assert.equal(sumManualPointsForPhone("662123456", totals), 75);
});

test("a phone with no stored adjustments sums to zero", () => {
  assert.equal(sumManualPointsForPhone("662123456", { "+48700000000": 40 }), 0);
});

test("negative adjustments (manual deductions) net correctly", () => {
  const totals = { "+48662123456": 100, "0662123456": -30 };
  assert.equal(sumManualPointsForPhone("+48 662 123 456", totals), 70);
});

test("an un-normalizable lookup key matches only its exact stored key", () => {
  const totals = { "loyalty-card-007": 12, "loyalty-card-008": 3 };
  assert.equal(sumManualPointsForPhone("loyalty-card-007", totals), 12);
});
