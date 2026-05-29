import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FormField,
  Header,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getAsset,
  getCertificate,
  getCertificateDownloadUrl,
  getCertificateUploadDownloadUrl,
  getComponent,
  listActiveCompetentPersons,
  listCertificateUploads,
  listTestTypes,
  patchCertificate,
  uploadCertificateFile,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  Asset,
  Certificate,
  CertificateUploadAudit,
  ComponentRecord,
  CompetentPerson,
  TestType,
} from "../../types/ams";
import { certificateStatusType } from "../../utils/status";
import {
  formatDate,
  formatDateTime,
  humanizeEnum,
  toDateInputValue,
  toIsoDate,
} from "../../utils/format";

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

export function CertificateDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { assetId, componentId, certificateId } = useParams();
  const { isAdmin } = useAuth();
  const { error, success } = useFlashbar();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCompetentPersonId, setSelectedCompetentPersonId] = useState("");
  const [renewalIssueDate, setRenewalIssueDate] = useState("");
  const [renewalExpiryDate, setRenewalExpiryDate] = useState("");
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

  const uploadsQuery = useQuery({
    queryKey: ["uploads", certificateId],
    queryFn: async () => (await listCertificateUploads(certificateId!)).data,
    enabled: Boolean(certificateId),
  });

  const competentPersonsQuery = useQuery({
    queryKey: ["competent-persons", "active"],
    queryFn: listActiveCompetentPersons,
    enabled: isAdmin,
  });

  const testTypeName = !certificateQuery.data?.test_id
    ? "Not set"
    : testTypesQuery.data?.find((testType) => testType.test_id === certificateQuery.data?.test_id)
        ?.test_name || certificateQuery.data.test_id;
  const selectedTestType =
    testTypesQuery.data?.find((testType) => testType.test_id === certificateQuery.data?.test_id) ??
    null;
  const renewalIssueDateValue =
    renewalIssueDate || toDateInputValue(certificateQuery.data?.issue_date);
  const renewalExpiryDateValue =
    renewalExpiryDate || toDateInputValue(certificateQuery.data?.expiry_date);

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
      if (!renewalIssueDateValue || !renewalExpiryDateValue) {
        throw new Error("Choose issue date and expiry date before uploading.");
      }
      if (
        new Date(renewalExpiryDateValue).getTime() <
        new Date(renewalIssueDateValue).getTime()
      ) {
        throw new Error("Expiry date must be on or after the issue date.");
      }

      await patchCertificate(certificateId, {
        issue_date: toIsoDate(renewalIssueDateValue),
        expiry_date: toIsoDate(renewalExpiryDateValue),
      });
      return uploadCertificateFile(certificateId, selectedFile, selectedCompetentPersonId);
    },
    onSuccess: async () => {
      setSelectedFile(null);
      setSelectedCompetentPersonId("");
      setRenewalIssueDate("");
      setRenewalExpiryDate("");
      setFileInputKey((current) => current + 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["uploads", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["certificates", componentId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
      ]);
      success("Certificate renewed", "The certificate dates and document have been updated.");
    },
    onError: (mutationError: Error) => {
      error("Upload failed", mutationError.message);
    },
  });

  const uploadViewMutation = useMutation({
    mutationFn: async (uploadId: string) =>
      getCertificateUploadDownloadUrl(certificateId!, uploadId),
    onSuccess: (response) => {
      window.open(response.url, "_blank", "noopener,noreferrer");
    },
    onError: (mutationError: Error) => {
      error("View failed", mutationError.message);
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

  const competentPersonOptions: SelectProps.Option[] = (competentPersonsQuery.data || []).map(
    (person) => ({
      label: person.full_name,
      value: person.competent_person_id,
      description: `${person.person_type} - ${person.competency_category_name}`,
    })
  );
  const selectedCompetentPerson =
    competentPersonsQuery.data?.find(
      (person) => person.competent_person_id === selectedCompetentPersonId
    ) ?? null;
  const selectedCompetentPersonOption =
    competentPersonOptions.find((option) => option.value === selectedCompetentPersonId) ?? null;

  const uploadColumns: TableProps<CertificateUploadAudit>["columnDefinitions"] = [
    {
      id: "file",
      header: "File",
      cell: (item) => item.file_name,
    },
    {
      id: "uploadedBy",
      header: "Uploaded by",
      cell: (item) => item.uploaded_by_name || "Unknown",
    },
    {
      id: "competentPerson",
      header: "Competent Person",
      cell: (item) => item.competent_person_name || "Not recorded",
    },
    {
      id: "competencyCategory",
      header: "Competency category",
      cell: (item) => item.competency_category_name || "Not recorded",
    },
    {
      id: "uploadedAt",
      header: "Uploaded at",
      cell: (item) => formatDateTime(item.uploaded_at),
    },
    {
      id: "view",
      header: "View",
      width: 120,
      minWidth: 120,
      cell: (item) => (
        <span className="upload-history-view-action">
          <Button
            loading={uploadViewMutation.isPending}
            onClick={() => uploadViewMutation.mutate(item.uuid)}
          >
            View
          </Button>
        </span>
      ),
    },
  ];

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
    onExpiryDateChange: setRenewalExpiryDate,
    onFileChange: setSelectedFile,
    onIssueDateChange: (nextIssueDate) => {
      setRenewalIssueDate(nextIssueDate);
      setRenewalExpiryDate(
        nextIssueDate && selectedTestType
          ? addMonths(nextIssueDate, selectedTestType.validity_duration)
          : renewalExpiryDateValue
      );
    },
    onRenew: () => uploadMutation.mutate(),
    onSelectedCompetentPersonChange: setSelectedCompetentPersonId,
    onViewUpload: (uploadId) => uploadViewMutation.mutate(uploadId),
    renewalExpiryDateValue,
    renewalIssueDateValue,
    selectedCompetentPerson,
    selectedCompetentPersonId,
    selectedCompetentPersonOption,
    selectedFile,
    selectedTestType,
    testTypeName,
    uploadColumns,
    uploadPending: uploadMutation.isPending,
    uploadViewPending: uploadViewMutation.isPending,
    uploads: uploadsQuery.data || [],
    uploadsError: uploadsQuery.isError,
    uploadsLoading: uploadsQuery.isLoading,
    fileInputKey,
  });
}

