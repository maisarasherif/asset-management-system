import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { CertificateDonut } from "../../components/shared/CertificateDonut";
import { RouterLink } from "../../components/shared/RouterLink";
import { TableCellText } from "../../components/shared/TableCells";
import {
  getAssetComponentCertificateSheet,
  getAssetDashboard,
  listAllAssets,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { AssetDashboardData } from "../../types/ams";
import { formatDate, formatDateTime, humanizeEnum } from "../../utils/format";
import { assetStatusType, certificateStatusType } from "../../utils/status";

type DashboardCertificate = AssetDashboardData["certificates"][number];

function filenameSegment(value: string | null | undefined) {
  return (value || "asset")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { isAdmin, selectedAssetId, setSelectedAssetId } = useAuth();
  const { error } = useFlashbar();

  const assetsQuery = useQuery({
    queryKey: ["assets", "all"],
    queryFn: listAllAssets,
  });

  useEffect(() => {
    if (!selectedAssetId && assetsQuery.data && assetsQuery.data.length > 0) {
      setSelectedAssetId(assetsQuery.data[0].asset_id);
    }
  }, [assetsQuery.data, selectedAssetId, setSelectedAssetId]);

  const activeAssetId = selectedAssetId ?? assetsQuery.data?.[0]?.asset_id ?? null;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", activeAssetId],
    queryFn: () => getAssetDashboard(activeAssetId!),
    enabled: Boolean(activeAssetId),
  });

  const trackerMutation = useMutation({
    mutationFn: () => getAssetComponentCertificateSheet(activeAssetId!),
    onSuccess: (blob) => {
      const assetSegment = filenameSegment(dashboardQuery.data?.asset.display_id || activeAssetId);
      downloadBlob(blob, `asset-${assetSegment}-certification-tracker.pdf`);
    },
    onError: (mutationError: Error) => {
      error("Download failed", mutationError.message);
    },
  });

  if (assetsQuery.isLoading || (activeAssetId && dashboardQuery.isLoading)) {
    return <PageLoading>{"Loading the selected asset dashboard\u2026"}</PageLoading>;
  }

  if (assetsQuery.isError) {
    return (
      <PageError
        description="The app could not load the asset roster for the dashboard."
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  if (!assetsQuery.data || assetsQuery.data.length === 0) {
    return (
      <PageEmpty
        action={isAdmin ? <Button onClick={() => navigate("/assets/new")}>Create asset</Button> : undefined}
        description="Add an asset first so the dashboard has a selected asset to summarize."
        title="No assets available"
      />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <PageError
        description="The selected asset dashboard could not be loaded."
        onRetry={() => void dashboardQuery.refetch()}
      />
    );
  }

  const dashboard = dashboardQuery.data;
  const urgentColumns: TableProps<DashboardCertificate>["columnDefinitions"] = [
    {
      id: "certificate",
      header: "Certificate",
      width: "34%",
      minWidth: 240,
      cell: (item) => (
        <TableCellText title={item.certificate_name}>
          <RouterLink
            to={`/assets/${dashboard.asset.asset_id}/components/${item.component_id}/certificates/${item.certificate_id}`}
          >
            {item.certificate_name}
          </RouterLink>
        </TableCellText>
      ),
    },
    {
      id: "component",
      header: "Component",
      width: "30%",
      minWidth: 220,
      cell: (item) => <TableCellText title={item.component_name}>{item.component_name}</TableCellText>,
    },
    {
      id: "expiry",
      header: "Expiry",
      width: 140,
      minWidth: 130,
      cell: (item) => formatDate(item.expiry_date),
    },
    {
      id: "status",
      header: "Status",
      width: 150,
      minWidth: 140,
      cell: (item) => (
        <StatusIndicator type={certificateStatusType(item.status)}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
  ];
  const latestColumns: TableProps<DashboardCertificate>["columnDefinitions"] = [
    {
      id: "name",
      header: "Certificate",
      width: "28%",
      minWidth: 220,
      cell: (item) => <TableCellText title={item.certificate_name}>{item.certificate_name}</TableCellText>,
    },
    {
      id: "component",
      header: "Component",
      width: "24%",
      minWidth: 200,
      cell: (item) => <TableCellText title={item.component_name}>{item.component_name}</TableCellText>,
    },
    {
      id: "issue",
      header: "Issue date",
      width: 130,
      minWidth: 120,
      cell: (item) => formatDate(item.issue_date),
    },
    {
      id: "expiry",
      header: "Expiry date",
      width: 130,
      minWidth: 120,
      cell: (item) => formatDate(item.expiry_date),
    },
    {
      id: "authority",
      header: "Issuing authority",
      width: "24%",
      minWidth: 200,
      cell: (item) => (
        <TableCellText title={item.issuing_authority || "Not set"}>
          {item.issuing_authority || "Not set"}
        </TableCellText>
      ),
    },
  ];

  const componentCount =
    dashboard.asset.asset_kind === "SINGLE_EQUIPMENT"
      ? 1
      : dashboard.components.filter((component) => component.component_kind !== "SELF").length;
  const maintenanceConfigured = dashboard.asset.maintenance_interval_hours > 0;
  const maintenanceRequired =
    Boolean(dashboard.asset.maintenance_required_at) ||
    (maintenanceConfigured &&
      dashboard.asset.working_hours >= dashboard.asset.next_maintenance_due_hours);
  const maintenanceRemaining = maintenanceConfigured
    ? dashboard.asset.next_maintenance_due_hours - dashboard.asset.working_hours
    : 0;

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate(`/assets/${dashboard.asset.asset_id}`)}>
                Open asset workspace
              </Button>
              <Button
                loading={trackerMutation.isPending}
                onClick={() => trackerMutation.mutate()}
              >
                Download Certification Tracker
              </Button>
              {isAdmin ? (
                <Button
                  variant="primary"
                  onClick={() => navigate(`/assets/${dashboard.asset.asset_id}/edit`)}
                >
                  Edit asset
                </Button>
              ) : null}
            </SpaceBetween>
          }
          description={`${dashboard.asset.display_id} - ${dashboard.asset.location || "No location set"}`}
          variant="h1"
        >
          {dashboard.asset.name}
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <div className="dashboard-top-grid">
          <Container header={<Header variant="h2">Certificate status</Header>}>
            <CertificateDonut
              expired={dashboard.statusCounts.expired}
              expiringSoon={dashboard.statusCounts.expiringSoon}
              valid={dashboard.statusCounts.valid}
            />
          </Container>
          <Container header={<Header variant="h2">Asset details</Header>}>
            <SpaceBetween direction="vertical" size="xs">
              <div className="summary-row">
                <Box variant="awsui-key-label">Status</Box>
                <StatusIndicator type={assetStatusType(dashboard.asset.status)}>
                  {humanizeEnum(dashboard.asset.status)}
                </StatusIndicator>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Assigned project</Box>
                <Box>{dashboard.asset.assigned_project || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Location</Box>
                <Box>{dashboard.asset.location || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Datasheet</Box>
                <Button
                  disabled={!dashboard.asset.datasheet}
                  href={dashboard.asset.datasheet || undefined}
                  target="_blank"
                >
                  Open datasheet
                </Button>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Components</Box>
                <Box>{componentCount}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Routine maintenance</Box>
                {maintenanceRequired ? (
                  <StatusIndicator type="warning">Required</StatusIndicator>
                ) : maintenanceConfigured ? (
                  <StatusIndicator type="success">On schedule</StatusIndicator>
                ) : (
                  <StatusIndicator type="info">Not configured</StatusIndicator>
                )}
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Working hours</Box>
                <Box>{dashboard.asset.working_hours.toLocaleString()} h</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Interval</Box>
                <Box>
                  {maintenanceConfigured
                    ? `${dashboard.asset.maintenance_interval_hours.toLocaleString()} h`
                    : "Not configured"}
                </Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Next due</Box>
                <Box>
                  {maintenanceConfigured
                    ? `${dashboard.asset.next_maintenance_due_hours.toLocaleString()} h`
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
              <div className="summary-row">
                <Box variant="awsui-key-label">Last maintenance</Box>
                <Box>
                  {dashboard.asset.last_maintenance_completed_at
                    ? `${formatDateTime(dashboard.asset.last_maintenance_completed_at)} at ${dashboard.asset.last_maintenance_completed_hours.toLocaleString()} h`
                    : "No completion recorded"}
                </Box>
              </div>
            </SpaceBetween>
          </Container>
        </div>

        <Container header={<Header variant="h2">Urgent certificates</Header>}>
          <Table
            columnDefinitions={urgentColumns}
            empty={<Box color="text-body-secondary">No urgent certificates for this asset.</Box>}
            items={dashboard.urgentCertificates.slice(0, 8)}
            loading={false}
            variant="embedded"
          />
        </Container>

        <Container header={<Header variant="h2">Latest certificates in this asset</Header>}>
          <Table
            columnDefinitions={latestColumns}
            empty={<Box color="text-body-secondary">No certificate data is available for this asset.</Box>}
            items={dashboard.latestCertificates.slice(0, 8)}
            loading={false}
            variant="embedded"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
