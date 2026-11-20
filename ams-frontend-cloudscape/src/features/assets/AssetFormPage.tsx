import { PagedMultiselect, PagedSelect } from "../../components/shared/PagedSelect";
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
  type MultiselectProps,
  type SelectProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createAsset,
  getAsset,
  getTemplatePreview,
  getTemplate,
  listEquipmentTypes,
  searchProjects,
  searchTestTypes,
  searchTemplates,
  updateAsset,
} from "../../lib/api/ams";
import { Select } from "../../components/shared/OptimizedSelect";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { AssetInput, AssetStatus, AssetTemplate, EquipmentType, Project, TestType } from "../../types/ams";
import { formatRenewalDuration, humanizeEnum } from "../../utils/format";

type AssetFormViewProps = {
  assetId: string | undefined;
  errorMessage: string;
  form: AssetInput;
  isEditing: boolean;
  isSingleEquipment: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onFormChange: Dispatch<SetStateAction<Partial<AssetInput>>>;
  onSubmit: () => void;
  pageTitle: string;
  savePending: boolean;
  selectedAssignedProjectOption: SelectProps.Option | null;
  selectedAssetKindOption: SelectProps.Option | null;
  selectedEquipmentTypeOption: SelectProps.Option | null;
  selectedStatusOption: SelectProps.Option | null;
  selectedTemplateId: string | null;
  selectedTemplateOption: SelectProps.Option | null;
  setTemplateOption: (option: SelectProps.Option | null) => void;
  setEquipmentOption: (option: SelectProps.Option | null) => void;
  setTestOptions: (options: MultiselectProps.Option[]) => void;
  selectedTestOptions: MultiselectProps.Option[];
  templateLocked: boolean;
  templatePreviewError: boolean;
  templatePreviewLoading: boolean;
  templateSummary: Awaited<ReturnType<typeof getTemplatePreview>> | undefined;
};

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

const toProjectOption = (project: Project) => ({
  label: project.project_name, value: project.project_name, description: humanizeEnum(project.status),
});
const toTemplateOption = (template: AssetTemplate) => ({
  label: template.template_name, value: template.template_id, description: template.description || template.display_id,
});
const toEquipmentOption = (item: EquipmentType) => ({
  label: item.equipment_type_name, value: item.equipment_type_id, description: item.description || item.display_id,
});
const toTestOption = (item: TestType) => ({
  label: item.test_name, value: item.test_id, description: formatRenewalDuration(item.requires_renewal, item.validity_duration),
});

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

  const [equipmentOption, setEquipmentOption] = useState<SelectProps.Option | null>(null);
  const [templateOption, setTemplateOption] = useState<SelectProps.Option | null>(null);
  const [testOptions, setTestOptions] = useState<MultiselectProps.Option[]>([]);

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
      if (createdAsset) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["assets"] }),
          queryClient.invalidateQueries({ queryKey: ["templates"] }),
        ]);
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
          queryClient.invalidateQueries({ queryKey: ["assets"] }),
          queryClient.invalidateQueries({ queryKey: ["templates"] }),
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

  const existingTemplate = useQuery({
    queryKey: ["template", selectedTemplateId],
    queryFn: () => getTemplate(selectedTemplateId!),
    enabled: Boolean(isEditing && selectedTemplateId),
  });
  const selectedTemplateOption = existingTemplate.data ? toTemplateOption(existingTemplate.data) :
    templateOption?.value === selectedTemplateId ? templateOption : null;
  const selectedStatusOption = STATUS_OPTIONS.find((option) => option.value === form.status) ?? null;
  const selectedAssetKindOption = ASSET_KIND_OPTIONS.find((option) => option.value === form.asset_kind) ?? null;
  const selectedAssignedProjectOption = form.assigned_project
    ? { label: form.assigned_project, value: form.assigned_project } : null;
  const selectedEquipmentTypeOption = equipmentOption?.value === form.single_equipment?.equipment_type_id
    ? equipmentOption : null;
  const selectedTestOptions = testOptions.filter((option) => form.single_equipment?.test_type_ids.includes(option.value ?? ""));

  if (isEditing && assetQuery.isLoading) {
    return <PageLoading>{"Loading asset details\u2026"}</PageLoading>;
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
    <AssetFormView
      assetId={assetId}
      errorMessage={errorMessage}
      form={form}
      isEditing={isEditing}
      isSingleEquipment={isSingleEquipment}
      navigate={navigate}
      onFormChange={setForm}
      onSubmit={handleSubmit}
      pageTitle={pageTitle}
      savePending={saveMutation.isPending}
      selectedAssignedProjectOption={selectedAssignedProjectOption}
      selectedAssetKindOption={selectedAssetKindOption}
      selectedEquipmentTypeOption={selectedEquipmentTypeOption}
      selectedStatusOption={selectedStatusOption}
      selectedTemplateId={selectedTemplateId}
      selectedTemplateOption={selectedTemplateOption}
      selectedTestOptions={selectedTestOptions}
      setTemplateOption={setTemplateOption}
      setEquipmentOption={setEquipmentOption}
      setTestOptions={setTestOptions}
      templateLocked={templateLocked}
      templatePreviewError={templatePreviewQuery.isError}
      templatePreviewLoading={templatePreviewQuery.isLoading}
      templateSummary={templateSummary}
    />
  );
}

