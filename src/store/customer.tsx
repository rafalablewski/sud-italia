"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";

export type WalletMemberStatus = "pending" | "active";

export interface CustomerWalletMember {
  phone: string;
  status: WalletMemberStatus;
  isHead: boolean;
  contributedPoints: number;
}

export interface CustomerWallet {
  id: string;
  role: "head" | "member";
  myStatus: WalletMemberStatus;
  poolEarned: number;
  spendablePool: number;
  myContributedPoints: number;
  headRedeemCap: number;
  memberRedeemCap: number;
  members: CustomerWalletMember[];
}

export interface CustomerIdentity {
  phone: string;
  name: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  ordersCount: number;
  /** Lifetime / tier points (shared pool when in an active wallet). */
  points: number;
  /** Points you can spend on rewards right now (head vs member rules applied). */
  spendablePoints: number;
  isNew?: boolean;
  wallet?: CustomerWallet | null;
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

function parseWallet(raw: unknown): CustomerWallet | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Record<string, unknown>;
  if (typeof w.id !== "string") return undefined;
  return raw as CustomerWallet;
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
        const spendable =
          typeof c.spendablePoints === "number" && Number.isFinite(c.spendablePoints)
            ? c.spendablePoints
            : typeof c.points === "number"
              ? c.points
              : 0;
        const walletParsed = parseWallet(c.wallet);
        setCustomer({
          phone: c.phone,
          name: c.name,
          lastName: c.lastName || "",
          nickname: c.nickname || "",
          email: c.email,
          ordersCount: typeof c.ordersCount === "number" ? c.ordersCount : 0,
          points: typeof c.points === "number" ? c.points : 0,
          spendablePoints: spendable,
          isNew: c.isNew === true,
          wallet: walletParsed === undefined ? null : walletParsed,
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
