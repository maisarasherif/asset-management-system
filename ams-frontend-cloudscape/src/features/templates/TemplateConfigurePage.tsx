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
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  AssetTemplate,
  SafetyCritical,
  TemplateComponentInput,
  TemplateConfigurationComponent,
} from "../../types/ams";
import { formatMonthDuration, humanizeEnum } from "../../utils/format";

type EditorMode = "create" | "edit";

interface TemplateComponentFormState extends TemplateComponentInput {
  test_ids: string[];
}

type TemplateConfigureViewProps = {
  categoryOptions: SelectProps.Option[];
  componentColumns: TableProps<TemplateConfigurationComponent>["columnDefinitions"];
  configuredComponents: TemplateConfigurationComponent[];
  deletingComponent: TemplateConfigurationComponent | null;
  deletePending: boolean;
  draft: TemplateComponentFormState;
  editorMode: EditorMode;
  editorVisible: boolean;
  formError: string;
  navigate: ReturnType<typeof useNavigate>;
  onDelete: () => void;
  onDeleteDismiss: () => void;
  onDraftChange: Dispatch<SetStateAction<TemplateComponentFormState>>;
  onEditorDismiss: () => void;
  onOpenCreate: () => void;
  onSave: () => void;
  savePending: boolean;
  selectedCategory: SelectProps.Option | null;
  selectedSafetyOption: SelectProps.Option | null;
  selectedTests: MultiselectProps.Option[];
  template: AssetTemplate;
  templateId: string;
  testOptions: MultiselectProps.Option[];
  totalTests: number;
};

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

type UseTemplateComponentColumnsOptions = {
  categoryMap: Map<string, string>;
  onDeleteComponent: (component: TemplateConfigurationComponent) => void;
  onEditComponent: (component: TemplateConfigurationComponent) => void;
};

function useTemplateConfigureData(templateId: string | undefined) {
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

  return {
    categoriesQuery,
    categoryMap,
    categoryOptions,
    configurationQuery,
    mainCategoriesQuery,
    templateQuery,
    testOptions,
    testTypesQuery,
  };
}

function useTemplateComponentColumns({
  categoryMap,
  onDeleteComponent,
  onEditComponent,
}: UseTemplateComponentColumnsOptions) {
  return useMemo<TableProps<TemplateConfigurationComponent>["columnDefinitions"]>(
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
            <Button onClick={() => onEditComponent(item)}>Edit</Button>
            <Button onClick={() => onDeleteComponent(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [categoryMap, onDeleteComponent, onEditComponent]
  );
}

type UseTemplateComponentMutationsOptions = {
  configuration: TemplateConfigurationComponent[];
  deletingComponent: TemplateConfigurationComponent | null;
  draft: TemplateComponentFormState;
  editingComponentId: string | null;
  editorMode: EditorMode;
  onDeleteSuccess: () => void;
  onSaveError: (message: string) => void;
  onSaveSuccess: () => void;
  templateId: string | undefined;
};

function useTemplateComponentMutations({
  configuration,
  deletingComponent,
  draft,
  editingComponentId,
  editorMode,
  onDeleteSuccess,
  onSaveError,
  onSaveSuccess,
  templateId,
}: UseTemplateComponentMutationsOptions) {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();

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

      const currentComponent = configuration.find(
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
      const testDeleteRequests = currentComponent.tests.flatMap((test) =>
        nextTests.has(test.test_id) ? [] : [deleteTemplateComponentTest(test.template_component_test_id)]
      );
      const testCreateRequests = draft.test_ids.flatMap((testId) =>
        existingTests.has(testId) ? [] : [addTemplateComponentTest(editingComponentId, testId)]
      );

      await Promise.all([...testDeleteRequests, ...testCreateRequests]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["template-configuration", templateId] });
      onSaveSuccess();
      success(
        editorMode === "create" ? "Template component added" : "Template component updated",
        "The template component list has been refreshed."
      );
    },
    onError: (mutationError: Error) => {
      onSaveError(mutationError.message);
      error("Template component save failed", mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplateComponent(deletingComponent!.template_component_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["template-configuration", templateId] });
      onDeleteSuccess();
      success("Template component deleted", "The component was removed from this template.");
    },
    onError: (mutationError: Error) => {
      error("Template component delete failed", mutationError.message);
    },
  });

  return { deleteMutation, saveMutation };
}

