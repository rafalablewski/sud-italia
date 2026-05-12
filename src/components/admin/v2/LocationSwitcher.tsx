"use client";

import { Check, ChevronDown, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAdminLocation } from "./LocationContext";

interface Props {
  variant?: "sidebar" | "compact";
}

export function LocationSwitcher({ variant = "sidebar" }: Props) {
  const { location, setLocation, activeLocations } = useAdminLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  const active = activeLocations.find((l) => l.slug === location);
  const label = location === "" ? "All locations" : active?.city ?? "Unknown";
  const sublabel = location === "" ? `${activeLocations.length} sites` : active?.name.replace("Sud Italia - ", "");

  return (
    <div ref={ref} className={`relative ${variant === "compact" ? "" : "w-full"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="v2-loc-trigger"
      >
        <span className="v2-loc-icon">
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <span className="v2-loc-label">
          <span className="v2-loc-city">{label}</span>
          {sublabel && <span className="v2-loc-sub">{sublabel}</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 v2-loc-chev ${open ? "v2-loc-chev-open" : ""}`} />
      </button>

      {open && (
        <ul role="listbox" className="v2-loc-menu">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={location === ""}
              onClick={() => {
                setLocation("");
                setOpen(false);
              }}
              className="v2-loc-option"
            >
              <span className="v2-loc-option-label">All locations</span>
              {location === "" && <Check className="h-3.5 w-3.5" />}
            </button>
          </li>
          {activeLocations.map((l) => (
            <li key={l.slug}>
              <button
                type="button"
                role="option"
                aria-selected={location === l.slug}
                onClick={() => {
                  setLocation(l.slug);
                  setOpen(false);
                }}
                className="v2-loc-option"
              >
                <span className="v2-loc-option-label">
                  <span>{l.city}</span>
                  <span className="v2-loc-option-sub">{l.address.split(",")[0]}</span>
                </span>
                {location === l.slug && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
