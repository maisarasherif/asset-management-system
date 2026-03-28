import { useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";

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
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="ops@company.com" required onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            {error && <div style={{ padding: "8px 12px", background: "var(--red-glow)", border: "1px solid var(--red)30", borderRadius: 3, color: "var(--red)", fontSize: 11 }}>{error}</div>}
            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={loading || !email || !password} style={{ width: "100%", marginTop: 4 }}>
              {loading ? "Authenticating..." : "Sign In ->"}
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

export default LoginPage;

