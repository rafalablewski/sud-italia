"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";

export interface CustomerIdentity {
  phone: string;
  name: string;
  email?: string;
  ordersCount: number;
  points: number;
}

interface CustomerContextValue {
  customer: CustomerIdentity | null;
  loading: boolean;
  identify: (phone: string) => Promise<void>;
  logout: () => void;
}

const CustomerContext = createContext<CustomerContextValue>({
  customer: null,
  loading: true,
  identify: async () => {},
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

  const identify = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/customer/identify?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.customer) {
        setCustomer(data.customer);
        // Set cookie so they stay identified
        document.cookie = `sud-italia-customer=${encodeURIComponent(phone)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    }
  }, []);

  const logout = useCallback(() => {
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
    <CustomerContext.Provider value={{ customer, loading, identify, logout }}>
      {children}
    </CustomerContext.Provider>
  );
}
