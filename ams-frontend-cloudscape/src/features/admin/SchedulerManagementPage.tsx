import { ListFilters, ListPagination } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TableCellText } from "../../components/shared/TableCells";
import {
  listCertificateNotificationFailures,
  listCertificateNotificationTasks,
  runCertificateExpiryScheduler,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  CertificateNotificationFailure,
  CertificateNotificationTask,
  NotificationSourceType,
  NotificationStatus,
  NotificationTier,
} from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

function statusBadge(status: NotificationStatus) {
  const color = status === "SENT" ? "green" : status === "FAILED" ? "red" : "blue";
  return <Badge color={color}>{humanizeEnum(status)}</Badge>;
}

function tierBadge(tier: NotificationTier) {
  if (!tier) {
    return <Box color="text-body-secondary">-</Box>;
  }
  if (tier === "expired") {
    return <Badge color="red">Expired</Badge>;
  }
  return <Badge color="blue">{tier}</Badge>;
}

function sourceBadge(sourceType: NotificationSourceType) {
  const color = sourceType === "certificate_expiry" ? "blue" : "grey";
  return <Badge color={color}>{humanizeEnum(sourceType)}</Badge>;
}

function notificationSourceLabel(
  item: Pick<CertificateNotificationTask | CertificateNotificationFailure, "source_display_id" | "source_name">
) {
  return item.source_display_id
    ? `${item.source_display_id} - ${item.source_name}`
    : item.source_name || "-";
}

function notificationSourceDescription(
  item: Pick<
    CertificateNotificationTask | CertificateNotificationFailure,
    "asset_display_id" | "asset_name" | "component_name"
  >
) {
  const asset = item.asset_display_id ? `${item.asset_display_id} - ${item.asset_name}` : item.asset_name;
  if (!asset) {
    return "No asset context";
  }
  return item.component_name ? `${asset} / ${item.component_name}` : asset;
}

function copyableKey(key: string) {
  return (
    <TableCellText title={key}>
      <Box fontSize="body-s" color="text-body-secondary">
        <code>{key}</code>
      </Box>
    </TableCellText>
  );
}

