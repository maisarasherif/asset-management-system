import Button from "./Button";

function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-2)" }}>
      <span>Page {meta.page} of {meta.total_pages} · {meta.total} records</span>
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page === 1}>{"<- Prev"}</Button>
        <Button size="sm" onClick={() => onPage(meta.page + 1)} disabled={meta.page === meta.total_pages}>{"Next ->"}</Button>
      </div>
    </div>
  );
}

export default Pagination;