interface CertificateDetailPageViewProps {
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
  onViewUpload: (uploadId: string) => void;
  renewalExpiryDateValue: string;
  renewalIssueDateValue: string;
  selectedCompetentPerson: CompetentPerson | null;
  selectedCompetentPersonId: string;
  selectedCompetentPersonOption: SelectProps.Option | null;
  selectedFile: File | null;
  selectedTestType: TestType | null;
  testTypeName: string;
  uploadColumns: TableProps<CertificateUploadAudit>["columnDefinitions"];
  uploadPending: boolean;
  uploadViewPending: boolean;
  uploads: CertificateUploadAudit[];
  uploadsError: boolean;
  uploadsLoading: boolean;
}

function renderCertificateDetailPage({
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
  onViewUpload,
  renewalExpiryDateValue,
  renewalIssueDateValue,
  selectedCompetentPerson,
  selectedCompetentPersonId,
  selectedCompetentPersonOption,
  selectedFile,
  selectedTestType,
  testTypeName,
  uploadColumns,
  uploadPending,
  uploadViewPending,
  uploads,
  uploadsError,
  uploadsLoading,
}: CertificateDetailPageViewProps) {
  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate(`/assets/${assetId}?component=${componentId}`)}>
                Back to asset
              </Button>
              {isAdmin ? (
                <Button
                  onClick={() =>
                    navigate(`/assets/${assetId}/components/${componentId}/certificates/${certificateId}/edit`, {
                      state: { from: locationPath },
                    })
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
              <Box>{certificate.certificate_file ? "Attached" : "No file uploaded"}</Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Maintenance notes</Header>}>
            <Box color="text-body-secondary">
            {certificate.maintenance_notes || "No maintenance notes are recorded."}
            </Box>
          </Container>
        </ColumnLayout>

        {isAdmin ? (
          <Container header={<Header variant="h2">Renew/change certificate</Header>}>
            <SpaceBetween direction="vertical" size="m">
              <Box color="text-body-secondary">
                Upload PDF, JPEG, PNG, or WEBP files up to 10 MB.
              </Box>
              <input
                key={fileInputKey}
                aria-label="Certificate renewal file"
                className="file-input"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
              <ColumnLayout columns={2}>
                <FormField label="Issue date">
                  <input
                    aria-label="Certificate renewal issue date"
                    className="app-native-input"
                    value={renewalIssueDateValue}
                    type="date"
                    onChange={(event) => onIssueDateChange(event.target.value)}
                  />
                </FormField>
                <FormField
                  description={
                    selectedTestType && renewalIssueDateValue
                      ? "Auto-filled from the selected certificate test validity."
                      : undefined
                  }
                  label="Expiry date"
                >
                  <input
                    aria-label="Certificate renewal expiry date"
                    className="app-native-input"
                    value={renewalExpiryDateValue}
                    type="date"
                    onChange={(event) => onExpiryDateChange(event.target.value)}
                  />
                </FormField>
              </ColumnLayout>
              <FormField label="Competent Person">
                <Select
                  options={competentPersonOptions}
                  placeholder="Select competent person"
                  selectedOption={selectedCompetentPersonOption}
                statusType={competentPersonsLoading ? "loading" : "finished"}
                  loadingText="Loading competent persons"
                  empty="No active competent persons are available."
                  onChange={({ detail }) =>
                  onSelectedCompetentPersonChange(detail.selectedOption.value || "")
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
                    !selectedFile ||
                    !selectedCompetentPersonId ||
                    !renewalIssueDateValue ||
                    !renewalExpiryDateValue
                  }
                loading={uploadPending}
                variant="primary"
                onClick={onRenew}
                >
                  Renew/change certificate
                </Button>
                {selectedFile ? <Box>{selectedFile.name}</Box> : null}
              </SpaceBetween>
            </SpaceBetween>
          </Container>
        ) : null}

        <Container header={<Header variant="h2">Upload history</Header>}>
          {uploadsError ? (
            <Alert type="warning">Upload history could not be loaded.</Alert>
          ) : (
            <Table
              columnDefinitions={uploadColumns.map((column) =>
                column.id === "view"
                  ? {
                    ...column,
                    cell: (item: CertificateUploadAudit) => (
                      <span className="upload-history-view-action">
                        <Button
                          loading={uploadViewPending}
                          onClick={() => onViewUpload(item.uuid)}
                        >
                          View
                        </Button>
                      </span>
                    ),
                  }
                  : column
              )}
              empty={<Box color="text-body-secondary">No uploads recorded for this certificate.</Box>}
              items={uploads}
              loading={uploadsLoading}
              loadingText="Loading upload history"
              trackBy="file_key"
              variant="embedded"
              wrapLines={false}
            />
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
