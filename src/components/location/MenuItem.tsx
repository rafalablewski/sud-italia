"use client";

import { MenuItem as MenuItemType, MenuCategory } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  getItemBadges,
  getMenuRoleBadges,
  BadgeType,
  type UpsellConfig,
} from "@/lib/upsell";
import { getItemDetails } from "@/data/kodawari";
import { CompliancePills } from "./CompliancePills";
import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
import { useState, useEffect } from "react";

// V8 Trattoria menu item card.
//
// The previous MenuItemCard used a thumbnail + tag-pills + brand-red
// "Add" button + per-variant gradient frame layout. V8 replaces that
// with a paper-card layout:
//   - Floating flag ribbon at the top-left (Our Hero / Most Popular /
//     Hot this week — terracotta / ochre / basil pills, sit slightly
//     above the card edge so they read as pinned-on tags).
//   - Chef's signature crown badge at the top-right when the item
//     carries the anchor or chef-signature menu role.
//   - Body: parchment-deep illustration tile (84×84, rotates -3° on
//     hover) on the left + name (italic Cormorant 22px) + uppercase
//     EN tagline (per menu-role: "The gateway — start here" for
//     heroes, "Pizzaiolo's pick" for profit-drivers, "Monthly small-
//     batch" for anchors, "Most popular" for popular, etc.) + the
//     existing description rendered as an italian-italic origin line
//     + diet/proofing chips + meta row (rating + cook time + kcal +
//     Details button).
//   - Foot: dashed-border separator + price + Add button OR an
//     in-cart stepper (terracotta + / − with the cart count in italic
//     basil between).
//
// All the existing data wiring is preserved:
//   - cart hooks (useCartStore: addItem / removeItem / updateQuantity
//     / items)
//   - `justAdded` 1500ms timer for the post-add feedback
//   - detail-drawer (Kodawari `<ItemDetailDrawer />`) trigger
//   - `popularThisWeek` flag + the role/upsell-config badges from
//     lib/upsell
//   - LTO countdown (hydration-safe, computed in useEffect)
//   - `<CompliancePills />` regulatory disclosure pills
//   - hero/anchor/popular visual treatments via card-level classes
//
// What changed: the card markup is now V8 paper-card with the
// `.v8-mi-*` selector family (declared in themes/homepage/index.css).
// The previous brand-red "Add" button is now terracotta `.v8-mi-add`;
// the previous Plus/Minus stepper becomes the basil `.v8-mi-stepper`.

interface MenuItemProps {
  item: MenuItemType;
  locationSlug: string;
  popularThisWeek?: boolean;
  /** When true (set by MenuSection when item.menuRole === "hero" + we
   *  aren't searching), the card already spans both grid columns. The
   *  card itself doesn't need to do anything different; the variant
   *  still drives the EN-tagline derivation below. */
  variant?: "default" | "hero";
  upsellConfig?: UpsellConfig | null;
  compliance?: import("./CompliancePills").PublicCompliance | null;
}

// Diet / proofing chips. Map onto item.tags + dietary-info shaped
// strings. Mirrors V8's `.chip` palette: basil-tinted by default,
// `.is-warn` oxblood (spicy), `.is-gold` ochre (gluten-free / lto).
const CHIP_DEFS: Record<string, { en: string; it: string; variant?: "warn" | "gold" }> = {
  vegetarian: { en: "Vegetarian", it: "vegetariano" },
  vegan: { en: "Vegan", it: "vegano" },
  spicy: { en: "Spicy", it: "piccante", variant: "warn" },
  "gluten-free": { en: "GF", it: "senza glutine", variant: "gold" },
};

