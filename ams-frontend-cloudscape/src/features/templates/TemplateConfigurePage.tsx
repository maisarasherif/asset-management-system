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
  Multiselect,
  Select,
  SpaceBetween,
  Table,
  Textarea,
  type MultiselectProps,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import {
  addTemplateComponentTest,
  createTemplateComponent,
  deleteTemplateComponent,
  deleteTemplateComponentTest,
  getTemplate,
  getTemplateConfiguration,
  listAllCategories,
  listAllMainCategories,
  listTestTypes,
  updateTemplateComponent,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  SafetyCritical,
  TemplateComponentInput,
  TemplateConfigurationComponent,
} from "../../types/ams";
import { formatMonthDuration, humanizeEnum } from "../../utils/format";

type EditorMode = "create" | "edit";

interface TemplateComponentFormState extends TemplateComponentInput {
  test_ids: string[];
}

const SAFETY_OPTIONS: SelectProps.Option[] = [
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
];

function createEmptyDraft(): TemplateComponentFormState {
  return {
    category_id: "",
    name: "",
    description: "",
    serial_number: "",
    manufacturer: "",
    location: "",
    assigned_project: "",
    equipment_type: "",
    structure: "",
    model: "",
    class: "",
    class_code: "",
    safety_critical: "NO",
    test_ids: [],
  };
}

function toDraft(component: TemplateConfigurationComponent): TemplateComponentFormState {
  return {
    category_id: component.category_id,
    name: component.name,
    description: component.description || "",
    serial_number: component.serial_number || "",
    manufacturer: component.manufacturer || "",
    location: component.location || "",
    assigned_project: component.assigned_project || "",
    equipment_type: component.equipment_type || "",
    structure: component.structure || "",
    model: component.model || "",
    class: component.class || "",
    class_code: component.class_code || "",
    safety_critical: component.safety_critical,
    test_ids: component.tests.map((test) => test.test_id),
  };
}

function buildPayload(draft: TemplateComponentFormState): TemplateComponentInput {
  return {
    category_id: draft.category_id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    serial_number: draft.serial_number.trim(),
    manufacturer: draft.manufacturer.trim(),
    location: draft.location.trim(),
    assigned_project: draft.assigned_project.trim(),
    equipment_type: draft.equipment_type.trim(),
    structure: draft.structure.trim(),
    model: draft.model.trim(),
    class: draft.class.trim(),
    class_code: draft.class_code.trim(),
    safety_critical: draft.safety_critical,
  };
}

function validateDraft(draft: TemplateComponentFormState) {
  if (!draft.category_id) {
    return "Choose a category.";
  }
  if (draft.name.trim().length < 2) {
    return "Component name must be at least 2 characters.";
  }
  if (draft.test_ids.length === 0) {
    return "Assign at least one test type.";
  }
  return "";
}

