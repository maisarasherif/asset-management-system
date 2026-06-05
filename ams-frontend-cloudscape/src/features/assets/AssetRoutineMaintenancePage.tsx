import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Table,
  Textarea,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  completeAssetRoutineMaintenance,
  getAsset,
  listAssetRoutineMaintenance,
  updateAssetWorkingHours,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Asset, AssetMaintenanceEvent } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

type WorkingHoursDraft = {
  working_hours: string;
  note: string;
};

type CompletionDraft = {
  completion_notes: string;
};

export function AssetRoutineMaintenancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId } = useParams();
  const { isAdmin, setSelectedAssetId } = useAuth();
  const { error, success } = useFlashbar();
  const [hoursModalVisible, setHoursModalVisible] = useState(false);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const maintenanceQuery = useQuery({
    queryKey: ["routine-maintenance", assetId],
    queryFn: () => listAssetRoutineMaintenance(assetId!),
    enabled: Boolean(assetId),
  });

  const updateHoursMutation = useMutation({
    mutationFn: (draft: WorkingHoursDraft) =>
      updateAssetWorkingHours(assetId!, {
        working_hours: Number(draft.working_hours) || 0,
        note: draft.note,
      }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["asset", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
        queryClient.invalidateQueries({ queryKey: ["asset-dashboard", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["routine-maintenance", assetId] }),
      ]);
      setHoursModalVisible(false);
      success(
        response.maintenance_event ? "Routine maintenance required" : "Working hours updated",
        response.maintenance_event
          ? "The asset has reached its routine maintenance target."
          : "The asset working-hours counter has been saved."
      );
    },
    onError: (mutationError: Error) => {
      error("Working hours update failed", mutationError.message);
    },
  });

  const completeMaintenanceMutation = useMutation({
    mutationFn: (draft: CompletionDraft) =>
      completeAssetRoutineMaintenance(assetId!, {
        completion_notes: draft.completion_notes,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["asset", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
        queryClient.invalidateQueries({ queryKey: ["asset-dashboard", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["routine-maintenance", assetId] }),
      ]);
      setCompleteModalVisible(false);
      success("Routine maintenance completed", "The next maintenance target has been scheduled.");
    },
    onError: (mutationError: Error) => {
      error("Maintenance completion failed", mutationError.message);
    },
  });

  useEffect(() => {
    setSelectedAssetId(assetId ?? null);
  }, [assetId, setSelectedAssetId]);

  if (!assetId) {
    return <PageError description="The asset route is missing." title="Invalid route" />;
  }

  if (assetQuery.isLoading || maintenanceQuery.isLoading) {
    return <PageLoading>{"Loading routine maintenance\u2026"}</PageLoading>;
  }

  if (assetQuery.isError || maintenanceQuery.isError || !assetQuery.data) {
    return (
      <PageError
        description="Routine maintenance could not be loaded for this asset."
        onRetry={() => {
          void assetQuery.refetch();
          void maintenanceQuery.refetch();
        }}
      />
    );
  }

  const asset = assetQuery.data;
  const maintenanceEvents = maintenanceQuery.data || [];
  const openMaintenanceEvent =
    maintenanceEvents.find((event) => event.status === "REQUIRED") ?? null;
  const maintenanceConfigured = asset.maintenance_interval_hours > 0;
  const maintenanceRemaining = maintenanceConfigured
    ? asset.next_maintenance_due_hours - asset.working_hours
    : 0;
  const openNotificationFailures =
    openMaintenanceEvent?.notifications.filter(
      (notification) => notification.status === "FAILED" && notification.error_message
    ) ?? [];

  const maintenanceColumns: TableProps<AssetMaintenanceEvent>["columnDefinitions"] = [
    {
      id: "event",
      header: "Event",
      cell: (item) => item.display_id,
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusIndicator type={item.status === "REQUIRED" ? "warning" : "success"}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
    {
      id: "hours",
      header: "Hours",
      cell: (item) =>
        `${item.triggered_at_hours.toLocaleString()} / ${item.due_at_hours.toLocaleString()} h`,
    },
    {
      id: "notifications",
      header: "Notifications",
      cell: (item) => <NotificationDeliveryStatuses event={item} />,
    },
    {
      id: "completed",
      header: "Completed",
      cell: (item) => formatDate(item.completed_at),
    },
  ];

  return renderAssetRoutineMaintenancePage({
    asset,
    assetId,
    completeModalVisible,
    completePending: completeMaintenanceMutation.isPending,
    hoursModalVisible,
    isAdmin,
    maintenanceColumns,
    maintenanceConfigured,
    maintenanceEvents,
    maintenanceLoading: maintenanceQuery.isLoading,
    maintenanceRemaining,
    navigate,
    onCloseCompleteModal: () => setCompleteModalVisible(false),
    onCloseHoursModal: () => setHoursModalVisible(false),
    onCompleteMaintenance: (draft) => completeMaintenanceMutation.mutate(draft),
    onOpenCompleteModal: () => setCompleteModalVisible(true),
    onOpenHoursModal: () => setHoursModalVisible(true),
    onUpdateHours: (draft) => updateHoursMutation.mutate(draft),
    openMaintenanceEvent,
    openNotificationFailures,
    updateHoursPending: updateHoursMutation.isPending,
  });
}

interface AssetRoutineMaintenanceViewProps {
  asset: Asset;
  assetId: string;
  completeModalVisible: boolean;
  completePending: boolean;
  hoursModalVisible: boolean;
  isAdmin: boolean;
  maintenanceColumns: TableProps<AssetMaintenanceEvent>["columnDefinitions"];
  maintenanceConfigured: boolean;
  maintenanceEvents: AssetMaintenanceEvent[];
  maintenanceLoading: boolean;
  maintenanceRemaining: number;
  navigate: ReturnType<typeof useNavigate>;
  onCloseCompleteModal: () => void;
  onCloseHoursModal: () => void;
  onCompleteMaintenance: (draft: CompletionDraft) => void;
  onOpenCompleteModal: () => void;
  onOpenHoursModal: () => void;
  onUpdateHours: (draft: WorkingHoursDraft) => void;
  openMaintenanceEvent: AssetMaintenanceEvent | null;
  openNotificationFailures: AssetMaintenanceEvent["notifications"];
  updateHoursPending: boolean;
}

interface WorkingHoursModalProps {
  asset: Asset;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (draft: WorkingHoursDraft) => void;
  visible: boolean;
}

function WorkingHoursModal({ asset, loading, onDismiss, onSubmit, visible }: WorkingHoursModalProps) {
  const [draft, setDraft] = useState<WorkingHoursDraft>({
    working_hours: String(asset.working_hours),
    note: "",
  });

  return (
    <Modal
      visible={visible}
      header="Update working hours"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss}>Cancel</Button>
            <Button loading={loading} variant="primary" onClick={() => onSubmit(draft)}>
              Save hours
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="m">
        <FormField label="Working hours">
          <Input
            inputMode="numeric"
            type="number"
            value={draft.working_hours}
            onChange={({ detail }) =>
              setDraft((current) => ({ ...current, working_hours: detail.value }))
            }
          />
        </FormField>
        <FormField label="Note">
          <Textarea
            rows={4}
            value={draft.note}
            onChange={({ detail }) =>
              setDraft((current) => ({ ...current, note: detail.value }))
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

interface CompletionModalProps {
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (draft: CompletionDraft) => void;
  visible: boolean;
}

function CompletionModal({ loading, onDismiss, onSubmit, visible }: CompletionModalProps) {
  const [draft, setDraft] = useState<CompletionDraft>({ completion_notes: "" });

  return (
    <Modal
      visible={visible}
      header="Complete routine maintenance"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss}>Cancel</Button>
            <Button loading={loading} variant="primary" onClick={() => onSubmit(draft)}>
              Complete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <FormField label="Completion notes">
        <Textarea
          rows={5}
          value={draft.completion_notes}
          onChange={({ detail }) =>
            setDraft((current) => ({ ...current, completion_notes: detail.value }))
          }
        />
      </FormField>
    </Modal>
  );
}

function NotificationDeliveryStatuses({ event }: { event: AssetMaintenanceEvent }) {
  if (event.notifications.length === 0) {
    return <Box color="text-body-secondary">Not queued</Box>;
  }

  return (
    <SpaceBetween direction="vertical" size="xxs">
      {event.notifications.map((notification) => (
        <StatusIndicator
          key={notification.delivery_id}
          type={notificationStatusType(notification.status)}
        >
          {humanizeEnum(notification.channel)}: {humanizeEnum(notification.status)}
        </StatusIndicator>
      ))}
    </SpaceBetween>
  );
}

function notificationStatusType(status: AssetMaintenanceEvent["notifications"][number]["status"]) {
  if (status === "SENT") {
    return "success";
  }
  if (status === "FAILED") {
    return "error";
  }
  return "pending";
}

function renderAssetRoutineMaintenancePage({
  asset,
  assetId,
  completeModalVisible,
  completePending,
  hoursModalVisible,
  isAdmin,
  maintenanceColumns,
  maintenanceConfigured,
  maintenanceEvents,
  maintenanceLoading,
  maintenanceRemaining,
  navigate,
  onCloseCompleteModal,
  onCloseHoursModal,
  onCompleteMaintenance,
  onOpenCompleteModal,
  onOpenHoursModal,
  onUpdateHours,
  openMaintenanceEvent,
  openNotificationFailures,
  updateHoursPending,
}: AssetRoutineMaintenanceViewProps) {
  return (
    <>
      <ContentLayout
        header={
          <Header
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => navigate(`/assets/${assetId}`)}>Open asset workspace</Button>
                {isAdmin ? (
                  <Button onClick={() => navigate(`/assets/${assetId}/edit`)}>
                    Edit maintenance interval
                  </Button>
                ) : null}
                {isAdmin ? <Button onClick={onOpenHoursModal}>Update hours</Button> : null}
                {isAdmin && openMaintenanceEvent ? (
                  <Button variant="primary" onClick={onOpenCompleteModal}>
                    Complete maintenance
                  </Button>
                ) : null}
              </SpaceBetween>
            }
            description={`${asset.display_id} - ${asset.location || "No location set"}`}
            variant="h1"
          >
            Routine maintenance
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <Container>
            <div className="asset-context-strip">
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Asset</Box>
                <Box>{asset.name}</Box>
              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Asset status</Box>
                <StatusIndicator type={assetStatusType(asset.status)}>
                  {humanizeEnum(asset.status)}
                </StatusIndicator>
              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Maintenance state</Box>
                {openMaintenanceEvent ? (
                  <StatusIndicator type="warning">Required</StatusIndicator>
                ) : maintenanceConfigured ? (
                  <StatusIndicator type="success">On schedule</StatusIndicator>
                ) : (
                  <StatusIndicator type="info">Not configured</StatusIndicator>
                )}
              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Project</Box>
                <Box>{asset.assigned_project || "Not set"}</Box>
              </div>
            </div>
          </Container>

          <Container header={<Header variant="h2">Working hours</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <div className="summary-row">
                <Box variant="awsui-key-label">Current counter</Box>
                <Box>{asset.working_hours.toLocaleString()} h</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Interval</Box>
                <Box>
                  {maintenanceConfigured
                    ? `${asset.maintenance_interval_hours.toLocaleString()} h`
                    : "Not configured"}
                </Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Next due</Box>
                <Box>
                  {maintenanceConfigured
                    ? `${asset.next_maintenance_due_hours.toLocaleString()} h`
                    : "Not configured"}
                </Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Remaining</Box>
                <Box>
                  {maintenanceConfigured
                    ? `${Math.max(maintenanceRemaining, 0).toLocaleString()} h`
                    : "Not configured"}
                </Box>
              </div>
            </ColumnLayout>
          </Container>

          {openMaintenanceEvent ? (
            <Alert
              action={
                isAdmin ? (
                  <Button onClick={onOpenCompleteModal}>Complete maintenance</Button>
                ) : undefined
              }
              type="warning"
            >
              Routine maintenance is required. The asset reached{" "}
              {openMaintenanceEvent.triggered_at_hours.toLocaleString()} working hours against a{" "}
              {openMaintenanceEvent.due_at_hours.toLocaleString()} hour target.
            </Alert>
          ) : null}

          {openNotificationFailures.length > 0 ? (
            <Alert type="warning">
              Notification issue:{" "}
              {openNotificationFailures
                .map(
                  (notification) =>
                    `${humanizeEnum(notification.channel)}: ${notification.error_message}`
                )
                .join("; ")}
            </Alert>
          ) : null}

          <Container
            header={
              <Header
                counter={`(${maintenanceEvents.length})`}
                description="Routine maintenance history for this asset."
                variant="h2"
              >
                Maintenance history
              </Header>
            }
          >
            <Table
              columnDefinitions={maintenanceColumns}
              empty={
                <Box color="text-body-secondary">
                  No routine maintenance events have been recorded yet.
                </Box>
              }
              items={maintenanceEvents}
              loading={maintenanceLoading}
              loadingText="Loading routine maintenance"
              trackBy="maintenance_event_id"
              variant="embedded"
            />
          </Container>
        </SpaceBetween>
      </ContentLayout>

      <WorkingHoursModal
        key={`working-hours-${hoursModalVisible ? "open" : "closed"}-${asset.working_hours}`}
        asset={asset}
        loading={updateHoursPending}
        onDismiss={onCloseHoursModal}
        onSubmit={onUpdateHours}
        visible={hoursModalVisible}
      />

      <CompletionModal
        key={`completion-${completeModalVisible ? "open" : "closed"}-${openMaintenanceEvent?.maintenance_event_id || "none"}`}
        loading={completePending}
        onDismiss={onCloseCompleteModal}
        onSubmit={onCompleteMaintenance}
        visible={completeModalVisible}
      />
    </>
  );
}
