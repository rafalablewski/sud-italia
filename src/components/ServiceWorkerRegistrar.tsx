"use client";

import { useEffect } from "react";
import { registerOfflineOutbox } from "@/lib/offline-outbox";

/**
 * Client-only mount that registers /sw.js + the offline outbox once,
 * after first paint. Kept out of the root layout body proper so the
 * serverless render path stays static.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    registerOfflineOutbox();
  }, []);
  return null;
}
