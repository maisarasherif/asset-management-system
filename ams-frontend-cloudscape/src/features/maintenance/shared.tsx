
import { Alert, Box, Button, FormField, Modal, Pagination, SpaceBetween, Table, type SelectProps, type TableProps } from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { ListPagination } from "../../components/shared/ListFilters";
import type { ListControls } from "../../components/shared/useListControls";
import { getAsset, getComponent, listAssets, listComponentsByAsset } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { PaginatedResponse } from "../../types/ams";

export function MaintenanceAccess() {
  const { isClient } = useAuth();
  return isClient ? <Navigate to="/client/assets" replace /> : <Outlet />;
}

export function Register<T>({
  query, controls, columns, filters, empty, trackBy,
}: {
  query: UseQueryResult<PaginatedResponse<T>>;
  controls: ListControls;
  columns: TableProps<T>["columnDefinitions"];
  filters?: ReactNode;
  empty: string;
  trackBy: string;
}) {
  return (
    <Table columnDefinitions={columns} items={query.data?.data ?? []} trackBy={trackBy}
      loading={query.isLoading} loadingText="Loading records" filter={filters}
      pagination={<ListPagination controls={controls} meta={query.data?.meta} />}
      empty={query.isError
        ? <Alert type="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>{query.error.message}</Alert>
        : <Box textAlign="center" padding="m">{empty}</Box>}
    />
  );
}

export function Dialog({ title, save = "Save", children, close, submit, disabled }: {
  title: string;
  save?: string;
  children: ReactNode;
  close: () => void;
  submit: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: async () => {
      await cache.invalidateQueries({ predicate: ({ queryKey }) =>
        ["maintenance", "asset", "assets", "component", "components", "client-assets", "client-asset", "dashboard", "asset-certificate-summary"]
          .includes(String(queryKey[0])) });
      close();
    },
  });
  return (
    <Modal visible header={title} onDismiss={() => { if (!mutation.isPending) close(); }}
      footer={<Box float="right"><SpaceBetween size="xs" direction="horizontal">
        <Button variant="link" onClick={close} disabled={mutation.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={disabled}>{save}</Button>
      </SpaceBetween></Box>}>
      <SpaceBetween size="m">
        {mutation.isError && <Alert type="error">{mutation.error.message}</Alert>}
        {children}
      </SpaceBetween>
    </Modal>
  );
}

export function AssetPicker({ assetId, onChange, allLabel }: {
  assetId: string;
  onChange: (id: string) => void;
  allLabel?: string;
}) {
  const [option, setOption] = useState<SelectProps.Option | null>(null);
  const asset = useQuery({ queryKey: ["asset", assetId], queryFn: () => getAsset(assetId), enabled: Boolean(assetId) });
  const selected = option?.value === assetId ? option :
    asset.data ? { label: asset.data.name, value: assetId, description: asset.data.display_id } :
    assetId ? { label: "Selected equipment", value: assetId } : null;
  return (
    <FormField label="Equipment">
      <PagedSelect label="Equipment" queryKey={["assets", "maintenance-picker"]}
        load={(page, search) => listAssets(page, 20, { search })}
        getOption={(item) => ({ value: item.asset_id, label: item.name, description: item.display_id })}
        selected={selected} allLabel={allLabel}
        onSelect={(next) => { setOption(next); onChange(next?.value ?? ""); }} />
    </FormField>
  );
}

export function ComponentPicker({ assetId, selectedId, onChange }: { assetId: string; selectedId?: string | null; onChange: (id: string | null) => void }) {
  const [option, setOption] = useState<SelectProps.Option | null>(null);
  const component = useQuery({
    queryKey: ["component", selectedId], queryFn: () => getComponent(selectedId!), enabled: Boolean(selectedId),
  });
  const selected = option ?? (selectedId ? { label: component.data?.name ?? "Selected component", value: selectedId } : null);
  return (
    <FormField label="Component">
      <PagedSelect label="Component" allLabel="Whole equipment" queryKey={["maintenance", "components", assetId]}
        load={(page, search) => listComponentsByAsset(assetId, page, 20, { search, kind: "NORMAL" })}
        getOption={(item) => ({ value: item.component_id, label: item.name, description: item.display_id })}
        selected={selected} disabled={!assetId} onSelect={(next) => { setOption(next); onChange(next?.value ?? null); }} />
    </FormField>
  );
}

export function PageButtons({ page, pages, onChange }: {page: number; pages: number; onChange: (page: number) => void}) {
  return pages > 1 ? <Pagination currentPageIndex={page} pagesCount={pages} onChange={({ detail }) => onChange(detail.currentPageIndex)} /> : null;
}
