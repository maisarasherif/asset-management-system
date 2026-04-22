function Button({ children, variant = "default", size = "md", onClick, disabled, style }) {
  const styles = {
    default: { background: "var(--bg-3)", color: "var(--text-0)", borderColor: "var(--border)" },
    primary: { background: "var(--primary)", color: "var(--primary-text)", borderColor: "var(--primary)" },
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
      opacity: disabled ? 0.5 : 1, fontFamily: "var(--font-mono)", textTransform: "uppercase",
      whiteSpace: "nowrap", flexShrink: 0, ...style
    }}>{children}</button>
  );
}

export default Button;

