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
  Multiselect,
  Select,
  SpaceBetween,
  Textarea,
  type MultiselectProps,
  type SelectProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createAsset,
  getAsset,
  getTemplatePreview,
  listAllEquipmentTypes,
  listProjects,
  listTestTypes,
  listTemplates,
  updateAsset,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { AssetInput, AssetStatus } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

const DEFAULT_FORM: AssetInput = {
  name: "",
  photo: "",
  datasheet: "",
  description: "",
  status: "ACTIVE",
  asset_kind: "COMPONENTIZED",
  location: "",
  assigned_project: "",
  maintenance_interval_hours: 0,
  template_id: null,
};

const STATUS_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Maintenance", value: "MAINTENANCE" },
];

const ASSET_KIND_OPTIONS: SelectProps.Option[] = [
  {
    label: "Componentized asset",
    description: "Use components, categories, templates, and component-level certificates.",
    value: "COMPONENTIZED",
  },
  {
    label: "Single-asset equipment",
    description: "Use one equipment type and asset-level certificate slots.",
    value: "SINGLE_EQUIPMENT",
  },
];

export function AssetFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId } = useParams();
  const { setSelectedAssetId } = useAuth();
  const { error, success } = useFlashbar();
  const isEditing = Boolean(assetId);
  const [formDraft, setForm] = useState<Partial<AssetInput>>({});
  const [errorMessage, setErrorMessage] = useState("");

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const equipmentTypesQuery = useQuery({
    queryKey: ["equipment-types", "all"],
    queryFn: listAllEquipmentTypes,
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const baseForm = assetQuery.data
    ? {
      name: assetQuery.data.name,
      photo: assetQuery.data.photo || "",
      datasheet: assetQuery.data.datasheet || "",
      description: assetQuery.data.description || "",
      status: assetQuery.data.status,
      asset_kind: assetQuery.data.asset_kind,
      location: assetQuery.data.location || "",
      assigned_project: assetQuery.data.assigned_project || "",
      maintenance_interval_hours: assetQuery.data.maintenance_interval_hours || 0,
      template_id: assetQuery.data.template_id,
    }
    : DEFAULT_FORM;
  const form: AssetInput = { ...baseForm, ...formDraft };

  const selectedTemplateId = form.template_id;
  const isSingleEquipment = form.asset_kind === "SINGLE_EQUIPMENT";
  const templatePreviewQuery = useQuery({
    queryKey: ["template-preview", selectedTemplateId],
    queryFn: () => getTemplatePreview(selectedTemplateId!),
    enabled: Boolean(selectedTemplateId) && !isSingleEquipment,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: AssetInput) => {
      if (isEditing && assetId) {
        await updateAsset(assetId, payload);
        return null;
      }
      return createAsset(payload);
    },
    onSuccess: async (createdAsset) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
        queryClient.invalidateQueries({ queryKey: ["templates"] }),
      ]);

      if (createdAsset) {
        setSelectedAssetId(createdAsset.asset_id);
        success(
          "Asset created",
          createdAsset.asset_kind === "SINGLE_EQUIPMENT"
            ? `${createdAsset.name} is ready for certificate review.`
            : `${createdAsset.name} is ready for component setup.`
        );
        navigate(`/assets/${createdAsset.asset_id}`, { replace: true });
        return;
      }

      if (assetId) {
        setSelectedAssetId(assetId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["asset", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
        ]);
        success("Asset updated", "The asset details have been saved.");
        navigate(`/assets/${assetId}`, { replace: true });
      }
    },
    onError: (mutationError: Error) => {
      setErrorMessage(mutationError.message);
      error("Asset save failed", mutationError.message);
    },
  });

  const templateOptions = useMemo<SelectProps.Option[]>(
    () =>
      (templatesQuery.data || []).map((template) => ({
        label: template.template_name,
        description: template.description || template.display_id,
        value: template.template_id,
      })),
    [templatesQuery.data]
  );

  const selectedTemplateOption =
    templateOptions.find((option) => option.value === form.template_id) ?? null;
  const selectedStatusOption =
    STATUS_OPTIONS.find((option) => option.value === form.status) ?? null;
  const selectedAssetKindOption =
    ASSET_KIND_OPTIONS.find((option) => option.value === form.asset_kind) ?? null;
  const projectOptions = useMemo<SelectProps.Option[]>(
    () =>
      (projectsQuery.data || []).map((project) => ({
        label: project.project_name,
        value: project.project_name,
        description: humanizeEnum(project.status),
      })),
    [projectsQuery.data]
  );
  const selectedAssignedProjectOption =
    projectOptions.find((option) => option.value === form.assigned_project) ??
    (form.assigned_project
      ? { label: form.assigned_project, value: form.assigned_project }
      : null);

  const equipmentTypeOptions = useMemo<SelectProps.Option[]>(
    () =>
      (equipmentTypesQuery.data || []).map((equipmentType) => ({
        label: equipmentType.equipment_type_name,
        description: equipmentType.description || equipmentType.display_id,
        value: equipmentType.equipment_type_id,
      })),
    [equipmentTypesQuery.data]
  );
  const selectedEquipmentTypeOption =
    equipmentTypeOptions.find(
      (option) => option.value === form.single_equipment?.equipment_type_id
    ) ?? null;

  const testTypeOptions = useMemo<MultiselectProps.Option[]>(
    () =>
      (testTypesQuery.data || []).map((testType) => ({
        label: testType.test_name,
        description: `${testType.validity_duration} month validity`,
        value: testType.test_id,
      })),
    [testTypesQuery.data]
  );
  const selectedTestOptions = testTypeOptions.filter((option) =>
    form.single_equipment?.test_type_ids.includes(option.value || "")
  );

  if (isEditing && assetQuery.isLoading) {
    return <PageLoading>Loading asset details...</PageLoading>;
  }

  if (isEditing && assetQuery.isError) {
    return (
      <PageError
        description="The asset could not be loaded for editing."
        onRetry={() => void assetQuery.refetch()}
      />
    );
  }

  const pageTitle = isEditing ? "Edit asset" : "Create asset";
  const templateLocked = isEditing || isSingleEquipment;
  const templateSummary = templatePreviewQuery.data;

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setErrorMessage("Asset name is required.");
      return;
    }
    if (form.maintenance_interval_hours < 0) {
      setErrorMessage("Maintenance interval cannot be negative.");
      return;
    }
    if (isSingleEquipment && !isEditing) {
      if (!form.single_equipment?.equipment_type_id) {
        setErrorMessage("Choose an equipment type for this asset.");
        return;
      }
      if (!form.single_equipment.test_type_ids.length) {
        setErrorMessage("Select at least one certificate test type.");
        return;
      }
    }

    setErrorMessage("");
    saveMutation.mutate({
      ...form,
      template_id: isSingleEquipment ? null : form.template_id,
      single_equipment: isSingleEquipment && !isEditing ? form.single_equipment : undefined,
      name: form.name.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      assigned_project: form.assigned_project.trim(),
      maintenance_interval_hours: Number(form.maintenance_interval_hours) || 0,
      photo: form.photo.trim(),
      datasheet: form.datasheet.trim(),
    });
  };

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              {assetId ? (
                <Button onClick={() => navigate(`/assets/${assetId}`)}>Cancel</Button>
              ) : (
                <Button onClick={() => navigate("/assets")}>Cancel</Button>
              )}
              <Button loading={saveMutation.isPending} variant="primary" onClick={handleSubmit}>
                {isEditing ? "Save asset" : "Create asset"}
              </Button>
            </SpaceBetween>
          }
          description="Asset records anchor the dashboard, component pane, and nested certificate workflows."
          variant="h1"
        >
          {pageTitle}
        </Header>
      }
    >
      <ColumnLayout columns={2} variant="text-grid">
        <Container header={<Header variant="h2">Asset information</Header>}>
          <Form>
            <SpaceBetween direction="vertical" size="l">
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              <FormField label="Asset name" stretch>
                <Input
                  value={form.name}
                  onChange={({ detail }) =>
                    setForm((current) => ({ ...current, name: detail.value }))
                  }
                />
              </FormField>

              <ColumnLayout columns={2}>
                <FormField label="Status">
                  <Select
                    options={STATUS_OPTIONS}
                    selectedOption={selectedStatusOption}
                    onChange={({ detail }) =>
                      setForm((current) => ({
                        ...current,
                        status: (detail.selectedOption.value as AssetStatus) ?? current.status,
                      }))
                    }
                  />
                </FormField>
                <FormField
                  description={
                    isEditing
                      ? "Asset creation mode cannot be changed after the asset is created."
                      : "Choose whether this asset has many components or is itself the certified equipment."
                  }
                  label="Asset creation mode"
                >
                  <Select
                    disabled={isEditing}
                    options={ASSET_KIND_OPTIONS}
                    selectedOption={selectedAssetKindOption}
                    onChange={({ detail }) =>
                      setForm((current) => {
                        const nextKind = detail.selectedOption.value as AssetInput["asset_kind"];
                        return {
                          ...current,
                          asset_kind: nextKind,
                          template_id: nextKind === "SINGLE_EQUIPMENT" ? null : current.template_id,
                          single_equipment:
                            nextKind === "SINGLE_EQUIPMENT"
                              ? current.single_equipment || {
                                  equipment_type_id: "",
                                  test_type_ids: [],
                                }
                              : undefined,
                        };
                      })
                    }
                  />
                </FormField>
                <FormField label="Assigned project">
                  <Select
                    loadingText="Loading projects"
                    options={projectOptions}
                    placeholder="Select project"
                    selectedOption={selectedAssignedProjectOption}
                    statusType={projectsQuery.isLoading ? "loading" : "finished"}
                    onChange={({ detail }) =>
                      setForm((current) => ({
                        ...current,
                        assigned_project: detail.selectedOption.value || "",
                      }))
                    }
                  />
                </FormField>
              </ColumnLayout>

              <ColumnLayout columns={2}>
                <FormField label="Location">
                  <Input
                    value={form.location}
                    onChange={({ detail }) =>
                      setForm((current) => ({ ...current, location: detail.value }))
                    }
                  />
                </FormField>
                <FormField label="Maintenance interval (hours)">
                  <Input
                    inputMode="numeric"
                    type="number"
                    value={String(form.maintenance_interval_hours)}
                    onChange={({ detail }) =>
                      setForm((current) => ({
                        ...current,
                        maintenance_interval_hours: Number(detail.value) || 0,
                      }))
                    }
                  />
                </FormField>
              </ColumnLayout>

              {isSingleEquipment && isEditing ? (
                <Alert type="info">
                  Equipment type and certificate slots are managed from the asset workspace after
                  creation.
                </Alert>
              ) : isSingleEquipment ? (
                <ColumnLayout columns={2}>
                  <FormField
                    description="Equipment types are a separate catalog for single-asset equipment."
                    label="Equipment type"
                  >
                    <Select
                      loadingText="Loading equipment types"
                      options={equipmentTypeOptions}
                      placeholder="Select equipment type"
                      selectedOption={selectedEquipmentTypeOption}
                      statusType={equipmentTypesQuery.isLoading ? "loading" : "finished"}
                      onChange={({ detail }) =>
                        setForm((current) => ({
                          ...current,
                          single_equipment: {
                            equipment_type_id: detail.selectedOption.value || "",
                            test_type_ids: current.single_equipment?.test_type_ids || [],
                          },
                        }))
                      }
                    />
                  </FormField>
                  <FormField
                    description="Each selected test type creates a pending certificate slot."
                    label="Certificate test types"
                  >
                    <Multiselect
                      loadingText="Loading test types"
                      options={testTypeOptions}
                      placeholder="Select certificate test types"
                      selectedOptions={selectedTestOptions}
                      statusType={testTypesQuery.isLoading ? "loading" : "finished"}
                      onChange={({ detail }) =>
                        setForm((current) => ({
                          ...current,
                          single_equipment: {
                            equipment_type_id:
                              current.single_equipment?.equipment_type_id || "",
                            test_type_ids: detail.selectedOptions
                              .map((option) => option.value || "")
                              .filter(Boolean),
                          },
                        }))
                      }
                    />
                  </FormField>
                </ColumnLayout>
              ) : (
                <ColumnLayout columns={2}>
                  <FormField
                    description={
                      templateLocked
                        ? "Templates can only be assigned during asset creation."
                        : "Optional. A template can prebuild the asset's components and tests."
                    }
                    label="Template"
                  >
                    <Select
                      disabled={templateLocked || templatesQuery.isLoading}
                      loadingText="Loading templates"
                      options={templateOptions}
                      placeholder="Select a template"
                      selectedOption={selectedTemplateOption}
                      statusType={templatesQuery.isLoading ? "loading" : "finished"}
                      onChange={({ detail }) =>
                        setForm((current) => ({
                          ...current,
                          template_id: detail.selectedOption.value ?? null,
                        }))
                      }
                    />
                  </FormField>
                </ColumnLayout>
              )}

              <FormField label="Description">
                <Textarea
                  rows={6}
                  value={form.description}
                  onChange={({ detail }) =>
                    setForm((current) => ({ ...current, description: detail.value }))
                  }
                />
              </FormField>

              <ColumnLayout columns={2}>
                <FormField label="Photo URL">
                  <Input
                    type="url"
                    value={form.photo}
                    onChange={({ detail }) =>
                      setForm((current) => ({ ...current, photo: detail.value }))
                    }
                  />
                </FormField>
                <FormField label="Datasheet URL">
                  <Input
                    type="url"
                    value={form.datasheet}
                    onChange={({ detail }) =>
                      setForm((current) => ({ ...current, datasheet: detail.value }))
                    }
                  />
                </FormField>
              </ColumnLayout>
            </SpaceBetween>
          </Form>
        </Container>

        <SpaceBetween direction="vertical" size="l">
          <Container header={<Header variant="h2">Workspace impact</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Dashboard scope</Box>
                <Box>Each asset drives its own donut and certificate summary.</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Component navigation</Box>
                <Box>
                  {isSingleEquipment
                    ? "The asset workspace opens directly to equipment certificates."
                    : "Components appear in the asset workspace left pane."}
                </Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificates</Box>
                <Box>
                  {isSingleEquipment
                    ? "Certificate slots are created from the selected test types."
                    : "Certificates remain nested inside the selected component."}
                </Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Status preview</Box>
                <Box>{humanizeEnum(form.status)}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Routine maintenance</Box>
                <Box>
                  {form.maintenance_interval_hours > 0
                    ? `Every ${form.maintenance_interval_hours.toLocaleString()} hours`
                    : "Not configured"}
                </Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">{isSingleEquipment ? "Equipment preview" : "Template preview"}</Header>}>
            {isSingleEquipment ? (
              <SpaceBetween direction="vertical" size="s">
                <div className="summary-row">
                  <Box variant="awsui-key-label">Equipment type</Box>
                  <Box>{selectedEquipmentTypeOption?.label || (isEditing ? "Configured" : "Not selected")}</Box>
                </div>
                <div className="summary-row">
                  <Box variant="awsui-key-label">Certificate slots</Box>
                  <Box>{isEditing ? "Managed in workspace" : selectedTestOptions.length}</Box>
                </div>
                <Box color="text-body-secondary">
                  {isEditing
                    ? "Single-asset equipment keeps certificates at the asset level."
                    : "Creating this asset will create one internal equipment bridge and pending certificates."}
                </Box>
              </SpaceBetween>
            ) : templatesQuery.isError ? (
              <Alert type="error">Templates could not be loaded.</Alert>
            ) : selectedTemplateId ? (
              templatePreviewQuery.isLoading ? (
                <Box color="text-body-secondary">Loading template composition...</Box>
              ) : templatePreviewQuery.isError ? (
                <Alert type="warning">
                  The template summary could not be loaded. You can still save the asset.
                </Alert>
              ) : templateSummary ? (
                <SpaceBetween direction="vertical" size="s">
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Components to create</Box>
                    <Box>{templateSummary.totalComponents}</Box>
                  </div>
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Tests to create</Box>
                    <Box>{templateSummary.totalTests}</Box>
                  </div>
                  <Box color="text-body-secondary">
                    Creating the asset with this template will spin up its component structure immediately.
                  </Box>
                </SpaceBetween>
              ) : (
                <Box color="text-body-secondary">No template summary is available.</Box>
              )
            ) : (
              <Box color="text-body-secondary">
                Select a template if you want the backend to prebuild the asset's component structure.
              </Box>
            )}
          </Container>
        </SpaceBetween>
      </ColumnLayout>
    </ContentLayout>
  );
}
