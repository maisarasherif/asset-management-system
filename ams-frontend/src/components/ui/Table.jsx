import { Fragment, memo } from "react";

const wrapperStyle = { overflowX: "auto" };
const tableStyle = {
  width: "100%",
  minWidth: "max(100%, 720px)",
  borderCollapse: "collapse",
  fontSize: 12,
};
const headerRowStyle = { borderBottom: "1px solid var(--border)" };
const headerCellStyle = {
  padding: "8px 12px",
  textAlign: "left",
  color: "var(--text-2)",
  fontWeight: 500,
  letterSpacing: "0.06em",
  fontSize: 10,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const bodyCellStyle = {
  padding: "9px 12px",
  color: "var(--text-0)",
  verticalAlign: "middle",
};
const emptyCellStyle = {
  padding: 32,
  textAlign: "center",
  color: "var(--text-2)",
};
const expandedRowStyle = { borderBottom: "1px solid var(--border)" };
const expandedCellStyle = {
  padding: "10px 12px",
  background: "var(--bg-2)",
};

function Table({
  columns,
  data,
  onRowClick,
  loading,
  emptyMsg = "No records found.",
  rowKey,
  expandedRowKey = null,
  renderExpandedRow = null,
}) {
  if (loading) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <table style={tableStyle}>
        <thead>
          <tr style={headerRowStyle}>
            {columns.map((c) => (
              <th key={c.key} style={{ ...headerCellStyle, ...c.headerStyle }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={emptyCellStyle}>{emptyMsg}</td>
            </tr>
          ) : data.map((row, i) => {
            const key = rowKey?.(row, i) ?? row?.id ?? row?.asset_id ?? row?.component_id ?? row?.certificate_id ?? row?.category_id ?? row?.test_id ?? row?.user_id ?? i;
            const isExpanded = expandedRowKey !== null && key === expandedRowKey;

            return (
              <Fragment key={key}>
                <tr
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    cursor: onRowClick ? "pointer" : "default",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = "var(--bg-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ ...bodyCellStyle, ...c.style }}>
                      {c.render ? c.render(row[c.key], row) : row[c.key] ?? <span style={{ color: "var(--text-2)" }}>-</span>}
                    </td>
                  ))}
                </tr>
                {isExpanded && renderExpandedRow && (
                  <tr style={expandedRowStyle}>
                    <td colSpan={columns.length} style={expandedCellStyle}>
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(Table);
