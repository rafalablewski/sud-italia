"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { useToast } from "../v2/ui/Toast";
import {
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

interface ConversationRow {
  phone: string;
  lastAt: string;
  customerName: string | null;
  locationSlug: string | null;
  messageCount: number;
  lastBody: string;
  hasActiveSession: boolean;
}

interface WaMessage {
  at: string;
  direction: "in" | "out";
  body: string;
  actor?: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Mobile WhatsApp inbox + thread. Two states: list view (default), and
 * thread view when a conversation is selected. Thread is chat-shaped —
 * naturally fits mobile.
 */
export function MobileWhatsApp() {
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const refresh = async () => {
    const [sessRes, transRes] = await Promise.all([
      fetch("/api/admin/whatsapp/sessions").then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch("/api/admin/whatsapp/transcripts").then((r) => (r.ok ? r.json() : { transcripts: [] })),
    ]);
    const sessions: Array<{ phone: string; customerName?: string; locationSlug?: string; lastAt: string; cart?: { count: number; subtotalGrosze: number } }> =
      sessRes.sessions ?? [];
    const transcripts: Array<{ phone: string; customerName?: string; lastAt: string; messageCount: number; lastBody?: string }> =
      transRes.transcripts ?? [];
    const map = new Map<string, ConversationRow>();
    for (const t of transcripts) {
      map.set(t.phone, {
        phone: t.phone,
        lastAt: t.lastAt,
        customerName: t.customerName ?? null,
        locationSlug: null,
        messageCount: t.messageCount,
        lastBody: t.lastBody ?? "",
        hasActiveSession: false,
      });
    }
    for (const s of sessions) {
      const prev = map.get(s.phone);
      map.set(s.phone, {
        phone: s.phone,
        lastAt: s.lastAt,
        customerName: s.customerName ?? prev?.customerName ?? null,
        locationSlug: s.locationSlug ?? null,
        messageCount: prev?.messageCount ?? 0,
        lastBody: prev?.lastBody ?? "",
        hasActiveSession: true,
      });
    }
    setConvos(Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
  };

  useEffect(() => { refresh(); }, []);

  const items: MobileListItem<ConversationRow>[] = convos.map((c) => ({
    id: c.phone,
    data: c,
    icon: MessageCircle,
    iconTone: c.hasActiveSession ? "success" : "neutral",
    title: c.customerName || c.phone,
    subtitle: c.lastBody || "(no messages yet)",
    trailing: relTime(c.lastAt),
    onTap: (row) => setActive(row.phone),
  }));

  if (active) {
    const convo = convos.find((c) => c.phone === active) ?? null;
    return (
      <Thread
        phone={active}
        convo={convo}
        onBack={() => setActive(null)}
      />
    );
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage>
        <PageHeader title="WhatsApp" subtitle={`${convos.length} conversation${convos.length === 1 ? "" : "s"}`} />
        <MobileList items={items} virtualizeAt={68} />
      </MobilePage>
    </PullToRefresh>
  );
}

function Thread({
  phone,
  convo,
  onBack,
}: {
  phone: string;
  convo: ConversationRow | null;
  onBack: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      const r = await fetch(`/api/admin/whatsapp/transcripts/${encodeURIComponent(phone)}`);
      if (!r.ok) return;
      const data = await r.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    },
    [phone],
  );

  useEffect(() => {
    refresh();
    const tick = window.setInterval(refresh, 15000);
    return () => window.clearInterval(tick);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/whatsapp/sessions/${encodeURIComponent(phone)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not send", data.error);
        return;
      }
      setDraft("");
      refresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <MobilePage>
      <PageHeader
        title={convo?.customerName || phone}
        subtitle={phone}
        actions={
          <button
            type="button"
            className="v2-m-icon-btn"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          minHeight: "55dvh",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--m-card-radius)",
        }}
      >
        {messages.length === 0 ? (
          <div className="v2-m-empty">
            <div className="v2-m-empty-title">No messages yet</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.at}-${i}`}
              style={{
                alignSelf: m.direction === "out" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                padding: "8px 12px",
                borderRadius: 14,
                background:
                  m.direction === "out" ? "var(--brand-soft)" : "var(--surface-2)",
                color: "var(--fg)",
                fontSize: 14,
              }}
            >
              <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
              <div
                style={{
                  fontSize: 10,
                  marginTop: 4,
                  color: "var(--fg-subtle)",
                  textAlign: m.direction === "out" ? "right" : "left",
                }}
              >
                {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {m.actor ? ` · ${m.actor}` : ""}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a reply…"
          style={{
            flex: 1,
            padding: "10px 14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            color: "var(--fg)",
            fontSize: 16,
            fontFamily: "var(--font-ui)",
            outline: 0,
          }}
        />
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          onClick={send}
          disabled={sending || !draft.trim()}
          aria-label="Send"
          style={{ minWidth: 44, padding: 0, width: 44, borderRadius: 999 }}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </MobilePage>
  );
}
