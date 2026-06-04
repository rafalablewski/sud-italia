// Subpage-hero design R&D — renders 5 candidate hero layouts to a single PNG
// for review. Pure SVG → PNG via @resvg/resvg-js (no browser needed).
// Tokens mirror the dark admin theme (src/app/themes/admin/index.css).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const T = {
  bg: "#0c0b0e",
  s1: "#17161c",
  s2: "#1d1b23",
  s3: "#262430",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.16)",
  fg: "#f5f3ee",
  muted: "#c0b9b0",
  subtle: "#978e85",
  brand: "#a62d49",
  brandSoft: "rgba(166,45,73,0.16)",
  brandText: "#e6889a",
  platinum: "#cbb48a",
  info: "#6e92c0",
};
const SANS = "Inter, 'DejaVu Sans', sans-serif";
const SERIF = "Fraunces, Georgia, 'DejaVu Serif', serif";

const W = 1280;
const PAD = 48; // outer
const CW = W - PAD * 2; // content width = 1184
let parts = [];
const push = (s) => parts.push(s);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const measure = (s, size, f = 0.56) => String(s).length * size * f;

function rrect(x, y, w, h, r, { fill = "none", stroke = "none", sw = 1, opacity = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}
function text(x, y, s, { size = 13, fill = T.fg, family = SANS, weight = 400, anchor = "start", spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" dominant-baseline="middle">${esc(s)}</text>`;
}

// ---- icons (minimal, 16px box, stroke currentColor via fill on shapes) ----
function icon(name, x, y, c = T.muted, sz = 15) {
  const m = sz / 16;
  const g = (inner) => `<g transform="translate(${x},${y}) scale(${m})" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  switch (name) {
    case "search": return g(`<circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15"/>`);
    case "refresh": return g(`<path d="M14 8 A6 6 0 1 0 12.5 12.5"/><polyline points="14,3 14,8 9,8"/>`);
    case "plus": return g(`<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>`);
    case "pin": return g(`<path d="M8 15 C 3 9 3 6 8 2 C 13 6 13 9 8 15 Z"/><circle cx="8" cy="6.5" r="2"/>`);
    case "filter": return g(`<line x1="3" y1="5" x2="13" y2="5"/><circle cx="6" cy="5" r="1.6" fill="${c}"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="10" cy="11" r="1.6" fill="${c}"/>`);
    case "download": return g(`<line x1="8" y1="2" x2="8" y2="10"/><polyline points="5,7 8,10 11,7"/><line x1="3" y1="14" x2="13" y2="14"/>`);
    case "cal": return g(`<rect x="3" y="3" width="10" height="11" rx="2"/><line x1="3" y1="6.5" x2="13" y2="6.5"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/>`);
    case "chev": return g(`<polyline points="5,7 8,10 11,7"/>`);
    default: return "";
  }
}

// ---- composite controls ----
function button(x, y, label, { primary = false, h = 34, icon: ic = null, w = null } = {}) {
  const padX = 14;
  const iconW = ic ? 22 : 0;
  const tw = label ? measure(label, 13) : 0;
  const bw = w ?? (padX * 2 + iconW + tw);
  const fill = primary ? T.brand : T.s2;
  const stroke = primary ? "none" : T.border;
  const tc = primary ? "#fff" : T.fg;
  let s = rrect(x, y, bw, h, 7, { fill, stroke, sw: 1 });
  let cx = x + padX;
  if (ic) { s += icon(ic, cx, y + h / 2 - 7.5, primary ? "#fff" : T.muted); cx += 22; }
  if (label) s += text(cx, y + h / 2 + 1, label, { size: 13, fill: tc, weight: 500 });
  return { svg: s, w: bw };
}
function iconBtn(x, y, ic, { h = 34, active = false } = {}) {
  const w = h;
  const s = rrect(x, y, w, h, 7, { fill: active ? T.s3 : T.s2, stroke: T.border, sw: 1 }) +
    icon(ic, x + w / 2 - 7.5, y + h / 2 - 7.5, active ? T.fg : T.muted);
  return { svg: s, w };
}
function searchBox(x, y, w, ph, { h = 34 } = {}) {
  return rrect(x, y, w, h, 7, { fill: T.s2, stroke: T.border, sw: 1 }) +
    icon("search", x + 12, y + h / 2 - 7.5, T.subtle) +
    text(x + 34, y + h / 2 + 1, ph, { size: 13, fill: T.subtle });
}
// segmented control with optional count badges
function segmented(x, y, items, activeIdx, { h = 34, counts = false } = {}) {
  const padTrack = 3, segPadX = 14, gap = counts ? 8 : 0, badgeW = 22;
  let segs = items.map((it, i) => {
    const label = counts ? it.label : it;
    const tw = measure(label, 13);
    const w = segPadX * 2 + tw + (counts ? gap + badgeW : 0);
    return { label, w, count: counts ? it.count : null, active: i === activeIdx };
  });
  const total = segs.reduce((a, s) => a + s.w, 0) + padTrack * 2;
  let s = rrect(x, y, total, h, 8, { fill: T.s2, stroke: T.border, sw: 1 });
  let cx = x + padTrack;
  const segH = h - padTrack * 2;
  for (const seg of segs) {
    if (seg.active) s += rrect(cx, y + padTrack, seg.w, segH, 5, { fill: T.s1 });
    let tx = cx + segPadX;
    s += text(tx, y + h / 2 + 1, seg.label, { size: 13, fill: seg.active ? T.fg : T.muted, weight: seg.active ? 600 : 500 });
    if (counts) {
      const bx = tx + measure(seg.label, 13) + gap;
      const bc = seg.active && seg.count > 0 ? T.brand : T.subtle;
      s += rrect(bx, y + h / 2 - 9, badgeW, 18, 9, { fill: seg.active ? T.brandSoft : T.s3 });
      s += text(bx + badgeW / 2, y + h / 2 + 1, String(seg.count), { size: 11, fill: bc, weight: 600, anchor: "middle" });
    }
    cx += seg.w;
  }
  return { svg: s, w: total };
}
function locPills(x, y, { h = 34, compact = false } = {}) {
  // Kraków (active) / Warszawa
  let s = "", cx = x;
  const make = (label, active) => {
    const w = 24 + measure(label, 13);
    let p = rrect(cx, y, w, h, 999, { fill: active ? T.brandSoft : "none", stroke: active ? "none" : T.border, sw: 1 });
    p += icon("pin", cx + 9, y + h / 2 - 7.5, active ? T.brandText : T.subtle, 13);
    p += text(cx + 26, y + h / 2 + 1, label, { size: 13, fill: active ? T.brandText : T.muted, weight: active ? 600 : 500 });
    cx += w + 8;
    return p;
  };
  s += make("Kraków", true);
  s += make("Warszawa", false);
  return { svg: s, w: cx - 8 - x };
}
function title(x, y, str, { size = 30 } = {}) {
  return text(x, y, str, { size, fill: T.fg, family: SERIF, weight: 600, spacing: -0.3 });
}
function underscore(x, y, w = 54) { return rrect(x, y, w, 2.5, 1, { fill: T.platinum }); }
function caption(x, y, n, name, desc) {
  return text(x, y, n, { size: 13, fill: T.platinum, family: SANS, weight: 700, spacing: 1 }) +
    text(x + 34, y, name, { size: 13, fill: T.fg, weight: 600 }) +
    text(x + 34, y + 18, desc, { size: 12, fill: T.subtle });
}

// ===================== VARIANTS =====================
const variants = [];

// V1 — Structured: title+sub left, actions right; filter strip below
variants.push((y) => {
  let s = "";
  s += title(PAD, y + 16, "Purchase orders");
  s += underscore(PAD, y + 32);
  s += text(PAD, y + 52, "Raise, send and reconcile supplier orders across both kitchens.", { size: 13, fill: T.muted });
  // right cluster: location segmented + icon refresh + primary
  let rx = PAD + CW;
  const prim = button(0, 0, "New PO", { primary: true, icon: "plus" });
  rx -= prim.w; const primSvg = button(rx, y + 6, "New PO", { primary: true, icon: "plus" }).svg;
  rx -= 8; const rb = iconBtn(rx - 34, y + 6, "refresh"); rx -= 34; const refSvg = rb.svg;
  rx -= 8; const lp = locPills(0, 0); rx -= lp.w; const lpSvg = locPills(rx, y + 6).svg;
  s += primSvg + refSvg + lpSvg;
  // filter strip
  const seg = segmented(PAD, y + 72, [{ label: "All", count: 0 }, { label: "Draft", count: 0 }, { label: "Sent", count: 0 }, { label: "Received", count: 0 }, { label: "Cancelled", count: 0 }], 0, { counts: true });
  s += seg.svg;
  s += text(PAD + CW, y + 72 + 17, "0 orders", { size: 12, fill: T.subtle, anchor: "end" });
  return s;
});

// V2 — Unified contained toolbar band (single elevated panel, one row)
variants.push((y) => {
  let s = rrect(PAD, y + 4, CW, 60, 12, { fill: T.s1, stroke: T.border, sw: 1 });
  const by = y + 4 + 13; // control row baseline area
  let x = PAD + 18;
  s += title(x, y + 4 + 30, "Purchase orders", { size: 21 }); x += measure("Purchase orders", 21, 0.5) + 18;
  s += rrect(x, y + 4 + 16, 1, 28, 0, { fill: T.border }); x += 16;
  const lp = locPills(x, by, { h: 32 }); s += lp.svg;
  // right side
  let rx = PAD + CW - 18;
  const prim = button(0, 0, "New PO", { primary: true, icon: "plus", h: 32 }); rx -= prim.w; s += button(rx, by, "New PO", { primary: true, icon: "plus", h: 32 }).svg; rx -= 10;
  const seg = segmented(0, 0, ["All", "Draft", "Sent", "Received"], 0, { h: 32 }); rx -= seg.w; s += segmented(rx, by, ["All", "Draft", "Sent", "Received"], 0, { h: 32 }).svg; rx -= 10;
  // search fills the middle
  const sxStart = x + lp.w + 14;
  s += searchBox(sxStart, by, rx - sxStart - 4, "Search PO id, supplier…", { h: 32 });
  return s;
});

// V3 — Editorial: big title hero, clean toolbar row beneath
variants.push((y) => {
  let s = "";
  s += title(PAD, y + 18, "Purchase orders", { size: 30 });
  s += underscore(PAD, y + 34, 54);
  // toolbar row
  const ty = y + 54;
  const lp = locPills(PAD, ty); s += lp.svg;
  let rx = PAD + CW;
  const prim = button(0, 0, "New PO", { primary: true, icon: "plus" }); rx -= prim.w; s += button(rx, ty, "New PO", { primary: true, icon: "plus" }).svg; rx -= 8;
  const rb = iconBtn(rx - 34, ty, "download"); rx -= 34; s += rb.svg; rx -= 8;
  const seg = segmented(0, 0, [{ label: "All", count: 0 }, { label: "Draft", count: 0 }, { label: "Sent", count: 0 }, { label: "Received", count: 0 }], 0, { counts: true }); rx -= seg.w; s += segmented(rx, ty, [{ label: "All", count: 0 }, { label: "Draft", count: 0 }, { label: "Sent", count: 0 }, { label: "Received", count: 0 }], 0, { counts: true }).svg; rx -= 10;
  const sxStart = PAD + lp.w + 14;
  s += searchBox(sxStart, ty, rx - sxStart - 4, "Search by PO id, supplier, or ingredient…");
  return s;
});

// V4 — Minimal icon-first command bar
variants.push((y) => {
  let s = "";
  s += title(PAD, y + 24, "Purchase orders", { size: 26 });
  s += underscore(PAD, y + 40, 48);
  let rx = PAD + CW;
  // primary as icon+label compact
  const prim = button(0, 0, "New PO", { primary: true, icon: "plus", h: 34 }); rx -= prim.w; s += button(rx, y + 12, "New PO", { primary: true, icon: "plus", h: 34 }).svg; rx -= 10;
  for (const ic of ["refresh", "download", "filter", "search"]) { rx -= 34; s += iconBtn(rx, y + 12, ic).svg; rx -= 8; }
  rx -= 4;
  const loc = button(0, 0, "Kraków", { icon: "pin", h: 34 }); rx -= (loc.w + 16);
  s += button(rx, y + 12, "Kraków", { icon: "pin", h: 34 }).svg + icon("chev", rx + loc.w - 2, y + 12 + 9, T.subtle, 14);
  // active-filter chip row (only what's set)
  s += text(PAD, y + 64, "Filters:", { size: 12, fill: T.subtle });
  s += rrect(PAD + 56, y + 54, 86, 22, 999, { fill: T.s2, stroke: T.border, sw: 1 }) + text(PAD + 56 + 14, y + 65, "Draft · 0", { size: 12, fill: T.muted });
  return s;
});

// V5 — Rich split: title+sub+location left, inline stats + primary right
variants.push((y) => {
  let s = rrect(PAD, y + 2, CW, 78, 14, { fill: T.s1, stroke: T.border, sw: 1 });
  s += rrect(PAD, y + 2, 3, 78, 2, { fill: T.platinum }); // left platinum rail
  let x = PAD + 22;
  s += title(x, y + 26, "Purchase orders", { size: 24 });
  s += text(x, y + 48, "Across both kitchens", { size: 12, fill: T.subtle });
  const lp = locPills(x, y + 56, { h: 28 }); s += lp.svg;
  // right: stats + primary
  let rx = PAD + CW - 22;
  const prim = button(0, 0, "New PO", { primary: true, icon: "plus" }); rx -= prim.w; s += button(rx, y + 24, "New PO", { primary: true, icon: "plus" }).svg; rx -= 28;
  const stat = (sx, label, val) => text(sx, y + 22, label, { size: 11, fill: T.subtle, anchor: "end" }) + text(sx, y + 46, val, { size: 22, fill: T.fg, family: SERIF, weight: 600, anchor: "end" });
  s += stat(rx, "OPEN", "0"); rx -= 90;
  s += stat(rx, "VALUE (PLN)", "0"); rx -= 130;
  s += rrect(rx, y + 16, 1, 48, 0, { fill: T.border });
  return s;
});

// ===================== COMPOSE =====================
const names = [
  ["V1", "Structured + filter strip", "Title & subtitle left, actions right, status filters on their own row below."],
  ["V2", "Unified toolbar band", "Everything in one contained elevated panel — title · location · search · filters · action."],
  ["V3", "Editorial hero", "Big serif title alone up top; one clean toolbar row beneath (search grows to fill)."],
  ["V4", "Minimal · icon-first", "Compressed: secondary actions become icon buttons; filters behind a chip/menu."],
  ["V5", "Rich split panel", "ss5-style: title + location left, inline KPI stats + primary action right, in a panel."],
];
const BLOCK = 132;
const top = 70;
const H = top + variants.length * BLOCK + 30;
let body = "";
variants.forEach((fn, i) => {
  const y0 = top + i * BLOCK;
  body += caption(PAD, y0 + 4, names[i][0], names[i][1], names[i][2]);
  body += fn(y0 + 26);
  if (i < variants.length - 1) body += rrect(PAD, y0 + BLOCK - 4, CW, 1, 0, { fill: "rgba(255,255,255,0.05)" });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${T.bg}"/>
${text(PAD, 36, "Subpage hero — 5 candidates", { size: 18, fill: T.fg, family: SERIF, weight: 600 })}
${text(PAD, 54, "Same content (Purchase orders) in each. Dark admin palette. Pick one (or mix) and I'll build it as the one shared hero.", { size: 12.5, fill: T.muted })}
${body}
</svg>`;

const png = new Resvg(svg, { background: T.bg, fitTo: { mode: "width", value: W * 2 } }).render().asPng();
writeFileSync(new URL("./hero-variants.png", import.meta.url), png);
console.log("wrote hero-variants.png", png.length, "bytes,", H, "tall");