const channelFacet = { key: "channel", label: "Channel", options: [
  { value: "EMAIL", label: "Email" }, { value: "CLICKUP", label: "ClickUp" },
] };
const statusFacet = { key: "status", label: "Status", options: [
  { value: "PENDING", label: "Pending" }, { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
] };
const sourceFacet = { key: "source_type", label: "Source", options: [
  { value: "certificate_expiry", label: "Certificate expiry" },
  { value: "routine_maintenance", label: "Routine maintenance" },
] };

export function SchedulerManagementPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();

  const tasksControls = useListControls("jobs", ["channel", "status", "source_type"]);
  const tasksQuery = useQuery({
    queryKey: ["certificate-notification-tasks", "all", tasksControls.query],
    queryFn: () => listCertificateNotificationTasks(tasksControls.page, tasksControls.query.limit, tasksControls.query),
  });
  const failuresControls = useListControls("failures", ["channel", "source_type"]);
  const failuresQuery = useQuery({
    queryKey: ["certificate-notification-failures", "all", failuresControls.query],
    queryFn: () => listCertificateNotificationFailures(failuresControls.page, failuresControls.query.limit, failuresControls.query),
  });

  const runMutation = useMutation({
    mutationFn: runCertificateExpiryScheduler,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["certificate-notification-tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["certificate-notification-failures"] });
      success(
        "Scheduler run completed",
        `${response.processed_certificates} certificate${response.processed_certificates === 1 ? "" : "s"} processed.`
      );
    },
    onError: (mutationError: Error) => {
      error("Scheduler run failed", mutationError.message);
    },
  });

  const taskColumns: TableProps<CertificateNotificationTask>["columnDefinitions"] = [
    {
      id: "sent_at",
      header: "Recorded",
      width: 190,
      minWidth: 180,
      cell: (item) => formatDateTime(item.sent_at),
      sortingField: "sent_at",
    },
    {
      id: "source",
      header: "Source",
      width: "28%",
      minWidth: 260,
      cell: (item) => (
        <SpaceBetween size="xxs">
          <TableCellText title={notificationSourceLabel(item)}>
            <Box>{notificationSourceLabel(item)}</Box>
          </TableCellText>
          <TableCellText title={notificationSourceDescription(item)}>
            <Box color="text-body-secondary">{notificationSourceDescription(item)}</Box>
          </TableCellText>
        </SpaceBetween>
      ),
      sortingField: "source_name",
    },
    {
      id: "source_type",
      header: "Source type",
      width: 170,
      minWidth: 150,
      cell: (item) => sourceBadge(item.source_type),
      sortingField: "source_type",
    },
    {
      id: "channel",
      header: "Channel",
      width: 120,
      minWidth: 110,
      cell: (item) => humanizeEnum(item.type),
      sortingField: "type",
    },
    {
      id: "tier",
      header: "Tier",
      width: 140,
      minWidth: 130,
      cell: (item) => tierBadge(item.tier),
      sortingField: "tier",
    },
    {
      id: "status",
      header: "Status",
      width: 140,
      minWidth: 130,
      cell: (item) => statusBadge(item.status),
      sortingField: "status",
    },
    {
      id: "external",
      header: "External task",
      width: "16%",
      minWidth: 160,
      cell: (item) => (
        <TableCellText title={item.external_task_id || "-"}>{item.external_task_id || "-"}</TableCellText>
      ),
    },
    {
      id: "key",
      header: "Idempotency key",
      width: "18%",
      minWidth: 180,
      cell: (item) => copyableKey(item.idempotency_key),
    },
  ];

  const failureColumns: TableProps<CertificateNotificationFailure>["columnDefinitions"] = [
    {
      id: "failed_at",
      header: "Failed",
      width: 190,
      minWidth: 180,
      cell: (item) => formatDateTime(item.failed_at),
      sortingField: "failed_at",
    },
    {
      id: "source",
      header: "Source",
      width: "28%",
      minWidth: 260,
      cell: (item) => (
        <SpaceBetween size="xxs">
          <TableCellText title={notificationSourceLabel(item)}>
            <Box>{notificationSourceLabel(item)}</Box>
          </TableCellText>
          <TableCellText title={notificationSourceDescription(item)}>
            <Box color="text-body-secondary">{notificationSourceDescription(item)}</Box>
          </TableCellText>
        </SpaceBetween>
      ),
      sortingField: "source_name",
    },
    {
      id: "source_type",
      header: "Source type",
      width: 170,
      minWidth: 150,
      cell: (item) => sourceBadge(item.source_type),
      sortingField: "source_type",
    },
    {
      id: "channel",
      header: "Channel",
      width: 120,
      minWidth: 110,
      cell: (item) => humanizeEnum(item.channel),
      sortingField: "channel",
    },
    {
      id: "tier",
      header: "Tier",
      width: 140,
      minWidth: 130,
      cell: (item) => tierBadge(item.tier),
      sortingField: "tier",
    },
    {
      id: "error",
      header: "Error",
      width: "24%",
      minWidth: 240,
      cell: (item) => <TableCellText title={item.error_message}>{item.error_message}</TableCellText>,
    },
    {
      id: "key",
      header: "Idempotency key",
      width: "18%",
      minWidth: 180,
      cell: (item) => copyableKey(item.idempotency_key),
    },
  ];

  const isInitialLoading = tasksQuery.isLoading || failuresQuery.isLoading;
  const hasLoadError = tasksQuery.isError || failuresQuery.isError;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Review notification jobs, inspect failure history, and run the certificate expiry scheduler manually when needed."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                iconName="refresh"
                loading={tasksQuery.isFetching || failuresQuery.isFetching}
                onClick={() => {
                  void tasksQuery.refetch();
                  void failuresQuery.refetch();
                }}
              >
                Refresh
              </Button>
              <Button
                loading={runMutation.isPending}
                variant="primary"
                onClick={() => runMutation.mutate()}
              >
                Run scheduler now
              </Button>
            </SpaceBetween>
          }
        >
          Scheduler management
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hasLoadError ? (
          <Alert type="error">Scheduler data could not be loaded. Refresh the page or try again later.</Alert>
        ) : null}

        <Container
          header={
            <Header counter={`(${tasksQuery.data?.meta.total ?? 0})`} variant="h2">
              Job audit
            </Header>
          }
        >
          <Table
            columnDefinitions={taskColumns}
            empty={<Box color="text-body-secondary">No notification jobs have been recorded.</Box>}
            items={tasksQuery.data?.data ?? []}
            filter={<ListFilters controls={tasksControls} label="Search jobs" facets={[channelFacet, sourceFacet, statusFacet]} />}
            pagination={<ListPagination controls={tasksControls} meta={tasksQuery.data?.meta} />}
            loading={isInitialLoading}
            loadingText="Loading notification audit"
            trackBy="task_id"
            variant="embedded"
          />
        </Container>

        <Container
          header={
            <Header counter={`(${failuresQuery.data?.meta.total ?? 0})`} variant="h2">
              Failure audit
            </Header>
          }
        >
          <Table
            columnDefinitions={failureColumns}
            empty={<Box color="text-body-secondary">No failed notification jobs have been recorded.</Box>}
            items={failuresQuery.data?.data ?? []}
            filter={<ListFilters controls={failuresControls} label="Search failures" facets={[channelFacet, sourceFacet]} />}
            pagination={<ListPagination controls={failuresControls} meta={failuresQuery.data?.meta} />}
            loading={isInitialLoading}
            loadingText="Loading failure audit"
            trackBy="id"
            variant="embedded"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
