
import { Alert, Box, Button, Container, Header, StatusIndicator, Table } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { RouterLink } from "../../components/shared/RouterLink";
import { listWorkOrders } from "../../lib/api/maintenance";
import { humanizeEnum } from "../../utils/format";
import { workOrderDue, workOrderType } from "../maintenance/workOrderPresentation";

export function DashboardWorkOrders({ assetId }: { assetId: string }) {
  const navigate = useNavigate();
  const orders = useQuery({
    queryKey: ["maintenance", "dashboard-open", assetId],
    queryFn: () => listWorkOrders({ asset_id: assetId, open_only: "true", limit: 8 }),
  });
  const items = orders.data?.data ?? [];
  const total = orders.data?.meta.total;
  const empty = <Box color="text-body-secondary">No open work orders for this asset.</Box>;

  return (
    <Container header={
      <Header variant="h2"
        description={total != null && total > items.length ? `Showing ${items.length} of ${total} open work orders` : undefined}
        counter={total == null ? undefined : `(${total})`}
        actions={<Button onClick={() => navigate(`/work-orders?asset_id=${assetId}&open_only=true`)}>View work orders</Button>}
      >Work Orders</Header>
    }>
      {orders.isError ? (
        <Alert type="error" action={<Button onClick={() => void orders.refetch()}>Retry</Button>}>
          {orders.error.message}
        </Alert>
      ) : <>
        <div className="certificate-action-list">
          {orders.isLoading ? <Box color="text-body-secondary">Loading work orders</Box> : items.length === 0 ? empty :
            items.map((order) => (
              <div className="certificate-action-list__item" key={order.work_order_id}>
                <div className="certificate-action-list__header">
                  <RouterLink to={`/work-orders/${order.work_order_id}`}>{order.title}</RouterLink>
                  <StatusIndicator type="info">{humanizeEnum(order.status)}</StatusIndicator>
                </div>
                <div className="certificate-action-list__meta">
                  <span>{workOrderType(order)}</span>
                  <span>{order.component_name || order.asset_name}</span>
                  <span>{workOrderDue(order) || "—"}</span>
                </div>
              </div>
            ))}
        </div>
        <div className="certificate-action-table">
          <Table items={items} trackBy="work_order_id" variant="embedded" empty={empty}
            loading={orders.isLoading} loadingText="Loading work orders"
            columnDefinitions={[
              { id: "work", header: "Work required", cell: (order) => <RouterLink to={`/work-orders/${order.work_order_id}`}>{order.title}</RouterLink> },
              { id: "type", header: "Type", cell: workOrderType },
              { id: "equipment", header: "Equipment", cell: (order) => order.component_name || order.asset_name },
              { id: "due", header: "Due", cell: (order) => workOrderDue(order) || "—" },
              { id: "status", header: "Status", cell: (order) => <StatusIndicator type="info">{humanizeEnum(order.status)}</StatusIndicator> },
            ]}
          />
        </div>
      </>}
    </Container>
  );
}
