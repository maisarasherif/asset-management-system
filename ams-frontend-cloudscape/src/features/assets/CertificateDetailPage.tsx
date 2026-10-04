import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FormField,
  Header,
  SpaceBetween,
  StatusIndicator,
  SegmentedControl,
  type SelectProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { renewExternalCertificate, getCertificateIssuance } from "../../lib/api/certificate-issuance";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getAsset,
  getCertificate,
  getCertificateDownloadUrl,
  getComponent,
  listActiveCompetentPersons,
  listTestTypes,
} from "../../lib/api/ams";
import { ApiError } from "../../lib/api/client";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { CertificateIssuanceHistory } from "./CertificateIssuanceHistory";
import { GeneratedCertificateSigner } from "./GeneratedCertificateSigner";
import { Select } from "../../components/shared/OptimizedSelect";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  Asset,
  Certificate,
  ComponentRecord,
  CompetentPerson,
  TestType,
} from "../../types/ams";
import { certificateStatusType } from "../../utils/status";
import {
  formatDate,
  humanizeEnum,
  toDateInputValue,
} from "../../utils/format";
import {
  CERTIFICATE_FILE_MAX_LABEL,
  certificateFileTooLargeMessage,
  isCertificateFileTooLarge,
} from "./certificateUploadLimits";

function addMonths(dateValue: string, months: number) {
  const nextDate = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(nextDate.getTime())) {
    return "";
  }

  const targetYear = nextDate.getUTCFullYear();
  const targetMonth = nextDate.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  nextDate.setUTCMonth(
    targetMonth,
    Math.min(nextDate.getUTCDate(), lastDayOfTargetMonth),
  );
  return nextDate.toISOString().slice(0, 10);
}

function testTypeRequiresExpiry(testType: TestType | null | undefined) {
  return testType?.requires_renewal ?? true;
}

function categoryRulesAllowCompetentPerson(allowedCategoryIDs: string[], person: CompetentPerson) {
  return allowedCategoryIDs.length === 0 || allowedCategoryIDs.includes(person.competency_category_id);
}

