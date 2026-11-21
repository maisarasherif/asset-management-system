
import { Alert, Box, Button, ContentLayout, FormField, Header, Input, Modal, SpaceBetween, Table, Textarea, type SelectProps } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListFilters } from "../../components/shared/ListFilters";
import { Select } from "../../components/shared/OptimizedSelect";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { useListControls } from "../../components/shared/useListControls";
import { searchProjects } from "../../lib/api/ams";
import { listStock, listStockChanges, maintenanceWrite } from "../../lib/api/maintenance";
import { useAuth } from "../../providers/auth-context";
import type { StockBalance } from "../../types/maintenance";
import { formatDateTime } from "../../utils/format";
import { Dialog, PageButtons, Register } from "./shared";
import { wholeUnits } from "./validation";
import { useStores } from "./useStores";

export function StorePicker({ storeId, onChange, all = false }: { storeId: string; onChange: (id: string) => void; all?: boolean }) {
  const stores = useStores();
  const options = stores.data?.map((store) => ({ value: store.store_id, label: store.name })) ?? [];
  if (all) options.unshift({ value: "", label: "All stores" });
  return <FormField label="Store">
    <Select ariaLabel="Store" filteringType="auto" options={options}
      selectedOption={options.find(({ value }) => value === storeId) ?? null}
      statusType={stores.isLoading ? "loading" : stores.isError ? "error" : "finished"}
      loadingText="Loading stores" errorText="Could not load stores" recoveryText="Retry"
      onLoadItems={({ detail }) => { if (detail.samePage && stores.isError) void stores.refetch(); }}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")} />
  </FormField>;
}

export function SparePartsPage() {
  const { isAdmin } = useAuth();
  const stores = useStores();
  const controls = useListControls("", ["store_id"]);
  const storeId = controls.filters.store_id || stores.data?.[0]?.store_id || "";
  const stock = useQuery({ queryKey: ["maintenance", "stock", storeId, controls.query],
    queryFn: () => listStock(storeId, controls.query), enabled: Boolean(storeId) });
  const [setup, setSetup] = useState<"store" | "part" | null>(null);
  const [count, setCount] = useState<StockBalance | null>(null);
  const [history, setHistory] = useState<StockBalance | null>(null);
  return <ContentLayout header={<Header variant="h1" actions={isAdmin && <SpaceBetween size="xs" direction="horizontal">
    <Button onClick={() => setSetup("store")}>Add worksite store</Button>
    <Button variant="primary" onClick={() => setSetup("part")}>Add spare part</Button>
  </SpaceBetween>}>Spare parts inventory</Header>}>
    <SpaceBetween size="m">
      {stores.isError && <Alert type="error" action={<Button onClick={() => void stores.refetch()}>Retry</Button>}>{stores.error.message}</Alert>}
      <Register query={stock} controls={controls} trackBy="part_id" empty="No spare parts found"
        filters={<ListFilters controls={controls} label="Search spare parts">
          <StorePicker storeId={storeId} onChange={(store_id) => controls.setFilters({ store_id })} />
        </ListFilters>}
        columns={[
          { id: "number", header: "Part number", cell: (row) => row.part_number },
          { id: "part", header: "Part", cell: (row) => row.name },
          { id: "quantity", header: "On hand", cell: (row) => row.quantity.toLocaleString() },
          { id: "actions", header: "Actions", cell: (row) => <SpaceBetween size="xs" direction="horizontal">
            {isAdmin && <Button variant="inline-link" onClick={() => setCount(row)}>Set count</Button>}
            <Button variant="inline-link" onClick={() => setHistory(row)}>Count history</Button>
          </SpaceBetween> },
        ]} />
    </SpaceBetween>
    {setup && <SetupDialog key={setup} kind={setup} close={() => setSetup(null)} />}
    {count && <CountDialog store={storeId} part={count} close={() => setCount(null)} />}
    {history && <StockHistory store={storeId} part={history} close={() => setHistory(null)} />}
  </ContentLayout>;
}

function SetupDialog({ kind, close }: { kind: "store" | "part"; close: () => void }) {
  const [project, setProject] = useState<SelectProps.Option | null>(null);
  const [partNumber, setPartNumber] = useState("");
  const [name, setName] = useState("");
  return kind === "store" ? <Dialog title="Add worksite store" close={close} disabled={!project?.value}
    submit={() => maintenanceWrite("stores", { project_id: project?.value })}>
    <FormField label="Project">
      <PagedSelect label="Project" selected={project} queryKey={["maintenance", "projects"]}
        load={(page, search) => searchProjects({ page, search })}
        getOption={(row) => ({ value: row.project_id, label: row.project_name })} onSelect={setProject} />
    </FormField>
  </Dialog> : <Dialog title="Add spare part" close={close} disabled={!partNumber.trim() || !name.trim()}
    submit={() => maintenanceWrite("parts", { part_number: partNumber, name })}>
    <FormField label="Part number"><Input ariaLabel="Part number" value={partNumber} onChange={({ detail }) => setPartNumber(detail.value)} /></FormField>
    <FormField label="Part name"><Input ariaLabel="Part name" value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
  </Dialog>;
}

function CountDialog({ store, part, close }: { store: string; part: StockBalance; close: () => void }) {
  const [quantity, setQuantity] = useState(String(part.quantity));
  const [reason, setReason] = useState("");
  return <Dialog title={`Set count for ${part.name}`} close={close} disabled={!wholeUnits(quantity) || !reason.trim()}
    submit={() => maintenanceWrite(`stores/${store}/stock/${part.part_id}`, { quantity: Number(quantity), reason, version: part.version }, "PUT")}>
    <FormField label="Current count">{part.quantity.toLocaleString()}</FormField>
    <FormField label="Quantity on hand"><Input ariaLabel="Quantity on hand" inputMode="numeric" value={quantity} onChange={({ detail }) => setQuantity(detail.value)} /></FormField>
    <FormField label="Count reason"><Textarea ariaLabel="Count reason" value={reason} onChange={({ detail }) => setReason(detail.value)} /></FormField>
  </Dialog>;
}

function StockHistory({ store, part, close }: { store: string; part: StockBalance; close: () => void }) {
  const [page, setPage] = useState(1);
  const changes = useQuery({ queryKey: ["maintenance", "stock-changes", store, part.part_id, page],
    queryFn: () => listStockChanges(store, part.part_id, { page }) });
  return <Modal visible size="large" onDismiss={close} header={`Count history · ${part.name}`}
    footer={<Box float="right"><Button onClick={close}>Close</Button></Box>}>
    {changes.isError ? <Alert type="error" action={<Button onClick={() => void changes.refetch()}>Retry</Button>}>{changes.error.message}</Alert> :
      <Table items={changes.data?.data ?? []} loading={changes.isLoading} trackBy="change_id" empty="No count changes recorded"
        pagination={<PageButtons page={page} pages={changes.data?.meta.total_pages ?? 1} onChange={setPage} />}
        columnDefinitions={[
          { id: "date", header: "When", cell: (row) => formatDateTime(row.changed_at) },
          { id: "quantity", header: "Balance change", cell: (row) => `${row.previous_quantity} → ${row.quantity}` },
          { id: "reason", header: "Reason", cell: (row) => row.reason },
          { id: "actor", header: "Recorded by", cell: (row) => row.actor_name || "—" },
        ]} />}
  </Modal>;
}
