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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createCertificate,
  getAsset,
  getCertificate,
  getComponent,
  listTestTypes,
  patchCertificate,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useFlashbar } from "../../providers/flashbar-context";
import type { CertificateInput, PatchCertificateInput } from "../../types/ams";
import { formatMonthDuration, toDateInputValue, toIsoDate } from "../../utils/format";

function addMonths(dateValue: string, months: number) {
  const nextDate = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(nextDate.getTime())) {
    return "";
  }

  const targetYear = nextDate.getUTCFullYear();
  const targetMonth = nextDate.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  nextDate.setUTCMonth(targetMonth, Math.min(nextDate.getUTCDate(), lastDayOfTargetMonth));
  return nextDate.toISOString().slice(0, 10);
}

interface CertificateFormState {
  component_id: string;
  certificate_name: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string;
  test_id: string;
  imca_ref: string;
  imca_d018: string;
  maintenance_notes: string;
}

function buildPatchPayload(
  baseForm: CertificateFormState,
  nextForm: CertificateFormState
): PatchCertificateInput {
  const payload: PatchCertificateInput = {};

  if (nextForm.component_id !== baseForm.component_id) {
    payload.component_id = nextForm.component_id;
  }
  if (nextForm.certificate_name.trim() !== baseForm.certificate_name.trim()) {
    payload.certificate_name = nextForm.certificate_name.trim();
  }
  if (nextForm.issuing_authority.trim() !== baseForm.issuing_authority.trim()) {
    payload.issuing_authority = nextForm.issuing_authority.trim();
  }
  if (nextForm.test_id !== baseForm.test_id) {
    payload.test_id = nextForm.test_id;
  }
  if (nextForm.imca_ref.trim() !== baseForm.imca_ref.trim()) {
    payload.imca_ref = nextForm.imca_ref.trim();
  }
  if (nextForm.imca_d018.trim() !== baseForm.imca_d018.trim()) {
    payload.imca_d018 = nextForm.imca_d018.trim();
  }
  if (nextForm.maintenance_notes.trim() !== baseForm.maintenance_notes.trim()) {
    payload.maintenance_notes = nextForm.maintenance_notes.trim();
  }

  return payload;
}