export function TemplateConfigurePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { templateId } = useParams();
  const { error, success } = useFlashbar();

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateComponentFormState>(createEmptyDraft);
  const [formError, setFormError] = useState("");
  const [deletingComponent, setDeletingComponent] = useState<TemplateConfigurationComponent | null>(null);

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

  const mainCategoriesQuery = useQuery({
    queryKey: ["main-categories", "all"],
    queryFn: listAllMainCategories,
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const mainCategoryMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.main_category_name,
        ])
      ),
    [mainCategoriesQuery.data]
  );

  const categoryMap = useMemo(
    () =>
      new Map(
        (categoriesQuery.data || []).map((category) => [category.category_id, category.category_name])
      ),
    [categoriesQuery.data]
  );

  const categoryOptions = useMemo<SelectProps.Option[]>(
    () =>
      (categoriesQuery.data || []).map((category) => ({
        label: category.category_name,
        value: category.category_id,
        description:
          (category.main_category_id && mainCategoryMap.get(category.main_category_id)) ||
          category.display_id,
      })),
    [categoriesQuery.data, mainCategoryMap]
  );

  const testOptions = useMemo<MultiselectProps.Option[]>(
    () =>
      (testTypesQuery.data || []).map((testType) => ({
        label: testType.test_name,
        value: testType.test_id,
        description: `${formatMonthDuration(testType.validity_duration)} validity`,
      })),
    [testTypesQuery.data]
  );

  const componentColumns = useMemo<
    TableProps<TemplateConfigurationComponent>["columnDefinitions"]
  >(
    () => [
      {
        id: "component",
        header: "Component",
        width: "28%",
        minWidth: 220,
        cell: (item) => (
          <SpaceBetween direction="vertical" size="xxs">
            <Box fontWeight="bold">{item.name}</Box>
            <Box color="text-body-secondary">{item.display_id}</Box>
          </SpaceBetween>
        ),
      },
      {
        id: "category",
        header: "Category",
        width: "22%",
        minWidth: 170,
        cell: (item) => categoryMap.get(item.category_id) || item.category_id,
      },
      {
        id: "tests",
        header: "Tests",
        width: 110,
        minWidth: 90,
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
        id: "actions",
        header: "Actions",
        width: 220,
        minWidth: 220,
        cell: (item) => (
          <div className="catalog-table__actions">
            <Button
              onClick={() => {
                setEditorMode("edit");
                setEditingComponentId(item.template_component_id);
                setDraft(toDraft(item));
                setFormError("");
                setEditorVisible(true);
              }}
            >
              Edit
            </Button>
            <Button onClick={() => setDeletingComponent(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [categoryMap]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextFormError = validateDraft(draft);
      if (nextFormError) {
        throw new Error(nextFormError);
      }

      const payload = buildPayload(draft);

      if (editorMode === "create") {
        const component = await createTemplateComponent(templateId!, payload);
        await Promise.all(
          draft.test_ids.map((testId) => addTemplateComponentTest(component.template_component_id, testId))
        );
        return;
      }

      const currentComponent = (configurationQuery.data || []).find(
        (component) => component.template_component_id === editingComponentId
      );

      if (!currentComponent || !editingComponentId) {
        throw new Error("The selected component could not be found.");
      }

      await updateTemplateComponent(editingComponentId, payload);

      const existingTests = new Map(
        currentComponent.tests.map((test) => [test.test_id, test.template_component_test_id])
      );
      const nextTests = new Set(draft.test_ids);

      const testDeleteRequests = currentComponent.tests
        .filter((test) => !nextTests.has(test.test_id))
        .map((test) => deleteTemplateComponentTest(test.template_component_test_id));

      const testCreateRequests = draft.test_ids
        .filter((testId) => !existingTests.has(testId))
        .map((testId) => addTemplateComponentTest(editingComponentId, testId));

      await Promise.all([...testDeleteRequests, ...testCreateRequests]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["template-configuration", templateId] });
      setEditorVisible(false);
      setEditingComponentId(null);
      setDraft(createEmptyDraft());
      setFormError("");
      success(
        editorMode === "create" ? "Template component added" : "Template component updated",
        "The template component list has been refreshed."
      );
    },
    onError: (mutationError: Error) => {
      setFormError(mutationError.message);
      error("Template component save failed", mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplateComponent(deletingComponent!.template_component_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["template-configuration", templateId] });
      setDeletingComponent(null);
      success("Template component deleted", "The component was removed from this template.");
    },
    onError: (mutationError: Error) => {
      error("Template component delete failed", mutationError.message);
    },
  });

  if (!templateId) {
    return <PageError description="The template route is missing." title="Invalid route" />;
  }

  if (
    templateQuery.isLoading ||
    configurationQuery.isLoading ||
    categoriesQuery.isLoading ||
    mainCategoriesQuery.isLoading ||
    testTypesQuery.isLoading
  ) {
    return <PageLoading>Loading the template configuration workspace...</PageLoading>;
  }

  if (
    templateQuery.isError ||
    configurationQuery.isError ||
    categoriesQuery.isError ||
    mainCategoriesQuery.isError ||
    testTypesQuery.isError ||
    !templateQuery.data ||
    !categoriesQuery.data ||
    !testTypesQuery.data
  ) {
    return (
      <PageError
        description="The template configuration workspace could not be loaded."
        onRetry={() => {
          void templateQuery.refetch();
          void configurationQuery.refetch();
          void categoriesQuery.refetch();
          void mainCategoriesQuery.refetch();
          void testTypesQuery.refetch();
        }}
      />
    );
  }

  if (categoriesQuery.data.length === 0 || testTypesQuery.data.length === 0) {
    return (
      <PageEmpty
        action={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => navigate(`/templates/${templateId}`)}>Back to template</Button>
            <Button variant="primary" onClick={() => navigate("/catalog")}>
              Open catalog
            </Button>
          </SpaceBetween>
        }
        description="Template components need at least one category and one test type. Add those in the catalog first, then return here."
        title="Catalog setup required"
      />
    );
  }

  const template = templateQuery.data;
  const configuredComponents = configurationQuery.data || [];
  const totalTests = configuredComponents.reduce((count, component) => count + component.tests.length, 0);
  const selectedCategory =
    categoryOptions.find((option) => option.value === draft.category_id) ?? null;
  const selectedSafetyOption =
    SAFETY_OPTIONS.find((option) => option.value === draft.safety_critical) ?? null;
  const selectedTests = testOptions.filter((option) => draft.test_ids.includes(option.value || ""));

  return (
    <>
      <ContentLayout
        header={
          <Header
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => navigate(`/templates/${templateId}`)}>Back to template</Button>
                <Button onClick={() => navigate("/catalog")}>Open catalog</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditorMode("create");
                    setEditingComponentId(null);
                    setDraft(createEmptyDraft());
                    setFormError("");
                    setEditorVisible(true);
                  }}
                >
                  Add component
                </Button>
              </SpaceBetween>
            }
            description={`${template.display_id} - simple component list and modal editor`}
            variant="h1"
          >
            Configure {template.template_name}
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <Alert type="info">
            Add components from the button above, then edit or delete them one by one from the list.
            Existing assets are not changed retroactively.
          </Alert>

          <ColumnLayout columns={3} variant="text-grid">
            <Container header={<Header variant="h2">Template</Header>}>
              <SpaceBetween direction="vertical" size="xs">
                <div className="summary-row">
                  <Box variant="awsui-key-label">Name</Box>
                  <Box>{template.template_name}</Box>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Description</Box>
                  <Box>{template.description || "No description"}</Box>
                </div>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Blueprint</Header>}>
              <SpaceBetween direction="vertical" size="xs">
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
            <Container header={<Header variant="h2">Status</Header>}>
              <SpaceBetween direction="vertical" size="xs">
                <div className="summary-row">
                  <Box variant="awsui-key-label">Readiness</Box>
                  <Badge color={configuredComponents.length === 0 ? "red" : "green"}>
                    {configuredComponents.length === 0 ? "Needs components" : "Ready"}
                  </Badge>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Next step</Box>
                  <Box>
                    {configuredComponents.length === 0
                      ? "Add your first component."
                      : "Review or edit items from the list."}
                  </Box>
                </div>
              </SpaceBetween>
            </Container>
          </ColumnLayout>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditorMode("create");
                      setEditingComponentId(null);
                      setDraft(createEmptyDraft());
                      setFormError("");
                      setEditorVisible(true);
                    }}
                  >
                    Add component
                  </Button>
                }
                counter={`(${configuredComponents.length})`}
                description="Each component is managed individually from this list."
                variant="h2"
              >
                Template components
              </Header>
            }
          >
            {configuredComponents.length === 0 ? (
              <PageEmpty
                action={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditorMode("create");
                      setEditingComponentId(null);
                      setDraft(createEmptyDraft());
                      setFormError("");
                      setEditorVisible(true);
                    }}
                  >
                    Add first component
                  </Button>
                }
                description="Start by adding a component in the modal. You can edit or delete each one afterward."
                title="No components yet"
              />
            ) : (
              <Table
                columnDefinitions={componentColumns}
                items={configuredComponents}
                trackBy="template_component_id"
                variant="embedded"
                wrapLines={false}
              />
            )}
          </Container>
        </SpaceBetween>
      </ContentLayout>

      <Modal
        visible={editorVisible}
        header={editorMode === "create" ? "Add template component" : "Edit template component"}
        onDismiss={() => {
          setEditorVisible(false);
          setFormError("");
        }}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              onClick={() => {
                setEditorVisible(false);
                setFormError("");
              }}
            >
              Cancel
            </Button>
            <Button loading={saveMutation.isPending} variant="primary" onClick={() => saveMutation.mutate()}>
              Save
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          {formError ? <Alert type="error">{formError}</Alert> : null}

          <ColumnLayout columns={2}>
            <FormField label="Component name">
              <Input
                value={draft.name}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, name: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Category">
              <Select
                options={categoryOptions}
                placeholder="Select category"
                selectedOption={selectedCategory}
                onChange={({ detail }) => {
                  setDraft((current) => ({
                    ...current,
                    category_id: detail.selectedOption.value || "",
                  }));
                }}
              />
            </FormField>
          </ColumnLayout>

          <FormField label="Description">
            <Textarea
              rows={4}
              value={draft.description}
              onChange={({ detail }) => {
                setDraft((current) => ({ ...current, description: detail.value }));
              }}
            />
          </FormField>

          <ColumnLayout columns={3}>
            <FormField label="Serial number">
              <Input
                value={draft.serial_number}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, serial_number: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Manufacturer">
              <Input
                value={draft.manufacturer}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, manufacturer: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Safety critical">
              <Select
                options={SAFETY_OPTIONS}
                selectedOption={selectedSafetyOption}
                onChange={({ detail }) => {
                  setDraft((current) => ({
                    ...current,
                    safety_critical: (detail.selectedOption.value as SafetyCritical) || "NO",
                  }));
                }}
              />
            </FormField>
          </ColumnLayout>

          <ColumnLayout columns={3}>
            <FormField label="Assigned project">
              <Input
                value={draft.assigned_project}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, assigned_project: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Location">
              <Input
                value={draft.location}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, location: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Equipment type">
              <Input
                value={draft.equipment_type}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, equipment_type: detail.value }));
                }}
              />
            </FormField>
          </ColumnLayout>

          <ColumnLayout columns={3}>
            <FormField label="Structure">
              <Input
                value={draft.structure}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, structure: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Model">
              <Input
                value={draft.model}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, model: detail.value }));
                }}
              />
            </FormField>
            <FormField label="Class">
              <Input
                value={draft.class}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, class: detail.value }));
                }}
              />
            </FormField>
          </ColumnLayout>

          <ColumnLayout columns={2}>
            <FormField label="Class code">
              <Input
                value={draft.class_code}
                onChange={({ detail }) => {
                  setDraft((current) => ({ ...current, class_code: detail.value }));
                }}
              />
            </FormField>
            <FormField
              description="These are the default certificate tests for this template component."
              label="Assigned test types"
            >
              <Multiselect
                options={testOptions}
                placeholder="Select test types"
                selectedOptions={selectedTests}
                onChange={({ detail }) => {
                  setDraft((current) => ({
                    ...current,
                    test_ids: detail.selectedOptions
                      .map((option) => option.value || "")
                      .filter(Boolean),
                  }));
                }}
              />
            </FormField>
          </ColumnLayout>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={Boolean(deletingComponent)}
        header="Delete template component"
        onDismiss={() => setDeletingComponent(null)}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setDeletingComponent(null)}>Cancel</Button>
            <Button loading={deleteMutation.isPending} variant="primary" onClick={() => deleteMutation.mutate()}>
              Delete
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          <Alert type="warning">
            This removes the component blueprint and its default tests from the template.
          </Alert>
          <Box>
            {deletingComponent ? `Delete ${deletingComponent.name} from this template?` : ""}
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
