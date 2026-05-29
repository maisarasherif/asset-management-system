import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FileUpload,
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
import { type Dispatch, type ReactNode, type SetStateAction, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createCertificate,
  getAsset,
  getCertificate,
  getComponent,
  listActiveCompetentPersons,
  listTestTypes,
  patchCertificate,
  uploadCertificateFile,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  Asset,
  Certificate,
  CertificateInput,
  ComponentRecord,
  CompetentPerson,
  PatchCertificateInput,
  TestType,
} from "../../types/ams";
import { formatMonthDuration, toDateInputValue, toIsoDate } from "../../utils/format";

type CertificateFormState = {
  component_id: string;
  test_id: string;
  certificate_name: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
};

type CertificateFormDraft = Partial<CertificateFormState> & { selectedCompetentPersonId?: string };
type FormDraftSetter = Dispatch<SetStateAction<CertificateFormDraft>>;
type CompetentPersonsStatus = "loading" | "finished";

type SaveCertificateInput = CertificateInput | PatchCertificateInput;

function addMonths(dateValue: string, months: number) {
  if (!dateValue || !Number.isFinite(months) || months <= 0) {
    return "";
  }
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function buildPatchPayload(baseForm: CertificateFormState, nextForm: CertificateFormState): PatchCertificateInput {
  const payload: PatchCertificateInput = {};
  const fields: Array<keyof CertificateFormState> = [
    "component_id",
    "certificate_name",
    "issuing_authority",
    "test_id",
    "imca_ref",
    "imca_d018",
    "maintenance_notes",
  ];

  for (const field of fields) {
    const nextValue = nextForm[field].trim();
    if (nextValue !== baseForm[field]) {
      payload[field] = nextValue;
    }
  }

  return payload;
}

function getCertificateBaseForm(certificate?: Certificate | null): CertificateFormState {
  return {
    component_id: certificate?.component_id ?? "",
    test_id: certificate?.test_id ?? "",
    certificate_name: certificate?.certificate_name ?? "",
    issuing_authority: certificate?.issuing_authority ?? "",
    issue_date: toDateInputValue(certificate?.issue_date),
    expiry_date: toDateInputValue(certificate?.expiry_date),
    imca_ref: certificate?.imca_ref ?? "",
    imca_d018: certificate?.imca_d018 ?? "",
    maintenance_notes: certificate?.maintenance_notes ?? "",
  };
}

function mapTestTypeOptions(testTypes?: TestType[]): SelectProps.Option[] {
  return (
    testTypes?.map((testType) => ({
      label: testType.test_name,
      value: testType.test_id,
      description: formatMonthDuration(testType.validity_duration),
    })) ?? []
  );
}

function mapCompetentPersonOptions(competentPersons?: CompetentPerson[]): SelectProps.Option[] {
  return (
    competentPersons?.map((person) => ({
      label: person.full_name,
      value: person.competent_person_id,
      description: person.organization || person.competency_category_name || undefined,
    })) ?? []
  );
}

function useCertificateFormData({
  assetId,
  componentId,
  certificateId,
  isEditing,
  formDraft,
}: {
  assetId?: string;
  componentId?: string;
  certificateId?: string;
  isEditing: boolean;
  formDraft: CertificateFormDraft;
}) {
  const assetQuery = useQuery({ queryKey: ["asset", assetId], queryFn: () => getAsset(assetId!), enabled: Boolean(assetId) });
  const componentQuery = useQuery({
    queryKey: ["component", componentId],
    queryFn: () => getComponent(componentId!),
    enabled: Boolean(componentId),
  });
  const testTypesQuery = useQuery({ queryKey: ["test-types"], queryFn: listTestTypes });
  const competentPersonsQuery = useQuery({
    queryKey: ["competent-persons", "active"],
    queryFn: listActiveCompetentPersons,
    enabled: !isEditing,
  });
  const certificateQuery = useQuery({
    queryKey: ["certificate", certificateId],
    queryFn: () => getCertificate(certificateId!),
    enabled: Boolean(certificateId),
  });

  const baseForm = useMemo(() => getCertificateBaseForm(certificateQuery.data), [certificateQuery.data]);
  const form = useMemo(() => ({ ...baseForm, ...formDraft }), [baseForm, formDraft]);
  const selectedTestType = useMemo(
    () => testTypesQuery.data?.find((testType) => testType.test_id === form.test_id) ?? null,
    [form.test_id, testTypesQuery.data],
  );
  const selectedCompetentPerson = useMemo(
    () =>
      competentPersonsQuery.data?.find(
        (person) => person.competent_person_id === formDraft.selectedCompetentPersonId,
      ) ?? null,
    [competentPersonsQuery.data, formDraft.selectedCompetentPersonId],
  );

  return {
    assetQuery,
    componentQuery,
    testTypesQuery,
    competentPersonsQuery,
    certificateQuery,
    baseForm,
    form,
    selectedTestType,
    selectedCompetentPerson,
    testTypeOptions: mapTestTypeOptions(testTypesQuery.data),
    competentPersonOptions: mapCompetentPersonOptions(competentPersonsQuery.data),
  };
}

function useCertificateSaveMutation({
  assetId,
  componentId,
  certificateId,
  isEditing,
  selectedFile,
  selectedCompetentPersonId,
  onClearUpload,
  onError,
}: {
  assetId?: string;
  componentId?: string;
  certificateId?: string;
  isEditing: boolean;
  selectedFile: File | null;
  selectedCompetentPersonId: string;
  onClearUpload: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success, warning } = useFlashbar();

  return useMutation({
    mutationFn: async (payload: SaveCertificateInput) => {
      if (isEditing) {
        await patchCertificate(certificateId!, payload as PatchCertificateInput);
        return null;
      }
      return createCertificate(payload as CertificateInput);
    },
    onSuccess: async (createdCertificate) => {
      if (!assetId || !componentId) {
        return;
      }

      if (!isEditing && createdCertificate) {
        let uploadFailed = false;
        if (selectedFile && selectedCompetentPersonId) {
          try {
            await uploadCertificateFile(createdCertificate.certificate_id, selectedFile, selectedCompetentPersonId);
            await queryClient.invalidateQueries({ queryKey: ["uploads", createdCertificate.certificate_id] });
          } catch (error) {
            uploadFailed = true;
            console.error(error);
          }
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["certificates"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        ]);
        onClearUpload();
        if (uploadFailed) {
          warning("Certificate created, but file upload failed.", "Upload the certificate file from the detail page.");
        } else {
          success("Certificate created.", "The certificate record has been created.");
        }
        navigate(`/assets/${assetId}/components/${componentId}/certificates/${createdCertificate.certificate_id}`, {
          replace: true,
        });
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["certificates"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["uploads", certificateId] }),
      ]);
      success("Certificate updated.", "The certificate record has been updated.");
      navigate(`/assets/${assetId}/components/${componentId}/certificates/${certificateId}`, { replace: true });
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Unable to save certificate.");
    },
  });
}

