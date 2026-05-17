"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a list has completed its first data fetch. Pair with
 * `MobileList`'s `loading` prop to show skeleton rows on initial paint
 * and hide them as soon as the first response lands — even if it's
 * empty. Refetches don't re-trigger the skeleton (we keep showing the
 * data we have).
 *
 * Usage:
 *   const { loading, markLoaded } = useFirstLoad();
 *   useEffect(() => { fetch(...).then(d => { setRows(d); markLoaded(); }) }, []);
 *   <MobileList items={rows} loading={loading} />
 */
export function useFirstLoad(): { loading: boolean; markLoaded: () => void } {
  const [loading, setLoading] = useState(true);
  const fired = useRef(false);
  const markLoaded = () => {
    if (fired.current) return;
    fired.current = true;
    setLoading(false);
  };
  useEffect(() => {
    // Safety: after 6 s, force-clear the skeleton so a broken endpoint
    // doesn't trap the user in an "always loading" state.
    const t = window.setTimeout(() => {
      if (!fired.current) {
        fired.current = true;
        setLoading(false);
      }
    }, 6000);
    return () => window.clearTimeout(t);
  }, []);
  return { loading, markLoaded };
}
