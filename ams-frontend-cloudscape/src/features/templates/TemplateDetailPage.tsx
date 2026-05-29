import {
  Alert,
  Badge,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  Table,
  Textarea,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { TableCellText } from "../../components/shared/TableCells";
import {
  deleteTemplate,
  getTemplate,
  getTemplateConfiguration,
  listAllCategories,
  listTestTypes,
  updateTemplate,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { AssetTemplate, TemplateConfigurationComponent } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";

export function TemplateDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { templateId } = useParams();
  const { error, success } = useFlashbar();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [editError, setEditError] = useState("");

  const templateQuery = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => getTemplate(templateId!),
    enabled: Boolean(templateId),
  });

  const configurationQuery = useQuery({
    queryKey: ["template-configuration", templateId],
    queryFn: () => getTemplateConfiguration(templateId!),
    enabled: Boolean(templateId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: listAllCategories,
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateTemplate(templateId!, {
        template_name: templateName.trim(),
        description: description.trim(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["template", templateId] }),
        queryClient.invalidateQueries({ queryKey: ["templates"] }),
      ]);
      setEditModalVisible(false);
      setEditError("");
      success("Template updated", "The template details have been saved.");
    },
    onError: (mutationError: Error) => {
      setEditError(mutationError.message);
      error("Template update failed", mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplate(templateId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleteModalVisible(false);
      success("Template deleted", "The template has been removed from the library.");
      navigate("/templates", { replace: true });
    },
    onError: (mutationError: Error) => {
      error("Template delete failed", mutationError.message);
    },
  });

  const categoryMap = useMemo(
    () =>
      new Map(
        (categoriesQuery.data || []).map((category) => [
          category.category_id,
          category.category_name,
        ])
      ),
    [categoriesQuery.data]
  );

  const testTypeMap = useMemo(
    () =>
      new Map(
        (testTypesQuery.data || []).map((testType) => [testType.test_id, testType.test_name])
      ),
    [testTypesQuery.data]
  );

  if (!templateId) {
    return <PageError description="The template route is missing." title="Invalid route" />;
  }

  if (templateQuery.isLoading || configurationQuery.isLoading) {
    return <PageLoading>{"Loading the template workspace\u2026"}</PageLoading>;
  }

  if (
    templateQuery.isError ||
    configurationQuery.isError ||
    !templateQuery.data ||
    !configurationQuery.data
  ) {
    return (
      <PageError
        description="The template could not be loaded."
        onRetry={() => {
          void templateQuery.refetch();
          void configurationQuery.refetch();
        }}
      />
    );
  }

  const template = templateQuery.data;
  const configuredComponents = configurationQuery.data;
  const totalTests = configuredComponents.reduce(
    (count, component) => count + component.tests.length,
    0
  );
  const readinessLabel =
    configuredComponents.length === 0 ? "Needs configuration" : "Ready for new assets";

  const componentColumns: TableProps<TemplateConfigurationComponent>["columnDefinitions"] = [
    {
      id: "component",
      header: "Component",
      width: "30%",
      minWidth: 240,
      cell: (item) => (
        <TableCellText title={`${item.display_id} - ${item.name}`}>
          {item.display_id} - {item.name}
        </TableCellText>
      ),
    },
    {
      id: "category",
      header: "Category",
      width: "22%",
      minWidth: 180,
      cell: (item) => (
        <TableCellText title={categoryMap.get(item.category_id) || item.category_id}>
          {categoryMap.get(item.category_id) || item.category_id}
        </TableCellText>
      ),
    },
    {
      id: "tests",
      header: "Assigned tests",
      width: 130,
      minWidth: 120,
      cell: (item) => item.tests.length,
    },
    {
      id: "safety",
      header: "Safety critical",
      width: 150,
      minWidth: 140,
      cell: (item) => humanizeEnum(item.safety_critical),
    },
    {
      id: "project",
      header: "Assigned project",
      width: "22%",
      minWidth: 180,
      cell: (item) => (
        <TableCellText title={item.assigned_project || "Not set"}>
          {item.assigned_project || "Not set"}
        </TableCellText>
      ),
    },
  ];

  const openEditModal = () => {
    setTemplateName(template.template_name);
    setDescription(template.description || "");
    setEditError("");
    setEditModalVisible(true);
  };

  const submitEdit = () => {
    if (templateName.trim().length < 2) {
      setEditError("Template name must be at least 2 characters.");
      return;
    }

    setEditError("");
    updateMutation.mutate();
  };

  return renderTemplateDetailPage({
    categoryMap,
    componentColumns,
    configuredComponents,
    deleteModalVisible,
    deletePending: deleteMutation.isPending,
    description,
    editError,
    editModalVisible,
    navigate,
    onDelete: () => deleteMutation.mutate(),
    onDescriptionChange: setDescription,
    onEditDismiss: () => setEditModalVisible(false),
    onDeleteDismiss: () => setDeleteModalVisible(false),
    onOpenDelete: () => setDeleteModalVisible(true),
    onOpenEdit: openEditModal,
    onSubmitEdit: submitEdit,
    onTemplateNameChange: setTemplateName,
    readinessLabel,
    template,
    templateId,
    templateName,
    testTypeMap,
    totalTests,
    updatePending: updateMutation.isPending,
  });
}

