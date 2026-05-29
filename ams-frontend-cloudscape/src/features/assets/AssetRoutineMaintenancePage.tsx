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

export function AssetRoutineMaintenancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId } = useParams();
  const { isAdmin, setSelectedAssetId } = useAuth();
  const { error, success } = useFlashbar();
  const [hoursModalVisible, setHoursModalVisible] = useState(false);
  const [hoursDraft, setHoursDraft] = useState("");
  const [hoursNote, setHoursNote] = useState("");
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");

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
    mutationFn: () =>
      updateAssetWorkingHours(assetId!, {
        working_hours: Number(hoursDraft) || 0,
        note: hoursNote,
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
      setHoursNote("");
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
    mutationFn: () =>
      completeAssetRoutineMaintenance(assetId!, {
        completion_notes: completionNotes,
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
      setCompletionNotes("");
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
      id: "notified",
      header: "Notified",
      cell: (item) => formatDate(item.notified_at),
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
    completionNotes,
    hoursDraft,
    hoursModalVisible,
    hoursNote,
    isAdmin,
    maintenanceColumns,
    maintenanceConfigured,
    maintenanceEvents,
    maintenanceLoading: maintenanceQuery.isLoading,
    maintenanceRemaining,
    navigate,
    onCloseCompleteModal: () => setCompleteModalVisible(false),
    onCloseHoursModal: () => setHoursModalVisible(false),
    onCompleteMaintenance: () => completeMaintenanceMutation.mutate(),
    onCompletionNotesChange: setCompletionNotes,
    onHoursChange: setHoursDraft,
    onHoursNoteChange: setHoursNote,
    onOpenCompleteModal: () => setCompleteModalVisible(true),
    onOpenHoursModal: () => {
      setHoursDraft(String(asset.working_hours));
      setHoursNote("");
      setHoursModalVisible(true);
    },
    onUpdateHours: () => updateHoursMutation.mutate(),
    openMaintenanceEvent,
    updateHoursPending: updateHoursMutation.isPending,
  });
}

interface AssetRoutineMaintenanceViewProps {
  asset: Asset;
  assetId: string;
  completeModalVisible: boolean;
  completePending: boolean;
  completionNotes: string;
  hoursDraft: string;
  hoursModalVisible: boolean;
  hoursNote: string;
  isAdmin: boolean;
  maintenanceColumns: TableProps<AssetMaintenanceEvent>["columnDefinitions"];
  maintenanceConfigured: boolean;
  maintenanceEvents: AssetMaintenanceEvent[];
  maintenanceLoading: boolean;
  maintenanceRemaining: number;
  navigate: ReturnType<typeof useNavigate>;
  onCloseCompleteModal: () => void;
  onCloseHoursModal: () => void;
  onCompleteMaintenance: () => void;
  onCompletionNotesChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onHoursNoteChange: (value: string) => void;
  onOpenCompleteModal: () => void;
  onOpenHoursModal: () => void;
  onUpdateHours: () => void;
  openMaintenanceEvent: AssetMaintenanceEvent | null;
  updateHoursPending: boolean;
}

function renderAssetRoutineMaintenancePage({
  asset,
  assetId,
  completeModalVisible,
  completePending,
  completionNotes,
  hoursDraft,
  hoursModalVisible,
  hoursNote,
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
  onCompletionNotesChange,
  onHoursChange,
  onHoursNoteChange,
  onOpenCompleteModal,
  onOpenHoursModal,
  onUpdateHours,
  openMaintenanceEvent,
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

          {openMaintenanceEvent?.notification_error ? (
            <Alert type="warning">
              Notification issue: {openMaintenanceEvent.notification_error}
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

      <Modal
        visible={hoursModalVisible}
        header="Update working hours"
        onDismiss={onCloseHoursModal}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={onCloseHoursModal}>Cancel</Button>
              <Button loading={updateHoursPending} variant="primary" onClick={onUpdateHours}>
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
              value={hoursDraft}
              onChange={({ detail }) => onHoursChange(detail.value)}
            />
          </FormField>
          <FormField label="Note">
            <Textarea
              rows={4}
              value={hoursNote}
              onChange={({ detail }) => onHoursNoteChange(detail.value)}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={completeModalVisible}
        header="Complete routine maintenance"
        onDismiss={onCloseCompleteModal}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={onCloseCompleteModal}>Cancel</Button>
              <Button loading={completePending} variant="primary" onClick={onCompleteMaintenance}>
                Complete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Completion notes">
          <Textarea
            rows={5}
            value={completionNotes}
            onChange={({ detail }) => onCompletionNotesChange(detail.value)}
          />
        </FormField>
      </Modal>
    </>
  );
}
