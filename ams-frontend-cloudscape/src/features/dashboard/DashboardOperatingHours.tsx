import { BarChart, Box, Button, Container, Header, SpaceBetween, type BarChartProps } from "@cloudscape-design/components";
import type { RoutinePlan } from "../../types/maintenance";

const meterCategory = "Meter reading";

function formatHours(value: number) {
  return `${value.toLocaleString()} h`;
}

export function DashboardOperatingHours({ hours, nextService, planStatus, retry }: {
  hours: number;
  nextService: RoutinePlan | undefined;
  planStatus: "pending" | "error" | "success";
  retry: () => void;
}) {
  const dueHours = nextService?.next_due_hours;
  const series: Array<BarChartProps<string>["series"][number]> = [
    { type: "bar", title: "Current reading", color: "#ce3f31", data: [{ x: meterCategory, y: hours }], valueFormatter: formatHours },
  ];

  if (dueHours != null) {
    const nextServiceSeries = { title: "Next service", color: "#0972d3" };
    if (hours < dueHours) {
      // The stack reaches the service threshold. The popup reports the absolute threshold.
      series.push({
        ...nextServiceSeries,
        type: "bar",
        data: [{ x: meterCategory, y: dueHours - hours }],
        valueFormatter: () => formatHours(dueHours),
      });
    } else {
      series.push({ ...nextServiceSeries, type: "threshold", y: dueHours, valueFormatter: formatHours });
    }
  }

  return (
    <Container header={<Header variant="h2">Operating hours</Header>}>
      <SpaceBetween size="s">
        <BarChart
          className="overview-operating-hours-chart"
          ariaLabel="Operating hours"
          ariaDescription="Current meter reading compared with the next hour-based service threshold."
          series={series}
          stackedBars
          xScaleType="categorical"
          xDomain={[meterCategory]}
          yDomain={[0, Math.max(hours, dueHours ?? 0, 1)]}
          yTitle="Hours"
          yTickFormatter={(value) => value.toLocaleString()}
          height={220}
          hideFilter
          i18nStrings={{ legendAriaLabel: "Operating hours legend" }}
          detailPopoverFooter={nextService && dueHours != null ? () => (
            <Box color="text-body-secondary">
              {nextService.title}{" · "}{hours < dueHours ? `${formatHours(dueHours - hours)} remaining` : "Threshold reached"}
            </Box>
          ) : undefined}
        />
        {planStatus === "pending" && <Box color="text-body-secondary">Loading hour-based service threshold</Box>}
        {planStatus === "error" && <Button variant="inline-link" onClick={retry}>Retry loading hour-based service threshold</Button>}
        {planStatus === "success" && dueHours == null && <Box color="text-body-secondary">No hour-based service threshold</Box>}
      </SpaceBetween>
    </Container>
  );
}
