import "../themes/homepage/index.css";
import { Lora, Cormorant_Garamond } from "next/font/google";
import { THEME_SKINS } from "@/lib/theme-skins";
import { HomepageSkinSync } from "@/components/layout/HomepageSkinSync";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { AbandonedCartBanner } from "@/components/cart/AbandonedCartBanner";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartPresenceSync } from "@/components/cart/CartPresenceSync";
import { FloatingCartButton } from "@/components/cart/FloatingCartButton";
import { AddToCartToast } from "@/components/cart/AddToCartToast";
import { ItemDetailDrawer } from "@/components/location/ItemDetailDrawer";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { SurveyPrompt } from "@/components/survey/SurveyPrompt";
import { SurveyTriggerEngine } from "@/components/survey/SurveyTriggerEngine";
import { CustomerProvider } from "@/store/customer";
import { SimulationBanner } from "@/components/system/SimulationBanner";

// Homepage fonts — owned by the Homepage theme. Loaded here (not in the
// root layout) so a weight / subset change can't drift into Admin or
// Core. The exposed CSS variables are namespaced (--font-homepage-*) so
// the storefront's Tailwind tokens (themes/homepage/tokens.css) resolve
// against THIS scope; admin routes can change their own type stack in
// admin/layout.tsx without touching storefront type.
//
// Pair: Lora (body) + Cormorant Garamond (display) — the V8 Trattoria
// editorial serif duo, matching the mockup at public/mockups/cart.html.
const homepageBody = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-homepage-body",
  display: "swap",
});
const homepageHeading = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-homepage-heading",
  display: "swap",
});

// next/font's `.variable` class only sets `--font-homepage-*` on the element it's
// applied to (the wrapping <div> below). But Tailwind's @theme inline block in
// themes/homepage/tokens.css declares `--font-body: var(--font-homepage-body, "Lora")…`
// at `:root`. CSS substitutes nested vars at the *declaring* element's cascade,
// not the consumer's — so the inner `var(--font-homepage-body)` is looked up at
// :root, where the wrapping div hasn't injected anything, and the literal "Lora"
// fallback wins. Result: body content silently degrades to the inner-fallback chain
// (no metric-matched "Lora Fallback" face), and portalled overlays (Rule #4 mounts
// modals to document.body, outside the wrapping div) get the same.
//
// Inject the next/font font-family chain as CSS variables on `:root` via an SSR'd
// <style> tag so the inner var resolves on the same element where --font-body lives:
//   1. body { font-family: var(--font-body) } resolves to the full metric-matched
//      chain (`"Lora", "Lora Fallback", Georgia, …`) — no FOUT step through Georgia.
//   2. Portalled modals (CartDrawer, ItemDetail, etc.) inherit Lora natively from
//      body without needing per-component font-* classes.
//
// Server-rendered → no flash. Scoped to the (public) route group → admin / kitchen /
// franchisee routes don't load this layout, so :root stays untouched there.
const fontVarsOnRoot = `:root{--font-homepage-body:${homepageBody.style.fontFamily};--font-homepage-heading:${homepageHeading.style.fontFamily};}`;

// Pre-paint storefront-skin boot. Reads the skin cached on a previous visit and
// sets `data-skin` on <body> before first paint so repeat visits don't flash
// the default Trattoria theme before HomepageSkinSync confirms it from the DB.
// Same pattern as Core's `core-theme` / Admin's `sud-admin-theme` boot scripts.
// The allowed-id list is derived from the registry so a removed skin can't be
// re-applied from a stale cache. Public pages stay static — the authoritative
// value still arrives via /api/settings/public (HomepageSkinSync).
const homepageSkinIds = JSON.stringify(THEME_SKINS.homepage.map((s) => s.id));
const skinBoot = `(function(){try{var v=localStorage.getItem('sud-homepage-skin');var ok=${homepageSkinIds};if(v&&v!=='default'&&ok.indexOf(v)>-1){document.body.setAttribute('data-skin',v);}}catch(e){}})();`;

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerProvider>
      <style dangerouslySetInnerHTML={{ __html: fontVarsOnRoot }} />
      <script dangerouslySetInnerHTML={{ __html: skinBoot }} />
      <HomepageSkinSync />
      <div className={`homepage-canvas ${homepageBody.variable} ${homepageHeading.variable} flex flex-col flex-1`}>
        <SimulationBanner />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <LayoutGate flag="showChatWidget">
          <ChatWidget />
        </LayoutGate>
        {/* Single-mount cart family. Every trigger surface
            (CartButton, FloatingCartButton, AbandonedCartBanner, the
            "Details" button on a menu card) opens these instances via
            useCartUIStore.setDrawerOpen / setDetailItem instead of
            mounting its own copy. ItemDetailDrawer (Step 13) joins
            CartDrawer + FloatingCartButton + AddToCartToast (Steps 11,
            11+, 12) at the layout level. */}
        <CartDrawer />
        <FloatingCartButton />
        <AddToCartToast />
        <ItemDetailDrawer />
        <AbandonedCartBanner />
        <CartPresenceSync />
        {/* NPS-style Pulse micro-surveys. The engine watches browsing
            signals (prolonged browse, exit intent, returning visitor…)
            and the prompt renders the elected star survey. Both behind
            the single showNpsSurvey kill-switch. */}
        <LayoutGate flag="showNpsSurvey">
          <SurveyTriggerEngine />
          <SurveyPrompt />
        </LayoutGate>
      </div>
    </CustomerProvider>
  );
}