export function CertificateFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { assetId, componentId, certificateId } = useParams();
  const { error, success } = useFlashbar();
  const isEditing = Boolean(certificateId);
  const [errorMessage, setErrorMessage] = useState("");
  const [formDraft, setForm] = useState<Partial<CertificateFormState>>({});

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const componentQuery = useQuery({
    queryKey: ["component", componentId],
    queryFn: () => getComponent(componentId!),
    enabled: Boolean(componentId),
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const certificateQuery = useQuery({
    queryKey: ["certificate", certificateId],
    queryFn: () => getCertificate(certificateId!),
    enabled: Boolean(certificateId),
  });

  const baseForm: CertificateFormState = certificateQuery.data
    ? {
      component_id: certificateQuery.data.component_id,
      certificate_name: certificateQuery.data.certificate_name,
      issue_date: toDateInputValue(certificateQuery.data.issue_date),
      expiry_date: toDateInputValue(certificateQuery.data.expiry_date),
      issuing_authority: certificateQuery.data.issuing_authority || "",
      test_id: certificateQuery.data.test_id,
      imca_ref: certificateQuery.data.imca_ref || "",
      imca_d018: certificateQuery.data.imca_d018 || "",
      maintenance_notes: certificateQuery.data.maintenance_notes || "",
    }
    : {
      component_id: componentId ?? "",
      certificate_name: "",
      issue_date: "",
      expiry_date: "",
      issuing_authority: "",
      test_id: "",
      imca_ref: "",
      imca_d018: "",
      maintenance_notes: "",
    };
  const form: CertificateFormState = { ...baseForm, ...formDraft };

  const testTypeOptions = useMemo<SelectProps.Option[]>(
    () =>
      (testTypesQuery.data || []).map((testType) => ({
        label: testType.test_name,
        description: `${formatMonthDuration(testType.validity_duration)} validity window`,
        value: testType.test_id,
      })),
    [testTypesQuery.data]
  );

  const selectedTestType =
    testTypesQuery.data?.find((testType) => testType.test_id === form.test_id) ?? null;
  const selectedTestTypeOption =
    testTypeOptions.find((option) => option.value === form.test_id) ?? null;
  const suggestedExpiry =
    !isEditing && form.issue_date && selectedTestType
      ? addMonths(form.issue_date, selectedTestType.validity_duration)
      : "";
  const cancelTarget =
    typeof location.state === "object" &&
    location.state !== null &&
    "from" in location.state &&
    typeof (location.state as { from?: unknown }).from === "string"
      ? (location.state as { from: string }).from
      : `/assets/${assetId}`;

  const saveMutation = useMutation({
    mutationFn: async (payload: CertificateInput | PatchCertificateInput) => {
      if (isEditing && certificateId) {
        await patchCertificate(certificateId, payload as PatchCertificateInput);
        return null;
      }
      return createCertificate(payload as CertificateInput);
    },
    onSuccess: async (createdCertificate) => {
      if (!assetId || !componentId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["certificates", componentId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
      ]);

      if (createdCertificate) {
        success("Certificate created", `${createdCertificate.certificate_name} is ready for review.`);
        navigate(
          `/assets/${assetId}/components/${componentId}/certificates/${createdCertificate.certificate_id}`,
          { replace: true }
        );
        return;
      }

      if (certificateId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] }),
          queryClient.invalidateQueries({ queryKey: ["uploads", certificateId] }),
        ]);
        success("Certificate updated", "The certificate details have been saved.");
        navigate(
          `/assets/${assetId}/components/${componentId}/certificates/${certificateId}`,
          { replace: true }
        );
      }
    },
    onError: (mutationError: Error) => {
      setErrorMessage(mutationError.message);
      error("Certificate save failed", mutationError.message);
    },
  });

  if (!assetId || !componentId) {
    return <PageError description="The certificate route is missing its asset or component." />;
  }

  if (
    assetQuery.isLoading ||
    componentQuery.isLoading ||
    testTypesQuery.isLoading ||
    (isEditing && certificateQuery.isLoading)
  ) {
    return <PageLoading>Loading certificate form data...</PageLoading>;
  }

  if (assetQuery.isError || componentQuery.isError || testTypesQuery.isError) {
    return (
      <PageError
        description="The certificate form could not load its asset, component, or test references."
        onRetry={() => {
          void assetQuery.refetch();
          void componentQuery.refetch();
          void testTypesQuery.refetch();
        }}
      />
    );
  }

  if (isEditing && certificateQuery.isError) {
    return (
      <PageError
        description="The certificate could not be loaded for editing."
        onRetry={() => void certificateQuery.refetch()}
      />
    );
  }

  const handleSubmit = () => {
    if (!form.certificate_name.trim()) {
      setErrorMessage("Certificate name is required.");
      return;
    }

    if (!form.test_id) {
      setErrorMessage("Choose a test type.");
      return;
    }

    if (!isEditing) {
      if (!form.issue_date || !form.expiry_date) {
        setErrorMessage("Issue date and expiry date are required.");
        return;
      }

      if (new Date(form.expiry_date).getTime() < new Date(form.issue_date).getTime()) {
        setErrorMessage("Expiry date must be on or after the issue date.");
        return;
      }
    }

    setErrorMessage("");
    if (isEditing) {
      saveMutation.mutate(buildPatchPayload(baseForm, form));
      return;
    }

    saveMutation.mutate({
      component_id: componentId,
      certificate_name: form.certificate_name.trim(),
      issue_date: toIsoDate(form.issue_date),
      expiry_date: toIsoDate(form.expiry_date),
      issuing_authority: form.issuing_authority.trim(),
      test_id: form.test_id,
      imca_ref: form.imca_ref.trim(),
      imca_d018: form.imca_d018.trim(),
      maintenance_notes: form.maintenance_notes.trim(),
    });
  };

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate(cancelTarget)}>Cancel</Button>
              <Button loading={saveMutation.isPending} variant="primary" onClick={handleSubmit}>
                {isEditing ? "Save certificate" : "Create certificate"}
              </Button>
            </SpaceBetween>
          }
          description="Certificates stay nested under a selected component inside the asset workspace."
          variant="h1"
        >
          {isEditing ? "Edit certificate" : "Create certificate"}
        </Header>
      }
    >
      <ColumnLayout columns={2} variant="text-grid">
        <Container header={<Header variant="h2">Certificate information</Header>}>
          <Form>
            <SpaceBetween direction="vertical" size="l">
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}

              <FormField label="Certificate name">
                <Input
                  value={form.certificate_name}
                  onChange={({ detail }) =>
                    setForm((current) => ({ ...current, certificate_name: detail.value }))
                  }
                />
              </FormField>

              <ColumnLayout columns={2}>
                <FormField label="Test type">
                  <Select
                    options={testTypeOptions}
                    placeholder="Select a test type"
                    selectedOption={selectedTestTypeOption}
                    onChange={({ detail }) =>
                      setForm((current) => {
                        const nextTestId = detail.selectedOption.value ?? "";
                        const nextTestType = testTypesQuery.data?.find(
                          (testType) => testType.test_id === nextTestId
                        );
                        const nextExpiry =
                          !isEditing && current.issue_date && nextTestType
                            ? addMonths(current.issue_date, nextTestType.validity_duration)
                            : current.expiry_date;

                        return {
                          ...current,
                          test_id: nextTestId,
                          expiry_date: nextExpiry,
                        };
                      })
                    }
                  />
                </FormField>
                <FormField label="Issuing authority">
                  <Input
                    value={form.issuing_authority}
                    onChange={({ detail }) =>
                      setForm((current) => ({
                        ...current,
                        issuing_authority: detail.value,
                      }))
                    }
                  />
                </FormField>
              </ColumnLayout>

              {!isEditing ? (
                <ColumnLayout columns={2}>
                  <FormField label="Issue date">
                    <input
                      className="app-native-input"
                      value={form.issue_date}
                      type="date"
                      onChange={(event) =>
                        setForm((current) => {
                          const nextIssueDate = event.target.value;
                          const nextExpiry =
                            nextIssueDate && selectedTestType
                              ? addMonths(nextIssueDate, selectedTestType.validity_duration)
                              : current.expiry_date;

                          return {
                            ...current,
                            issue_date: nextIssueDate,
                            expiry_date: nextExpiry,
                          };
                        })
                      }
                    />
                  </FormField>
                  <FormField
                    description={
                      suggestedExpiry
                        ? `Auto-filled from test validity: ${suggestedExpiry}`
                        : "Choose a test type and issue date to auto-fill expiry."
                    }
                    label="Expiry date"
                  >
                    <input
                      className="app-native-input"
                      value={form.expiry_date}
                      type="date"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, expiry_date: event.target.value }))
                      }
                    />
                  </FormField>
                </ColumnLayout>
              ) : null}

              <ColumnLayout columns={2}>
                <FormField label="IMCA Ref">
                  <Input
                    value={form.imca_ref}
                    onChange={({ detail }) =>
                      setForm((current) => ({ ...current, imca_ref: detail.value }))
                    }
                  />
                </FormField>
                <FormField label="IMCA D018">
                  <Input
                    value={form.imca_d018}
                    onChange={({ detail }) =>
                      setForm((current) => ({ ...current, imca_d018: detail.value }))
                    }
                  />
                </FormField>
              </ColumnLayout>

              <FormField label="Maintenance notes">
                <Textarea
                  rows={6}
                  value={form.maintenance_notes}
                  onChange={({ detail }) =>
                    setForm((current) => ({
                      ...current,
                      maintenance_notes: detail.value,
                    }))
                  }
                />
              </FormField>
            </SpaceBetween>
          </Form>
        </Container>

        <SpaceBetween direction="vertical" size="l">
          <Container header={<Header variant="h2">Asset and component context</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Asset</Box>
                <Box>{assetQuery.data?.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Component</Box>
                <Box>{componentQuery.data?.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Test validity</Box>
                <Box>
                  {selectedTestType
                    ? formatMonthDuration(selectedTestType.validity_duration)
                    : "Not selected"}
                </Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Operator guidance</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <Box color="text-body-secondary">
                The certificate will appear in the selected component's right-hand certificate table immediately after save.
              </Box>
              <Box color="text-body-secondary">
                File uploads happen from the certificate detail page so the record exists before a document is attached.
              </Box>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </ColumnLayout>
    </ContentLayout>
  );
}
