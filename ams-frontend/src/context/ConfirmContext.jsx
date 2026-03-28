import { createContext, useCallback, useState } from "react";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

export const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);

  const confirm = useCallback((message) => new Promise((resolve) => {
    setConfirmState({ message, resolve });
  }), []);

  const resolveConfirm = useCallback((ok) => {
    setConfirmState((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
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
  );
}

