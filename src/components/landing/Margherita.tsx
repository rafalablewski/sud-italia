import { type ReactNode } from "react";

/**
 * Deterministic SVG Margherita for the redesigned hero variants.
 *
 * Seeded PRNG (no Math.random) → identical markup on every render, so it's
 * safe against hydration mismatch. This is placeholder art that keeps the
 * mockups self-contained; production swaps in owned food photography at the
 * same composition. Only one hero variant renders at a time, so the gradient
 * ids are unique on the page.
 */
function prng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483646;
}

export function Margherita({ seed = 91237, className }: { seed?: number; className?: string }) {
  const r = prng(seed);
  const cx = 300;
  const cy = 300;
  const round = (n: number) => Math.round(n);
  const op = (n: number) => Math.round(n * 100) / 100;

  const char: ReactNode[] = [];
  const moz: ReactNode[] = [];
  const basil: ReactNode[] = [];

  // Leopard char on the cornicione (rim).
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const rad = 234 + r() * 30;
    const x = round(cx + Math.cos(a) * rad);
    const y = round(cy + Math.sin(a) * rad);
    char.push(
      <ellipse key={`c${i}`} cx={x} cy={y} rx={round(5 + r() * 12)} ry={round(4 + r() * 8)}
        fill="#552c14" opacity={op(0.18 + r() * 0.4)} transform={`rotate(${round(r() * 180)} ${x} ${y})`} />,
    );
  }
  // Fior di latte pools.
  for (let j = 0; j < 13; j++) {
    const b = r() * Math.PI * 2;
    const rd = r() * 168;
    const mx = round(cx + Math.cos(b) * rd);
    const my = round(cy + Math.sin(b) * rd);
    const mrx = round(26 + r() * 22);
    const mry = round(21 + r() * 16);
    moz.push(
      <g key={`m${j}`} transform={`rotate(${round(r() * 180)} ${mx} ${my})`}>
        <ellipse cx={mx} cy={my} rx={mrx} ry={mry} fill="url(#m-moz)" />
        <ellipse cx={round(mx - mrx * 0.26)} cy={round(my - mry * 0.32)} rx={round(mrx * 0.34)} ry={round(mry * 0.24)} fill="#ffffff" opacity={0.5} />
      </g>,
    );
  }
  // Basil leaves.
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2 + r() * 0.7;
    const lr = 64 + r() * 116;
    const lx = round(cx + Math.cos(ang) * lr);
    const ly = round(cy + Math.sin(ang) * lr);
    basil.push(
      <g key={`b${k}`} transform={`translate(${lx} ${ly}) rotate(${round(r() * 360)}) scale(${op(0.9 + r() * 0.55)})`}>
        <path d="M0,-23 C15,-15 15,15 0,23 C-15,15 -15,-15 0,-23 Z" fill="#41803f" />
        <path d="M0,-18 L0,18" stroke="#2c5a30" strokeWidth={1.5} />
        <path d="M0,-9 L7,-4 M0,1 L8,6 M0,-9 L-7,-4 M0,1 L-8,6" stroke="#2c5a30" strokeWidth={1} fill="none" opacity={0.6} />
      </g>,
    );
  }

  return (
    <svg className={className} viewBox="0 0 600 620" role="img"
      aria-label="Neapolitan Margherita — leopard-charred crust, fior di latte and fresh basil">
      <defs>
        <radialGradient id="m-crust" cx="50%" cy="45%" r="53%">
          <stop offset="58%" stopColor="#EEC07C" /><stop offset="80%" stopColor="#D2913F" /><stop offset="100%" stopColor="#9C541F" />
        </radialGradient>
        <radialGradient id="m-sauce" cx="50%" cy="46%" r="45%">
          <stop offset="0%" stopColor="#C63C27" /><stop offset="76%" stopColor="#A52C1C" /><stop offset="100%" stopColor="#7e2114" />
        </radialGradient>
        <radialGradient id="m-moz" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#FFFEF7" /><stop offset="66%" stopColor="#F3E6C7" /><stop offset="100%" stopColor="#E4CF9F" />
        </radialGradient>
        <filter id="m-blur"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <ellipse cx="300" cy="350" rx="274" ry="250" fill="#3d2817" opacity="0.22" filter="url(#m-blur)" />
      <circle cx="300" cy="300" r="272" fill="url(#m-crust)" />
      <circle cx="300" cy="300" r="214" fill="url(#m-sauce)" />
      {moz}{basil}{char}
      <circle cx="300" cy="300" r="272" fill="none" stroke="#7a3f1c" strokeWidth={2} opacity={0.28} />
    </svg>
  );
}
