import {
  Alert,
  Box,
  Button,
  ButtonDropdown,
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
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { RouterLink } from "../../components/shared/RouterLink";
import { TableCellText } from "../../components/shared/TableCells";
import {
  getAsset,
  getSingleAssetEquipment,
  listAllCatalogScopeCategories,
  listCatalogScopes,
  listAssetRoutineMaintenance,
  listAllCertificatesByComponent,
  listAllComponentsByAsset,
  listTestTypes,
  getCertificateDownloadUrl,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  Asset,
  AssetMaintenanceEvent,
  CatalogScopeCategory,
  Certificate,
  ComponentRecord,
  SingleAssetEquipment,
  TestType,
} from "../../types/ams";
import { formatDate, formatRenewalDuration, humanizeEnum } from "../../utils/format";
import { assetStatusType, certificateStatusType } from "../../utils/status";

type ComponentGroupSection = {
  key: string;
  mainCategoryName: string;
  groups: Array<{
    key: string;
    categoryName: string;
    items: ComponentRecord[];
  }>;
};

type AssetWorkspaceViewProps = {
  asset: Asset;
  assetId: string;
  categoryMap: Map<string, string>;
  certificateColumns: TableProps<Certificate>["columnDefinitions"];
  certificateCount: number;
  certificateItems: Certificate[];
  certificatesError: boolean;
  certificatesLoading: boolean;
  collapsedGroups: Record<string, boolean>;
  componentCount: number;
  equipment: SingleAssetEquipment | undefined;
  groupedComponents: ComponentGroupSection[];
  isAdmin: boolean;
  isSingleEquipment: boolean;
  maintenanceConfigured: boolean;
  maintenanceRemaining: number;
  navigate: ReturnType<typeof useNavigate>;
  onComponentSelect: (componentId: string) => void;
  openMaintenanceEvent: AssetMaintenanceEvent | null;
  selectedComponent: ComponentRecord | null;
  setCollapsedGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
};

const SINGLE_EQUIPMENT_CERTIFICATE_EMPTY = (
  <Box color="text-body-secondary">No certificates exist for this asset yet.</Box>
);
const COMPONENT_CERTIFICATE_EMPTY = (
  <Box color="text-body-secondary">No certificates exist for this component yet.</Box>
);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(expiryDate: string | null | undefined) {
  if (!expiryDate) {
    return null;
  }

  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const expiryStart = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return Math.ceil((expiryStart - todayStart) / DAY_MS);
}

function certificateRiskRank(certificate: Certificate) {
  if (certificate.status === "EXPIRED") return 0;
  if (certificate.status === "EXPIRING_SOON") return 1;
  if (certificate.status === "PENDING") return 2;
  return 3;
}

function certificateTimingLabel(certificate: Certificate) {
  const days = daysUntil(certificate.expiry_date);

  if (days === null) {
    return "Expiry date unavailable";
  }

  if (days < 0) {
    return `${Math.abs(days)} d overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  return `${days} d remaining`;
}

function sortCertificatesByRisk(certificates: Certificate[]) {
  return [...certificates].sort((a, b) => {
    const riskDelta = certificateRiskRank(a) - certificateRiskRank(b);
    if (riskDelta !== 0) {
      return riskDelta;
    }

    const firstExpiry = a.expiry_date ? new Date(a.expiry_date).getTime() : Number.POSITIVE_INFINITY;
    const secondExpiry = b.expiry_date ? new Date(b.expiry_date).getTime() : Number.POSITIVE_INFINITY;
    return firstExpiry - secondExpiry;
  });
}

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

  const catalogScopesQuery = useQuery({
    queryKey: ["catalog-scopes"],
    queryFn: listCatalogScopes,
  });

  const scopeCategoriesQuery = useQuery({
    queryKey: ["catalog-scope-categories", "asset-workspace", "all-scopes"],
    queryFn: () =>
      Promise.all(
        (catalogScopesQuery.data || []).map((scope) =>
          listAllCatalogScopeCategories(scope.scope_id)
        )
      ),
    enabled: Boolean(catalogScopesQuery.data?.length),
  });

  const maintenanceQuery = useQuery({
    queryKey: ["routine-maintenance", assetId],
    queryFn: () => listAssetRoutineMaintenance(assetId!),
    enabled: Boolean(assetId),
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
    () => {
      const labels = new Map<string, string>();
      for (const category of (scopeCategoriesQuery.data || []).flat()) {
        const label = `${category.main_category_name} > ${category.category_name}`;
        labels.set(category.scope_category_id, label);
        if (!labels.has(category.category_id)) {
          labels.set(category.category_id, label);
        }
      }
      return labels;
    },
    [scopeCategoriesQuery.data]
  );

  const categoryDetailMap = useMemo(
    () => {
      const categories = new Map<string, CatalogScopeCategory>();
      for (const category of (scopeCategoriesQuery.data || []).flat()) {
        categories.set(category.scope_category_id, category);
        if (!categories.has(category.category_id)) {
          categories.set(category.category_id, category);
        }
      }
      return categories;
    },
    [scopeCategoriesQuery.data]
  );

  const groupedComponents = useMemo(() => {
    const sections: ComponentGroupSection[] = [];

    for (const component of componentsQuery.data || []) {
      if (component.component_kind === "SELF") {
        continue;
      }
      const categoryKey = component.scope_category_id || component.category_id;
      const category = categoryKey ? categoryDetailMap.get(categoryKey) : undefined;
      const categoryName = category?.category_name || "Uncategorized";
      const mainCategoryName = category?.main_category_name || "Other categories";
      const sectionKey = category?.main_category_id || mainCategoryName;
      const groupKey = category?.scope_category_id || `${sectionKey}::${categoryName}`;
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
  }, [categoryDetailMap, componentsQuery.data]);

  if (!assetId) {
    return <PageError description="The asset route is missing." title="Invalid route" />;
  }

  if (
    assetQuery.isLoading ||
    componentsQuery.isLoading ||
    catalogScopesQuery.isLoading ||
    scopeCategoriesQuery.isLoading ||
    testTypesQuery.isLoading ||
    (isSingleEquipment && equipmentQuery.isLoading)
  ) {
    return <PageLoading>{"Loading the asset workspace\u2026"}</PageLoading>;
  }

  if (
    assetQuery.isError ||
    componentsQuery.isError ||
    catalogScopesQuery.isError ||
    scopeCategoriesQuery.isError ||
    testTypesQuery.isError ||
    (isSingleEquipment && equipmentQuery.isError) ||
    !assetQuery.data ||
    !componentsQuery.data ||
    !testTypesQuery.data
  ) {
    return (
      <PageError
        description="The asset workspace could not be loaded."
        onRetry={() => {
          void assetQuery.refetch();
          void componentsQuery.refetch();
          void catalogScopesQuery.refetch();
          void scopeCategoriesQuery.refetch();
          void testTypesQuery.refetch();
          if (isSingleEquipment) {
            void equipmentQuery.refetch();
          }
        }}
      />
    );
  }

  const testTypeMap = new Map(
    testTypesQuery.data.map((testType: TestType) => [testType.test_id, testType])
  );

  const certificateColumns: TableProps<Certificate>["columnDefinitions"] = [
    {
      id: "certificate",
      header: "Certificate",
      width: "28%",
      minWidth: 210,
      cell: (item) => (
        <TableCellText title={item.certificate_name}>
          <RouterLink
            to={`/assets/${assetId}/components/${selectedComponent?.component_id}/certificates/${item.certificate_id}`}
          >
            {item.certificate_name}
          </RouterLink>
        </TableCellText>
      ),
    },
    {
      id: "validity",
      header: "Validity",
      width: 120,
      minWidth: 110,
      cell: (item) => (
        <StatusIndicator type={certificateStatusType(item.status)}>
          {humanizeEnum(item.status)}
        </StatusIndicator>
      ),
    },
    {
      id: "file",
      header: "File",
      width: 120,
      minWidth: 110,
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
    {
      id: "test-period",
      header: "Renewal",
      width: 125,
      minWidth: 115,
      cell: (item) => {
        const testType = testTypeMap.get(item.test_id);
        return formatRenewalDuration(testType?.requires_renewal, testType?.validity_duration);
      },
    },
    {
      id: "expiry",
      header: "Expiry",
      width: 125,
      minWidth: 115,
      cell: (item) => formatDate(item.expiry_date),
    },
    {
      id: "timing",
      header: "Timing",
      width: 135,
      minWidth: 125,
      cell: (item) => (
        <Box color={item.status === "EXPIRED" ? "text-status-error" : "text-body-secondary"}>
          {certificateTimingLabel(item)}
        </Box>
      ),
    },
  ];

  const componentCount = isSingleEquipment
    ? 1
    : componentsQuery.data.filter((component) => component.component_kind !== "SELF").length;
  const certificateItems = sortCertificatesByRisk(
    (certificatesQuery.data || []).filter(
      (certificate): certificate is Certificate =>
        Boolean(certificate && certificate.certificate_id)
    )
  );
  const certificateCount = certificateItems.length;
  const maintenanceEvents = maintenanceQuery.data || [];
  const openMaintenanceEvent =
    maintenanceEvents.find((event) => event.status === "REQUIRED") ?? null;
  const maintenanceConfigured = assetQuery.data.maintenance_interval_hours > 0;
  const maintenanceRemaining = maintenanceConfigured
    ? assetQuery.data.next_maintenance_due_hours - assetQuery.data.working_hours
    : 0;
  const handleComponentSelect = (componentId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("component", componentId);
    setSearchParams(nextParams);
  };

  return (
    <AssetWorkspaceView
      asset={assetQuery.data}
      assetId={assetId}
      categoryMap={categoryMap}
      certificateColumns={certificateColumns}
      certificateCount={certificateCount}
      certificateItems={certificateItems}
      certificatesError={certificatesQuery.isError}
      certificatesLoading={certificatesQuery.isLoading}
      collapsedGroups={collapsedGroups}
      componentCount={componentCount}
      equipment={equipmentQuery.data}
      groupedComponents={groupedComponents}
      isAdmin={isAdmin}
      isSingleEquipment={isSingleEquipment}
      maintenanceConfigured={maintenanceConfigured}
      maintenanceRemaining={maintenanceRemaining}
      navigate={navigate}
      onComponentSelect={handleComponentSelect}
      openMaintenanceEvent={openMaintenanceEvent}
      selectedComponent={selectedComponent}
      setCollapsedGroups={setCollapsedGroups}
    />
  );
}

function AssetWorkspaceView(props: AssetWorkspaceViewProps) {
  return (
    <ContentLayout header={<AssetWorkspaceHeader {...props} />}>
      <div className={`asset-workspace-grid${props.isSingleEquipment ? " asset-workspace-grid--single" : ""}`}>
        {!props.isSingleEquipment ? <ComponentNavigation {...props} /> : null}
        <AssetContextStrip {...props} />
        <WorkspaceDetail {...props} />
      </div>
    </ContentLayout>
  );
}

function AssetWorkspaceHeader({
  asset,
  assetId,
  isAdmin,
  isSingleEquipment,
  navigate,
}: AssetWorkspaceViewProps) {
  return (
    <Header
      actions={
        <div className="app-header-actions">
          <div className="app-header-actions__desktop">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" onClick={() => navigate("/dashboard")}>Open dashboard</Button>
              <Button onClick={() => navigate(`/assets/${assetId}/routine-maintenance`)}>
                Open maintenance
              </Button>
              <Button disabled={!asset.datasheet} href={asset.datasheet || undefined} target="_blank">
                Open datasheet
              </Button>
              {isAdmin ? <Button onClick={() => navigate(`/assets/${assetId}/edit`)}>Edit asset</Button> : null}
              {isAdmin && !isSingleEquipment ? (
                <Button onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                  Add component
                </Button>
              ) : null}
            </SpaceBetween>
          </div>
          <div className="app-header-actions__mobile">
            <Button variant="primary" onClick={() => navigate("/dashboard")}>Open dashboard</Button>
            <ButtonDropdown
              items={[
                { id: "maintenance", text: "Open maintenance" },
                { id: "datasheet", text: "Open datasheet", disabled: !asset.datasheet },
                ...(isAdmin ? [{ id: "edit-asset", text: "Edit asset" }] : []),
                ...(isAdmin && !isSingleEquipment ? [{ id: "add-component", text: "Add component" }] : []),
              ]}
              onItemClick={({ detail }) => {
                if (detail.id === "maintenance") {
                  navigate(`/assets/${assetId}/routine-maintenance`);
                }
                if (detail.id === "datasheet" && asset.datasheet) {
                  window.open(asset.datasheet, "_blank", "noopener,noreferrer");
                }
                if (detail.id === "edit-asset") {
                  navigate(`/assets/${assetId}/edit`);
                }
                if (detail.id === "add-component") {
                  navigate(`/assets/${assetId}/components/new`);
                }
              }}
            >
              More actions
            </ButtonDropdown>
          </div>
        </div>
      }
      description={`${asset.display_id} - ${asset.location || "No location set"}`}
      variant="h1"
    >
      {asset.name}
    </Header>
  );
}

function ComponentNavigation(props: AssetWorkspaceViewProps) {
  const { assetId, componentCount, groupedComponents, isAdmin, navigate } = props;

  return (
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
            action={
              isAdmin ? (
                <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
                  Create first component
                </Button>
              ) : undefined
            }
            description="Components are managed inside the asset workspace. Add the first component to begin certificate tracking."
            title="No components in this asset"
          />
        ) : (
          <div className="component-list-scroll">
            <div className="component-list">
              {groupedComponents.map((section) => (
                <ComponentMainGroup key={section.key} section={section} {...props} />
              ))}
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}

function ComponentMainGroup({
  collapsedGroups,
  onComponentSelect,
  section,
  selectedComponent,
  setCollapsedGroups,
}: AssetWorkspaceViewProps & { section: ComponentGroupSection }) {
  return (
    <div className="component-main-group">
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
              {group.items.map((component) => (
                <ComponentListItem
                  key={component.component_id}
                  component={component}
                  isSelected={component.component_id === selectedComponent?.component_id}
                  onComponentSelect={onComponentSelect}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ComponentListItem({
  component,
  isSelected,
  onComponentSelect,
}: {
  component: ComponentRecord;
  isSelected: boolean;
  onComponentSelect: (componentId: string) => void;
}) {
  return (
    <button
      className={`component-list-item${isSelected ? " is-active" : ""}`}
      type="button"
      onClick={() => onComponentSelect(component.component_id)}
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
}

function AssetContextStrip({
  asset,
  componentCount,
  equipment,
  isSingleEquipment,
  maintenanceConfigured,
  maintenanceRemaining,
  openMaintenanceEvent,
}: AssetWorkspaceViewProps) {
  return (
    <div className="asset-workspace-grid__summary">
      <Container>
        <div className="asset-context-strip">
          <div className="asset-context-strip__item">
            <Box variant="awsui-key-label">Status</Box>
            <StatusIndicator type={assetStatusType(asset.status)}>
              {humanizeEnum(asset.status)}
            </StatusIndicator>
          </div>
          <div className="asset-context-strip__item">
            <Box variant="awsui-key-label">Location</Box>
            <Box>{asset.location || "Not set"}</Box>
          </div>
          <div className="asset-context-strip__item">
            <Box variant="awsui-key-label">Assigned project</Box>
            <Box>{asset.assigned_project || "Not set"}</Box>
          </div>
          <div className="asset-context-strip__item">
            <Box variant="awsui-key-label">{isSingleEquipment ? "Equipment type" : "Components"}</Box>
            <Box>{isSingleEquipment ? equipment?.equipment_type_name || "Not set" : componentCount}</Box>
          </div>
          <div className="asset-context-strip__item">
            <Box variant="awsui-key-label">Routine maintenance</Box>
            {openMaintenanceEvent ? (
              <StatusIndicator type="warning">Required</StatusIndicator>
            ) : maintenanceConfigured ? (
              <Box>{Math.max(maintenanceRemaining, 0).toLocaleString()} h remaining</Box>
            ) : (
              <Box>Not configured</Box>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}

function WorkspaceDetail(props: AssetWorkspaceViewProps) {
  return (
    <div className="asset-workspace-grid__detail">
      <SpaceBetween direction="vertical" size="l">
        <ComponentDetailPanel {...props} />
        <CertificatesPanel {...props} />
      </SpaceBetween>
    </div>
  );
}

function ComponentDetailPanel(props: AssetWorkspaceViewProps) {
  return (
    <Container header={<ComponentDetailHeader {...props} />}>
      {props.selectedComponent ? <ComponentDetailBody {...props} /> : <NoComponentDetail {...props} />}
    </Container>
  );
}

function ComponentDetailHeader({
  assetId,
  categoryMap,
  equipment,
  isAdmin,
  isSingleEquipment,
  navigate,
  selectedComponent,
}: AssetWorkspaceViewProps) {
  return (
    <Header
      actions={
        selectedComponent && isAdmin ? (
          <SpaceBetween direction="horizontal" size="xs">
            {!isSingleEquipment ? (
              <Button
                onClick={() =>
                  navigate(`/assets/${assetId}/components/${selectedComponent.component_id}/edit`)
                }
              >
                Edit component
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() =>
                navigate(`/assets/${assetId}/components/${selectedComponent.component_id}/certificates/new`)
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
            ? equipment?.equipment_type_name || "Equipment detail"
            : (selectedComponent.scope_category_id &&
                categoryMap.get(selectedComponent.scope_category_id)) ||
              (selectedComponent.category_id && categoryMap.get(selectedComponent.category_id)) ||
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
  );
}

function ComponentDetailBody(props: AssetWorkspaceViewProps) {
  if (props.isSingleEquipment) {
    return <SingleEquipmentDetail {...props} />;
  }

  return <ComponentRecordDetail component={props.selectedComponent!} />;
}

function SingleEquipmentDetail({
  asset,
  equipment,
  selectedComponent,
}: AssetWorkspaceViewProps) {
  return (
    <ColumnLayout columns={3} variant="text-grid">
      <div className="summary-row">
        <Box variant="awsui-key-label">Equipment type</Box>
        <Box>{equipment?.equipment_type_name || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Equipment reference</Box>
        <Box>{equipment?.display_id || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Certificate reference</Box>
        <Box>{selectedComponent?.display_id}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Location</Box>
        <Box>{selectedComponent?.location || asset.location || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Project</Box>
        <Box>{selectedComponent?.assigned_project || asset.assigned_project || "Not set"}</Box>
      </div>
    </ColumnLayout>
  );
}

function ComponentRecordDetail({ component }: { component: ComponentRecord }) {
  return (
    <ColumnLayout columns={3} variant="text-grid">
      <div className="summary-row">
        <Box variant="awsui-key-label">Manufacturer</Box>
        <Box>{component.manufacturer || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Model</Box>
        <Box>{component.model || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Safety critical</Box>
        <Box>{humanizeEnum(component.safety_critical)}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Location</Box>
        <Box>{component.location || "Not set"}</Box>
      </div>
      <div className="summary-row">
        <Box variant="awsui-key-label">Project</Box>
        <Box>{component.assigned_project || "Not set"}</Box>
      </div>
    </ColumnLayout>
  );
}

function NoComponentDetail({ isSingleEquipment }: AssetWorkspaceViewProps) {
  return (
    <Box color="text-body-secondary">
      {isSingleEquipment
        ? "Equipment details are not available yet."
        : "Choose a component to show its certificate records here."}
    </Box>
  );
}

function CertificatesPanel(props: AssetWorkspaceViewProps) {
  return (
    <Container header={<CertificatesHeader {...props} />}>
      {!props.selectedComponent ? (
        <NoCertificateContext isSingleEquipment={props.isSingleEquipment} />
      ) : props.certificatesError ? (
        <Alert type="error">Certificate data could not be loaded for this component.</Alert>
      ) : (
        <Table
          columnDefinitions={props.certificateColumns}
          empty={props.isSingleEquipment ? SINGLE_EQUIPMENT_CERTIFICATE_EMPTY : COMPONENT_CERTIFICATE_EMPTY}
          items={props.certificateItems}
          loading={props.certificatesLoading}
          loadingText="Loading certificates"
          trackBy="certificate_id"
          variant="embedded"
        />
      )}
    </Container>
  );
}

function CertificatesHeader({
  certificateCount,
  isSingleEquipment,
  selectedComponent,
}: AssetWorkspaceViewProps) {
  return (
    <Header
      counter={selectedComponent ? `(${certificateCount})` : undefined}
      description={
        selectedComponent
          ? isSingleEquipment
            ? "Certificate records for this asset, sorted by highest compliance risk first."
            : "Certificate records for the selected component."
          : isSingleEquipment
            ? "The equipment context must load before certificates can be shown."
            : "A component must be selected before certificates can be shown."
      }
      variant="h2"
    >
      {isSingleEquipment ? "Asset certificates" : "Certificates"}
    </Header>
  );
}

function NoCertificateContext({ isSingleEquipment }: { isSingleEquipment: boolean }) {
  return (
    <Box color="text-body-secondary">
      {isSingleEquipment
        ? "Equipment certificates will appear once the equipment context is loaded."
        : "Select a component from the left pane to review its certificates."}
    </Box>
  );
}
