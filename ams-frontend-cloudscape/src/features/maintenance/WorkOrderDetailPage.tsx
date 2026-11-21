
import { Button, ColumnLayout, Container, ContentLayout, FormField, Header, SpaceBetween, StatusIndicator, Textarea, type SelectProps } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { getWorkOrder, listTechnicians, maintenanceWrite } from "../../lib/api/maintenance";
import type { WorkOrderDetail } from "../../types/maintenance";
import { formatDate, formatDateTime, humanizeEnum } from "../../utils/format";
import { Dialog } from "./shared";
import { PartsUsageTable } from "./PartsUsagePage";

type Action = "assign" | "start" | "complete" | "cancel" | "quarantine";

export function WorkOrderDetailPage() {
  const { orderId = "" } = useParams();
  const orderQuery = useQuery({ queryKey: ["maintenance", "order", orderId], queryFn: () => getWorkOrder(orderId) });
  const [action, setAction] = useState<Action | null>(null);

  if (orderQuery.isLoading) return <PageLoading>Loading work order</PageLoading>;
  if (!orderQuery.data) return <PageError description={orderQuery.error?.message ?? "Work order unavailable"} onRetry={() => void orderQuery.refetch()} />;

  const order = orderQuery.data;
  const open = order.status === "OPEN" || order.status === "IN_PROGRESS";
  return (
    <ContentLayout header={<Header variant="h1" description={`Work order ${order.display_id}`}>
      {order.title}
    </Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2" actions={open && <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => setAction("assign")}>Assign</Button>
          {order.status === "OPEN" && <Button onClick={() => setAction("start")}>Start work</Button>}
          <Button onClick={() => setAction("quarantine")}>Red-tag equipment</Button>
          {!order.plan_id && <Button onClick={() => setAction("cancel")}>Cancel order</Button>}
          <Button variant="primary" onClick={() => setAction("complete")}>Complete work order</Button>
        </SpaceBetween>}>Work details</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <FormField label="Equipment">
              <RouterLink to={`/assets/${order.asset_id}${order.component_id ? "?component=" + order.component_id : ""}`}>{order.asset_name}</RouterLink>
              {order.component_name && <div>{order.component_name}</div>}
            </FormField>
            <FormField label="Status"><StatusIndicator type={order.status === "COMPLETED" ? "success" : "info"}>{humanizeEnum(order.status)}</StatusIndicator></FormField>
            <FormField label="Technician">{order.assignee_name || "Unassigned"}</FormField>
            <FormField label="Maintenance type">{order.plan_id ? "Routine" : "Non-routine"}</FormField>
            <FormField label="Raised">{formatDateTime(order.created_at)}</FormField>
            {order.plan_id && <FormField label="Due">{[order.due_hours == null ? "" : `${order.due_hours.toLocaleString()} h`, order.due_date ? formatDate(order.due_date) : ""].filter(Boolean).join(" or ")}</FormField>}
            {order.description && <FormField label="Fault or work required">{order.description}</FormField>}
            {order.closed_at && <FormField label="Closed">{formatDateTime(order.closed_at)}</FormField>}
            {order.completion_notes && <FormField label="Work performed / closure notes">{order.completion_notes}</FormField>}
          </ColumnLayout>
        </Container>
        <PartsUsageTable orderId={orderId} editable={open} />
      </SpaceBetween>
      {action && <OrderAction key={action} order={order} action={action} close={() => setAction(null)} />}
    </ContentLayout>
  );
}

const labels: Record<Action, string> = {
  assign: "Assign technician", start: "Start work", complete: "Complete work order",
  cancel: "Cancel work order", quarantine: "Red-tag equipment",
};

function OrderAction({ order, action, close }: { order: WorkOrderDetail; action: Action; close: () => void }) {
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState<SelectProps.Option | null>(
    order.assignee_id ? { value: order.assignee_id, label: order.assignee_name } : null,
  );
  const needsNotes = action === "complete" || action === "cancel" || action === "quarantine";
  const notesLabel = action === "quarantine" ? "Quarantine reason" : action === "cancel" ? "Cancellation reason" : "Work performed";
  const submit = () => action === "quarantine"
    ? maintenanceWrite("quarantine", { asset_id: order.asset_id, component_id: order.component_id, work_order_id: order.work_order_id, reason: notes })
    : maintenanceWrite(`work-orders/${order.work_order_id}/${action}`, { notes, assignee_id: assignee?.value ?? null });

  return <Dialog title={labels[action]} save={action === "cancel" ? "Confirm cancellation" : labels[action]}
    close={close} disabled={needsNotes && !notes.trim()} submit={submit}>
    {action === "assign" && <FormField label="Technician">
      <PagedSelect label="Technician" allLabel="Unassigned" selected={assignee} queryKey={["maintenance", "technicians"]}
        load={(page, search) => listTechnicians({ page, search })}
        getOption={(tech) => ({ value: tech.user_id, label: `${tech.first_name} ${tech.last_name}`.trim() || tech.email, description: tech.email })}
        onSelect={setAssignee} />
    </FormField>}
    {needsNotes && <FormField label={notesLabel}><Textarea ariaLabel={notesLabel} value={notes} onChange={({ detail }) => setNotes(detail.value)} /></FormField>}
    {action === "start" && <p>Mark this work order as in progress.</p>}
  </Dialog>;
}
