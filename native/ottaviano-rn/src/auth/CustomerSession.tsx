import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "@/lib/secureStore";
import { apiRequest, type RequestOptions, type ApiResult } from "@/api/client";
import { ApiError } from "@/api/envelope";
import type { CustomerProfile, TokenPair } from "@/api/types";

/**
 * Customer (Ottaviano) identity — phone-code login, zero-friction, no passwords
 * (Rule #6). `request(phone)` sends a 6-digit OTP; `verify(phone, code)` exchanges
 * it for the customer token pair (aud `ottaviano`), reusing the same rotating-
 * refresh infra as operators. The refresh token lives in the Keychain. A guest can
 * order without ever signing in — sign-in only unlocks Rewards + order history.
 */

const REFRESH_KEY = "ottaviano.customer.refresh";

type Status = "loading" | "signed-out" | "signed-in";

interface CustomerContextValue {
  status: Status;
  profile: CustomerProfile | null;
  /** Returns a `devCode` in non-prod when no SMS provider is configured. */
  request: (phone: string) => Promise<{ devCode?: string }>;
  verify: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authed: <T>(path: string, opts?: RequestOptions) => Promise<ApiResult<T>>;
  accessToken: string | null;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const access = useRef<string | null>(null);
  const refresh = useRef<string | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);

  const persist = useCallback(async (pair: TokenPair) => {
    access.current = pair.accessToken;
    refresh.current = pair.refreshToken;
    await SecureStore.setItemAsync(REFRESH_KEY, pair.refreshToken);
    setTokenVersion((v) => v + 1);
  }, []);

  const doRefresh = useCallback(async (): Promise<string> => {
    const rt = refresh.current ?? (await SecureStore.getItemAsync(REFRESH_KEY));
    if (!rt) throw new ApiError("unauthorized", "No refresh token", 401);
    const { data } = await apiRequest<TokenPair>("/auth/refresh", { method: "POST", body: { refreshToken: rt } });
    await persist(data);
    return data.accessToken;
  }, [persist]);

  const authed = useCallback(
    async <T,>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> => {
      const token = access.current ?? (await doRefresh());
      try {
        return await apiRequest<T>(path, { ...opts, token });
      } catch (e) {
        if (e instanceof ApiError && e.isUnauthorized) {
          const fresh = await doRefresh();
          return apiRequest<T>(path, { ...opts, token: fresh });
        }
        throw e;
      }
    },
    [doRefresh],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await authed<CustomerProfile>("/customer/me");
      setProfile(data);
      setStatus("signed-in");
    } catch {
      setStatus("signed-out");
    }
  }, [authed]);

  const request = useCallback(async (phone: string) => {
    const { data } = await apiRequest<{ devCode?: string }>("/customer/auth/request", { method: "POST", body: { phone } });
    return data ?? {};
  }, []);

  const verify = useCallback(
    async (phone: string, code: string) => {
      const { data } = await apiRequest<TokenPair>("/customer/auth/verify", { method: "POST", body: { phone, code } });
      await persist(data);
      await refreshProfile();
    },
    [persist, refreshProfile],
  );

  const logout = useCallback(async () => {
    const rt = refresh.current;
    if (rt) await apiRequest("/auth/logout", { method: "POST", body: { refreshToken: rt } }).catch(() => {});
    access.current = null;
    refresh.current = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setProfile(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rt = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!rt) {
        if (alive) setStatus("signed-out");
        return;
      }
      refresh.current = rt;
      try {
        await doRefresh();
        if (alive) await refreshProfile();
      } catch {
        await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
        if (alive) setStatus("signed-out");
      }
    })();
    return () => {
      alive = false;
    };
  }, [doRefresh, refreshProfile]);

  const value = useMemo<CustomerContextValue>(
    () => ({ status, profile, request, verify, logout, refreshProfile, authed, accessToken: access.current }),
    [status, profile, request, verify, logout, refreshProfile, authed, tokenVersion],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within a CustomerSessionProvider");
  return ctx;
}
