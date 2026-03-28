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

export default PageHeader;

