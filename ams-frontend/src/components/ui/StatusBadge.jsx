function StatusBadge({ status }) {
  const cfg = {
    ACTIVE:   { color: "var(--green)", bg: "var(--green-glow)", label: "ACTIVE" },
    INACTIVE: { color: "var(--text-2)", bg: "var(--bg-3)", label: "INACTIVE" },
    MAINTENANCE: { color: "var(--amber)", bg: "var(--amber-glow)", label: "MAINT." },
    VALID:    { color: "var(--green)", bg: "var(--green-glow)", label: "VALID" },
    EXPIRED:  { color: "var(--red)", bg: "var(--red-glow)", label: "EXPIRED", pulse: true },
    EXPIRING_SOON: { color: "var(--amber)", bg: "var(--amber-glow)", label: "! EXPIRING", pulse: true },
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

export default StatusBadge;

