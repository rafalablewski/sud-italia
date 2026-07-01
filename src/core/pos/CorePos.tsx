"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "@/shared/LocationContext";
import { usePolling } from "@/lib/usePolling";
import { idempotentFetch } from "@/lib/idempotentFetch";
import { durableMutate, usePendingWriteCount } from "@/store/writeQueue";
import { CoreShell } from "@/core/shell/CoreShell";
import { useSelection } from "@/core/shell/SelectionContext";
import { ExpandIcon } from "@/core/shell/toolIcons";
import { useCoreToast } from "@/core/ui/Toast";
import { CoreDialog } from "@/core/ui/Dialog";
import { CoreQrQueue } from "@/core/pos/CoreQrQueue";
import {
  MENU_CATEGORY_LABELS,
  type CartItem,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
  type ModifierGroup,
  type PosCourse,
  type PosTab,
  type PosTabDiscount,
  type PosTabLine,
  type SelectedModifier,
} from "@/data/types";
import { getActiveComboDeals, getCartSuggestions, effectiveUnitPrice, type UpsellConfig } from "@/lib/upsell";
import { manualDiscountGrosze } from "@/lib/pos-discount";
import { posLineKey } from "@/lib/pos-line";
import { POS_COURSE_LABELS, POS_COURSE_ORDER, courseOf, defaultCourseForCategory, groupLinesByCourse } from "@/lib/pos-coursing";

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "desserts", "drinks"];

/**
 * Category-rail glyphs — the rail is pure icon-only (collapsed), so each
 * category (+ the Popular/All pseudo-categories) needs a distinct icon; the
 * label rides along as a `title`/`aria-label` tooltip. One 24-viewBox,
 * 1.9-weight line set, matching the Core icon language.
 */
const CAT_ICON: Record<string, ReactNode> = {
  popular: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.7l5.9-.9z" />,
  all: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 3.2 3.6 18.5a1 1 0 0 0 1 1.5h14.8a1 1 0 0 0 .9-1.5z" />
      <path d="M5.8 10.4h12.4" />
      <circle cx="10" cy="14" r="1" />
      <circle cx="14" cy="14.5" r="1" />
      <circle cx="12" cy="9" r="1" />
    </>
  ),
  pasta: (
    <>
      <path d="M4 11h16v1a8 8 0 0 1-16 0z" />
      <path d="M2.5 20h19" />
      <path d="M8 11c0-3 .5-6 1.5-7M12 11c0-3.5.3-6.5 1.3-8M16 11c0-3 .5-5.5 1.4-7" />
    </>
  ),
  antipasti: (
    <>
      <ellipse cx="12" cy="13" rx="8.5" ry="4" />
      <circle cx="9" cy="12.4" r="1.1" />
      <circle cx="13" cy="13.4" r="1.1" />
      <circle cx="15.5" cy="12" r="1.1" />
      <path d="M8 9.2c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4" />
    </>
  ),
  panini: (
    <>
      <path d="M3.5 9.5c0-2 3.8-3.5 8.5-3.5s8.5 1.5 8.5 3.5z" />
      <path d="M3.5 14.5c0 2 3.8 3.5 8.5 3.5s8.5-1.5 8.5-3.5z" />
      <path d="M4.5 11.8c2.4 1 12.6 1 15 0" />
    </>
  ),
  desserts: (
    <>
      <path d="M6 20h12l-1-8H7z" />
      <path d="M9.5 12c0-2 1-3 2.5-3s2.5 1 2.5 3" />
      <path d="M12 6.2V4M12 4a1.2 1.2 0 1 0 0-.1z" />
    </>
  ),
  drinks: (
    <>
      <path d="M6 4h12l-1.5 5.5a5 5 0 0 1-9 0z" />
      <path d="M12 15v4M8.5 20h7" />
    </>
  ),
};
const CHANNELS: { key: FulfillmentType; label: string }[] = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];
const TAG_META: Record<MenuItem["tags"][number], { label: string; cls: string }> = {
  vegetarian: { label: "V", cls: "veg" },
  vegan: { label: "VG", cls: "veg" },
  spicy: { label: "S", cls: "hot" },
  "gluten-free": { label: "GF", cls: "fast" },
};

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  hero: { label: "Hero", cls: "hero" },
  "profit-driver": { label: "Profit", cls: "profit" },
  anchor: { label: "Anchor", cls: "anchor" },
  lto: { label: "LTO", cls: "lto" },
};
const promiseMin = (sec?: number): string | null => (sec && sec > 0 ? `~${Math.round(sec / 60)}m` : null);

/** A line note that names an allergy / dietary risk gets the amber safety
 *  treatment on the check + KDS — it can't read as a normal preference. */
const ALLERGY_NOTE_RE = /allerg|gluten|coeliac|celiac|nut|dairy|lactose|shellfish|anaphyl|epipen|intoleran/i;

/** Quick-pick note chips offered in the line editor, on top of free text. The
 *  allergy chip is special — it prefixes a flag the kitchen can't miss. */
const NOTE_CHIPS = ["No cheese", "Light sauce", "Extra crispy", "Well done", "On the side", "Cut in half"];
const ALLERGY_CHIP = "⚠ ALLERGY: ";

/** Tip presets (percent of the bill) offered in the tender sheet. */
const TIP_PCTS = [0, 5, 10, 15];
/** Comp reason codes (audit §3 — Quality · Wait · Goodwill · Error). All are
 *  recorded server-side as `manager_comp` (the note carries the specific
 *  reason), so the per-shift comp cap counts them all. */
const COMP_REASONS = ["Quality", "Wait", "Goodwill", "Error"];

/** Client tender payload sent to PATCH /api/admin/pos/orders. The server
 *  re-derives the bill and clamps every figure — this is only a proposal. */
type TenderInput = {
  tipGrosze?: number;
  compGrosze?: number;
  compNote?: string;
  payments?: { method: "cash" | "card"; amount: number }[];
  cashTenderedGrosze?: number;
  defaultMethod?: "cash" | "card";
  compOverridePin?: string;
};

const zl = (g: number) => (g / 100).toFixed(2).replace(".", ",");
const fmtPLN = (g: number) => `${zl(g)} zł`;

