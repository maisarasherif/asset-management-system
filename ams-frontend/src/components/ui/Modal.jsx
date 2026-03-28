import { createPortal } from "react-dom";

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

export default Modal;

