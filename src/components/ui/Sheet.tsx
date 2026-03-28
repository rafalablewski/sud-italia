"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function Sheet({ open, onClose, children, title }: SheetProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) {
    return (
      <>
        {/* Backdrop (hidden) */}
        <div className="fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-300" />
      </>
    );
  }

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <div
          className="bottom-sheet-overlay"
          onClick={onClose}
        />
        <div className="bottom-sheet">
          <div className="bottom-sheet-handle" />
          {title && (
            <div className="flex items-center justify-between px-5 pb-3">
              <h2 className="text-lg font-semibold font-heading text-italia-dark">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </>
    );
  }

  // Desktop: side panel
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 opacity-100 transition-opacity duration-300"
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col translate-x-0"
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold font-heading text-italia-dark">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