/** Inline line-glyph (core uses its own SVGs, not lucide). */
function Gly({ children }: { children: ReactNode }) {
  return (
    <svg className="core-glyph" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/**
 * Core · POS — the till, wired to the real engine 1:1. Multi-tab open checks
 * (`/api/admin/pos/tabs`), add-to-ticket with category coursing, combo discount
 * + cross-sell (`@/lib/upsell`), Send-to-KDS / Fire-course / Charge
 * (`/api/admin/pos/orders`). The server owns the total + the orderId; the till
 * only ever sends item ids + quantities. Fresh core- UI; zero admin styling.
 */
export function CorePos({
  menusByLocation,
  upsellByLocation,
  embedded = false,
  initialTableId,
  onClose,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
  /** Mounted inside the Floor's check panel (no CoreShell chrome) rather than as
   *  the standalone /core/pos surface. */
  embedded?: boolean;
  /** Open (or focus) this table's dine-in check on mount — the Floor passes the
   *  tapped table so the check opens over the floor with no navigation. */
  initialTableId?: string;
  /** Close the embedded panel (back to the floor). */
  onClose?: () => void;
}) {
  const { location } = useLocation();
  const toast = useCoreToast();
  const { select } = useSelection();
  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  // Live 86 set — polled from the kitchen's authoritative override list so a
  // sold-out item greys/strikes/sinks on the till within one poll, no reload.
  // Declared up here because the availability filter below reads it.
  const [eightySix, setEightySix] = useState<Set<string>>(new Set());
  const config = upsellByLocation[pageLoc] ?? null;
  const byId = useCallback((id: string) => menu.find((m) => m.id === id), [menu]);

  const categories = useMemo(() => {
    const present = new Set(menu.filter((m) => m.available).map((m) => m.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [menu]);
  // ★ Popular / Smart — top item ids by real order frequency for the current
  // daypart (server-computed). Shown as the FIRST category so the ~8 SKUs that
  // are the bulk of taps are zero-scroll. Empty → the chip is simply hidden.
  const [popularIds, setPopularIds] = useState<string[]>([]);
  const loadPopular = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pos/popular?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const d = (await res.json()) as { popular?: string[] };
      setPopularIds(d.popular ?? []);
    } catch {
      /* non-fatal — the till just drops the Popular chip */
    }
  }, [pageLoc]);
  useEffect(() => {
    void loadPopular();
  }, [loadPopular]);
  // Popular items present on THIS menu, most-ordered first (ids the menu knows).
  const popularItems = useMemo(
    () => popularIds.map((id) => menu.find((m) => m.id === id)).filter((m): m is MenuItem => !!m),
    [popularIds, menu],
  );
  const hasPopular = popularItems.length > 0;
  const [cat, setCat] = useState<MenuCategory | "all" | "popular" | null>(null);
  const catValid = (c: typeof cat) =>
    c && (c === "all" || (c === "popular" && hasPopular) || (c !== "popular" && categories.includes(c)));
  const activeCat = catValid(cat) ? cat : hasPopular ? "popular" : categories[0] ?? null;

  // --- Tabs (open checks), server-backed -----------------------------------
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Count of PUTs currently on the wire. The cross-till poll must skip while a
  // save is in flight — the debounce timer clears itself *before* the fetch
  // resolves, so guarding on `persistTimers` alone leaves a window where a poll
  // reads the pre-write server state and reverts the local edit (the line
  // "disappears, then reappears" a few seconds later on the next poll).
  const pendingSaves = useRef(0);
  // Real ids of optimistic checks that just reconciled from a `tmp-` id. We
  // can't persist any items rung up during the round-trip from inside the
  // `setTabs` updater (its return value isn't readable synchronously), so we
  // record the id and flush it from an effect once the swap has committed.
  const reconciledTabsRef = useRef<string[]>([]);
  // Ids of tabs mutated locally this commit, awaiting persist. `mutateActive`
  // computes the new tab *inside* the functional setState updater (off the
  // freshest `prev`, never a stale render closure), so it can't read the result
  // back synchronously — it records the id here and the flush effect persists
  // the committed value. This is what stops rapid taps from losing increments
  // (ring 3, the till must keep 3) — the old code computed off a stale `tabs`
  // snapshot, so back-to-back taps overwrote each other's count.
  const pendingPersistRef = useRef<Set<string>>(new Set());
  // Voided checks the server hasn't confirmed gone yet. The cross-till poll's GET
  // can snapshot a check BEFORE a void and resolve AFTER it (the `pendingSaves`
  // guard only blocks NEW polls, and aborting only helps while the fetch is still
  // on the wire — not in the window where the response already arrived and is
  // about to merge). So we filter every incoming list (poll + hydrate) against
  // this set: a voided id stays hidden until the server stops returning it
  // (delete confirmed → drop it), and is released immediately if the DELETE
  // actually fails (so a genuinely-failed void reconciles back to reality). No
  // timer — the lifecycle is the server's answer, not a guessed TTL.
  const voidedIds = useRef<Set<string>>(new Set());
  const withoutVoided = useCallback((incoming: PosTab[]): PosTab[] => {
    const set = voidedIds.current;
    if (set.size === 0) return incoming;
    const incomingIds = new Set(incoming.map((t) => t.id));
    for (const id of set) if (!incomingIds.has(id)) set.delete(id); // server confirmed gone
    return set.size === 0 ? incoming : incoming.filter((t) => !set.has(t.id));
  }, []);
  // Temp ids voided WHILE their create-POST is still on the wire. Voiding a `tmp-`
  // check can't hit the server (it has no real id yet), so without this the POST
  // lands a beat later, creates the check server-side, and the next cross-till
  // poll resurrects it — a check the operator already voided comes back seconds
  // later (the wider the POST round-trip, e.g. a cold serverless instance, the
  // more reliably it happens). newTab consults this once the POST returns and
  // deletes the real check instead of surfacing it.
  const pendingCreateVoids = useRef<Set<string>>(new Set());
  // Reconcile a polled tab list against local state: incoming defines
  // membership (tabs added/closed on other tills), but a locally-edited tab
  // with a newer updatedAt wins, so a poll that was already in flight when we
  // wrote can't clobber the fresher edit. Optimistic `tmp-` checks (a create
  // whose POST hasn't returned) are never on the server yet, so carry them over
  // rather than let a poll drop a check that's still being opened.
  const mergeTabs = useCallback((incomingRaw: PosTab[]) => {
    const incoming = withoutVoided(incomingRaw);
    setTabs((local) => {
      const byId = new Map(local.map((t) => [t.id, t] as const));
      const serverIds = new Set(incoming.map((t) => t.id));
      const merged = incoming.map((inc) => {
        const mine = byId.get(inc.id);
        if (mine && mine.updatedAt && inc.updatedAt && mine.updatedAt > inc.updatedAt) return mine;
        return inc;
      });
      for (const t of local) if (t.id.startsWith("tmp-") && !serverIds.has(t.id)) merged.push(t);
      return merged;
    });
  }, [withoutVoided]);

  const loadTabs = useCallback(async () => {
    if (!pageLoc) return;
    try {
      // no-store: a cached poll read would re-serve a pre-void snapshot and the
      // merge below would restore every just-voided check.
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { tabs?: PosTab[] } = await res.json();
      const list = withoutVoided(Array.isArray(data.tabs) ? data.tabs : []);
      // Initial hydrate, but never drop a check the user opened WHILE this fetch
      // was in flight: at hydrate time any local tab the server response omits is
      // an optimistic check still being created (its POST hasn't landed in this
      // stale read), so carry it over instead of clobbering with a blind replace.
      setTabs((local) => {
        const serverIds = new Set(list.map((t) => t.id));
        return [...list, ...local.filter((t) => !serverIds.has(t.id))];
      });
      // Keep the active selection if it's a check we still hold (the one just
      // opened); otherwise default to the first server tab.
      setActiveTabId((cur) => cur ?? list[0]?.id ?? null);
    } catch {
      /* non-fatal */
    } finally {
      setHydrated(true);
    }
  }, [pageLoc, withoutVoided]);

  useEffect(() => {
    setTabs([]);
    setActiveTabId(null);
    void loadTabs();
  }, [loadTabs]);

  // Live cross-till sync — visibility-aware poll, skipped while a local edit is
  // mid-debounce or its save is still on the wire (else the poll reverts it).
  usePolling(
    async () => {
      if (!pageLoc || persistTimers.current.size > 0 || pendingSaves.current > 0) return;
      try {
        const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data: { tabs?: PosTab[] } = await res.json();
        // Filter voided-but-unconfirmed ids out of the active-id pick too, so a
        // stale snapshot can't re-select a check the operator just dropped.
        const list = withoutVoided(Array.isArray(data.tabs) ? data.tabs : []);
        mergeTabs(list);
        setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
      } catch {
        /* non-fatal */
      }
    },
    5000,
    { enabled: !!pageLoc },
  );

  useEffect(() => {
    const timers = persistTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const persistTab = useCallback((tab: PosTab) => {
    // Optimistic checks carry a client `tmp-` id until the POST that creates
    // them server-side returns the real one. Never PUT under a temp id — it
    // would mint a phantom server tab that the cross-till poll then resurrects.
    // Edits made in that sub-second window stay local and are flushed once,
    // under the real id, at reconcile time (see `newTab`).
    if (tab.id.startsWith("tmp-")) return;
    const timers = persistTimers.current;
    const existing = timers.get(tab.id);
    if (existing) clearTimeout(existing);
    timers.set(
      tab.id,
      setTimeout(() => {
        timers.delete(tab.id);
        // Mark the save in flight until the PUT settles so the cross-till poll
        // can't read a stale list in the gap between debounce-clear and commit.
        pendingSaves.current += 1;
        void fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(tab.locationSlug)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: tab.id,
            name: tab.name,
            channel: tab.channel,
            status: tab.status,
            items: tab.items,
            tableId: tab.tableId ?? null,
            covers: tab.covers,
            address: tab.address ?? null,
            customerPhone: tab.customerPhone ?? null,
            customerName: tab.customerName ?? null,
            discount: tab.discount ?? null,
            sentKds: tab.sentKds,
            coursed: tab.coursed ?? null,
          }),
        })
          .catch(() => {})
          .finally(() => {
            pendingSaves.current = Math.max(0, pendingSaves.current - 1);
          });
      }, 350),
    );
  }, []);

  const getActive = useCallback(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);

  const mutateActive = useCallback(
    (mutator: (t: PosTab) => PosTab) => {
      const id = activeTabId;
      if (!id) return;
      // Compute the next tab *inside* the functional updater so it always builds
      // off the freshest committed state — never a stale render closure. This is
      // the fix for "rang 3, only 2 stuck": back-to-back taps used to each read
      // the same stale `tabs` snapshot and overwrite one another's count. The
      // persist (a fetch) can't run in here — it would double-fire under
      // StrictMode / concurrent rendering and can't read the result back — so we
      // just mark the id dirty and let the flush effect persist the committed value.
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...mutator(t), updatedAt: new Date().toISOString() } : t)),
      );
      pendingPersistRef.current.add(id);
    },
    [activeTabId],
  );

  // Flush locally-mutated tabs once their edit has committed to `tabs`. Reading
  // the committed value here (rather than from a stale closure in mutateActive)
  // guarantees we persist the accumulated quantity, not a stale interim one.
  useEffect(() => {
    if (pendingPersistRef.current.size === 0) return;
    const ids = [...pendingPersistRef.current];
    pendingPersistRef.current.clear();
    for (const id of ids) {
      const tab = tabs.find((t) => t.id === id);
      if (tab) persistTab(tab);
    }
  }, [tabs, persistTab]);

  // Quick-add (tap a product card with no modifier groups). Stacks onto the
  // bare line for that item — a customised line of the same item (its key
  // carries the modifier/note signature) is never touched.
  const addLine = useCallback(
    (id: string) =>
      mutateActive((t) => {
        const items = [...t.items];
        const i = items.findIndex((l) => posLineKey(l) === id);
        if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + 1) };
        else {
          const c = byId(id)?.category;
          items.push({ menuItemId: id, quantity: 1, course: c ? defaultCourseForCategory(c) : "main" });
        }
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive, byId],
  );

  // Add (or save an edit of) a configured line — chosen modifiers + note + qty.
  // `replaceKey` is the line being edited; absent = a fresh add. Merges onto an
  // existing line with the same composite identity.
  const addConfiguredLine = useCallback(
    (menuItemId: string, modifiers: SelectedModifier[] | undefined, notes: string | undefined, qty: number, replaceKey?: string) =>
      mutateActive((t) => {
        const cleanMods = modifiers && modifiers.length ? modifiers : undefined;
        const cleanNotes = notes && notes.trim() ? notes.trim().slice(0, 200) : undefined;
        const c = byId(menuItemId)?.category;
        const prior = replaceKey ? t.items.find((l) => posLineKey(l) === replaceKey) : undefined;
        const built: PosTabLine = {
          menuItemId,
          quantity: Math.max(1, Math.min(99, Math.round(qty))),
          course: prior?.course ?? (c ? defaultCourseForCategory(c) : "main"),
          ...(cleanMods ? { modifiers: cleanMods } : {}),
          ...(cleanNotes ? { notes: cleanNotes } : {}),
        };
        const newKey = posLineKey(built);
        // Drop the line being edited, then merge the rebuilt line by its new key.
        const items = t.items.filter((l) => posLineKey(l) !== replaceKey);
        const i = items.findIndex((l) => posLineKey(l) === newKey);
        if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + built.quantity) };
        else items.push(built);
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive, byId],
  );

  const changeQty = useCallback(
    (key: string, delta: number) =>
      mutateActive((t) => ({
        ...t,
        items: t.items
          .map((l) => (posLineKey(l) === key ? { ...l, quantity: l.quantity + delta } : l))
          .filter((l) => l.quantity > 0),
        sentKds: false,
      })),
    [mutateActive],
  );

  const setChannel = useCallback(
    (c: FulfillmentType) =>
      mutateActive((t) => ({ ...t, channel: c, covers: c === "dine-in" && t.covers == null ? 2 : t.covers })),
    [mutateActive],
  );
  const changeCovers = useCallback(
    (delta: number) => mutateActive((t) => ({ ...t, covers: Math.max(1, Math.min(50, (t.covers ?? 2) + delta)) })),
    [mutateActive],
  );
  const assignTable = useCallback(
    (tableId: string | null) => mutateActive((t) => ({ ...t, tableId: tableId ?? undefined })),
    [mutateActive],
  );
  const setAddress = useCallback(
    (addr: string) => mutateActive((t) => ({ ...t, address: addr.trim() || undefined })),
    [mutateActive],
  );
  const togglePark = useCallback(
    () => mutateActive((t) => ({ ...t, status: t.status === "parked" ? "open" : "parked" })),
    [mutateActive],
  );
  const setName = useCallback((name: string) => mutateActive((t) => ({ ...t, name: name.slice(0, 40) })), [mutateActive]);
  const applyDiscount = useCallback((d: PosTabDiscount) => mutateActive((t) => ({ ...t, discount: d })), [mutateActive]);
  const removeDiscount = useCallback(() => mutateActive((t) => ({ ...t, discount: undefined })), [mutateActive]);
  const applyMember = useCallback(
    (phone: string, name: string) => mutateActive((t) => ({ ...t, customerPhone: phone.trim() || undefined, customerName: name.trim() || undefined })),
    [mutateActive],
  );
  const removeMember = useCallback(() => mutateActive((t) => ({ ...t, customerPhone: undefined, customerName: undefined })), [mutateActive]);
  // Dine-in kitchen timing — course-by-course firing vs everything at once.
  const toggleCoursed = useCallback(() => mutateActive((t) => ({ ...t, coursed: !(t.coursed ?? true) })), [mutateActive]);
  // Drag-to-recourse — re-pacing a held line shouldn't un-send what's fired.
  const recourse = useCallback(
    (key: string, course: PosCourse) =>
      mutateActive((t) => ({ ...t, items: t.items.map((l) => (posLineKey(l) === key ? { ...l, course } : l)) })),
    [mutateActive],
  );

  // Delete a check server-side **durably**. The void is the one mutation that
  // must survive a transient failure intact, so it goes through the same
  // idempotent outbox as Send/Charge (durableMutate) instead of a bare fetch.
  // The old fire-and-forget DELETE released the `voidedIds` guard on ANY failure
  // (a 5xx, a dropped connection, a cold-instance timeout), and the 5s cross-till
  // poll then re-added the check the operator had voided — THE "voided checks
  // reappear a few seconds later" bug, which survived a dozen server-side delete
  // fixes because the resurrection was the client undoing its own void. Now a
  // transient failure RETRIES (and survives a reload via the persisted outbox);
  // only a genuine 4xx other than 404 releases the guard and lets the poll
  // reconcile the check back. 404 = already gone (double-fire / cross-till void).
  const voidCheckOnServer = useCallback(
    (id: string) => {
      voidedIds.current.add(id);
      // Only a genuine client-side rejection (a 4xx other than 404) means the
      // void truly won't happen — release the guard so the next poll reconciles
      // the check back. A 404 is "already gone" and a 5xx is a transient server
      // hiccup (idempotentFetch already retried it); both stay hidden so a blip
      // can never resurrect a voided check.
      const release = (status: number) => {
        if (status >= 400 && status < 500 && status !== 404) voidedIds.current.delete(id);
      };
      pendingSaves.current += 1;
      void durableMutate({
        url: `/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}&id=${encodeURIComponent(id)}`,
        method: "DELETE",
        entity: `tab:${id}`,
        desc: `Void · #${id}`,
        // Fires only for a PARKED write that finally lands on a terminal 4xx.
        onReject: release,
      })
        .then(({ res }) => {
          // res === null ⟺ parked offline: stay hidden, the outbox replays the
          // DELETE until it lands. A real non-ok response is a 4xx (5xx retries
          // inside durableMutate) — let `release` decide on the status.
          if (res && !res.ok) release(res.status);
        })
        .finally(() => {
          pendingSaves.current = Math.max(0, pendingSaves.current - 1);
        });
    },
    [pageLoc],
  );

  const newTab = useCallback(async (init?: { channel?: FulfillmentType; tableId?: string; covers?: number }) => {
    if (!pageLoc) return;
    // Derive the next default name from the highest existing "Tab N" so it never
    // collides — even after middle checks are closed (a plain counter repeats).
    const maxNum = tabs.reduce((max, t) => {
      const m = /^Tab (\d+)$/.exec(t.name);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const name = `Tab ${maxNum + 1}`;
    // Optimistic open: show the check instantly with a temp id and switch to it
    // so staff can start ringing items the moment they tap "+ New" — the till
    // must not block on a server round-trip (which on a slow link made opening a
    // check feel like it took "ages"). The POST runs in the background and we
    // reconcile the temp id to the real one when it returns, carrying over any
    // lines/channel rung in the meantime. `pendingSaves` is held up for the
    // whole round-trip so the cross-till poll can't drop the not-yet-saved tab.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const optimistic: PosTab = {
      id: tempId,
      locationSlug: pageLoc,
      name,
      channel: init?.channel ?? null,
      status: "open",
      items: [],
      tableId: init?.tableId,
      covers: init?.covers,
      coursed: init?.channel === "dine-in" ? true : undefined,
      sentKds: false,
      createdAt: now,
      updatedAt: now,
    };
    setTabs((prev) => [...prev, optimistic]);
    setActiveTabId(tempId);
    pendingSaves.current += 1;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setTabs((prev) => prev.filter((t) => t.id !== tempId));
        setActiveTabId((cur) => (cur === tempId ? null : cur));
        pendingCreateVoids.current.delete(tempId);
        return;
      }
      const data: { tab?: PosTab } = await res.json();
      const real = data.tab;
      if (!real) {
        setTabs((prev) => prev.filter((t) => t.id !== tempId));
        setActiveTabId((cur) => (cur === tempId ? null : cur));
        pendingCreateVoids.current.delete(tempId);
        return;
      }
      // Voided while this POST was in flight: the check now exists server-side
      // but the operator already dropped it. Delete the real check (aborting any
      // in-flight poll that may have seen it) and never surface it — don't swap it
      // into state. This is what stops a just-voided new check from reappearing.
      if (pendingCreateVoids.current.has(tempId)) {
        pendingCreateVoids.current.delete(tempId);
        // The operator voided this check while its create-POST was in flight; it
        // now exists server-side under `real.id`. Delete it durably (same outbox
        // as a normal void) so a transient failure retries instead of letting the
        // poll resurrect the just-voided check.
        voidCheckOnServer(real.id);
        return;
      }
      // Swap temp → real id, keeping anything rung onto the optimistic check.
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tempId ? { ...t, id: real.id, createdAt: real.createdAt ?? t.createdAt, updatedAt: new Date().toISOString() } : t,
        ),
      );
      setActiveTabId((cur) => (cur === tempId ? real.id : cur));
      // Items/channel rung during the round-trip get flushed under the real id
      // by the reconcile effect, once the swap above has committed to state.
      reconciledTabsRef.current.push(real.id);
    } catch {
      // Offline / network error — drop the optimistic check. The POST never
      // landed, so there's no server-side check to delete; just forget the void.
      setTabs((prev) => prev.filter((t) => t.id !== tempId));
      setActiveTabId((cur) => (cur === tempId ? null : cur));
      pendingCreateVoids.current.delete(tempId);
    } finally {
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    }
  }, [pageLoc, tabs, voidCheckOnServer]);

  // Flush any just-reconciled optimistic checks: once the temp→real id swap has
  // committed to `tabs`, persist them under the real id if anything was rung up
  // during the POST round-trip (the POST created the check empty).
  useEffect(() => {
    if (reconciledTabsRef.current.length === 0) return;
    const ids = reconciledTabsRef.current;
    reconciledTabsRef.current = [];
    for (const id of ids) {
      const tab = tabs.find((t) => t.id === id);
      if (tab && (tab.items.length > 0 || tab.channel)) persistTab(tab);
    }
  }, [tabs, persistTab]);

  // --- Tables (dine-in picker) --------------------------------------------
  const [tables, setTables] = useState<FloorTable[]>([]);
  useEffect(() => {
    if (!pageLoc) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: FloorTable[] = await res.json();
        if (!cancelled) setTables(Array.isArray(data) ? data : []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageLoc]);
  const tableById = useCallback((id?: string) => (id ? tables.find((t) => t.id === id) : undefined), [tables]);

  // Deep-link from the Floor: `/core/pos?table=<id>&covers=<n>` opens (or focuses)
  // a dine-in check for that table — the "tap a table → build its check" flow, so
  // the floor map and the till share one spatial model instead of two table UIs.
  // Read once on mount; consumed when the tables list has loaded.
  const tableParamRef = useRef<{ id: string; covers?: number } | null | undefined>(undefined);
  useEffect(() => {
    if (tableParamRef.current !== undefined) return;
    // Embedded on the Floor: the tapped table is handed in directly.
    if (initialTableId) { tableParamRef.current = { id: initialTableId }; return; }
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("table");
    if (!id) { tableParamRef.current = null; return; }
    const c = parseInt(sp.get("covers") || "", 10);
    tableParamRef.current = { id, covers: Number.isFinite(c) ? c : undefined };
    // Drop the query so a refresh doesn't re-open a fresh check for the table.
    window.history.replaceState(null, "", window.location.pathname);
  }, [initialTableId]);
  useEffect(() => {
    const p = tableParamRef.current;
    if (!p || tables.length === 0) return;
    const t = tables.find((x) => x.id === p.id);
    if (!t) return;
    tableParamRef.current = null; // consume once, whatever the outcome
    // Already a check on this table? Focus it instead of opening a duplicate.
    const open = tabs.find((tb) => tb.tableId === t.id && tb.status !== "parked");
    if (open) {
      setActiveTabId(open.id);
      toast(`Table ${t.number} · open check`, "default");
      return;
    }
    void newTab({ channel: "dine-in", tableId: t.id, covers: p.covers ?? t.seats ?? 2 });
    toast(`New check · Table ${t.number}`, "success");
  }, [tables, tabs, newTab, toast]);
  const tablesByZone = useMemo(() => {
    const m = new Map<string, FloorTable[]>();
    for (const t of tables) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [tables]);

  // --- Send / Fire / Charge ------------------------------------------------
  const [busyTabId, setBusyTabId] = useState<string | null>(null);

  const sendKds = useCallback(async () => {
    const t = getActive();
    if (!t || t.items.length === 0 || busyTabId) return;
    if (!t.channel) return toast("Pick a channel first", "danger");
    setBusyTabId(t.id);
    try {
      const url = `/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`;
      const { res, queued } = await durableMutate({
        url,
        method: "POST",
        body: { tabId: t.id },
        entity: `tab:${t.id}`,
        desc: `Send · #${t.id}`,
        onReject: (s) => toast(`Send for #${t.id} was rejected (${s})`, "danger"),
      });
      if (queued) {
        // Offline: optimistically mark the tab sent; the outbox fires it on reconnect.
        setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay" } : x)));
        return toast(`Saved offline — sends to KDS on reconnect · #${t.id}`, "default");
      }
      const data = (await res!.json().catch(() => ({}))) as { error?: string; orderId?: string; firedCourses?: PosCourse[] };
      if (!res!.ok) return toast(data.error || "Could not send to KDS", "danger");
      setTabs((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay", orderId: data.orderId, firedCourses: data.firedCourses } : x)),
      );
      toast(`Sent to KDS · #${t.id}`, "success");
    } finally {
      setBusyTabId(null);
    }
  }, [getActive, busyTabId, pageLoc, toast]);

  const fireCourse = useCallback(
    async (course: PosCourse) => {
      const t = getActive();
      if (!t || busyTabId) return;
      if (!t.channel) return toast("Pick a channel first", "danger");
      setBusyTabId(t.id);
      try {
        const { res } = await idempotentFetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "POST",
          body: { tabId: t.id, courses: [course] },
        });
        if (!res) return toast("No connection — couldn't fire the course", "danger");
        const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string; firedCourses?: PosCourse[] };
        if (!res.ok) return toast(data.error || "Could not fire course", "danger");
        setTabs((prev) =>
          prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay", orderId: data.orderId, firedCourses: data.firedCourses } : x)),
        );
        toast(`Fired ${POS_COURSE_LABELS[course]} · #${t.id}`, "success");
      } finally {
        setBusyTabId(null);
      }
    },
    [getActive, busyTabId, pageLoc, toast],
  );

  const [tenderOpen, setTenderOpen] = useState(false);
  // Bumped on a rejected charge → the open tender sheet shakes + stays put so
  // the operator can retry on the same (failed) tender (recoverable, not a
  // dead-end).
  const [payErrorNonce, setPayErrorNonce] = useState(0);
  const pay = useCallback(
    async (tender: TenderInput, label: string) => {
      const t = getActive();
      if (!t || busyTabId) return;
      setBusyTabId(t.id);
      // Keep the tender sheet OPEN during the request — on reject it shakes and
      // stays for a retry; it closes only on success (or when queued offline).
      try {
        const url = `/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`;
        const { res, queued } = await durableMutate({
          url,
          method: "PATCH",
          body: { tabId: t.id, tender },
          entity: `tab:${t.id}`,
          desc: `Charge · #${t.id}`,
          onReject: (s) => toast(`Charge for #${t.id} was rejected (${s})`, "danger"),
        });
        const closeTab = () => {
          const left = tabs.filter((x) => x.id !== t.id);
          setTabs(left);
          setActiveTabId(left[0]?.id ?? null);
        };
        if (queued) {
          // Offline: close the check optimistically; the outbox charges it (once,
          // under its idempotency key) when the network returns.
          setTenderOpen(false);
          closeTab();
          return toast(`Saved offline — charges ${label} on reconnect · #${t.id}`, "default");
        }
        const data = (await res!.json().catch(() => ({}))) as {
          error?: string; totalAmount?: number; tip?: number; comp?: number; change?: number;
        };
        if (!res!.ok) {
          // Recoverable: shake the still-open sheet and invite another tender.
          setPayErrorNonce((n) => n + 1);
          return toast(`${data.error || "Payment declined"} — try another tender?`, "danger");
        }
        const amt = data.totalAmount ?? grandG(t);
        setTenderOpen(false);
        closeTab();
        const extras = [
          data.comp && data.comp > 0 ? `comp ${fmtPLN(data.comp)}` : "",
          data.tip && data.tip > 0 ? `+tip ${fmtPLN(data.tip)}` : "",
          data.change && data.change > 0 ? `change ${fmtPLN(data.change)}` : "",
        ].filter(Boolean).join(" · ");
        toast(`Paid ✓ #${t.id} · ${label} · ${fmtPLN(amt)}${extras ? ` · ${extras}` : ""}`, "success");
      } finally {
        setBusyTabId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActive, busyTabId, pageLoc, tabs, toast],
  );

  // --- Void (delete an open check) -----------------------------------------
  const [voidOpen, setVoidOpen] = useState(false);
  // Drop an open check entirely: removes it from the rail and deletes it
  // server-side (`DELETE /api/admin/pos/tabs?id=`). Optimistic — the row
  // disappears at once; `pendingSaves` is held for the round-trip so the
  // cross-till poll can't resurrect it before the delete commits. An empty,
  // never-saved optimistic check (`tmp-` id) is removed locally only.
  const deleteTab = useCallback(
    async (id: string) => {
      // Look the check up from the CURRENT render's `tabs` — NOT via a flag set
      // inside the setTabs updater below. React 18 only runs a state updater
      // *eagerly* (synchronously) when no other update is already pending; the
      // void-confirm dialog calls setVoidOpen(false) first, so the updater is
      // deferred and a `found` flag read right after it would still be false.
      // That silently bailed the entire void (no DELETE, no beacon, no toast)
      // while the optimistic removal still applied later — so the check vanished
      // and the 5s poll re-added it: the "void does nothing / comes back
      // instantly" bug. A closure lookup is reliable; the functional removal
      // below still guards rapid consecutive voids.
      const hit = tabs.find((x) => x.id === id);
      if (!hit) return;
      const name = hit.name;
      // Optimistic, **functional** removal — robust to rapid consecutive voids
      // that would otherwise read a stale snapshot and re-add a check voided a
      // tap earlier.
      setTabs((prev) => prev.filter((x) => x.id !== id));
      setActiveTabId((cur) => (cur === id ? (tabs.filter((x) => x.id !== id)[0]?.id ?? null) : cur));
      // Cancel any debounced PUT still queued for this check.
      const timer = persistTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        persistTimers.current.delete(id);
      }
      // Drop from the persist queue too, so the flush effect can't re-PUT a check
      // we're voiding.
      pendingPersistRef.current.delete(id);
      if (id.startsWith("tmp-")) {
        // No real id yet — the create-POST is still in flight. Record the void
        // so newTab deletes the real check the moment its POST returns, instead
        // of leaving a server-side orphan the poll would resurrect.
        pendingCreateVoids.current.add(id);
        return;
      }
      // TEMP DIAGNOSTIC (#197): a GET beacon — which we know reaches the server —
      // fired right before the durable DELETE. If the diag shows this beacon
      // (lastClientBeacon) but lastVoidRoute stays null, the browser ran the void
      // yet the non-GET DELETE never reached the server (a dropped DELETE), which
      // durable retry alone can't cure. Kept until the void is confirmed in prod.
      void fetch(`/api/admin/pos/diag?beacon=${encodeURIComponent(id)}&loc=${encodeURIComponent(pageLoc)}`, {
        cache: "no-store",
      }).catch(() => {});
      // Delete it durably — a transient failure retries (and survives a reload)
      // instead of releasing the guard and letting the 5s poll resurrect the
      // check. voidCheckOnServer hides the id until the server confirms it gone.
      voidCheckOnServer(id);
      // Confirm to the operator immediately — the row is already gone, so the
      // toast must not wait on the round-trip. Voiding several in a row no longer
      // stacks toasts behind the taps.
      toast(`Voided ${name}`, "default");
    },
    [tabs, pageLoc, voidCheckOnServer, toast],
  );
  // Empty checks vanish on tap; a check with rung items asks first.
  const requestVoid = useCallback(() => {
    const t = tabs.find((x) => x.id === activeTabId);
    if (!t || busyTabId) return;
    if (t.items.length === 0) void deleteTab(t.id);
    else setVoidOpen(true);
  }, [tabs, activeTabId, busyTabId, deleteTab]);

  // --- Pricing (real menu + real combo discount) ---------------------------
  const cartOf = useCallback(
    (t: PosTab): CartItem[] =>
      t.items.flatMap((l) => {
        const m = byId(l.menuItemId);
        if (!m) return [];
        return [{
          menuItem: m,
          quantity: l.quantity,
          locationSlug: pageLoc,
          ...(l.modifiers && l.modifiers.length ? { selectedModifiers: l.modifiers } : {}),
          ...(l.notes ? { notes: l.notes } : {}),
        }];
      }),
    [byId, pageLoc],
  );
  const comboOf = useCallback((t: PosTab) => getActiveComboDeals(cartOf(t), config, t.channel ?? undefined), [cartOf, config]);
  // Modifier price deltas (extra cheese, truffle) are part of the subtotal — the
  // same `effectiveUnitPrice` the server charges with, so till and bill agree.
  const subtotalG = useCallback((t: PosTab) => cartOf(t).reduce((s, ci) => s + effectiveUnitPrice(ci) * ci.quantity, 0), [cartOf]);
  const discountG = useCallback((t: PosTab) => (comboOf(t).isComplete ? comboOf(t).savings : 0), [comboOf]);
  // Manual operator discount, on top of the auto combo (same pure helper as the server).
  const manualDiscountG = useCallback((t: PosTab) => manualDiscountGrosze(Math.max(0, subtotalG(t) - discountG(t)), t.discount), [subtotalG, discountG]);
  const grandG = useCallback((t: PosTab) => Math.max(0, subtotalG(t) - discountG(t) - manualDiscountG(t)), [subtotalG, discountG, manualDiscountG]);

  // Sync the active check to the persistent Context Dock — standalone till only.
  // When POS is embedded in the Floor's check panel the Floor already owns the
  // selection (same table), so we don't fight it. Additive: no other flow reads
  // this. See docs/design-system/core/redesign/.
  useEffect(() => {
    if (embedded) return;
    const t = tabs.find((x) => x.id === activeTabId);
    if (!t) return;
    const g = grandG(t);
    const chLabel =
      t.channel === "dine-in" ? "Dine-in" : t.channel === "takeout" ? "Takeaway" : t.channel === "delivery" ? "Delivery" : "New check";
    select({
      kind: "tab",
      id: t.id,
      label: t.name || "Check",
      sub: `${chLabel}${t.covers ? ` · ${t.covers} covers` : ""}`,
      status: t.status === "pay" ? "To pay" : t.status === "parked" ? "Parked" : "Open",
      statusCls: t.channel === "dine-in" ? "seated" : "booked",
      amount: g > 0 ? `${(g / 100).toFixed(2)} zł` : undefined,
      amountDue: t.status === "pay",
      note: t.customerName || undefined,
      href: "/core/pos",
      items: cartOf(t)
        .slice(0, 24)
        .map((ci) => ({ label: ci.menuItem.name, qty: ci.quantity, note: ci.notes })),
    });
  }, [embedded, activeTabId, tabs, grandG, cartOf, select]);

  const active = getActive();
  // Writes parked in the durable outbox (offline). Drives the "syncing" pill so
  // staff know a send/charge is saved and will land on reconnect.
  const pendingWrites = usePendingWriteCount();

  // Tab-rail rollup: how many checks are in flight, ready to pay, parked, and
  // the open value across all of them — the at-a-glance "state of the till".
  const railSummary = useMemo(() => {
    const ready = tabs.filter((t) => t.status === "pay").length;
    const parked = tabs.filter((t) => t.status === "parked").length;
    const openValue = tabs.reduce((s, t) => s + grandG(t), 0);
    return { count: tabs.length, ready, parked, openValue };
  }, [tabs, grandG]);

  // Other open, non-parked dine-in checks already seated at a table — the
  // double-seat guard for the table picker.
  const tabsOnTable = useCallback(
    (tableId: string, exceptId?: string) =>
      tabs.filter((t) => t.id !== exceptId && t.status !== "parked" && t.channel === "dine-in" && t.tableId === tableId),
    [tabs],
  );
  const handlePickTable = (tbl: FloorTable) => {
    if (!active) return;
    setTableOpen(false);
    if (active.tableId === tbl.id) {
      assignTable(null);
      return;
    }
    assignTable(tbl.id);
    const conflict = tabsOnTable(tbl.id, active.id).length > 0;
    const over = tbl.seats < (active.covers ?? 2);
    if (conflict || over) {
      const bits: string[] = [];
      if (conflict) bits.push("also on another open check");
      if (over) bits.push(`seats ${tbl.seats} for a party of ${active.covers ?? 2}`);
      toast(`Table ${tbl.number} — ${bits.join(" · ")}`, "danger");
    } else {
      toast(`Seated at table ${tbl.number}`, "success");
    }
  };

  // Channel-appropriate + availability. A sold-out item (base-unavailable OR
  // live-86'd) is NOT hidden — it stays on the grid greyed/struck and sinks to
  // the bottom, so the line never taps it but always sees the gap.
  const channelOk = (m: MenuItem) => active?.channel === "delivery" || !m.deliveryOnly;
  const isAvail = (m: MenuItem) => m.available && !eightySix.has(m.id) && channelOk(m);
  // available-only list — combos, cross-sell and every add-path use this.
  const channelMenu = menu.filter(isAvail);
  // grid list — channel-appropriate incl. sold-out; available first, 86'd sunk.
  const gridSource = menu.filter(channelOk);
  const items = (
    activeCat === "popular"
      ? popularItems.filter(channelOk)
      : activeCat === "all"
        ? gridSource
        : gridSource.filter((m) => m.category === activeCat)
  )
    .slice()
    .sort((a, b) => Number(isAvail(b)) - Number(isAvail(a)));
  // Cap cross-sell to the top 2 so the ticket stays calm (the mockup shows one
  // or two, not a stacked list) — the combo-completion prompt renders separately.
  const offers = active && active.items.length > 0 ? getCartSuggestions(cartOf(active), menu, 2, config) : [];
  const isCoursed = !!active && active.channel === "dine-in" && (active.coursed ?? true);
  // Smart-default fire: the earliest course that has lines and isn't fired yet.
  // A coursed check's primary action fires THIS (Starters first) instead of the
  // whole check, so the common case is a single confirm; held courses follow.
  const nextUnfiredCourse = useMemo(() => {
    if (!active || !isCoursed) return null;
    const fired = new Set(active.firedCourses ?? []);
    const present = new Set(active.items.map((l) => courseOf(l)));
    return POS_COURSE_ORDER.find((c) => present.has(c) && !fired.has(c)) ?? null;
  }, [active, isCoursed]);

  // Combo-completion offer — a partially-matched deal one or two items short.
  const combo = active ? comboOf(active) : null;
  const comboNeed = combo?.activeDeal && !combo.isComplete
    ? combo.missingItems.length
      ? combo.missingItems.join(", ")
      : combo.missingCategories.length
        ? combo.missingCategories.map((c) => MENU_CATEGORY_LABELS[c]).join(", ")
        : combo.missingQuantity
          ? `${combo.missingQuantity} more item${combo.missingQuantity > 1 ? "s" : ""}`
          : null
    : null;
  const completeCombo = () => {
    if (!combo?.activeDeal) return;
    const ids: string[] = [];
    if (combo.activeDeal.requiredItems) {
      for (const label of combo.missingItems) {
        const req = combo.activeDeal.requiredItems.find((r) => r.label === label);
        const m = req && channelMenu.find((x) => x.id.endsWith(req.suffix));
        if (m) ids.push(m.id);
      }
    }
    for (const c of combo.missingCategories) {
      const m = channelMenu.filter((x) => x.category === c).sort((a, b) => a.price - b.price)[0];
      if (m) ids.push(m.id);
    }
    if (ids.length === 0 && combo.missingQuantity > 0 && active) {
      // categories already matched — just need volume; repeat the first line.
      const first = active.items[0];
      if (first) ids.push(first.menuItemId);
    }
    ids.forEach((id) => addLine(id));
  };

  // --- Pace steering (real: server analyzeTruck over live orders) ----------
  interface SteerPlan {
    active: boolean;
    bottleneck: { label: string; util: number; tier: string } | null;
    reason: string | null;
    makeNow: string[];
    throttle: string[];
    promiseSecondsByCategory: Record<string, number>;
    deliveryCapNextWindow: number;
  }
  const [steer, setSteer] = useState<SteerPlan | null>(null);
  const [windowMin, setWindowMin] = useState(15);
  // Pace-steering item cues + per-check promise, all from the live plan.
  const makeNowSet = useMemo(() => new Set(steer?.makeNow ?? []), [steer]);
  const throttleSet = useMemo(() => new Set(steer?.throttle ?? []), [steer]);
  const tabPromiseSec = useMemo(() => {
    if (!active || !steer) return 0;
    return Math.max(0, ...active.items.map((l) => steer.promiseSecondsByCategory[byId(l.menuItemId)?.category ?? ""] ?? 0));
  }, [active, steer, byId]);
  const deliveryPaused = !!(steer?.active && active?.channel === "delivery" && steer.deliveryCapNextWindow === 0);
  const loadSteer = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pace/steering?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setSteer(d.plan ?? null);
      if (d.paceWindowMin) setWindowMin(d.paceWindowMin);
    } catch {
      /* non-fatal — the till just shows no steering hint */
    }
  }, [pageLoc]);
  useEffect(() => {
    void loadSteer();
  }, [loadSteer]);
  usePolling(loadSteer, 15000, { enabled: !!pageLoc });

  const loadEightySix = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/kds/eighty-six?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const d = (await res.json()) as { eightySixed?: { id: string }[] };
      setEightySix(new Set((d.eightySixed ?? []).map((x) => x.id)));
    } catch {
      /* non-fatal — the till just keeps the last known 86 set */
    }
  }, [pageLoc]);
  useEffect(() => {
    void loadEightySix();
  }, [loadEightySix]);
  usePolling(loadEightySix, 15000, { enabled: !!pageLoc });

  // --- Drag-to-recourse + fullscreen kiosk --------------------------------
  const dragItem = useRef<string | null>(null);
  const [dropCourse, setDropCourse] = useState<PosCourse | null>(null);
  // Tap-to-move course picker. A POS till is a touchscreen and HTML5 drag never
  // fires from a finger, so the grip doubles as a tap target that reveals an
  // inline course chooser; native drag stays as a mouse-only enhancement.
  const [recourseFor, setRecourseFor] = useState<string | null>(null);
  // Line editor (modifier picks + special-request note). `item` is the menu item
  // being configured; `editKey` is set when editing a line already on the check
  // (vs a fresh add), so Save replaces it in place rather than stacking a second.
  const [editor, setEditor] = useState<{ item: MenuItem; editKey?: string; initial?: PosTabLine } | null>(null);
  const openEditor = useCallback(
    (m: MenuItem, line?: PosTabLine) => {
      if (!active) { toast("Open a check first"); return; }
      setEditor({ item: m, editKey: line ? posLineKey(line) : undefined, initial: line });
    },
    [active, toast],
  );
  const [kiosk, setKiosk] = useState(false);
  const toggleKiosk = useCallback(() => {
    setKiosk((k) => {
      const next = !k;
      if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      return next;
    });
  }, []);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- Dialogs -------------------------------------------------------------
  const [tableOpen, setTableOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  // On phones/narrow tablets the ticket pane becomes a bottom drawer.
  const [mobileTicket, setMobileTicket] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  // Leaving a check (or its dine-in channel) drops back to the menu.
  useEffect(() => {
    setTableOpen(false);
  }, [activeTabId]);
  const [addrDraft, setAddrDraft] = useState("");

  const tableButton = (t: FloorTable) => {
    const inUse = tabsOnTable(t.id, active?.id).length > 0;
    const under = active ? t.seats < (active.covers ?? 2) : false;
    return (
      <button
        key={t.id}
        type="button"
        className={`core-tablebtn${active?.tableId === t.id ? " on" : ""}${t.status === "out-of-service" ? " oos" : ""}`}
        onClick={() => handlePickTable(t)}
      >
        <span className="tn">{t.number}</span>
        <span className="tc">{t.seats} seats{t.zone ? ` · ${t.zone}` : ""}</span>
        <span className="core-tablebadges">
          {inUse && <span className="core-tbadge warn">In use</span>}
          {under && <span className="core-tbadge warn">Seats {t.seats} &lt; {active?.covers ?? 2}</span>}
          {t.status === "reserved" && <span className="core-tbadge info">Reserved</span>}
          {t.status === "out-of-service" && <span className="core-tbadge">Out of service</span>}
        </span>
      </button>
    );
  };

  // Tapping a card that has modifier groups opens the editor to configure the
  // line; a plain item adds straight to the check (the fast path is unchanged).
  const customisable = (m: MenuItem) => !!m.modifierGroups && m.modifierGroups.length > 0;
  const productCard = (m: MenuItem) => {
    const soldOut = !isAvail(m);
    return (
    <button
      key={m.id}
      type="button"
      className={`core-prod${soldOut ? " sold-out" : ""}`}
      disabled={soldOut}
      title={soldOut ? "86'd — sold out" : undefined}
      onClick={soldOut ? undefined : () => (!active ? toast("Open a check first") : customisable(m) ? openEditor(m) : addLine(m.id))}
    >
      <span className="add" aria-hidden>{soldOut ? "—" : customisable(m) ? "⋯" : "+"}</span>
      <div className="pn">
        {m.name}
        {m.menuRole && <span className={`core-role ${ROLE_BADGE[m.menuRole].cls}`}>{ROLE_BADGE[m.menuRole].label}</span>}
      </div>
      <div className="pd">{m.description}</div>
      {(soldOut || (steer?.active && (makeNowSet.has(m.id) || throttleSet.has(m.id)))) && (
        <div className="core-tagrow">
          {soldOut && <span className="core-tag off">86 · sold out</span>}
          {!soldOut && steer?.active && makeNowSet.has(m.id) && <span className="core-steer-tag now">★ make now</span>}
          {!soldOut && steer?.active && throttleSet.has(m.id) && <span className="core-steer-tag ease">▼ ease</span>}
        </div>
      )}
      <div className="pf">
        <span className="pp">{zl(m.price)}</span>
        <span className="core-prod-tags">
          {customisable(m) && <span className="core-tag opt" title="Has options">◦</span>}
          {m.tags.map((t) => (
            <span key={t} className={`core-tag ${TAG_META[t].cls}`}>{TAG_META[t].label}</span>
          ))}
        </span>
      </div>
    </button>
    );
  };

  const lineRow = (l: PosTabLine, coursed: boolean) => {
    const m = byId(l.menuItemId);
    if (!m) return null;
    const key = posLineKey(l);
    const picking = recourseFor === key;
    // Resolve the chosen options to their menu labels so the line reads in plain
    // language; a `flagOnKds` pick (e.g. buffalo mozzarella) renders emphasised.
    const modChips = (l.modifiers ?? []).flatMap((sel) => {
      const g = m.modifierGroups?.find((mg) => mg.id === sel.groupId);
      const opt = g?.options.find((o) => o.id === sel.optionId);
      return opt ? [{ label: opt.label, flag: !!opt.flagOnKds, delta: opt.priceDelta }] : [];
    });
    const lineUnit = effectiveUnitPrice({ menuItem: m, selectedModifiers: l.modifiers });
    const allergy = !!l.notes && ALLERGY_NOTE_RE.test(l.notes);
    return (
      <div
        className={`core-line${picking ? " picking" : ""}`}
        key={key}
        draggable={coursed}
        onDragStart={() => {
          if (coursed) dragItem.current = key;
        }}
        onDragEnd={() => {
          dragItem.current = null;
        }}
      >
        <div className="core-line-main">
          {coursed ? (
            <button
              type="button"
              className="core-grip"
              title="Move to another course"
              aria-label={`Move ${m.name} to another course`}
              aria-expanded={picking}
              onClick={() => setRecourseFor((cur) => (cur === key ? null : key))}
            >
              ⠿
            </button>
          ) : (
            <span className="core-grip" aria-hidden>⠿</span>
          )}
          <div className="core-qstep">
            <button type="button" onClick={() => changeQty(key, -1)} aria-label="Remove one">
              −
            </button>
            <span className="q mono">{l.quantity}</span>
            <button type="button" onClick={() => changeQty(key, 1)} aria-label="Add one">
              +
            </button>
          </div>
          <button type="button" className="ln ln-edit" onClick={() => openEditor(m, l)} title="Edit options & note">
            {m.name}
            {l.guestPending && <span className="ln-guest" title="Guest added via QR — review & fire">🛎 guest</span>}
            <span className="ln-pen" aria-hidden>✎</span>
          </button>
          <span className="lp mono">{zl(lineUnit * l.quantity)}</span>
        </div>
        {(modChips.length > 0 || l.notes) && (
          <div className="core-line-mods">
            {modChips.map((c, i) => (
              <span key={i} className={`core-mod-chip${c.flag ? " flag" : ""}`}>
                {c.label}{c.delta > 0 ? ` +${zl(c.delta)}` : ""}
              </span>
            ))}
            {l.notes && <span className={`core-mod-note${allergy ? " alrg" : ""}`}>{allergy ? "⚠ " : "“"}{l.notes}{allergy ? "" : "”"}</span>}
          </div>
        )}
        {picking && coursed && (
          <div className="core-recourse" role="group" aria-label="Move to course">
            {POS_COURSE_ORDER.map((c) => {
              const on = courseOf(l) === c;
              return (
                <button
                  key={c}
                  type="button"
                  className={`core-recourse-opt${on ? " on" : ""}`}
                  onClick={() => {
                    if (!on) recourse(key, c);
                    setRecourseFor(null);
                  }}
                >
                  {POS_COURSE_LABELS[c]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Live stat strip — the dense-console KPI row over the menu. EVERY figure is
  // derived from the till's real, live state (Rule #1): open checks, seated
  // covers, value to collect vs total open value, fired-to-kitchen count, and
  // the live pace read (server steering plan). No fetch, no invented numbers —
  // the same state the ticket + rail already show. (Declared here, after the
  // steering plan is in scope.)
  const posStats = useMemo(() => {
    const live = tabs.filter((t) => t.status !== "parked");
    const covers = live.filter((t) => t.channel === "dine-in").reduce((s, t) => s + (t.covers ?? 0), 0);
    const dineIn = live.filter((t) => t.channel === "dine-in").length;
    const readyValue = tabs.filter((t) => t.status === "pay").reduce((s, t) => s + grandG(t), 0);
    const inKitchen = tabs.filter((t) => t.sentKds).length;
    const avg = live.length ? Math.round(railSummary.openValue / live.length) : 0;
    const util = steer?.bottleneck ? Math.round((steer.bottleneck.util ?? 0) * 100) : 0;
    const paceTier = steer?.active ? (steer.bottleneck?.tier ?? "warn") : "calm";
    return { covers, dineIn, readyValue, inKitchen, avg, util, paceTier };
  }, [tabs, grandG, railSummary.openValue, steer]);

  const posBody = (
    <>
      {/* surface section header — dense-console page title + context sub */}
      <div className="core-sectionhead">
        <h1>POS · Order</h1>
        <span className="sub">{pageLoc} · dine-in service</span>
        <div className="core-sp" />
        <span className="sub">Till · {CHANNELS.find((c) => c.key === active?.channel)?.label ?? "dinner service"}</span>
      </div>

      {/* live stat strip — the dense-console KPI row, every figure from real
          till state (Rule #1): open checks · covers · to pay · open value ·
          pace · avg check. Matches the mockup's `.statstrip`. */}
      <div className="core-statstrip" role="group" aria-label="Till metrics">
        <div className="cell">
          <span className="lab">Open checks</span>
          <span className="val">{railSummary.count}</span>
          <span className="delta">{railSummary.parked > 0 ? `${railSummary.parked} parked` : "all active"}</span>
        </div>
        <div className="cell">
          <span className="lab">Covers seated</span>
          <span className="val basil">{posStats.covers}</span>
          <span className="delta">{posStats.dineIn} dine-in {posStats.dineIn === 1 ? "check" : "checks"}</span>
        </div>
        <div className="cell">
          <span className="lab">To pay</span>
          <span className={railSummary.ready > 0 ? "val amber" : "val"}>{railSummary.ready}</span>
          <span className={railSummary.ready > 0 ? "delta warn" : "delta"}>{fmtPLN(posStats.readyValue)}</span>
        </div>
        <div className="cell">
          <span className="lab">Open value</span>
          <span className="val brand">{zl(railSummary.openValue)}<small> zł</small></span>
          <span className="delta">avg {zl(posStats.avg)} zł</span>
        </div>
        <div className="cell">
          <span className="lab">In kitchen</span>
          <span className={posStats.inKitchen > 0 ? "val info" : "val"}>{posStats.inKitchen}</span>
          <span className="delta">fired {posStats.inKitchen === 1 ? "check" : "checks"}</span>
        </div>
        <div className="cell">
          <span className="lab">Pace</span>
          <span className={`val ${posStats.paceTier === "calm" ? "basil" : posStats.paceTier === "risk" || posStats.paceTier === "late" ? "danger" : "amber"}`}>
            {steer?.active ? `${posStats.util}%` : "Clear"}
          </span>
          <span className="delta">{steer?.active ? (steer.bottleneck?.label ?? "at capacity") : "line clear"}</span>
        </div>
      </div>

      {/* open-check bar — spans the full width, above the panes */}
      <div className="core-checkbar">
        {pendingWrites > 0 && (
          <div className="core-sync-pill" role="status" title="Saved locally — will sync when the connection returns">
            ↻ {pendingWrites} {pendingWrites === 1 ? "write" : "writes"} syncing
          </div>
        )}
        {tabs.length > 0 && (
          <div className="core-tabrail-sum">
            {railSummary.count} {railSummary.count === 1 ? "tab" : "tabs"} · {railSummary.ready} ready to pay · {railSummary.parked} parked ·{" "}
            <b className="mono">{fmtPLN(railSummary.openValue)}</b> open
          </div>
        )}
        <div className="core-tabrail">
          {tabs.map((t) => {
            const tn = tableById(t.tableId)?.number;
            const n = t.items.reduce((s, l) => s + l.quantity, 0);
            // Context line reads like the mockup: dine-in shows its table (· T10),
            // takeaway/delivery show the channel, otherwise the live item count.
            const ctx = tn ? `· T${tn}` : t.channel === "takeout" ? "takeaway" : t.channel === "delivery" ? "delivery" : n > 0 ? `${n} ${n === 1 ? "item" : "items"}` : "empty";
            return (
              <button key={t.id} type="button" className={t.id === activeTabId ? "core-ttab on" : "core-ttab"} onClick={() => setActiveTabId(t.id)}>
                <span className="tt">{t.name}</span>
                <span className="ts">{ctx}</span>
              </button>
            );
          })}
          <button type="button" className="core-ttab core-ttab-new" onClick={() => void newTab()}>
            <span className="tt">+ New</span>
            <span className="ts">open check</span>
          </button>
        </div>
      </div>
      <div className="core-pos">
        {/* category rail — pure icon-only (collapsed); label rides as a tooltip */}
        <aside className="core-rail core-rail-icons" aria-label="Menu categories">
          {hasPopular && (
            <button
              type="button"
              className={activeCat === "popular" ? "core-cat pop on" : "core-cat pop"}
              onClick={() => setCat("popular")}
              title="Popular"
              aria-label="Popular"
              aria-pressed={activeCat === "popular"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden>
                {CAT_ICON.popular}
              </svg>
              <span className="n">{popularItems.filter(channelOk).length}</span>
            </button>
          )}
          <button
            type="button"
            className={activeCat === "all" ? "core-cat on" : "core-cat"}
            onClick={() => setCat("all")}
            title="All"
            aria-label="All"
            aria-pressed={activeCat === "all"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden>
              {CAT_ICON.all}
            </svg>
            <span className="n">{channelMenu.length}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={c === activeCat ? "core-cat on" : "core-cat"}
              onClick={() => setCat(c)}
              title={MENU_CATEGORY_LABELS[c]}
              aria-label={MENU_CATEGORY_LABELS[c]}
              aria-pressed={c === activeCat}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {CAT_ICON[c]}
              </svg>
              {steer?.active && promiseMin(steer.promiseSecondsByCategory[c]) && (
                <span className="core-cat-promise">{promiseMin(steer.promiseSecondsByCategory[c])}</span>
              )}
              <span className="n">{menu.filter((m) => m.available && m.category === c).length}</span>
            </button>
          ))}
        </aside>

        {/* menu grid — or the table picker, in place */}
        <main className="core-menu">
          {tableOpen && active?.channel === "dine-in" ? (
            <div className="core-tablepick">
              <div className="core-tablepick-h">
                <div>
                  <div className="tt">Assign table</div>
                  <div className="ts">
                    {active.name} · party of {active.covers ?? 2}
                    {active.tableId ? ` · currently Table ${tableById(active.tableId)?.number ?? "?"}` : ""}
                  </div>
                </div>
                <button type="button" className="core-btn ghost sm" onClick={() => setTableOpen(false)}>← Back to menu</button>
              </div>
              {tables.length === 0 ? (
                <div className="core-tender-note" style={{ padding: 16 }}>No tables configured for this truck.</div>
              ) : (
                tablesByZone.map(([zone, ts]) => (
                  <div key={zone} className="core-tablezone">
                    <div className="core-tablezone-h">{zone}<span className="n">{ts.length}</span></div>
                    <div className="core-tablegrid big">{ts.map(tableButton)}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {steer && (
                steer.active && steer.bottleneck ? (
                  <div className={`core-steer ${steer.bottleneck.tier}`}>
                    <span className="dot" />
                    <span><b>{steer.bottleneck.label} {Math.round(steer.bottleneck.util)}%</b> — {steer.reason ?? "nearing capacity; pace the firing."}</span>
                    <span className="cap">cap · {windowMin}m</span>
                  </div>
                ) : (
                  <div className="core-steer calm">
                    <span className="dot" />
                    <span><b>Line clear</b> — all stations within capacity, honest promise times live.</span>
                  </div>
                )
              )}
              {activeCat === "all" ? (
                categories.map((c) => {
                  const group = items.filter((m) => m.category === c);
                  if (group.length === 0) return null;
                  return (
                    <div key={c} className="core-menu-sec">
                      <div className="core-menu-sec-h">{MENU_CATEGORY_LABELS[c]}</div>
                      <div className="core-menu-grid">{group.map(productCard)}</div>
                    </div>
                  );
                })
              ) : (
                <div className="core-menu-grid">{items.map(productCard)}</div>
              )}
            </>
          )}
        </main>

        {/* ticket — a bottom drawer on small screens (core-ticket.is-open) */}
        <aside className={mobileTicket ? "core-ticket is-open" : "core-ticket"}>
          {!active ? (
            <div className="core-ticket-empty">
              {!hydrated ? (
                <div>
                  <h3>Loading open checks…</h3>
                </div>
              ) : (
                <div>
                  <div className="ti">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path d="M5 3h14l-1.5 16.5a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9L5 3Z" />
                      <path d="M9 8h6" />
                    </svg>
                  </div>
                  <h3>No open check</h3>
                  <p>Start a check with + New, then tap menu items to build the ticket.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="core-thead">
                <div className="th-id">
                  <input
                    className="core-th-name"
                    value={active.name ?? ""}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Check name"
                    title="Rename this check"
                  />
                  <div className="th-s">
                    {active.channel ? CHANNELS.find((c) => c.key === active.channel)?.label : "No channel"}
                    {active.orderId ? ` · #${active.orderId.slice(-5)}` : ""}
                  </div>
                </div>
                {active.status === "parked" && <span className="core-chip on core-th-held">▣ Held</span>}
                {tabPromiseSec > 0 && (
                  <span className={`core-tabpromise ${steer?.bottleneck?.tier ?? "calm"}`} title="Estimated kitchen ready time for this check">
                    ready {promiseMin(tabPromiseSec)}
                  </span>
                )}
                {active.channel === "dine-in" && (
                  <div className="core-covers">
                    <button type="button" onClick={() => changeCovers(-1)} aria-label="Fewer covers">
                      −
                    </button>
                    <span className="mono">{active.covers ?? 2}</span>
                    <button type="button" onClick={() => changeCovers(1)} aria-label="More covers">
                      +
                    </button>
                  </div>
                )}
                {active.channel === "dine-in" && (
                  <button type="button" className="core-chan-aux" onClick={() => setTableOpen(true)}>
                    {active.tableId ? `Table ${tableById(active.tableId)?.number ?? "?"}` : "Assign table"}
                  </button>
                )}
                {active.channel === "delivery" && (
                  <button
                    type="button"
                    className="core-chan-aux"
                    onClick={() => {
                      setAddrDraft(active.address ?? "");
                      setAddrOpen(true);
                    }}
                  >
                    {active.address ? "Edit address" : "Add address"}
                  </button>
                )}
              </div>

              {/* channel selector */}
              <div className="core-chanrow">
                {CHANNELS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={active.channel === c.key ? "core-chan on" : "core-chan"}
                    onClick={() => setChannel(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {deliveryPaused && (
                <div className="core-delivery-paused">
                  ⏸ Delivery paused — the kitchen is at capacity for the next {windowMin}m window. New delivery checks won&apos;t promise a slot yet.
                </div>
              )}

              {/* dine-in kitchen timing — coursed vs all-together */}
              {active.channel === "dine-in" && (
                <div className="core-timing">
                  <span className="core-timing-l">Kitchen timing</span>
                  <div className="core-seg">
                    <button type="button" className={isCoursed ? "on" : ""} onClick={() => !isCoursed && toggleCoursed()}>Coursed</button>
                    <button type="button" className={!isCoursed ? "on" : ""} onClick={() => isCoursed && toggleCoursed()}>All together</button>
                  </div>
                </div>
              )}

              {/* lines */}
              <div className="core-lines">
                {active.items.length === 0 ? (
                  <div className="core-lines-empty">Tap menu items to add them to the ticket.</div>
                ) : isCoursed ? (
                  groupLinesByCourse(active.items).map((g) => {
                    const fired = (active.firedCourses ?? []).includes(g.course);
                    return (
                      <div
                        key={g.course}
                        className={`${fired ? "core-course fired" : "core-course"}${dropCourse === g.course ? " drop" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dropCourse !== g.course) setDropCourse(g.course);
                        }}
                        onDragLeave={() => setDropCourse((c) => (c === g.course ? null : c))}
                        onDrop={() => {
                          if (dragItem.current) recourse(dragItem.current, g.course);
                          setDropCourse(null);
                        }}
                      >
                        <div className="core-course-h">
                          <span className="c-n">{POS_COURSE_LABELS[g.course]}</span>
                          {fired ? (
                            <span className="fire done">✓ Fired</span>
                          ) : (
                            <button type="button" className="fire" disabled={!!busyTabId} onClick={() => void fireCourse(g.course)}>
                              ⚡ Fire
                            </button>
                          )}
                        </div>
                        {g.lines.map((l) => lineRow(l, true))}
                      </div>
                    );
                  })
                ) : (
                  active.items.map((l) => lineRow(l, false))
                )}

                {/* combo completion */}
                {comboNeed && combo?.activeDeal && (
                  <button type="button" className="core-offer combo" onClick={completeCombo}>
                    <span className="oi">🎁</span>
                    <span className="ot">
                      <b>Make it the {combo.activeDeal.name}</b> — add {comboNeed}
                    </span>
                    <span className="op mono">deal</span>
                  </button>
                )}

                {/* cross-sell */}
                {offers.map((o) => (
                  <button key={o.item.id} type="button" className="core-offer" onClick={() => addLine(o.item.id)}>
                    <span className="oi">＋</span>
                    <span className="ot">
                      <b>{o.item.name}</b> — {o.reason}
                    </span>
                    <span className="op mono">{zl(o.item.price)}</span>
                  </button>
                ))}
              </div>

              {/* totals + actions */}
              <div className="core-foot">
                {active.customerPhone && (
                  <div className="core-frow member">
                    <span>👤 {active.customerName || "Member"} · {active.customerPhone}</span>
                    <button type="button" className="core-frow-x" onClick={() => removeMember()} aria-label="Remove member">✕</button>
                  </div>
                )}
                <div className="core-frow">
                  <span>Subtotal</span>
                  <span className="mono">{zl(subtotalG(active))}</span>
                </div>
                {discountG(active) > 0 && (
                  <div className="core-frow disc">
                    <span>✓ {comboOf(active).activeDeal?.name}</span>
                    <span className="mono">−{zl(discountG(active))}</span>
                  </div>
                )}
                {manualDiscountG(active) > 0 && (
                  <div className="core-frow disc">
                    <span>
                      − Discount{active.discount?.type === "percent" ? ` (${active.discount.value}%)` : ""}
                      {active.discount?.reason ? ` · ${active.discount.reason}` : ""}
                    </span>
                    <span className="mono">−{zl(manualDiscountG(active))}</span>
                  </div>
                )}
                <div className="core-ftot">
                  <span className="tl">Total</span>
                  <span className="tv mono">{zl(grandG(active))}</span>
                </div>
                {/* fire-moment upsell — the top cross-sell right at the Fire
                    button, before the check goes away. One tap adds it to the
                    check so it fires with the (next) course. */}
                {!active.sentKds && offers.length > 0 && (
                  <button type="button" className="core-fire-upsell" onClick={() => addLine(offers[0].item.id)} title="Adds it to the check so it fires with this course">
                    <span className="u-plus">＋</span>
                    <span className="u-t">Add <b>{offers[0].item.name}</b> before firing?</span>
                    <span className="u-p mono">+{zl(offers[0].item.price)}</span>
                  </button>
                )}
                <div className="core-foot-actions">
                  {!active.sentKds && (
                    nextUnfiredCourse ? (
                      <button type="button" className="core-send" disabled={!active.items.length || !!busyTabId} onClick={() => void fireCourse(nextUnfiredCourse)} title="Fires the earliest un-fired course; later courses stay held">
                        <Gly><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Gly>
                        Fire {POS_COURSE_LABELS[nextUnfiredCourse]} →
                      </button>
                    ) : (
                      <button type="button" className="core-send" disabled={!active.items.length || !!busyTabId} onClick={() => void sendKds()}>
                        <Gly><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Gly>
                        Send to KDS
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="core-charge"
                    disabled={!active.items.length || !!busyTabId}
                    onClick={() => setTenderOpen(true)}
                  >
                    <Gly><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></Gly>
                    Charge {fmtPLN(grandG(active))}
                  </button>
                </div>
                <div className="core-foot-actions2">
                  <button type="button" className="core-foot-aux core-foot-aux-wide" data-on={active.status === "parked"} onClick={() => togglePark()} title="Park / hold this check">
                    <Gly><rect width="6" height="14" x="6" y="5" rx="1" /><rect width="6" height="14" x="12" y="5" rx="1" /></Gly>
                    {active.status === "parked" ? "Held" : "Park / hold"}
                  </button>
                  <button type="button" className="core-foot-aux" data-on={manualDiscountG(active) > 0} onClick={() => setDiscountOpen(true)}>
                    <Gly><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".6" fill="currentColor" /></Gly>
                    {manualDiscountG(active) > 0 ? "Edit discount" : "Add discount"}
                  </button>
                  <button type="button" className="core-foot-aux" data-on={!!active.customerPhone} onClick={() => setMemberOpen(true)}>
                    <Gly><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Gly>
                    {active.customerPhone ? "Member ✓" : "Add membership"}
                  </button>
                  <button type="button" className="core-foot-aux danger core-foot-aux-wide" disabled={!!busyTabId} onClick={requestVoid} title="Void / delete this check">
                    <Gly><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></Gly>
                    Void check
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* small-screen ticket controls: a backdrop while open, and a
            bottom "view ticket" bar when there's an active check */}
        {mobileTicket && <button type="button" className="core-ticket-backdrop" aria-label="Close ticket" onClick={() => setMobileTicket(false)} />}
        {active && active.items.length > 0 && (
          <button type="button" className={mobileTicket ? "core-ticket-fab is-open" : "core-ticket-fab"} onClick={() => setMobileTicket((v) => !v)}>
            <span className="core-ticket-fab-c">{active.items.reduce((s, l) => s + l.quantity, 0)}</span>
            <span>{mobileTicket ? "Hide ticket" : "View ticket"}</span>
            <span className="core-ticket-fab-t mono">{fmtPLN(grandG(active))}</span>
          </button>
        )}
      </div>

      {/* Tender */}
      {tenderOpen && active && (
        <TenderDialog
          billG={grandG(active)}
          location={pageLoc}
          lines={cartOf(active).map((ci, i) => ({ key: String(i), label: ci.menuItem.name, qty: ci.quantity, amountG: effectiveUnitPrice(ci) * ci.quantity }))}
          errorNonce={payErrorNonce}
          subtitle={`${active.name} · ${CHANNELS.find((c) => c.key === active.channel)?.label ?? "no channel"}${active.channel === "dine-in" && active.tableId ? ` · Table ${tableById(active.tableId)?.number}` : ""}`}
          covers={active.channel === "dine-in" ? active.covers ?? 2 : 1}
          busy={!!busyTabId}
          onClose={() => setTenderOpen(false)}
          onCharge={(tender, label) => void pay(tender, label)}
        />
      )}

      {/* Void confirmation — only when the check has rung items */}
      <CoreDialog
        open={voidOpen && !!active}
        onClose={() => setVoidOpen(false)}
        title="Void this check?"
        footer={
          <>
            <button type="button" className="core-btn ghost" onClick={() => setVoidOpen(false)}>
              Keep check
            </button>
            <button
              type="button"
              className="core-btn danger"
              disabled={!!busyTabId}
              onClick={() => {
                const id = active?.id;
                setVoidOpen(false);
                if (id) void deleteTab(id);
              }}
            >
              Void check
            </button>
          </>
        }
      >
        {active && (
          <p className="core-tender-note">
            <b>{active.name}</b> has {active.items.reduce((s, l) => s + l.quantity, 0)} item
            {active.items.reduce((s, l) => s + l.quantity, 0) === 1 ? "" : "s"} ({fmtPLN(grandG(active))}). This deletes the
            open check for good — it can&apos;t be undone.
          </p>
        )}
      </CoreDialog>

      {/* Delivery address */}
      <CoreDialog
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        title="Delivery address"
        footer={
          <>
            <button type="button" className="core-btn ghost" onClick={() => setAddrOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="core-btn primary"
              onClick={() => {
                setAddress(addrDraft);
                setAddrOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <textarea
          className="core-textarea"
          rows={3}
          value={addrDraft}
          onChange={(e) => setAddrDraft(e.target.value)}
          placeholder="Street & number, flat / buzzer, city — plus any note for the driver"
        />
      </CoreDialog>

      {discountOpen && (
        <DiscountDialog
          current={active?.discount}
          onClose={() => setDiscountOpen(false)}
          onApply={(d) => { applyDiscount(d); setDiscountOpen(false); }}
          onRemove={() => { removeDiscount(); setDiscountOpen(false); }}
        />
      )}
      {memberOpen && (
        <MemberDialog
          phone={active?.customerPhone ?? ""}
          name={active?.customerName ?? ""}
          onClose={() => setMemberOpen(false)}
          onApply={(p, n) => { applyMember(p, n); setMemberOpen(false); }}
          onRemove={() => { removeMember(); setMemberOpen(false); }}
        />
      )}
      {editor && (
        <LineEditorDialog
          item={editor.item}
          initial={editor.initial}
          editing={!!editor.editKey}
          onClose={() => setEditor(null)}
          onSubmit={(mods, notes, qty) => {
            addConfiguredLine(editor.item.id, mods, notes, qty, editor.editKey);
            setEditor(null);
          }}
        />
      )}
    </>
  );

  // Embedded on the Floor: render the check builder in a bare panel (no Core
  // shell), with a slim header carrying the table + a Close. Everything else —
  // build / modify / course / split / pay — lives in the same body as the
  // standalone till, so the check is "never a separate place".
  if (embedded) {
    return (
      <div className="core-pos-embed">
        <div className="core-pos-embed-h">
          <button type="button" className="core-pos-embed-back" onClick={() => onClose?.()} aria-label="Back to floor" title="Back to floor (Esc)">←</button>
          <div className="th">
            <div className="t">
              {active?.tableId ? `Table ${tableById(active.tableId)?.number ?? "?"}` : (active?.name ?? "Check")}
            </div>
            <div className="s">
              {active?.channel === "dine-in"
                ? `Party of ${active.covers ?? 2}`
                : active?.channel
                  ? CHANNELS.find((c) => c.key === active.channel)?.label
                  : "New check"}
              {" · "}
              {active ? active.items.reduce((n, l) => n + l.quantity, 0) : 0} items
              {active && grandG(active) > 0 ? ` · ${fmtPLN(grandG(active))}` : ""}
            </div>
          </div>
          <div className="core-sp" />
          <CoreQrQueue location={pageLoc} />
          <button type="button" className="core-btn ghost sm" onClick={() => onClose?.()}>Done</button>
        </div>
        {posBody}
      </div>
    );
  }

  return (
    <CoreShell
      eyebrow="Point of Sale · Till 1"
      tabs={[
        { label: "Order", active: true },
        {
          label: "Tender",
          onClick: () => (active && active.items.length > 0 ? setTenderOpen(true) : toast("Add items first")),
        },
      ]}
      subRight={
        <>
          <CoreQrQueue location={pageLoc} />
          <button type="button" className="core-iconbtn" title={kiosk ? "Exit fullscreen" : "Fullscreen"} aria-label={kiosk ? "Exit fullscreen" : "Fullscreen"} onClick={toggleKiosk}>
            <ExpandIcon />
          </button>
        </>
      }
    >
      {posBody}
    </CoreShell>
  );
}

/* ── line editor — modifiers + special-request note ─────────────────────── */
function LineEditorDialog({
  item,
  initial,
  editing,
  onClose,
  onSubmit,
}: {
  item: MenuItem;
  initial?: PosTabLine;
  editing: boolean;
  onClose: () => void;
  onSubmit: (mods: SelectedModifier[] | undefined, notes: string | undefined, qty: number) => void;
}) {
  const groups = item.modifierGroups ?? [];
  const [picks, setPicks] = useState<SelectedModifier[]>(initial?.modifiers ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [qty, setQty] = useState(initial?.quantity ?? 1);

  const isOn = (groupId: string, optionId: string) => picks.some((p) => p.groupId === groupId && p.optionId === optionId);
  const toggle = (g: ModifierGroup, optionId: string) => {
    const max = g.maxSelections ?? 1;
    setPicks((cur) => {
      const mine = cur.filter((p) => p.groupId === g.id);
      const others = cur.filter((p) => p.groupId !== g.id);
      const already = mine.some((p) => p.optionId === optionId);
      if (already) return [...others, ...mine.filter((p) => p.optionId !== optionId)];
      // radio (max 1) replaces; multi keeps up to max (drop the oldest over cap).
      if (max <= 1) return [...others, { groupId: g.id, optionId }];
      const next = [...mine, { groupId: g.id, optionId }];
      while (next.length > max) next.shift();
      return [...others, ...next];
    });
  };

  // Required groups (minSelections ≥ 1) must have a pick before the line can add.
  const unmet = groups.filter((g) => (g.minSelections ?? 0) >= 1 && !picks.some((p) => p.groupId === g.id));
  const deltaG = picks.reduce((s, p) => {
    const opt = groups.find((g) => g.id === p.groupId)?.options.find((o) => o.id === p.optionId);
    return s + (opt && opt.priceDelta > 0 ? opt.priceDelta : 0);
  }, 0);
  const unitG = item.price + deltaG;

  const addChip = (text: string) =>
    setNotes((n) => {
      const t = n.trim();
      if (t.toLowerCase().includes(text.trim().toLowerCase())) return n; // no dupes
      return t ? `${t}, ${text}` : text;
    });

  return (
    <CoreDialog
      open
      onClose={onClose}
      title={editing ? `Edit · ${item.name}` : item.name}
      width={520}
      footer={
        <>
          <button type="button" className="core-btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="core-btn primary"
            disabled={unmet.length > 0}
            onClick={() => onSubmit(picks.length ? picks : undefined, notes.trim() || undefined, qty)}
          >
            {unmet.length > 0 ? `Pick ${unmet[0].label}` : editing ? `Save · ${fmtPLN(unitG * qty)}` : `Add · ${fmtPLN(unitG * qty)}`}
          </button>
        </>
      }
    >
      <div className="core-lineeditor">
        {groups.map((g) => {
          const multi = (g.maxSelections ?? 1) > 1;
          const required = (g.minSelections ?? 0) >= 1;
          return (
            <div key={g.id} className="core-modgroup">
              <div className="core-modgroup-h">
                {g.label}
                <span className="core-modgroup-rule">{required ? "required" : "optional"}{multi ? ` · up to ${g.maxSelections}` : ""}</span>
              </div>
              <div className="core-modopts">
                {g.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`core-modopt${isOn(g.id, o.id) ? " on" : ""}`}
                    onClick={() => toggle(g, o.id)}
                  >
                    <span className="mo-l">{o.label}{o.flagOnKds ? <span className="mo-flag" title="Flagged on the kitchen ticket"> ★</span> : null}</span>
                    {o.priceDelta > 0 && <span className="mo-p mono">+{zl(o.priceDelta)}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="core-modgroup">
          <div className="core-modgroup-h">Special request<span className="core-modgroup-rule">to the kitchen</span></div>
          <div className="core-notechips">
            {NOTE_CHIPS.map((c) => (
              <button key={c} type="button" className="core-notechip" onClick={() => addChip(c)}>{c}</button>
            ))}
            <button type="button" className="core-notechip alrg" onClick={() => addChip(ALLERGY_CHIP)}>⚠ Allergy</button>
          </div>
          <textarea
            className="core-textarea"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            placeholder="e.g. no chili, well done — or ⚠ allergy details"
          />
          {notes && ALLERGY_NOTE_RE.test(notes) && (
            <div className="core-alrg-banner">⚠ Allergy flagged — this prints emphasised on the kitchen ticket.</div>
          )}
        </div>

        {item.allergens && item.allergens.length > 0 && (
          <div className="core-modgroup">
            <div className="core-modgroup-h">
              Contains<span className="core-modgroup-rule">declared allergens — shown large on the kitchen ticket</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {item.allergens.map((a) => (
                <span
                  key={a}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 11px",
                    borderRadius: "var(--pill)",
                    background: "var(--amber-wash)",
                    color: "var(--amber)",
                    border: "1px solid var(--amber-wash)",
                  }}
                >
                  ⚠ {a.charAt(0).toUpperCase() + a.slice(1)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="core-editor-qty">
          <span>Quantity</span>
          <div className="core-qstep big">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">−</button>
            <span className="q mono">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="More">+</button>
          </div>
        </div>
      </div>
    </CoreDialog>
  );
}

/* ── tender sheet — tip · comp · split · cash change ────────────────────── */
function TenderDialog({
  billG,
  location,
  lines,
  errorNonce,
  subtitle,
  covers,
  busy,
  onClose,
  onCharge,
}: {
  billG: number;
  location: string;
  lines: { key: string; label: string; qty: number; amountG: number }[];
  errorNonce: number;
  subtitle: string;
  covers: number;
  busy: boolean;
  onClose: () => void;
  onCharge: (tender: TenderInput, label: string) => void;
}) {
  const [splitMode, setSplitMode] = useState<"even" | "item">("even");
  // By-item: each line assigned to a payer (0-based). Per-payer share = their
  // lines' weight × the actual total (so tip/comp distribute proportionally and
  // the payments still sum to the charge).
  const [assign, setAssign] = useState<Record<string, number>>({});
  const payerOf = (k: string) => assign[k] ?? 0;
  // Directional shake on a rejected charge (see payErrorNonce) — a brief,
  // reduced-motion-guarded nudge that says "that tender didn't take, try again".
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (errorNonce === 0) return;
    setShake(true);
    const id = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(id);
  }, [errorNonce]);
  const [tipPct, setTipPct] = useState<number | "custom">(0);
  const [tipCustom, setTipCustom] = useState(""); // zł text
  const [compOpen, setCompOpen] = useState(false);
  const [compZl, setCompZl] = useState("");
  const [compReason, setCompReason] = useState(COMP_REASONS[0]);
  const [compPin, setCompPin] = useState(""); // manager PIN for an over-cap comp
  const [splitN, setSplitN] = useState(1);
  // Live per-shift comp status for the acting user (drives the cap meter).
  const [compStatus, setCompStatus] = useState<{ compTodayGrosze: number; capGrosze: number; singleMaxGrosze: number; bypasses: boolean } | null>(null);
  useEffect(() => {
    if (!location) return;
    let live = true;
    fetch(`/api/admin/pos/comp-status?location=${encodeURIComponent(location)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setCompStatus(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [location]);
  const [shareMethods, setShareMethods] = useState<("cash" | "card")[]>([]);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState(""); // zł text

  const zlToG = (s: string) => Math.round((parseFloat(s.replace(",", ".")) || 0) * 100);
  const comp = compOpen ? Math.min(billG, Math.max(0, zlToG(compZl) || billG)) : 0;
  const net = Math.max(0, billG - comp);
  const tip = tipPct === "custom" ? Math.max(0, zlToG(tipCustom)) : Math.round((net * tipPct) / 100);
  const total = net + tip;

  // Comp-cap meter — the running shift total + where this comp would land.
  const capG = compStatus?.capGrosze ?? 0;
  const compTodayG = compStatus?.compTodayGrosze ?? 0;
  const bypasses = compStatus?.bypasses ?? false;
  const wouldBeG = compTodayG + comp;
  const overCap = !bypasses && capG > 0 && comp > 0 && wouldBeG > capG;

  // Split presets — Whole · ÷2 · ÷3 · ÷4 · By seat (all even; each share equal,
  // last absorbs the rounding). Deduped + clamped to the cover count.
  const splitPresets = [
    { label: "Whole", n: 1 },
    { label: "÷2", n: 2 },
    { label: "÷3", n: 3 },
    { label: "÷4", n: 4 },
    { label: "By seat", n: Math.max(1, covers) },
  ].filter((p) => p.n <= Math.max(1, covers)).filter((p, i, a) => a.findIndex((x) => x.n === p.n) === i);

  // Even split — each share equal, the last absorbs the rounding remainder.
  const shareOf = (i: number) => {
    const base = Math.floor(total / splitN);
    return i === splitN - 1 ? total - base * (splitN - 1) : base;
  };
  // By-item split — per-payer share = their lines' weight × the actual total.
  const billSub = Math.max(1, lines.reduce((s, l) => s + l.amountG, 0));
  const payerSub = (p: number) => lines.filter((l) => payerOf(l.key) === p).reduce((s, l) => s + l.amountG, 0);
  const itemShares = (): number[] => {
    const raw = Array.from({ length: covers }, (_, p) => Math.round((total * payerSub(p)) / billSub));
    const drift = total - raw.reduce((a, b) => a + b, 0);
    if (drift !== 0 && raw.length) raw[raw.indexOf(Math.max(...raw))] += drift; // land exactly on total
    return raw;
  };
  // The shares actually charged — even (splitN slices) or by-item (per payer).
  const shareArr = splitMode === "item" ? itemShares() : Array.from({ length: splitN }, (_, i) => shareOf(i));
  const methodFor = (i: number) => shareMethods[i] ?? "card";
  const setMethod = (i: number, m: "cash" | "card") =>
    setShareMethods((cur) => { const next = [...cur]; next[i] = m; return next; });

  const compNote = compOpen && comp > 0 ? compReason : undefined;
  const cashGivenG = zlToG(cashGiven);
  const change = cashOpen ? Math.max(0, cashGivenG - total) : 0;

  const chargeSingle = (method: "cash" | "card") => {
    if (method === "cash" && !cashOpen) { setCashOpen(true); return; } // reveal change pad first
    const tender: TenderInput = {
      ...(tip > 0 ? { tipGrosze: tip } : {}),
      ...(comp > 0 ? { compGrosze: comp, compNote } : {}),
      ...(overCap && compPin ? { compOverridePin: compPin } : {}),
      payments: [{ method, amount: total }],
      defaultMethod: method,
      ...(method === "cash" && cashGivenG > 0 ? { cashTenderedGrosze: cashGivenG } : {}),
    };
    onCharge(tender, method === "cash" ? "Cash" : "Card");
  };

  const chargeSplit = () => {
    const payments = shareArr.map((amount, i) => ({ method: methodFor(i), amount })).filter((p) => p.amount > 0);
    const cashShares = payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    const tender: TenderInput = {
      ...(tip > 0 ? { tipGrosze: tip } : {}),
      ...(comp > 0 ? { compGrosze: comp, compNote } : {}),
      ...(overCap && compPin ? { compOverridePin: compPin } : {}),
      payments,
      ...(cashShares > 0 && cashGivenG > 0 ? { cashTenderedGrosze: cashGivenG } : {}),
    };
    onCharge(tender, splitMode === "item" ? "By item" : `Split ${splitN}`);
  };

  return (
    <CoreDialog
      open
      onClose={onClose}
      title="Take payment"
      width={520}
      footer={<button type="button" className="core-btn ghost" onClick={onClose}>Cancel</button>}
    >
      <div className={`core-tender${shake ? " shake" : ""}`}>
        <div className="core-tender-tot">
          <span>{comp > 0 || tip > 0 ? "To collect" : "Total due"}</span>
          <b className="mono">{fmtPLN(total)}</b>
        </div>
        <p className="core-tender-note">{subtitle}</p>
        {(comp > 0 || tip > 0) && (
          <div className="core-tender-breakdown">
            <span>Bill {fmtPLN(billG)}</span>
            {comp > 0 && <span className="comp">− comp {fmtPLN(comp)}</span>}
            {tip > 0 && <span className="tip">+ tip {fmtPLN(tip)}</span>}
          </div>
        )}

        {/* Tip */}
        <div className="core-tender-sec">
          <div className="core-tender-sec-h">Tip</div>
          <div className="core-tender-chips">
            {TIP_PCTS.map((p) => (
              <button key={p} type="button" className={`core-tchip${tipPct === p ? " on" : ""}`} onClick={() => setTipPct(p)}>
                {p === 0 ? "None" : `${p}%`}{p > 0 ? <span className="sub mono"> {fmtPLN(Math.round((net * p) / 100))}</span> : null}
              </button>
            ))}
            <button type="button" className={`core-tchip${tipPct === "custom" ? " on" : ""}`} onClick={() => setTipPct("custom")}>Custom</button>
            {tipPct === "custom" && (
              <input className="core-inp tip-inp" inputMode="decimal" value={tipCustom} onChange={(e) => setTipCustom(e.target.value)} placeholder="zł" />
            )}
          </div>
        </div>

        {/* Comp */}
        <div className="core-tender-sec">
          <div className="core-tender-sec-h">
            Comp <span className="muted">on the house</span>
            <button type="button" className={`core-tender-toggle${compOpen ? " on" : ""}`} onClick={() => setCompOpen((v) => !v)}>
              {compOpen ? "Remove comp" : "Comp this check"}
            </button>
          </div>
          {compOpen && (
            <div className="core-comp-body">
              <div className="core-tender-chips">
                {COMP_REASONS.map((r) => (
                  <button key={r} type="button" className={`core-tchip${compReason === r ? " on" : ""}`} onClick={() => setCompReason(r)}>{r}</button>
                ))}
              </div>
              <label className="core-comp-amt">
                Amount comped
                <input className="core-inp" inputMode="decimal" value={compZl} onChange={(e) => setCompZl(e.target.value)} placeholder={`whole bill · ${fmtPLN(billG)}`} />
              </label>
              {bypasses ? (
                <div className="core-tender-note">Owner — comp caps don't apply. Logged as a manager comp ({compReason}).</div>
              ) : capG > 0 ? (
                <div className={`core-comp-cap${overCap ? " over" : ""}`}>
                  <div className="cc-row"><span>Comps this shift</span><span className="mono">{fmtPLN(compTodayG)} / {fmtPLN(capG)}</span></div>
                  <div className="cc-bar"><i style={{ width: `${Math.min(100, capG ? (wouldBeG / capG) * 100 : 0)}%` }} /></div>
                  {overCap ? (
                    <div className="cc-gate">
                      🔒 <b>Over the {fmtPLN(capG)} shift cap</b> — this comp takes the shift to {fmtPLN(wouldBeG)}. A manager PIN authorises it.
                      <input
                        className="core-inp cc-pin"
                        inputMode="numeric"
                        type="password"
                        autoComplete="off"
                        value={compPin}
                        onChange={(e) => setCompPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="Manager PIN"
                      />
                    </div>
                  ) : (
                    <div className="cc-note">This comp fits — takes the shift to {fmtPLN(wouldBeG)}.</div>
                  )}
                </div>
              ) : (
                <div className="core-tender-note">Logged as a manager comp ({compReason}) — counts toward the per-shift comp cap.</div>
              )}
            </div>
          )}
        </div>

        {/* Split — presets + by-item */}
        {covers > 1 && (
          <div className="core-tender-sec">
            <div className="core-tender-sec-h">Split</div>
            <div className="core-tender-chips">
              {splitPresets.map((p) => (
                <button key={p.label} type="button" className={`core-tchip${splitMode === "even" && splitN === p.n ? " on" : ""}`} onClick={() => { setSplitMode("even"); setSplitN(p.n); }}>{p.label}</button>
              ))}
              {lines.length > 1 && (
                <button type="button" className={`core-tchip${splitMode === "item" ? " on" : ""}`} onClick={() => setSplitMode("item")}>By item</button>
              )}
            </div>
            {splitMode === "even" && splitN > 1 && <div className="core-tender-note">{fmtPLN(shareOf(0))} each ({splitN} ways)</div>}
            {splitMode === "item" && (
              <div className="core-split-items">
                {lines.map((l) => (
                  <div key={l.key} className="core-split-item">
                    <span className="si-l"><span className="q mono">{l.qty}×</span> {l.label}</span>
                    <span className="si-a mono">{fmtPLN(l.amountG)}</span>
                    <div className="core-seg xs">
                      {Array.from({ length: covers }, (_, p) => (
                        <button key={p} type="button" className={payerOf(l.key) === p ? "on" : ""} onClick={() => setAssign((a) => ({ ...a, [l.key]: p }))}>{p + 1}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tender action */}
        {splitMode === "item" || splitN > 1 ? (
          <>
            <div className="core-split-rows">
              {shareArr.map((amt, i) =>
                splitMode === "item" && amt === 0 ? null : (
                  <div key={i} className="core-split-row">
                    <span className="sr-l">Guest {i + 1}</span>
                    <span className="sr-a mono">{fmtPLN(amt)}</span>
                    <div className="core-seg sm">
                      <button type="button" className={methodFor(i) === "card" ? "on" : ""} onClick={() => setMethod(i, "card")}>Card</button>
                      <button type="button" className={methodFor(i) === "cash" ? "on" : ""} onClick={() => setMethod(i, "cash")}>Cash</button>
                    </div>
                  </div>
                ),
              )}
            </div>
            <button type="button" className="core-charge" disabled={busy} onClick={chargeSplit}>
              Charge {splitMode === "item" ? "by item" : "split"} · {fmtPLN(total)}
            </button>
          </>
        ) : cashOpen ? (
          <div className="core-cashpad">
            <div className="core-cashpad-h">Cash given<button type="button" className="core-tender-toggle" onClick={() => setCashOpen(false)}>← Back</button></div>
            <div className="core-tender-chips">
              {[total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <button key={v} type="button" className="core-tchip" onClick={() => setCashGiven((v / 100).toFixed(2))}>{fmtPLN(v)}</button>
                ))}
              <input className="core-inp tip-inp" inputMode="decimal" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="zł" autoFocus />
            </div>
            <div className="core-change-row">
              <span>Change due</span>
              <b className="mono">{fmtPLN(change)}</b>
            </div>
            <button type="button" className="core-charge" disabled={busy || cashGivenG < total} onClick={() => chargeSingle("cash")}>
              {cashGivenG < total ? `Need ${fmtPLN(total)}` : `Confirm cash · change ${fmtPLN(change)}`}
            </button>
          </div>
        ) : (
          <div className="core-tender-pads">
            <button type="button" className="core-pay" disabled={busy} onClick={() => chargeSingle("card")}>💳 Card</button>
            <button type="button" className="core-pay" disabled={busy} onClick={() => chargeSingle("cash")}>💵 Cash</button>
          </div>
        )}
      </div>
    </CoreDialog>
  );
}

/* ── manual discount dialog ─────────────────────────────────────────────── */
function DiscountDialog({
  current,
  onClose,
  onApply,
  onRemove,
}: {
  current: PosTabDiscount | undefined;
  onClose: () => void;
  onApply: (d: PosTabDiscount) => void;
  onRemove: () => void;
}) {
  const [type, setType] = useState<"amount" | "percent">(current?.type ?? "amount");
  const [value, setValue] = useState(
    current ? (current.type === "amount" ? (current.value / 100).toString() : String(current.value)) : "",
  );
  const [reason, setReason] = useState(current?.reason ?? "");
  const n = Number(value);
  const valid = Number.isFinite(n) && n > 0 && (type === "percent" ? n <= 100 : true);
  const apply = () => {
    if (!valid) return;
    onApply({ type, value: type === "amount" ? Math.round(n * 100) : Math.round(n), reason: reason.trim() || undefined });
  };
  return (
    <CoreDialog
      open
      onClose={onClose}
      title={current ? "Edit discount" : "Add discount"}
      footer={
        <>
          {current && (
            <button type="button" className="core-btn danger" style={{ marginRight: "auto" }} onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="core-btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="core-btn primary" disabled={!valid} onClick={apply}>Apply</button>
        </>
      }
    >
      <div className="core-seg" style={{ marginBottom: 14, width: "fit-content" }}>
        <button type="button" className={type === "amount" ? "on" : undefined} onClick={() => setType("amount")}>Amount (zł)</button>
        <button type="button" className={type === "percent" ? "on" : undefined} onClick={() => setType("percent")}>Percent (%)</button>
      </div>
      <label className="core-tbl-field">
        <span>{type === "amount" ? "Discount amount (zł)" : "Discount percent (%)"}</span>
        <input
          className="core-inp"
          type="number"
          min={0}
          max={type === "percent" ? 100 : undefined}
          step={type === "amount" ? "0.01" : "1"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </label>
      <label className="core-tbl-field" style={{ marginTop: 10 }}>
        <span>Reason (optional)</span>
        <input className="core-inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="staff, regular, comp…" maxLength={80} />
      </label>
    </CoreDialog>
  );
}

/* ── membership (loyalty) dialog ────────────────────────────────────────── */
function MemberDialog({
  phone,
  name,
  onClose,
  onApply,
  onRemove,
}: {
  phone: string;
  name: string;
  onClose: () => void;
  onApply: (phone: string, name: string) => void;
  onRemove: () => void;
}) {
  const [p, setP] = useState(phone);
  const [n, setN] = useState(name);
  const valid = p.replace(/\D/g, "").length >= 9;
  return (
    <CoreDialog
      open
      onClose={onClose}
      title={phone ? "Membership" : "Add membership"}
      footer={
        <>
          {phone && (
            <button type="button" className="core-btn danger" style={{ marginRight: "auto" }} onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="core-btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="core-btn primary" disabled={!valid} onClick={() => onApply(p, n)}>Attach</button>
        </>
      }
    >
      <p className="core-cust-sub" style={{ marginBottom: 12 }}>
        Attach a guest&rsquo;s phone to earn loyalty points on this check — phone-based, no signup.
      </p>
      <label className="core-tbl-field">
        <span>Phone</span>
        <input className="core-inp" inputMode="tel" value={p} onChange={(e) => setP(e.target.value)} placeholder="+48 600 000 000" autoFocus />
      </label>
      <label className="core-tbl-field" style={{ marginTop: 10 }}>
        <span>Name (optional)</span>
        <input className="core-inp" value={n} onChange={(e) => setN(e.target.value)} placeholder="Guest name" maxLength={60} />
      </label>
    </CoreDialog>
  );
}
