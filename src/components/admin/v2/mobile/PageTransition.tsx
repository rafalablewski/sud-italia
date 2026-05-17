"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Lightweight route-transition wrapper. When the pathname changes, we
 * crossfade + slide the new content from the right (matches iOS push
 * navigation feel). Back navigations slide from the left — detected by
 * tracking the route history depth.
 *
 * Implemented with CSS animations on a key-bound child so React's
 * reconciler re-mounts the content; no animation library, no Suspense
 * boundary changes.
 *
 * Skipped when `prefers-reduced-motion` is on — the animation collapses
 * to an opacity-only fade.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stackRef = useRef<string[]>([]);
  const [direction, setDirection] = useState<"forward" | "back" | "none">("none");

  useEffect(() => {
    const stack = stackRef.current;
    const last = stack[stack.length - 1];
    if (last === pathname) return;
    const previousIdx = stack.lastIndexOf(pathname);
    if (previousIdx >= 0 && previousIdx < stack.length - 1) {
      // We've come back to a path that's earlier in the stack.
      stack.length = previousIdx + 1;
      setDirection("back");
    } else {
      stack.push(pathname);
      setDirection(stack.length === 1 ? "none" : "forward");
    }
    // Cap stack so it doesn't grow forever in a long session.
    if (stack.length > 30) stack.splice(0, stack.length - 30);
  }, [pathname]);

  return (
    <div
      key={pathname}
      className="v2-m-page-transition"
      data-direction={direction}
    >
      {children}
    </div>
  );
}
