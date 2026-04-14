import {
  Box,
  Button,
  ContentLayout,
  Header,
  StatusIndicator,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { listAllAssets } from "../../lib/api/ams";
import type { Asset } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType } from "../../utils/status";

export function AssetsDirectoryPage() {
  const navigate = useNavigate();

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
        action={<Button onClick={() => navigate("/assets/new")}>Create asset</Button>}
        description="Create an asset to start using the asset-first dashboard and workspace."
        title="No assets found"
      />
    );
  }

  const columns: TableProps<Asset>["columnDefinitions"] = [
    {
      id: "name",
      header: "Asset",
      cell: (item) => (
        <RouterLink to={`/assets/${item.asset_id}`}>
          {item.display_id} - {item.name}
        </RouterLink>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusIndicator type={assetStatusType(item.status)}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
    {
      id: "location",
      header: "Location",
      cell: (item) => item.location || "Not set",
    },
    {
      id: "project",
      header: "Assigned project",
      cell: (item) => item.assigned_project || "Not set",
    },
    {
      id: "updated",
      header: "Updated",
      cell: (item) => formatDate(item.updated_at),
    },
    {
      id: "template",
      header: "Template",
      cell: (item) => (item.template_id ? "Assigned" : "None"),
    },
  ];

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <Button variant="primary" onClick={() => navigate("/assets/new")}>
              Create asset
            </Button>
          }
          description="Asset roster and admin management page for selecting or creating operational workspaces."
          variant="h1"
        >
          Assets directory
        </Header>
      }
    >
      <Table
        columnDefinitions={columns}
        header={
          <Header
            counter={`(${assetsQuery.data.length})`}
            description="Open a specific asset to work inside its component and certificate workspace."
            variant="h2"
          >
            Assets
          </Header>
        }
        items={assetsQuery.data}
        loading={false}
        trackBy="asset_id"
        variant="embedded"
      />
      <Box color="text-body-secondary" margin={{ top: "s" }}>
        Standalone component and certificate pages are intentionally removed. Operational work continues from each asset workspace.
      </Box>
    </ContentLayout>
  );
}