export function TemplateConfigurePage() {
  const navigate = useNavigate();
  const { templateId } = useParams();

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateComponentFormState>(createEmptyDraft);
  const [formError, setFormError] = useState("");
  const [deletingComponent, setDeletingComponent] = useState<TemplateConfigurationComponent | null>(null);

  const {
    categoriesQuery,
    categoryMap,
    categoryOptions,
    configurationQuery,
    mainCategoriesQuery,
    templateQuery,
    testOptions,
    testTypesQuery,
  } = useTemplateConfigureData(templateId);

  const openEditEditor = (component: TemplateConfigurationComponent) => {
    setEditorMode("edit");
    setEditingComponentId(component.template_component_id);
    setDraft(toDraft(component));
    setFormError("");
    setEditorVisible(true);
  };

  const componentColumns = useTemplateComponentColumns({
    categoryMap,
    onDeleteComponent: setDeletingComponent,
    onEditComponent: openEditEditor,
  });

  const { deleteMutation, saveMutation } = useTemplateComponentMutations({
    configuration: configurationQuery.data || [],
    deletingComponent,
    draft,
    editingComponentId,
    editorMode,
    onDeleteSuccess: () => setDeletingComponent(null),
    onSaveError: setFormError,
    onSaveSuccess: () => {
      setEditorVisible(false);
      setEditingComponentId(null);
      setDraft(createEmptyDraft());
      setFormError("");
    },
    templateId,
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
    return <PageLoading>{"Loading the template configuration workspace\u2026"}</PageLoading>;
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
  const openCreateEditor = () => {
    setEditorMode("create");
    setEditingComponentId(null);
    setDraft(createEmptyDraft());
    setFormError("");
    setEditorVisible(true);
  };
  const dismissEditor = () => {
    setEditorVisible(false);
    setFormError("");
  };

  return (
    <TemplateConfigureView
      categoryOptions={categoryOptions}
      componentColumns={componentColumns}
      configuredComponents={configuredComponents}
      deletingComponent={deletingComponent}
      deletePending={deleteMutation.isPending}
      draft={draft}
      editorMode={editorMode}
      editorVisible={editorVisible}
      formError={formError}
      navigate={navigate}
      onDelete={() => deleteMutation.mutate()}
      onDeleteDismiss={() => setDeletingComponent(null)}
      onDraftChange={setDraft}
      onEditorDismiss={dismissEditor}
      onOpenCreate={openCreateEditor}
      onSave={() => saveMutation.mutate()}
      savePending={saveMutation.isPending}
      selectedCategory={selectedCategory}
      selectedSafetyOption={selectedSafetyOption}
      selectedTests={selectedTests}
      template={template}
      templateId={templateId}
      testOptions={testOptions}
      totalTests={totalTests}
    />
  );
}

function TemplateConfigureView({
  categoryOptions,
  componentColumns,
  configuredComponents,
  deletingComponent,
  deletePending,
  draft,
  editorMode,
  editorVisible,
  formError,
  navigate,
  onDelete,
  onDeleteDismiss,
  onDraftChange,
  onEditorDismiss,
  onOpenCreate,
  onSave,
  savePending,
  selectedCategory,
  selectedSafetyOption,
  selectedTests,
  template,
  templateId,
  testOptions,
  totalTests,
}: TemplateConfigureViewProps) {
  return (
    <ContentLayout
      header={
        <TemplateConfigureHeader
          onAddComponent={onOpenCreate}
          onBackToTemplate={() => navigate(`/templates/${templateId}`)}
          onOpenCatalog={() => navigate("/catalog")}
          templateName={template.template_name}
        />
      }
    >
      <SpaceBetween size="l">
        <Alert type="info">
          Add components from the button above. Each component becomes part of the reusable template blueprint and
          can carry one or more required test types.
        </Alert>

        <TemplateSummaryCards
          componentCount={configuredComponents.length}
          template={template}
          totalTests={totalTests}
        />

        <TemplateComponentsPanel
          columnDefinitions={componentColumns}
          components={configuredComponents}
          onOpenCreate={onOpenCreate}
        />
      </SpaceBetween>

      <TemplateComponentEditorModal
        categoryOptions={categoryOptions}
        draft={draft}
        editorMode={editorMode}
        formError={formError}
        onDismiss={onEditorDismiss}
        onDraftChange={onDraftChange}
        onSave={onSave}
        savePending={savePending}
        selectedCategory={selectedCategory}
        selectedSafetyOption={selectedSafetyOption}
        selectedTests={selectedTests}
        testOptions={testOptions}
        visible={editorVisible}
      />

      <DeleteTemplateComponentModal
        component={deletingComponent}
        deletePending={deletePending}
        onDelete={onDelete}
        onDismiss={onDeleteDismiss}
      />
    </ContentLayout>
  );
}

type TemplateConfigureHeaderProps = {
  onAddComponent: () => void;
  onBackToTemplate: () => void;
  onOpenCatalog: () => void;
  templateName: string;
};

function TemplateConfigureHeader({
  onAddComponent,
  onBackToTemplate,
  onOpenCatalog,
  templateName,
}: TemplateConfigureHeaderProps) {
  return (
    <Header
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onBackToTemplate}>Back to template</Button>
          <Button onClick={onOpenCatalog}>Open catalog</Button>
          <Button variant="primary" onClick={onAddComponent}>
            Add component
          </Button>
        </SpaceBetween>
      }
      description="Build the component and test blueprint used when this template is applied to assets."
      variant="h1"
    >
      Configure {templateName}
    </Header>
  );
}

