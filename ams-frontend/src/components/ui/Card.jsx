function Card({ children, style }) {
  return <div style={{ background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4, boxShadow: "var(--shadow-sm)", ...style }}>{children}</div>;
}

export default Card;

