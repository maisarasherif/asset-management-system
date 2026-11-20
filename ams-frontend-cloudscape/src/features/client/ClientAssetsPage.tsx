import { ListFilters, ListPagination, TextFacet } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { listClientAssets } from "../../lib/api/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

export function ClientAssetsPage() {
  const navigate = useNavigate();
  const controls = useListControls("", ["status", "project"]);
  const assetsQuery = useQuery({
    queryKey: ["client-assets", controls.query],
    queryFn: () => listClientAssets(controls.page, controls.query.limit, controls.query),
  });

  const assets = assetsQuery.data?.data ?? [];
  return (
    <ContentLayout
      header={
        <Header
          counter={`(${assetsQuery.data?.meta.total ?? 0})`}
          description="Read-only access to assets and certificates assigned to your active projects."
          variant="h1"
        >
          Client asset portal
        </Header>
      }
    >
      <ListFilters controls={controls} label="Search assets" facets={[{ key: "status", label: "Status", options: [
        { value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" },
        { value: "MAINTENANCE", label: "Maintenance" },
      ] }]}>
        <TextFacet key={controls.filters.project} label="Project" value={controls.filters.project}
          onApply={(project) => controls.setFilters({ project })} />
      </ListFilters>
      {assetsQuery.isPending && <PageLoading>Loading assets…</PageLoading>}
      {assetsQuery.isError && <PageError description="Assets could not be loaded." onRetry={() => void assetsQuery.refetch()} />}
      {assetsQuery.isSuccess && assets.length === 0 && <PageEmpty title={controls.hasCriteria ? "No assets found" : "No assets available"} description="No assets match this view." />}
      <div className="asset-directory-list">
        {assets.map((asset) => (
          <Container key={asset.asset_id}>
            <div className="client-asset-card">
              <div className="client-asset-card__main">
                <SpaceBetween direction="vertical" size="s">
                  <div className="asset-directory-card__header">
                    <div>
                      <Box variant="h2">{asset.name}</Box>
                    </div>
                    <StatusIndicator type={assetStatusType(asset.status)}>
                      {humanizeEnum(asset.status)}
                    </StatusIndicator>
                  </div>
                  <Box color="text-body-secondary">
                    {asset.description || "No asset description is available."}
                  </Box>
                  <div className="client-asset-card__media-row">
                    <div className="client-asset-card__image-frame">
                      {asset.photo ? (
                        <img
                          alt={`${asset.name} asset`}
                          className="client-asset-card__image"
                          src={asset.photo}
                        />
                      ) : (
                        <div className="client-asset-card__image-placeholder">
                          <Box color="text-body-secondary">No asset image</Box>
                        </div>
                      )}
                    </div>
                  </div>
                </SpaceBetween>
              </div>
              <div className="client-asset-card__meta">
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
              <div className="client-asset-card__actions">
                {asset.datasheet ? (
                  <Button href={asset.datasheet} target="_blank">
                    Datasheet
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => navigate(`/client/assets/${asset.asset_id}`)}
                >
                  Open certificates
                </Button>
              </div>
            </div>
          </Container>
        ))}
      </div>
      <ListPagination controls={controls} meta={assetsQuery.data?.meta} />
    </ContentLayout>
  );
}
