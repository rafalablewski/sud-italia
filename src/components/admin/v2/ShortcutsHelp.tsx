"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ALL_NAV_ITEMS } from "./nav.config";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

const STATIC_SHORTCUTS: ShortcutRow[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["N"], label: "Open notifications" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close overlays" },
];

export function ShortcutsHelp({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const gotoShortcuts: ShortcutRow[] = ALL_NAV_ITEMS.filter((n) => n.shortcut).map((n) => ({
    keys: ["G", n.shortcut!.toUpperCase()],
    label: `Go to ${n.label}`,
  }));

  return createPortal(
    <div className="v2-help-root">
      <div className="v2-help-scrim" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="v2-help">
        <header className="v2-help-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="v2-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="v2-help-body">
          <section>
            <h3>Global</h3>
            <ul>
              {STATIC_SHORTCUTS.map((s) => (
                <li key={s.label}>
                  <span>{s.label}</span>
                  <span className="v2-help-keys">
                    {s.keys.map((k) => (
                      <kbd key={k} className="v2-kbd">{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Jump to</h3>
            <ul>
              {gotoShortcuts.map((s) => (
                <li key={s.label}>
                  <span>{s.label}</span>
                  <span className="v2-help-keys">
                    {s.keys.map((k, i) => (
                      <kbd key={`${k}-${i}`} className="v2-kbd">{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
