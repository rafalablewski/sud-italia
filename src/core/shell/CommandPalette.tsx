"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLocation } from "@/shared/LocationContext";
import { coreHref } from "@/core/routes";

/**
 * ⌘K — the universal jump. One box resolves the surfaces (lenses), floor
 * tables, and menu SKUs, and runs the pick as a client navigation (so the
 * cross-lens selection survives). Global: mounted once in `CoreShell`, opens
 * on ⌘K / Ctrl-K anywhere in Core. Portaled to the `.core` root (Rule #4).
 */
interface Cmd { id: string; label: string; hint: string; run: () => void; }

const LENSES = [
  { label: "Floor", path: "/service/floor", kw: "floor tables map home" },
  { label: "POS · Line", path: "/pos", kw: "pos till order line check" },
  { label: "KDS · Pass", path: "/kds", kw: "kds kitchen pass tickets wall" },
  { label: "Book", path: "/guest/book", kw: "book reserve reservation slots" },
  { label: "Orders", path: "/orders", kw: "orders history" },
  { label: "Dispatch", path: "/service/dispatch", kw: "dispatch delivery drivers" },
  { label: "Guest", path: "/guest", kw: "guest crm loyalty inbox" },
];

export function CommandPalette() {
  const router = useRouter();
  const { location } = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [root, setRoot] = useState<Element | null>(null);
  const [tables, setTables] = useState<{ id: string; number: number | string }[]>([]);
  const [menu, setMenu] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { setRoot(document.getElementById("admin-portal-root")); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true); // command-bar button / touch trigger
    window.addEventListener("keydown", onKey);
    window.addEventListener("core:cmdk", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("core:cmdk", onOpen); };
  }, []);

  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  useEffect(() => {
    if (!open || !location) return;
    fetch(`/api/admin/floor/tables?location=${encodeURIComponent(location)}`)
      .then((r) => (r.ok ? r.json() : [])).then((d) => setTables(Array.isArray(d) ? d : d.tables ?? [])).catch(() => {});
    fetch(`/api/admin/menu?location=${encodeURIComponent(location)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMenu((Array.isArray(d) ? d : d.items ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }))))
      .catch(() => {});
  }, [open, location]);

  const go = useCallback((path: string) => { setOpen(false); router.push(coreHref(path)); }, [router]);

  const cmds = useMemo<Cmd[]>(() => {
    const t = q.trim().toLowerCase();
    const list: Cmd[] = [];
    for (const l of LENSES) if (!t || l.label.toLowerCase().includes(t) || l.kw.includes(t)) list.push({ id: `lens:${l.path}`, label: l.label, hint: "Lens", run: () => go(l.path) });
    if (!t || "shift handover close open".includes(t)) list.push({ id: "act:handover", label: "Shift handover", hint: "Action", run: () => { setOpen(false); window.dispatchEvent(new Event("core:handover")); } });
    if (t) {
      for (const tb of tables) if (`table ${tb.number}`.includes(t) || String(tb.number) === t) list.push({ id: `tbl:${tb.id}`, label: `Table ${tb.number}`, hint: "Floor", run: () => go("/service/floor") });
      for (const m of menu) if (m.name.toLowerCase().includes(t)) list.push({ id: `sku:${m.id}`, label: m.name, hint: "Add on POS", run: () => go("/pos") });
    }
    return list.slice(0, 40);
  }, [q, tables, menu, go]);

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, cmds.length - 1))); }, [cmds.length]);

  if (!open || !root) return null;
  return createPortal(
    <div className="core-cmdk-scrim" onClick={() => setOpen(false)}>
      <div className="core-cmdk" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="core-cmdk-input"
          placeholder="Jump to a lens, table, or dish…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(cmds.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); cmds[active]?.run(); }
          }}
        />
        <div className="core-cmdk-list">
          {cmds.length === 0 ? (
            <div className="core-cmdk-empty">No matches</div>
          ) : (
            cmds.map((c, i) => (
              <button key={c.id} type="button" className={`core-cmdk-item${i === active ? " on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => c.run()}>
                <span className="ci-l">{c.label}</span>
                <span className="ci-g">{c.hint}</span>
              </button>
            ))
          )}
        </div>
        <div className="core-cmdk-foot"><kbd>↑↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> close</div>
      </div>
    </div>,
    root,
  );
}
