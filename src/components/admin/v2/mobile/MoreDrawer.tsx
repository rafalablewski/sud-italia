"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, ChevronRight, Clock, Download, LogOut, MapPin, Monitor, Pin, Search, Sparkles, Sun } from "lucide-react";
import type { AdminRole } from "@/lib/admin-roles";
import { ALL_NAV_ITEMS, filterNavForRole, NAV_SECTIONS } from "../nav.config";
import { BottomSheet } from "./BottomSheet";
import { setBottomNavPin } from "./BottomNav";
import { useAdminLocation } from "../LocationContext";
import { PushSettingsSheet } from "./PushSettingsSheet";
import { useAdminPush } from "./useAdminPush";
import { useAutoTheme } from "./useAutoTheme";
import { useInstallPrompt } from "./useInstallPrompt";
import { useNavHistory } from "./useNavHistory";
import { ThemeToggle } from "../ThemeToggle";
import { haptic } from "./haptics";
import { getForceDesktop, setForceDesktop } from "./useIsMobile";

interface Props {
  open: boolean;
  onClose: () => void;
  role: AdminRole | null;
}

/**
 * Bottom-sheet listing every nav item not in the bottom nav, grouped
 * by section. Long-press a row → pin to the bottom nav (replaces slot 2).
 * Footer holds location switcher, theme toggle, and logout.
 */
