import { neon } from "@neondatabase/serverless";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";
import type { BoardroomPersonaId } from "./personas";

/**
 * Boardroom meeting persistence. Stores the transcript + decisions from a
 * daily briefing / weekly review so operators can revisit what the agents
 * agreed and which decisions were approved/executed.
 *
 * Same self-bootstrap pattern as ai conversations (conversations.ts): the
 * table is created on first use, and when DATABASE_URL is unset (local
 * filesystem dev) reads/writes fall back to an in-process Map.
 */

export type MeetingType = "daily" | "weekly";

export interface MeetingContribution {
  persona: BoardroomPersonaId;
  /** The agent's spoken contribution. */
  text: string;
}

export interface MeetingDecision {
  title: string;
  /** Owning agent. */
  owner: BoardroomPersonaId;
  rationale: string;
  /** Optional concrete action the operator can run, gated by the tool flow. */
  proposedTool?: string;
  proposedInput?: Record<string, unknown>;
  /** Filled once an operator approves/executes the action. */
  status?: "proposed" | "approved" | "executed" | "dismissed";
}

export interface BoardroomMeeting {
  id: string;
  type: MeetingType;
  scope: string;
  /** KPI flags the meeting was convened to address. */
  agenda: string[];
  contributions: MeetingContribution[];
  decisions: MeetingDecision[];
  costGrosze: number;
  createdAt: string;
  createdBy: string;
}

const TABLE_KEY = "boardroom-meetings";

async function ensureMeetingsTable(): Promise<void> {
  await ensureTable(TABLE_KEY, [
    `CREATE TABLE IF NOT EXISTS boardroom_meetings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
      contributions JSONB NOT NULL DEFAULT '[]'::jsonb,
      decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
      cost_grosze INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS boardroom_meetings_created_idx
       ON boardroom_meetings (created_at DESC)`,
  ]);
}

const mem = new Map<string, BoardroomMeeting>();
const dbReady = (): boolean => !!process.env.DATABASE_URL;

export async function saveMeeting(meeting: BoardroomMeeting): Promise<BoardroomMeeting> {
  await ensureMeetingsTable();
  if (dbReady()) {
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(
      `INSERT INTO boardroom_meetings
        (id, type, scope, agenda, contributions, decisions, cost_grosze, created_at, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)`,
      [
        meeting.id,
        meeting.type,
        meeting.scope,
        JSON.stringify(meeting.agenda),
        JSON.stringify(meeting.contributions),
        JSON.stringify(meeting.decisions),
        meeting.costGrosze,
        meeting.createdAt,
        meeting.createdBy,
      ],
    );
  } else {
    mem.set(meeting.id, meeting);
  }
  return meeting;
}

function rowToMeeting(r: Record<string, unknown>): BoardroomMeeting {
  const parse = <T,>(v: unknown, fallback: T): T => {
    if (v == null) return fallback;
    if (typeof v === "string") {
      try {
        return JSON.parse(v) as T;
      } catch {
        return fallback;
      }
    }
    return v as T;
  };
  return {
    id: String(r.id),
    type: (r.type === "weekly" ? "weekly" : "daily"),
    scope: String(r.scope),
    agenda: parse<string[]>(r.agenda, []),
    contributions: parse<MeetingContribution[]>(r.contributions, []),
    decisions: parse<MeetingDecision[]>(r.decisions, []),
    costGrosze: Number(r.cost_grosze ?? 0),
    createdAt: String(r.created_at),
    createdBy: String(r.created_by),
  };
}

export async function listMeetings(limit = 20): Promise<BoardroomMeeting[]> {
  await ensureMeetingsTable();
  if (!dbReady()) {
    return Array.from(mem.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql.query(
      `SELECT * FROM boardroom_meetings ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )) as Record<string, unknown>[];
    return rows.map(rowToMeeting);
  } catch (err) {
    logger.error("boardroom.list_meetings.failed", { layer: "ai.boardroom" }, err);
    return [];
  }
}

/**
 * Transition one meeting decision's status (proposed → approved / executed /
 * dismissed). Powers the Agent HQ → Approvals queue so an actioned or
 * dismissed item leaves the list. Returns the updated meeting (or null).
 */
export async function updateMeetingDecisionStatus(
  meetingId: string,
  index: number,
  status: NonNullable<MeetingDecision["status"]>,
): Promise<BoardroomMeeting | null> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return null;
  if (index < 0 || index >= meeting.decisions.length) return meeting;
  meeting.decisions[index] = { ...meeting.decisions[index], status };
  if (dbReady()) {
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(`UPDATE boardroom_meetings SET decisions = $1::jsonb WHERE id = $2`, [
      JSON.stringify(meeting.decisions),
      meetingId,
    ]);
  } else {
    mem.set(meetingId, meeting);
  }
  return meeting;
}

export async function getMeeting(id: string): Promise<BoardroomMeeting | null> {
  await ensureMeetingsTable();
  if (!dbReady()) return mem.get(id) ?? null;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql.query(`SELECT * FROM boardroom_meetings WHERE id = $1`, [id])) as Record<
      string,
      unknown
    >[];
    return rows.length ? rowToMeeting(rows[0]) : null;
  } catch (err) {
    logger.error("boardroom.get_meeting.failed", { layer: "ai.boardroom" }, err);
    return null;
  }
}
