"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/ai-engine";

// V8 Trattoria chat assistant. Paper-textured FAB in the bottom-right
// that expands into a parchment chat sheet — italic Cormorant header
// ("Il nostro aiuto · our help"), bilingual subtitle, V8 message
// bubbles (oxblood-fill for the visitor, parchment-cream for the
// assistant), and a paper-card input with a terracotta send circle.
// Mirrors the rest of the storefront's hand-drawn line icons + V8
// palette so the widget reads as part of the page, not a third-party
// drop-in.

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ciao! I'm the Ottaviano assistant. Ask me about our menu, locations, hours, delivery, or loyalty program.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Answer is built server-side (/api/chat) so hours, delivery gate,
    // addresses, loyalty + brand reflect live admin settings.
    let response =
      "Sorry, I couldn't reach our assistant just now — please try again in a moment.";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = res.ok ? await res.json() : null;
      if (data && typeof data.response === "string") response = data.response;
    } catch {
      /* keep the fallback message */
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: response, timestamp: new Date().toISOString() },
    ]);
    setTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="v8-chat-fab"
          aria-label="Open chat assistant"
        >
          <ChatBubbleIcon />
          <span className="v8-chat-fab-dot" aria-hidden />
        </button>
      )}

      {open && (
        <div className="v8-chat-sheet" role="dialog" aria-label="Ottaviano assistant">
          <div className="v8-chat-head">
            <div className="v8-chat-head-mark" aria-hidden>
              <BasilSprigIcon />
            </div>
            <div className="v8-chat-head-titles">
              <p className="v8-chat-head-title">
                Il nostro aiuto <span className="v8-chat-head-sub-en">· our help</span>
              </p>
              <p className="v8-chat-head-sub">
                <span className="v8-chat-head-dot" aria-hidden /> Usually replies instantly
                <span className="bi-sec"> · risposte rapide</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="v8-chat-close"
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="v8-chat-body">
            {messages.map((msg) => (
              <div
                key={msg.timestamp}
                className={`v8-chat-row ${msg.role === "user" ? "is-user" : "is-bot"}`}
              >
                <div className="v8-chat-avatar" aria-hidden>
                  {msg.role === "user" ? <PersonIcon /> : <ChefHatIcon />}
                </div>
                <div className="v8-chat-bubble">
                  {msg.content.split("\n").map((line, j) => (
                    <p key={j} className={j > 0 ? "mt-1" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {typing && (
              <div className="v8-chat-row is-bot">
                <div className="v8-chat-avatar" aria-hidden>
                  <ChefHatIcon />
                </div>
                <div className="v8-chat-bubble v8-chat-typing">
                  <span aria-hidden />
                  <span aria-hidden />
                  <span aria-hidden />
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          <div className="v8-chat-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about our menu, hours…"
              className="v8-chat-input"
              aria-label="Message"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || typing}
              className="v8-chat-send"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// V8-style hand-drawn icons. Strokes use `currentColor` so the FAB +
// hover + active states drive colour from the surrounding text.

function ChatBubbleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6 C 4 4.5, 5 3.5, 7 3.5 L 17 3.5 C 19 3.5, 20 4.5, 20 6 L 20 14 C 20 15.5, 19 16.5, 17 16.5 L 11.5 16.5 L 6.5 20 L 7.5 16.5 C 5.5 16.4, 4 15.4, 4 14 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8.5" cy="10" r="0.9" fill="currentColor" />
      <circle cx="12" cy="10" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="10" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 3 L11 11 M11 3 L3 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M2 9 L16 2 L13 16 L9 10 L2 9 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M9 10 L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BasilSprigIcon() {
  // Same basil-sprig brand mark the Header uses, scaled down. Anchors
  // the chat header in the V8 brand voice — the assistant is signed
  // by the trattoria, not "Bot".
  return (
    <svg width="18" height="18" viewBox="0 0 38 38" fill="none" aria-hidden>
      <path d="M19 33 C 19 27, 19 20, 19 12" stroke="#4A7C59" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M19 24 C 14 22, 11 19, 10 15 C 14 17, 17 19, 19 22"
        fill="#4A7C59"
        fillOpacity="0.22"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 19 C 24 17, 27 14, 28 10 C 24 12, 21 14, 19 17"
        fill="#4A7C59"
        fillOpacity="0.22"
        stroke="#4A7C59"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="34" r="1.3" fill="#B85C38" />
    </svg>
  );
}

function ChefHatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4 9 C 2.5 8, 2 6.5, 3 5 C 4 3.5, 6 3.5, 7 4.5 C 7 3.5, 9 2.5, 11 4 C 13 2.5, 15.5 4, 15 6.5 C 16 7.5, 15.5 9, 14 9 L 14 13 L 4 13 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M4 13 L14 13 L13.5 15.5 L4.5 15.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path
        d="M3 16 C 3 12.5, 5.5 10.5, 9 10.5 C 12.5 10.5, 15 12.5, 15 16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
