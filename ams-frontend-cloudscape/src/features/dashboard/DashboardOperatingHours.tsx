import { Box, Button, Container, Header, SpaceBetween } from "@cloudscape-design/components";
import { useEffect, useId, useState } from "react";
import type { RoutinePlan } from "../../types/maintenance";

export function DashboardOperatingHours({ hours, nextService, planStatus, retry }: {
  hours: number;
  nextService: RoutinePlan | undefined;
  planStatus: "pending" | "error" | "success";
  retry: () => void;
}) {
  const tooltipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const dueHours = nextService?.next_due_hours;
  const chartMax = Math.max(hours, dueHours ?? 0, 1);
  const series = [{ kind: "reading", label: "Current reading", value: hours }];
  if (dueHours != null) series.push({ kind: "threshold", label: "Next service", value: dueHours });

  useEffect(() => {
    const dismissTooltip = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", dismissTooltip);
    return () => document.removeEventListener("keydown", dismissTooltip);
  }, []);

  return (
    <Container header={<Header variant="h2">Operating hours</Header>}>
      <div className="overview-operating-hours">
        <SpaceBetween size="s">
          <div className="overview-hours-chart">
            <div className="overview-hours-chart__scale" aria-hidden="true">
              <span>{chartMax.toLocaleString()} h</span>
              <span>0 h</span>
            </div>
            <div
              className="overview-hours-chart__plot"
              data-dismissed={dismissed || undefined}
              onPointerEnter={() => setDismissed(false)}
            >
              <button
                type="button"
                className="overview-hours-chart__trigger"
                aria-label="Operating hours details"
                aria-describedby={tooltipId}
                onFocus={() => setDismissed(false)}
                onClick={(event) => {
                  event.currentTarget.focus();
                  setDismissed(false);
                }}
              >
                {dueHours != null && (
                  <span className="overview-hours-chart__threshold" style={{ height: `${dueHours / chartMax * 100}%` }} />
                )}
                <span className="overview-hours-chart__reading" style={{ height: `${hours / chartMax * 100}%` }} />
              </button>
              <div className="overview-hours-tooltip" id={tooltipId} role="tooltip">
                <dl>
                  {series.map(({ kind, label, value }) => (
                    <div key={kind}>
                      <dt className="overview-hours-series-label" data-series={kind}>{label}</dt>
                      <dd>{value.toLocaleString()} h</dd>
                    </div>
                  ))}
                </dl>
                {nextService && dueHours != null && (
                  <Box className="overview-hours-tooltip__service" color="text-body-secondary">
                    {nextService.title}
                    {" · "}{hours < dueHours ? `${(dueHours - hours).toLocaleString()} h remaining` : "Threshold reached"}
                  </Box>
                )}
              </div>
            </div>
          </div>
          <ul className="overview-hours-values" aria-label="Operating hours legend">
            {series.map(({ kind, label }) => (
              <li className="overview-hours-series-label" data-series={kind} key={kind}>{label}</li>
            ))}
          </ul>
          {planStatus === "pending" && <Box color="text-body-secondary">Loading hour-based service threshold</Box>}
          {planStatus === "error" && <Button variant="inline-link" onClick={retry}>Retry loading hour-based service threshold</Button>}
          {planStatus === "success" && dueHours == null && <Box color="text-body-secondary">No hour-based service threshold</Box>}
        </SpaceBetween>
      </div>
    </Container>
  );
}
