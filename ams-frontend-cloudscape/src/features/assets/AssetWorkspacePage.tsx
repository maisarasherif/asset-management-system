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
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
import type { Asset, AssetMaintenanceEvent, Certificate, ComponentRecord, SingleAssetEquipment } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";
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
    const sections: ComponentGroupSection[] = [];

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
    return <PageLoading>{"Loading the asset workspace\u2026"}</PageLoading>;
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
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => navigate("/dashboard")}>Open dashboard</Button>
          <Button onClick={() => navigate(`/assets/${assetId}/routine-maintenance`)}>
            Open maintenance
          </Button>
          <Button disabled={!asset.datasheet} href={asset.datasheet || undefined} target="_blank">
            Open datasheet
          </Button>
          {isAdmin ? <Button onClick={() => navigate(`/assets/${assetId}/edit`)}>Edit asset</Button> : null}
          {isAdmin && !isSingleEquipment ? (
            <Button variant="primary" onClick={() => navigate(`/assets/${assetId}/components/new`)}>
              Add component
            </Button>
          ) : null}
        </SpaceBetween>
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
            : (selectedComponent.category_id && categoryMap.get(selectedComponent.category_id)) ||
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
        <Box variant="awsui-key-label">Certificate bridge</Box>
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
