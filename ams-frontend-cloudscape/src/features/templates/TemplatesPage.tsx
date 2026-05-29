import {
  Box,
  Button,
  ContentLayout,
  Header,
  SpaceBetween,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { listTemplates } from "../../lib/api/ams";
import type { AssetTemplate } from "../../types/ams";
import { formatDate } from "../../utils/format";

export function TemplatesPage() {
  const navigate = useNavigate();

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  if (templatesQuery.isLoading) {
    return <PageLoading>{"Loading the template workspace\u2026"}</PageLoading>;
  }

  if (templatesQuery.isError) {
    return (
      <PageError
        description="The template workspace could not be loaded."
        onRetry={() => void templatesQuery.refetch()}
      />
    );
  }

  if (!templatesQuery.data || templatesQuery.data.length === 0) {
    return (
      <PageEmpty
        action={
          <Button variant="primary" onClick={() => navigate("/templates/new")}>
            Create template
          </Button>
        }
        description="Templates define the component blueprint and default certificate tests that new assets can inherit."
        title="No templates found"
      />
    );
  }

  const columns: TableProps<AssetTemplate>["columnDefinitions"] = [
    {
      id: "template",
      header: "Template",
      cell: (item) => (
        <RouterLink to={`/templates/${item.template_id}`}>
          {item.display_id} - {item.template_name}
        </RouterLink>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: (item) => item.description || "No description",
    },
    {
      id: "updated",
      header: "Updated",
      cell: (item) => formatDate(item.updated_at),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => navigate(`/templates/${item.template_id}`)}>Open</Button>
          <Button onClick={() => navigate(`/templates/${item.template_id}/configure`)}>
            Configure
          </Button>
        </SpaceBetween>
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
            counter={`(${templatesQuery.data.length})`}
            description="Open a template to review its blueprint, then use Configure to manage component and test assignments."
            variant="h2"
          >
            Template library
          </Header>
        }
        items={templatesQuery.data}
        trackBy="template_id"
        variant="embedded"
      />
      <Box color="text-body-secondary" margin={{ top: "s" }}>
        Template configuration is scoped to components and tests only. Existing assets stay unchanged after a template is updated.
      </Box>
    </ContentLayout>
  );
}
