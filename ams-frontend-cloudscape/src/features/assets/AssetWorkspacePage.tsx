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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import {
	  getAsset,
	  getSingleAssetEquipment,
	  listAssetRoutineMaintenance,
  listAllCategories,
  listAllMainCategories,
  listAllCertificatesByComponent,
  listAllComponentsByAsset,
  getCertificateDownloadUrl,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Certificate, ComponentRecord } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType, certificateStatusType } from "../../utils/status";

export function AssetWorkspacePage() {
  const navigate = useNavigate();
  const { assetId } = useParams();
  const { isAdmin, setSelectedAssetId } = useAuth();
  const { error } = useFlashbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedComponentId = searchParams.get("component");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const componentsQuery = useQuery({
    queryKey: ["components", assetId],
    queryFn: () => listAllComponentsByAsset(assetId!),
    enabled: Boolean(assetId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: listAllCategories,
  });

  const mainCategoriesQuery = useQuery({
    queryKey: ["main-categories", "all"],
    queryFn: listAllMainCategories,
  });

  const maintenanceQuery = useQuery({
    queryKey: ["routine-maintenance", assetId],
    queryFn: () => listAssetRoutineMaintenance(assetId!),
    enabled: Boolean(assetId),
  });

  useEffect(() => {
    setSelectedAssetId(assetId ?? null);
  }, [assetId, setSelectedAssetId]);

  useEffect(() => {
    if (!componentsQuery.data || componentsQuery.data.length === 0) {
      return;
    }

    const selectedExists = componentsQuery.data.some(
      (component) => component.component_id === selectedComponentId
    );

    if (selectedExists) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("component", componentsQuery.data[0].component_id);
    setSearchParams(nextParams, { replace: true });
  }, [componentsQuery.data, searchParams, selectedComponentId, setSearchParams]);

  const isSingleEquipment = assetQuery.data?.asset_kind === "SINGLE_EQUIPMENT";
  const equipmentQuery = useQuery({
    queryKey: ["single-equipment", assetId],
    queryFn: () => getSingleAssetEquipment(assetId!),
    enabled: Boolean(assetId && isSingleEquipment),
  });

  const selectedComponent = isSingleEquipment
    ? componentsQuery.data?.find((component) => component.component_kind === "SELF") ?? null
    : componentsQuery.data?.find((component) => component.component_id === selectedComponentId) ??
      null;

  const certificatesQuery = useQuery({
    queryKey: ["certificates", selectedComponent?.component_id],
    queryFn: () => listAllCertificatesByComponent(selectedComponent!.component_id),
    enabled: Boolean(selectedComponent?.component_id),
  });

  const certificateFileMutation = useMutation({
    mutationFn: (certificateId: string) => getCertificateDownloadUrl(certificateId),
    onSuccess: (response) => {
      window.open(response.url, "_blank", "noopener,noreferrer");
    },
    onError: (mutationError: Error) => {
      error("View failed", mutationError.message);
    },
  });

  const categoryMap = useMemo(
    () =>
      new Map(
        (categoriesQuery.data || []).map((category) => [
          category.category_id,
          category.category_name,
        ])
      ),
    [categoriesQuery.data]
  );

  const categoryDetailMap = useMemo(
    () =>
      new Map(
        (categoriesQuery.data || []).map((category) => [category.category_id, category])
      ),
    [categoriesQuery.data]
  );

  const mainCategoryMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.main_category_name,
        ])
      ),
    [mainCategoriesQuery.data]
  );

  const groupedComponents = useMemo(() => {
    const sections: Array<{
      key: string;
      mainCategoryName: string;
      groups: Array<{
        key: string;
        categoryName: string;
        items: ComponentRecord[];
      }>;
    }> = [];

    for (const component of componentsQuery.data || []) {
	      if (component.component_kind === "SELF") {
	        continue;
	      }
	      const category = component.category_id
	        ? categoryDetailMap.get(component.category_id)
	        : undefined;
      const categoryName = category?.category_name || "Uncategorized";
      const mainCategoryName =
        (category?.main_category_id && mainCategoryMap.get(category.main_category_id)) ||
        "Other categories";
      const sectionKey = mainCategoryName;
      const groupKey = `${mainCategoryName}::${categoryName}`;
      const existingSection = sections[sections.length - 1];
      const section =
        existingSection && existingSection.key === sectionKey
          ? existingSection
          : (() => {
              const nextSection = {
                key: sectionKey,
                mainCategoryName,
                groups: [] as Array<{
                  key: string;
                  categoryName: string;
                  items: ComponentRecord[];
                }>,
              };
              sections.push(nextSection);
              return nextSection;
            })();
      const existingGroup = section.groups[section.groups.length - 1];

      if (existingGroup && existingGroup.key === groupKey) {
        existingGroup.items.push(component);
        continue;
      }

      section.groups.push({
        key: groupKey,
        categoryName,
        items: [component],
      });
    }

    return sections;
  }, [categoryDetailMap, componentsQuery.data, mainCategoryMap]);

  if (!assetId) {
    return <PageError description="The asset route is missing." title="Invalid route" />;
  }

  if (
    assetQuery.isLoading ||
    componentsQuery.isLoading ||
    mainCategoriesQuery.isLoading ||
    (isSingleEquipment && equipmentQuery.isLoading)
  ) {
    return <PageLoading>Loading the asset workspace...</PageLoading>;
  }

  if (
    assetQuery.isError ||
    componentsQuery.isError ||
    mainCategoriesQuery.isError ||
    (isSingleEquipment && equipmentQuery.isError) ||
    !assetQuery.data ||
    !componentsQuery.data
  ) {
    return (
      <PageError
        description="The asset workspace could not be loaded."
        onRetry={() => {
          void assetQuery.refetch();
              void componentsQuery.refetch();
              void mainCategoriesQuery.refetch();
              if (isSingleEquipment) {
                void equipmentQuery.refetch();
              }
        }}
      />
    );
  }

  const certificateColumns: TableProps<Certificate>["columnDefinitions"] = [
    {
      id: "certificate",
      header: "Certificate",
      cell: (item) => (
        <RouterLink
          to={`/assets/${assetId}/components/${selectedComponent?.component_id}/certificates/${item.certificate_id}`}
        >
          {item.certificate_name}
        </RouterLink>
      ),
    },
    {
      id: "expiry",
      header: "Expiry",
      cell: (item) => formatDate(item.expiry_date),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusIndicator type={certificateStatusType(item.status)}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
    {
      id: "file",
      header: "View file",
      cell: (item) => (
        <Button
          disabled={!item.certificate_file}
          loading={
            certificateFileMutation.isPending &&
            certificateFileMutation.variables === item.certificate_id
          }
          onClick={() => certificateFileMutation.mutate(item.certificate_id)}
        >
          View file
        </Button>
      ),
    },
  ];

  const componentCount = isSingleEquipment
    ? 1
    : componentsQuery.data.filter((component) => component.component_kind !== "SELF").length;
  const certificateItems = (certificatesQuery.data || []).filter(
    (certificate): certificate is Certificate =>
      Boolean(certificate && certificate.certificate_id)
  );
  const certificateCount = certificateItems.length;
  const maintenanceEvents = maintenanceQuery.data || [];
  const openMaintenanceEvent =
    maintenanceEvents.find((event) => event.status === "REQUIRED") ?? null;
  const maintenanceConfigured = assetQuery.data.maintenance_interval_hours > 0;
  const maintenanceRemaining = maintenanceConfigured
    ? assetQuery.data.next_maintenance_due_hours - assetQuery.data.working_hours
    : 0;

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate("/dashboard")}>Open dashboard</Button>
              <Button onClick={() => navigate(`/assets/${assetId}/routine-maintenance`)}>
                Open maintenance
              </Button>
              <Button
                disabled={!assetQuery.data.datasheet}
                href={assetQuery.data.datasheet || undefined}
                target="_blank"
              >
                Open datasheet
              </Button>
              {isAdmin ? (
                <Button onClick={() => navigate(`/assets/${assetId}/edit`)}>Edit asset</Button>
              ) : null}
              {isAdmin && !isSingleEquipment ? (
                <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                  Add component
                </Button>
              ) : null}
            </SpaceBetween>
          }
          description={`${assetQuery.data.display_id} - ${assetQuery.data.location || "No location set"}`}
          variant="h1"
        >
          {assetQuery.data.name}
        </Header>
      }
    >
      <div className={`asset-workspace-grid${isSingleEquipment ? " asset-workspace-grid--single" : ""}`}>
        {!isSingleEquipment ? (
        <div className="asset-workspace-grid__nav">
          <Container
            header={
              <Header
                counter={`(${componentCount})`}
                description="Choose a component to update the certificate pane."
                variant="h2"
              >
                Components
              </Header>
            }
          >
            {componentCount === 0 ? (
              <PageEmpty
                action={isAdmin ? (
                  <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                    Create first component
                  </Button>
                ) : undefined}
                description="Components are managed inside the asset workspace. Add the first component to begin certificate tracking."
                title="No components in this asset"
              />
            ) : (
              <div className="component-list-scroll">
                <div className="component-list">
                  {groupedComponents.map((section) => (
                    <div key={section.key} className="component-main-group">
                      <Box className="component-main-group__label" variant="awsui-key-label">
                        {section.mainCategoryName}
                      </Box>
                      {section.groups.map((group) => (
                        <div key={group.key} className="component-list-group">
                          <button
                            aria-expanded={!collapsedGroups[group.key]}
                            type="button"
                            className="component-list-group__toggle"
                            onClick={() =>
                              setCollapsedGroups((current) => ({
                                ...current,
                                [group.key]: !(current[group.key] ?? false),
                              }))
                            }
                          >
                            <div className="component-list-group__header">
                              <Box fontWeight="bold">{group.categoryName}</Box>
                              <Box color="text-body-secondary" fontSize="heading-s">
                                {collapsedGroups[group.key] ? "\u25be" : "\u25b4"}
                              </Box>
                            </div>
                          </button>
                          {!collapsedGroups[group.key] && (
                            <div className="component-list-group__items">
                              {group.items.map((component) => {
                                const isSelected =
                                  component.component_id === selectedComponent?.component_id;
                                return (
                                  <button
                                    key={component.component_id}
                                    className={`component-list-item${isSelected ? " is-active" : ""}`}
                                    type="button"
                                    onClick={() => {
                                      const nextParams = new URLSearchParams(searchParams);
                                      nextParams.set("component", component.component_id);
                                      setSearchParams(nextParams);
                                    }}
                                  >
                                    <SpaceBetween direction="vertical" size="xs">
                                      <div className="component-list-item__header">
                                        <Box fontWeight="bold">{component.name}</Box>
                                        <Box color="text-body-secondary">{component.display_id}</Box>
                                      </div>
                                      <div className="component-list-item__meta">
                                        <span>{component.serial_number || "No serial"}</span>
                                        <span>{humanizeEnum(component.safety_critical)}</span>
                                      </div>
                                    </SpaceBetween>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Container>
        </div>
        ) : null}

        <div className="asset-workspace-grid__summary">
          <Container>
            <div className="asset-context-strip">
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Status</Box>
                <StatusIndicator type={assetStatusType(assetQuery.data.status)}>
                  {humanizeEnum(assetQuery.data.status)}
                </StatusIndicator>
              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Location</Box>
                <Box>{assetQuery.data.location || "Not set"}</Box>
              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Assigned project</Box>
                <Box>{assetQuery.data.assigned_project || "Not set"}</Box>
              </div>
	              <div className="asset-context-strip__item">
	                <Box variant="awsui-key-label">
	                  {isSingleEquipment ? "Equipment type" : "Components"}
	                </Box>
	                <Box>
	                  {isSingleEquipment
	                    ? equipmentQuery.data?.equipment_type_name || "Not set"
	                    : componentCount}
	                </Box>
	              </div>
              <div className="asset-context-strip__item">
                <Box variant="awsui-key-label">Routine maintenance</Box>
                {openMaintenanceEvent ? (
                  <StatusIndicator type="warning">Required</StatusIndicator>
                ) : maintenanceConfigured ? (
                  <Box>
                    {Math.max(maintenanceRemaining, 0).toLocaleString()} h remaining
                  </Box>
                ) : (
                  <Box>Not configured</Box>
                )}
              </div>
            </div>
          </Container>
        </div>

        <div className="asset-workspace-grid__detail">
          <SpaceBetween direction="vertical" size="l">
            <Container
              header={
                <Header
                  actions={
	                    selectedComponent && isAdmin ? (
	                      <SpaceBetween direction="horizontal" size="xs">
	                        {!isSingleEquipment ? (
	                          <Button
	                            onClick={() =>
	                              navigate(
	                                `/assets/${assetId}/components/${selectedComponent.component_id}/edit`
	                              )
	                            }
	                          >
	                            Edit component
	                          </Button>
	                        ) : null}
	                        <Button
                          variant="primary"
                          onClick={() =>
                            navigate(
                              `/assets/${assetId}/components/${selectedComponent.component_id}/certificates/new`
                            )
                          }
                        >
                          Add certificate
                        </Button>
                      </SpaceBetween>
                    ) : undefined
                  }
	                  description={
	                    selectedComponent
	                      ? isSingleEquipment
	                        ? equipmentQuery.data?.equipment_type_name || "Equipment detail"
	                        : (selectedComponent.category_id &&
	                            categoryMap.get(selectedComponent.category_id)) ||
	                          "Component detail"
	                      : isSingleEquipment
	                        ? "Equipment context could not be loaded."
	                        : "Select a component from the left pane."
	                  }
                  variant="h2"
                >
	                  {selectedComponent
	                    ? isSingleEquipment
	                      ? "Equipment details"
	                      : selectedComponent.name
	                    : "Component details"}
                </Header>
              }
            >
	              {selectedComponent ? (
	                isSingleEquipment ? (
	                  <ColumnLayout columns={3} variant="text-grid">
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Equipment type</Box>
	                      <Box>{equipmentQuery.data?.equipment_type_name || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Equipment reference</Box>
	                      <Box>{equipmentQuery.data?.display_id || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Certificate bridge</Box>
	                      <Box>{selectedComponent.display_id}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Location</Box>
	                      <Box>{selectedComponent.location || assetQuery.data.location || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Project</Box>
	                      <Box>
	                        {selectedComponent.assigned_project ||
	                          assetQuery.data.assigned_project ||
	                          "Not set"}
	                      </Box>
	                    </div>
	                  </ColumnLayout>
	                ) : (
	                  <ColumnLayout columns={3} variant="text-grid">
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Manufacturer</Box>
	                      <Box>{selectedComponent.manufacturer || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Model</Box>
	                      <Box>{selectedComponent.model || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Safety critical</Box>
	                      <Box>{humanizeEnum(selectedComponent.safety_critical)}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Location</Box>
	                      <Box>{selectedComponent.location || "Not set"}</Box>
	                    </div>
	                    <div className="summary-row">
	                      <Box variant="awsui-key-label">Project</Box>
	                      <Box>{selectedComponent.assigned_project || "Not set"}</Box>
	                    </div>
	                  </ColumnLayout>
	                )
	              ) : (
                <Box color="text-body-secondary">
	                  {isSingleEquipment
	                    ? "Equipment details are not available yet."
	                    : "Choose a component to show its certificate records here."}
                </Box>
              )}
            </Container>

            <Container
              header={
                <Header
                  counter={selectedComponent ? `(${certificateCount})` : undefined}
	                  description={
	                    selectedComponent
	                      ? isSingleEquipment
	                        ? "Certificate records for this asset."
	                        : "Certificate records for the selected component."
	                      : isSingleEquipment
	                        ? "The equipment bridge must load before certificates can be shown."
	                        : "A component must be selected before certificates can be shown."
	                  }
                  variant="h2"
                >
	                  {isSingleEquipment ? "Asset certificates" : "Certificates"}
                </Header>
              }
            >
              {!selectedComponent ? (
                <Box color="text-body-secondary">
		                  {isSingleEquipment
		                    ? "Equipment certificates will appear once the equipment context is loaded."
		                    : "Select a component from the left pane to review its certificates."}
                </Box>
              ) : certificatesQuery.isError ? (
                <Alert type="error">
                  Certificate data could not be loaded for this component.
                </Alert>
              ) : (
                <Table
                  columnDefinitions={certificateColumns}
                  empty={
                    <Box color="text-body-secondary">
	                      {isSingleEquipment
	                        ? "No certificates exist for this asset yet."
	                        : "No certificates exist for this component yet."}
                    </Box>
                  }
                  items={certificateItems}
                  loading={certificatesQuery.isLoading}
                  loadingText="Loading certificates"
                  trackBy="certificate_id"
                  variant="embedded"
                />
              )}
            </Container>

          </SpaceBetween>
        </div>
      </div>
    </ContentLayout>
  );
}
