import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import client from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (googleToken: string) => Promise<void>;
  devLogin: (email?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    client
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("access_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (googleToken: string) => {
    const res = await client.post("/auth/google", { token: googleToken });
    localStorage.setItem("access_token", res.data.access_token);
    setUser(res.data.user);
  }, []);

  // Local-dev SSO bypass; backend route is disabled unless CONEXO_DEV_AUTH=true.
  const devLogin = useCallback(async (email?: string) => {
    const res = await client.post("/auth/dev-login", { email: email ?? null });
    localStorage.setItem("access_token", res.data.access_token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
