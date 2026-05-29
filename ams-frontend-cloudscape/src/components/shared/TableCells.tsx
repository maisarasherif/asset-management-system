import type { ReactNode } from "react";

type TableCellTextProps = {
  children: ReactNode;
  title?: string;
};

export function TableCellText({ children, title }: TableCellTextProps) {
  return (
    <div className="app-table-cell-text" title={title}>
      {children}
    </div>
  );
}

export function TableCellActions({ children }: { children: ReactNode }) {
  return <div className="app-table-cell-actions">{children}</div>;
}
