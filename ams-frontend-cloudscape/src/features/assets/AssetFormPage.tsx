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
  createAsset,
  getAsset,
  getTemplatePreview,
  listTemplates,
  updateAsset,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useAuth } from "../../providers/AuthProvider";
import { useFlashbar } from "../../providers/FlashbarProvider";
import type { AssetInput, AssetStatus } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

const DEFAULT_FORM: AssetInput = {
  name: "",
  photo: "",
  datasheet: "",
  description: "",
  status: "ACTIVE",
  location: "",
  assigned_project: "",
  template_id: null,
};

const STATUS_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Maintenance", value: "MAINTENANCE" },
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

  const baseForm = assetQuery.data
    ? {
      name: assetQuery.data.name,
      photo: assetQuery.data.photo || "",
      datasheet: assetQuery.data.datasheet || "",
      description: assetQuery.data.description || "",
      status: assetQuery.data.status,
      location: assetQuery.data.location || "",
      assigned_project: assetQuery.data.assigned_project || "",
      template_id: assetQuery.data.template_id,
    }
    : DEFAULT_FORM;
  const form: AssetInput = { ...baseForm, ...formDraft };

  const selectedTemplateId = form.template_id;
  const templatePreviewQuery = useQuery({
    queryKey: ["template-preview", selectedTemplateId],
    queryFn: () => getTemplatePreview(selectedTemplateId!),
    enabled: Boolean(selectedTemplateId),
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
        success("Asset created", `${createdAsset.name} is ready for component setup.`);
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
  const templateLocked = isEditing;
  const templateSummary = templatePreviewQuery.data;

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setErrorMessage("Asset name is required.");
      return;
    }

    setErrorMessage("");
    saveMutation.mutate({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      assigned_project: form.assigned_project.trim(),
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
                <FormField label="Assigned project">
                  <Input
                    value={form.assigned_project}
                    onChange={({ detail }) =>
                      setForm((current) => ({
                        ...current,
                        assigned_project: detail.value,
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
                <Box>Components appear in the asset workspace left pane.</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificates</Box>
                <Box>Certificates remain nested inside the selected component.</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Status preview</Box>
                <Box>{humanizeEnum(form.status)}</Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Template preview</Header>}>
            {templatesQuery.isError ? (
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