export function CertificateFormPage() {
  const { assetId, componentId, certificateId } = useParams<{ assetId: string; componentId: string; certificateId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(certificateId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<CertificateFormDraft>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const selectedCompetentPersonId = formDraft.selectedCompetentPersonId ?? "";
  const cancelTarget = (location.state as { from?: string } | null)?.from ?? `/assets/${assetId}`;

  const data = useCertificateFormData({ assetId, componentId, certificateId, isEditing, formDraft });
  const saveMutation = useCertificateSaveMutation({
    assetId,
    componentId,
    certificateId,
    isEditing,
    selectedFile,
    selectedCompetentPersonId,
    onClearUpload: () => {
      setSelectedFile(null);
      setFormDraft((draft) => ({ ...draft, selectedCompetentPersonId: "" }));
    },
    onError: setErrorMessage,
  });

  if (data.assetQuery.isLoading || data.componentQuery.isLoading || data.testTypesQuery.isLoading || data.certificateQuery.isLoading) {
    return <PageLoading>Loading certificate form</PageLoading>;
  }

  if (data.assetQuery.isError || data.componentQuery.isError || data.testTypesQuery.isError || data.certificateQuery.isError) {
    return <PageError title="Unable to load certificate form" description="Refresh the page and try again." />;
  }

  const suggestedExpiry = !isEditing ? addMonths(data.form.issue_date, data.selectedTestType?.validity_duration ?? 0) : "";
  const handleSubmit = () => {
    const validationError = validateCertificateForm({
      form: data.form,
      isEditing,
      selectedFile,
      selectedCompetentPersonId,
    });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    saveMutation.mutate(
      isEditing
        ? buildPatchPayload(data.baseForm, data.form)
        : {
            component_id: componentId!,
            test_id: data.form.test_id,
            certificate_name: data.form.certificate_name.trim(),
            issuing_authority: data.form.issuing_authority.trim(),
            issue_date: toIsoDate(data.form.issue_date)!,
            expiry_date: toIsoDate(data.form.expiry_date)!,
            imca_ref: data.form.imca_ref.trim(),
            imca_d018: data.form.imca_d018.trim(),
            maintenance_notes: data.form.maintenance_notes.trim(),
          },
    );
  };

  return (
    <CertificateFormView
      asset={data.assetQuery.data}
      component={data.componentQuery.data}
      competentPersonOptions={data.competentPersonOptions}
      competentPersonsStatus={data.competentPersonsQuery.isLoading ? "loading" : "finished"}
      errorMessage={errorMessage}
      form={data.form}
      isEditing={isEditing}
      isSaving={saveMutation.isPending}
      onCancel={() => navigate(cancelTarget)}
      onFileChange={setSelectedFile}
      onFormChange={setFormDraft}
      onSubmit={handleSubmit}
      selectedCompetentPerson={data.selectedCompetentPerson}
      selectedFile={selectedFile}
      selectedTestType={data.selectedTestType}
      selectedTestTypeOption={
        data.selectedTestType
          ? {
              label: data.selectedTestType.test_name,
              value: data.selectedTestType.test_id,
              description: formatMonthDuration(data.selectedTestType.validity_duration),
            }
          : null
      }
      suggestedExpiry={suggestedExpiry}
      testTypeOptions={data.testTypeOptions}
      testTypes={data.testTypesQuery.data ?? []}
    />
  );
}

function validateCertificateForm({
  form,
  isEditing,
  selectedFile,
  selectedCompetentPersonId,
}: {
  form: CertificateFormState;
  isEditing: boolean;
  selectedFile: File | null;
  selectedCompetentPersonId: string;
}) {
  if (!form.certificate_name.trim()) {
    return "Certificate name is required.";
  }
  if (!form.test_id) {
    return "Choose a test type.";
  }
  if (!isEditing) {
    if (!form.issue_date || !form.expiry_date) {
      return "Issue and expiry dates are required.";
    }
    if (new Date(form.expiry_date) < new Date(form.issue_date)) {
      return "Expiry date must be after issue date.";
    }
    if (selectedFile && !selectedCompetentPersonId) {
      return "Select the competent person who uploaded the file.";
    }
    if (!selectedFile && selectedCompetentPersonId) {
      return "Choose a certificate file before selecting a competent person.";
    }
  }
  return null;
}

function CertificateFormView({
  asset,
  component,
  competentPersonOptions,
  competentPersonsStatus,
  errorMessage,
  form,
  isEditing,
  isSaving,
  onCancel,
  onFileChange,
  onFormChange,
  onSubmit,
  selectedCompetentPerson,
  selectedFile,
  selectedTestType,
  selectedTestTypeOption,
  suggestedExpiry,
  testTypeOptions,
  testTypes,
}: {
  asset?: Asset;
  component?: ComponentRecord;
  competentPersonOptions: SelectProps.Option[];
  competentPersonsStatus: CompetentPersonsStatus;
  errorMessage: string | null;
  form: CertificateFormState;
  isEditing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onFileChange: (file: File | null) => void;
  onFormChange: FormDraftSetter;
  onSubmit: () => void;
  selectedCompetentPerson: CompetentPerson | null;
  selectedFile: File | null;
  selectedTestType: TestType | null;
  selectedTestTypeOption: SelectProps.Option | null;
  suggestedExpiry: string;
  testTypeOptions: SelectProps.Option[];
  testTypes: TestType[];
}) {
  const header = useMemo(
    () => (
      <CertificateFormHeader isEditing={isEditing} isSaving={isSaving} onCancel={onCancel} onSubmit={onSubmit} />
    ),
    [isEditing, isSaving, onCancel, onSubmit],
  );

  return (
    <ContentLayout header={header}>
      <ColumnLayout columns={2} variant="text-grid">
        <CertificateInformationPanel
          competentPersonOptions={competentPersonOptions}
          competentPersonsStatus={competentPersonsStatus}
          errorMessage={errorMessage}
          form={form}
          isEditing={isEditing}
          isSaving={isSaving}
          onFileChange={onFileChange}
          onFormChange={onFormChange}
          onSubmit={onSubmit}
          selectedCompetentPerson={selectedCompetentPerson}
          selectedFile={selectedFile}
          selectedTestType={selectedTestType}
          selectedTestTypeOption={selectedTestTypeOption}
          suggestedExpiry={suggestedExpiry}
          testTypeOptions={testTypeOptions}
          testTypes={testTypes}
        />

        <SpaceBetween size="l">
          <CertificateContextPanel asset={asset} component={component} selectedTestType={selectedTestType} />
          <CertificateGuidancePanel />
        </SpaceBetween>
      </ColumnLayout>
    </ContentLayout>
  );
}

function CertificateFormHeader({
  isEditing,
  isSaving,
  onCancel,
  onSubmit,
}: {
  isEditing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Header
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSaving} onClick={onSubmit}>
            {isEditing ? "Save certificate" : "Create certificate"}
          </Button>
        </SpaceBetween>
      }
    >
      {isEditing ? "Edit certificate" : "Create certificate"}
    </Header>
  );
}