interface TemplateDetailPageViewProps {
  categoryMap: Map<string, string>;
  componentColumns: TableProps<TemplateConfigurationComponent>["columnDefinitions"];
  configuredComponents: TemplateConfigurationComponent[];
  deleteModalVisible: boolean;
  deletePending: boolean;
  description: string;
  editError: string;
  editModalVisible: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onDelete: () => void;
  onDeleteDismiss: () => void;
  onDescriptionChange: (value: string) => void;
  onEditDismiss: () => void;
  onOpenDelete: () => void;
  onOpenEdit: () => void;
  onSubmitEdit: () => void;
  onTemplateNameChange: (value: string) => void;
  readinessLabel: string;
  template: AssetTemplate;
  templateId: string;
  templateName: string;
  testTypeMap: Map<string, string>;
  totalTests: number;
  updatePending: boolean;
}

function renderTemplateDetailPage({
  categoryMap,
  componentColumns,
  configuredComponents,
  deleteModalVisible,
  deletePending,
  description,
  editError,
  editModalVisible,
  navigate,
  onDelete,
  onDeleteDismiss,
  onDescriptionChange,
  onEditDismiss,
  onOpenDelete,
  onOpenEdit,
  onSubmitEdit,
  onTemplateNameChange,
  readinessLabel,
  template,
  templateId,
  templateName,
  testTypeMap,
  totalTests,
  updatePending,
}: TemplateDetailPageViewProps) {
  return (
    <>
      <ContentLayout
        header={
          <Header
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => navigate("/templates")}>Back to templates</Button>
                <Button onClick={onOpenEdit}>Edit details</Button>
                <Button onClick={() => navigate(`/templates/${templateId}/configure`)}>
                  Configure template
                </Button>
                <Button onClick={onOpenDelete}>Delete template</Button>
              </SpaceBetween>
            }
            description={`${template.display_id} - updated ${formatDate(template.updated_at)}`}
            variant="h1"
          >
            {template.template_name}
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <ColumnLayout columns={3} variant="text-grid">
            <Container header={<Header variant="h2">Configuration status</Header>}>
              <SpaceBetween direction="vertical" size="xs">
                <div className="summary-row">
                  <Box variant="awsui-key-label">Readiness</Box>
                  <Badge color={configuredComponents.length === 0 ? "red" : "green"}>
                    {readinessLabel}
                  </Badge>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Components</Box>
                  <Box>{configuredComponents.length}</Box>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Assigned tests</Box>
                  <Box>{totalTests}</Box>
                </div>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Template summary</Header>}>
              <SpaceBetween direction="vertical" size="xs">
                <div className="summary-row">
                  <Box variant="awsui-key-label">Created</Box>
                  <Box>{formatDate(template.created_at)}</Box>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Last updated</Box>
                  <Box>{formatDate(template.updated_at)}</Box>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Next step</Box>
                  <Box>
                    {configuredComponents.length === 0
                      ? "Configure components and tests."
                      : "Apply this template when creating new assets."}
                  </Box>
                </div>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Description</Header>}>
              <Box color="text-body-secondary">
                {template.description || "No description is available for this template yet."}
              </Box>
            </Container>
          </ColumnLayout>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/templates/${templateId}/configure`)}
                  >
                    {configuredComponents.length === 0 ? "Configure template" : "Edit configuration"}
                  </Button>
                }
                counter={`(${configuredComponents.length})`}
                description="Each row represents a component blueprint that will be created for new assets using this template."
                variant="h2"
              >
                Configured components
              </Header>
            }
          >
            {configuredComponents.length === 0 ? (
              <PageEmpty
                action={
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/templates/${templateId}/configure`)}
                  >
                    Configure template
                  </Button>
                }
                description="Build the component blueprint and assign its default certificate tests before this template is used for new assets."
                title="No configured components"
              />
            ) : (
              <Table
                columnDefinitions={componentColumns}
                items={configuredComponents}
                trackBy="template_component_id"
                variant="embedded"
              />
            )}
          </Container>

          {configuredComponents.length > 0 ? (
            <Container
              header={
                <Header
                  description="Review the component metadata and default tests that will carry into new assets."
                  variant="h2"
                >
                  Blueprint details
                </Header>
              }
            >
              <div className="template-component-stack">
                {configuredComponents.map((component) => (
                  <div key={component.template_component_id} className="template-component-card">
                    <SpaceBetween direction="vertical" size="s">
                      <div className="template-component-card__header">
                        <div>
                          <Box fontWeight="bold">{component.name}</Box>
                          <Box color="text-body-secondary">{component.display_id}</Box>
                        </div>
                        <Badge color="blue">
                          {categoryMap.get(component.category_id) || component.category_id}
                        </Badge>
                      </div>
                      <Box color="text-body-secondary">
                        {component.description || "No component description is set."}
                      </Box>
                      <div className="template-component-card__meta">
                        <span>Serial: {component.serial_number || "Not set"}</span>
                        <span>Manufacturer: {component.manufacturer || "Not set"}</span>
                        <span>Safety: {humanizeEnum(component.safety_critical)}</span>
                      </div>
                      <div className="template-pill-list">
                        {component.tests.map((test) => (
                          <span key={test.template_component_test_id} className="template-pill">
                            {testTypeMap.get(test.test_id) || test.test_name}
                          </span>
                        ))}
                      </div>
                    </SpaceBetween>
                  </div>
                ))}
              </div>
            </Container>
          ) : null}

          <Box color="text-body-secondary">
            Existing assets are not retroactively updated when a template changes. The blueprint applies to assets created afterward.
          </Box>
        </SpaceBetween>
      </ContentLayout>

      <Modal
        visible={editModalVisible}
        header="Edit template details"
        onDismiss={onEditDismiss}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onEditDismiss}>Cancel</Button>
            <Button loading={updatePending} variant="primary" onClick={onSubmitEdit}>
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          {editError ? <Alert type="error">{editError}</Alert> : null}
          <FormField label="Template name">
            <Input value={templateName} onChange={({ detail }) => onTemplateNameChange(detail.value)} />
          </FormField>
          <FormField label="Description">
            <Textarea
              rows={6}
              value={description}
              onChange={({ detail }) => onDescriptionChange(detail.value)}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        header="Delete template"
        onDismiss={onDeleteDismiss}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDeleteDismiss}>Cancel</Button>
            <Button loading={deletePending} variant="primary" onClick={onDelete}>
              Delete template
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          <Alert type="warning">
            Delete this template only if it is no longer needed. Templates that are already assigned
            to existing assets cannot be deleted.
          </Alert>
          <Box>
            You are deleting{" "}
            <Box display="inline" fontWeight="bold">
              {template.template_name}
            </Box>
            . If the backend reports that this template is still in use, the deletion will be blocked.
          </Box>
          <Box color="text-body-secondary">
            Review the current blueprint in{" "}
            <RouterLink to={`/templates/${templateId}/configure`}>Configure template</RouterLink>{" "}
            if you only need to change components or tests.
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
