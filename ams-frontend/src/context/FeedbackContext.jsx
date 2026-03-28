import { createContext, useCallback, useState } from "react";
import { createPortal } from "react-dom";

export const AppFeedbackContext = createContext({
  notifyError: () => {},
  notifyInfo: () => {},
});

export function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            minWidth: 240,
            maxWidth: 420,
            background: "var(--bg-1)",
            border: "1px solid var(--border-bright)",
            borderLeft: `3px solid ${t.kind === "error" ? "var(--red)" : "var(--amber)"}`,
            borderRadius: 4,
            padding: "10px 12px",
            boxShadow: "0 8px 18px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: t.kind === "error" ? "var(--red)" : "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t.kind}
            </span>
            <button onClick={() => onDismiss(t.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-2)", fontSize: 16, lineHeight: 1 }}>
              ×
            </button>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-0)" }}>{t.message}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function AppFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((kind, message) => {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), 3500);
  }, [dismissToast]);

  const notifyError = useCallback((message) => pushToast("error", message), [pushToast]);
  const notifyInfo = useCallback((message) => pushToast("info", message), [pushToast]);

  return (
    <AppFeedbackContext.Provider value={{ notifyError, notifyInfo }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AppFeedbackContext.Provider>
  );
}

