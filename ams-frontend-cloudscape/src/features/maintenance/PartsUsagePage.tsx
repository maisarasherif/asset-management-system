
import { Button, ContentLayout, DatePicker, FormField, Header, Input, SpaceBetween, Textarea, type SelectProps } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { RouterLink } from "../../components/shared/RouterLink";
import { useListControls } from "../../components/shared/useListControls";
import { listPartUsage, listStock, listWorkOrders, maintenanceWrite } from "../../lib/api/maintenance";
import type { PartUsage, StockBalance } from "../../types/maintenance";
import { formatDateTime } from "../../utils/format";
import { AssetPicker, Dialog, Register } from "./shared";
import { wholeUnits } from "./validation";
import { StorePicker } from "./SparePartsPage";
import { useStores } from "./useStores";

export function PartsUsagePage() {
  return <ContentLayout header={<Header variant="h1">Parts usage register</Header>}><PartsUsageTable /></ContentLayout>;
}

export function PartsUsageTable({ orderId, editable = false }: { orderId?: string; editable?: boolean }) {
  const controls = useListControls(orderId ? "parts" : "", ["asset_id", "store_id", "part_id", "work_order_id", "from", "to"]);
  const orderFilter = orderId || controls.filters.work_order_id;
  const usage = useQuery({ queryKey: ["maintenance", "usage", orderFilter, controls.query],
    queryFn: () => listPartUsage({ ...controls.query, work_order_id: orderFilter }) });
  const [edit, setEdit] = useState<PartUsage | "new" | null>(null);
  const reset = () => controls.clear();
  return <SpaceBetween size="m">
    {orderId && <Header variant="h2" actions={editable && <Button onClick={() => setEdit("new")}>Record parts usage</Button>}>Parts used</Header>}
    <Register query={usage} controls={controls} empty="No parts usage recorded" trackBy="usage_id"
      filters={!orderId && <div className="list-filter-facets">
        <AssetPicker assetId={controls.filters.asset_id} allLabel="All equipment" onChange={(asset_id) => controls.setFilters({ asset_id, work_order_id: "" })} />
        <StorePicker all storeId={controls.filters.store_id} onChange={(store_id) => controls.setFilters({ store_id })} />
        <UsageFilters key={controls.filters.asset_id} controls={controls} />
        <FormField label="From date"><DatePicker ariaLabel="From date" value={controls.filters.from} onChange={({ detail }) => controls.setFilters({ from: detail.value })} /></FormField>
        <FormField label="To date"><DatePicker ariaLabel="To date" value={controls.filters.to} onChange={({ detail }) => controls.setFilters({ to: detail.value })} /></FormField>
        {controls.hasCriteria && <Button onClick={reset}>Clear filters</Button>}
      </div>}
      columns={[
        { id: "part", header: "Part", cell: (row) => `${row.part_number} · ${row.part_name}` },
        { id: "store", header: "Store", cell: (row) => row.store_name },
        { id: "quantity", header: "Quantity", cell: (row) => row.quantity === 0 ? "0 · Corrected" : row.quantity.toLocaleString() },
        ...(!orderId ? [
          { id: "asset", header: "Equipment", cell: (row: PartUsage) => row.asset_name },
          { id: "order", header: "Work order", cell: (row: PartUsage) => <RouterLink to={`/work-orders/${row.work_order_id}`}>{row.work_order_number}</RouterLink> },
        ] : []),
        { id: "recorded", header: "Recorded", cell: (row) => <>{formatDateTime(row.recorded_at)}<div>{row.actor_name}</div></> },
        ...(editable ? [{ id: "edit", header: "Actions", cell: (row: PartUsage) => <Button variant="inline-link" onClick={() => setEdit(row)}>Correct usage</Button> }] : []),
      ]} />
    {edit === "new" && orderId && <RecordUsage orderId={orderId} close={() => setEdit(null)} />}
    {edit && edit !== "new" && <CorrectUsage usage={edit} close={() => setEdit(null)} />}
  </SpaceBetween>;
}

