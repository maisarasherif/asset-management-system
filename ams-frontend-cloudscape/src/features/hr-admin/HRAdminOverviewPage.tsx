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
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty } from "../../components/shared/PageStates";
import { useAuth } from "../../providers/auth-context";

type RenewalQueueItem = {
  subject: string;
  recordType: string;
  expiry: string;
  status: string;
};

const SECTION_TITLES: Record<string, string> = {
  persons: "Persons",
  vehicles: "Vehicles",
  companies: "Companies",
  records: "Compliance records",
  "record-types": "Record types",
  "reminder-policy": "Reminder policy",
  "notification-config": "Notification config",
};

function canConfigure(role: string | null) {
  return role === "ADMIN";
}

function sectionTitle(section: string | undefined) {
  if (!section) {
    return "HR/Admin overview";
  }
  return SECTION_TITLES[section] ?? "HR/Admin";
}

export function HRAdminOverviewPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const isAdmin = canConfigure(hrRole);
  const isOverview = !section;

  const columnDefinitions = useMemo<TableProps.ColumnDefinition<RenewalQueueItem>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: (item) => item.subject,
      },
      {
        id: "recordType",
        header: "Record type",
        cell: (item) => item.recordType,
      },
      {
        id: "expiry",
        header: "Expiry",
        cell: (item) => item.expiry,
      },
      {
        id: "status",
        header: "Status",
        cell: (item) => item.status,
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
              <div className="hr-admin-signal__value">Pending</div>
              <Box color="text-body-secondary">Overview metrics are not available yet</Box>
            </div>
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Expiring soon
              </Box>
              <div className="hr-admin-signal__value">Pending</div>
              <Box color="text-body-secondary">Reminder policy will drive this queue</Box>
            </div>
            <div className="hr-admin-signal">
              <Box color="text-label" fontSize="body-s" fontWeight="bold">
                Archived
              </Box>
              <div className="hr-admin-signal__value">Hidden</div>
              <Box color="text-body-secondary">Archived subjects stay out of renewal work</Box>
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
                  No renewal records are ready to show here yet.
                </Box>
              }
              items={[]}
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
            <SpaceBetween size="s">
              <Box color="text-body-secondary">
                Record details will appear here after a queue item is selected.
              </Box>
              <StatusIndicator type="info">No record selected</StatusIndicator>
            </SpaceBetween>
          </Container>
        </div>
      </SpaceBetween>
    </ContentLayout>
  );
}
