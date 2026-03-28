"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function Sheet({ open, onClose, children, title }: SheetProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted) return null;

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
        <div
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "rounded-t-3xl max-h-[92vh]",
            open ? "translate-y-0" : "translate-y-full"
          )}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
          {title && (
            <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
              <h2 className="text-lg font-semibold font-heading text-italia-dark">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </div>
      </>
    );
  }

  // Desktop: side panel
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 flex-shrink-0">
            <h2 className="text-lg font-semibold font-heading text-italia-dark">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