type TemplateSummaryCardsProps = {
  componentCount: number;
  template: AssetTemplate;
  totalTests: number;
};

function TemplateSummaryCards({ componentCount, template, totalTests }: TemplateSummaryCardsProps) {
  return (
    <ColumnLayout columns={3} variant="text-grid">
      <Container header={<Header variant="h2">Template</Header>}>
        <SpaceBetween size="xs">
          <Box fontWeight="bold">{template.template_name}</Box>
          <Box color="text-body-secondary">{template.display_id}</Box>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Blueprint</Header>}>
        <SpaceBetween size="xs">
          <Box fontSize="display-l">{componentCount}</Box>
          <Box color="text-body-secondary">components</Box>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Status</Header>}>
        <SpaceBetween size="xs">
          <Badge color={componentCount > 0 ? "green" : "grey"}>
            {componentCount > 0 ? "Configured" : "Draft"}
          </Badge>
          <Box color="text-body-secondary">{totalTests} assigned tests</Box>
        </SpaceBetween>
      </Container>
    </ColumnLayout>
  );
}

type TemplateComponentsPanelProps = {
  columnDefinitions: TableProps<TemplateConfigurationComponent>["columnDefinitions"];
  components: TemplateConfigurationComponent[];
  onOpenCreate: () => void;
};

function TemplateComponentsPanel({
  columnDefinitions,
  components,
  onOpenCreate,
}: TemplateComponentsPanelProps) {
  const emptyState = useMemo(
    () => <TemplateComponentsEmptyState onOpenCreate={onOpenCreate} />,
    [onOpenCreate]
  );
  const tableHeader = useMemo(
    () => <TemplateComponentsHeader count={components.length} onOpenCreate={onOpenCreate} />,
    [components.length, onOpenCreate]
  );

  return (
    <Table
      columnDefinitions={columnDefinitions}
      empty={emptyState}
      header={tableHeader}
      items={components}
      trackBy="template_component_id"
    />
  );
}

