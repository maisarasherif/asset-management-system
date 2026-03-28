import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

function CertDonut({ certs, loading }) {

  const valid    = certs.filter(c => c.status === "VALID").length;
  const expiring = certs.filter(c => c.status === "EXPIRING_SOON").length;
  const expired  = certs.filter(c => c.status === "EXPIRED").length;
  const total    = valid + expiring + expired;

  const data = [
    { name: "Valid",    value: valid,    color: "#15803d" },
    { name: "Expiring", value: expiring, color: "#b45309" },
    { name: "Expired",  value: expired,  color: "#b91c1c" },
  ].filter(d => d.value > 0);

  if (loading) return (
    <div style={{ height: 220, display: "grid", placeItems: "center" }}>
      <div className="skeleton" style={{ width: 160, height: 160, borderRadius: "50%" }} />
    </div>
  );

  if (total === 0) return (
    <div style={{ height: 220, display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--green)", fontSize: 32, marginBottom: 6 }}>OK</div>
        <div style={{ fontSize: 11, color: "var(--text-2)" }}>No certificates</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={64} outerRadius={88}
            paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0];
            return (
              <div style={{ background: "#1c190f", border: "1px solid rgba(255,240,200,0.14)", borderRadius: 3, padding: "7px 11px", fontSize: 11, fontFamily: "var(--font-mono)", color: "#f0e8d8", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
                <span style={{ color: d.payload.color, marginRight: 6 }}>o</span>
                {d.name}: <strong>{d.value}</strong>
              </div>
            );
          }} />
          <Legend iconType="circle" iconSize={7}
            formatter={(value) => <span style={{ fontSize: 10, color: "var(--ink-mid)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -74%)", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, lineHeight: 1, color: "var(--ink)" }}>{total}</div>
        <div style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>certs</div>
      </div>
    </div>
  );
}

export default CertDonut;

