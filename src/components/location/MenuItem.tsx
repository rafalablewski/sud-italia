"use client";

import { MenuItem as MenuItemType } from "@/data/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MenuItemImage } from "./MenuItemImage";
import { formatPrice } from "@/lib/utils";
import {
  getItemBadges,
  getMenuRoleBadges,
  BADGE_CONFIG,
  BadgeType,
  type UpsellConfig,
} from "@/lib/upsell";
import { getItemDetails } from "@/data/kodawari";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { CompliancePills } from "./CompliancePills";
import { useCartStore } from "@/store/cart";
import {
  Plus,
  Minus,
  Check,
  TrendingUp,
  Award,
  Zap,
  Star,
  Clock,
  Flame,
  Info,
  Heart,
  ChefHat,
  Crown,
} from "lucide-react";
import { useState, useEffect } from "react";

interface MenuItemProps {
  item: MenuItemType;
  locationSlug: string;
  /** From real 7-day order counts at this location */
  popularThisWeek?: boolean;
  /** When true the card uses the §4.3 hero treatment: bigger thumbnail,
   *  ribbon, and a "Pizzaiolo's gateway" subtitle. Driven by `item.menuRole`
   *  but kept as an explicit prop so MenuSection controls layout. */
  variant?: "default" | "hero";
  /** Editorial-badge config from /admin/crosssell → Menu badges. When
   *  present, additive to the item's intrinsic `menuRole` so admins can
   *  promote items without editing seed data. */
  upsellConfig?: UpsellConfig | null;
  /** Audit §11.1 — operator-set regulatory disclosure for this location.
   *  Drives the per-item compliance pill row (kcal on NYC, Nutri-Grade +
   *  halal on SG, pork / alcohol everywhere). */
  compliance?: import("./CompliancePills").PublicCompliance | null;
}

const TAG_LABELS: Record<string, { label: string; variant: "green" | "red" | "gold" | "default" }> = {
  vegetarian: { label: "Vegetarian", variant: "green" },
  vegan: { label: "Vegan", variant: "green" },
  spicy: { label: "Spicy", variant: "red" },
  "gluten-free": { label: "GF", variant: "gold" },
};

