"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { Inbox, ArrowRight, AlertTriangle, Repeat } from "lucide-react";
import type { Task, Announcement, AnnouncementState, RoutineLine } from "@/lib/comms";

type AnnRow = Announcement & { read: boolean; state: AnnouncementState };

// Today's date as a local-time `YYYY-MM-DD` string — matches how task dueDates
// are entered, so the overdue compare doesn't flip a day either side of UTC.
function localISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The personal-comms indicator — a small **inbox** button with an unread count,
 * deliberately distinct from the operational alerts **bell** (`TopbarV3`, the
 * automated `/admin/alerts` stream). The architecture keeps the two streams
 * apart (see `src/lib/comms.ts`), so this NEVER reads operational notifications:
 * its count = unread Inbox announcements + open to-dos for the signed-in user,
 * from the any-authed `/api/admin/my-announcements` + `/api/admin/my-tasks`.
 *
 * Rendered both in the admin shell topbar and on the role-portal headers so the
 * count follows the user. Clicking opens a glance dropdown (portaled to
 * `document.body` to dodge stacking-context traps) that links to the portal
 * inbox, where the full Inbox / Archived / Deleted board + actions live.
 */
export function CommsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [anns, setAnns] = useState<AnnRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<RoutineLine[]>([]);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const [a, t, r] = await Promise.all([
      fetch("/api/admin/my-announcements").then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch("/api/admin/my-tasks").then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch("/api/admin/my-routines").then((res) => (res.ok ? res.json() : [])).catch(() => []),
    ]);
    setAnns(Array.isArray(a) ? a : []);
    setTasks(Array.isArray(t) ? t : []);
    setRoutines(Array.isArray(r) ? r : []);
  }, []);

  // Poll on the same 15s cadence as the operational bell so counts stay fresh.
  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) load(); };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [load]);

  const unreadAnns = anns.filter((a) => a.state === "inbox" && !a.read);
  const openTasks = tasks.filter((t) => t.status === "open");
  const pendingRoutines = routines.filter((r) => !r.done);
  const count = unreadAnns.length + openTasks.length + pendingRoutines.length;

  // Portal base: a franchisee's inbox lives at /franchisee, everyone else (incl.
  // an owner previewing) at /manager.
  const portalBase = pathname.startsWith("/franchisee") ? "/franchisee" : "/manager";

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  // Close on outside click / Escape while open. Re-pin to the button on resize
  // (and scroll) so the fixed, body-portaled dropdown can't drift out of place.
  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const goToInbox = () => {
    setOpen(false);
    router.push(portalBase);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="av3-icon-btn"
        aria-label={count > 0 ? `${count} unread notifications and to-dos` : "Notifications and to-dos"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); toggle(); }}
      >
        <Inbox className="av3-btn-ico" />
        {count > 0 && (
          <span className="av3-bell-badge" aria-hidden>{count > 9 ? "9+" : count}</span>
        )}
      </button>

      {open && coords && createPortal(
        <div
          role="dialog"
          aria-label="Notifications and to-dos"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: coords.top, right: coords.right, zIndex: 1000,
            width: "min(340px, calc(100vw - 16px))",
            background: "var(--av3-s1)", border: "1px solid var(--av3-line-strong)",
            borderRadius: "var(--av3-r-lg)", boxShadow: "var(--av3-sh-2)", overflow: "hidden",
            fontFamily: "var(--av3-ui)", color: "var(--av3-fg)",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderBottom: "1px solid var(--av3-line)",
            fontSize: "13px", fontWeight: 600,
          }}>
            <span>Notifications &amp; to-dos</span>
            <span style={{ fontSize: "11px", color: "var(--av3-subtle)", fontWeight: 500 }}>
              {count > 0 ? `${count} need attention` : "all clear"}
            </span>
          </div>

          <div style={{ maxHeight: 320, overflow: "auto" }}>
            {count === 0 ? (
              <p style={{ margin: 0, padding: "16px 14px", fontSize: "12.5px", color: "var(--av3-muted)" }}>
                You&rsquo;re all caught up.
              </p>
            ) : (
              <>
                {unreadAnns.map((a) => (
                  <GlanceRow
                    key={a.id}
                    dot="var(--av3-brand)"
                    title={a.createdByName}
                    sub={a.title}
                    onClick={goToInbox}
                  />
                ))}
                {openTasks.map((t) => {
                  const overdue = !!t.dueDate && t.dueDate < localISODate();
                  return (
                    <GlanceRow
                      key={t.id}
                      dot={overdue ? "var(--av3-bad)" : "var(--av3-warn)"}
                      title={overdue ? "Overdue to-do" : "To-do"}
                      sub={t.title}
                      icon={overdue ? <AlertTriangle style={{ width: 12, height: 12, color: "var(--av3-bad)" }} /> : undefined}
                      onClick={goToInbox}
                    />
                  );
                })}
                {pendingRoutines.map((r) => (
                  <GlanceRow
                    key={r.id}
                    dot="var(--av3-info)"
                    title="Daily routine"
                    sub={r.title}
                    icon={<Repeat style={{ width: 12, height: 12, color: "var(--av3-info)" }} />}
                    onClick={goToInbox}
                  />
                ))}
              </>
            )}
          </div>

          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--av3-line)", textAlign: "center" }}>
            <button
              type="button"
              onClick={goToInbox}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
                color: "var(--av3-info)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer",
              }}
            >
              View all in inbox <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function GlanceRow({
  dot,
  title,
  sub,
  icon,
  onClick,
}: {
  dot: string;
  title: string;
  sub: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left",
        padding: "10px 14px", borderTop: "1px solid var(--av3-line)", background: "transparent",
        border: "none", borderTopWidth: 1, cursor: "pointer", color: "inherit",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, marginTop: 5, flexShrink: 0, background: dot }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "12.5px", fontWeight: 600 }}>
          {icon}{title}
        </span>
        <span style={{
          display: "block", fontSize: "11.5px", color: "var(--av3-muted)", marginTop: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {sub}
        </span>
      </span>
    </button>
  );
}
