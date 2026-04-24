function Card({ children, className, style }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default Card;