function CertificateInformationPanel({
  competentPersonOptions,
  competentPersonsStatus,
  errorMessage,
  form,
  isEditing,
  isSaving,
  onFileChange,
  onFormChange,
  onSubmit,
  selectedCompetentPerson,
  selectedFile,
  selectedTestType,
  selectedTestTypeOption,
  suggestedExpiry,
  testTypeOptions,
  testTypes,
}: {
  competentPersonOptions: SelectProps.Option[];
  competentPersonsStatus: CompetentPersonsStatus;
  errorMessage: string | null;
  form: CertificateFormState;
  isEditing: boolean;
  isSaving: boolean;
  onFileChange: (file: File | null) => void;
  onFormChange: FormDraftSetter;
  onSubmit: () => void;
  selectedCompetentPerson: CompetentPerson | null;
  selectedFile: File | null;
  selectedTestType: TestType | null;
  selectedTestTypeOption: SelectProps.Option | null;
  suggestedExpiry: string;
  testTypeOptions: SelectProps.Option[];
  testTypes: TestType[];
}) {
  const header = useMemo(() => <Header variant="h2">Certificate information</Header>, []);

  return (
    <Container header={header}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Form
          actions={
            <Button variant="primary" loading={isSaving} formAction="none" onClick={onSubmit}>
              {isEditing ? "Save certificate" : "Create certificate"}
            </Button>
          }
        >
          <SpaceBetween size="l">
            {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
            <CertificateCoreFields
              form={form}
              onFormChange={onFormChange}
              selectedTestTypeOption={selectedTestTypeOption}
              testTypeOptions={testTypeOptions}
              testTypes={testTypes}
            />
            {!isEditing ? (
              <>
                <CertificateDateFields
                  form={form}
                  onFormChange={onFormChange}
                  selectedTestType={selectedTestType}
                  suggestedExpiry={suggestedExpiry}
                />
                <CertificateUploadFields
                  competentPersonOptions={competentPersonOptions}
                  competentPersonsStatus={competentPersonsStatus}
                  onFileChange={onFileChange}
                  onFormChange={onFormChange}
                  selectedCompetentPerson={selectedCompetentPerson}
                  selectedFile={selectedFile}
                />
              </>
            ) : null}
          </SpaceBetween>
        </Form>
      </form>
    </Container>
  );
}

function CertificateCoreFields({
  form,
  onFormChange,
  selectedTestTypeOption,
  testTypeOptions,
  testTypes,
}: {
  form: CertificateFormState;
  onFormChange: FormDraftSetter;
  selectedTestTypeOption: SelectProps.Option | null;
  testTypeOptions: SelectProps.Option[];
  testTypes: TestType[];
}) {
  return (
    <>
      <FormField label="Certificate name" stretch>
        <Input
          value={form.certificate_name}
          onChange={({ detail }) => onFormChange((draft) => ({ ...draft, certificate_name: detail.value }))}
        />
      </FormField>

      <FormField label="Test type" description="Determines certificate validity period and compliance category." stretch>
        <Select
          selectedOption={selectedTestTypeOption}
          options={testTypeOptions}
          placeholder="Select a test type"
          onChange={({ detail }) => {
            const nextTestType = testTypes.find((testType) => testType.test_id === detail.selectedOption.value);
            onFormChange((draft) => {
              const issueDate = draft.issue_date ?? form.issue_date;
              return {
                ...draft,
                test_id: detail.selectedOption.value ?? "",
                expiry_date: addMonths(issueDate, nextTestType?.validity_duration ?? 0) || draft.expiry_date,
              };
            });
          }}
        />
      </FormField>

      <FormField label="Issuing authority" stretch>
        <Input
          value={form.issuing_authority}
          onChange={({ detail }) => onFormChange((draft) => ({ ...draft, issuing_authority: detail.value }))}
        />
      </FormField>

      <FormField label="IMCA Ref" stretch>
        <Input value={form.imca_ref} onChange={({ detail }) => onFormChange((draft) => ({ ...draft, imca_ref: detail.value }))} />
      </FormField>

      <FormField label="IMCA D018" stretch>
        <Input value={form.imca_d018} onChange={({ detail }) => onFormChange((draft) => ({ ...draft, imca_d018: detail.value }))} />
      </FormField>

      <FormField label="Maintenance notes" stretch>
        <Textarea
          value={form.maintenance_notes}
          rows={5}
          onChange={({ detail }) => onFormChange((draft) => ({ ...draft, maintenance_notes: detail.value }))}
        />
      </FormField>
    </>
  );
}

function CertificateDateFields({
  form,
  onFormChange,
  selectedTestType,
  suggestedExpiry,
}: {
  form: CertificateFormState;
  onFormChange: FormDraftSetter;
  selectedTestType: TestType | null;
  suggestedExpiry: string;
}) {
  return (
    <ColumnLayout columns={2}>
      <FormField label="Issue date" stretch>
        <input
          aria-label="Certificate issue date"
          className="native-date-input"
          type="date"
          value={form.issue_date}
          onChange={(event) => {
            const issueDate = event.target.value;
            onFormChange((draft) => ({
              ...draft,
              issue_date: issueDate,
              expiry_date: addMonths(issueDate, selectedTestType?.validity_duration ?? 0) || draft.expiry_date,
            }));
          }}
        />
      </FormField>
      <FormField label="Expiry date" description={suggestedExpiry ? `Suggested: ${suggestedExpiry}` : undefined} stretch>
        <input
          aria-label="Certificate expiry date"
          className="native-date-input"
          type="date"
          value={form.expiry_date}
          onChange={(event) => onFormChange((draft) => ({ ...draft, expiry_date: event.target.value }))}
        />
      </FormField>
    </ColumnLayout>
  );
}

function CertificateUploadFields({
  competentPersonOptions,
  competentPersonsStatus,
  onFileChange,
  onFormChange,
  selectedCompetentPerson,
  selectedFile,
}: {
  competentPersonOptions: SelectProps.Option[];
  competentPersonsStatus: CompetentPersonsStatus;
  onFileChange: (file: File | null) => void;
  onFormChange: FormDraftSetter;
  selectedCompetentPerson: CompetentPerson | null;
  selectedFile: File | null;
}) {
  return (
    <>
      <FormField label="Certificate file" description="Attach the source PDF or image for this certificate." stretch>
        <FileUpload
          value={selectedFile ? [selectedFile] : []}
          onChange={({ detail }) => onFileChange(detail.value[0] ?? null)}
          accept=".pdf,.png,.jpg,.jpeg"
          i18nStrings={{
            uploadButtonText: (multiple) => (multiple ? "Choose files" : "Choose file"),
            dropzoneText: (multiple) => (multiple ? "Drop files to upload" : "Drop file to upload"),
            removeFileAriaLabel: () => "Remove file",
            limitShowFewer: "Show fewer files",
            limitShowMore: "Show more files",
            errorIconAriaLabel: "Error",
          }}
        />
      </FormField>

      <FormField
        label="Competent Person"
        description="Required when a file is uploaded so the audit trail records who provided it."
        stretch
      >
        <Select
          selectedOption={
            selectedCompetentPerson
              ? {
                  label: selectedCompetentPerson.full_name,
                  value: selectedCompetentPerson.competent_person_id,
                  description: selectedCompetentPerson.organization || selectedCompetentPerson.competency_category_name || undefined,
                }
              : null
          }
          options={competentPersonOptions}
          placeholder="Select competent person"
          statusType={competentPersonsStatus}
          onChange={({ detail }) =>
            onFormChange((draft) => ({
              ...draft,
              selectedCompetentPersonId: detail.selectedOption.value ?? "",
            }))
          }
        />
      </FormField>
    </>
  );
}

function CertificateContextPanel({
  asset,
  component,
  selectedTestType,
}: {
  asset?: Asset;
  component?: ComponentRecord;
  selectedTestType: TestType | null;
}) {
  const header = useMemo(() => <Header variant="h2">Asset context</Header>, []);

  return (
    <Container header={header}>
      <SpaceBetween size="s">
        <ContextRow label="Asset" value={asset?.name ?? "Unknown"} />
        <ContextRow label="Component" value={component?.name ?? "Unknown"} />
        <ContextRow label="Component type" value={component?.equipment_type ?? "Not specified"} />
        <ContextRow label="Selected validity" value={formatMonthDuration(selectedTestType?.validity_duration)} />
      </SpaceBetween>
    </Container>
  );
}

function CertificateGuidancePanel() {
  const header = useMemo(() => <Header variant="h2">Operator guidance</Header>, []);

  return (
    <Container header={header}>
      <SpaceBetween size="s">
        <Box>
          Certificates become part of the component compliance history. Use the latest signed certificate and ensure the expiry date
          matches the issuing authority.
        </Box>
        <Box color="text-body-secondary">
          Uploaded files can be replaced later from the certificate detail page while preserving the audit trail.
        </Box>
      </SpaceBetween>
    </Container>
  );
}

function ContextRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Box variant="awsui-key-label">{label}</Box>
      <Box>{value}</Box>
    </Box>
  );
}

export default CertificateFormPage;
