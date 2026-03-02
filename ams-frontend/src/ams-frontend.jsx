import { Component, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-0: #0a0a0b;
    --bg-1: #111113;
    --bg-2: #18181b;
    --bg-3: #222226;
    --bg-4: #2a2a2f;
    --border: #2e2e34;
    --border-bright: #3e3e46;
    --text-0: #f4f4f5;
    --text-1: #a1a1aa;
    --text-2: #71717a;
    --amber: #f59e0b;
    --amber-dim: #78490a;
    --amber-glow: rgba(245,158,11,0.15);
    --red: #ef4444;
    --red-dim: #7f1d1d;
    --red-glow: rgba(239,68,68,0.15);
    --green: #22c55e;
    --green-dim: #14532d;
    --green-glow: rgba(34,197,94,0.12);
    --blue: #3b82f6;
    --blue-dim: #1e3a5f;
    --radius: 4px;
    --font-display: 'Syne', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }

  html, body, #root { height: 100%; background: var(--bg-0); color: var(--text-0); font-family: var(--font-mono); }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-1); }
  ::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 3px; }

  button { cursor: pointer; font-family: var(--font-mono); }
  input, select, textarea { font-family: var(--font-mono); }

  @keyframes pulse-amber {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
    50% { box-shadow: 0 0 0 6px rgba(245,158,11,0); }
  }
  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .fade-in { animation: fadeIn 0.3s ease both; }
  .slide-in { animation: slideIn 0.25s ease both; }

  .skeleton {
    background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius);
  }
