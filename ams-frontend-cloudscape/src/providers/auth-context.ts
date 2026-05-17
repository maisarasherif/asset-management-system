import { createContext, useContext } from "react";
import type { AuthSession } from "../types/ams";

export interface AuthContextValue {
  session: AuthSession | null;
  selectedAssetId: string | null;
  isAdmin: boolean;
  isClient: boolean;
  isAuthenticated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
  setSelectedAssetId: (assetId: string | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
