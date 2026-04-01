/**
 * In-process pub/sub so POST /api/cart/presence can wake SSE subscribers on the same Node instance.
 * On multi-instance deployments (e.g. Vercel), the 1s poll in the SSE handler still picks up changes quickly.
 */
type Listener = () => void;

const bySlug = new Map<string, Set<Listener>>();

export function subscribeCartPresence(locationSlug: string, listener: Listener): () => void {
  let set = bySlug.get(locationSlug);
  if (!set) {
    set = new Set();
    bySlug.set(locationSlug, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) bySlug.delete(locationSlug);
  };
}

export function notifyCartPresence(locationSlug: string): void {
  const set = bySlug.get(locationSlug);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
