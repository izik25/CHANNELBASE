"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "./api-client";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  creditBalance: number;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{ accessToken: string; user: CurrentUser }>("/auth/login", { email, password });
      setToken(result.accessToken);
      await refresh();
    },
    [refresh],
  );

  const register = React.useCallback(
    async (email: string, password: string, name?: string) => {
      const result = await api.post<{ accessToken: string; user: CurrentUser }>("/auth/register", { email, password, name });
      setToken(result.accessToken);
      await refresh();
    },
    [refresh],
  );

  const logout = React.useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();
  React.useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  return { user, loading };
}
