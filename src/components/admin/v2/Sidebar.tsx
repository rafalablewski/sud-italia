"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useNavSections } from "./useNavSections";
import { LocationSwitcher } from "./LocationSwitcher";

interface Props {
  onCloseMobile?: () => void;
  isMobile?: boolean;
}

/**
 * The single admin sidebar — one component, one vocabulary (`.app-sidebar` /
 * `.as-*`), rendered by both AdminShell and CoreShell (POS / Guest). The Core
 * suite is the source of truth for the look; the old parallel `.v2-sidebar` /
 * `.v2-brand-name-sub` markup is retired. Footer is the location switcher +
 * Log out (functional on every surface). KDS keeps its own full-screen wall.
 */
export function Sidebar({ onCloseMobile }: Props) {
  const pathname = usePathname();
  const sections = useNavSections();

  const isItemActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  return (
    <aside className="app-sidebar" aria-label="Admin navigation">
      <Link href="/admin" className="as-brand" onClick={onCloseMobile}>
        <span className="as-brand-mark" aria-hidden>SI</span>
        <span className="as-brand-text">
          <span className="as-brand-name">Sud Italia</span>
          <span className="as-brand-sub">Operations</span>
        </span>
      </Link>

      <nav className="as-scroll" aria-label="Sections">
        {sections.map((section) => (
          <div key={section.id} className="as-group">
            <div className="as-eyebrow">{section.label}</div>
            {section.items.map((item) => {
              const active = isItemActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  aria-current={active ? "page" : undefined}
                  className={`as-item ${active ? "is-active" : ""}`}
                >
                  <Icon className="as-ico" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="as-foot">
        <LocationSwitcher />
        <button type="button" onClick={handleLogout} className="as-logout">
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>
    </aside>
  );
}
