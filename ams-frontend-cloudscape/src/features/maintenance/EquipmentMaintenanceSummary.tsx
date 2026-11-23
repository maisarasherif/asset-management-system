
import { Box, Button, FormField, Input, SpaceBetween, StatusIndicator, Textarea } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RouterLink } from "../../components/shared/RouterLink";
import { updateAssetWorkingHours } from "../../lib/api/ams";
import { listPlans } from "../../lib/api/maintenance";
import type { Asset } from "../../types/ams";
import { formatDate } from "../../utils/format";
import { Dialog } from "./shared";
import { wholeUnits } from "./validation";

export function Availability({ quarantined, status = "ACTIVE" }: { quarantined?: boolean; status?: Asset["status"] }) {
  const unavailable = quarantined;
  return <StatusIndicator type={unavailable ? "error" : status === "INACTIVE" ? "stopped" : "success"}>
    {unavailable ? "Red tag · Quarantined" : status === "INACTIVE" ? "Inactive" : "Green tag · Available"}
  </StatusIndicator>;
}

export function EquipmentMaintenanceSummary({ asset }: { asset: Asset }) {
  const [editing, setEditing] = useState(false);
  const filter = `asset_id=${asset.asset_id}`;
  const plans = useQuery({ queryKey: ["maintenance", "equipment-summary", asset.asset_id],
    queryFn: () => listPlans({ asset_id: asset.asset_id, active_only: "true", limit: 3 }) });
  return <SpaceBetween size="xs">
    <Box>{asset.working_hours.toLocaleString()} working hours</Box>
    <Button variant="inline-link" onClick={() => setEditing(true)}>Update working hours</Button>
    {plans.isLoading && <Box color="text-body-secondary">Loading service plans</Box>}
    {plans.isError && <Button variant="inline-link" onClick={() => void plans.refetch()}>Retry loading service plans</Button>}
    {plans.data?.data.map((plan) => <Box key={plan.plan_id}>
      {plan.title} due at {[plan.next_due_hours == null ? "" : `${plan.next_due_hours.toLocaleString()} h`,
        plan.next_due_date ? formatDate(plan.next_due_date) : ""].filter(Boolean).join(" or ")}
    </Box>)}
    <RouterLink to={`/maintenance/plans?${filter}`}>View routine plans</RouterLink>
    <RouterLink to={`/work-orders?${filter}`}>View work orders</RouterLink>
    {editing && <MeterDialog asset={asset} close={() => setEditing(false)} />}
  </SpaceBetween>;
}

function MeterDialog({ asset, close }: { asset: Asset; close: () => void }) {
  const [hours, setHours] = useState(String(asset.working_hours));
  const [note, setNote] = useState(asset.working_hours_note);
  return <Dialog title="Update working hours" close={close} disabled={!wholeUnits(hours, asset.working_hours)}
    submit={() => updateAssetWorkingHours(asset.asset_id, { working_hours: Number(hours), note })}>
    <FormField label="Working hours"><Input ariaLabel="Working hours" inputMode="numeric" value={hours} onChange={({ detail }) => setHours(detail.value)} /></FormField>
    <FormField label="Meter note"><Textarea ariaLabel="Meter note" value={note} onChange={({ detail }) => setNote(detail.value)} /></FormField>
  </Dialog>;
}