`;

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const AppFeedbackContext = createContext({ notifyError: () => {}, notifyInfo: () => {} });
const ConfirmContext = createContext(async () => false);
const RequestStateContext = createContext({ pending: 0, beginRequest: () => {}, endRequest: () => {} });
const useFeedback = () => useContext(AppFeedbackContext);
const useConfirm = () => useContext(ConfirmContext);
const useRequestState = () => useContext(RequestStateContext);

const API_INFLIGHT_GET = new Map();
const API_CACHE_GET = new Map();

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ams_user") || "null"); } catch { return null; }
  });

  const login = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem("ams_user", JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("ams_user");
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === "ADMIN" }}>{children}</AuthContext.Provider>;
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          minWidth: 240, maxWidth: 420, background: "var(--bg-1)", border: "1px solid var(--border-bright)",
          borderLeft: `3px solid ${t.kind === "error" ? "var(--red)" : "var(--amber)"}`, borderRadius: 4, padding: "10px 12px",
          boxShadow: "0 8px 18px rgba(0,0,0,0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: t.kind === "error" ? "var(--red)" : "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t.kind}
            </span>
            <button onClick={() => onDismiss(t.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-2)", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-0)" }}>{t.message}</div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function TopProgressBar() {
  const { pending } = useRequestState();
  return createPortal(
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      zIndex: 2100,
      opacity: pending > 0 ? 1 : 0,
      transition: "opacity 0.2s ease",
      background: "linear-gradient(90deg, var(--amber) 0%, var(--blue) 50%, var(--amber) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 0.9s linear infinite",
      pointerEvents: "none",
    }} />,
    document.body
  );
}

function AppFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [pending, setPending] = useState(0);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((kind, message) => {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), 3500);
  }, [dismissToast]);

  const notifyError = useCallback((message) => pushToast("error", message), [pushToast]);
  const notifyInfo = useCallback((message) => pushToast("info", message), [pushToast]);
  const beginRequest = useCallback(() => setPending(p => p + 1), []);
  const endRequest = useCallback(() => setPending(p => (p > 0 ? p - 1 : 0)), []);

  const confirm = useCallback((message) => new Promise((resolve) => {
    setConfirmState({ message, resolve });
  }), []);

  const resolveConfirm = useCallback((ok) => {
    setConfirmState(current => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <RequestStateContext.Provider value={{ pending, beginRequest, endRequest }}>
      <AppFeedbackContext.Provider value={{ notifyError, notifyInfo }}>
        <ConfirmContext.Provider value={confirm}>
          {children}
          <TopProgressBar />
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
          {confirmState && (
            <Modal title="Confirm Action" onClose={() => resolveConfirm(false)} width={420}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ color: "var(--text-1)", fontSize: 12 }}>{confirmState.message || "Are you sure?"}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button onClick={() => resolveConfirm(false)}>Cancel</Button>
                  <Button variant="danger" onClick={() => resolveConfirm(true)}>Confirm</Button>
                </div>
              </div>
            </Modal>
          )}
        </ConfirmContext.Provider>
      </AppFeedbackContext.Provider>
    </RequestStateContext.Provider>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--bg-0)" }}>
          <Card style={{ width: 520, maxWidth: "95vw", padding: 24 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 6 }}>Something went wrong</div>
            <div style={{ color: "var(--text-1)", fontSize: 12, marginBottom: 16 }}>
              The app hit an unexpected error. Reload to recover.
            </div>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── API LAYER ────────────────────────────────────────────────────────────────
const BASE = "http://localhost:8080";

function useApi() {
  const { user, logout } = useAuth();
  const { notifyError } = useFeedback();
  const { beginRequest, endRequest } = useRequestState();

  const req = useCallback(async (method, path, body, options = {}) => {
    const cacheTTL = options.cacheTTL ?? 0;
    const headers = { "Content-Type": "application/json" };
    if (user?.token) headers["Authorization"] = `Bearer ${user.token}`;

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
        const res = await fetch(`${BASE}${path}`, {
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

// ─── DESIGN COMPONENTS ───────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    ACTIVE:   { color: "var(--green)", bg: "var(--green-glow)", label: "ACTIVE" },
    INACTIVE: { color: "var(--text-2)", bg: "var(--bg-3)", label: "INACTIVE" },
    MAINTENANCE: { color: "var(--amber)", bg: "var(--amber-glow)", label: "MAINT." },
    VALID:    { color: "var(--green)", bg: "var(--green-glow)", label: "VALID" },
    EXPIRED:  { color: "var(--red)", bg: "var(--red-glow)", label: "EXPIRED", pulse: true },
    EXPIRING_SOON: { color: "var(--amber)", bg: "var(--amber-glow)", label: "⚠ EXPIRING", pulse: true },
    ADMIN: { color: "var(--amber)", bg: "var(--amber-glow)", label: "ADMIN" },
    USER:  { color: "var(--blue)", bg: "rgba(59,130,246,0.12)", label: "USER" },
    YES:   { color: "var(--red)", bg: "var(--red-glow)", label: "CRITICAL" },
    NO:    { color: "var(--text-2)", bg: "var(--bg-3)", label: "STANDARD" },
  }[status] || { color: "var(--text-1)", bg: "var(--bg-3)", label: status };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 2,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      border: `1px solid ${cfg.color}30`,
      animation: cfg.pulse ? `${status === "EXPIRED" ? "pulse-red" : "pulse-amber"} 2s infinite` : "none",
    }}>
      {cfg.pulse && <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />}
      {cfg.label}
    </span>
  );
}

function Btn({ children, variant = "default", size = "md", onClick, disabled, style }) {
  const styles = {
    default: { bg: "var(--bg-3)", color: "var(--text-0)", border: "var(--border)" },
    primary: { bg: "var(--amber)", color: "#000", border: "var(--amber)" },
    danger:  { bg: "transparent", color: "var(--red)", border: "var(--red)" },
    ghost:   { bg: "transparent", color: "var(--text-1)", border: "transparent" },
  }[variant];
  const pad = size === "sm" ? "4px 10px" : size === "lg" ? "10px 20px" : "6px 14px";
  const fs = size === "sm" ? 11 : size === "lg" ? 13 : 12;

  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: pad, fontSize: fs, fontWeight: 500, letterSpacing: "0.04em",
      background: styles.bg, color: styles.color,
      border: `1px solid ${styles.border}`, borderRadius: 3,
      transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
      ...style
    }}
    onMouseEnter={e => { if (!disabled) e.target.style.opacity = "0.8"; }}
    onMouseLeave={e => { if (!disabled) e.target.style.opacity = "1"; }}
    >{children}</button>
  );
}

// Fix the Btn style issue
function Button({ children, variant = "default", size = "md", onClick, disabled, style }) {
  const styles = {
    default: { background: "var(--bg-3)", color: "var(--text-0)", borderColor: "var(--border)" },
    primary: { background: "var(--amber)", color: "#000", borderColor: "var(--amber)" },
    danger:  { background: "transparent", color: "var(--red)", borderColor: "var(--red)" },
    ghost:   { background: "transparent", color: "var(--text-1)", borderColor: "transparent" },
  }[variant];
  const pad = size === "sm" ? "4px 10px" : size === "lg" ? "10px 22px" : "6px 14px";
  const fs = size === "sm" ? 11 : size === "lg" ? 13 : 12;

  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: pad, fontSize: fs, fontWeight: 500, letterSpacing: "0.05em",
      ...styles, border: `1px solid ${styles.borderColor}`,
      borderRadius: 3, transition: "all 0.15s", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, fontFamily: "var(--font-mono)", textTransform: "uppercase", ...style
    }}>{children}</button>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required, options }) {
  const base = {
    width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)",
    borderRadius: 3, padding: "7px 10px", color: "var(--text-0)", fontSize: 12,
    fontFamily: "var(--font-mono)", outline: "none",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}{required && " *"}</label>}
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...base }}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          style={{ ...base, resize: "vertical" }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={base} />
      )}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4, ...style }}>{children}</div>;
}

function Modal({ title, onClose, children, width = 540 }) {
  const modalNode = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.78)",
    }}>
      <div style={{
        position: "absolute", inset: 0, overflowY: "auto",
        display: "flex", justifyContent: "center", padding: "40px 16px",
      }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="fade-in" onClick={e => e.stopPropagation()} style={{
          width, maxWidth: "95vw", alignSelf: "flex-start",
          background: "var(--bg-1)", border: "1px solid var(--border-bright)",
          borderRadius: 4,
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>{title}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
          <div style={{ padding: 20 }}>{children}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}

function Table({ columns, data, onRowClick, loading, emptyMsg = "No records found.", rowKey }) {
  if (loading) return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.06em", fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>{emptyMsg}</td></tr>
          ) : data.map((row, i) => (
            <tr key={rowKey?.(row, i) ?? row?.id ?? row?.asset_id ?? row?.component_id ?? row?.certificate_id ?? row?.category_id ?? row?.test_id ?? row?.user_id ?? i} onClick={() => onRowClick?.(row)} style={{
              borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : "default",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if(onRowClick) e.currentTarget.style.background = "var(--bg-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = ""; }}
            >
              {columns.map(c => (
                <td key={c.key} style={{ padding: "9px 12px", color: "var(--text-0)", ...c.style }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? <span style={{ color: "var(--text-2)" }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-2)" }}>
      <span>Page {meta.page} of {meta.total_pages} · {meta.total} records</span>
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page === 1}>← Prev</Button>
        <Button size="sm" onClick={() => onPage(meta.page + 1)} disabled={meta.page === meta.total_pages}>Next →</Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: accent || "var(--text-0)", lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: "var(--text-2)" }}>{sub}</span>}
    </Card>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage() {
  const api = useApi();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try {
      const data = await api.post("/login", { email, password }, { handle401: false, silentError: true });
      login(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-0)",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.04) 0%, transparent 50%)",
    }}>
      <div className="fade-in" style={{ width: 380 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
            <span style={{ color: "var(--amber)" }}>AMS</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.15em", textTransform: "uppercase" }}>Asset Management System</div>
        </div>

        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="ops@company.com" required />
            <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required />
            {error && <div style={{ padding: "8px 12px", background: "var(--red-glow)", border: "1px solid var(--red)30", borderRadius: 3, color: "var(--red)", fontSize: 11 }}>{error}</div>}
            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={loading || !email || !password} style={{ width: "100%", marginTop: 4 }}>
              {loading ? "Authenticating..." : "Sign In →"}
            </Button>
          </div>
        </Card>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: "var(--text-2)", letterSpacing: "0.06em" }}>
          SECURE ACCESS · ROLE-BASED PERMISSIONS
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "assets", label: "Assets", icon: "◻" },
  { id: "components", label: "Components", icon: "◈" },
  { id: "certificates", label: "Certificates", icon: "▣" },
  { id: "categories", label: "Categories", icon: "◫" },
  { id: "test-types", label: "Test Types", icon: "◎" },
  { id: "users", label: "Users", icon: "◉", adminOnly: true },
];

function Sidebar({ active, onNav }) {
  const { user, logout, isAdmin } = useAuth();
  return (
    <aside style={{
      width: 220, background: "var(--bg-1)", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
    }}>
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
          <span style={{ color: "var(--amber)" }}>AMS</span>
          <span style={{ color: "var(--text-2)", fontSize: 10, fontWeight: 400, marginLeft: 8, letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>v1</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {NAV_ITEMS.filter(n => !n.adminOnly || isAdmin).map(item => (
          <button key={item.id} onClick={() => onNav(item.id)} style={{
            width: "100%", padding: "9px 18px", display: "flex", alignItems: "center", gap: 10,
            background: active === item.id ? "var(--bg-3)" : "transparent",
            color: active === item.id ? "var(--text-0)" : "var(--text-2)",
            border: "none", borderLeft: `2px solid ${active === item.id ? "var(--amber)" : "transparent"}`,
            fontSize: 12, letterSpacing: "0.03em", transition: "all 0.15s", textAlign: "left", cursor: "pointer",
          }}>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--text-1)", marginBottom: 4, fontWeight: 500 }}>{user?.first_name} {user?.last_name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <StatusBadge status={user?.role} />
          <button onClick={logout} style={{ fontSize: 10, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.06em" }}>SIGN OUT</button>
        </div>
      </div>
    </aside>
  );
}

// ─── PAGE HEADER ──────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 3 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: "0.04em" }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard() {
  const api = useApi();
  const [stats, setStats] = useState({ assets: 0, components: 0, certificates: 0 });
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    Promise.all([
      api.get("/assets?limit=1", { signal }),
      api.get("/components?limit=1", { signal }),
      api.get("/certificates?limit=1", { signal }),
      api.get("/expiring-certificates", { signal }),
    ]).then(([a, c, cert, exp]) => {
      if (signal?.aborted) return;
      setStats({ assets: a?.meta?.total || 0, components: c?.meta?.total || 0, certificates: cert?.meta?.total || 0 });
      setExpiring(exp || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const expired = expiring.filter(c => c.status === "EXPIRED").length;
  const expiringSoon = expiring.filter(c => c.status === "EXPIRING_SOON").length;

  return (
    <div className="fade-in">
      <PageHeader title="Operations Dashboard" subtitle="Real-time asset & compliance overview" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total Assets" value={loading ? "—" : stats.assets} />
        <StatCard label="Components" value={loading ? "—" : stats.components} />
        <StatCard label="Certificates" value={loading ? "—" : stats.certificates} />
        <StatCard label="Expiring Soon" value={loading ? "—" : expiringSoon} accent="var(--amber)" sub="within 30 days" />
        <StatCard label="Expired" value={loading ? "—" : expired} accent="var(--red)" sub="require immediate action" />
      </div>

      {expiring.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--amber)", fontSize: 14 }}>⚠</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>Certificate Alerts</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-2)" }}>{expiring.length} REQUIRING ATTENTION</span>
          </div>
          <Table
            columns={[
              { key: "certificate_name", label: "Certificate" },
              { key: "component_name", label: "Component" },
              { key: "asset_name", label: "Asset" },
              { key: "expiry_date", label: "Expires", render: v => <span style={{ color: "var(--amber)", fontWeight: 600 }}>{formatDate(v)}</span> },
              { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            ]}
            data={expiring}
            loading={loading}
          />
        </Card>
      )}

      {expiring.length === 0 && !loading && (
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ color: "var(--green)", fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>All Certificates Valid</div>
          <div style={{ fontSize: 11, color: "var(--text-2)" }}>No certificates expiring within the next 30 days.</div>
        </Card>
      )}
    </div>
  );
}

// ─── ASSETS PAGE ──────────────────────────────────────────────────────────────
function AssetForm({ initial, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || { name: "", description: "", status: "ACTIVE", location: "", assigned_project: "", photo: "", datasheet: "" });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label="Name" value={form.name} onChange={f("name")} required />
      <Input label="Status" value={form.status} onChange={f("status")} options={[{value:"ACTIVE",label:"Active"},{value:"INACTIVE",label:"Inactive"},{value:"MAINTENANCE",label:"Maintenance"}]} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Location" value={form.location} onChange={f("location")} />
        <Input label="Assigned Project" value={form.assigned_project} onChange={f("assigned_project")} />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Photo URL" value={form.photo} onChange={f("photo")} />
        <Input label="Datasheet URL" value={form.datasheet} onChange={f("datasheet")} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Asset"}
        </Button>
      </div>
    </div>
  );
}

function AssetsPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/assets?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addasset", form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updateasset/${selected.asset_id}`, form);
      setModal(null);
      setSelected(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this asset?"))) return;
    await api.del(`/deleteasset/${id}`); load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle={`${meta?.total || 0} registered assets`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Asset</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "asset_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{v}</span> },
            { key: "name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            { key: "location", label: "Location" },
            { key: "assigned_project", label: "Project" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "asset_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>

      {modal === "create" && <Modal title="New Asset" onClose={() => setModal(null)}>
        <AssetForm onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Asset" onClose={() => { setModal(null); setSelected(null); }}>
        <AssetForm initial={selected} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

// ─── COMPONENTS PAGE ─────────────────────────────────────────────────────────
function ComponentForm({ initial, assets, categories, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || { asset_id: "", category_id: "", name: "", serial_number: "", manufacturer: "", description: "", equipment_type: "", structure: "", model: "", class: "", class_code: "", safety_critical: "NO" });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Asset" value={form.asset_id} onChange={f("asset_id")} options={assets.map(a => ({ value: a.asset_id, label: a.name }))} required />
        <Input label="Category" value={form.category_id} onChange={f("category_id")} options={categories.map(c => ({ value: c.category_id, label: c.category_name }))} required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Name" value={form.name} onChange={f("name")} required />
        <Input label="Serial Number" value={form.serial_number} onChange={f("serial_number")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Manufacturer" value={form.manufacturer} onChange={f("manufacturer")} />
        <Input label="Model" value={form.model} onChange={f("model")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Equipment Type" value={form.equipment_type} onChange={f("equipment_type")} />
        <Input label="Structure" value={form.structure} onChange={f("structure")} />
        <Input label="Class" value={form.class} onChange={f("class")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Class Code" value={form.class_code} onChange={f("class_code")} />
        <Input label="Safety Critical" value={form.safety_critical} onChange={f("safety_critical")} options={[{value:"YES",label:"Yes — Safety Critical"},{value:"NO",label:"No — Standard"}]} required />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Component"}
        </Button>
      </div>
    </div>
  );
}

function ComponentsPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/components?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get("/assets?limit=100", { signal: controller.signal }),
      api.get("/categories?limit=100", { signal: controller.signal }),
    ]).then(([assetsRes, categoriesRes]) => {
      if (controller.signal.aborted) return;
      setAssets(assetsRes?.data || []);
      setCategories(categoriesRes?.data || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addcomponent", form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updatecomponent/${selected.component_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this component?"))) return;
    await api.del(`/deletecomponent/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Components" subtitle={`${meta?.total || 0} components across all assets`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Component</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "component_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v}</span> },
            { key: "name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "asset_id", label: "Asset" },
            { key: "manufacturer", label: "Manufacturer" },
            { key: "model", label: "Model" },
            { key: "safety_critical", label: "Safety", render: v => <StatusBadge status={v} /> },
            isAdmin ? { key: "component_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal === "create" && <Modal title="New Component" onClose={() => setModal(null)} width={640}>
        <ComponentForm assets={assets} categories={categories} onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Component" onClose={() => { setModal(null); setSelected(null); }} width={640}>
        <ComponentForm initial={selected} assets={assets} categories={categories} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

// ─── CERTIFICATES PAGE ────────────────────────────────────────────────────────
function CertificateForm({ initial, components, testTypes, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || {
    component_id: "", certificate_name: "", issue_date: "", expiry_date: "",
    issuing_authority: "", test_id: "", imca_ref: "", imca_d018: "", maintenance_notes: ""
  });
  const componentOptions = useMemo(
    () => components.map(c => ({ value: c.component_id, label: c.name })),
    [components]
  );
  const testTypeOptions = useMemo(
    () => testTypes.map(t => ({ value: t.test_id, label: t.test_name })),
    [testTypes]
  );
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Component" value={form.component_id} onChange={f("component_id")} options={componentOptions} required />
        <Input label="Test Type" value={form.test_id} onChange={f("test_id")} options={testTypeOptions} required />
      </div>
      <Input label="Certificate Name" value={form.certificate_name} onChange={f("certificate_name")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Issue Date" type="date" value={form.issue_date} onChange={f("issue_date")} required />
        <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={f("expiry_date")} required />
      </div>
      <Input label="Issuing Authority" value={form.issuing_authority} onChange={f("issuing_authority")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="IMCA Ref" value={form.imca_ref} onChange={f("imca_ref")} />
        <Input label="IMCA D018" value={form.imca_d018} onChange={f("imca_d018")} />
      </div>
      <Input label="Maintenance Notes" type="textarea" value={form.maintenance_notes} onChange={f("maintenance_notes")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Certificate"}
        </Button>
      </div>
    </div>
  );
}

function CertificatesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [components, setComponents] = useState([]);
  const [testTypes, setTestTypes] = useState([]);

  const deriveStatusFromExpiry = useCallback((expiryDateValue) => {
    if (!expiryDateValue) return "VALID";
    const parsed = new Date(expiryDateValue);
    if (Number.isNaN(parsed.getTime())) return "VALID";
    const days = Math.floor((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "EXPIRED";
    if (days <= 30) return "EXPIRING_SOON";
    return "VALID";
  }, []);

  const load = useCallback(async (p = 1, opts = { silent: false, signal: null }) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get(`/certificates?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally {
      if (!opts.signal?.aborted) {
        if (opts.silent) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get("/components?limit=200", { signal: controller.signal }),
      api.get("/test-types", { signal: controller.signal }),
    ]).then(([componentsRes, testTypesRes]) => {
      if (controller.signal.aborted) return;
      setComponents(componentsRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setActionError("");
    setSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      certificate_id: tempId,
      component_id: form.component_id,
      certificate_name: form.certificate_name,
      issuing_authority: form.issuing_authority,
      expiry_date: new Date(form.expiry_date).toISOString(),
      status: deriveStatusFromExpiry(form.expiry_date),
    };

    // Close immediately so the action feels responsive.
    setModal(null);
    setData(prev => [optimistic, ...prev.filter(r => r.certificate_id !== tempId)].slice(0, 20));
    setMeta(prev => prev
      ? { ...prev, total: (prev.total || 0) + 1 }
      : { page, total_pages: 1, total: 1 }
    );

    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      const created = await api.post("/addcertificate", payload);
      setData(prev => [created, ...prev.filter(r => r.certificate_id !== tempId && r.certificate_id !== created?.certificate_id)].slice(0, 20));
    } catch (e) {
      setData(prev => prev.filter(r => r.certificate_id !== tempId));
      setMeta(prev => prev ? { ...prev, total: Math.max(0, (prev.total || 1) - 1) } : prev);
      setActionError(e?.message || "Failed to add certificate.");
    } finally {
      setSubmitting(false);
      load(page, { silent: true });
    }
  };
  const handleUpdate = async (form) => {
    setActionError("");
    setSubmitting(true);
    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      await api.put(`/updatecertificate/${selected.certificate_id}`, payload);
      setModal(null);
      load(page, { silent: true });
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    setActionError("");
    if (!(await confirmAction("Delete this certificate?"))) return;
    try {
      await api.del(`/deletecertificate/${id}`);
      load(page, { silent: true });
    } catch (e) {
      setActionError(e?.message || "Failed to delete certificate.");
    }
  };

  return (
    <div className="fade-in">
      <PageHeader title="Certificates" subtitle={`${meta?.total || 0} compliance certificates`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Certificate</Button>} />
      {actionError && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--red)" }}>{actionError}</div>}
      {refreshing && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--text-2)" }}>Refreshing list...</div>}
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "certificate_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v}</span> },
            { key: "certificate_name", label: "Certificate", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "component_id", label: "Component" },
            { key: "issuing_authority", label: "Authority" },
            { key: "expiry_date", label: "Expiry", render: v => <span style={{ fontFamily: "var(--font-mono)" }}>{formatDate(v)}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            isAdmin ? { key: "certificate_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal === "create" && <Modal title="New Certificate" onClose={() => setModal(null)} width={600}>
        <CertificateForm components={components} testTypes={testTypes} onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Certificate" onClose={() => { setModal(null); setSelected(null); }} width={600}>
        <CertificateForm initial={{ ...selected, issue_date: selected.issue_date?.slice(0,10), expiry_date: selected.expiry_date?.slice(0,10) }} components={components} testTypes={testTypes} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

// ─── CATEGORIES PAGE ──────────────────────────────────────────────────────────
function CategoriesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ category_name: "", description: "" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/categories?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const openCreate = () => { setForm({ category_name: "", description: "" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ category_name: row.category_name, description: row.description }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addcategory", form);
      else await api.put(`/updatecategory/${selected.category_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this category?"))) return;
    await api.del(`/deletecategory/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Categories" subtitle="Component classification taxonomy"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Category</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "category_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "category_name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "description", label: "Description" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "category_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "New Category" : "Edit Category"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Category Name" value={form.category_name} onChange={v => setForm(p => ({ ...p, category_name: v }))} required />
          <Input label="Description" type="textarea" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// ─── TEST TYPES PAGE ──────────────────────────────────────────────────────────
function TestTypesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ test_id: "", test_name: "", validity_duration: "", description: "" });

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/test-types", { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res?.data || res || []);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const openCreate = () => { setForm({ test_id: "", test_name: "", validity_duration: "", description: "" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ test_id: row.test_id, test_name: row.test_name, validity_duration: row.validity_duration, description: row.description }); setModal("edit"); };
  const handleSave = async () => {
    const payload = { ...form, validity_duration: parseInt(form.validity_duration) };
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addtesttype", payload);
      else await api.put(`/updatetesttype/${selected.test_id}`, payload);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this test type?"))) return;
    await api.del(`/deletetesttype/${id}`);
    load();
  };

  return (
    <div className="fade-in">
      <PageHeader title="Test Types" subtitle="Certificate test type definitions"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Test Type</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "test_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v}</span> },
            { key: "test_name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "validity_duration", label: "Validity (days)", render: v => <span style={{ color: "var(--amber)" }}>{v}d</span> },
            { key: "description", label: "Description" },
            isAdmin ? { key: "test_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
      </Card>
      {modal && <Modal title={modal === "create" ? "New Test Type" : "Edit Test Type"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {modal === "create" && <Input label="Test ID" value={form.test_id} onChange={v => setForm(p => ({ ...p, test_id: v }))} required />}
          <Input label="Test Name" value={form.test_name} onChange={v => setForm(p => ({ ...p, test_name: v }))} required />
          <Input label="Validity Duration (days)" type="number" value={String(form.validity_duration)} onChange={v => setForm(p => ({ ...p, validity_duration: v }))} required />
          <Input label="Description" type="textarea" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// ─── USERS PAGE ───────────────────────────────────────────────────────────────
function UsersPage() {
  const api = useApi();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "USER" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/users?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const openCreate = () => { setForm({ first_name: "", last_name: "", email: "", password: "", role: "USER" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ first_name: row.first_name, last_name: row.last_name, email: row.email, role: row.role }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/register", form);
      else await api.put(`/updateuser/${selected.user_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this user?"))) return;
    await api.del(`/deleteuser/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Users" subtitle={`${meta?.total || 0} system users`}
        action={<Button variant="primary" onClick={openCreate}>+ Register User</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "user_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "first_name", label: "First Name" },
            { key: "last_name", label: "Last Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", render: v => <StatusBadge status={v} /> },
            { key: "created_at", label: "Joined", render: v => formatDate(v) },
            { key: "user_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )}
          ]}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "Register User" : "Edit User"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="First Name" value={form.first_name} onChange={v => setForm(p => ({ ...p, first_name: v }))} required />
            <Input label="Last Name" value={form.last_name} onChange={v => setForm(p => ({ ...p, last_name: v }))} required />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
          {modal === "create" && <Input label="Password" type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} required />}
          <Input label="Role" value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={[{value:"ADMIN",label:"Admin"},{value:"USER",label:"User"}]} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : (modal === "create" ? "Register" : "Save")}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
function AppShell() {
  const [page, setPage] = useState("dashboard");
  const pages = {
    dashboard: <Dashboard />,
    assets: <AssetsPage />,
    components: <ComponentsPage />,
    certificates: <CertificatesPage />,
    categories: <CategoriesPage />,
    "test-types": <TestTypesPage />,
    users: <UsersPage />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar active={page} onNav={setPage} />
      <main style={{ marginLeft: 220, flex: 1, padding: "28px 32px", minHeight: "100vh", background: "var(--bg-0)" }}>
        {pages[page] || <Dashboard />}
      </main>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppFeedbackProvider>
        <style>{CSS}</style>
        <Inner />
      </AppFeedbackProvider>
    </AuthProvider>
  );
}

function Inner() {
  const { user } = useAuth();
  return user ? <AppErrorBoundary><AppShell /></AppErrorBoundary> : <LoginPage />;
}
