import {
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
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { listHRAdminRenewalQueue } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { HRAdminRenewalQueueItem, HRAdminRenewalQueueStatus } from "../../types/ams";
import { formatDate, humanizeEnum } from "../../utils/format";

const SECTION_TITLES: Record<string, string> = {
  persons: "Persons",
  vehicles: "Vehicles",
  companies: "Companies",
  records: "Compliance records",
  "record-types": "Record types",
  "reminder-policy": "Reminder policy",
  "notification-config": "Notification config",
};

const EMPTY_RENEWAL_QUEUE: HRAdminRenewalQueueItem[] = [];

function canConfigure(role: string | null) {
  return role === "ADMIN";
}

function sectionTitle(section: string | undefined) {
  if (!section) {
    return "HR/Admin overview";
  }
  return SECTION_TITLES[section] ?? "HR/Admin";
}

function statusIndicator(status: HRAdminRenewalQueueStatus) {
  if (status === "EXPIRED") {
    return <StatusIndicator type="error">Expired</StatusIndicator>;
  }
  if (status === "DUE_NOW") {
    return <StatusIndicator type="warning">Due now</StatusIndicator>;
  }
  if (status === "UPCOMING") {
    return <StatusIndicator type="pending">Upcoming</StatusIndicator>;
  }
  return <StatusIndicator type="success">OK</StatusIndicator>;
}

function expiryCopy(item: HRAdminRenewalQueueItem) {
  if (item.days_until_expiry < 0) {
    const days = Math.abs(item.days_until_expiry);
    return `${days} ${days === 1 ? "day" : "days"} overdue`;
  }
  if (item.days_until_expiry === 0) {
    return "Expires today";
  }
  return `${item.days_until_expiry} ${item.days_until_expiry === 1 ? "day" : "days"} left`;
}

function reminderPolicyCopy(item: HRAdminRenewalQueueItem) {
  const source = item.reminder_policy_source === "RECORD_TYPE" ? "Record type" : "Product default";
  return `${source}: ${item.effective_reminder_days.join(", ")} days`;
}

export function HRAdminOverviewPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const isAdmin = canConfigure(hrRole);
  const isOverview = !section;
  const [selectedItems, setSelectedItems] = useState<HRAdminRenewalQueueItem[]>([]);

  const renewalQueueQuery = useQuery({
    enabled: isOverview,
    queryKey: ["hr-admin", "renewal-queue"],
    queryFn: listHRAdminRenewalQueue,
  });

  const queueItems = renewalQueueQuery.data ?? EMPTY_RENEWAL_QUEUE;
  const workItems = useMemo(
    () => queueItems.filter((item) => item.queue_status !== "OK"),
    [queueItems]
  );
  const selectedItem = selectedItems[0] ?? null;
  const summary = useMemo(
    () => ({
      expired: queueItems.filter((item) => item.queue_status === "EXPIRED").length,
      dueNow: queueItems.filter((item) => item.queue_status === "DUE_NOW").length,
      upcoming: queueItems.filter((item) => item.queue_status === "UPCOMING").length,
      tracked: queueItems.length,
    }),
    [queueItems]
  );

  const columnDefinitions = useMemo<TableProps.ColumnDefinition<HRAdminRenewalQueueItem>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: (item) => (
          <div>
            <strong>{item.subject_name}</strong>
            <br />
            <Box color="text-body-secondary">{humanizeEnum(item.subject_type)}</Box>
          </div>
        ),
      },
      {
        id: "recordType",
        header: "Record type",
        cell: (item) => item.type_name,
      },
      {
        id: "expiry",
        header: "Expiry",
        cell: (item) => (
          <div>
            {formatDate(item.expiry_date as string)}
            <br />
            <Box color="text-body-secondary">{expiryCopy(item)}</Box>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (item) => statusIndicator(item.queue_status),
      },
      {
        id: "policy",
        header: "Policy",
        cell: (item) => reminderPolicyCopy(item),
      },
    ],
    []
  );

  if (!isOverview) {
    return (
      <ContentLayout
        header={
          <Header
            actions={
              isAdmin ? (
                <Button variant="primary">Create record</Button>
              ) : undefined
            }
            description="This product area is ready for the dedicated HR/Admin workflow pages."
            variant="h1"
          >
            {sectionTitle(section)}
          </Header>
        }
      >
        <Container>
          <PageEmpty
            action={
              <Button onClick={() => navigate("/hr-admin")} variant="normal">
                Back to overview
              </Button>
            }
            description="The separate HR/Admin shell is active. This route is reserved for the focused page implementation."
            title={`${sectionTitle(section)} page is next`}
          />
        </Container>
      </ContentLayout>
    );
  }

  if (renewalQueueQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin renewal queue..."}</PageLoading>;
  }

  if (renewalQueueQuery.isError) {
    return (
      <PageError
        description="The HR/Admin renewal queue could not be loaded."
        onRetry={() => {
          void renewalQueueQuery.refetch();
        }}
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          actions={
            isAdmin ? (
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => navigate("/hr-admin/record-types")}>Manage record types</Button>
                <Button onClick={() => navigate("/hr-admin/records")} variant="primary">
                  Create record
                </Button>
              </SpaceBetween>
            ) : (
              <Button onClick={() => navigate("/hr-admin/records")} variant="primary">
                View records
              </Button>
            )
          }
          description="Company responsibility records for persons, vehicles, companies, and renewal evidence."
          variant="h1"
        >
          HR/Admin overview
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container>
          <ColumnLayout columns={4} variant="text-grid">
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Product role
              </Box>
              <div className="hr-admin-signal__value">{hrRole ?? "No access"}</div>
              <StatusIndicator type={hrRole ? "success" : "stopped"}>Access checked</StatusIndicator>
            </div>
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Expired
              </Box>
              <div className="hr-admin-signal__value">{summary.expired}</div>
              <StatusIndicator type={summary.expired > 0 ? "error" : "success"}>Active records</StatusIndicator>
            </div>
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Due now
              </Box>
              <div className="hr-admin-signal__value">{summary.dueNow}</div>
              <StatusIndicator type={summary.dueNow > 0 ? "warning" : "success"}>Policy matches</StatusIndicator>
            </div>
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Upcoming
              </Box>
              <div className="hr-admin-signal__value">{summary.upcoming}</div>
              <Box color="text-body-secondary">{summary.tracked} active renewable tracked</Box>
            </div>
          </ColumnLayout>
        </Container>

        <div className="hr-admin-workspace">
          <Container
            header={
              <Header
                actions={<Button onClick={() => navigate("/hr-admin/records")}>Open records</Button>}
                description="Upcoming renewals from active records."
              >
                Renewal work queue
              </Header>
            }
          >
            <Table
              columnDefinitions={columnDefinitions}
              empty={
                <Box color="text-body-secondary" textAlign="center">
                  No active renewal work is due.
                </Box>
              }
              items={workItems}
              onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
              selectedItems={selectedItems}
              selectionType="single"
              trackBy="record_id"
              variant="embedded"
            />
          </Container>

          <Container
            header={
              <Header description="Select a record to view versions, document status, and renewal actions.">
                Record details
              </Header>
            }
          >
            {selectedItem ? (
              <SpaceBetween size="s">
                <Box>
                  <strong>{selectedItem.type_name}</strong>
                  <br />
                  <Box color="text-body-secondary">
                    {selectedItem.subject_name} / {selectedItem.record_display_id}
                  </Box>
                </Box>
                {statusIndicator(selectedItem.queue_status)}
                <Box color="text-body-secondary">
                  Expires {formatDate(selectedItem.expiry_date as string)}. {reminderPolicyCopy(selectedItem)}.
                </Box>
                <Button onClick={() => navigate("/hr-admin/records")}>Open records</Button>
              </SpaceBetween>
            ) : (
              <SpaceBetween size="s">
                <Box color="text-body-secondary">Select a queue item to view renewal context.</Box>
                <StatusIndicator type="info">No record selected</StatusIndicator>
              </SpaceBetween>
            )}
          </Container>
        </div>
      </SpaceBetween>
    </ContentLayout>
  );
}
