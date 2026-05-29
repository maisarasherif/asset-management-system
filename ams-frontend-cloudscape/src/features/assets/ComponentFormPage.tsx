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
  Select,
  SpaceBetween,
  Textarea,
  type SelectProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createComponent,
  getAsset,
  getComponent,
  listAllCategories,
  listAllMainCategories,
  updateComponent,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Asset, ComponentInput, SafetyCritical } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

const SAFETY_OPTIONS: SelectProps.Option[] = [
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
];

export function ComponentFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId, componentId } = useParams();
  const { error, success } = useFlashbar();
  const isEditing = Boolean(componentId);
  const [errorMessage, setErrorMessage] = useState("");
  const [formDraft, setForm] = useState<Partial<ComponentInput>>({});

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: listAllCategories,
  });

  const mainCategoriesQuery = useQuery({
    queryKey: ["main-categories", "all"],
    queryFn: listAllMainCategories,
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

  const categoryOptions = useMemo<SelectProps.Option[]>(() => {
    const mainCategoryMap = new Map(
      (mainCategoriesQuery.data || []).map((mainCategory) => [
        mainCategory.main_category_id,
        mainCategory.main_category_name,
      ])
    );

    return (categoriesQuery.data || []).map((category) => ({
      label: category.category_name,
      description: category.main_category_id
        ? mainCategoryMap.get(category.main_category_id) || category.display_id
        : category.display_id,
      value: category.category_id,
    }));
  }, [categoriesQuery.data, mainCategoriesQuery.data]);

  const selectedCategoryOption =
    categoryOptions.find((option) => option.value === form.category_id) ?? null;
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
    categoriesQuery.isLoading ||
    mainCategoriesQuery.isLoading ||
    (isEditing && componentQuery.isLoading)
  ) {
    return <PageLoading>{"Loading component form data\u2026"}</PageLoading>;
  }

  if (assetQuery.isError || categoriesQuery.isError || mainCategoriesQuery.isError) {
    return (
      <PageError
        description="The component form could not load its asset or category references."
        onRetry={() => {
          void assetQuery.refetch();
          void categoriesQuery.refetch();
          void mainCategoriesQuery.refetch();
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

  return renderComponentFormPage({
    asset: assetQuery.data,
    assetId,
    categoryOptions,
    errorMessage,
    form,
    isEditing,
    onCancel: () => navigate(`/assets/${assetId}`),
    onFormChange: updateForm,
    onSubmit: handleSubmit,
    savePending: saveMutation.isPending,
    selectedCategoryOption,
    selectedSafetyOption,
  });
}

interface ComponentFormPageViewProps {
  asset: Asset | undefined;
  assetId: string;
  categoryOptions: SelectProps.Option[];
  errorMessage: string;
  form: ComponentInput;
  isEditing: boolean;
  onCancel: () => void;
  onFormChange: (patch: Partial<ComponentInput>) => void;
  onSubmit: () => void;
  savePending: boolean;
  selectedCategoryOption: SelectProps.Option | null;
  selectedSafetyOption: SelectProps.Option | null;
}

function renderComponentFormPage({
  asset,
  categoryOptions,
  errorMessage,
  form,
  isEditing,
  onCancel,
  onFormChange,
  onSubmit,
  savePending,
  selectedCategoryOption,
  selectedSafetyOption,
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
                <FormField label="Category">
                  <Select
                    options={categoryOptions}
                    placeholder="Select a category"
                    selectedOption={selectedCategoryOption}
                    onChange={({ detail }) =>
                      onFormChange({
                        category_id: detail.selectedOption.value ?? "",
                      })
                    }
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
