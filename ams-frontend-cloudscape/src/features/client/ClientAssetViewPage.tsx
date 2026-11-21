import { componentKindFacet } from "../../components/shared/listFacetOptions";
import { AssetCategoryFilter } from "../../components/shared/AssetComponentFilters";
import { ListFilters, ListPagination } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import { CertificateListFilters } from "../../components/shared/CertificateListFilters";
import {
  Alert,
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CertificateDonut } from "../../components/shared/CertificateDonut";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  getClientAsset,
  getAssetCertificateSummary,
  listClientAssetCertificates,
  listClientAssetComponents,
  getClientCertificateDownloadUrl,
} from "../../lib/api/ams";
import { formatDate, formatRenewalDuration, humanizeEnum } from "../../utils/format";
import { Availability } from "../maintenance/EquipmentMaintenanceSummary";
import { certificateStatusType } from "../../utils/status";
import type { ClientComponent } from "../../types/ams";
import { useFlashbar } from "../../providers/flashbar-context";

export function ClientAssetViewPage() {
  const navigate = useNavigate();
  const { assetId } = useParams();
  const { error } = useFlashbar();
  const [componentSelection, setSelectedComponent] = useState<ClientComponent | null>(null);
  const selectedComponent = componentSelection?.asset_id === assetId ? componentSelection : null;
  const selectedComponentId = selectedComponent?.component_id;

  const assetQuery = useQuery({
    queryKey: ["client-asset", assetId],
    queryFn: () => getClientAsset(assetId!, false, false),
    enabled: Boolean(assetId),
  });

  const componentControls = useListControls("components", ["component_kind", "category_id"]);
  const componentList = useQuery({
    queryKey: ["client-asset", assetId, "components", componentControls.query],
    queryFn: () => listClientAssetComponents(assetId!, componentControls.query),
    enabled: Boolean(assetId),
  });
  const components = componentList.data?.data ?? [];

  const certificateControls = useListControls("certificates", ["status", "test_id"]);
  const certificateList = useQuery({
    queryKey: ["client-asset", assetId, selectedComponentId, certificateControls.query],
    queryFn: () => listClientAssetCertificates(assetId!, { ...certificateControls.query, component_id: selectedComponentId ?? undefined }),
    enabled: Boolean(assetId && selectedComponentId),
  });
  const certificateItems = certificateList.data?.data ?? [];

  const summaryQuery = useQuery({
    queryKey: ["client-asset", assetId, "summary"],
    queryFn: () => getAssetCertificateSummary(assetId!, true),
    enabled: Boolean(assetId),
  });

  function handleComponentSelect(component: ClientComponent) {
    if (selectedComponentId === component.component_id) return;
    setSelectedComponent(component);
    if (certificateControls.page > 1) certificateControls.setPage(1, true);
  }

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

  if (assetQuery.isLoading || summaryQuery.isLoading) {
    return <PageLoading>{"Loading asset certificate data\u2026"}</PageLoading>;
  }

  if (assetQuery.isError || summaryQuery.isError || !assetQuery.data || !summaryQuery.data) {
    return (
      <PageError
        description="This asset could not be loaded, or it is not assigned to your active projects."
        onRetry={() => { void assetQuery.refetch(); void summaryQuery.refetch(); }}
      />
    );
  }

  const { asset } = assetQuery.data;
  const summary = summaryQuery.data;
  const componentCount = summary.component_count;

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
        <div className="dashboard-top-grid">
          <Container header={<Header variant="h2">Certificate status</Header>}>
            <CertificateDonut
              expired={summary.expired}
              expiringSoon={summary.expiring_soon}
              valid={summary.valid}
            />
          </Container>
          <Container header={<Header variant="h2">Asset details</Header>}>
            <SpaceBetween direction="vertical" size="xs">
              <div className="summary-row">
                <Box variant="awsui-key-label">Status</Box>
                <Availability quarantined={asset.quarantined} status={asset.status} />
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
                <Box>{componentCount}</Box>
              </div>
              <div className="summary-row">
                <Box variant="awsui-key-label">Certificates</Box>
                <Box>{summary.certificate_count}</Box>
              </div>
            </SpaceBetween>
          </Container>
        </div>

        <div className="client-asset-workspace">
          <div className="client-asset-workspace__components">
            <Container header={<Header counter={`(${componentList.data?.meta.total ?? 0})`} variant="h2">Components</Header>}>
              <ListFilters controls={componentControls} label="Search components" facets={[componentKindFacet]}>
                <AssetCategoryFilter assetId={assetId} controls={componentControls} client />
              </ListFilters>
              {componentList.isPending ? <Box>Loading components…</Box> :
                componentList.isError ? <Alert type="error">Components could not be loaded.</Alert> :
                components.length === 0 ? (
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
                        onClick={() => handleComponentSelect(component)}
                      >
                        <span className="client-component-list__title">{component.name}</span>
                        {component.quarantined && <Availability quarantined />}
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
              <ListPagination controls={componentControls} meta={componentList.data?.meta} />
            </Container>
          </div>

          <div className="client-asset-workspace__certificates">
            <Container
              header={
                <Header
                  counter={selectedComponent ? `(${certificateList.data?.meta.total ?? 0})` : undefined}
                  description={selectedComponent ? selectedComponent.name : "Select a component from the table."}
                  variant="h2"
                >
                  Certificates
                </Header>
              }
            >
              {selectedComponent && <CertificateListFilters controls={certificateControls} clientAssetId={assetId} />}
              {!selectedComponent ? (
                <Alert type="info">Select a component to review its certificates.</Alert>
              ) : certificateList.isPending ? (
                <Box>Loading certificates…</Box>
              ) : certificateList.isError ? (
                <Alert type="error">Certificates could not be loaded.</Alert>
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
                        <div className="client-certificate-record__field">
                          <span className="client-certificate-record__label">Renewal</span>
                          <span className="client-certificate-record__value">
                            {formatRenewalDuration(
                              certificate.test_requires_renewal,
                              certificate.test_period_months
                            )}
                          </span>
                        </div>
                        <div className="client-certificate-record__field">
                          <span className="client-certificate-record__label">Expiry</span>
                          <span className="client-certificate-record__value">
                            {formatDate(certificate.expiry_date)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedComponent && <ListPagination controls={certificateControls} meta={certificateList.data?.meta} />}
            </Container>
          </div>
        </div>
      </SpaceBetween>
    </ContentLayout>
  );
}
