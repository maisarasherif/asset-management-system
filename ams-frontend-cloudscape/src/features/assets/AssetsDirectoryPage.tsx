import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { getAssetDashboard, listAllAssets } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

export function AssetsDirectoryPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const assetsQuery = useQuery({
    queryKey: ["assets", "all"],
    queryFn: listAllAssets,
  });

  if (assetsQuery.isLoading) {
    return <PageLoading>Loading the assets directory...</PageLoading>;
  }

  if (assetsQuery.isError) {
    return (
      <PageError
        description="The assets directory could not be loaded."
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  if (!assetsQuery.data || assetsQuery.data.length === 0) {
    return (
      <PageEmpty
        action={isAdmin ? <Button onClick={() => navigate("/assets/new")}>Create asset</Button> : undefined}
        description="Create an asset to start using the asset-first dashboard and workspace."
        title="No assets found"
      />
    );
  }

  const assetDashboardQueries = useQueries({
    queries: assetsQuery.data.map((asset) => ({
      queryKey: ["asset-dashboard", asset.asset_id],
      queryFn: () => getAssetDashboard(asset.asset_id),
      staleTime: 60_000,
    })),
  });

  return (
    <ContentLayout
      header={
        <Header
          actions={
            isAdmin ? (
              <Button variant="primary" onClick={() => navigate("/assets/new")}>
                Create asset
              </Button>
            ) : undefined
          }
          description="Asset roster and admin management page for selecting or creating operational workspaces."
          variant="h1"
        >
          Assets directory
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Header
          counter={`(${assetsQuery.data.length})`}
          description="Open a specific asset to work inside its component and certificate workspace."
          variant="h2"
        >
          Assets
        </Header>

        <div className="asset-directory-list">
          {assetsQuery.data.map((asset, index) => {
            const dashboardQuery = assetDashboardQueries[index];
            const statusCounts = dashboardQuery.data?.statusCounts;
            const componentCount = dashboardQuery.data?.components.length;
            const certificateCount = dashboardQuery.data?.certificates.length;
            const urgentCount = statusCounts
              ? statusCounts.expired + statusCounts.expiringSoon
              : undefined;

            return (
              <Container key={asset.asset_id}>
                <div className="asset-directory-card">
                  <div className="asset-directory-card__media">
                    {asset.photo ? (
                      <img
                        alt={`${asset.name} asset`}
                        className="asset-directory-card__image"
                        src={asset.photo}
                      />
                    ) : (
                      <div className="asset-directory-card__placeholder">
                        <Box fontWeight="bold">No photo</Box>
                        <Box color="text-body-secondary">Photo appears here once the asset record has one.</Box>
                      </div>
                    )}
                  </div>

                  <div className="asset-directory-card__content">
                    <div className="asset-directory-card__header">
                      <div>
                        <RouterLink to={`/assets/${asset.asset_id}`}>
                          {asset.name}
                        </RouterLink>
                        <Box color="text-body-secondary">{asset.display_id}</Box>
                      </div>
                      <StatusIndicator type={assetStatusType(asset.status)}>
                        {humanizeEnum(asset.status)}
                      </StatusIndicator>
                    </div>

                    <div className="asset-directory-card__meta">
                      <div className="asset-directory-card__meta-item">
                        <Box variant="awsui-key-label">Assigned project</Box>
                        <Box>{asset.assigned_project || "Not set"}</Box>
                      </div>
                      <div className="asset-directory-card__meta-item">
                        <Box variant="awsui-key-label">Location</Box>
                        <Box>{asset.location || "Not set"}</Box>
                      </div>
                      <div className="asset-directory-card__meta-item">
                        <Box variant="awsui-key-label">Updated</Box>
                        <Box>{formatDate(asset.updated_at)}</Box>
                      </div>
                    </div>

                    <div className="asset-directory-card__summary">
                      <div className="asset-directory-card__stat">
                        <Box variant="awsui-key-label">Components</Box>
                        <Box>{componentCount ?? "..."}</Box>
                      </div>
                      <div className="asset-directory-card__stat">
                        <Box variant="awsui-key-label">Certificates</Box>
                        <Box>{certificateCount ?? "..."}</Box>
                      </div>
                      <div className="asset-directory-card__stat">
                        <Box variant="awsui-key-label">Expiring / expired</Box>
                        <Box>{urgentCount ?? "..."}</Box>
                      </div>
                    </div>

                    <Box color="text-body-secondary">
                      {asset.description || "No asset description is available yet."}
                    </Box>

                    <div className="asset-directory-card__actions">
                      <Button variant="primary" onClick={() => navigate(`/assets/${asset.asset_id}`)}>
                        Open workspace
                      </Button>
                      {isAdmin ? (
                        <Button onClick={() => navigate(`/assets/${asset.asset_id}/edit`)}>
                          Edit asset
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Container>
            );
          })}
        </div>
      </SpaceBetween>

      <Box color="text-body-secondary" margin={{ top: "s" }}>
        Standalone component and certificate pages are intentionally removed. Operational work continues from each asset workspace.
      </Box>
    </ContentLayout>
  );
}
