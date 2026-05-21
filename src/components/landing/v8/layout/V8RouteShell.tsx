import "../v8.css";
import { V8Header } from "./V8Header";
import { V8LiveTicker } from "./V8LiveTicker";
import { V8Footer } from "./V8Footer";
import { V8FloatingCart } from "./V8FloatingCart";

/**
 * Shared v8 chrome wrapper used by every public route that should
 * render in v8 style (home, location pages, etc.). Renders the v8
 * header + ticker + footer around `children` inside a `.v8-frame`
 * scope so the parchment design tokens resolve. Also mounts the
 * floating "Il tuo carrello" pill so it follows the customer down
 * the page once they've added an item.
 */
export function V8RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="v8-frame">
      <V8Header />
      <V8LiveTicker />
      <main className="v8-main">{children}</main>
      <V8Footer />
      <V8FloatingCart />
    </div>
  );
}
