import type { MultiselectProps, SelectProps } from "@cloudscape-design/components";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { PaginatedResponse } from "../../types/ams";
import { Multiselect, Select } from "./OptimizedSelect";
import { useDebouncedSearch } from "./useListControls";

interface PagedSelectProps<T> {
  label: string;
  queryKey: readonly unknown[];
  load: (page: number, search: string) => Promise<PaginatedResponse<T>>;
  getOption: (item: T) => SelectProps.Option;
  selected: SelectProps.Option | null;
  onSelect: (option: SelectProps.Option | null, item: T | undefined) => void;
  allLabel?: string;
  disabled?: boolean;
  placeholder?: string;
}

function usePagedOptions<T>(queryKey: readonly unknown[], load: PagedSelectProps<T>["load"]) {
  const [opened, setOpened] = useState(false);
  const [text, setText] = useState("");
  const search = useDebouncedSearch(text);
  const results = useInfiniteQuery({
    queryKey: [...queryKey, search],
    initialPageParam: 1,
    enabled: opened,
    queryFn: ({ pageParam }) => load(pageParam, search),
    getNextPageParam: ({ meta }) => meta.page < meta.total_pages ? meta.page + 1 : undefined,
  });
  const items = results.data?.pages.flatMap(({ data }) => data) ?? [];
  const onLoadItems: NonNullable<SelectProps["onLoadItems"]> = ({ detail }) => {
    setOpened(true);
    if (detail.samePage) {
      if (results.isFetchNextPageError) void results.fetchNextPage();
      else void results.refetch();
    } else if (detail.firstPage) {
      setText(detail.filteringText.slice(0, 200));
    } else if (results.hasNextPage && !results.isFetchingNextPage && text.trim() === search) {
      void results.fetchNextPage();
    }
  };
  const statusType: SelectProps["statusType"] = results.isError ? "error" :
    results.isFetching || text.trim() !== search ? "loading" : results.hasNextPage ? "pending" : "finished";
  return { items, onLoadItems, statusType };
}

const loadingLabels = {
  empty: "No matching options",
  loadingText: "Loading options",
  finishedText: "All options loaded",
  errorText: "Could not load options",
  recoveryText: "Try again",
};

export function PagedSelect<T>({
  label, queryKey, load, getOption, selected, onSelect, allLabel, disabled, placeholder,
}: PagedSelectProps<T>) {
  const { items, onLoadItems, statusType } = usePagedOptions(queryKey, load);
  const options = items.map(getOption);
  if (allLabel) options.unshift({ label: allLabel, value: "" });
  const current = selected ?? (allLabel ? { label: allLabel, value: "" } : null);

  return (
    <Select
      {...loadingLabels}
      ariaLabel={label}
      disabled={disabled}
      placeholder={placeholder ?? "Choose " + label.toLowerCase()}
      filteringType="manual"
      options={options}
      selectedOption={current}
      statusType={statusType}
      onLoadItems={onLoadItems}
      onChange={({ detail }) => {
        const option = detail.selectedOption;
        onSelect(option.value ? option : null, items.find((item) => getOption(item).value === option.value));
      }}
    />
  );
}

export function PagedMultiselect<T>({
  label, queryKey, load, getOption, selected, onSelect, disabled, placeholder,
}: Omit<PagedSelectProps<T>, "selected" | "onSelect" | "allLabel"> & {
  selected: MultiselectProps.Option[];
  onSelect: (options: readonly MultiselectProps.Option[]) => void;
}) {
  const { items, onLoadItems, statusType } = usePagedOptions(queryKey, load);
  return <Multiselect
    {...loadingLabels}
    ariaLabel={label}
    disabled={disabled}
    placeholder={placeholder ?? "Choose " + label.toLowerCase()}
    filteringType="manual"
    options={items.map(getOption)}
    selectedOptions={selected}
    statusType={statusType}
    onLoadItems={onLoadItems}
    onChange={({ detail }) => onSelect(detail.selectedOptions)}
  />;
}
