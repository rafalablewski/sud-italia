"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";

export function NotifyMeForm({ city }: { city: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // TODO: Store in database via API route
    // For now, log and show success
    console.log(`[Notify Me] ${email} wants to know when ${city} opens`);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-italia-green font-medium py-2">
        <Check className="h-4 w-4" />
        We&apos;ll notify you!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Bell className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-italia-gray" />
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-italia-red"
        />
      </div>
      <button
        type="submit"
        className="px-4 py-2.5 bg-italia-gold text-white font-semibold text-sm rounded-xl hover:bg-italia-gold-dark transition-colors flex-shrink-0"
      >
        Notify Me
      </button>
    </form>
  );
}
