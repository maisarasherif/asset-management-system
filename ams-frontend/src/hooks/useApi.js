import { useCallback, useMemo } from "react";
import { BASE_URL } from "../constants";
import { useRequestState } from "../context/RequestStateContext";
import { API_CACHE_GET, API_INFLIGHT_GET } from "../lib/apiCache";
import { useAuth } from "./useAuth";
import { useFeedback } from "./useFeedback";

export function useApi() {
  const { user, logout } = useAuth();
  const { notifyError } = useFeedback();
  const { beginRequest, endRequest } = useRequestState();

  const req = useCallback(async (method, path, body, options = {}) => {
    const cacheTTL = options.cacheTTL ?? 0;
    const headers = { "Content-Type": "application/json" };
    if (user?.token) headers.Authorization = `Bearer ${user.token}`;

    const cacheKey = method === "GET" ? `${path}::${user?.token || ""}` : null;
    if (method === "GET" && cacheTTL > 0) {
      const cached = API_CACHE_GET.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.data;
      API_CACHE_GET.delete(cacheKey);
    }
    if (method === "GET" && API_INFLIGHT_GET.has(cacheKey)) {
      return API_INFLIGHT_GET.get(cacheKey);
    }

    const run = async () => {
      if (options.trackLoading !== false) beginRequest();
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: options.signal,
        });

        if (res.status === 401 && options.handle401 !== false) {
          logout();
          throw new Error("Session expired. Please log in again.");
        }

        let data = null;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else if (res.status !== 204) {
          const text = await res.text();
          data = text ? { message: text } : null;
        }

        if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);

        if (method === "GET" && cacheTTL > 0) {
          API_CACHE_GET.set(cacheKey, { data, expiresAt: Date.now() + cacheTTL });
        } else if (method !== "GET") {
          API_CACHE_GET.clear();
        }

        return data;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        if (!options.silentError) notifyError(error?.message || "Request failed");
        throw error;
      } finally {
        if (options.trackLoading !== false) endRequest();
      }
    };

    if (method === "GET") {
      const promise = run().finally(() => {
        API_INFLIGHT_GET.delete(cacheKey);
      });
      API_INFLIGHT_GET.set(cacheKey, promise);
      return promise;
    }

    try {
      return await run();
    } finally {
      if (method === "GET") API_INFLIGHT_GET.delete(cacheKey);
    }
  }, [user, logout, notifyError, beginRequest, endRequest]);

  return useMemo(() => ({
    get: (p, opts) => req("GET", p, undefined, opts),
    post: (p, b, opts) => req("POST", p, b, opts),
    put: (p, b, opts) => req("PUT", p, b, opts),
    patch: (p, b, opts) => req("PATCH", p, b, opts),
    del: (p, opts) => req("DELETE", p, undefined, opts),
  }), [req]);
}

