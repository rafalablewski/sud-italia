import { neon } from "@neondatabase/serverless";
import { ensureTable } from "@/db/migrate";
import { logger } from "@/lib/logger";

/**
 * Conversation state (m4_4). Per-admin-user agent chat history.
 *
 * Self-bootstraps the schema — same pattern as idempotency.ts so the
 * agent UI works on a fresh deploy without a manual migration step.
 * When DATABASE_URL is unset (dev filesystem mode), reads/writes
 * fall back to an in-process Map; conversations don't survive a
 * server restart in that mode, which is fine for local dev.
 */

export interface AiMessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  costGrosze: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface AiConversationRow {
  id: string;
  userId: string;
  title: string;
  status: "active" | "archived";
  /** Boardroom persona this thread belongs to (ceo/coo/cfo/cmo), or null
   *  for the general ops-agent / team chat. Lets the Boardroom reopen the
   *  same per-agent thread instead of starting fresh each visit. */
  persona: string | null;
  createdAt: string;
  updatedAt: string;
}

const TABLE_KEY = "ai-conversations";

async function ensureAiTables(): Promise<void> {
  await ensureTable(TABLE_KEY, [
    `CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    // Added after the table shipped — idempotent ADD COLUMN so existing
    // deploys gain the persona tag without a manual migration.
    `ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS persona TEXT`,
    `CREATE INDEX IF NOT EXISTS ai_conversations_user_idx
       ON ai_conversations (user_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS ai_conversations_persona_idx
       ON ai_conversations (user_id, persona, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content JSONB NOT NULL,
      cost_grosze INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx
       ON ai_messages (conversation_id, created_at)`,
  ]);
}

// Filesystem-mode fallback — Map of conversationId -> rows. Process-local.
const memConversations = new Map<string, AiConversationRow>();
const memMessages = new Map<string, AiMessageRow[]>();

function dbReady(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function createConversation(
  userId: string,
  title: string,
  persona: string | null = null,
): Promise<AiConversationRow> {
  await ensureAiTables();
  const id = `aic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const row: AiConversationRow = {
    id,
    userId,
    title,
    status: "active",
    persona,
    createdAt: now,
    updatedAt: now,
  };
  if (dbReady()) {
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(
      `INSERT INTO ai_conversations (id, user_id, title, status, persona, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.userId, row.title, row.status, row.persona, row.createdAt, row.updatedAt],
    );
  } else {
    memConversations.set(id, row);
    memMessages.set(id, []);
  }
  return row;
}

/**
 * Most-recently-updated conversation for a user + persona. The Boardroom
 * uses this to reopen the same per-agent thread on revisit instead of
 * spawning a fresh one. `persona` null = the general ops-agent / team chat.
 */
export async function findLatestConversation(
  userId: string,
  persona: string | null,
): Promise<AiConversationRow | null> {
  await ensureAiTables();
  if (!dbReady()) {
    return (
      Array.from(memConversations.values())
        .filter((c) => c.userId === userId && (c.persona ?? null) === persona && c.status === "active")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    );
  }
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT id, user_id, title, status, persona, created_at, updated_at
       FROM ai_conversations
      WHERE user_id = $1
        AND status = 'active'
        AND persona IS NOT DISTINCT FROM $2
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, persona],
  )) as ConversationDbRow[];
  return rows.length ? mapConversationRow(rows[0]) : null;
}

interface ConversationDbRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  persona: string | null;
  created_at: string;
  updated_at: string;
}

function mapConversationRow(r: ConversationDbRow): AiConversationRow {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    status: r.status === "archived" ? "archived" : "active",
    persona: r.persona ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listConversations(userId: string, limit = 30): Promise<AiConversationRow[]> {
  await ensureAiTables();
  if (!dbReady()) {
    return Array.from(memConversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT id, user_id, title, status, persona, created_at, updated_at
       FROM ai_conversations
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2`,
    [userId, limit],
  )) as ConversationDbRow[];
  return rows.map(mapConversationRow);
}

export async function getConversation(id: string): Promise<AiConversationRow | null> {
  await ensureAiTables();
  if (!dbReady()) return memConversations.get(id) ?? null;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT id, user_id, title, status, persona, created_at, updated_at
       FROM ai_conversations WHERE id = $1`,
    [id],
  )) as ConversationDbRow[];
  if (rows.length === 0) return null;
  return mapConversationRow(rows[0]);
}

export async function appendMessage(
  conversationId: string,
  role: AiMessageRow["role"],
  content: unknown,
  usage?: { costGrosze?: number; inputTokens?: number; outputTokens?: number },
): Promise<AiMessageRow> {
  await ensureAiTables();
  const id = `aim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const row: AiMessageRow = {
    id,
    conversationId,
    role,
    content,
    costGrosze: usage?.costGrosze ?? 0,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    createdAt: now,
  };
  if (dbReady()) {
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(
      `INSERT INTO ai_messages
        (id, conversation_id, role, content, cost_grosze, input_tokens, output_tokens, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [
        row.id,
        row.conversationId,
        row.role,
        JSON.stringify(row.content),
        row.costGrosze,
        row.inputTokens,
        row.outputTokens,
        row.createdAt,
      ],
    );
    await sql.query(`UPDATE ai_conversations SET updated_at = $1 WHERE id = $2`, [
      now,
      conversationId,
    ]);
  } else {
    const list = memMessages.get(conversationId) ?? [];
    list.push(row);
    memMessages.set(conversationId, list);
    const conv = memConversations.get(conversationId);
    if (conv) memConversations.set(conversationId, { ...conv, updatedAt: now });
  }
  return row;
}

export async function getMessages(conversationId: string): Promise<AiMessageRow[]> {
  await ensureAiTables();
  if (!dbReady()) return memMessages.get(conversationId) ?? [];
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT id, conversation_id, role, content, cost_grosze, input_tokens, output_tokens, created_at
       FROM ai_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId],
  )) as {
    id: string; conversation_id: string; role: string; content: unknown;
    cost_grosze: number; input_tokens: number; output_tokens: number; created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as AiMessageRow["role"],
    content: r.content,
    costGrosze: r.cost_grosze,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    createdAt: r.created_at,
  }));
}

/**
 * Daily LLM spend across all users — used to enforce
 * AI_DAILY_BUDGET_GROSZE in the agent route. Computed against
 * created_at >= start-of-today UTC.
 */
export async function getDailyAiSpendGrosze(sinceIso?: string): Promise<number> {
  await ensureAiTables();
  let startIso = sinceIso;
  if (!startIso) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    startIso = startOfDay.toISOString();
  }
  if (!dbReady()) {
    let total = 0;
    for (const list of memMessages.values()) {
      for (const m of list) if (m.createdAt >= startIso) total += m.costGrosze;
    }
    return total;
  }
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql.query(
      `SELECT COALESCE(SUM(cost_grosze), 0)::bigint AS total
         FROM ai_messages
        WHERE created_at >= $1`,
      [startIso],
    )) as { total: string | number }[];
    return Number(rows[0]?.total ?? 0);
  } catch (err) {
    logger.error("ai.daily_spend.query_failed", { layer: "ai.conversations" }, err);
    return 0;
  }
}
