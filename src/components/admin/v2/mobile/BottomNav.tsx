"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChefHat,
  ClipboardList,
  Home,
  LayoutGrid,
  Package,
  Plus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminRole } from "@/lib/admin-roles";
import { ALL_NAV_ITEMS } from "../nav.config";
import { haptic } from "./haptics";
import { useIdlePrefetch } from "./useIdlePrefetch";

interface NavSlot {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PIN_KEY = "sud-admin-bottom-nav-pin";

/**
 * Role-derived default bottom nav. Indices: [0, 1, 3, 4] correspond to
 * the four corners around the centre FAB (slot 2 is the FAB itself).
 *
 * Kitchen role keeps KDS at the strongest left-thumb position because
 * the line cook lives there during service.
 */
function defaultSlots(role: AdminRole | null): NavSlot[] {
  if (role === "kitchen") {
    return [
      { href: "/admin/kds", label: "KDS", icon: ChefHat },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList },
      { href: "/admin/inventory", label: "Stock", icon: Package },
      { href: "__more__", label: "More", icon: LayoutGrid },
    ];
  }
  if (role === "staff") {
    return [
      { href: "/admin", label: "Home", icon: Home },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "__more__", label: "More", icon: LayoutGrid },
    ];
  }
  // Owner / manager / franchisee — the operations spine.
  return [
    { href: "/admin", label: "Home", icon: Home },
    { href: "/admin/orders", label: "Orders", icon: ClipboardList },
    { href: "/admin/inventory", label: "Stock", icon: Package },
    { href: "__more__", label: "More", icon: LayoutGrid },
  ];
}

interface Props {
  role: AdminRole | null;
  /** Triggered by the More tab and the long-press flow. */
  onOpenMore: () => void;
  /** Triggered by the centre FAB tap. */
  onTriggerQuick: () => void;
}

export function BottomNav({ role, onOpenMore, onTriggerQuick }: Props) {
  const pathname = usePathname();
  const [pinnedHref, setPinnedHref] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(PIN_KEY);
      if (v && ALL_NAV_ITEMS.some((n) => n.href === v)) setPinnedHref(v);
    } catch {
      /* storage may be blocked — non-fatal */
    }
  }, []);

  const slots = (() => {
    const base = defaultSlots(role);
    if (!pinnedHref) return base;
    const hit = ALL_NAV_ITEMS.find((n) => n.href === pinnedHref);
    if (!hit) return base;
    // Replace slot 2 (third position, before More) with the pinned item.
    const next = [...base];
    next[2] = { href: hit.href, label: hit.label, icon: hit.icon };
    return next;
  })();

  const isActive = (href: string) => {
    if (href === "__more__") {
      // Active when route is none of the other slots' prefixes.
      return !slots.some((s) => {
        if (s.href === "__more__") return false;
        if (s.href === "/admin") return pathname === "/admin";
        return pathname === s.href || pathname.startsWith(s.href + "/");
      });
    }
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Prefetch the slots' routes during idle time. Skip __more__ — its
  // handler opens a sheet, not a route.
  const prefetchRoutes = slots
    .map((s) => s.href)
    .filter((h) => h !== "__more__");
  useIdlePrefetch(prefetchRoutes);

  return (
    <nav className="v2-m-bottom-nav" aria-label="Primary navigation">
      <div className="v2-m-bottom-nav-inner">
        {slots.slice(0, 2).map((slot) => (
          <NavItem key={slot.href} slot={slot} active={isActive(slot.href)} onOpenMore={onOpenMore} />
        ))}
        <button
          type="button"
          className="v2-m-bottom-fab"
          onClick={() => {
            haptic("medium");
            onTriggerQuick();
          }}
          aria-label="Quick action"
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
        {slots.slice(2).map((slot) => (
          <NavItem key={slot.href} slot={slot} active={isActive(slot.href)} onOpenMore={onOpenMore} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  slot,
  active,
  onOpenMore,
}: {
  slot: NavSlot;
  active: boolean;
  onOpenMore: () => void;
}) {
  const Icon = slot.icon;
  if (slot.href === "__more__") {
    return (
      <button
        type="button"
        onClick={() => {
          haptic("light");
          onOpenMore();
        }}
        className={`v2-m-bottom-nav-item ${active ? "is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        aria-label="More"
      >
        <Icon className="v2-m-bottom-nav-icon" aria-hidden />
        <span className="v2-m-bottom-nav-label">{slot.label}</span>
      </button>
    );
  }
  return <PeekableLink slot={slot} active={active} />;
}

function PeekableLink({ slot, active }: { slot: NavSlot; active: boolean }) {
  const router = useRouter();
  const Icon = slot.icon;
  const [peek, setPeek] = useState(false);
  const timer = useRef<number | null>(null);

  const startTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPeek(true);
      haptic("medium");
    }, 450);
  };
  const cancelTimer = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Prefetch the route the moment the user touches the tab — feels
  // immediate when they release.
  const handlePointerDown = () => {
    try {
      router.prefetch(slot.href);
    } catch {
      /* non-fatal */
    }
    startTimer();
  };
  const handleClick = (e: React.MouseEvent) => {
    if (peek) {
      // Long-press already opened the peek — eat the click that follows.
      e.preventDefault();
      return;
    }
    haptic("light");
  };

  // Auto-close the peek when the user taps anywhere else.
  useEffect(() => {
    if (!peek) return;
    const onAny = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest(`[data-peek-for="${slot.href}"]`)) return;
      setPeek(false);
    };
    window.addEventListener("pointerdown", onAny, { capture: true });
    return () => window.removeEventListener("pointerdown", onAny, { capture: true });
  }, [peek, slot.href]);

  return (
    <span style={{ position: "relative" }} data-peek-for={slot.href}>
      <Link
        href={slot.href}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelTimer}
        onPointerCancel={cancelTimer}
        onPointerLeave={cancelTimer}
        className={`v2-m-bottom-nav-item ${active ? "is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="v2-m-bottom-nav-icon" aria-hidden />
        <span className="v2-m-bottom-nav-label">{slot.label}</span>
      </Link>
      {peek && (
        <div className="v2-m-nav-peek" role="tooltip">
          <div className="v2-m-nav-peek-title">{slot.label}</div>
          <div className="v2-m-nav-peek-href">{slot.href}</div>
          <button
            type="button"
            className="v2-m-chip"
            onClick={() => {
              setPeek(false);
              router.push(slot.href);
            }}
          >
            Open
          </button>
        </div>
      )}
    </span>
  );
}

export function setBottomNavPin(href: string): void {
  try {
    localStorage.setItem(PIN_KEY, href);
    window.dispatchEvent(new Event("sud-admin-bottom-nav-pin"));
  } catch {
    /* non-fatal */
  }
}
