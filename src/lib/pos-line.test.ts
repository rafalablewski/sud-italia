import { test } from "node:test";
import assert from "node:assert/strict";
import { posLineKey, modifierSignature } from "./pos-line";

test("a bare line keys on its menu-item id (back-compat)", () => {
  assert.equal(posLineKey({ menuItemId: "krk-pizza-margherita" }), "krk-pizza-margherita");
});

test("modifier order doesn't change the signature", () => {
  const a = modifierSignature([
    { groupId: "crust", optionId: "sourdough" },
    { groupId: "extra", optionId: "cheese" },
  ]);
  const b = modifierSignature([
    { groupId: "extra", optionId: "cheese" },
    { groupId: "crust", optionId: "sourdough" },
  ]);
  assert.equal(a, b);
});

test("same item with different picks gets different keys", () => {
  const plain = posLineKey({ menuItemId: "p" });
  const cheesy = posLineKey({ menuItemId: "p", modifiers: [{ groupId: "extra", optionId: "cheese" }] });
  assert.notEqual(plain, cheesy);
});

test("the note participates in identity", () => {
  const a = posLineKey({ menuItemId: "p", notes: "no chili" });
  const b = posLineKey({ menuItemId: "p", notes: "well done" });
  const bare = posLineKey({ menuItemId: "p" });
  assert.notEqual(a, b);
  assert.notEqual(a, bare);
});

test("identical item + picks + note collide (so they merge)", () => {
  const mods = [{ groupId: "g", optionId: "o" }];
  assert.equal(
    posLineKey({ menuItemId: "p", modifiers: mods, notes: "x" }),
    posLineKey({ menuItemId: "p", modifiers: [...mods], notes: "x" }),
  );
});
