import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PropsWithChildren,
} from "react";
import { getSession, logoutRequest } from "../lib/api/ams";
import { configureApiClient } from "../lib/api/client";
import { sessionFromLoginResponse } from "./auth-session";
import { AuthContext, type AuthContextValue } from "./auth-context";
import type { AuthSession } from "../types/ams";

const ASSET_STORAGE_KEY = "ams-cloudscape-selected-asset";
const LOGOUT_BROADCAST_KEY = "ams-cloudscape-logout";
const SESSION_EXPIRY_GRACE_MS = 5000;
const GUEST_PATHS = new Set(["/login", "/forgot-password", "/reset-password"]);

function readStoredAsset(): string | null {
	return sessionStorage.getItem(ASSET_STORAGE_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(true);
	const sessionVersion = useRef(0);
	const expiryLogoutInFlight = useRef(false);
	const [selectedAssetId, setSelectedAssetIdState] = useState<string | null>(() =>
		readStoredAsset()
	);

	const clearSession = useCallback(() => {
		sessionVersion.current += 1;
		setSession(null);
		sessionStorage.removeItem(ASSET_STORAGE_KEY);
		setSelectedAssetIdState(null);
	}, []);

	const establishSession = useCallback((nextSession: AuthSession | null) => {
		sessionVersion.current += 1;
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

	const redirectToLogin = useCallback(() => {
		if (!GUEST_PATHS.has(window.location.pathname)) {
			window.location.replace("/login");
		}
	}, []);

	const expireSession = useCallback(() => {
		if (expiryLogoutInFlight.current) {
			return;
		}

		expiryLogoutInFlight.current = true;
		void logoutRequest()
			.catch(() => undefined)
			.finally(() => {
				clearSession();
				localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
				redirectToLogin();
				expiryLogoutInFlight.current = false;
			});
	}, [clearSession, redirectToLogin]);

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
				redirectToLogin();
			},
		});
	}, [logout, redirectToLogin]);

	useEffect(() => {
		if (!session) {
			return;
		}

		const expiresAtMs = Date.parse(session.expiresAt);
		if (!Number.isFinite(expiresAtMs)) {
			const timer = window.setTimeout(expireSession, 0);
			return () => window.clearTimeout(timer);
		}

		const shouldExpireAtMs = expiresAtMs - SESSION_EXPIRY_GRACE_MS;
		const expireIfNeeded = () => {
			if (Date.now() >= shouldExpireAtMs) {
				expireSession();
			}
		};

		const timer = window.setTimeout(
			expireSession,
			Math.max(shouldExpireAtMs - Date.now(), 0)
		);
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				expireIfNeeded();
			}
		};

		window.addEventListener("focus", expireIfNeeded);
		window.addEventListener("pageshow", expireIfNeeded);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("focus", expireIfNeeded);
			window.removeEventListener("pageshow", expireIfNeeded);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [expireSession, session]);

	useEffect(() => {
		let cancelled = false;
		const requestVersion = sessionVersion.current;

		getSession()
			.then((response) => {
				if (!cancelled) {
					establishSession(sessionFromLoginResponse(response));
				}
			})
			.catch(() => {
				if (!cancelled && sessionVersion.current === requestVersion) {
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
				redirectToLogin();
			}
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, [clearSession, redirectToLogin]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      selectedAssetId,
      isAdmin: session?.role === "ADMIN" || session?.role === "SUPER_ADMIN",
      isSuperAdmin: session?.role === "SUPER_ADMIN",
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
