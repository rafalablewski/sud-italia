/**
 * Internal comms — to-do tasks + announcements.
 *
 * Client-safe leaf (imports only `AdminRole`), so the store (server) defines
 * persistence on these types while the role portals + admin board (client) share
 * the same shapes and the one recipient-matching rule. An owner (or anyone with
 * `comms.manage`) assigns a **task** to a teammate — it lands in that person's
 * to-do list — and posts an **announcement** to everyone / a set of roles /
 * locations / specific people — it lands in their announcements feed. Receiving
 * (reading your own tasks + announcements) needs no permission; only the
 * sending/management board is gated (`comms.view` / `comms.manage`).
 *
 * SEPARATION (deliberate — do not blur it): announcements are NOT operational
 * notifications. The `Notification` system (store.ts → `notifications.json`, the
 * topbar bell + `/admin/alerts`) is the AUTOMATED operational stream — new
 * orders, low stock, disputes — fanned out by the app. Announcements are
 * HUMAN-authored broadcasts. The two never share storage and must never
 * cross-write: an announcement must not call `addNotification`, and the bell /
 * Alerts must not read announcements. Keep them apart so an operator (and the
 * code) can't confuse "I'm messaging my team" with "the system paged me".
 */

import type { AdminRole } from "@/lib/admin-roles";

export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "open" | "done";

export const TASK_PRIORITIES: TaskPriority[] = ["high", "normal", "low"];

export interface Task {
  id: string;
  title: string;
  detail?: string;
  /** The teammate who owns this to-do (one task = one assignee = one done-state). */
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  /** Optional location context (e.g. the site the task is about). */
  locationSlug?: string;
  priority: TaskPriority;
  /** ISO date (yyyy-mm-dd), optional. */
  dueDate?: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdByName: string;
  /**
   * Targeting. Each axis is a filter; an **empty** axis means "no constraint on
   * this axis". All three empty ⇒ everyone. `userIds` is an explicit allowlist
   * unioned with the role/location match (see `isAnnouncementForUser`).
   */
  targetRoles?: AdminRole[];
  targetLocationSlugs?: string[];
  targetUserIds?: string[];
  pinned?: boolean;
  createdAt: string;
  /** userIds who have read/dismissed it. */
  readBy: string[];
  /**
   * Per-recipient mailbox state. Archiving/deleting is personal (Gmail-style):
   * one recipient archiving an announcement must not hide it for everyone else,
   * so we track the userIds in each bucket rather than a single shared flag.
   * `deletedBy` wins over `archivedBy`; absence of both = the Inbox.
   */
  archivedBy?: string[];
  deletedBy?: string[];
}

/** Which mailbox tab an announcement sits in for a given user. */
export type AnnouncementState = "inbox" | "archived" | "deleted";

/**
 * The per-user mailbox state. Deleted takes precedence over archived (a row a
 * user both archived then deleted reads as deleted); neither = the Inbox. Read
 * state is independent — a read announcement still lives in the Inbox until the
 * user archives or deletes it.
 */
export function announcementStateFor(a: Announcement, userId: string): AnnouncementState {
  if ((a.deletedBy ?? []).includes(userId)) return "deleted";
  if ((a.archivedBy ?? []).includes(userId)) return "archived";
  return "inbox";
}

/** The minimal user shape the recipient rule needs (matches AdminUser). */
export interface CommsUser {
  id: string;
  role: AdminRole;
  locationSlug?: string;
  locationSlugs?: string[];
}

function userLocations(u: CommsUser): string[] {
  if (u.locationSlugs?.length) return u.locationSlugs;
  return u.locationSlug ? [u.locationSlug] : [];
}

/**
 * Is `user` a recipient of announcement `a`?
 *  - explicitly listed in `targetUserIds` → yes;
 *  - no targeting at all (everyone) → yes;
 *  - otherwise must pass every *constrained* axis: role ∈ targetRoles (if set)
 *    AND a location ∈ targetLocationSlugs (if set).
 */
export function isAnnouncementForUser(a: Announcement, user: CommsUser): boolean {
  const ids = a.targetUserIds ?? [];
  const roles = a.targetRoles ?? [];
  const locs = a.targetLocationSlugs ?? [];
  if (ids.includes(user.id)) return true;
  const constrained = roles.length > 0 || locs.length > 0;
  // Everyone: nothing set at all (no ids, no role/loc filters).
  if (!constrained && ids.length === 0) return true;
  if (!constrained) return false; // only an id allowlist, and user isn't on it
  const roleOk = roles.length === 0 || roles.includes(user.role);
  const locOk = locs.length === 0 || userLocations(user).some((s) => locs.includes(s));
  return roleOk && locOk;
}

/** Human label of who an announcement reaches, for the management board. */
export function announcementAudienceLabel(a: Announcement): string {
  const parts: string[] = [];
  if (a.targetRoles?.length) parts.push(a.targetRoles.join(", "));
  if (a.targetLocationSlugs?.length) parts.push(a.targetLocationSlugs.join(", "));
  if (a.targetUserIds?.length) parts.push(`${a.targetUserIds.length} named`);
  return parts.length ? parts.join(" · ") : "Everyone";
}
