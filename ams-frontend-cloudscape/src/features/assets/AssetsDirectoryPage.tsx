import { ListFilters, ListPagination, TextFacet } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
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
import { deleteAsset, getAssetCertificateSummary, listAssets } from "../../lib/api/ams";
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

  const controls = useListControls("", ["status", "project"]);
  const assetsQuery = useQuery({
    queryKey: ["assets", controls.query],
    queryFn: () => listAssets(controls.page, controls.query.limit, controls.query),
  });

  const assets = assetsQuery.data?.data ?? [];
  const assetDashboardQueries = useQueries({
    queries: assets.map((asset) => ({
      queryKey: ["asset-certificate-summary", asset.asset_id],
      queryFn: () => getAssetCertificateSummary(asset.asset_id),
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
        queryClient.removeQueries({ queryKey: ["asset-certificate-summary", deletedAssetId] }),
      ]);
      success("Asset deleted", `${deletedAssetName} has been removed.`);
    },
    onError: (mutationError: Error) => {
      error("Asset delete failed", mutationError.message);
    },
  });

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
            counter={`(${assetsQuery.data?.meta.total ?? 0})`}
            description="Open a specific asset to work inside its component and certificate workspace."
            variant="h2"
          >
            Assets
          </Header>

          <ListFilters controls={controls} label="Search assets" facets={[{ key: "status", label: "Status", options: [
            { value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" },
            { value: "MAINTENANCE", label: "Maintenance" },
          ] }]}>
            <TextFacet key={controls.filters.project} label="Project" value={controls.filters.project}
              onApply={(project) => controls.setFilters({ project })} />
          </ListFilters>
          {assetsQuery.isPending && <PageLoading>Loading assets…</PageLoading>}
          {assetsQuery.isError && <PageError description="Assets could not be loaded." onRetry={() => void assetsQuery.refetch()} />}
          {assetsQuery.isSuccess && assets.length === 0 && <PageEmpty title="No assets found" description="No assets match this view." />}
          <div className="asset-directory-list">
            {assets.map((asset, index) => {
              const dashboardQuery = assetDashboardQueries[index];
              const summary = dashboardQuery.data;
              const componentCount = summary?.all_components;
              const certificateCount = summary?.certificate_count;
              const urgentCount = summary ? summary.expired + summary.expiring_soon : undefined;

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
                          <Box>{asset.assigned_project || "No project - warehouse"}</Box>
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
          <ListPagination controls={controls} meta={assetsQuery.data?.meta} />
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
