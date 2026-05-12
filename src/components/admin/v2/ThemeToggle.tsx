"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./hooks/useTheme";

interface Props {
  className?: string;
}

export function ThemeToggle({ className = "" }: Props) {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`v2-icon-btn ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
