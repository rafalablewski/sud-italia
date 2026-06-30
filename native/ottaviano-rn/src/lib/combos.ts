import type { ComboDealDTO, MenuItemDTO } from "@/api/types";

/**
 * Combo-deal evaluation — the native port of web `getActiveComboDeals`
 * (`src/lib/upsell.ts`). Finds the best applicable combo for the cart and the
 * discount it lands. The cart MUST subtract `savings` from the real total, not
 * just show the badge (CLAUDE rule #8). Savings are capped at one combo's worth
 * (cheapest unit per matched category/required item × discountPercent), so a
 * cart of five pizzas doesn't scale the discount unbounded.
 */

export interface ComboLine {
  item: MenuItemDTO;
  quantity: number;
}

export interface ComboResult {
  activeDeal: ComboDealDTO | null;
  savings: number;
  missingItems: string[];
  missingCategories: string[];
  missingQuantity: number;
  progress: number;
  isComplete: boolean;
}

const EMPTY: ComboResult = {
  activeDeal: null,
  savings: 0,
  missingItems: [],
  missingCategories: [],
  missingQuantity: 0,
  progress: 0,
  isComplete: false,
};

export function getActiveComboDeals(lines: ComboLine[], combos: ComboDealDTO[]): ComboResult {
  if (combos.length === 0 || lines.length === 0) return EMPTY;

  const cartCategories = new Set(lines.map((l) => l.item.category));
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);

  const cheapestByCategory = new Map<string, number>();
  for (const l of lines) {
    const prev = cheapestByCategory.get(l.item.category);
    if (prev === undefined || l.item.price < prev) cheapestByCategory.set(l.item.category, l.item.price);
  }

  const allSuffixes = new Set<string>();
  for (const c of combos) for (const r of c.requiredItems) allSuffixes.add(r.suffix);
  const cheapestBySuffix = new Map<string, number>();
  for (const l of lines) {
    for (const suffix of allSuffixes) {
      if (!l.item.id.endsWith(suffix)) continue;
      const prev = cheapestBySuffix.get(suffix);
      if (prev === undefined || l.item.price < prev) cheapestBySuffix.set(suffix, l.item.price);
    }
  }

  interface Scored {
    deal: ComboDealDTO;
    missingCategories: string[];
    missingItemLabels: string[];
    missingQuantity: number;
    progress: number;
    savings: number;
    complete: boolean;
    index: number;
  }

  const scored: Scored[] = combos.map((deal, index) => {
    const uniqueCats = Array.from(new Set(deal.categories));
    const matchedCats = uniqueCats.filter((c) => cartCategories.has(c));
    const missingCats = uniqueCats.filter((c) => !cartCategories.has(c));
    const qtyShort = Math.max(0, deal.minItems - totalQuantity);

    if (deal.requiredItems.length > 0) {
      const uniqueBySuffix = new Map<string, { suffix: string; label: string }>();
      for (const r of deal.requiredItems) if (!uniqueBySuffix.has(r.suffix)) uniqueBySuffix.set(r.suffix, r);
      const required = Array.from(uniqueBySuffix.values());
      const matchedReq = required.filter((r) => cheapestBySuffix.get(r.suffix) !== undefined);
      const missingReq = required.filter((r) => cheapestBySuffix.get(r.suffix) === undefined);
      const reqProgress = matchedReq.length / required.length;
      const oneComboSubtotal = matchedReq.reduce((s, r) => s + (cheapestBySuffix.get(r.suffix) ?? 0), 0);
      const savings = Math.round(oneComboSubtotal * (deal.discountPercent / 100));
      const complete = missingReq.length === 0 && qtyShort === 0;
      return {
        deal,
        missingCategories: complete ? [] : missingCats,
        missingItemLabels: missingReq.map((r) => r.label),
        missingQuantity: complete ? 0 : qtyShort,
        progress: complete ? 1 : reqProgress,
        savings,
        complete,
        index,
      };
    }

    const reqCount = uniqueCats.length;
    const progress = reqCount === 0 ? 0 : matchedCats.length / reqCount;
    const oneComboSubtotal = matchedCats.reduce((s, c) => s + (cheapestByCategory.get(c) ?? 0), 0);
    const savings = Math.round(oneComboSubtotal * (deal.discountPercent / 100));
    const complete = reqCount > 0 && missingCats.length === 0 && qtyShort === 0;
    return {
      deal,
      missingCategories: missingCats,
      missingItemLabels: [],
      missingQuantity: complete ? 0 : qtyShort,
      progress,
      savings,
      complete,
      index,
    };
  });

  const itemReqRank = (s: Scored) => (s.deal.requiredItems.length > 0 ? 0 : 1);
  const compareScored = (a: Scored, b: Scored) =>
    b.savings - a.savings || itemReqRank(a) - itemReqRank(b) || a.index - b.index;

  const complete = scored.filter((s) => s.complete);
  if (complete.length > 0) {
    complete.sort(compareScored);
    const w = complete[0];
    return {
      activeDeal: w.deal,
      savings: w.savings,
      missingCategories: [],
      missingItems: [],
      missingQuantity: 0,
      progress: 1,
      isComplete: true,
    };
  }

  const partial = scored.filter((s) => {
    if (s.complete) return false;
    const anyCategoryMatched = s.missingCategories.length < new Set(s.deal.categories).size;
    const anyItemMatched = s.deal.requiredItems.length
      ? s.missingItemLabels.length < new Set(s.deal.requiredItems.map((r) => r.suffix)).size
      : false;
    const qtyOnlyShort =
      s.missingCategories.length === 0 && s.missingItemLabels.length === 0 && s.missingQuantity > 0;
    return anyCategoryMatched || anyItemMatched || qtyOnlyShort;
  });
  if (partial.length === 0) return EMPTY;
  partial.sort(compareScored);
  const w = partial[0];
  return {
    activeDeal: w.deal,
    savings: w.savings,
    missingCategories: w.missingCategories,
    missingItems: w.missingItemLabels,
    missingQuantity: w.missingQuantity,
    progress: w.progress,
    isComplete: false,
  };
}
