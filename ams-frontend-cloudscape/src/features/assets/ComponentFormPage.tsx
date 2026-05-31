import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
  Textarea,
  type SelectProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createComponent,
  getAsset,
  getComponent,
  listAllCatalogScopeCategories,
  listCatalogScopes,
  updateComponent,
} from "../../lib/api/ams";
import { Select } from "../../components/shared/OptimizedSelect";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  Asset,
  CatalogScope,
  CatalogScopeCategory,
  ComponentInput,
  SafetyCritical,
} from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

const SAFETY_OPTIONS: SelectProps.Option[] = [
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
];

type CategorySelectOption = SelectProps.Option & { categoryId?: string };

function findCategoryScopeId(
  categoriesByScope: CatalogScopeCategory[][],
  scopeCategoryId?: string
) {
  if (!scopeCategoryId) {
    return "";
  }
  for (const categories of categoriesByScope) {
    const match = categories.find((category) => category.scope_category_id === scopeCategoryId);
    if (match) {
      return match.scope_id;
    }
  }
  return "";
}

export function ComponentFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId, componentId } = useParams();
  const { error, success } = useFlashbar();
  const isEditing = Boolean(componentId);
  const [errorMessage, setErrorMessage] = useState("");
  const [formDraft, setForm] = useState<Partial<ComponentInput>>({});
  const [selectedScopeId, setSelectedScopeId] = useState("");

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const catalogScopesQuery = useQuery({
    queryKey: ["catalog-scopes"],
    queryFn: listCatalogScopes,
  });

  const categoriesQuery = useQuery({
    queryKey: ["catalog-scope-categories", selectedScopeId, "component-form"],
    queryFn: () => listAllCatalogScopeCategories(selectedScopeId),
    enabled: Boolean(selectedScopeId),
  });

  const allScopeCategoriesQuery = useQuery({
    queryKey: ["catalog-scope-categories", "component-form", "all-scopes"],
    queryFn: () =>
      Promise.all(
        (catalogScopesQuery.data || []).map((scope) =>
          listAllCatalogScopeCategories(scope.scope_id)
        )
      ),
    enabled: isEditing && Boolean(catalogScopesQuery.data?.length),
  });

  const componentQuery = useQuery({
    queryKey: ["component", componentId],
    queryFn: () => getComponent(componentId!),
    enabled: Boolean(componentId),
  });

  const baseForm: ComponentInput = componentQuery.data
    ? {
      asset_id: componentQuery.data.asset_id,
      category_id: componentQuery.data.category_id || "",
      scope_category_id: componentQuery.data.scope_category_id || undefined,
      name: componentQuery.data.name,
      serial_number: componentQuery.data.serial_number || "",
      manufacturer: componentQuery.data.manufacturer || "",
      description: componentQuery.data.description || "",
      location: componentQuery.data.location || "",
      assigned_project: componentQuery.data.assigned_project || "",
      equipment_type: componentQuery.data.equipment_type || "",
      structure: componentQuery.data.structure || "",
      model: componentQuery.data.model || "",
      class: componentQuery.data.class || "",
      class_code: componentQuery.data.class_code || "",
      safety_critical: componentQuery.data.safety_critical,
    }
    : {
      asset_id: assetId ?? "",
      category_id: "",
      name: "",
      serial_number: "",
      manufacturer: "",
      description: "",
      location: "",
      assigned_project: "",
      equipment_type: "",
      structure: "",
      model: "",
      class: "",
      class_code: "",
      safety_critical: "NO",
    };
  const form: ComponentInput = { ...baseForm, ...formDraft };

  useEffect(() => {
    if (!selectedScopeId && catalogScopesQuery.data?.[0]) {
      setSelectedScopeId(catalogScopesQuery.data[0].scope_id);
    }
  }, [catalogScopesQuery.data, selectedScopeId]);

  useEffect(() => {
    const scopeId = findCategoryScopeId(
      allScopeCategoriesQuery.data || [],
      componentQuery.data?.scope_category_id ?? undefined
    );
    if (scopeId && scopeId !== selectedScopeId) {
      setSelectedScopeId(scopeId);
    }
  }, [allScopeCategoriesQuery.data, componentQuery.data?.scope_category_id, selectedScopeId]);

  const scopeOptions = useMemo<SelectProps.Option[]>(
    () =>
      (catalogScopesQuery.data || []).map((scope: CatalogScope) => ({
        label: scope.scope_name,
        value: scope.scope_id,
        description: scope.description || scope.display_id,
      })),
    [catalogScopesQuery.data]
  );
  const selectedScopeOption =
    scopeOptions.find((option) => option.value === selectedScopeId) ?? null;

  const categoryOptions = useMemo<CategorySelectOption[]>(() => {
    return (categoriesQuery.data || []).map((category) => ({
      label: `${category.main_category_name} > ${category.category_name}`,
      description: category.category_display_id,
      value: category.scope_category_id,
      categoryId: category.category_id,
    }));
  }, [categoriesQuery.data]);

  const selectedCategoryOption =
    categoryOptions.find(
      (option) => option.value === form.scope_category_id || option.categoryId === form.category_id
    ) ?? null;
  const selectedSafetyOption =
    SAFETY_OPTIONS.find((option) => option.value === form.safety_critical) ?? null;

  const saveMutation = useMutation({
    mutationFn: async (payload: ComponentInput) => {
      if (isEditing && componentId) {
        await updateComponent(componentId, payload);
        return null;
      }
      return createComponent(payload);
    },
    onSuccess: async (createdComponent) => {
      if (!assetId) return;

      if (createdComponent) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["components", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
        ]);
        success("Component created", `${createdComponent.name} is ready for certificates.`);
        navigate(`/assets/${assetId}?component=${createdComponent.component_id}`, {
          replace: true,
        });
        return;
      }

      if (componentId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["components", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["component", componentId] }),
        ]);
        success("Component updated", "The component details have been saved.");
        navigate(`/assets/${assetId}?component=${componentId}`, { replace: true });
      }
    },
    onError: (mutationError: Error) => {
      setErrorMessage(mutationError.message);
      error("Component save failed", mutationError.message);
    },
  });

  if (!assetId) {
    return <PageError description="The asset route is missing." title="Invalid route" />;
  }

  if (
    assetQuery.isLoading ||
    catalogScopesQuery.isLoading ||
    (isEditing && allScopeCategoriesQuery.isLoading) ||
    (Boolean(catalogScopesQuery.data?.length) && !selectedScopeId) ||
    categoriesQuery.isLoading ||
    (isEditing && componentQuery.isLoading)
  ) {
    return <PageLoading>{"Loading component form data\u2026"}</PageLoading>;
  }

  if (
    assetQuery.isError ||
    catalogScopesQuery.isError ||
    categoriesQuery.isError ||
    (isEditing && allScopeCategoriesQuery.isError)
  ) {
    return (
      <PageError
        description="The component form could not load its asset or category references."
        onRetry={() => {
          void assetQuery.refetch();
          void catalogScopesQuery.refetch();
          void categoriesQuery.refetch();
          if (isEditing) {
            void allScopeCategoriesQuery.refetch();
          }
        }}
      />
    );
  }

  if (isEditing && componentQuery.isError) {
    return (
      <PageError
        description="The component could not be loaded for editing."
        onRetry={() => void componentQuery.refetch()}
      />
    );
  }

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setErrorMessage("Component name is required.");
      return;
    }

    if (!form.category_id) {
      setErrorMessage("Choose a category for this component.");
      return;
    }

    setErrorMessage("");
    saveMutation.mutate({
      ...form,
      asset_id: assetId,
      name: form.name.trim(),
      description: form.description.trim(),
      serial_number: form.serial_number.trim(),
      manufacturer: form.manufacturer.trim(),
      location: form.location.trim(),
      assigned_project: form.assigned_project.trim(),
      equipment_type: form.equipment_type.trim(),
      structure: form.structure.trim(),
      model: form.model.trim(),
      class: form.class.trim(),
      class_code: form.class_code.trim(),
    });
  };

  const updateForm = (patch: Partial<ComponentInput>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateScope = (scopeId: string) => {
    setSelectedScopeId(scopeId);
    setForm((current) => ({ ...current, category_id: "", scope_category_id: "" }));
  };

  return renderComponentFormPage({
    asset: assetQuery.data,
    assetId,
    categoryOptions,
    errorMessage,
    form,
    isEditing,
    onCancel: () => navigate(`/assets/${assetId}`),
    onFormChange: updateForm,
    onScopeChange: updateScope,
    onSubmit: handleSubmit,
    savePending: saveMutation.isPending,
    selectedCategoryOption,
    selectedSafetyOption,
    selectedScopeOption,
    scopeOptions,
  });
}

