"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  FlaskConical,
  Search as SearchIcon,
  User as UserIcon,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { ALL_NAV_ITEMS } from "./nav.config";
import { useAdminBase } from "./useAdminBase";
import { withAdminBase } from "@/lib/admin-base";

interface SearchResult {
  id: string;
  type: "order" | "customer" | "menu-item" | "ingredient";
  label: string;
  sublabel?: string;
  href: string;
  meta?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FlatItem {
  key: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  href: string;
  group: string;
}

const TYPE_ICON: Record<SearchResult["type"], LucideIcon> = {
  order: ClipboardList,
  customer: UserIcon,
  "menu-item": UtensilsCrossed,
  ingredient: FlaskConical,
};

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  order: "Orders",
  customer: "Customers",
  "menu-item": "Menu items",
  ingredient: "Ingredients",
};

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  // Nav + search hrefs are canonical /admin/*; re-root them onto the prefix
  // this session is served under so jumping to a page keeps /manager/* etc.
  const base = useAdminBase();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reset state every time the palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Server search (debounced)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => {
          if (cancelled) return;
          setResults(Array.isArray(data.results) ? data.results : []);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  // Build pages section by matching nav items against the query
  const pageHits = useMemo<FlatItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items = q === "" ? ALL_NAV_ITEMS : ALL_NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q));
    return items.map((n) => {
      const href = withAdminBase(base, n.href);
      return {
        key: `page:${n.href}`,
        label: n.label,
        sublabel: href,
        icon: n.icon,
        href,
        group: "Pages",
      };
    });
  }, [query, base]);

  // Flatten all items in render order so keyboard nav works across groups
  const flatItems = useMemo<FlatItem[]>(() => {
    const grouped: Record<string, FlatItem[]> = { Pages: pageHits };
    for (const r of results) {
      const group = TYPE_LABEL[r.type];
      (grouped[group] ||= []).push({
        key: r.id,
        label: r.label,
        sublabel: r.sublabel,
        icon: TYPE_ICON[r.type],
        href: withAdminBase(base, r.href),
        group,
      });
    }
    return Object.values(grouped).flat();
  }, [pageHits, results, base]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, flatItems.length]);

  const run = useCallback(
    (item: FlatItem | undefined) => {
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      run(flatItems[activeIndex]);
    }
  };

  // Scroll the active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open || !mounted) return null;

  // Compute group boundaries for headings
  const groups: { name: string; start: number; items: FlatItem[] }[] = [];
  let cursor = 0;
  for (const item of flatItems) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) {
      last.items.push(item);
    } else {
      groups.push({ name: item.group, start: cursor, items: [item] });
    }
    cursor++;
  }

  return createPortal(
    <div className="v2-palette-root" onKeyDown={onKeyDown}>
      <div className="v2-palette-scrim" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="v2-palette">
        <div className="v2-palette-input-row">
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, customers, menu, ingredients, or jump to a page…"
            className="v2-palette-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="v2-kbd">Esc</kbd>
        </div>

        <div ref={listRef} className="v2-palette-list" role="listbox">
          {flatItems.length === 0 && (
            <div className="v2-palette-empty">
              {loading ? "Searching…" : query ? "No results" : "Type to search"}
            </div>
          )}

          {groups.map((group) => (
            <div key={`${group.name}-${group.start}`} className="v2-palette-group">
              <div className="v2-palette-group-label">{group.name}</div>
              {group.items.map((item, gi) => {
                const flatIndex = group.start + gi;
                const isActive = flatIndex === activeIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    data-idx={flatIndex}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => run(item)}
                    className={`v2-palette-item ${isActive ? "is-active" : ""}`}
                  >
                    <span className="v2-palette-item-icon">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-palette-item-text">
                      <span className="v2-palette-item-label">{item.label}</span>
                      {item.sublabel && <span className="v2-palette-item-sub">{item.sublabel}</span>}
                    </span>
                    <span className="v2-palette-item-hint" aria-hidden>
                      {isActive ? "↵" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="v2-palette-footer">
          <span className="v2-palette-footer-group">
            <kbd className="v2-kbd">↑</kbd>
            <kbd className="v2-kbd">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="v2-palette-footer-group">
            <kbd className="v2-kbd">↵</kbd>
            <span>Select</span>
          </span>
          <span className="v2-palette-footer-group">
            <kbd className="v2-kbd">g</kbd>
            <kbd className="v2-kbd">d</kbd>
            <span>Jump to Dashboard</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