type TemplateComponentsActionProps = {
  onOpenCreate: () => void;
};

function TemplateComponentsEmptyState({ onOpenCreate }: TemplateComponentsActionProps) {
  return (
    <PageEmpty
      action={
        <Button variant="primary" onClick={onOpenCreate}>
          Add component
        </Button>
      }
      description="Add the first component to define what assets created from this template should contain."
      title="No components configured"
    />
  );
}

type TemplateComponentsHeaderProps = TemplateComponentsActionProps & {
  count: number;
};

function TemplateComponentsHeader({ count, onOpenCreate }: TemplateComponentsHeaderProps) {
  return (
    <Header
      actions={
        <Button variant="primary" onClick={onOpenCreate}>
          Add component
        </Button>
      }
      counter={`(${count})`}
    >
      Template components
    </Header>
  );
}

type TemplateComponentEditorModalProps = {
  categoryOptions: SelectProps.Option[];
  draft: TemplateComponentFormState;
  editorMode: EditorMode;
  formError: string;
  onDismiss: () => void;
  onDraftChange: Dispatch<SetStateAction<TemplateComponentFormState>>;
  onSave: () => void;
  savePending: boolean;
  selectedCategory: SelectProps.Option | null;
  selectedSafetyOption: SelectProps.Option | null;
  selectedTests: MultiselectProps.Option[];
  testOptions: MultiselectProps.Option[];
  visible: boolean;
};

function TemplateComponentEditorModal({
  categoryOptions,
  draft,
  editorMode,
  formError,
  onDismiss,
  onDraftChange,
  onSave,
  savePending,
  selectedCategory,
  selectedSafetyOption,
  selectedTests,
  testOptions,
  visible,
}: TemplateComponentEditorModalProps) {
  return (
    <Modal
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss}>Cancel</Button>
            <Button loading={savePending} variant="primary" onClick={onSave}>
              Save component
            </Button>
          </SpaceBetween>
        </Box>
      }
      header={editorMode === "create" ? "Add template component" : "Edit template component"}
      onDismiss={onDismiss}
      visible={visible}
    >
      <SpaceBetween size="m">
        {formError ? <Alert type="error">{formError}</Alert> : null}

        <TemplateComponentCoreFields
          categoryOptions={categoryOptions}
          draft={draft}
          onDraftChange={onDraftChange}
          selectedCategory={selectedCategory}
        />

        <TemplateComponentDetailsFields draft={draft} onDraftChange={onDraftChange} />

        <TemplateComponentClassificationFields
          draft={draft}
          onDraftChange={onDraftChange}
          selectedSafetyOption={selectedSafetyOption}
          selectedTests={selectedTests}
          testOptions={testOptions}
        />
      </SpaceBetween>
    </Modal>
  );
}

type TemplateComponentFieldProps = {
  draft: TemplateComponentFormState;
  onDraftChange: Dispatch<SetStateAction<TemplateComponentFormState>>;
};

type TemplateComponentCoreFieldsProps = TemplateComponentFieldProps & {
  categoryOptions: SelectProps.Option[];
  selectedCategory: SelectProps.Option | null;
};

function TemplateComponentCoreFields({
  categoryOptions,
  draft,
  onDraftChange,
  selectedCategory,
}: TemplateComponentCoreFieldsProps) {
  return (
    <SpaceBetween size="m">
      <FormField label="Component name">
        <Input
          value={draft.name}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, name: detail.value }))
          }
        />
      </FormField>
      <FormField label="Category">
        <div data-testid="template-component-category">
          <Select
            options={categoryOptions}
            placeholder="Choose a category"
            selectedOption={selectedCategory}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({
                ...currentDraft,
                category_id: detail.selectedOption.value || "",
              }))
            }
          />
        </div>
      </FormField>
      <FormField label="Description">
        <Textarea
          value={draft.description}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, description: detail.value }))
          }
        />
      </FormField>
    </SpaceBetween>
  );
}

