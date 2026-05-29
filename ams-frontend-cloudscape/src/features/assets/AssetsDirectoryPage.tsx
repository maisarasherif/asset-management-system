import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  Modal,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { deleteAsset, getAssetDashboard, listAllAssets } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Asset } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

export function AssetsDirectoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const { isAdmin, selectedAssetId, setSelectedAssetId } = useAuth();
  const [assetPendingDelete, setAssetPendingDelete] = useState<Asset | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["assets", "all"],
    queryFn: listAllAssets,
  });

  const assets = assetsQuery.data || [];
  const assetDashboardQueries = useQueries({
    queries: assets.map((asset) => ({
      queryKey: ["asset-dashboard", asset.asset_id],
      queryFn: () => getAssetDashboard(asset.asset_id),
      staleTime: 60_000,
    })),
  });

  const deleteAssetMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: async (_, deletedAssetId) => {
      const deletedAssetName = assetPendingDelete?.name || "The asset";

      if (selectedAssetId === deletedAssetId) {
        setSelectedAssetId(null);
      }

      setAssetPendingDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.removeQueries({ queryKey: ["asset", deletedAssetId] }),
        queryClient.removeQueries({ queryKey: ["asset-dashboard", deletedAssetId] }),
      ]);
      success("Asset deleted", `${deletedAssetName} has been removed.`);
    },
    onError: (mutationError: Error) => {
      error("Asset delete failed", mutationError.message);
    },
  });

  if (assetsQuery.isLoading) {
    return <PageLoading>{"Loading the assets directory\u2026"}</PageLoading>;
  }

  if (assetsQuery.isError) {
    return (
      <PageError
        description="The assets directory could not be loaded."
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  if (assets.length === 0) {
    return (
      <PageEmpty
        action={isAdmin ? <Button onClick={() => navigate("/assets/new")}>Create asset</Button> : undefined}
        description="Create an asset to start using the asset-first dashboard and workspace."
        title="No assets found"
      />
    );
  }

  return (
    <>
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
            counter={`(${assets.length})`}
            description="Open a specific asset to work inside its component and certificate workspace."
            variant="h2"
          >
            Assets
          </Header>

          <div className="asset-directory-list">
            {assets.map((asset, index) => {
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
                          <Box>{componentCount ?? "\u2026"}</Box>
                        </div>
                        <div className="asset-directory-card__stat">
                          <Box variant="awsui-key-label">Certificates</Box>
                          <Box>{certificateCount ?? "\u2026"}</Box>
                        </div>
                        <div className="asset-directory-card__stat">
                          <Box variant="awsui-key-label">Expiring / expired</Box>
                          <Box>{urgentCount ?? "\u2026"}</Box>
                        </div>
                        <div className="asset-directory-card__stat">
                          <Box variant="awsui-key-label">Routine hours</Box>
                          <Box>
                            {asset.maintenance_interval_hours > 0
                              ? `${asset.working_hours.toLocaleString()} / ${asset.next_maintenance_due_hours.toLocaleString()} h`
                              : "Not configured"}
                          </Box>
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
                          <>
                            <Button onClick={() => navigate(`/assets/${asset.asset_id}/edit`)}>
                              Edit asset
                            </Button>
                            <Button
                              loading={
                                deleteAssetMutation.isPending &&
                                assetPendingDelete?.asset_id === asset.asset_id
                              }
                              onClick={() => setAssetPendingDelete(asset)}
                            >
                              Delete asset
                            </Button>
                          </>
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

      <Modal
        visible={Boolean(assetPendingDelete)}
        header="Delete asset"
        onDismiss={() => setAssetPendingDelete(null)}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setAssetPendingDelete(null)}>Cancel</Button>
            <Button
              loading={deleteAssetMutation.isPending}
              variant="primary"
              onClick={() =>
                assetPendingDelete &&
                deleteAssetMutation.mutate(assetPendingDelete.asset_id)
              }
            >
              Delete asset
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="s">
          <Box>
            Delete <strong>{assetPendingDelete?.name}</strong> from the asset directory?
          </Box>
          <Box color="text-body-secondary">
            This removes the asset record and its workspace data.
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
