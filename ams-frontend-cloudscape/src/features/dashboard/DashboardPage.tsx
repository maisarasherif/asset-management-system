import { AssetCategoryFilter, AssetComponentFilter } from "../../components/shared/AssetComponentFilters";
import { CertificateListFilters } from "../../components/shared/CertificateListFilters";
import { ListPagination } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import {
  Box,
  Button,
  ButtonDropdown,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { TableCellText } from "../../components/shared/TableCells";
import {
  getAssetComponentCertificateSheet,
  getAsset,
  getAssetCertificateSummary,
  listAssets,
  listCertificatesWithContext,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import { formatDate } from "../../utils/format";
import { DashboardOverview } from "./DashboardOverview";

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
    queryKey: ["assets", "first"],
    queryFn: () => listAssets(1, 1),
  });

  useEffect(() => {
    if (!selectedAssetId && assetsQuery.data && assetsQuery.data.data.length > 0) {
      setSelectedAssetId(assetsQuery.data.data[0].asset_id);
    }
  }, [assetsQuery.data, selectedAssetId, setSelectedAssetId]);

  const activeAssetId = selectedAssetId ?? assetsQuery.data?.data[0]?.asset_id ?? null;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", activeAssetId],
    queryFn: async () => {
      const id = activeAssetId!;
      const [asset, summary] = await Promise.all([
        getAsset(id),
        getAssetCertificateSummary(id),
      ]);
      return { asset, summary };
    },
    enabled: Boolean(activeAssetId),
  });

  const certificateControls = useListControls("certificates", ["status", "test_id", "component_id", "category_id"]);
  const certificates = useQuery({
    queryKey: ["certificates", "dashboard", activeAssetId, certificateControls.query],
    queryFn: () => listCertificatesWithContext(certificateControls.page, certificateControls.query.limit,
      { ...certificateControls.query, asset_id: activeAssetId ?? undefined }),
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

  if (!assetsQuery.data || assetsQuery.data.data.length === 0) {
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
  const latestColumns: TableProps<import("../../types/ams").CertificateWithContext>["columnDefinitions"] = [
    {
      id: "name",
      header: "Certificate",
      width: "28%",
      minWidth: 220,
      cell: (item) => (
        <TableCellText title={item.certificate_name}>
          <RouterLink to={`/assets/${item.asset_id}/components/${item.component_id}/certificates/${item.certificate_id}`}>
            {item.certificate_name}
          </RouterLink>
        </TableCellText>
      ),
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

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <div className="app-header-actions">
              <div className="app-header-actions__desktop">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="primary" onClick={() => navigate(`/assets/${dashboard.asset.asset_id}`)}>
                    Open workspace
                  </Button>
                  <Button
                    loading={trackerMutation.isPending}
                    onClick={() => trackerMutation.mutate()}
                  >
                    Download tracker
                  </Button>
                  {isAdmin ? (
                    <Button onClick={() => navigate(`/assets/${dashboard.asset.asset_id}/edit`)}>
                      Edit asset
                    </Button>
                  ) : null}
                </SpaceBetween>
              </div>
              <div className="app-header-actions__mobile">
                <Button variant="primary" onClick={() => navigate(`/assets/${dashboard.asset.asset_id}`)}>
                  Open workspace
                </Button>
                <ButtonDropdown
                  items={[
                    {
                      id: "download-tracker",
                      text: "Download tracker",
                      disabled: trackerMutation.isPending,
                    },
                    ...(isAdmin
                      ? [{ id: "edit-asset", text: "Edit asset" }]
                      : []),
                  ]}
                  onItemClick={({ detail }) => {
                    if (detail.id === "download-tracker") {
                      trackerMutation.mutate();
                    }
                    if (detail.id === "edit-asset") {
                      navigate(`/assets/${dashboard.asset.asset_id}/edit`);
                    }
                  }}
                >
                  More actions
                </ButtonDropdown>
              </div>
            </div>
          }
          description={`${dashboard.asset.display_id} - ${dashboard.asset.location || "No location set"}`}
          variant="h1"
        >
          {dashboard.asset.name}
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <DashboardOverview key={dashboard.asset.asset_id} asset={dashboard.asset} summary={dashboard.summary} />

        <Container header={<Header variant="h2">Compliance Certificates Quick Navigation</Header>}>
          <Table
            columnDefinitions={latestColumns}
            empty={<Box color="text-body-secondary">No certificate data is available for this asset.</Box>}
            items={certificates.data?.data ?? []}
            loading={certificates.isPending}
            loadingText="Loading certificates"
            filter={<CertificateListFilters controls={certificateControls}>
              <AssetComponentFilter assetId={dashboard.asset.asset_id} controls={certificateControls} />
              <AssetCategoryFilter assetId={dashboard.asset.asset_id} controls={certificateControls} />
            </CertificateListFilters>}
            pagination={<ListPagination controls={certificateControls} meta={certificates.data?.meta} />}
            variant="embedded"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