// EN tagline copy per menu-role / badge. Lands in the uppercase-small
// span below the name. Falls back to null (no tagline) when the item
// has no signalling role.
function getEnTagline(item: MenuItemType, badges: BadgeType[], isHero: boolean): string | null {
  if (isHero) return "The gateway — start here";
  if (item.menuRole === "anchor") return "Monthly small-batch";
  if (item.menuRole === "profit-driver") return "Pizzaiolo's pick";
  if (badges.includes("chef-signature")) return "Chef's signature";
  if (badges.includes("new")) return "Just landed";
  if (badges.includes("best-value")) return "Smart pick";
  return null;
}

function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

export function MenuItemCard({
  item,
  locationSlug,
  popularThisWeek = false,
  variant = "default",
  upsellConfig,
  compliance,
}: MenuItemProps) {
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items);
  const setDetailItem = useCartUIStore((s) => s.setDetailItem);
  const [justAdded, setJustAdded] = useState(false);

  // Items with modifier groups (e.g. "half & half", extra toppings) can't be
  // one-tap-added — the customer has to choose in the detail drawer first, and
  // each variant is its own cart line. So those cards stay in "Add" mode (which
  // opens the picker) rather than showing an inline stepper that couldn't tell
  // the variants apart.
  const hasModifierGroups = (item.modifierGroups?.length ?? 0) > 0;
  const cartItem = cartItems.find((i) => i.menuItem.id === item.id);
  const quantity = cartItem?.quantity ?? 0;
  const inCart = !hasModifierGroups && quantity > 0;

  const roleBadges = getMenuRoleBadges(item, upsellConfig);
  const adminBadges = getItemBadges(item.id, locationSlug, upsellConfig).filter(
    (b) => !(b === "staff-pick" && roleBadges.includes("pizzaiolo-choice")),
  );
  const badges: BadgeType[] = [...roleBadges, ...adminBadges];
  const details = getItemDetails(item.id);
  const isHero = variant === "hero" || item.menuRole === "hero";
  const isAnchor = item.menuRole === "anchor";
  const hasSignatureCrown = isAnchor || badges.includes("chef-signature");

  // LTO countdown — hydration-safe (see comment in pre-V8 file).
  const [ltoDaysLeft, setLtoDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe
    setLtoDaysLeft(
      item.isLimited && item.limitedUntil ? daysUntil(item.limitedUntil) : null,
    );
  }, [item.isLimited, item.limitedUntil]);
  const showLtoChip = Boolean(item.isLimited) && ltoDaysLeft !== 0;

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const handleAdd = () => {
    if (hasModifierGroups) {
      // Route to the picker so required choices (and any surcharges) are made
      // before the line lands in the cart.
      setDetailItem({ item, locationSlug, popularThisWeek });
      return;
    }
    addItem(item, locationSlug);
    setJustAdded(true);
  };
  const handleDecrement = () => {
    if (quantity <= 1) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, quantity - 1);
    }
  };

  const enTagline = getEnTagline(item, badges, isHero);
  const hasMeta = Boolean(details?.prepTimeMinutes || details?.nutrition);
  const isPopularNow = popularThisWeek || badges.includes("popular");

  // Card status class drives the V8 visual frame (paper-on-paper,
  // unavailable greyscale, in-cart basil ring).
  const stateClass = !item.available
    ? "is-unavailable"
    : inCart
      ? "is-incart"
      : "";

  return (
    <article className={`v8-mi ${stateClass}`}>
      {/* Floating flag ribbon (top-left). Order: hero → popular →
       *  hot-this-week → new. */}
      {item.available && (isHero || isPopularNow || badges.includes("new")) && (
        <div className="v8-mi-flags">
          {isHero && (
            <span className="v8-mi-flag">Our Hero</span>
          )}
          {isPopularNow && (
            <span className="v8-mi-flag is-gold">Most Popular</span>
          )}
          {badges.includes("new") && (
            <span className="v8-mi-flag is-basil">Just landed</span>
          )}
        </div>
      )}

      {/* Chef's signature crown (top-right) — anchor menuRole + the
       *  admin-set chef-signature badge both light this. */}
      {item.available && hasSignatureCrown && (
        <span className="v8-mi-signature" aria-label="Chef's signature">
          <CrownIcon />
          <span>Signature</span>
        </span>
      )}

      {/* Unavailable badge replaces the flag ribbon when sold out. */}
      {!item.available && (
        <div className="v8-mi-flags">
          <span className="v8-mi-flag is-muted">Sold out today</span>
        </div>
      )}

      <div className="v8-mi-top">
        <div className="v8-mi-illus" aria-hidden>
          <CategoryIllus category={item.category} />
        </div>
        <div className="v8-mi-info">
          <h3 className="v8-mi-name">
            {item.name}
            {enTagline && <span className="en">{enTagline}</span>}
          </h3>
          {item.description && (
            <div className="v8-mi-origin">{item.description}</div>
          )}

          {/* Chips: diet tags + LTO countdown + 36h proofing flag for
           *  pizza items (a V8 voice nod — the menu boasts the
           *  long-prove). */}
          {(item.tags.length > 0 || showLtoChip) && (
            <div className="v8-mi-chips">
              {item.tags
                .map((tag) => {
                  const def = CHIP_DEFS[tag];
                  if (!def) return null;
                  return (
                    <span
                      key={tag}
                      className={`v8-mi-chip ${def.variant === "warn" ? "is-warn" : def.variant === "gold" ? "is-gold" : ""}`}
                    >
                      <span>{def.en}</span>{" "}
                      <span className="bi-sec">· {def.it}</span>
                    </span>
                  );
                })}
              {showLtoChip && (
                <span className="v8-mi-chip is-gold is-italic">
                  {item.limitedUntil && ltoDaysLeft !== null
                    ? `${ltoDaysLeft}d left · per ${ltoDaysLeft} giorni`
                    : "Limited · a tempo"}
                </span>
              )}
              {item.category === "pizza" && (
                <span className="v8-mi-chip is-italic">
                  <span>36h proofing</span>{" "}
                  <span className="bi-sec">· 36h lievitazione</span>
                </span>
              )}
            </div>
          )}

          {hasMeta && (
            <div className="v8-mi-meta">
              {details?.prepTimeMinutes && (
                <span>
                  <span className="num">{details.prepTimeMinutes}</span> min
                </span>
              )}
              {details?.nutrition && (
                <span>
                  <span className="num">{details.nutrition.calories}</span> kcal
                </span>
              )}
              {details && (
                <button
                  type="button"
                  className="v8-mi-meta-details"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailItem({ item, locationSlug, popularThisWeek });
                  }}
                >
                  Details <span className="bi-sec">· dettagli</span>
                </button>
              )}
            </div>
          )}

          {/* Compliance pills (Nutri-Grade, halal, kcal, etc.) — kept
           *  as the existing component since the rendering already
           *  matches a small inline pill row. */}
          <CompliancePills item={item} compliance={compliance ?? null} />
        </div>
      </div>

      <div className="v8-mi-foot">
        <div className="v8-mi-price num">{formatPrice(item.price)}</div>
        {quantity === 0 ? (
          <button
            type="button"
            className="v8-mi-add"
            onClick={handleAdd}
            disabled={!item.available}
            aria-label={
              !item.available
                ? `${item.name} — sold out`
                : justAdded
                  ? `${item.name} added to cart`
                  : `Add ${item.name} to cart`
            }
          >
            {justAdded ? (
              <>
                <CheckIcon /> <span>Added</span>
              </>
            ) : (
              <>
                <PlusIcon /> <span>Add</span>{" "}
                <span className="it bi-sec">· aggiungi</span>
              </>
            )}
          </button>
        ) : (
          <div className="v8-mi-stepper" aria-label={`${item.name} in cart`}>
            <button
              type="button"
              className="v8-mi-stepper-btn"
              onClick={handleDecrement}
              aria-label={`Remove one ${item.name}`}
            >
              <MinusIcon />
            </button>
            <span className="v8-mi-stepper-count">{quantity}</span>
            <button
              type="button"
              className="v8-mi-stepper-btn"
              onClick={handleAdd}
              aria-label={`Add one more ${item.name}`}
            >
              <PlusIcon />
            </button>
          </div>
        )}
      </div>

    </article>
  );
}

