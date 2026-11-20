import { Button, FormField, Input, Pagination, SpaceBetween, TextFilter } from "@cloudscape-design/components";
import { useEffect, useState, type ReactNode } from "react";
import type { PaginationMeta } from "../../types/ams";
import { Select } from "./OptimizedSelect";
import type { ListControls } from "./useListControls";

interface FilterOption {
  value: string;
  label: string;
}

export interface ListFacet {
  key: string;
  label: string;
  options: readonly FilterOption[];
  clear?: readonly string[];
}

export function ListFilters({
  controls,
  label,
  facets = [],
  children,
}: {
  controls: ListControls;
  label: string;
  facets?: readonly ListFacet[];
  children?: ReactNode;
}) {
  return (
    <SpaceBetween size="s">
      <TextFilter filteringAriaLabel={label} filteringPlaceholder={label} filteringText={controls.text}
        onChange={({ detail }) => controls.onSearch(detail.filteringText.slice(0, 200))} />
      {(facets.length > 0 || children || controls.hasCriteria) && (
        <div className="list-filter-facets">
          {facets.map(({ key, label: title, options, clear = [] }) => {
            const all = { label: "All", value: "" };
            return <FormField key={key} label={title}>
              <Select ariaLabel={title} filteringType="none" options={[all, ...options]}
                selectedOption={options.find(({ value }) => value === controls.filters[key]) ?? all}
                onChange={({ detail }) => controls.setFilters({
                  ...Object.fromEntries(clear.map((field) => [field, ""])),
                  [key]: detail.selectedOption.value ?? "",
                })} />
            </FormField>;
          })}
          {children}
          {controls.hasCriteria && <Button onClick={controls.clear}>Clear filters</Button>}
        </div>
      )}
    </SpaceBetween>
  );
}

export function ListPagination({ controls, meta }: { controls: ListControls; meta?: PaginationMeta }) {
  const { page, setPage } = controls;
  useEffect(() => {
    if (meta?.page === page && page > meta.total_pages) setPage(meta.total_pages, true);
  }, [meta, page, setPage]);
  if (!meta || (meta.total_pages <= 1 && controls.page === 1)) return null;
  return (
    <Pagination currentPageIndex={Math.min(controls.page, meta.total_pages)} pagesCount={meta.total_pages}
      onChange={({ detail }) => controls.setPage(detail.currentPageIndex)} />
  );
}

export function TextFacet({
  label, value, onApply,
}: {
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const apply = () => {
    const next = text.trim();
    if (next !== value) onApply(next);
  };
  return (
    <FormField label={label}>
      <Input ariaLabel={label} value={text} onChange={({ detail }) => setText(detail.value)}
        onBlur={apply} onKeyDown={({ detail }) => { if (detail.key === "Enter") apply(); }} />
    </FormField>
  );
}
