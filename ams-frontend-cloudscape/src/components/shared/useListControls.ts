import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export function useDebouncedSearch(text: string) {
  const [search, setSearch] = useState(text.trim());
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(text.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [text]);
  return text.trim() ? search : "";
}

export function useListControls(scope: string, fields: readonly string[], limit = 20) {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const search = useDebouncedSearch(text);
  const prefix = scope ? `${scope}.` : "";
  const pageKey = `${prefix}page`;
  const candidate = Number(params.get(pageKey));
  const page = Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
  const filters = Object.fromEntries(fields.map((field) => [field, params.get(prefix + field) || ""]));

  function setPage(nextPage: number, replace = false) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage === 1) next.delete(pageKey);
      else next.set(pageKey, String(nextPage));
      return next;
    }, { replace, preventScrollReset: true });
  }

  function onSearch(value: string) {
    setText(value);
    if (page > 1) setPage(1, true);
  }

  function setFilters(changes: Record<string, string>) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [field, value] of Object.entries(changes)) {
        if (value) next.set(prefix + field, value);
        else next.delete(prefix + field);
      }
      next.delete(pageKey);
      return next;
    }, { preventScrollReset: true });
  }

  function clear() {
    setText("");
    setFilters(Object.fromEntries(fields.map((field) => [field, ""])));
  }

  return {
    text, onSearch, filters, setFilters, clear, page, setPage,
    hasCriteria: Boolean(text.trim() || Object.values(filters).some(Boolean)),
    query: { page, limit, search, ...filters },
  };
}

export type ListControls = ReturnType<typeof useListControls>;
