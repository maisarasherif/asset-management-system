import { createContext, useContext } from "react";
import type { AuthSession, ProductAccess, ProductKey, ProductRole } from "../types/ams";

export interface AuthContextValue {
  session: AuthSession | null;
  products: ProductAccess[];
	selectedAssetId: string | null;
	isAdmin: boolean;
	isSuperAdmin: boolean;
	isClient: boolean;
	isAuthenticated: boolean;
	isSessionLoading: boolean;
  isProductAccessLoading: boolean;
  getProductRole: (productKey: ProductKey) => ProductRole | null;
  hasProductAccess: (productKey: ProductKey, roles?: ProductRole[]) => boolean;
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
