import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";

export const RequestStateContext = createContext({
  pending: 0,
  beginRequest: () => {},
  endRequest: () => {},
});

export function useRequestState() {
  return useContext(RequestStateContext);
}

export function TopProgressBar() {
  const { pending } = useRequestState();

  return createPortal(
    <div
      style={{
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
      }}
    />,
    document.body,
  );
}

export function RequestStateProvider({ children }) {
  const [pending, setPending] = useState(0);
  const beginRequest = useCallback(() => setPending((p) => p + 1), []);
  const endRequest = useCallback(() => setPending((p) => (p > 0 ? p - 1 : 0)), []);

  return (
    <RequestStateContext.Provider value={{ pending, beginRequest, endRequest }}>
      {children}
      <TopProgressBar />
    </RequestStateContext.Provider>
  );
}

