"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mic, Search } from "lucide-react";
import { ALL_NAV_ITEMS } from "../nav.config";
import { haptic } from "./haptics";

interface SearchHit {
  type: "order" | "customer" | "menu" | "ingredient";
  id: string;
  label: string;
  sub?: string;
  href: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen mobile palette. Three sections:
 *   1. Suggested jumps (current page-relevant nav + 3 recents)
 *   2. Pages (filtered from nav.config)
 *   3. Live search results from /api/admin/search
 *
 * Voice input is capability-gated on `window.SpeechRecognition`.
 */
export function MobileCommandPalette({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHits([]);
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)) ||
      null;
    setVoiceSupported(!!SR);
  }, []);

  useEffect(() => {
    if (!open) return;
    const needle = q.trim();
    if (!needle || needle.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(needle)}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const merged: SearchHit[] = [];
          for (const o of d.orders ?? []) {
            merged.push({
              type: "order",
              id: o.id,
              label: `Order ${o.id}`,
              sub: `${o.customerName ?? ""} · ${o.total ?? ""}`,
              href: `/admin/orders#${o.id}`,
            });
          }
          for (const c of d.customers ?? []) {
            merged.push({
              type: "customer",
              id: c.phone,
              label: c.name || c.phone,
              sub: c.phone,
              href: `/admin/customers/${encodeURIComponent(c.phone)}`,
            });
          }
          for (const m of d.menu ?? []) {
            merged.push({
              type: "menu",
              id: m.slug,
              label: m.name,
              sub: m.category,
              href: `/admin/menu/${m.slug}`,
            });
          }
          for (const i of d.ingredients ?? []) {
            merged.push({
              type: "ingredient",
              id: i.id,
              label: i.name,
              sub: "Ingredient",
              href: `/admin/inventory#${i.id}`,
            });
          }
          setHits(merged);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 140);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const nav = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ALL_NAV_ITEMS.slice(0, 8);
    return ALL_NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(needle));
  }, [q]);

  const startVoice = () => {
    if (!voiceSupported) return;
    type SR = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript;
      if (t) setQ(t);
    };
    rec.onend = () => setVoiceActive(false);
    rec.onerror = () => setVoiceActive(false);
    rec.start();
    setVoiceActive(true);
    haptic("medium");
  };

  if (!open) return null;

  return createPortal(
    <div className="v2-m-palette-root" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="v2-m-palette-topbar">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="v2-m-icon-btn"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <label className="v2-m-palette-search">
          <Search className="h-4 w-4" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            placeholder="Search orders, customers, menu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
        </label>
        {voiceSupported && (
          <button
            type="button"
            aria-label="Voice search"
            onClick={startVoice}
            className={`v2-m-icon-btn ${voiceActive ? "is-active" : ""}`}
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="v2-m-palette-body">
        {q.trim().length < 2 && (
          <div className="v2-m-palette-hint">
            Type to search. Voice and recent jumps appear below.
          </div>
        )}

        {nav.length > 0 && (
          <section>
            <h3 className="v2-m-palette-section-label">Pages</h3>
            <ul role="list" className="v2-m-palette-list">
              {nav.map((n) => {
                const Icon = n.icon;
                return (
                  <li key={n.href}>
                    <Link href={n.href} onClick={onClose} className="v2-m-palette-item">
                      <Icon className="v2-m-palette-item-icon" aria-hidden />
                      <span className="v2-m-palette-item-label">{n.label}</span>
                      {n.shortcut && (
                        <span className="v2-m-palette-kbd">g {n.shortcut}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {hits.length > 0 && (
          <section>
            <h3 className="v2-m-palette-section-label">
              Results {loading && <span className="opacity-50">· loading…</span>}
            </h3>
            <ul role="list" className="v2-m-palette-list">
              {hits.map((h) => (
                <li key={`${h.type}-${h.id}`}>
                  <Link
                    href={h.href}
                    onClick={onClose}
                    className="v2-m-palette-item"
                    data-type={h.type}
                  >
                    <span className="v2-m-palette-item-pill" data-type={h.type}>
                      {labelFor(h.type)}
                    </span>
                    <span className="v2-m-palette-item-stack">
                      <span className="v2-m-palette-item-label">{h.label}</span>
                      {h.sub && (
                        <span className="v2-m-palette-item-sub">{h.sub}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {q.trim().length >= 2 && hits.length === 0 && !loading && (
          <div className="v2-m-palette-empty">No matches for &ldquo;{q}&rdquo;.</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function labelFor(t: SearchHit["type"]) {
  return t === "order"
    ? "Order"
    : t === "customer"
      ? "Cust"
      : t === "menu"
        ? "Menu"
        : "Ingr";
}