function AssetFormView(props: AssetFormViewProps) {
  return (
    <ContentLayout header={<AssetFormHeader {...props} />}>
      <ColumnLayout columns={2} variant="text-grid">
        <AssetInformation {...props} />
        <SpaceBetween direction="vertical" size="l">
          <WorkspaceImpact form={props.form} isSingleEquipment={props.isSingleEquipment} />
          <TemplateOrEquipmentPreview {...props} />
        </SpaceBetween>
      </ColumnLayout>
    </ContentLayout>
  );
}

function AssetFormHeader({
  assetId,
  isEditing,
  navigate,
  onSubmit,
  pageTitle,
  savePending,
}: AssetFormViewProps) {
  return (
    <Header
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          {assetId ? (
            <Button onClick={() => navigate(`/assets/${assetId}`)}>Cancel</Button>
          ) : (
            <Button onClick={() => navigate("/assets")}>Cancel</Button>
          )}
          <Button loading={savePending} variant="primary" onClick={onSubmit}>
            {isEditing ? "Save asset" : "Create asset"}
          </Button>
        </SpaceBetween>
      }
      description="Asset records anchor the dashboard, component pane, and nested certificate workflows."
      variant="h1"
    >
      {pageTitle}
    </Header>
  );
}

function AssetInformation(props: AssetFormViewProps) {
  const {
    errorMessage,
    form,
    isEditing,
    onFormChange,
    selectedAssignedProjectOption,
    selectedAssetKindOption,
    selectedStatusOption,
  } = props;

  return (
    <Container header={<Header variant="h2">Asset information</Header>}>
      <Form>
        <SpaceBetween direction="vertical" size="l">
          {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
          <FormField label="Asset name" stretch>
            <Input
              value={form.name}
              onChange={({ detail }) => onFormChange((current) => ({ ...current, name: detail.value }))}
            />
          </FormField>

          <ColumnLayout columns={2}>
            <FormField label="Status">
              <Select
                options={STATUS_OPTIONS}
                selectedOption={selectedStatusOption}
                onChange={({ detail }) =>
                  onFormChange((current) => ({
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
              <div data-testid="asset-kind-select">
                <Select
                  disabled={isEditing}
                  options={ASSET_KIND_OPTIONS}
                  selectedOption={selectedAssetKindOption}
                  onChange={({ detail }) =>
                    onFormChange((current) => {
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
              </div>
            </FormField>
            <FormField label="Assigned project">
              <PagedSelect label="Assigned project" queryKey={["projects", "asset-assignment"]}
                allLabel="No project - warehouse" load={(page, search) => searchProjects({ page, search, limit: 20 })}
                getOption={toProjectOption} selected={selectedAssignedProjectOption}
                onSelect={(option) => onFormChange((current) => ({ ...current, assigned_project: option?.value ?? "" }))} />
            </FormField>
          </ColumnLayout>

          <ColumnLayout columns={2}>
            <FormField label="Location">
              <Input
                value={form.location}
                onChange={({ detail }) => onFormChange((current) => ({ ...current, location: detail.value }))}
              />
            </FormField>
            <FormField label="Maintenance interval (hours)">
              <Input
                inputMode="numeric"
                type="number"
                value={String(form.maintenance_interval_hours)}
                onChange={({ detail }) =>
                  onFormChange((current) => ({
                    ...current,
                    maintenance_interval_hours: Number(detail.value) || 0,
                  }))
                }
              />
            </FormField>
          </ColumnLayout>

          <AssetModeFields {...props} />

          <FormField label="Description">
            <Textarea
              rows={6}
              value={form.description}
              onChange={({ detail }) => onFormChange((current) => ({ ...current, description: detail.value }))}
            />
          </FormField>

          <ColumnLayout columns={2}>
            <FormField label="Photo URL">
              <Input
                type="url"
                value={form.photo}
                onChange={({ detail }) => onFormChange((current) => ({ ...current, photo: detail.value }))}
              />
            </FormField>
            <FormField label="Datasheet URL">
              <Input
                type="url"
                value={form.datasheet}
                onChange={({ detail }) => onFormChange((current) => ({ ...current, datasheet: detail.value }))}
              />
            </FormField>
          </ColumnLayout>
        </SpaceBetween>
      </Form>
    </Container>
  );
}

function AssetModeFields({
  isEditing,
  isSingleEquipment,
  onFormChange,
  selectedEquipmentTypeOption,
  selectedTemplateOption,
  selectedTestOptions,
  setTemplateOption,
  setEquipmentOption,
  setTestOptions,
  templateLocked,
}: AssetFormViewProps) {
  if (isSingleEquipment && isEditing) {
    return (
      <Alert type="info">
        Equipment type and certificate slots are managed from the asset workspace after creation.
      </Alert>
    );
  }

  if (isSingleEquipment) {
    return (
      <ColumnLayout columns={2}>
        <FormField
          description="Equipment types are a separate catalog for single-asset equipment."
          label="Equipment type"
        >
          <div data-testid="single-equipment-type-select">
            <PagedSelect label="Equipment type" queryKey={["equipment-types", "asset-picker"]}
              load={(page, search) => listEquipmentTypes(page, 20, { search })}
              getOption={toEquipmentOption} selected={selectedEquipmentTypeOption}
              onSelect={(option) => {
                setEquipmentOption(option);
                onFormChange((current) => ({ ...current, single_equipment: {
                  equipment_type_id: option?.value ?? "",
                  test_type_ids: current.single_equipment?.test_type_ids ?? [],
                } }));
              }} />
          </div>
        </FormField>
        <FormField
          description="Each selected test type creates a pending certificate slot."
          label="Certificate test types"
        >
          <div data-testid="single-equipment-test-types">
            <PagedMultiselect label="Certificate test types" queryKey={["test-types", "equipment-picker"]}
              load={(page, search) => searchTestTypes({ page, search, limit: 20 })}
              getOption={toTestOption} selected={selectedTestOptions}
              onSelect={(options) => {
                setTestOptions([...options]);
                onFormChange((current) => ({ ...current, single_equipment: {
                  equipment_type_id: current.single_equipment?.equipment_type_id ?? "",
                  test_type_ids: options.flatMap((option) => option.value ? [option.value] : []),
                } }));
              }} />
          </div>
        </FormField>
      </ColumnLayout>
    );
  }

  return (
    <ColumnLayout columns={2}>
      <FormField
        description={
          templateLocked
            ? "Templates can only be assigned during asset creation."
            : "Optional. A template can prebuild the asset's components and tests."
        }
        label="Template"
      >
        <PagedSelect label="Asset template" queryKey={["templates", "asset-picker"]}
          allLabel="No template" disabled={templateLocked} selected={selectedTemplateOption}
          load={(page, search) => searchTemplates({ page, search, limit: 20 })} getOption={toTemplateOption}
          onSelect={(option) => {
            setTemplateOption(option);
            onFormChange((current) => ({ ...current, template_id: option?.value ?? null }));
          }} />
      </FormField>
    </ColumnLayout>
  );
}

function WorkspaceImpact({
  form,
  isSingleEquipment,
}: {
  form: AssetInput;
  isSingleEquipment: boolean;
}) {
  return (
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
  );
}

function TemplateOrEquipmentPreview(props: AssetFormViewProps) {
  return (
    <Container
      header={<Header variant="h2">{props.isSingleEquipment ? "Equipment preview" : "Template preview"}</Header>}
    >
      {props.isSingleEquipment ? <EquipmentPreview {...props} /> : <TemplatePreview {...props} />}
    </Container>
  );
}

function EquipmentPreview({
  isEditing,
  selectedEquipmentTypeOption,
  selectedTestOptions,
}: AssetFormViewProps) {
  return (
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
  );
}

function TemplatePreview({
  selectedTemplateId,
  templatePreviewError,
  templatePreviewLoading,
  templateSummary,
}: AssetFormViewProps) {
  if (!selectedTemplateId) {
    return (
      <Box color="text-body-secondary">
        Select a template if you want the backend to prebuild the asset's component structure.
      </Box>
    );
  }

  if (templatePreviewLoading) {
    return <Box color="text-body-secondary">{"Loading template composition\u2026"}</Box>;
  }

  if (templatePreviewError) {
    return (
      <Alert type="warning">
        The template summary could not be loaded. You can still save the asset.
      </Alert>
    );
  }

  if (!templateSummary) {
    return <Box color="text-body-secondary">No template summary is available.</Box>;
  }

  return (
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
  );
}
