"use client";

import { useState, useRef, useEffect } from "react";
import { getChatResponse, ChatMessage } from "@/lib/ai-engine";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ciao! 👋 I'm the Sud Italia assistant. Ask me about our menu, locations, hours, delivery, or loyalty program!",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
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

    // Simulate AI thinking delay
    setTimeout(() => {
      const response = getChatResponse(text);
      const botMsg: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setTyping(false);
    }, 800 + Math.random() * 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat bubble button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full bg-italia-green text-white shadow-lg shadow-italia-green/30 hover:shadow-xl hover:shadow-italia-green/40 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-[340px] sm:w-[380px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-scale-in"
          style={{ maxHeight: "min(500px, 70vh)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-italia-green to-italia-green-dark text-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm">Sud Italia Assistant</p>
                <p className="text-xs text-white/70">Usually replies instantly</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    msg.role === "user"
                      ? "bg-italia-red/10 text-italia-red"
                      : "bg-italia-green/10 text-italia-green"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-italia-red text-white rounded-tr-md"
                      : "bg-gray-100 text-italia-dark rounded-tl-md"
                  }`}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <p key={j} className={j > 0 ? "mt-1" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-italia-green/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-italia-green" />
                </div>
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 flex-shrink-0 bg-white">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about our menu, hours..."
              className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-italia-green focus:ring-2 focus:ring-italia-green/10"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || typing}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-italia-green text-white hover:bg-italia-green-dark transition-colors disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