function TemplateComponentDetailsFields({ draft, onDraftChange }: TemplateComponentFieldProps) {
  return (
    <ColumnLayout columns={2}>
      <FormField label="Serial number">
        <Input
          value={draft.serial_number}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, serial_number: detail.value }))
          }
        />
      </FormField>
      <FormField label="Manufacturer">
        <Input
          value={draft.manufacturer}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, manufacturer: detail.value }))
          }
        />
      </FormField>
      <FormField label="Assigned project">
        <Input
          value={draft.assigned_project}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, assigned_project: detail.value }))
          }
        />
      </FormField>
      <FormField label="Location">
        <Input
          value={draft.location}
          onChange={({ detail }) =>
            onDraftChange((currentDraft) => ({ ...currentDraft, location: detail.value }))
          }
        />
      </FormField>
    </ColumnLayout>
  );
}

type TemplateComponentClassificationFieldsProps = TemplateComponentFieldProps & {
  selectedSafetyOption: SelectProps.Option | null;
  selectedTests: MultiselectProps.Option[];
  testOptions: MultiselectProps.Option[];
};

function TemplateComponentClassificationFields({
  draft,
  onDraftChange,
  selectedSafetyOption,
  selectedTests,
  testOptions,
}: TemplateComponentClassificationFieldsProps) {
  return (
    <SpaceBetween size="m">
      <ColumnLayout columns={2}>
        <FormField label="Equipment type">
          <Input
            value={draft.equipment_type}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({ ...currentDraft, equipment_type: detail.value }))
            }
          />
        </FormField>
        <FormField label="Structure">
          <Input
            value={draft.structure}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({ ...currentDraft, structure: detail.value }))
            }
          />
        </FormField>
        <FormField label="Model">
          <Input
            value={draft.model}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({ ...currentDraft, model: detail.value }))
            }
          />
        </FormField>
        <FormField label="Class">
          <Input
            value={draft.class}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({ ...currentDraft, class: detail.value }))
            }
          />
        </FormField>
        <FormField label="Class code">
          <Input
            value={draft.class_code}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({ ...currentDraft, class_code: detail.value }))
            }
          />
        </FormField>
        <FormField label="Safety critical">
          <Select
            options={SAFETY_OPTIONS}
            selectedOption={selectedSafetyOption}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({
                ...currentDraft,
                safety_critical: (detail.selectedOption.value || "NO") as SafetyCritical,
              }))
            }
          />
        </FormField>
      </ColumnLayout>
      <FormField label="Assigned test types">
        <div data-testid="template-component-tests">
          <Multiselect
            options={testOptions}
            placeholder="Choose required tests"
            selectedOptions={selectedTests}
            onChange={({ detail }) =>
              onDraftChange((currentDraft) => ({
                ...currentDraft,
                test_ids: detail.selectedOptions.flatMap((option) => (option.value ? [option.value] : [])),
              }))
            }
          />
        </div>
      </FormField>
    </SpaceBetween>
  );
}

type DeleteTemplateComponentModalProps = {
  component: TemplateConfigurationComponent | null;
  deletePending: boolean;
  onDelete: () => void;
  onDismiss: () => void;
};

function DeleteTemplateComponentModal({
  component,
  deletePending,
  onDelete,
  onDismiss,
}: DeleteTemplateComponentModalProps) {
  return (
    <Modal
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss}>Cancel</Button>
            <Button loading={deletePending} variant="primary" onClick={onDelete}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Delete template component"
      onDismiss={onDismiss}
      visible={Boolean(component)}
    >
      <SpaceBetween size="m">
        <Alert type="warning">This removes the component and its test assignments from this template.</Alert>
        <Box>
          Delete <Box variant="strong">{component?.name}</Box> from this template?
        </Box>
      </SpaceBetween>
    </Modal>
  );
}
