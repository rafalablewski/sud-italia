"use client";

import { useState } from "react";
import { useCustomer } from "@/store/customer";
import { Star, LogIn, User, LogOut, UserPlus } from "lucide-react";

interface CustomerGateProps {
  children: React.ReactNode;
}

export function CustomerGate({ children }: CustomerGateProps) {
  const { customer, loading, identify, logout } = useCustomer();
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  if (loading) return null;

  // Customer is identified — show their content + a small identity bar
  if (customer) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-xl bg-italia-green/5 border border-italia-green/15">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-italia-green/15 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-italia-green" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate font-heading font-semibold text-sm text-italia-dark">
                {customer.name}
              </p>
              <p className="text-[11px] text-italia-gray">
                {customer.points.toLocaleString()} pts &middot; {customer.ordersCount}{" "}
                {customer.ordersCount === 1 ? "order" : "orders"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex-shrink-0 text-xs text-italia-gray hover:text-italia-dark flex items-center gap-1 transition-colors"
          >
            <LogOut className="h-3 w-3" aria-hidden />
            Sign out
          </button>
        </div>
        {children}
      </div>
    );
  }

  const getFullPhone = () => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.startsWith("48") ? `+${cleaned}` : `+48${cleaned}`;
  };

  // Try to sign in with existing orders
  const handleSignIn = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 7) return;
    setChecking(true);
    setNotFound(false);
    await identify(getFullPhone());
    // identify sets customer if found; if still null after, show signup option
    setTimeout(() => setNotFound(true), 300);
    setChecking(false);
  };

  // Sign up as new member (no prior orders needed)
  const handleSignUp = async () => {
    setChecking(true);
    await identify(getFullPhone(), true);
    setNotFound(false);
    setChecking(false);
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
        Enter your phone number to check rewards or join for free.
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
            onChange={(e) => { setPhone(e.target.value); setNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            className="pub-input min-h-[44px] text-base rounded-l-none flex-1"
          />
        </div>
        <button
          onClick={handleSignIn}
          disabled={checking || phone.replace(/\D/g, "").length < 7}
          className="px-4 py-2 bg-italia-gold text-white font-semibold rounded-xl hover:bg-italia-gold-dark transition-colors text-sm min-h-[44px] flex items-center gap-1.5 disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" />
          {checking ? "..." : "Go"}
        </button>
      </div>

      {/* Not found — offer to sign up */}
      {notFound && !customer && (
        <div className="mt-3 p-3 bg-white rounded-xl border border-gray-100 max-w-xs mx-auto animate-fade-in">
          <p className="text-sm text-italia-dark mb-2">
            New here? Join our rewards program — it&apos;s free!
          </p>
          <button
            onClick={handleSignUp}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-italia-green text-white font-semibold rounded-xl hover:bg-italia-green-dark transition-colors text-sm"
          >
            <UserPlus className="h-4 w-4" />
            {checking ? "Joining..." : "Join Rewards Program"}
          </button>
          <p className="text-[10px] text-italia-gray mt-2">
            Links this device to your number for Rewards. Points still come from
            orders placed with that phone — no password.
          </p>
        </div>
      )}

      <p className="text-[11px] text-italia-gray/70 mt-3">
        Your number is your rewards account on this site — no password
      </p>
    </div>
  );
}
