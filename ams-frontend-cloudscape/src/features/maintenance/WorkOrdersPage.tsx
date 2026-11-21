
import { Button, Checkbox, ContentLayout, DatePicker, FormField, Header, Input, StatusIndicator, Textarea } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListFilters } from "../../components/shared/ListFilters";
import { RouterLink } from "../../components/shared/RouterLink";
import { useListControls } from "../../components/shared/useListControls";
import { listWorkOrders, maintenanceWrite } from "../../lib/api/maintenance";
import type { WorkOrder } from "../../types/maintenance";
import { formatDateTime, humanizeEnum } from "../../utils/format";
import { AssetPicker, ComponentPicker, Dialog, Register } from "./shared";

const statuses = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function WorkOrdersPage() {
  const controls = useListControls("", ["asset_id", "component_id", "status", "type", "from", "to"]);
  const orders = useQuery({ queryKey: ["maintenance", "orders", controls.query], queryFn: () => listWorkOrders(controls.query) });
  const [raising, setRaising] = useState(false);
  const navigate = useNavigate();

  return (
    <ContentLayout header={<Header variant="h1" actions={<Button variant="primary" onClick={() => setRaising(true)}>Raise work order</Button>}>Maintenance work orders</Header>}>
      <Register query={orders} controls={controls} empty="No work orders found" trackBy="work_order_id"
        filters={<ListFilters controls={controls} label="Search work orders" facets={[
          { key: "status", label: "Status", options: statuses.map((value) => ({ value, label: humanizeEnum(value) })) },
          { key: "type", label: "Maintenance type", options: [{ value: "ROUTINE", label: "Routine" }, { value: "NON_ROUTINE", label: "Non-routine" }] },
        ]}>
          <AssetPicker assetId={controls.filters.asset_id} allLabel="All equipment" onChange={(asset_id) => controls.setFilters({ asset_id, component_id: "" })} />
          <FormField label="From date"><DatePicker ariaLabel="From date" value={controls.filters.from} onChange={({ detail }) => controls.setFilters({ from: detail.value })} /></FormField>
          <FormField label="To date"><DatePicker ariaLabel="To date" value={controls.filters.to} onChange={({ detail }) => controls.setFilters({ to: detail.value })} /></FormField>
        </ListFilters>}
        columns={[
          { id: "order", header: "Work order", cell: (row) => <RouterLink to={`/maintenance/work-orders/${row.work_order_id}`}>{row.display_id} · {row.title}</RouterLink> },
          { id: "asset", header: "Equipment", cell: (row) => row.component_name ? `${row.asset_name} / ${row.component_name}` : row.asset_name },
          { id: "type", header: "Type", cell: (row) => row.plan_id ? "Routine" : "Non-routine" },
          { id: "status", header: "Status", cell: (row) => <StatusIndicator type={row.status === "COMPLETED" ? "success" : "info"}>{humanizeEnum(row.status)}</StatusIndicator> },
          { id: "assignee", header: "Technician", cell: (row) => row.assignee_name || "Unassigned" },
          { id: "created", header: "Raised", cell: (row) => formatDateTime(row.created_at) },
        ]} />
      {raising && <RaiseOrder asset={controls.filters.asset_id} component={controls.filters.component_id}
        close={() => setRaising(false)} onRaised={(id) => navigate(`/maintenance/work-orders/${id}`)} />}
    </ContentLayout>
  );
}

function RaiseOrder({ asset, component, close, onRaised }: {
  asset: string; component: string; close: () => void; onRaised: (id: string) => void;
}) {
  const [assetId, setAssetId] = useState(asset);
  const [componentId, setComponentId] = useState<string | null>(component || null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quarantine, setQuarantine] = useState(false);
  return (
    <Dialog title="Raise non-routine work order" save="Raise work order" close={close}
      disabled={!assetId || !title.trim() || !description.trim()}
      submit={async () => {
        const order = await maintenanceWrite<WorkOrder>("work-orders", {
          asset_id: assetId, component_id: componentId, title, description, quarantine,
        });
        onRaised(order.work_order_id);
      }}>
      <AssetPicker assetId={assetId} onChange={(id) => { setAssetId(id); setComponentId(null); }} />
      <ComponentPicker key={assetId} assetId={assetId} selectedId={componentId} onChange={setComponentId} />
      <FormField label="Title"><Input ariaLabel="Title" value={title} onChange={({ detail }) => setTitle(detail.value)} /></FormField>
      <FormField label="Fault or work required"><Textarea ariaLabel="Fault or work required" value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
      <Checkbox checked={quarantine} onChange={({ detail }) => setQuarantine(detail.checked)}>Red-tag and block deployment</Checkbox>
    </Dialog>
  );
}
