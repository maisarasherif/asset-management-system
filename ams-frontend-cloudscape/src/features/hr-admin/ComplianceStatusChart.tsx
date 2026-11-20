import { Box, Container, ExpandableSection, Header, SpaceBetween, Table } from "@cloudscape-design/components";
import BarChart, { type BarChartProps } from "@cloudscape-design/components/bar-chart";
import type { ReactNode } from "react";
import type { HRAdminOverviewGroup, HRAdminSubjectType } from "../../types/ams";
import { subjectGroups } from "./hrAdminRegistry";

const statuses = [
  { key: "valid_count", label: "Valid", color: "#1d8102", minWidth: 68 },
  { key: "expiring_soon_count", label: "Expiring soon", color: "#b77900", minWidth: 92 },
  { key: "expired_count", label: "Expired", color: "#d91515", minWidth: 84 },
] as const;

const groupOrder: HRAdminSubjectType[] = ["PERSON", "VEHICLE", "COMPANY"];
const groupLabels = groupOrder.map((type) => subjectGroups[type]);
const number = new Intl.NumberFormat();

export function ComplianceStatusChart({
  groups,
  actions,
}: {
  groups: HRAdminOverviewGroup[];
  actions?: ReactNode;
}) {
  const orderedGroups = groupOrder.flatMap((type) => groups.filter((group) => group.subject_type === type));
  const series: BarChartProps<string>["series"] = statuses.map(({ key, label, color }) => ({
    title: label,
    type: "bar",
    color,
    data: orderedGroups.map((group) => ({ x: subjectGroups[group.subject_type], y: group[key] })),
    valueFormatter: (value) => number.format(value),
  }));
  const hasRecords = orderedGroups.some((group) => statuses.some(({ key }) => group[key] > 0));

  return (
    <Container
      header={
        <Header variant="h2" actions={actions} description="Today’s tracked records across all subject groups">
          Compliance status
        </Header>
      }
    >
      <SpaceBetween size="s">
        <BarChart
          ariaLabel="Compliance status by subject group"
          i18nStrings={{
            xTickFormatter: (value) => value,
            yTickFormatter: (value) => (Number.isInteger(value) ? number.format(value) : ""),
          }}
          xTitle="Subject group"
          xScaleType="categorical"
          xDomain={groupLabels}
          yTitle="Records"
          yDomain={hasRecords ? undefined : [0, 1]}
          series={series}
          stackedBars
          hideFilter
          height={240}
        />
        <Box color="text-body-secondary" fontSize="body-s">
          Expiring soon includes today and the next 30 days, using the UAE calendar date.
          {!hasRecords && " There are no tracked records."}
        </Box>
        <ExpandableSection headerText="View record counts" variant="footer">
          <Table
            ariaLabels={{ tableLabel: "Compliance counts by subject group" }}
            contentDensity="compact"
            variant="embedded"
            trackBy="subject_type"
            wrapLines
            items={orderedGroups}
            columnDefinitions={[
              {
                id: "group",
                header: "Subject group",
                minWidth: 110,
                isRowHeader: true,
                cell: (group) => subjectGroups[group.subject_type],
              },
              ...statuses.map(({ key, label, minWidth }) => ({
                id: key,
                header: label,
                minWidth,
                cell: (group: HRAdminOverviewGroup) => number.format(group[key]),
              })),
            ]}
          />
        </ExpandableSection>
      </SpaceBetween>
    </Container>
  );
}
