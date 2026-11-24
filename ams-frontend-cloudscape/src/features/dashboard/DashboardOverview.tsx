import { Box, Button, ColumnLayout, Container, Header, PieChart, SpaceBetween, StatusIndicator } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listPlans, listQuarantine } from "../../lib/api/maintenance";
import type { AssetCertificateSummary } from "../../lib/api/ams";
import type { Asset } from "../../types/ams";
import type { RoutinePlan } from "../../types/maintenance";
import { Availability, MeterDialog } from "../maintenance/EquipmentMaintenanceSummary";
import { workOrderDue } from "../maintenance/workOrderPresentation";
import { DashboardOperatingHours } from "./DashboardOperatingHours";
import { DashboardWorkOrders } from "./DashboardWorkOrders";

function certificateCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "certificate" : "certificates"}`;
}

function CertificateStatus({ summary }: { summary: AssetCertificateSummary }) {
  const statuses = useMemo(() => [
    { title: "Valid", value: summary.valid, color: "#037f5f", type: "success" },
    { title: "Expiring soon", value: summary.expiring_soon, color: "#b76916", type: "warning" },
    { title: "Expired", value: summary.expired, color: "#ce3f31", type: "error" },
  ] as const, [summary.valid, summary.expiring_soon, summary.expired]);
  const total = summary.valid + summary.expiring_soon + summary.expired;
  return (
    <Container header={<Header variant="h2">Certificate status</Header>}>
      {total === 0 ? (
        <Box color="text-body-secondary" textAlign="center" padding="l">No certificates with a validity status</Box>
      ) : (
        <SpaceBetween size="s">
          <div className="overview-certificate-pie">
            <PieChart
              key={`${summary.valid}:${summary.expiring_soon}:${summary.expired}`}
              ariaLabel="Certificate status"
              data={statuses.filter(({ value }) => value > 0)}
              hideFilter
              hideLegend
              size="small"
              fitHeight
              segmentDescription={({ value }) => certificateCount(value)}
              i18nStrings={{ detailsValue: "Count", detailsPercentage: "Percentage" }}
            />
          </div>
          <ul className="overview-certificate-legend" aria-label="Certificate status legend">
            {statuses.map(({ title, type }) => (
              <li key={title}><StatusIndicator type={type}>{title}</StatusIndicator></li>
            ))}
          </ul>
        </SpaceBetween>
      )}
    </Container>
  );
}

type ServiceThreshold = Pick<RoutinePlan, "plan_id" | "title" | "next_due_hours" | "next_due_date">;

function AssetDetails({ asset, plans, loadingPlans, planError, retryPlans }: {
  asset: Asset;
  plans: ServiceThreshold[];
  loadingPlans: boolean;
  planError: boolean;
  retryPlans: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const quarantine = useQuery({
    queryKey: ["maintenance", "dashboard-asset-quarantine", asset.asset_id],
    queryFn: () => listQuarantine({ asset_id: asset.asset_id, whole_asset_only: "true", limit: 1 }),
    enabled: Boolean(asset.quarantined),
  });
  return (
    <Container header={<Header variant="h2">Asset details</Header>}>
      <ColumnLayout columns={2} minColumnWidth={168} className="overview-asset-details">
        <SpaceBetween size="s">
          <div>
            <Box variant="awsui-key-label">Availability</Box>
            <Availability quarantined={asset.quarantined} status={asset.status} />
            {asset.quarantined && (
              quarantine.isPending ? <Box color="text-body-secondary">Loading quarantine reason</Box> :
              quarantine.isError ? (
                <Button variant="inline-link" onClick={() => void quarantine.refetch()}>Retry loading quarantine reason</Button>
              ) : <Box>{quarantine.data.data[0]?.reason}</Box>
            )}
          </div>
          <div>
            <Box variant="awsui-key-label">Assigned project</Box>
            <Box>{asset.assigned_project || "Unassigned"}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Working hours</Box>
            <Box>{asset.working_hours.toLocaleString()} h</Box>
            {asset.working_hours_note && <Box>{asset.working_hours_note}</Box>}
            <Button variant="inline-link" onClick={() => setEditing(true)}>Update working hours</Button>
          </div>
          <div>
            <Box variant="awsui-key-label">Next service</Box>
            {plans.map((plan) => (
              <Box key={plan.plan_id}>
                {plan.title} due at {workOrderDue({ due_hours: plan.next_due_hours, due_date: plan.next_due_date })}
              </Box>
            ))}
            {loadingPlans && <Box color="text-body-secondary">Loading service plans</Box>}
            {planError && <Button variant="inline-link" onClick={retryPlans}>Retry loading service plans</Button>}
            {!loadingPlans && !planError && plans.length === 0 && <Box color="text-body-secondary">No upcoming service scheduled</Box>}
          </div>
        </SpaceBetween>
        <SpaceBetween size="s">
          {asset.photo && asset.photo !== failedPhoto && (
            <img
              className="overview-asset-photo"
              src={asset.photo}
              alt={`Photo of ${asset.name}`}
              loading="lazy"
              onError={() => setFailedPhoto(asset.photo)}
            />
          )}
          {asset.datasheet && <Button href={asset.datasheet} target="_blank">Open datasheet</Button>}
          {asset.description && (
            <div>
              <Box variant="awsui-key-label">Description</Box>
              <Box>{asset.description}</Box>
            </div>
          )}
        </SpaceBetween>
      </ColumnLayout>
      {editing && <MeterDialog asset={asset} close={() => setEditing(false)} />}
    </Container>
  );
}

export function DashboardOverview({ asset, summary }: { asset: Asset; summary: AssetCertificateSummary }) {
  const query = { asset_id: asset.asset_id, active_only: "true", limit: 1 };
  const hours = useQuery({
    queryKey: ["maintenance", "dashboard-next-service", asset.asset_id, "hours"],
    queryFn: () => listPlans({ ...query, order_by: "next_due_hours" }),
  });
  const dates = useQuery({
    queryKey: ["maintenance", "dashboard-next-service", asset.asset_id, "date"],
    queryFn: () => listPlans({ ...query, order_by: "next_due_date" }),
  });
  const nextHours = hours.data?.data[0];
  const nextDate = dates.data?.data[0];
  const plans: ServiceThreshold[] = [];
  if (nextHours?.next_due_hours != null) {
    plans.push({ ...nextHours, next_due_date: nextDate?.plan_id === nextHours.plan_id ? nextDate.next_due_date : null });
  }
  if (nextDate?.next_due_date && nextDate.plan_id !== plans[0]?.plan_id) {
    plans.push({ ...nextDate, next_due_hours: null });
  }

  return (
    <div className="ams-overview-grid">
      <CertificateStatus summary={summary} />
      <DashboardWorkOrders assetId={asset.asset_id} />
      <DashboardOperatingHours hours={asset.working_hours} nextService={nextHours} planStatus={hours.status} retry={() => void hours.refetch()} />
      <AssetDetails
        asset={asset}
        plans={plans}
        loadingPlans={hours.isPending || dates.isPending}
        planError={hours.isError || dates.isError}
        retryPlans={() => {
          if (hours.isError) void hours.refetch();
          if (dates.isError) void dates.refetch();
        }}
      />
    </div>
  );
}
