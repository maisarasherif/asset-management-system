function Input({ label, value, onChange, type = "text", placeholder, required, options, onKeyDown }) {
  const base = {
    width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)",
    borderRadius: 3, padding: "7px 10px", color: "var(--text-0)", fontSize: 12,
    fontFamily: "var(--font-mono)", outline: "none", colorScheme: "light dark",
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
          onKeyDown={onKeyDown} style={base} />
      )}
    </div>
  );
}

export default Input;

