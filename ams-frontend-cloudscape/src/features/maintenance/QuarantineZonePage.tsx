
import { Button, Checkbox, ContentLayout, FormField, Header, SpaceBetween, StatusIndicator, Textarea, type SelectProps } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { RouterLink } from "../../components/shared/RouterLink";
import { useListControls } from "../../components/shared/useListControls";
import { getQuarantineBlockers, listQuarantine, listWorkOrders, maintenanceWrite } from "../../lib/api/maintenance";
import { useAuth } from "../../providers/auth-context";
import type { QuarantineRecord } from "../../types/maintenance";
import { formatDateTime } from "../../utils/format";
import { AssetPicker, ComponentPicker, Dialog, Register } from "./shared";

export function QuarantineZonePage() {
  const { isAdmin } = useAuth();
  const controls = useListControls("", ["asset_id", "include_released"]);
  const records = useQuery({ queryKey: ["maintenance", "quarantine", controls.query], queryFn: () => listQuarantine(controls.query) });
  const [tagging, setTagging] = useState(false);
  const [selected, setSelected] = useState<QuarantineRecord | null>(null);

  return <ContentLayout header={<Header variant="h1" actions={<Button variant="primary" onClick={() => setTagging(true)}>Red-tag equipment</Button>}>Quarantine Zone</Header>}>
    <Register query={records} controls={controls} trackBy="quarantine_id" empty="No quarantine records found"
      filters={<div className="list-filter-facets">
        <AssetPicker assetId={controls.filters.asset_id} allLabel="All equipment" onChange={(asset_id) => controls.setFilters({ asset_id })} />
        <Checkbox checked={controls.filters.include_released === "true"} onChange={({ detail }) => controls.setFilters({ include_released: detail.checked ? "true" : "" })}>Include released equipment</Checkbox>
      </div>}
      columns={[
        { id: "equipment", header: "Equipment", cell: (row) => <RouterLink to={`/assets/${row.asset_id}${row.component_id ? "?component=" + row.component_id : ""}`}>{[row.asset_name, row.component_name].filter(Boolean).join(" / ")}</RouterLink> },
        { id: "tag", header: "Tag", cell: (row) => <StatusIndicator type={row.released_at ? "success" : "error"}>{row.released_at ? "Green tag · Released" : "Red tag · Quarantined"}</StatusIndicator> },
        { id: "reason", header: "Reason", cell: (row) => row.reason },
        { id: "tagged", header: "Tagged", cell: (row) => <>{formatDateTime(row.tagged_at)}<div>{row.tagged_by_name || "System"}</div></> },
        { id: "released", header: "Release", cell: (row) => row.released_at ? <>{formatDateTime(row.released_at)}<div>{row.released_by_name}</div><div>{row.release_notes}</div></> : null },
        { id: "action", header: "Actions", cell: (row) => !row.released_at && <Button variant="inline-link" onClick={() => setSelected(row)}>
          {row.blocking_orders > 0 ? `${row.blocking_orders} blocking work order(s)` : isAdmin ? "Release equipment" : "View hold"}
        </Button> },
      ]} />
    {tagging && <TagDialog initialAsset={controls.filters.asset_id} close={() => setTagging(false)} />}
    {selected && <ReleaseDialog record={selected} isAdmin={isAdmin} close={() => setSelected(null)} />}
  </ContentLayout>;
}

function TagDialog({ initialAsset, close }: { initialAsset: string; close: () => void }) {
  const [assetId, setAssetId] = useState(initialAsset);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [order, setOrder] = useState<SelectProps.Option | null>(null);
  const [reason, setReason] = useState("");
  return <Dialog title="Red-tag equipment" close={close} save="Red-tag equipment" disabled={!assetId || !reason.trim()}
    submit={() => maintenanceWrite("quarantine", { asset_id: assetId, component_id: componentId, work_order_id: order?.value ?? null, reason })}>
    <AssetPicker assetId={assetId} onChange={(id) => { setAssetId(id); setComponentId(null); setOrder(null); }} />
    <ComponentPicker key={assetId} assetId={assetId} onChange={(id) => { setComponentId(id); setOrder(null); }} />
    <FormField label="Blocking work order">
      <PagedSelect key={`${assetId}/${componentId}`} label="Blocking work order" allLabel="No linked work order"
        selected={order} disabled={!assetId} queryKey={["maintenance", "blocking-order-picker", assetId, componentId]}
        load={(page, search) => listWorkOrders({ page, search, asset_id: assetId, component_id: componentId ?? "", open_only: "true", type: "MAINTENANCE" })}
        getOption={(row) => ({ value: row.work_order_id, label: `${row.display_id} · ${row.title}` })} onSelect={setOrder} />
    </FormField>
    <FormField label="Quarantine reason"><Textarea ariaLabel="Quarantine reason" value={reason} onChange={({ detail }) => setReason(detail.value)} /></FormField>
  </Dialog>;
}

function ReleaseDialog({ record, isAdmin, close }: { record: QuarantineRecord; isAdmin: boolean; close: () => void }) {
  const [notes, setNotes] = useState("");
  const blockers = useQuery({ queryKey: ["maintenance", "blockers", record.quarantine_id], queryFn: () => getQuarantineBlockers(record.quarantine_id) });
  const eligible = isAdmin && blockers.data?.length === 0;
  return <Dialog title={eligible ? "Release equipment" : "Quarantine details"} save="Green-tag equipment" close={close}
    disabled={!eligible || !notes.trim()} submit={() => maintenanceWrite(`quarantine/${record.quarantine_id}/release`, { notes })}>
    <FormField label="Quarantine reason">{record.reason}</FormField>
    {blockers.isLoading && <p>Checking work orders</p>}
    {blockers.isError && <Button onClick={() => void blockers.refetch()}>Retry loading work orders</Button>}
    {Boolean(blockers.data?.length) && <SpaceBetween size="xs">
      {blockers.data?.map((order) => <RouterLink key={order.work_order_id} to={`/work-orders/${order.work_order_id}`}>{order.display_id} · {order.title}</RouterLink>)}
    </SpaceBetween>}
    {eligible && <FormField label="Release notes"><Textarea ariaLabel="Release notes" value={notes} onChange={({ detail }) => setNotes(detail.value)} /></FormField>}
  </Dialog>;
}