export function MoreDrawer({ open, onClose, role }: Props) {
  const [q, setQ] = useState("");
  const { location, setLocation, activeLocations } = useAdminLocation();
  const { recent, frequent } = useNavHistory();
  const push = useAdminPush();
  const autoTheme = useAutoTheme();
  const install = useInstallPrompt();
  const [pushSettingsOpen, setPushSettingsOpen] = useState(false);
  const [desktopForced, setDesktopForced] = useState(false);
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  useEffect(() => {
    if (open) setDesktopForced(getForceDesktop());
  }, [open]);
  useEffect(() => {
    let cancelled = false;
    const loadSettings = () => {
      fetch("/api/admin/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled && j) {
            setSimulationEnabled(!!j.simulationEnabled);
          }
        })
        .catch(() => {});
    };
    loadSettings();
    window.addEventListener("sud-admin-settings-updated", loadSettings);
    return () => {
      cancelled = true;
      window.removeEventListener("sud-admin-settings-updated", loadSettings);
    };
  }, []);
  const sections = useMemo(
    () =>
      filterNavForRole(role, { simulation: simulationEnabled }) ||
      NAV_SECTIONS,
    [role, simulationEnabled],
  );

  const navByHref = useMemo(() => {
    const m = new Map(ALL_NAV_ITEMS.map((n) => [n.href, n]));
    return m;
  }, []);

  // Frequent/Recent are only useful when the user hasn't typed a query.
  const showShortcuts = q.trim().length === 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => i.label.toLowerCase().includes(needle)),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, q]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="All sections"
      size="full"
    >
      <div className="v2-m-more-search">
        <Search className="h-4 w-4" aria-hidden />
        <input
          type="search"
          inputMode="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search navigation"
        />
      </div>

      <div className="v2-m-more-sections">
        {showShortcuts && frequent.length > 0 && (
          <div className="v2-m-more-section">
            <div className="v2-m-more-section-label">
              <Sparkles
                className="h-3 w-3"
                aria-hidden
                style={{ display: "inline", marginRight: 4, verticalAlign: -1, color: "var(--brand)" }}
              />
              Frequent
            </div>
            <ul role="list">
              {frequent.map((href) => {
                const item = navByHref.get(href);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <li key={`freq-${href}`}>
                    <Link
                      href={href}
                      onClick={() => {
                        haptic("light");
                        onClose();
                      }}
                      className="v2-m-more-item"
                    >
                      <Icon className="v2-m-more-item-icon" aria-hidden />
                      <span className="v2-m-more-item-label">{item.label}</span>
                      <ChevronRight className="v2-m-more-item-chev" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {showShortcuts && recent.length > 0 && (
          <div className="v2-m-more-section">
            <div className="v2-m-more-section-label">
              <Clock
                className="h-3 w-3"
                aria-hidden
                style={{ display: "inline", marginRight: 4, verticalAlign: -1 }}
              />
              Recent
            </div>
            <ul role="list">
              {recent.map((href) => {
                const item = navByHref.get(href);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <li key={`recent-${href}`}>
                    <Link
                      href={href}
                      onClick={() => {
                        haptic("light");
                        onClose();
                      }}
                      className="v2-m-more-item"
                    >
                      <Icon className="v2-m-more-item-icon" aria-hidden />
                      <span className="v2-m-more-item-label">{item.label}</span>
                      <ChevronRight className="v2-m-more-item-chev" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {filtered.map((section) => (
          <div key={section.id} className="v2-m-more-section">
            <div className="v2-m-more-section-label">{section.label}</div>
            <ul role="list">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => {
                        haptic("light");
                        onClose();
                      }}
                      className="v2-m-more-item"
                    >
                      <Icon className="v2-m-more-item-icon" aria-hidden />
                      <span className="v2-m-more-item-label">{item.label}</span>
                      <button
                        type="button"
                        className="v2-m-more-item-pin"
                        aria-label={`Pin ${item.label} to bottom nav`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setBottomNavPin(item.href);
                          haptic("success");
                        }}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight
                        className="v2-m-more-item-chev"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="v2-m-more-empty">No matches.</div>
        )}
      </div>

      <div className="v2-m-more-footer">
        <div className="v2-m-more-footer-row">
          <div className="v2-m-more-footer-label">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Location
          </div>
          <div className="v2-m-more-loc-segments" role="group" aria-label="Active location">
            <button
              type="button"
              className={`v2-m-more-loc-btn ${location === "" ? "is-active" : ""}`}
              onClick={() => setLocation("")}
            >
              All
            </button>
            {activeLocations.map((l) => (
              <button
                key={l.slug}
                type="button"
                className={`v2-m-more-loc-btn ${location === l.slug ? "is-active" : ""}`}
                onClick={() => setLocation(l.slug)}
              >
                {l.city}
              </button>
            ))}
          </div>
        </div>

        <div className="v2-m-more-footer-row">
          <div className="v2-m-more-footer-label">Theme</div>
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className={`v2-m-chip ${autoTheme.enabled ? "is-active" : ""}`}
              onClick={autoTheme.toggle}
              aria-pressed={autoTheme.enabled}
              title="Auto-switch dark/light by hour (07:00 / 19:00)"
            >
              <Sun className="h-3 w-3" aria-hidden /> Auto
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div className="v2-m-more-footer-row">
          <div className="v2-m-more-footer-label">
            <Monitor className="h-3.5 w-3.5" aria-hidden /> Desktop view
          </div>
          <button
            type="button"
            className={`v2-m-chip ${desktopForced ? "is-active" : ""}`}
            onClick={() => {
              const next = !desktopForced;
              setDesktopForced(next);
              setForceDesktop(next);
              haptic("light");
            }}
            aria-pressed={desktopForced}
            title="Render every admin page with the full desktop layout. Useful for pages that aren't fully wired up for mobile yet."
          >
            {desktopForced ? "On" : "Off"}
          </button>
        </div>

        {install.available && !install.installed && (
          <div className="v2-m-more-footer-row">
            <div className="v2-m-more-footer-label">
              <Download className="h-3.5 w-3.5" aria-hidden /> Install
            </div>
            <button
              type="button"
              className="v2-m-chip"
              onClick={() => install.prompt()}
            >
              Add to home screen
            </button>
          </div>
        )}

        {push.supported && push.configured && (
          <div className="v2-m-more-footer-row">
            <div className="v2-m-more-footer-label">
              <Bell className="h-3.5 w-3.5" aria-hidden /> Push alerts
            </div>
            <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className={`v2-m-chip ${push.subscribed ? "is-active" : ""}`}
                disabled={push.busy}
                onClick={() =>
                  push.subscribed ? push.unsubscribe() : push.subscribe()
                }
                aria-pressed={push.subscribed}
              >
                {push.subscribed ? (
                  <>
                    <Bell className="h-3 w-3" aria-hidden /> On
                  </>
                ) : (
                  <>
                    <BellOff className="h-3 w-3" aria-hidden /> Off
                  </>
                )}
              </button>
              {push.subscribed && (
                <button
                  type="button"
                  className="v2-m-chip"
                  onClick={() => setPushSettingsOpen(true)}
                  aria-label="Push category settings"
                >
                  Settings
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="v2-m-more-logout"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span>Log out</span>
        </button>
      </div>
      <PushSettingsSheet
        open={pushSettingsOpen}
        onClose={() => setPushSettingsOpen(false)}
      />
    </BottomSheet>
  );
}
