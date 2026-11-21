
import { Button, Checkbox, ColumnLayout, ContentLayout, DatePicker, FormField, Header, Input, SpaceBetween, StatusIndicator } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useListControls } from "../../components/shared/useListControls";
import { RouterLink } from "../../components/shared/RouterLink";
import { listPlans, maintenanceWrite } from "../../lib/api/maintenance";
import { useAuth } from "../../providers/auth-context";
import type { RoutinePlan } from "../../types/maintenance";
import { formatDate } from "../../utils/format";
import { AssetPicker, ComponentPicker, Dialog, Register } from "./shared";
import { wholeUnits } from "./validation";

export function RoutinePlansPage() {
  const { isAdmin } = useAuth();
  const controls = useListControls("", ["asset_id"]);
  const plans = useQuery({ queryKey: ["maintenance", "plans", controls.query], queryFn: () => listPlans(controls.query) });
  const [edit, setEdit] = useState<RoutinePlan | "new" | null>(null);
  const [scan, setScan] = useState(false);

  return <ContentLayout header={<Header variant="h1" actions={isAdmin && <SpaceBetween size="xs" direction="horizontal">
    <Button onClick={() => setScan(true)}>Check due plans</Button>
    <Button variant="primary" onClick={() => setEdit("new")}>Add routine plan</Button>
  </SpaceBetween>}>Routine maintenance plans</Header>}>
    <Register query={plans} controls={controls} empty="No routine plans found" trackBy="plan_id"
      filters={<AssetPicker assetId={controls.filters.asset_id} allLabel="All equipment" onChange={(asset_id) => controls.setFilters({ asset_id })} />}
      columns={[
        { id: "name", header: "Plan", cell: (row) => isAdmin ? <Button variant="inline-link" onClick={() => setEdit(row)}>{row.title}</Button> : row.title },
        { id: "equipment", header: "Equipment", cell: (row) => row.component_name ? `${row.asset_name} / ${row.component_name}` : row.asset_name },
        { id: "interval", header: "Interval", cell: (row) => [row.interval_hours == null ? "" : `${row.interval_hours.toLocaleString()} h`, row.interval_months == null ? "" : `${row.interval_months} months`].filter(Boolean).join(" or ") },
        { id: "due", header: "Next due", cell: (row) => [row.next_due_hours == null ? "" : `${row.next_due_hours.toLocaleString()} h`, row.next_due_date ? formatDate(row.next_due_date) : ""].filter(Boolean).join(" or ") },
        { id: "tag", header: "Red tag when due", cell: (row) => row.quarantine_when_due ? "Yes" : "No" },
        { id: "active", header: "Status", cell: (row) => <StatusIndicator type={row.active ? "success" : "stopped"}>{row.active ? "Active" : "Paused"}</StatusIndicator> },
        { id: "history", header: "History", cell: (row) => <RouterLink to={`/maintenance?asset_id=${row.asset_id}&type=ROUTINE`}>View work orders</RouterLink> },
      ]} />
    {edit && <PlanDialog plan={edit === "new" ? undefined : edit} initialAsset={controls.filters.asset_id} close={() => setEdit(null)} />}
    {scan && <Dialog title="Check due routine plans" save="Check plans" close={() => setScan(false)}
      submit={() => maintenanceWrite("scan")}>Create work orders for any active plans that are due.</Dialog>}
  </ContentLayout>;
}

function PlanDialog({ plan, initialAsset, close }: { plan?: RoutinePlan; initialAsset: string; close: () => void }) {
  const [assetId, setAssetId] = useState(plan?.asset_id ?? initialAsset);
  const [componentId, setComponentId] = useState<string | null>(plan?.component_id ?? null);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [hours, setHours] = useState(String(plan?.interval_hours ?? ""));
  const [months, setMonths] = useState(String(plan?.interval_months ?? ""));
  const [nextHours, setNextHours] = useState(String(plan?.next_due_hours ?? ""));
  const [nextDate, setNextDate] = useState(plan?.next_due_date ?? "");
  const [quarantine, setQuarantine] = useState(plan?.quarantine_when_due ?? false);
  const [active, setActive] = useState(plan?.active ?? true);
  const valid = Boolean(assetId && title.trim() && (hours || months)) &&
    (!hours || wholeUnits(hours, 1) && (!nextHours || wholeUnits(nextHours))) &&
    (!months || wholeUnits(months, 1) && Number(months) <= 1200);

  return <Dialog title={plan ? "Edit routine plan" : "Add routine plan"} close={close} disabled={!valid}
    submit={() => maintenanceWrite(plan ? `plans/${plan.plan_id}` : "plans", {
      asset_id: assetId, component_id: componentId, title, active, quarantine_when_due: quarantine,
      interval_hours: hours ? Number(hours) : null, interval_months: months ? Number(months) : null,
      next_due_hours: hours && nextHours ? Number(nextHours) : null, next_due_date: months ? nextDate : "",
    }, plan ? "PUT" : "POST")}>
    {plan ? <FormField label="Equipment">{[plan.asset_name, plan.component_name].filter(Boolean).join(" / ")}</FormField> : <>
      <AssetPicker assetId={assetId} onChange={(id) => { setAssetId(id); setComponentId(null); }} />
      <ComponentPicker key={assetId} assetId={assetId} onChange={setComponentId} />
    </>}
    <FormField label="Plan name"><Input ariaLabel="Plan name" value={title} onChange={({ detail }) => setTitle(detail.value)} /></FormField>
    <ColumnLayout columns={2}>
      <FormField label="Interval in hours"><Input ariaLabel="Interval in hours" inputMode="numeric" value={hours} onChange={({ detail }) => setHours(detail.value)} /></FormField>
      <FormField label="Interval in months"><Input ariaLabel="Interval in months" inputMode="numeric" value={months} onChange={({ detail }) => setMonths(detail.value)} /></FormField>
      <FormField label="Next due reading" description="Leave blank to use current hours plus the interval">
        <Input ariaLabel="Next due reading" inputMode="numeric" value={nextHours} disabled={!hours} onChange={({ detail }) => setNextHours(detail.value)} />
      </FormField>
      <FormField label="Next due date" description="Leave blank to use today plus the interval">
        <DatePicker ariaLabel="Next due date" value={nextDate} disabled={!months} onChange={({ detail }) => setNextDate(detail.value)} />
      </FormField>
    </ColumnLayout>
    <Checkbox checked={quarantine} onChange={({ detail }) => setQuarantine(detail.checked)}>Red-tag equipment when due</Checkbox>
    <Checkbox checked={active} onChange={({ detail }) => setActive(detail.checked)}>Active plan</Checkbox>
  </Dialog>;
}
