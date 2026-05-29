import type { Allergen } from "@/data/types";

// V8 Trattoria allergen glyphs — hand-drawn line SVGs, one per
// allergen in the EU FIR / UK FIR 14-allergen list (plus `lupin` and
// `molluscs`). Strokes use `currentColor` so the icon picks up the
// surrounding chip colour — on the allergen chip row that's oxblood,
// which keeps the icon vocabulary consistent with the rest of the V8
// surfaces (cart, pin, chat, chef hat, basil sprig) instead of the
// full-colour OS emoji the chips shipped with before.
//
// Each glyph is drawn on an 18×18 viewBox, 1.3px stroke, rendered at
// 16×16. Add a new allergen here by extending `Allergen` in
// `src/data/types.ts` and adding a case below.

interface AllergenIconProps {
  allergen: Allergen;
  size?: number;
}

export function AllergenIcon({ allergen, size = 16 }: AllergenIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="v8-detail-allergen-glyph"
    >
      {GLYPHS[allergen]}
    </svg>
  );
}

const STROKE = 1.3;
const FAINT = 1;

const GLYPHS: Record<Allergen, React.ReactNode> = {
  // Wheat sheaf — central stalk with three pairs of grain spikes.
  gluten: (
    <>
      <path d="M9 15 L9 3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M9 6 C 7.5 5, 6.5 4, 6 3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M9 6 C 10.5 5, 11.5 4, 12 3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M9 9 C 7.5 8, 6.5 7, 6 6" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M9 9 C 10.5 8, 11.5 7, 12 6" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M9 12 C 7.5 11, 6.5 10, 6 9" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M9 12 C 10.5 11, 11.5 10, 12 9" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </>
  ),

  // Milk carton — pitched-roof box with a fill line.
  dairy: (
    <>
      <path d="M5 6 L13 6 L13 15 L5 15 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M5 6 L7 3 L11 3 L13 6" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M5 10 L13 10" stroke="currentColor" strokeWidth={FAINT} opacity="0.5" />
    </>
  ),

  // Egg — simple ovoid.
  eggs: (
    <path d="M9 3 C 5.5 3, 4 8, 4.5 12 C 5 15, 13 15, 13.5 12 C 14 8, 12.5 3, 9 3 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
  ),

  // Fish — almond body, triangular tail, eye dot.
  fish: (
    <>
      <path d="M4 9 C 5 6, 9 5, 12 7 L 15 5.5 L 15 12.5 L 12 11 C 9 13, 5 12, 4 9 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <circle cx="11" cy="9" r="0.7" fill="currentColor" />
      <path d="M6 9 C 7 8, 8 8, 9 9" stroke="currentColor" strokeWidth={FAINT} fill="none" opacity="0.5" />
    </>
  ),

  // Shrimp — curled body, tail flick, antenna, eye.
  shellfish: (
    <>
      <path d="M4 11 C 4 7, 8 5, 12 6.5 C 14 7.5, 14 11, 12 12 L 6 13 C 5 13, 4 12, 4 11 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M6 13 C 5 14, 4 15, 3 15" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <path d="M12 6.5 C 13 5.5, 14 4.5, 15 4.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <circle cx="11" cy="9" r="0.6" fill="currentColor" />
    </>
  ),

  // Tree nut — almond shape with a centre seam.
  nuts: (
    <>
      <path d="M9 3 C 5.5 3, 4 7, 5 11 C 6 14, 12 14, 13 11 C 14 7, 12.5 3, 9 3 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M9 3 L 9 13" stroke="currentColor" strokeWidth={FAINT} opacity="0.5" />
    </>
  ),

  // Peanut shell — two bumps with a waist + faint divider.
  peanuts: (
    <>
      <path d="M9 3 C 6 3, 4.5 4.5, 4.5 6.5 C 4.5 7.5, 5.5 8.5, 5.5 8.5 C 5.5 8.5, 4.5 9.5, 4.5 11 C 4.5 13.5, 6 15, 9 15 C 12 15, 13.5 13.5, 13.5 11 C 13.5 9.5, 12.5 8.5, 12.5 8.5 C 12.5 8.5, 13.5 7.5, 13.5 6.5 C 13.5 4.5, 12 3, 9 3 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M5.5 8.5 L 12.5 8.5" stroke="currentColor" strokeWidth={FAINT} opacity="0.5" />
    </>
  ),

  // Soybean pod — curved pod with two beans inside.
  soy: (
    <>
      <path d="M4 12 C 4 9, 6 5, 10 5 C 13 5, 14 7, 14 10 C 14 12, 12 14, 9 14 C 6 14, 4 13, 4 12 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <circle cx="7.2" cy="10" r="1.2" stroke="currentColor" strokeWidth={FAINT} fill="none" />
      <circle cx="10.8" cy="10" r="1.2" stroke="currentColor" strokeWidth={FAINT} fill="none" />
    </>
  ),

  // Celery stalk — paired stems with leaves at the top.
  celery: (
    <>
      <path d="M7 15 L7 5 C 7 3.5, 8 3, 9 3 C 10 3, 11 3.5, 11 5 L 11 15" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M9 3 L 9 15" stroke="currentColor" strokeWidth={FAINT} opacity="0.5" />
      <path d="M5.5 6 L 7 5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" />
      <path d="M11 5 L 12.5 6" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" />
    </>
  ),

  // Mustard jar — small lidded jar.
  mustard: (
    <>
      <path d="M6 7 L 12 7 L 12 15 L 6 15 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M7 7 L 7 5 L 11 5 L 11 7" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M5.5 7 L 12.5 7" stroke="currentColor" strokeWidth={FAINT} opacity="0.5" />
      <path d="M8 11 L 10 11" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" opacity="0.6" />
    </>
  ),

  // Sesame — three teardrop seeds clustered.
  sesame: (
    <>
      <path d="M5.5 7 C 4.5 7.5, 4.5 9.5, 6.5 9.5 C 7.5 9.5, 7.5 7.5, 6.5 7 Z" stroke="currentColor" strokeWidth={FAINT} fill="none" strokeLinejoin="round" />
      <path d="M11 5.5 C 10 6, 10 8, 12 8 C 13 8, 13 6, 12 5.5 Z" stroke="currentColor" strokeWidth={FAINT} fill="none" strokeLinejoin="round" />
      <path d="M8 11 C 7 11.5, 7 13.5, 9 13.5 C 10 13.5, 10 11.5, 9 11 Z" stroke="currentColor" strokeWidth={FAINT} fill="none" strokeLinejoin="round" />
    </>
  ),

  // Wine glass — bowl + stem + base.
  sulfites: (
    <>
      <path d="M6 4 L 12 4 L 11 9 C 11 11, 10 12, 9 12 C 8 12, 7 11, 7 9 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M9 12 L 9 15" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M6 15 L 12 15" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),

  // Lupin — central stem with alternating flower buds.
  lupin: (
    <>
      <path d="M9 15 L 9 3" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M8 5 C 7 4.5, 6.5 4.5, 6 4.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M8 7 C 7 6.5, 6.5 6.5, 6 6.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M8 9 C 7 8.5, 6.5 8.5, 6 8.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M8 11 C 7 10.5, 6.5 10.5, 6 10.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M10 6 C 11 5.5, 11.5 5.5, 12 5.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M10 8 C 11 7.5, 11.5 7.5, 12 7.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M10 10 C 11 9.5, 11.5 9.5, 12 9.5" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
    </>
  ),

  // Octopus — bulbous head + four tentacles + two eye dots.
  molluscs: (
    <>
      <path d="M5 8 C 5 4.5, 13 4.5, 13 8 C 13 9.5, 13 11, 12 11 L 6 11 C 5 11, 5 9.5, 5 8 Z" stroke="currentColor" strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <path d="M6 11 C 6 13, 5 14, 4 15" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M8 11 C 8 13, 8 14.5, 7 15" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M10 11 C 10 13, 10 14.5, 11 15" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <path d="M12 11 C 12 13, 13 14, 14 15" stroke="currentColor" strokeWidth={FAINT} strokeLinecap="round" fill="none" />
      <circle cx="7.5" cy="7.5" r="0.55" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="0.55" fill="currentColor" />
    </>
  ),
};