export function CertificateDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { assetId, componentId, certificateId } = useParams();
  const { isAdmin } = useAuth();
  const { error, success } = useFlashbar();
  const approvalId = useRef<string | null>(null);
  const [generatedIssuing, setGeneratedIssuing] = useState(false);
  const [renewalSource,setRenewalSource] = useState("GENERATED");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCompetentPersonId, setSelectedCompetentPersonId] =
    useState("");
  const [renewalIssueDate, setRenewalIssueDate] = useState<string | null>(null);
  const [renewalExpiryDate, setRenewalExpiryDate] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

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

  const certificateQuery = useQuery({
    queryKey: ["certificate", certificateId],
    queryFn: () => getCertificate(certificateId!),
    enabled: Boolean(certificateId),
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const competentPersonsQuery = useQuery({
    queryKey: ["competent-persons", "active"],
    queryFn: listActiveCompetentPersons,
    enabled: isAdmin,
  });

  const testTypeName = !certificateQuery.data?.test_id
    ? "Not set"
    : testTypesQuery.data?.find(
        (testType) => testType.test_id === certificateQuery.data?.test_id,
      )?.test_name || certificateQuery.data.test_id;
  const selectedTestType =
    testTypesQuery.data?.find(
      (testType) => testType.test_id === certificateQuery.data?.test_id,
    ) ?? null;
  const selectedTypeRequiresExpiry = testTypeRequiresExpiry(selectedTestType);
  const renewalIssueDateValue =
    renewalIssueDate ?? toDateInputValue(certificateQuery.data?.issue_date);
  const renewalExpiryDateValue =
    renewalExpiryDate ?? toDateInputValue(certificateQuery.data?.expiry_date);
  const handleFileChange = (file: File | null) => {
    approvalId.current = null;
    if (isCertificateFileTooLarge(file)) {
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      error("File too large", certificateFileTooLargeMessage());
      return;
    }
    setSelectedFile(file);
  };

  const downloadMutation = useMutation({
    mutationFn: async () => getCertificateDownloadUrl(certificateId!),
    onSuccess: (response) => {
      window.open(response.url, "_blank", "noopener,noreferrer");
    },
    onError: (mutationError: Error) => {
      error("Download failed", mutationError.message);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!certificateId || !selectedFile || !selectedCompetentPersonId) {
        throw new Error("Choose a file and competent person before uploading.");
      }
      const selectedCompetentPerson = competentPersonsQuery.data?.find(
        (person) => person.competent_person_id === selectedCompetentPersonId,
      );
      if (
        selectedCompetentPerson &&
        !categoryRulesAllowCompetentPerson(certificateQuery.data?.competency_category_ids ?? [], selectedCompetentPerson)
      ) {
        throw new Error("Select a competent person allowed for this certificate.");
      }
      if (isCertificateFileTooLarge(selectedFile)) {
        throw new Error(certificateFileTooLargeMessage());
      }
      if (!renewalIssueDateValue) {
        throw new Error("Choose issue date before uploading.");
      }
      if (selectedTypeRequiresExpiry && !renewalExpiryDateValue) {
        throw new Error("Choose issue date and expiry date before uploading.");
      }
      if (
        selectedTypeRequiresExpiry &&
        new Date(renewalExpiryDateValue).getTime() <=
        new Date(renewalIssueDateValue).getTime()
      ) {
        throw new Error("Expiry date must be after the issue date.");
      }

      approvalId.current ??= crypto.randomUUID();
      let uploadResponse = await renewExternalCertificate(certificateId, selectedFile, selectedCompetentPersonId, renewalIssueDateValue, selectedTypeRequiresExpiry ? renewalExpiryDateValue : "", approvalId.current);
      for (let check=0; check<30 && ["APPROVED","PROCESSING"].includes(uploadResponse.state); check++) {
        await new Promise(resolve => window.setTimeout(resolve,2000));
        uploadResponse = await getCertificateIssuance(certificateId,uploadResponse.issuance_id);
      }
      if (uploadResponse.state !== "COMPLETED") throw new Error("Renewal approval saved. Check issuance history; the current certificate is unchanged until completion.");
      return uploadResponse;
    },
    onSuccess: async () => {
      approvalId.current = null;
      setSelectedFile(null);
      setSelectedCompetentPersonId("");
      setRenewalIssueDate(null);
      setRenewalExpiryDate(null);
      setFileInputKey((current) => current + 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] }),
        queryClient.invalidateQueries({
          queryKey: ["certificate", certificateId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["certificates", componentId],
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["asset-dashboard", assetId] }),
      ]);
      success(
        "Certificate renewed",
        "The certificate dates and document have been updated.",
      );
    },
    onError: (mutationError: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] });
      error(
        "Upload failed",
        mutationError instanceof ApiError && mutationError.status === 413
          ? certificateFileTooLargeMessage()
          : mutationError.message,
      );
    },
  });

  if (!assetId || !componentId || !certificateId) {
    return <PageError description="The certificate route is incomplete." />;
  }

  if (
    assetQuery.isLoading ||
    componentQuery.isLoading ||
    certificateQuery.isLoading ||
    testTypesQuery.isLoading
  ) {
    return <PageLoading>{"Loading certificate details\u2026"}</PageLoading>;
  }

  if (
    assetQuery.isError ||
    componentQuery.isError ||
    certificateQuery.isError ||
    testTypesQuery.isError ||
    !assetQuery.data ||
    !componentQuery.data ||
    !certificateQuery.data
  ) {
    return (
      <PageError
        description="The certificate detail page could not be loaded."
        onRetry={() => {
          void assetQuery.refetch();
          void componentQuery.refetch();
          void certificateQuery.refetch();
          void testTypesQuery.refetch();
        }}
      />
    );
  }

  const allowedCategoryIDs = certificateQuery.data.competency_category_ids ?? [];
  const allowedCompetentPersons = (competentPersonsQuery.data || []).filter((person) =>
    categoryRulesAllowCompetentPerson(allowedCategoryIDs, person)
  );
  const competentPersonOptions: SelectProps.Option[] = allowedCompetentPersons.map((person) => ({
    label: person.full_name,
    value: person.competent_person_id,
    description: `${person.person_type} - ${person.competency_category_name}`,
  }));
  const selectedCompetentPerson =
    allowedCompetentPersons.find(
      (person) => person.competent_person_id === selectedCompetentPersonId,
    ) ?? null;
  const selectedCompetentPersonOption =
    competentPersonOptions.find(
      (option) => option.value === selectedCompetentPersonId,
    ) ?? null;

  return renderCertificateDetailPage({
    asset: assetQuery.data,
    assetId,
    certificate: certificateQuery.data,
    certificateId,
    competentPersonOptions,
    competentPersonsLoading: competentPersonsQuery.isLoading,
    component: componentQuery.data,
    componentId,
    downloadDisabled: !certificateQuery.data.certificate_file,
    downloadPending: downloadMutation.isPending,
    isAdmin,
    locationPath: `${location.pathname}${location.search}`,
    navigate,
    onDownload: () => downloadMutation.mutate(),
    onExpiryDateChange: value => { approvalId.current = null; setRenewalExpiryDate(value); },
    onFileChange: handleFileChange,
    onIssueDateChange: (nextIssueDate) => {
      approvalId.current = null;
      setRenewalIssueDate(nextIssueDate);
      setRenewalExpiryDate(
        nextIssueDate && selectedTestType && selectedTypeRequiresExpiry
          ? addMonths(nextIssueDate, selectedTestType.validity_duration ?? 0)
          : selectedTypeRequiresExpiry
            ? renewalExpiryDateValue
            : "",
      );
    },
    onRenew: () => uploadMutation.mutate(),
    onSelectedCompetentPersonChange: value => { approvalId.current = null; setSelectedCompetentPersonId(value); },
    renewalExpiryDateValue,
    renewalIssueDateValue,
    selectedCompetentPerson,
    selectedCompetentPersonId,
    selectedCompetentPersonOption,
    selectedFile,
    selectedTestType,
    selectedTypeRequiresExpiry,
    testTypeName,
    uploadPending: uploadMutation.isPending,
    fileInputKey,
    renewalSource,
    onRenewalSourceChange: setRenewalSource,
    generatedIssuing,
    onGeneratedIssuingChange: setGeneratedIssuing,
  });
}

