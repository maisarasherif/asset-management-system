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
} from "@cloudscape-design/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  getClientAsset,
  getClientCertificateDownloadUrl,
} from "../../lib/api/ams";
import { formatDate, formatMonthDuration, humanizeEnum } from "../../utils/format";
import { assetStatusType, certificateStatusType } from "../../utils/status";
import { useFlashbar } from "../../providers/flashbar-context";

export function ClientAssetViewPage() {
  const navigate = useNavigate();
  const { assetId } = useParams();
  const { error } = useFlashbar();
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  const assetQuery = useQuery({
    queryKey: ["client-asset", assetId],
    queryFn: () => getClientAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const selectedComponent = useMemo(
    () =>
      assetQuery.data?.components.find((component) => component.component_id === selectedComponentId) ??
      null,
    [assetQuery.data?.components, selectedComponentId]
  );

  const certificateItems = useMemo(
    () =>
      (assetQuery.data?.certificates || []).filter(
        (certificate) => certificate.component_id === selectedComponent?.component_id
      ),
    [assetQuery.data?.certificates, selectedComponent?.component_id]
  );

  const handleComponentSelect = useCallback((componentId: string) => {
    setSelectedComponentId((currentComponentId) =>
      currentComponentId === componentId ? currentComponentId : componentId
    );
  }, []);

  const fileMutation = useMutation({
    mutationFn: (certificateId: string) => getClientCertificateDownloadUrl(certificateId),
    onSuccess: (response) => {
      window.open(response.url, "_blank", "noopener,noreferrer");
    },
    onError: (mutationError: Error) => {
      error("View failed", mutationError.message);
    },
  });

  if (!assetId) {
    return <PageError description="The client asset route is incomplete." />;
  }

  if (assetQuery.isLoading) {
    return <PageLoading>Loading asset certificate data...</PageLoading>;
  }

  if (assetQuery.isError || !assetQuery.data) {
    return (
      <PageError
        description="This asset could not be loaded, or it is not assigned to your active projects."
        onRetry={() => void assetQuery.refetch()}
      />
    );
  }

  const { asset, components } = assetQuery.data;

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <Button onClick={() => navigate("/client/assets")}>Back to assets</Button>
          }
          description={`${asset.display_id} - ${asset.assigned_project || "No project set"}`}
          variant="h1"
        >
          {asset.name}
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Container>
          <ColumnLayout columns={4} variant="text-grid">
            <div className="summary-row">
              <Box variant="awsui-key-label">Status</Box>
              <StatusIndicator type={assetStatusType(asset.status)}>
                {humanizeEnum(asset.status)}
              </StatusIndicator>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Location</Box>
              <Box>{asset.location || "Not set"}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Assigned project</Box>
              <Box>{asset.assigned_project || "Not set"}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Components</Box>
              <Box>{components.length}</Box>
            </div>
          </ColumnLayout>
        </Container>

        <div className="client-asset-workspace">
          <div className="client-asset-workspace__components">
            <Container header={<Header counter={`(${components.length})`} variant="h2">Components</Header>}>
              {components.length === 0 ? (
                <Box color="text-body-secondary">No components are recorded for this asset.</Box>
              ) : (
                <div className="client-component-list" role="listbox" aria-label="Components">
                  {components.map((component) => {
                    const isSelected = component.component_id === selectedComponent?.component_id;

                    return (
                      <button
                        key={component.component_id}
                        type="button"
                        className={`client-component-list__item${isSelected ? " is-selected" : ""}`}
                        aria-selected={isSelected}
                        role="option"
                        onClick={() => handleComponentSelect(component.component_id)}
                      >
                        <span className="client-component-list__title">{component.name}</span>
                        <span className="client-component-list__grid">
                          <span>
                            <span className="client-component-list__label">Main category</span>
                            <span className="client-component-list__value">
                              {component.main_category_name || "Not set"}
                            </span>
                          </span>
                          <span>
                            <span className="client-component-list__label">Category</span>
                            <span className="client-component-list__value">
                              {component.category_name || "Not set"}
                            </span>
                          </span>
                          <span>
                            <span className="client-component-list__label">Serial number</span>
                            <span className="client-component-list__value">
                              {component.serial_number || "Not set"}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Container>
          </div>

          <div className="client-asset-workspace__certificates">
            <Container
              header={
                <Header
                  counter={selectedComponent ? `(${certificateItems.length})` : undefined}
                  description={selectedComponent ? selectedComponent.name : "Select a component from the table."}
                  variant="h2"
                >
                  Certificates
                </Header>
              }
            >
              {!selectedComponent ? (
                <Alert type="info">Select a component to review its certificates.</Alert>
              ) : certificateItems.length === 0 ? (
                <Box color="text-body-secondary">No certificates are recorded for this component.</Box>
              ) : (
                <div className="client-certificate-scroll" role="region" aria-label="Certificates">
                  <div className="client-certificate-list">
                    {certificateItems.map((certificate) => (
                      <div
                        className={`client-certificate-record client-certificate-record--${certificate.status.toLowerCase().replace(/_/g, "-")}`}
                        key={certificate.certificate_id}
                      >
                        <div className="client-certificate-record__field client-certificate-record__field--name">
                          <span className="client-certificate-record__label">Certificate</span>
                          <span className="client-certificate-record__value">
                            {certificate.certificate_name}
                          </span>
                        </div>
                        <div className="client-certificate-record__field client-certificate-record__field--status">
                          <span className="client-certificate-record__label">Validity</span>
                          <StatusIndicator type={certificateStatusType(certificate.status)}>
                            {humanizeEnum(certificate.status)}
                          </StatusIndicator>
                        </div>
                        <div className="client-certificate-record__field">
                          <span className="client-certificate-record__label">Test period</span>
                          <span className="client-certificate-record__value">
                            {formatMonthDuration(certificate.test_period_months)}
                          </span>
                        </div>
                        <div className="client-certificate-record__field">
                          <span className="client-certificate-record__label">Issue</span>
                          <span className="client-certificate-record__value">
                            {formatDate(certificate.issue_date)}
                          </span>
                        </div>
                        <div className="client-certificate-record__field">
                          <span className="client-certificate-record__label">Expiry</span>
                          <span className="client-certificate-record__value">
                            {formatDate(certificate.expiry_date)}
                          </span>
                        </div>
                        <div className="client-certificate-record__field client-certificate-record__field--action">
                          <span className="client-certificate-record__label">File</span>
                          <Button
                            disabled={!certificate.has_file}
                            loading={fileMutation.isPending}
                            onClick={() => fileMutation.mutate(certificate.certificate_id)}
                          >
                            View file
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Container>
          </div>
        </div>
      </SpaceBetween>
    </ContentLayout>
  );
}
