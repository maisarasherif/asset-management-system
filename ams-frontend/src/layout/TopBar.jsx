import { TOP_NAV_ITEMS } from "../constants";
import { useAuth } from "../hooks/useAuth";

function TopBar({ active, onNav, onPrefetch }) {
  const { user, isAdmin, logout } = useAuth();
  const visible = TOP_NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);
  const initials = `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`.toUpperCase() || "US";

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="https://i.ibb.co/VYBW0brC/logo-default-slim.png" alt="Logo" style={{ height: 46, width: "auto", objectFit: "contain" }} />
        <span className="topbar-brand">Asset Management <em>System</em></span>
      </div>
      <div className="topbar-divider" />
      <nav className="topbar-nav">
        {visible.map(item => (
          <button
            key={item.id}
            className={active === item.id ? "active" : ""}
            onClick={() => onNav(item.id)}
            onMouseEnter={() => onPrefetch?.(item.id)}
            onFocus={() => onPrefetch?.(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="topbar-avatar">{initials}</div>
        <span className="topbar-username">{user?.first_name} {user?.last_name}</span>
        <div className="topbar-divider" />
        <button onClick={logout} style={{
          border: "1px solid rgba(255,240,200,0.18)", background: "transparent",
          color: "rgba(240,232,216,0.6)", fontSize: 11, letterSpacing: "0.08em",
          textTransform: "uppercase", padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.target.style.color = "#f0e8d8"; e.target.style.borderColor = "rgba(255,240,200,0.45)"; }}
        onMouseLeave={e => { e.target.style.color = "rgba(240,232,216,0.6)"; e.target.style.borderColor = "rgba(255,240,200,0.18)"; }}
        >Sign Out</button>
      </div>
    </header>
  );
}

export default TopBar;

