import { ListFilters, ListPagination, TextFacet } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import {
  Box,
  Button,
  ContentLayout,
  Header,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import { searchTemplates } from "../../lib/api/ams";
import type { AssetTemplate } from "../../types/ams";
import { formatDate } from "../../utils/format";

export function TemplatesPage() {
  const navigate = useNavigate();

  const controls = useListControls("", ["project"]);
  const templatesQuery = useQuery({
    queryKey: ["templates", controls.query],
    queryFn: () => searchTemplates(controls.query),
  });

  const columns: TableProps<AssetTemplate>["columnDefinitions"] = [
    {
      id: "template",
      header: "Template",
      width: "34%",
      minWidth: 240,
      cell: (item) => (
        <TableCellText title={`${item.display_id} - ${item.template_name}`}>
          <RouterLink to={`/templates/${item.template_id}`}>
            {item.display_id} - {item.template_name}
          </RouterLink>
        </TableCellText>
      ),
    },
    {
      id: "description",
      header: "Description",
      width: "34%",
      minWidth: 260,
      cell: (item) => (
        <TableCellText title={item.description || "No description"}>
          {item.description || "No description"}
        </TableCellText>
      ),
    },
    {
      id: "updated",
      header: "Updated",
      width: 150,
      minWidth: 140,
      cell: (item) => formatDate(item.updated_at),
    },
    {
      id: "actions",
      header: "Actions",
      width: 220,
      minWidth: 220,
      cell: (item) => (
        <TableCellActions>
          <Button onClick={() => navigate(`/templates/${item.template_id}`)}>Open</Button>
          <Button onClick={() => navigate(`/templates/${item.template_id}/configure`)}>
            Configure
          </Button>
        </TableCellActions>
      ),
    },
  ];

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <Button variant="primary" onClick={() => navigate("/templates/new")}>
              Create template
            </Button>
          }
          description="Blueprints for new assets. Define component structure once, then apply it during asset creation."
          variant="h1"
        >
          Templates
        </Header>
      }
    >
      <Table
        columnDefinitions={columns}
        header={
          <Header
            counter={`(${templatesQuery.data?.meta.total ?? 0})`}
            description="Open a template to review its blueprint, then use Configure to manage component and test assignments."
            variant="h2"
          >
            Template library
          </Header>
        }
        items={templatesQuery.data?.data ?? []}
        loading={templatesQuery.isPending}
        loadingText="Loading templates"
        filter={<ListFilters controls={controls} label="Search templates">
          <TextFacet key={controls.filters.project} label="Used by project" value={controls.filters.project}
            onApply={(project) => controls.setFilters({ project })} />
        </ListFilters>}
        pagination={<ListPagination controls={controls} meta={templatesQuery.data?.meta} />}
        empty={templatesQuery.isError
          ? <PageError description="The template library could not be loaded." onRetry={() => void templatesQuery.refetch()} />
          : <PageEmpty title="No templates found" description="No templates match this view." />}
        trackBy="template_id"
        variant="embedded"
      />
      <Box color="text-body-secondary" margin={{ top: "s" }}>
        Template configuration is scoped to components and tests only. Existing assets stay unchanged after a template is updated.
      </Box>
    </ContentLayout>
  );
}
