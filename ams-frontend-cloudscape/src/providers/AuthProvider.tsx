import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { configureApiClient } from "../lib/api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";
import type { AuthSession } from "../types/ams";

const SESSION_STORAGE_KEY = "ams-cloudscape-session";
const ASSET_STORAGE_KEY = "ams-cloudscape-selected-asset";

function readStoredSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as AuthSession;
    return {
      ...session,
      canManageUserPasswords: Boolean(session.canManageUserPasswords),
      status: session.status || "ACTIVE",
    };
  } catch {
    return null;
  }
}

function readStoredAsset(): string | null {
  return sessionStorage.getItem(ASSET_STORAGE_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [selectedAssetId, setSelectedAssetIdState] = useState<string | null>(() =>
    readStoredAsset()
  );

  const persistSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    if (nextSession) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      return;
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const login = useCallback(
    (nextSession: AuthSession) => {
      persistSession(nextSession);
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    persistSession(null);
    sessionStorage.removeItem(ASSET_STORAGE_KEY);
    setSelectedAssetIdState(null);
  }, [persistSession]);

  const setSelectedAssetId = useCallback((assetId: string | null) => {
    setSelectedAssetIdState(assetId);
    if (assetId) {
      sessionStorage.setItem(ASSET_STORAGE_KEY, assetId);
      return;
    }
    sessionStorage.removeItem(ASSET_STORAGE_KEY);
  }, []);

  useEffect(() => {
    configureApiClient({
      getToken: () => sessionStorage.getItem(SESSION_STORAGE_KEY)
        ? readStoredSession()?.token || null
        : null,
      onUnauthorized: () => {
        logout();
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      },
    });
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      selectedAssetId,
      isAdmin: session?.role === "ADMIN" || session?.role === "SUPER_ADMIN",
      isClient: session?.role === "CLIENT",
      isAuthenticated: Boolean(session),
      login,
      logout,
      setSelectedAssetId,
    }),
    [login, logout, selectedAssetId, session, setSelectedAssetId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
