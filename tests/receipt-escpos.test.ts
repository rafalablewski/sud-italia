import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReceiptModel,
  renderEscPos,
  renderPlainText,
} from "@/lib/receipt/escpos";
import type { Order, CartItem, MenuItem } from "@/data/types";

// Run with:  npx tsx --test tests/receipt-escpos.test.ts

const menuItem = (over: Partial<MenuItem>): MenuItem =>
  ({
    id: "krk-pizza-margherita",
    name: "Margherita",
    price: 2800,
    cost: 900,
    category: "pizza",
    ...over,
  }) as MenuItem;

const line = (over: Partial<CartItem>): CartItem =>
  ({ menuItem: menuItem({}), quantity: 1, locationSlug: "krakow", ...over }) as CartItem;

const order = (): Order =>
  ({
    id: "ord-abcdef123456",
    locationSlug: "krakow",
    customerName: "Anna",
    fulfillmentType: "takeout",
    slotTime: "12:15",
    createdAt: "2026-05-30T10:00:00.000Z",
    totalAmount: 3400,
    items: [
      line({
        quantity: 1,
        menuItem: menuItem({
          modifierGroups: [
            {
              id: "crust",
              label: "Crust",
              options: [{ id: "sourdough", label: "48h sourdough", priceDelta: 500 }],
            },
          ],
        }),
        selectedModifiers: [{ groupId: "crust", optionId: "sourdough" }],
        notes: "well fired",
      }),
    ],
  }) as Order;

test("model resolves modifier labels + modifier-inclusive unit price", () => {
  const m = buildReceiptModel(order());
  assert.equal(m.orderShortId, "123456");
  assert.equal(m.lines[0].modifiers[0], "48h sourdough");
  // base 2800 + sourdough 500 = 3300
  assert.equal(m.lines[0].unitGrosze, 3300);
  assert.equal(m.lines[0].notes, "well fired");
});

test("plain text shows item, modifier, note and total", () => {
  const text = renderPlainText(buildReceiptModel(order()));
  assert.match(text, /Margherita/);
  assert.match(text, /48h sourdough/);
  assert.match(text, /well fired/);
  assert.match(text, /TOTAL/);
  assert.match(text, /34\.00 zl/);
});

test("escpos payload starts with INIT and ends with a cut", () => {
  const bytes = renderEscPos(buildReceiptModel(order()));
  // ESC @ init
  assert.equal(bytes[0], 0x1b);
  assert.equal(bytes[1], 0x40);
  // GS V (cut) appears near the end
  const tail = Array.from(bytes.slice(-4));
  assert.deepEqual(tail, [0x1d, 0x56, 0x42, 0x03]);
  assert.ok(bytes.length > 50);
});
