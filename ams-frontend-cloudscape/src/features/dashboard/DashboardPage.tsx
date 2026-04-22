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
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { getAssetDashboard, listAllAssets } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { AssetDashboardData } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { certificateStatusType } from "../../utils/status";
import { CertificateDonut } from "./CertificateDonut";

type DashboardCertificate = AssetDashboardData["certificates"][number];

export function DashboardPage() {
  const navigate = useNavigate();
  const { selectedAssetId, setSelectedAssetId } = useAuth();

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

  if (assetsQuery.isLoading || (activeAssetId && dashboardQuery.isLoading)) {
    return <PageLoading>Loading the selected asset dashboard...</PageLoading>;
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
        action={<Button onClick={() => navigate("/assets/new")}>Create asset</Button>}
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
      cell: (item) => (
        <RouterLink
          to={`/assets/${dashboard.asset.asset_id}/components/${item.component_id}/certificates/${item.certificate_id}`}
        >
          {item.certificate_name}
        </RouterLink>
      ),
    },
    {
      id: "component",
      header: "Component",
      cell: (item) => item.component_name,
    },
    {
      id: "expiry",
      header: "Expiry",
      cell: (item) => formatDate(item.expiry_date),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusIndicator type={certificateStatusType(item.status)}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
  ];
  const latestColumns: TableProps<DashboardCertificate>["columnDefinitions"] = [
    {
      id: "display",
      header: "Display ID",
      cell: (item) => item.display_id,
    },
    {
      id: "name",
      header: "Certificate",
      cell: (item) => item.certificate_name,
    },
    {
      id: "component",
      header: "Component",
      cell: (item) => item.component_name,
    },
    {
      id: "issue",
      header: "Issue date",
      cell: (item) => formatDate(item.issue_date),
    },
    {
      id: "authority",
      header: "Issuing authority",
      cell: (item) => item.issuing_authority || "Not set",
    },
  ];

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
                variant="primary"
                onClick={() => navigate(`/assets/${dashboard.asset.asset_id}/edit`)}
              >
                Edit asset
              </Button>
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
                <StatusIndicator type="info">
                  {humanizeEnum(dashboard.asset.status)}
                </StatusIndicator>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Assigned project</Box>
                <Box>{dashboard.asset.assigned_project || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Datasheet</Box>
                <Box>{dashboard.asset.datasheet ? "Available" : "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Pending certificates</Box>
                <Box>{dashboard.statusCounts.pending}</Box>
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
