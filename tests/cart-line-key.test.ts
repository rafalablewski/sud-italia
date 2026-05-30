import { test } from "node:test";
import assert from "node:assert/strict";
import { cartLineKey } from "@/store/cart";
import type { CartItem, MenuItem } from "@/data/types";

// Run with:  npx tsx --test src/store/cart-line-key.test.ts

const menuItem = (id: string): MenuItem =>
  ({ id, name: id, price: 2500, cost: 800, category: "pizza" }) as MenuItem;

const line = (
  id: string,
  selectedModifiers?: { groupId: string; optionId: string }[],
): Pick<CartItem, "menuItem" | "selectedModifiers"> => ({
  menuItem: menuItem(id),
  ...(selectedModifiers ? { selectedModifiers } : {}),
});

test("a line with no modifiers keys on the bare menu-item id", () => {
  assert.equal(cartLineKey(line("krk-pizza-margherita")), "krk-pizza-margherita");
});

test("modifier selections produce a distinct, stable key", () => {
  const a = cartLineKey(
    line("krk-pizza-margherita", [{ groupId: "crust", optionId: "sourdough" }]),
  );
  assert.notEqual(a, "krk-pizza-margherita");
  assert.equal(a, "krk-pizza-margherita#crust:sourdough");
});

test("key is order-independent — same picks merge regardless of array order", () => {
  const a = cartLineKey(
    line("p", [
      { groupId: "extras", optionId: "extra-cheese" },
      { groupId: "crust", optionId: "sourdough" },
    ]),
  );
  const b = cartLineKey(
    line("p", [
      { groupId: "crust", optionId: "sourdough" },
      { groupId: "extras", optionId: "extra-cheese" },
    ]),
  );
  assert.equal(a, b);
});

test("different modifier picks of the same item are different lines", () => {
  const plain = cartLineKey(line("p"));
  const sourdough = cartLineKey(line("p", [{ groupId: "crust", optionId: "sourdough" }]));
  const glutenFree = cartLineKey(line("p", [{ groupId: "crust", optionId: "gluten-free" }]));
  assert.equal(new Set([plain, sourdough, glutenFree]).size, 3);
});