interface CertificateDetailPageViewProps {
  generatedIssuing: boolean;
  onGeneratedIssuingChange: (issuing: boolean) => void;
  renewalSource: string;
  onRenewalSourceChange: (value:string)=>void;
  asset: Asset;
  assetId: string;
  certificate: Certificate;
  certificateId: string;
  competentPersonOptions: SelectProps.Option[];
  competentPersonsLoading: boolean;
  component: ComponentRecord;
  componentId: string;
  downloadDisabled: boolean;
  downloadPending: boolean;
  fileInputKey: number;
  isAdmin: boolean;
  locationPath: string;
  navigate: ReturnType<typeof useNavigate>;
  onDownload: () => void;
  onExpiryDateChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onIssueDateChange: (value: string) => void;
  onRenew: () => void;
  onSelectedCompetentPersonChange: (value: string) => void;
  renewalExpiryDateValue: string;
  renewalIssueDateValue: string;
  selectedCompetentPerson: CompetentPerson | null;
  selectedCompetentPersonId: string;
  selectedCompetentPersonOption: SelectProps.Option | null;
  selectedFile: File | null;
  selectedTestType: TestType | null;
  selectedTypeRequiresExpiry: boolean;
  testTypeName: string;
  uploadPending: boolean;
}

function renderCertificateDetailPage({
  generatedIssuing,
  onGeneratedIssuingChange,
  renewalSource,
  onRenewalSourceChange,
  asset,
  assetId,
  certificate,
  certificateId,
  competentPersonOptions,
  competentPersonsLoading,
  component,
  componentId,
  downloadDisabled,
  downloadPending,
  fileInputKey,
  isAdmin,
  locationPath,
  navigate,
  onDownload,
  onExpiryDateChange,
  onFileChange,
  onIssueDateChange,
  onRenew,
  onSelectedCompetentPersonChange,
  renewalExpiryDateValue,
  renewalIssueDateValue,
  selectedCompetentPerson,
  selectedCompetentPersonId,
  selectedCompetentPersonOption,
  selectedFile,
  selectedTestType,
  selectedTypeRequiresExpiry,
  testTypeName,
  uploadPending,
}: CertificateDetailPageViewProps) {
  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                onClick={() =>
                  navigate(`/assets/${assetId}?component=${componentId}`)
                }
              >
                Back to asset
              </Button>
              {isAdmin ? (
                <Button
                  onClick={() =>
                    navigate(
                      `/assets/${assetId}/components/${componentId}/certificates/${certificateId}/edit`,
                      {
                        state: { from: locationPath },
                      },
                    )
                  }
                >
                  Edit certificate
                </Button>
              ) : null}
              <Button
                disabled={downloadDisabled}
                loading={downloadPending}
                variant="primary"
                onClick={onDownload}
              >
                Download file
              </Button>
            </SpaceBetween>
          }
          description={`${component.display_id} - ${testTypeName}`}
          variant="h1"
        >
          {certificate.certificate_name}
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Container header={<Header variant="h2">Certificate summary</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <div className="summary-row">
              <Box variant="awsui-key-label">Status</Box>
              <StatusIndicator type={certificateStatusType(certificate.status)}>
                {humanizeEnum(certificate.status)}
              </StatusIndicator>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Issue date</Box>
              <Box>{formatDate(certificate.issue_date)}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Expiry date</Box>
              <Box>{formatDate(certificate.expiry_date)}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Issuing authority</Box>
              <Box>{certificate.issuing_authority || "Not set"}</Box>
            </div>
          </ColumnLayout>
        </Container>

        <ColumnLayout columns={2} variant="text-grid">
          <Container header={<Header variant="h2">Record details</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Asset</Box>
                <Box>{asset.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Component</Box>
                <Box>{component.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">IMCA Ref</Box>
                <Box>{certificate.imca_ref || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">IMCA D018</Box>
                <Box>{certificate.imca_d018 || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificate file</Box>
                <Box>
                  {certificate.certificate_file
                    ? "Attached"
                    : "No file uploaded"}
                </Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Maintenance notes</Header>}>
            <Box color="text-body-secondary">
              {certificate.maintenance_notes ||
                "No maintenance notes are recorded."}
            </Box>
          </Container>
        </ColumnLayout>

        {isAdmin ? <SegmentedControl label="Renewal document source" selectedId={renewalSource} onChange={({detail})=>onRenewalSourceChange(detail.selectedId)} options={[{id:"GENERATED",text:"Generate examination certificate",disabled:uploadPending || generatedIssuing},{id:"EXTERNAL",text:"Upload external document",disabled:uploadPending || generatedIssuing}]} /> : null}

        {isAdmin && renewalSource === "GENERATED" ? (
          <GeneratedCertificateSigner key={certificateId} certificateId={certificateId} onIssuingChange={onGeneratedIssuingChange} issueDate={toDateInputValue(certificate.issue_date)} expiryDate={toDateInputValue(certificate.expiry_date)} validityMonths={selectedTestType?.validity_duration ?? null} requiresRenewal={selectedTypeRequiresExpiry} />
        ) : null}

        {isAdmin && renewalSource === "EXTERNAL" ? (
          <Container
            header={<Header variant="h2">{selectedTypeRequiresExpiry ? "Renew/change certificate" : "Upload/change certificate"}</Header>}
          >
            <SpaceBetween direction="vertical" size="m">
              <Box color="text-body-secondary">
                Upload PDF, JPEG, PNG, or WEBP files up to{" "}
                {CERTIFICATE_FILE_MAX_LABEL}.
              </Box>
              <input
                disabled={uploadPending}
                key={fileInputKey}
                aria-label="Certificate renewal file"
                className="file-input"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  onFileChange(nextFile);
                  if (isCertificateFileTooLarge(nextFile)) {
                    event.currentTarget.value = "";
                  }
                }}
              />
              <ColumnLayout columns={2}>
                <FormField label="Issue date">
                  <input
                    disabled={uploadPending}
                    aria-label="Certificate renewal issue date"
                    className="app-native-input"
                    value={renewalIssueDateValue}
                    type="date"
                    onChange={(event) => onIssueDateChange(event.target.value)}
                  />
                </FormField>
                {selectedTypeRequiresExpiry ? (
                  <FormField
                    description={
                      selectedTestType && renewalIssueDateValue
                        ? "Auto-filled from the selected certificate test validity."
                        : undefined
                    }
                    label="Expiry date"
                  >
                    <input
                      disabled={uploadPending}
                    aria-label="Certificate renewal expiry date"
                      className="app-native-input"
                      value={renewalExpiryDateValue}
                      type="date"
                      onChange={(event) => onExpiryDateChange(event.target.value)}
                    />
                  </FormField>
                ) : (
                  <FormField label="Expiry date">
                    <Box color="text-body-secondary">No renewal required</Box>
                  </FormField>
                )}
              </ColumnLayout>
              <FormField label="Competent Person">
                <Select
                  disabled={uploadPending}
                  options={competentPersonOptions}
                  placeholder="Select competent person"
                  selectedOption={selectedCompetentPersonOption}
                  statusType={competentPersonsLoading ? "loading" : "finished"}
                  loadingText="Loading competent persons"
                  empty="No active competent persons are available."
                  onChange={({ detail }) =>
                    onSelectedCompetentPersonChange(
                      detail.selectedOption.value || "",
                    )
                  }
                />
              </FormField>
              {selectedCompetentPerson ? (
                <Box color="text-body-secondary">
                  {selectedCompetentPerson.competency_category_name}:{" "}
                  {selectedCompetentPerson.competency_category_description}
                </Box>
              ) : null}
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  disabled={
                    uploadPending ||
                    !selectedFile ||
                    !selectedCompetentPersonId ||
                    !renewalIssueDateValue ||
                    (selectedTypeRequiresExpiry && !renewalExpiryDateValue)
                  }
                  loading={uploadPending}
                  variant="primary"
                  onClick={onRenew}
                >
                  {selectedTypeRequiresExpiry ? "Renew/change certificate" : "Upload/change certificate"}
                </Button>
                {selectedFile ? <Box>{selectedFile.name}</Box> : null}
              </SpaceBetween>
            </SpaceBetween>
          </Container>
        ) : null}

        <CertificateIssuanceHistory key={certificateId} certificateId={certificateId} />

      </SpaceBetween>
    </ContentLayout>
  );
}
