import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type PropsWithChildren,
} from "react";
import { getSession } from "../lib/api/ams";
import { configureApiClient } from "../lib/api/client";
import { sessionFromLoginResponse } from "./auth-session";
import { AuthContext, type AuthContextValue } from "./auth-context";
import type { AuthSession } from "../types/ams";

const ASSET_STORAGE_KEY = "ams-cloudscape-selected-asset";
const LOGOUT_BROADCAST_KEY = "ams-cloudscape-logout";

function readStoredAsset(): string | null {
	return sessionStorage.getItem(ASSET_STORAGE_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(true);
	const [selectedAssetId, setSelectedAssetIdState] = useState<string | null>(() =>
		readStoredAsset()
	);

	const clearSession = useCallback(() => {
		setSession(null);
		sessionStorage.removeItem(ASSET_STORAGE_KEY);
		setSelectedAssetIdState(null);
	}, []);

	const establishSession = useCallback((nextSession: AuthSession | null) => {
		setSession(nextSession);
	}, []);

	const login = useCallback(
		(nextSession: AuthSession) => {
			establishSession(nextSession);
		},
		[establishSession]
	);

	const logout = useCallback(() => {
		clearSession();
		localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
	}, [clearSession]);

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
			onUnauthorized: () => {
				logout();
				if (window.location.pathname !== "/login") {
					window.location.replace("/login");
				}
			},
		});
	}, [logout]);

	useEffect(() => {
		let cancelled = false;

		getSession()
			.then((response) => {
				if (!cancelled) {
					establishSession(sessionFromLoginResponse(response));
				}
			})
			.catch(() => {
				if (!cancelled) {
					clearSession();
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsSessionLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [clearSession, establishSession]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key === LOGOUT_BROADCAST_KEY) {
				clearSession();
				if (window.location.pathname !== "/login") {
					window.location.replace("/login");
				}
			}
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      selectedAssetId,
      isAdmin: session?.role === "ADMIN" || session?.role === "SUPER_ADMIN",
			isClient: session?.role === "CLIENT",
			isAuthenticated: Boolean(session),
			isSessionLoading,
			login,
			logout,
			setSelectedAssetId,
		}),
		[isSessionLoading, login, logout, selectedAssetId, session, setSelectedAssetId]
	);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
