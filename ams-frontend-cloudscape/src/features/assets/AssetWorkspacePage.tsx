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
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import {
  getAsset,
  listAllCategories,
  listAllMainCategories,
  listAllCertificatesByComponent,
  listAllComponentsByAsset,
  listTestTypes,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { Certificate, ComponentRecord } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
import { assetStatusType, certificateStatusType } from "../../utils/status";

export function AssetWorkspacePage() {
  const navigate = useNavigate();
  const { assetId } = useParams();
  const { setSelectedAssetId } = useAuth();
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

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
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

  const selectedComponent =
    componentsQuery.data?.find((component) => component.component_id === selectedComponentId) ??
    null;

  const certificatesQuery = useQuery({
    queryKey: ["certificates", selectedComponentId],
    queryFn: () => listAllCertificatesByComponent(selectedComponentId!),
    enabled: Boolean(selectedComponentId),
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

  const testTypeMap = useMemo(
    () =>
      new Map(
        (testTypesQuery.data || []).map((testType) => [testType.test_id, testType.test_name])
      ),
    [testTypesQuery.data]
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
      const category = categoryDetailMap.get(component.category_id);
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

  if (assetQuery.isLoading || componentsQuery.isLoading || mainCategoriesQuery.isLoading) {
    return <PageLoading>Loading the asset workspace...</PageLoading>;
  }

  if (
    assetQuery.isError ||
    componentsQuery.isError ||
    mainCategoriesQuery.isError ||
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
      id: "display",
      header: "Display ID",
      cell: (item) => item.display_id,
    },
    {
      id: "test",
      header: "Test type",
      cell: (item) => testTypeMap.get(item.test_id) || item.test_id,
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
  ];

  const componentCount = componentsQuery.data.length;
  const certificateItems = (certificatesQuery.data || []).filter(
    (certificate): certificate is Certificate =>
      Boolean(certificate && certificate.certificate_id)
  );
  const certificateCount = certificateItems.length;

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate("/dashboard")}>Open dashboard</Button>
              <Button
                disabled={!assetQuery.data.datasheet}
                href={assetQuery.data.datasheet || undefined}
                target="_blank"
              >
                Open datasheet
              </Button>
              <Button onClick={() => navigate(`/assets/${assetId}/edit`)}>Edit asset</Button>
              <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                Add component
              </Button>
            </SpaceBetween>
          }
          description={`${assetQuery.data.display_id} - ${assetQuery.data.location || "No location set"}`}
          variant="h1"
        >
          {assetQuery.data.name}
        </Header>
      }
      >
        <SpaceBetween direction="vertical" size="l">
          <div className="asset-media-layout">
            <Container header={<Header variant="h2">Asset photo</Header>}>
              {assetQuery.data.photo ? (
                <div className="asset-photo-frame">
                  <img
                    alt={`${assetQuery.data.name} asset`}
                    className="asset-photo-frame__image"
                    src={assetQuery.data.photo}
                  />
                </div>
              ) : (
                <div className="asset-photo-placeholder">
                  <Box fontSize="heading-m" fontWeight="bold">
                    No photo
                  </Box>
                  <Box color="text-body-secondary">
                    Add a photo URL from the asset edit page to show the asset here.
                  </Box>
                </div>
              )}
            </Container>

            <Container header={<Header variant="h2">Asset overview</Header>}>
              <SpaceBetween direction="vertical" size="l">
                <ColumnLayout columns={4} variant="text-grid">
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Status</Box>
                    <StatusIndicator type={assetStatusType(assetQuery.data.status)}>
                      {humanizeEnum(assetQuery.data.status)}
                    </StatusIndicator>
                  </div>
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Assigned project</Box>
                    <Box>{assetQuery.data.assigned_project || "Not set"}</Box>
                  </div>
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Components</Box>
                    <Box>{componentCount}</Box>
                  </div>
                  <div className="summary-row">
                    <Box variant="awsui-key-label">Selected certificates</Box>
                    <Box>{selectedComponent ? certificateCount : "Select a component"}</Box>
                  </div>
                </ColumnLayout>
                <Box color="text-body-secondary">
                  {assetQuery.data.description || "No asset description is available yet."}
                </Box>
              </SpaceBetween>
            </Container>
          </div>

          <div className="workspace-grid">
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
                  action={
                    <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                      Create first component
                    </Button>
                  }
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

            <div className="workspace-detail-pane">
              <SpaceBetween direction="vertical" size="l">
                <Container
                  header={
                    <Header
                      actions={
                        selectedComponent ? (
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button
                              onClick={() =>
                                navigate(
                                  `/assets/${assetId}/components/${selectedComponent.component_id}/edit`
                                )
                              }
                            >
                              Edit component
                            </Button>
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
                          ? categoryMap.get(selectedComponent.category_id) || "Component detail"
                          : "Select a component from the left pane."
                      }
                      variant="h2"
                    >
                      {selectedComponent ? selectedComponent.name : "Component details"}
                    </Header>
                  }
                >
                  {selectedComponent ? (
                    <ColumnLayout columns={3} variant="text-grid">
                      <div className="summary-row">
                        <Box variant="awsui-key-label">Display ID</Box>
                        <Box>{selectedComponent.display_id}</Box>
                      </div>
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
                  ) : (
                    <Box color="text-body-secondary">
                      Choose a component to show its certificate records here.
                    </Box>
                  )}
                </Container>

                <Container
                  header={
                    <Header
                      counter={selectedComponent ? `(${certificateCount})` : undefined}
                      description={
                        selectedComponent
                          ? "Certificate records for the selected component."
                          : "A component must be selected before certificates can be shown."
                      }
                      variant="h2"
                    >
                      Certificates
                    </Header>
                  }
                >
                  {!selectedComponent ? (
                    <Box color="text-body-secondary">
                      Select a component from the left pane to review its certificates.
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
                          No certificates exist for this component yet.
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
      </SpaceBetween>
    </ContentLayout>
  );
}