interface ComponentFormPageViewProps {
  asset: Asset | undefined;
  assetId: string;
  categoryOptions: CategorySelectOption[];
  errorMessage: string;
  form: ComponentInput;
  isEditing: boolean;
  onCancel: () => void;
  onFormChange: (patch: Partial<ComponentInput>) => void;
  onScopeChange: (scopeId: string) => void;
  onSubmit: () => void;
  savePending: boolean;
  selectedCategoryOption: CategorySelectOption | null;
  selectedSafetyOption: SelectProps.Option | null;
  selectedScopeOption: SelectProps.Option | null;
  scopeOptions: SelectProps.Option[];
}

function renderComponentFormPage({
  asset,
  categoryOptions,
  errorMessage,
  form,
  isEditing,
  onCancel,
  onFormChange,
  onScopeChange,
  onSubmit,
  savePending,
  selectedCategoryOption,
  selectedSafetyOption,
  selectedScopeOption,
  scopeOptions,
}: ComponentFormPageViewProps) {
  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={onCancel}>Cancel</Button>
              <Button loading={savePending} variant="primary" onClick={onSubmit}>
                {isEditing ? "Save component" : "Create component"}
              </Button>
            </SpaceBetween>
          }
          description="Components stay nested inside the asset workspace and drive the certificate pane."
          variant="h1"
        >
          {isEditing ? "Edit component" : "Create component"}
        </Header>
      }
    >
      <ColumnLayout columns={2} variant="text-grid">
        <Container header={<Header variant="h2">Component information</Header>}>
          <Form>
            <SpaceBetween direction="vertical" size="l">
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              <FormField label="Component name">
                <Input
                  value={form.name}
                  onChange={({ detail }) => onFormChange({ name: detail.value })}
                />
              </FormField>

              <ColumnLayout columns={2}>
                <FormField label="Catalog scope">
                  <Select
                    options={scopeOptions}
                    placeholder="Select a catalog scope"
                    selectedOption={selectedScopeOption}
                    onChange={({ detail }) => onScopeChange(detail.selectedOption.value || "")}
                  />
                </FormField>
                <FormField label="Category">
                  <Select
                    filteringType="auto"
                    filteringAriaLabel="Filter categories"
                    filteringPlaceholder="Find category"
                    options={categoryOptions}
                    placeholder="Select a category"
                    selectedOption={selectedCategoryOption}
                    virtualScroll
                    onChange={({ detail }) => {
                      const selectedOption = detail.selectedOption as CategorySelectOption;
                      return onFormChange({
                        category_id: String(selectedOption.categoryId || ""),
                        scope_category_id: selectedOption.value ?? "",
                      });
                    }}
                  />
                </FormField>
                <FormField label="Safety critical">
                  <Select
                    options={SAFETY_OPTIONS}
                    selectedOption={selectedSafetyOption}
                    onChange={({ detail }) =>
                      onFormChange({
                        safety_critical:
                          (detail.selectedOption.value as SafetyCritical) ?? form.safety_critical,
                      })
                    }
                  />
                </FormField>
              </ColumnLayout>

              <ColumnLayout columns={2}>
                <FormField label="Serial number">
                  <Input
                    value={form.serial_number}
                    onChange={({ detail }) => onFormChange({ serial_number: detail.value })}
                  />
                </FormField>
                <FormField label="Manufacturer">
                  <Input
                    value={form.manufacturer}
                    onChange={({ detail }) => onFormChange({ manufacturer: detail.value })}
                  />
                </FormField>
              </ColumnLayout>

              <ColumnLayout columns={3}>
                <FormField label="Equipment type">
                  <Input
                    value={form.equipment_type}
                    onChange={({ detail }) => onFormChange({ equipment_type: detail.value })}
                  />
                </FormField>
                <FormField label="Structure">
                  <Input
                    value={form.structure}
                    onChange={({ detail }) => onFormChange({ structure: detail.value })}
                  />
                </FormField>
                <FormField label="Model">
                  <Input
                    value={form.model}
                    onChange={({ detail }) => onFormChange({ model: detail.value })}
                  />
                </FormField>
              </ColumnLayout>

              <ColumnLayout columns={3}>
                <FormField label="Class">
                  <Input
                    value={form.class}
                    onChange={({ detail }) => onFormChange({ class: detail.value })}
                  />
                </FormField>
                <FormField label="Class code">
                  <Input
                    value={form.class_code}
                    onChange={({ detail }) => onFormChange({ class_code: detail.value })}
                  />
                </FormField>
                <FormField label="Location">
                  <Input
                    value={form.location}
                    onChange={({ detail }) => onFormChange({ location: detail.value })}
                  />
                </FormField>
              </ColumnLayout>

              <FormField label="Assigned project">
                <Input
                  value={form.assigned_project}
                  onChange={({ detail }) => onFormChange({ assigned_project: detail.value })}
                />
              </FormField>

              <FormField label="Description">
                <Textarea
                  rows={6}
                  value={form.description}
                  onChange={({ detail }) => onFormChange({ description: detail.value })}
                />
              </FormField>
            </SpaceBetween>
          </Form>
        </Container>

        <SpaceBetween direction="vertical" size="l">
          <Container header={<Header variant="h2">Asset context</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Asset</Box>
                <Box>{asset?.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Display ID</Box>
                <Box>{asset?.display_id}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Location</Box>
                <Box>{asset?.location || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificate workflow</Box>
                <Box>Certificates will live under this component inside the asset workspace.</Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Selection summary</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Category</Box>
                <Box>{selectedCategoryOption?.label || "Not selected"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Safety critical</Box>
                <Box>{humanizeEnum(form.safety_critical)}</Box>
              </div>
              <Box color="text-body-secondary">
                Keep the component detail focused. Operators will select it from the left pane to review certificates on the right.
              </Box>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </ColumnLayout>
    </ContentLayout>
  );
}