const BADGE_ICONS: Record<BadgeType, React.ElementType> = {
  popular: TrendingUp,
  "staff-pick": Award,
  new: Zap,
  "best-value": Star,
  hero: Heart,
  "pizzaiolo-choice": ChefHat,
  "chef-signature": Crown,
};

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
  const [justAdded, setJustAdded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const cartItem = cartItems.find((i) => i.menuItem.id === item.id);
  const quantity = cartItem?.quantity ?? 0;
  const inCart = quantity > 0;

  // Menu-engineering badges come first so they take visual priority over
  // admin-editable "popular"/"staff-pick" chips when both apply. Both helpers
  // honour the cross-sell Menu badges tab when an upsellConfig is supplied,
  // so admin overrides flow through to the customer card.
  const roleBadges = getMenuRoleBadges(item, upsellConfig);
  const adminBadges = getItemBadges(item.id, locationSlug, upsellConfig).filter(
    // De-dupe: don't render staff-pick if Pizzaiolo's Choice already covers it.
    (b) => !(b === "staff-pick" && roleBadges.includes("pizzaiolo-choice")),
  );
  const badges: BadgeType[] = [...roleBadges, ...adminBadges];
  const details = getItemDetails(item.id);
  const isHero = variant === "hero" || item.menuRole === "hero";
  const isAnchor = item.menuRole === "anchor";
  // LTO countdown depends on `Date.now()`, which would mismatch between the
  // SSR pass and client hydration on clock-skew or a day-boundary crossing.
  // Keep the value `null` for the first client render so the SSR HTML and
  // the hydrated HTML agree, then fill in the day count after mount. This
  // is the React-docs idiom for hydration-safe time-derived values; the
  // lint rule below is overly conservative here.
  const [ltoDaysLeft, setLtoDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see comment above
    setLtoDaysLeft(
      item.isLimited && item.limitedUntil ? daysUntil(item.limitedUntil) : null,
    );
  }, [item.isLimited, item.limitedUntil]);
  // Suppress the chip once the client knows the LTO has expired (0 days
  // left). During SSR + first paint we conservatively keep it visible.
  const showLtoChip = Boolean(item.isLimited) && ltoDaysLeft !== 0;

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const handleAdd = () => {
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

  const isPopular = badges.includes("popular");

  const hasMetaStrip = Boolean(
    details?.prepTimeMinutes ||
      details?.nutrition ||
      details
  );

  // Card frame palette: hero gets the brand cream gradient + red border,
  // anchor gets the dark "Chef's Signature" treatment, popular still gets
  // the gold ring, otherwise neutral. inCart still overrides for clarity.
  const frameClass = !item.available
    ? "bg-gray-50 border-gray-100 opacity-60"
    : inCart
      ? "bg-italia-green/[0.03] border-italia-green/30 shadow-sm shadow-italia-green/5"
      : isHero
        ? "bg-gradient-to-br from-italia-cream to-white border-italia-red/30 shadow-md hover:shadow-lg hover:border-italia-red/50"
        : isAnchor
          ? "bg-gradient-to-br from-italia-dark/[0.04] to-italia-gold/[0.06] border-italia-gold/40 shadow-md hover:shadow-lg hover:border-italia-gold/60"
          : isPopular
            ? "bg-white border-italia-gold/20 shadow-sm hover:shadow-md hover:border-italia-gold/30"
            : "bg-white border-gray-100 hover:shadow-md hover:border-gray-200";

  return (
    <div
      className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-300 ${frameClass}`}
    >
      {/* Unavailable overlay */}
      {!item.available && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-500">
            Unavailable
          </span>
        </div>
      )}

      {/* Social proof badge ribbon */}
      {item.available && (badges.length > 0 || popularThisWeek) && (
        <div className="absolute -top-2 right-3 flex flex-wrap justify-end gap-1 max-w-[min(100%,14rem)]">
          {popularThisWeek && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-200/80 shadow-sm">
              <Flame className="h-3 w-3" />
              Hot this week
            </span>
          )}
          {badges.map((badge) => {
            const config = BADGE_CONFIG[badge];
            const BadgeIcon = BADGE_ICONS[badge];
            return (
              <span
                key={badge}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${config.color} shadow-sm`}
              >
                <BadgeIcon className="h-3 w-3" />
                {config.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Row 1: thumbnail + title, description, pairing (full text width beside image) */}
      <div className="flex gap-4 items-start">
        <div className={`flex-shrink-0 self-center ${isHero ? "scale-110 origin-left" : ""}`}>
          <MenuItemImage category={item.category} name={item.name} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={`font-heading font-semibold text-italia-dark ${
                isHero ? "text-lg sm:text-xl" : isAnchor ? "text-base sm:text-lg" : ""
              }`}
            >
              {item.name}
            </h3>
            {item.tags.map((tag) => {
              const t = TAG_LABELS[tag];
              return t ? (
                <Badge key={tag} variant={t.variant}>
                  {t.label}
                </Badge>
              ) : null;
            })}
            {showLtoChip && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-italia-red/10 text-italia-red border border-italia-red/20">
                <Clock className="h-3 w-3" />
                {item.limitedUntil && ltoDaysLeft !== null
                  ? `${ltoDaysLeft}d left`
                  : "Limited"}
              </span>
            )}
          </div>
          <p
            className={`text-sm text-italia-gray mt-1 leading-relaxed ${
              isHero ? "line-clamp-none" : "line-clamp-3"
            }`}
          >
            {item.description}
          </p>
          {isHero && (
            <p className="text-[11px] text-italia-red mt-1.5 font-medium uppercase tracking-wide">
              The gateway — start here
            </p>
          )}
          {item.menuRole === "profit-driver" && (
            <p className="text-[11px] text-italia-gold-dark mt-1 font-medium">
              Pizzaiolo&apos;s pick — quietly his favourite to make
            </p>
          )}
          {isAnchor && (
            <p className="text-[11px] text-italia-gold-dark mt-1 font-medium">
              Monthly small-batch — black truffle, buffalo mozzarella DOP
            </p>
          )}
          {!isHero && !isAnchor && item.menuRole !== "profit-driver" &&
            (item.category === "pizza" || item.category === "pasta") &&
            isPopular && (
              <p className="text-[11px] text-italia-gold mt-1 font-medium">
                Pairs perfectly with espresso & tiramisù
              </p>
            )}
        </div>
      </div>

      {/* Row 2: full-width meta strip (time, kcal, Details) */}
      {hasMetaStrip && (
        <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 pt-3">
          {details?.prepTimeMinutes && (
            <span className="flex items-center gap-0.5 text-[11px] text-italia-gray">
              <Clock className="h-3 w-3" aria-hidden />
              {details.prepTimeMinutes}m
            </span>
          )}
          {details?.nutrition && (
            <span className="flex items-center gap-0.5 text-[11px] text-italia-gray">
              <Flame className="h-3 w-3" aria-hidden />
              {details.nutrition.calories} kcal
            </span>
          )}
          {details && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailOpen(true);
              }}
              className="flex items-center gap-0.5 text-[11px] text-italia-red font-medium hover:underline"
            >
              <Info className="h-3 w-3" aria-hidden />
              Details
            </button>
          )}
        </div>
      )}

      {/* Row 2b: regulatory disclosure pills (kcal / Nutri-Grade / halal /
          pork / alcohol). Renders nothing on PL/EU trucks unless the
          operator explicitly opts an item into the disclosure. */}
      <CompliancePills item={item} compliance={compliance ?? null} />

      {/* Row 3: price + cart actions */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-italia-dark">
          {formatPrice(item.price)}
        </p>

        <div className="flex items-center gap-2">
          {inCart && !justAdded && (
            <span className="text-xs font-semibold text-italia-green animate-fade-in">
              {quantity} in cart
            </span>
          )}

          {justAdded && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-italia-green text-white text-xs font-semibold rounded-lg animate-bounce-in">
              <Check className="h-3 w-3" /> Added!
            </span>
          )}

          {quantity === 0 ? (
            <Button
              onClick={handleAdd}
              variant="primary"
              size="sm"
              className="min-h-[40px] min-w-[72px] rounded-xl"
              disabled={!item.available}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          ) : (
            <div className="flex items-center gap-0.5 bg-gray-50 rounded-xl p-0.5">
              <button
                onClick={handleDecrement}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-italia-red hover:bg-red-50 transition-colors shadow-sm"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold text-italia-dark tabular-nums text-sm">
                {quantity}
              </span>
              <button
                onClick={handleAdd}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-italia-red text-white hover:bg-italia-red-dark transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kodawari detail drawer */}
      {details && (
        <ItemDetailDrawer
          item={item}
          locationSlug={locationSlug}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          popularThisWeek={popularThisWeek}
        />
      )}
    </div>
  );
}
