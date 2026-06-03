/**
 * Render regression tests for the inline BundleComposer (the "Make it a
 * Family" feast builder). Unlike the rest of the suite (pure-logic), this
 * one mounts the real component in happy-dom and drives its mount → fetch →
 * init render cycle, because the bugs this component shipped were
 * render/effect-timing, not pure logic:
 *
 *   - #132: the composer deadlocked on "Apparecchiando la tavola…" forever
 *           (a self-retriggering fetch effect). `loads_past_loading` guards it.
 *   - #131: the "same as last time" prefill silently never applied because
 *           picks initialized before the async lookup resolved.
 *           `prefills_from_last_composition` guards it.
 *
 * BundleComposer is fully prop-driven (no store/context), so it mounts in
 * isolation with stub props + a mocked global.fetch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { act } from "react";

import { BundleComposer } from "@/components/cart/BundleComposer";
import type { BundleTier } from "@/lib/bundles";
import type { CartItem, MenuCategory, MenuItem } from "@/data/types";

GlobalRegistrator.register();
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- fixtures -------------------------------------------------------------

function item(id: string, name: string, category: MenuCategory, price: number): MenuItem {
  return { id, name, description: "", price, cost: Math.round(price * 0.3), category, tags: [], available: true };
}

const MENU: MenuItem[] = [
  item("krk-pizza-margherita", "Pizza Margherita", "pizza", 2890),
  item("krk-anti-garlic", "Garlic Bread", "antipasti", 990),
  item("krk-anti-bruschetta", "Bruschetta al Pomodoro", "antipasti", 1290),
  item("krk-drink-acqua", "Acqua Minerale", "drinks", 590),
  item("krk-drink-limonata", "Limonata", "drinks", 890),
];

const FAMILY: BundleTier = {
  id: "family",
  tier: "Family",
  name: "Your pizzas + sides",
  description: "Your mains + bruschetta + 2 drinks",
  pricingMode: "dynamic",
  mainCategories: ["pizza", "pasta"],
  minMains: 3,
  maxMains: 6,
  discountPercent: 18,
  composition: [
    { kind: "category", category: "antipasti", quantity: 1 },
    { kind: "category", category: "drinks", quantity: 2 },
  ],
  mealPeriod: "family",
  active: true,
};

const CART: CartItem[] = [
  { menuItem: MENU[0], quantity: 3, locationSlug: "krakow" },
];

// ---- render harness -------------------------------------------------------

type Mounted = { container: HTMLElement; unmount: () => void };

async function mount(props: Parameters<typeof BundleComposer>[0]): Promise<Mounted> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(BundleComposer, props));
  });
  // Let the last-bundle fetch promise settle, then flush its state updates.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Stub global.fetch to return a fixed last-bundle composition payload. */
function stubFetch(composition: { menuItemId: string; quantity: number }[] | null) {
  let calls = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ composition }) } as unknown as Response;
  };
  return () => calls;
}

const noop = () => {};

// ---- tests ----------------------------------------------------------------

test("loads past the loading state and renders the pickers (phone present)", async () => {
  stubFetch(null); // no prior order
  const m = await mount({
    bundle: FAMILY,
    cartItems: CART,
    menuItems: MENU,
    locationSlug: "krakow",
    customerPhone: "+48500100200",
    onCancel: noop,
    onApply: noop,
  });
  const text = m.container.textContent ?? "";
  assert.ok(!text.includes("Apparecchiando"), "composer must not be stuck on the loading state");
  assert.ok(text.includes("Choose your antipasti"), "antipasti slot heading should render");
  assert.ok(text.includes("Choose 2 drinks"), "drinks slot heading should render");
  assert.match(text, /Apply Family/, "apply CTA should render");
  m.unmount();
});

test("renders without a phone (no last-bundle fetch)", async () => {
  const calls = stubFetch(null);
  const m = await mount({
    bundle: FAMILY,
    cartItems: CART,
    menuItems: MENU,
    locationSlug: "krakow",
    customerPhone: null,
    onCancel: noop,
    onApply: noop,
  });
  const text = m.container.textContent ?? "";
  assert.ok(!text.includes("Apparecchiando"), "composer must not be stuck on the loading state");
  assert.match(text, /Apply Family/, "apply CTA should render");
  assert.equal(calls(), 0, "no last-bundle fetch should fire without a phone");
  m.unmount();
});

test("prefills picks from the customer's last composition", async () => {
  // Last order chose the pricier bruschetta + 2× limonata (not the cheapest).
  stubFetch([
    { menuItemId: "krk-anti-bruschetta", quantity: 1 },
    { menuItemId: "krk-drink-limonata", quantity: 2 },
  ]);
  const m = await mount({
    bundle: FAMILY,
    cartItems: CART,
    menuItems: MENU,
    locationSlug: "krakow",
    customerPhone: "+48500100200",
    onCancel: noop,
    onApply: noop,
  });
  // The chosen pick is the collapsed `.v8-composer-pick` card; options are
  // rendered too but we only assert on the selected pick names.
  const chosen = Array.from(m.container.querySelectorAll(".v8-composer-pick .v8-composer-pick-name"))
    .map((el) => el.textContent);
  assert.ok(chosen.includes("Bruschetta al Pomodoro"), "antipasti should prefill to last-order bruschetta, not cheapest garlic bread");
  assert.equal(chosen.filter((n) => n === "Limonata").length, 2, "both drinks should prefill to last-order limonata");
  m.unmount();
});

test("apply emits the mains + chosen add-ons with a positive price", async () => {
  stubFetch(null);
  let applied: { lines: CartItem[]; price: number } | null = null;
  const m = await mount({
    bundle: FAMILY,
    cartItems: CART,
    menuItems: MENU,
    locationSlug: "krakow",
    customerPhone: null,
    onCancel: noop,
    onApply: (lines, price) => { applied = { lines, price }; },
  });
  const applyBtn = m.container.querySelector(".v8-composer-apply") as HTMLButtonElement | null;
  assert.ok(applyBtn, "apply CTA should be present");
  await act(async () => { applyBtn!.dispatchEvent(new Event("click", { bubbles: true })); });

  assert.ok(applied, "onApply should fire");
  const result = applied as unknown as { lines: CartItem[]; price: number };
  assert.ok(result.price > 0, "applied price should be positive");
  // 3 mains (one line, qty 3) + 1 antipasto + 2 drinks selected.
  const mains = result.lines.filter((l) => l.menuItem.category === "pizza");
  assert.equal(mains.reduce((s, l) => s + l.quantity, 0), 3, "all 3 mains carry into the bundle");
  assert.ok(result.lines.some((l) => l.menuItem.category === "antipasti"), "an antipasto add-on is included");
  assert.equal(result.lines.filter((l) => l.menuItem.category === "drinks").length, 2, "two drink add-ons are included");
  m.unmount();
});
