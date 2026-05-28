import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:3007/locations/krakow", { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
// Mock: force-apply .is-unavailable on the first card via JS so we can see the styling
const data = await p.evaluate(() => {
  const c = document.querySelector(".v8-mi");
  if (!c) return { error: "no card" };
  c.classList.add("is-unavailable");
  // Also swap the flags to the sold-out variant by hiding existing + injecting
  const existing = c.querySelector(".v8-mi-flags");
  if (existing) existing.remove();
  const flags = document.createElement("div");
  flags.className = "v8-mi-flags";
  flags.innerHTML = '<span class="v8-mi-flag is-muted">Sold out today</span>';
  c.prepend(flags);
  // Disable the add button visually
  const add = c.querySelector(".v8-mi-add");
  if (add) add.setAttribute("disabled", "true");
  const s = getComputedStyle(c);
  return {
    opacity: s.opacity,
    filter: s.filter,
    transform: s.transform,
    flagBg: getComputedStyle(c.querySelector(".v8-mi-flag")).backgroundColor,
    addDisabled: add?.disabled,
    addBg: add ? getComputedStyle(add).backgroundColor : null,
  };
});
console.log(JSON.stringify(data, null, 2));
await p.evaluate(() => document.querySelector(".v8-mi")?.scrollIntoView({ block: "start" }));
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/step10b-soldout.png" });
await b.close();
