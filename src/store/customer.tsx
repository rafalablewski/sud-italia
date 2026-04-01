"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";

export interface CustomerIdentity {
  phone: string;
  name: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  ordersCount: number;
  points: number;
  isNew?: boolean;
  /** True when httpOnly owner cookie matches this phone (OTP verified). */
  isNumberOwner?: boolean;
  /** Up to 3 extra family member names earning on this number. */
  householdLabels?: string[];
}

interface CustomerContextValue {
  customer: CustomerIdentity | null;
  loading: boolean;
  identify: (phone: string, signup?: boolean) => Promise<void>;
  updateProfile: (updates: { name?: string; lastName?: string; nickname?: string }) => Promise<boolean>;
  logout: () => void | Promise<void>;
}

const CustomerContext = createContext<CustomerContextValue>({
  customer: null,
  loading: true,
  identify: async () => {},
  updateProfile: async () => false,
  logout: () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}

function getPhoneFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)sud-italia-customer=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const identify = useCallback(async (phone: string, signup: boolean = false) => {
    try {
      const url = `/api/customer/identify?phone=${encodeURIComponent(phone)}${signup ? "&signup=true" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.customer) {
        const c = data.customer;
        setCustomer({
          ...c,
          isNumberOwner: c.isNumberOwner === true,
          householdLabels: Array.isArray(c.householdLabels)
            ? c.householdLabels
            : [],
        });
        const cookiePhone = c.phone || phone;
        document.cookie = `sud-italia-customer=${encodeURIComponent(cookiePhone)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    }
  }, []);

  const updateProfile = useCallback(async (updates: { name?: string; lastName?: string; nickname?: string }): Promise<boolean> => {
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.customer) {
        setCustomer((prev) => prev ? { ...prev, ...data.customer } : prev);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/customer/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setCustomer(null);
    document.cookie = "sud-italia-customer=;path=/;max-age=0";
  }, []);

  // Auto-identify from cookie on mount
  useEffect(() => {
    const phone = getPhoneFromCookie();
    if (phone) {
      identify(phone).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [identify]);

  return (
    <CustomerContext.Provider value={{ customer, loading, identify, updateProfile, logout }}>
      {children}
    </CustomerContext.Provider>
  );
}
