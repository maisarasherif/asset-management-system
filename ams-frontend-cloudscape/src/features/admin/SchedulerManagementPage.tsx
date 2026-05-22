import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  ContentLayout,
  FormField,
  Header,
  Modal,
  Select,
  SpaceBetween,
  Table,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  forceRenotifyCertificate,
  listAllCertificateNotificationFailures,
  listAllCertificateNotificationTasks,
  listAllCertificatesWithContext,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  CertificateNotificationFailure,
  CertificateNotificationTask,
  CertificateWithContext,
  NotificationStatus,
  NotificationTier,
} from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

function statusBadge(status: NotificationStatus) {
  const color = status === "SENT" ? "green" : status === "FAILED" ? "red" : "blue";
  return <Badge color={color}>{humanizeEnum(status)}</Badge>;
}

function tierBadge(tier: NotificationTier) {
  if (tier === "expired") {
    return <Badge color="red">Expired</Badge>;
  }
  return <Badge color="blue">{tier}</Badge>;
}

function certificateLabel(certificate: Pick<CertificateWithContext, "certificate_display_id" | "certificate_name" | "asset_display_id" | "asset_name">) {
  return `${certificate.certificate_display_id} - ${certificate.certificate_name}`;
}

function certificateDescription(certificate: Pick<CertificateWithContext, "asset_display_id" | "asset_name" | "component_name" | "expiry_date">) {
  const expiry = certificate.expiry_date ? formatDateTime(certificate.expiry_date) : "No expiry date";
  return `${certificate.asset_display_id} - ${certificate.asset_name} / ${certificate.component_name} / ${expiry}`;
}

function copyableKey(key: string) {
  return (
    <Box fontSize="body-s" color="text-body-secondary">
      <code>{key}</code>
    </Box>
  );
}

