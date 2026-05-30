"use client";

import { useEffect, useId, useRef, useState } from "react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  locationSlug?: string | null;
  placeholder?: string;
  inputId?: string;
  className?: string;
}

/**
 * Delivery-address input with server-proxied autocomplete (Appendix A).
 *
 * Debounces keystrokes and queries /api/address/autocomplete (Google Places or
 * OSM Nominatim — the key stays server-side). Suggestions render in a dropdown;
 * the field stays fully free-text, so a failed/empty lookup never blocks the
 * order. Arrow keys + Enter navigate; Escape closes.
 */
export function AddressAutocomplete({
  value,
  onChange,
  locationSlug,
  placeholder,
  inputId,
  className,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Suppress the fetch that would otherwise fire right after a pick.
  const justPickedRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (q.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const params = new URLSearchParams({ q });
        if (locationSlug) params.set("location", locationSlug);
        const res = await fetch(`/api/address/autocomplete?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: { description: string }[] };
        const list = (data.suggestions ?? []).map((s) => s.description).filter(Boolean);
        setSuggestions(list);
        setActiveIndex(-1);
        setOpen(list.length > 0);
      } catch {
        /* abort / network — leave field as free-text */
      }
    }, q.length < 3 ? 0 : 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, locationSlug]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const pick = (s: string) => {
    justPickedRef.current = true;
    onChange(s);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="v8-address-ac" style={{ position: "relative" }}>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="v8-address-ac-list">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === activeIndex}
              className={`v8-address-ac-option${i === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