// Small inline icons — match the V8 menu chrome style (no lucide,
// keeps the markup auditable). Crown for the signature pill, plus /
// minus / check for the cart actions.
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 2 L7 12 M2 7 L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7 L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7 L6 11 L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CrownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 12" fill="none" aria-hidden>
      <path d="M1 3 L3 8 L7 4 L11 8 L13 3 L11 11 L3 11 Z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.3" strokeLinejoin="round" />
    </svg>
  );
}

// Per-category default illustration. Each item gets the same sketch
// keyed by its category — V8's mockup ships unique per-item sketches
// (Margherita with red basil dots, etc.), but the production
// codebase has too many items to hand-illustrate each. Per-category
// defaults preserve the V8 paper-illustration feel without a per-
// item asset drop.
function CategoryIllus({ category }: { category: MenuCategory }) {
  switch (category) {
    case "pizza":
      return <PizzaSketch />;
    case "pasta":
      return <PastaSketch />;
    case "antipasti":
      return <AntipastiSketch />;
    case "panini":
      return <PaniniSketch />;
    case "drinks":
      return <DrinkSketch />;
    case "desserts":
      return <DessertSketch />;
    default:
      return <PlateSketch />;
  }
}

function PizzaSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <circle cx="31" cy="32" r="22" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.6" />
      <circle cx="31" cy="32" r="18" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.5" />
      <circle cx="24" cy="28" r="3" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="38" cy="30" r="3" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="30" cy="38" r="3" fill="#CD212A" fillOpacity="0.7" />
      <path d="M22 35 C 24 33, 26 35, 26 37" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
      <path d="M36 24 C 38 22, 40 24, 40 26" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
      <path d="M38 38 C 40 36, 42 38, 42 40" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
    </svg>
  );
}

function PastaSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <ellipse cx="31" cy="38" rx="22" ry="8" fill="#F2E2C2" stroke="#7A2B2B" strokeWidth="1.4" />
      <path d="M12 36 C 18 30, 28 30, 31 36 C 34 42, 44 42, 50 36" stroke="#C9A23E" strokeWidth="1.4" fill="none" />
      <path d="M12 38 C 18 32, 28 32, 31 38 C 34 44, 44 44, 50 38" stroke="#C9A23E" strokeWidth="1.4" fill="none" />
      <path d="M12 40 C 18 34, 28 34, 31 40 C 34 46, 44 46, 50 40" stroke="#B85C38" strokeWidth="1.2" fill="none" />
      <circle cx="22" cy="36" r="1.6" fill="#7A2B2B" />
      <circle cx="40" cy="38" r="1.6" fill="#7A2B2B" />
      <path d="M28 22 C 30 18, 34 18, 34 22" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.3" />
    </svg>
  );
}

function AntipastiSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <ellipse cx="31" cy="44" rx="22" ry="5" stroke="#7A2B2B" strokeWidth="1.4" fill="#E8D6B5" />
      <ellipse cx="22" cy="34" rx="6" ry="5" fill="#4A7C59" fillOpacity="0.4" stroke="#4A7C59" strokeWidth="1.2" />
      <ellipse cx="32" cy="32" rx="7" ry="5" fill="#B85C38" fillOpacity="0.4" stroke="#7A2B2B" strokeWidth="1.2" />
      <ellipse cx="42" cy="34" rx="6" ry="5" fill="#C9A23E" fillOpacity="0.4" stroke="#B85C38" strokeWidth="1.2" />
      <circle cx="20" cy="32" r="1.3" fill="#7A2B2B" />
      <circle cx="44" cy="32" r="1.3" fill="#7A2B2B" />
      <path d="M30 24 C 32 20, 34 20, 36 24" stroke="#4A7C59" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function PaniniSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <path d="M12 24 C 12 18, 50 18, 50 24 L48 28 L14 28 Z" fill="#C9A23E" fillOpacity="0.4" stroke="#7A2B2B" strokeWidth="1.6" />
      <rect x="14" y="28" width="34" height="6" fill="#4A7C59" fillOpacity="0.45" stroke="#4A7C59" strokeWidth="1" />
      <rect x="14" y="34" width="34" height="4" fill="#CD212A" fillOpacity="0.4" stroke="#7A2B2B" strokeWidth="1" />
      <rect x="14" y="38" width="34" height="6" fill="#E8D6B5" stroke="#7A2B2B" strokeWidth="1" />
      <path d="M12 44 C 12 50, 50 50, 50 44 L48 40 L14 40 Z" fill="#C9A23E" fillOpacity="0.4" stroke="#7A2B2B" strokeWidth="1.6" />
      <circle cx="18" cy="22" r="0.8" fill="#7A2B2B" opacity="0.6" />
      <circle cx="26" cy="22" r="0.8" fill="#7A2B2B" opacity="0.6" />
      <circle cx="34" cy="22" r="0.8" fill="#7A2B2B" opacity="0.6" />
      <circle cx="42" cy="22" r="0.8" fill="#7A2B2B" opacity="0.6" />
    </svg>
  );
}

function DrinkSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <path d="M22 12 L40 12 L40 18 L42 22 L42 50 C 42 54, 20 54, 20 50 L20 22 L22 18 Z" stroke="#7A2B2B" strokeWidth="1.6" fill="#F2E2C2" />
      <rect x="22" y="14" width="18" height="2.5" fill="#7A2B2B" opacity="0.6" />
      <path d="M20 32 L42 32" stroke="#7A2B2B" strokeWidth="1" opacity="0.5" />
      <ellipse cx="31" cy="44" rx="9" ry="3" fill="#CD212A" fillOpacity="0.35" />
      <path d="M28 36 C 30 34, 32 34, 34 36" stroke="#C9A23E" strokeWidth="1.4" fill="none" />
      <path d="M26 42 C 30 40, 32 40, 36 42" stroke="#B85C38" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function DessertSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <ellipse cx="31" cy="46" rx="22" ry="4" stroke="#7A2B2B" strokeWidth="1.4" fill="#E8D6B5" />
      <rect x="14" y="22" width="34" height="22" stroke="#7A2B2B" strokeWidth="1.6" fill="#F2E2C2" />
      <path d="M14 28 L48 28" stroke="#7A2B2B" strokeWidth="0.8" opacity="0.5" />
      <path d="M14 36 L48 36" stroke="#7A2B2B" strokeWidth="0.8" opacity="0.5" />
      <path d="M14 22 C 14 18, 48 18, 48 22 L46 24 L16 24 Z" fill="#C9A23E" fillOpacity="0.4" stroke="#7A2B2B" strokeWidth="1.4" />
      <circle cx="22" cy="32" r="1.5" fill="#7A2B2B" opacity="0.7" />
      <circle cx="40" cy="32" r="1.5" fill="#7A2B2B" opacity="0.7" />
      <path d="M28 14 C 28 10, 34 10, 34 14" stroke="#8C6F4F" strokeWidth="1.2" fill="none" opacity="0.6" />
    </svg>
  );
}

function PlateSketch() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden>
      <circle cx="31" cy="32" r="22" fill="#F2E2C2" stroke="#7A2B2B" strokeWidth="1.6" />
      <circle cx="31" cy="32" r="16" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M22 28 C 26 26, 36 26, 40 28" stroke="#B85C38" strokeWidth="1.4" fill="none" />
    </svg>
  );
}
