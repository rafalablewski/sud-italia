import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "@/lib/secureStore";
import { apiRequest, type RequestOptions, type ApiResult } from "@/api/client";
import { ApiError } from "@/api/envelope";
import type { TokenPair, User } from "@/api/types";
import { rankForRole, type AdminRole } from "@/nav/roles";

/**
 * Operator (OttavianoKDS) identity — the JWT access + rotating-refresh pair from
 * `/api/v1/auth/*` (API-V1.md). The refresh token lives in the device Keychain
 * (`react-native-keychain`); the 15-min access token stays in memory. `authed()`
 * wraps every operator request: on a 401 it rotates the refresh token once and
 * retries, so a re-scope/disable lands within one access lifetime. Role drives
 * the nav gate (filterNavForRole), exactly like the web `filterNavForRoleV3`.
 */

const REFRESH_KEY = "ottaviano.operator.refresh";

type Status = "loading" | "signed-out" | "signed-in";

interface OperatorContextValue {
  status: Status;
  user: User | null;
  role: AdminRole | null;
  rank: number;
  login: (args: { email?: string; password: string; totp?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Authenticated request with transparent refresh-on-401 + one retry. */
  authed: <T>(path: string, opts?: RequestOptions) => Promise<ApiResult<T>>;
  /** The current access token (for opening authenticated SSE streams). */
  accessToken: string | null;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const access = useRef<string | null>(null);
  const refresh = useRef<string | null>(null);
  const [accessVersion, setAccessVersion] = useState(0); // re-render SSE consumers on rotate

  const persist = useCallback(async (pair: TokenPair) => {
    access.current = pair.accessToken;
    refresh.current = pair.refreshToken;
    await SecureStore.setItemAsync(REFRESH_KEY, pair.refreshToken);
    setAccessVersion((v) => v + 1);
  }, []);

  const clear = useCallback(async () => {
    access.current = null;
    refresh.current = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setUser(null);
    setStatus("signed-out");
  }, []);

  // Single-flight refresh. The refresh token is single-use (rotating), so if
  // several requests refresh at once — e.g. POS fires 8 authed() calls on mount
  // and the access token needs renewing — only ONE may spend the token; the rest
  // would 401 or hang on a consumed token. Dedupe: concurrent callers share the
  // same in-flight refresh promise and all get the one new access token.
  const refreshInFlight = useRef<Promise<string> | null>(null);
  const doRefresh = useCallback((): Promise<string> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const p = (async () => {
      const rt = refresh.current ?? (await SecureStore.getItemAsync(REFRESH_KEY));
      if (!rt) throw new ApiError("unauthorized", "No refresh token", 401);
      const { data } = await apiRequest<TokenPair>("/auth/refresh", {
        method: "POST",
        body: { refreshToken: rt },
      });
      await persist(data);
      return data.accessToken;
    })();
    refreshInFlight.current = p;
    // Clear the slot once settled so the next genuine 401 can refresh again.
    p.then(
      () => { if (refreshInFlight.current === p) refreshInFlight.current = null; },
      () => { if (refreshInFlight.current === p) refreshInFlight.current = null; },
    );
    return p;
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

  const login = useCallback(
    async (args: { email?: string; password: string; totp?: string }) => {
      const { data } = await apiRequest<TokenPair & { user: User }>("/auth/login", {
        method: "POST",
        body: { ...args, app: "ottaviano-kds" },
      });
      await persist(data);
      setUser(data.user);
      setStatus("signed-in");
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const rt = refresh.current;
    if (rt) await apiRequest("/auth/logout", { method: "POST", body: { refreshToken: rt } }).catch(() => {});
    await clear();
  }, [clear]);

  // Cold start: if a refresh token is in the Keychain, resume the session.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rt = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!rt) {
          if (alive) setStatus("signed-out");
          return;
        }
        refresh.current = rt;
        const token = await doRefresh();
        const { data } = await apiRequest<User>("/auth/me", { token });
        if (!alive) return;
        setUser(data);
        setStatus("signed-in");
      } catch {
        await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
        if (alive) setStatus("signed-out");
      }
    })();
    return () => {
      alive = false;
    };
  }, [doRefresh]);

  const role = (user?.role ?? null) as AdminRole | null;
  const value = useMemo<OperatorContextValue>(
    () => ({
      status,
      user,
      role,
      rank: role ? rankForRole(role) : 0,
      login,
      logout,
      authed,
      accessToken: access.current,
    }),
    // accessVersion bumps the memo so SSE consumers re-open with a rotated token.
    [status, user, role, login, logout, authed, accessVersion],
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator(): OperatorContextValue {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within an OperatorSessionProvider");
  return ctx;
}
