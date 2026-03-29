"use client";

import { useState } from "react";
import { useCustomer } from "@/store/customer";
import { Star, LogIn, User, LogOut } from "lucide-react";

interface CustomerGateProps {
  children: React.ReactNode;
}

export function CustomerGate({ children }: CustomerGateProps) {
  const { customer, loading, identify, logout } = useCustomer();
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  if (loading) return null;

  // Customer is identified — show their content + a small identity bar
  if (customer) {
    return (
      <div>
        {/* Identity bar */}
        <div className="flex items-center justify-between mb-4 p-3 bg-italia-green/5 rounded-xl border border-italia-green/15">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-italia-green/15 flex items-center justify-center">
              <User className="h-4 w-4 text-italia-green" />
            </div>
            <div>
              <p className="text-sm font-semibold text-italia-dark">{customer.name}</p>
              <p className="text-[11px] text-italia-gray">
                {customer.points} pts &middot; {customer.ordersCount} orders
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-italia-gray hover:text-italia-dark flex items-center gap-1 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
        {children}
      </div>
    );
  }

  // Not identified — show sign-in prompt
  const handleSubmit = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 7) {
      setError("Please enter a valid phone number");
      return;
    }
    setChecking(true);
    setError("");
    const fullPhone = cleaned.startsWith("48") ? `+${cleaned}` : `+48${cleaned}`;
    await identify(fullPhone);
    setChecking(false);
    // If identify didn't find the customer, show error
    // (the identify function will set customer to null)
    setTimeout(() => {
      // Check if still no customer after identify
      setError("No orders found with this number. Place an order first to join rewards!");
    }, 500);
  };

  return (
    <div className="bg-gradient-to-br from-italia-gold/5 to-italia-cream rounded-2xl border border-italia-gold/15 p-5 text-center">
      <div className="w-12 h-12 rounded-full bg-italia-gold/10 flex items-center justify-center mx-auto mb-3">
        <Star className="h-6 w-6 text-italia-gold" />
      </div>
      <h3 className="font-heading font-bold text-lg text-italia-dark mb-1">
        Your Rewards & Achievements
      </h3>
      <p className="text-sm text-italia-gray mb-4">
        Sign in with your phone number to see your streaks, achievements, and referral code.
      </p>

      <div className="flex gap-2 max-w-xs mx-auto mb-2">
        <div className="flex items-center gap-0 flex-1">
          <span className="inline-flex items-center px-2.5 min-h-[44px] rounded-l-xl border-y-[1.5px] border-l-[1.5px] border-r-0 border-[#e5e7eb] bg-gray-50 text-sm font-medium text-italia-gray select-none">
            +48
          </span>
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="pub-input min-h-[44px] text-base rounded-l-none flex-1"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={checking}
          className="px-4 py-2 bg-italia-gold text-white font-semibold rounded-xl hover:bg-italia-gold-dark transition-colors text-sm min-h-[44px] flex items-center gap-1.5"
        >
          <LogIn className="h-4 w-4" />
          {checking ? "..." : "Sign in"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-italia-gray mt-2">{error}</p>
      )}

      <p className="text-[11px] text-italia-gray/70 mt-3">
        No account needed — we find you by your order history
      </p>
    </div>
  );
}
