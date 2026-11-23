import { Alert, Box, Button, Container, Header, Pagination, Select, SpaceBetween } from "@cloudscape-design/components";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RouterLink } from "../../components/shared/RouterLink";
import { listWorkOrders } from "../../lib/api/maintenance";
import { workOrderDue } from "../maintenance/workOrderPresentation";

const filters = [
  { label: "All", value: "all", query: {} },
  { label: "Overdue", value: "overdue", query: { due_window: "OVERDUE" } },
  { label: "Due soon", value: "due-soon", query: { due_window: "DUE_SOON" } },
  { label: "Maintenance only", value: "maintenance", query: { type: "MAINTENANCE" } },
];

export function DashboardWorkOrders({ assetId }: { assetId: string }) {
  const [filter, setFilter] = useState(filters[0]);
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ["maintenance", "dashboard-open", assetId, filter.value, page],
    queryFn: () => listWorkOrders({ asset_id: assetId, open_only: "true", limit: 5, page, ...filter.query }),
    placeholderData: keepPreviousData,
  });
  const items = orders.data?.data ?? [];
  const total = orders.data?.meta.total;
  const pages = Math.max(1, orders.data?.meta.total_pages ?? 1);

  if (orders.data && !orders.isPlaceholderData && page > pages) setPage(pages);

  return (
    <Container
      header={<Header variant="h2" counter={!orders.isPlaceholderData && total != null ? `(${total})` : undefined}>Work Orders</Header>}
      footer={<RouterLink to={`/work-orders?asset_id=${assetId}&open_only=true`}>View all open work orders</RouterLink>}
    >
      <SpaceBetween size="s">
        <Select
          ariaLabel="Filter work orders"
          options={filters}
          selectedOption={filter}
          onChange={({ detail }) => {
            setFilter(filters.find((option) => option.value === detail.selectedOption.value) ?? filters[0]);
            setPage(1);
          }}
        />
        {orders.isError ? (
          <Alert type="error" action={<Button onClick={() => void orders.refetch()}>Retry</Button>}>
            {orders.error.message}
          </Alert>
        ) : orders.isPending || orders.isPlaceholderData ? (
          <Box color="text-body-secondary">Loading work orders</Box>
        ) : items.length === 0 ? (
          <Box color="text-body-secondary">No open work orders match this filter.</Box>
        ) : (
          <table className="overview-work-orders" aria-label="Open work orders">
            <thead>
              <tr>
                <th scope="col">Work order</th>
                <th scope="col">Equipment</th>
                <th scope="col">Due</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => (
                <tr key={order.work_order_id}>
                  <td><RouterLink to={`/work-orders/${order.work_order_id}`}>{order.title}</RouterLink></td>
                  <td>{order.component_name || order.asset_name}</td>
                  <td>{workOrderDue(order) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <Pagination
            currentPageIndex={page}
            pagesCount={pages}
            onChange={({ detail }) => setPage(detail.currentPageIndex)}
            ariaLabels={{
              paginationLabel: "Work Orders pagination",
              nextPageLabel: "Next page",
              previousPageLabel: "Previous page",
              pageLabel: (index) => `Page ${index}`,
            }}
          />
        )}
      </SpaceBetween>
    </Container>
  );
}
