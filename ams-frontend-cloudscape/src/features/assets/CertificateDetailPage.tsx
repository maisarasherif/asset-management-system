import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getAsset,
  getCertificate,
  getCertificateDownloadUrl,
  getComponent,
  listCertificateUploads,
  listTestTypes,
  uploadCertificateFile,
} from "../../lib/api/ams";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { useFlashbar } from "../../providers/FlashbarProvider";
import type { CertificateUploadAudit } from "../../types/ams";
import { certificateStatusType } from "../../utils/status";
import { formatDate, formatDateTime, humanizeEnum } from "../../utils/format";

export function CertificateDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { assetId, componentId, certificateId } = useParams();
  const { error, success } = useFlashbar();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const testTypeName = !certificateQuery.data?.test_id
    ? "Not set"
    : testTypesQuery.data?.find((testType) => testType.test_id === certificateQuery.data?.test_id)
        ?.test_name || certificateQuery.data.test_id;

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
      if (!certificateId || !selectedFile) {
        throw new Error("Choose a file before uploading.");
      }

      return uploadCertificateFile(certificateId, selectedFile);
    },
    onSuccess: async () => {
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["uploads", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", assetId] }),
      ]);
      success("File uploaded", "The certificate document is now attached to this record.");
    },
    onError: (mutationError: Error) => {
      error("Upload failed", mutationError.message);
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
    return <PageLoading>Loading certificate details...</PageLoading>;
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

  const uploadColumns: TableProps<CertificateUploadAudit>["columnDefinitions"] = [
    {
      id: "file",
      header: "File",
      cell: (item) => item.file_name,
    },
    {
      id: "uploadedBy",
      header: "Uploaded by",
      cell: (item) => item.uploaded_by,
    },
    {
      id: "uploadedAt",
      header: "Uploaded at",
      cell: (item) => formatDateTime(item.uploaded_at),
    },
  ];

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate(`/assets/${assetId}?component=${componentId}`)}>
                Back to asset
              </Button>
              <Button
                onClick={() =>
                  navigate(
                    `/assets/${assetId}/components/${componentId}/certificates/${certificateId}/edit`
                  )
                }
              >
                Edit certificate
              </Button>
              <Button
                disabled={!certificateQuery.data.certificate_file}
                loading={downloadMutation.isPending}
                variant="primary"
                onClick={() => downloadMutation.mutate()}
              >
                Download file
              </Button>
            </SpaceBetween>
          }
          description={`${componentQuery.data.display_id} - ${testTypeName}`}
          variant="h1"
        >
          {certificateQuery.data.certificate_name}
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Container header={<Header variant="h2">Certificate summary</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <div className="summary-row">
              <Box variant="awsui-key-label">Status</Box>
              <StatusIndicator type={certificateStatusType(certificateQuery.data.status)}>
                {humanizeEnum(certificateQuery.data.status)}
              </StatusIndicator>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Issue date</Box>
              <Box>{formatDate(certificateQuery.data.issue_date)}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Expiry date</Box>
              <Box>{formatDate(certificateQuery.data.expiry_date)}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Issuing authority</Box>
              <Box>{certificateQuery.data.issuing_authority || "Not set"}</Box>
            </div>
          </ColumnLayout>
        </Container>

        <ColumnLayout columns={2} variant="text-grid">
          <Container header={<Header variant="h2">Record details</Header>}>
            <SpaceBetween direction="vertical" size="s">
              <div className="summary-row">
                <Box variant="awsui-key-label">Asset</Box>
                <Box>{assetQuery.data.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Component</Box>
                <Box>{componentQuery.data.name}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificate display ID</Box>
                <Box>{certificateQuery.data.display_id}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">IMCA Ref</Box>
                <Box>{certificateQuery.data.imca_ref || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">IMCA D018</Box>
                <Box>{certificateQuery.data.imca_d018 || "Not set"}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Stored file key</Box>
                <Box>{certificateQuery.data.certificate_file || "No file uploaded"}</Box>
              </div>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Maintenance notes</Header>}>
            <Box color="text-body-secondary">
              {certificateQuery.data.maintenance_notes || "No maintenance notes are recorded."}
            </Box>
          </Container>
        </ColumnLayout>

        <Container header={<Header variant="h2">Attach or replace document</Header>}>
          <SpaceBetween direction="vertical" size="m">
            <Box color="text-body-secondary">
              Upload PDF, JPEG, PNG, or WEBP files up to 10 MB.
            </Box>
            <input
              key={fileInputKey}
              className="file-input"
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                disabled={!selectedFile}
                loading={uploadMutation.isPending}
                variant="primary"
                onClick={() => uploadMutation.mutate()}
              >
                Upload file
              </Button>
              {selectedFile ? <Box>{selectedFile.name}</Box> : null}
            </SpaceBetween>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Upload history</Header>}>
          {uploadsQuery.isError ? (
            <Alert type="warning">Upload history could not be loaded.</Alert>
          ) : (
            <Table
              columnDefinitions={uploadColumns}
              empty={<Box color="text-body-secondary">No uploads recorded for this certificate.</Box>}
              items={uploadsQuery.data || []}
              loading={uploadsQuery.isLoading}
              loadingText="Loading upload history"
              trackBy="file_key"
              variant="embedded"
            />
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
