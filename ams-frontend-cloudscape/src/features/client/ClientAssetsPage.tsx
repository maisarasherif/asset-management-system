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
import { listAllClientAssets } from "../../lib/api/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

export function ClientAssetsPage() {
  const navigate = useNavigate();
  const assetsQuery = useQuery({
    queryKey: ["client-assets", "all"],
    queryFn: listAllClientAssets,
  });

  if (assetsQuery.isLoading) {
    return <PageLoading>{"Loading client assets\u2026"}</PageLoading>;
  }

  if (assetsQuery.isError) {
    return (
      <PageError
        description="Your project assets could not be loaded."
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  const assets = assetsQuery.data || [];
  if (assets.length === 0) {
    return (
      <PageEmpty
        description="No active project assets are assigned to your account."
        title="No assets available"
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          counter={`(${assets.length})`}
          description="Read-only access to assets and certificates assigned to your active projects."
          variant="h1"
        >
          Client asset portal
        </Header>
      }
    >
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
    </ContentLayout>
  );
}