function UsageFilters({ controls }: { controls: ReturnType<typeof useListControls> }) {
  const warehouse = useStores().data?.[0]?.store_id ?? "";
  const [order, setOrder] = useState<SelectProps.Option | null>(null);
  const [part, setPart] = useState<SelectProps.Option | null>(null);
  // Keep the label between filter changes and let the URL carry the selected IDs.
  const selectedOrder = order?.value === controls.filters.work_order_id ? order : (controls.filters.work_order_id ? { label: "Selected work order", value: controls.filters.work_order_id } : null);
  const selectedPart = part?.value === controls.filters.part_id ? part : (controls.filters.part_id ? { label: "Selected part", value: controls.filters.part_id } : null);
  return <>
    <FormField label="Work order">
      <PagedSelect label="Work order" allLabel="All work orders" selected={selectedOrder}
        queryKey={["maintenance", "usage-order-filter", controls.filters.asset_id]}
        load={(page, search) => listWorkOrders({ page, search, asset_id: controls.filters.asset_id, type: "MAINTENANCE" })}
        getOption={(row) => ({ value: row.work_order_id, label: `${row.display_id} · ${row.title}` })}
        onSelect={(option) => { setOrder(option); controls.setFilters({ work_order_id: option?.value ?? "" }); }} />
    </FormField>
    <FormField label="Part">
      <PagedSelect label="Part" allLabel="All parts" selected={selectedPart} disabled={!warehouse}
        queryKey={["maintenance", "usage-part-filter", warehouse]}
        load={(page, search) => listStock(warehouse, { page, search })}
        getOption={(row) => ({ value: row.part_id, label: `${row.part_number} · ${row.name}` })}
        onSelect={(option) => { setPart(option); controls.setFilters({ part_id: option?.value ?? "" }); }} />
    </FormField>
  </>;
}

function RecordUsage({ orderId, close }: { orderId: string; close: () => void }) {
  const [storeId, setStoreId] = useState("");
  const [part, setPart] = useState<StockBalance | null>(null);
  const [quantity, setQuantity] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const valid = wholeUnits(quantity, 1) && part && Number(quantity) <= part.quantity;
  return <Dialog title="Record parts usage" save="Save usage" close={close} disabled={!storeId || !valid}
    submit={() => maintenanceWrite(`work-orders/${orderId}/usage`, {
      request_id: requestId, store_id: storeId, part_id: part?.part_id, quantity: Number(quantity),
    })}>
    <StorePicker storeId={storeId} onChange={(id) => { setStoreId(id); setPart(null); }} />
    <FormField label="Spare part">
      <PagedSelect key={storeId} label="Spare part" disabled={!storeId}
        selected={part ? { value: part.part_id, label: `${part.part_number} · ${part.name}` } : null}
        queryKey={["maintenance", "available-parts", storeId]}
        load={(page, search) => listStock(storeId, { page, search, in_stock: "true" })}
        getOption={(row) => ({ value: row.part_id, label: `${row.part_number} · ${row.name}`, description: `${row.quantity} on hand` })}
        onSelect={(_, row) => setPart(row ?? null)} />
    </FormField>
    <FormField label="Quantity used" description={part ? `${part.quantity} available at this store` : undefined}
      errorText={part && wholeUnits(quantity, 1) && Number(quantity) > part.quantity ? "Quantity exceeds the available stock" : undefined}>
      <Input ariaLabel="Quantity used" inputMode="numeric" value={quantity} onChange={({ detail }) => setQuantity(detail.value)} />
    </FormField>
  </Dialog>;
}

function CorrectUsage({ usage, close }: { usage: PartUsage; close: () => void }) {
  const [quantity, setQuantity] = useState(String(usage.quantity));
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  return <Dialog title="Correct parts usage" save="Save correction" close={close} disabled={!wholeUnits(quantity) || !reason.trim()}
    submit={() => maintenanceWrite(`usage/${usage.usage_id}`, {
      request_id: requestId, quantity: Number(quantity), version: usage.version, reason,
    }, "PATCH")}>
    <FormField label="Part and store">{usage.part_name} · {usage.store_name}</FormField>
    <FormField label="Corrected quantity"><Input ariaLabel="Corrected quantity" inputMode="numeric" value={quantity} onChange={({ detail }) => setQuantity(detail.value)} /></FormField>
    <FormField label="Correction reason"><Textarea ariaLabel="Correction reason" value={reason} onChange={({ detail }) => setReason(detail.value)} /></FormField>
  </Dialog>;
}
