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
  listAllHRAdminNotificationFailures,
  listAllHRAdminNotificationTasks,
  runHRAdminReminderScheduler,
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
  const color = sourceType === "hr_admin_compliance_expiry" ? "green" : "grey";
  return <Badge color={color}>{humanizeEnum(sourceType)}</Badge>;
}

function notificationSourceLabel(
  item: Pick<CertificateNotificationTask | CertificateNotificationFailure, "source_display_id" | "source_name">
) {
  return item.source_display_id
    ? `${item.source_display_id} - ${item.source_name}`
    : item.source_name || "-";
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

export function HRAdminSchedulerPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();

  const tasksQuery = useQuery({
    queryKey: ["hr-admin", "scheduler", "notification-tasks", "all"],
    queryFn: listAllHRAdminNotificationTasks,
  });
  const failuresQuery = useQuery({
    queryKey: ["hr-admin", "scheduler", "notification-failures", "all"],
    queryFn: listAllHRAdminNotificationFailures,
  });

  const runMutation = useMutation({
    mutationFn: runHRAdminReminderScheduler,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["hr-admin", "scheduler"] });
      await queryClient.invalidateQueries({ queryKey: ["hr-admin", "renewal-queue"] });
      success(
        "HR/Admin scheduler run completed",
        `${response.processed_records} record${response.processed_records === 1 ? "" : "s"} processed.`
      );
    },
    onError: (mutationError: Error) => {
      error("HR/Admin scheduler run failed", mutationError.message);
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
      header: "Record",
      width: "34%",
      minWidth: 280,
      cell: (item) => <TableCellText title={notificationSourceLabel(item)}>{notificationSourceLabel(item)}</TableCellText>,
      sortingField: "source_name",
    },
    {
      id: "source_type",
      header: "Source type",
      width: 190,
      minWidth: 170,
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
      id: "key",
      header: "Idempotency key",
      width: "22%",
      minWidth: 220,
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
      header: "Record",
      width: "30%",
      minWidth: 260,
      cell: (item) => <TableCellText title={notificationSourceLabel(item)}>{notificationSourceLabel(item)}</TableCellText>,
      sortingField: "source_name",
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
      width: "26%",
      minWidth: 240,
      cell: (item) => <TableCellText title={item.error_message}>{item.error_message}</TableCellText>,
    },
    {
      id: "key",
      header: "Idempotency key",
      width: "22%",
      minWidth: 220,
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
          description="Review HR/Admin reminder jobs, inspect failure history, and run the HR/Admin scheduler manually."
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
              <Button loading={runMutation.isPending} variant="primary" onClick={() => runMutation.mutate()}>
                Run scheduler now
              </Button>
            </SpaceBetween>
          }
        >
          HR/Admin scheduler
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hasLoadError ? (
          <Alert type="error">HR/Admin scheduler data could not be loaded. Refresh the page or try again later.</Alert>
        ) : null}

        <Container
          header={
            <Header counter={`(${tasksQuery.data?.length || 0})`} variant="h2">
              Job audit
            </Header>
          }
        >
          <Table
            columnDefinitions={taskColumns}
            empty={<Box color="text-body-secondary">No HR/Admin reminder jobs have been recorded.</Box>}
            items={tasksQuery.data || []}
            loading={isInitialLoading}
            loadingText="Loading HR/Admin notification audit"
            trackBy="task_id"
            variant="embedded"
          />
        </Container>

        <Container
          header={
            <Header counter={`(${failuresQuery.data?.length || 0})`} variant="h2">
              Failure audit
            </Header>
          }
        >
          <Table
            columnDefinitions={failureColumns}
            empty={<Box color="text-body-secondary">No failed HR/Admin reminder jobs have been recorded.</Box>}
            items={failuresQuery.data || []}
            loading={isInitialLoading}
            loadingText="Loading HR/Admin failure audit"
            trackBy="id"
            variant="embedded"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