export function SchedulerManagementPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const certificatesQuery = useQuery({
    queryKey: ["certificates-with-context", "all"],
    queryFn: listAllCertificatesWithContext,
  });
  const tasksQuery = useQuery({
    queryKey: ["certificate-notification-tasks", "all"],
    queryFn: listAllCertificateNotificationTasks,
  });
  const failuresQuery = useQuery({
    queryKey: ["certificate-notification-failures", "all"],
    queryFn: listAllCertificateNotificationFailures,
  });

  const certificateOptions = useMemo<SelectProps.Option[]>(
    () =>
      (certificatesQuery.data || []).map((certificate) => ({
        label: certificateLabel(certificate),
        value: certificate.certificate_id,
        description: certificateDescription(certificate),
      })),
    [certificatesQuery.data]
  );

  const selectedCertificate = useMemo(
    () =>
      (certificatesQuery.data || []).find(
        (certificate) => certificate.certificate_id === selectedCertificateId
      ) || null,
    [certificatesQuery.data, selectedCertificateId]
  );
  const selectedOption =
    certificateOptions.find((option) => option.value === selectedCertificateId) ?? null;

  const resetMutation = useMutation({
    mutationFn: forceRenotifyCertificate,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["certificate-notification-tasks"] });
      setConfirmReset(false);
      success(
        "Notification history cleared",
        `${response.cleared_tasks} notification slot${response.cleared_tasks === 1 ? "" : "s"} cleared.`
      );
    },
    onError: (mutationError: Error) => {
      error("Reset failed", mutationError.message);
    },
  });

  const taskColumns: TableProps<CertificateNotificationTask>["columnDefinitions"] = [
    {
      id: "sent_at",
      header: "Recorded",
      cell: (item) => formatDateTime(item.sent_at),
      sortingField: "sent_at",
    },
    {
      id: "certificate",
      header: "Certificate",
      cell: (item) => (
        <SpaceBetween size="xxs">
          <Box>{item.certificate_display_id} - {item.certificate_name}</Box>
          <Box color="text-body-secondary">{item.asset_display_id} - {item.asset_name}</Box>
        </SpaceBetween>
      ),
      sortingField: "certificate_name",
    },
    {
      id: "channel",
      header: "Channel",
      cell: (item) => humanizeEnum(item.type),
      sortingField: "type",
    },
    {
      id: "tier",
      header: "Tier",
      cell: (item) => tierBadge(item.tier),
      sortingField: "tier",
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => statusBadge(item.status),
      sortingField: "status",
    },
    {
      id: "external",
      header: "External task",
      cell: (item) => item.external_task_id || "-",
    },
    {
      id: "key",
      header: "Idempotency key",
      cell: (item) => copyableKey(item.idempotency_key),
    },
  ];

  const failureColumns: TableProps<CertificateNotificationFailure>["columnDefinitions"] = [
    {
      id: "failed_at",
      header: "Failed",
      cell: (item) => formatDateTime(item.failed_at),
      sortingField: "failed_at",
    },
    {
      id: "certificate",
      header: "Certificate",
      cell: (item) => (
        <SpaceBetween size="xxs">
          <Box>{item.certificate_display_id} - {item.certificate_name}</Box>
          <Box color="text-body-secondary">{item.asset_display_id} - {item.asset_name}</Box>
        </SpaceBetween>
      ),
      sortingField: "certificate_name",
    },
    {
      id: "channel",
      header: "Channel",
      cell: (item) => humanizeEnum(item.channel),
      sortingField: "channel",
    },
    {
      id: "tier",
      header: "Tier",
      cell: (item) => tierBadge(item.tier),
      sortingField: "tier",
    },
    {
      id: "error",
      header: "Error",
      cell: (item) => item.error_message,
    },
    {
      id: "key",
      header: "Idempotency key",
      cell: (item) => copyableKey(item.idempotency_key),
    },
  ];

  const isInitialLoading =
    certificatesQuery.isLoading || tasksQuery.isLoading || failuresQuery.isLoading;
  const hasLoadError = certificatesQuery.isError || tasksQuery.isError || failuresQuery.isError;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Review certificate notification slots, inspect failure history, and clear a certificate's expiry notification history."
          actions={
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
            <Header
              variant="h2"
              actions={
                <Button
                  variant="primary"
                  disabled={!selectedCertificateId}
                  onClick={() => setConfirmReset(true)}
                >
                  Clear notification history
                </Button>
              }
            >
              Force re-notify
            </Header>
          }
        >
          <SpaceBetween size="m">
            <FormField
              label="Certificate"
              description="Clearing history removes successful notification slots for the selected certificate. The next scheduler run can send the matching expiry-tier notifications again."
              stretch
            >
              <Select
                ariaLabel="Select certificate"
                disabled={certificatesQuery.isLoading || certificateOptions.length === 0}
                loadingText="Loading certificates"
                options={certificateOptions}
                placeholder="Select a certificate"
                selectedOption={selectedOption}
                statusType={certificatesQuery.isLoading ? "loading" : "finished"}
                onChange={({ detail }) => setSelectedCertificateId(detail.selectedOption.value || "")}
              />
            </FormField>
            {selectedCertificate ? (
              <Box color="text-body-secondary">
                {certificateDescription(selectedCertificate)}
              </Box>
            ) : null}
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header counter={`(${tasksQuery.data?.length || 0})`} variant="h2">
              Notification audit
            </Header>
          }
        >
          <Table
            columnDefinitions={taskColumns}
            empty={<Box color="text-body-secondary">No certificate notification slots have been recorded.</Box>}
            items={tasksQuery.data || []}
            loading={isInitialLoading}
            loadingText="Loading notification audit"
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
            empty={<Box color="text-body-secondary">No failed certificate notifications have been recorded.</Box>}
            items={failuresQuery.data || []}
            loading={isInitialLoading}
            loadingText="Loading failure audit"
            trackBy="id"
            variant="embedded"
          />
        </Container>
      </SpaceBetween>

      <Modal
        visible={confirmReset}
        header="Clear notification history"
        onDismiss={() => setConfirmReset(false)}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              loading={resetMutation.isPending}
              variant="primary"
              onClick={() => selectedCertificateId && resetMutation.mutate(selectedCertificateId)}
            >
              Clear history
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="s">
          <Box>
            {selectedCertificate
              ? certificateLabel(selectedCertificate)
              : "The selected certificate"} will be eligible for notification again on the next scheduler run.
          </Box>
          <Alert type="warning">
            Failure audit rows are preserved for troubleshooting. Only certificate notification slots are cleared.
          </Alert>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}
