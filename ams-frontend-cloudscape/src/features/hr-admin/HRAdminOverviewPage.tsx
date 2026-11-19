import { Button, Container, ContentLayout, Header, SpaceBetween } from "@cloudscape-design/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { getHRAdminOverview } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { HRAdminSubjectType } from "../../types/ams";
import { ImageAccordion } from "./ImageAccordion";
import { SubjectDirectory } from "./SubjectDirectory";

const SECTION_TITLES: Record<string, string> = {
  persons: "Persons",
  vehicles: "Vehicles",
  companies: "Companies",
  records: "Compliance records",
  "record-types": "Record types",
  "reminder-policy": "Reminder policy",
  "notification-config": "Notification config",
};

export function HRAdminOverviewPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const role = useAuth().getProductRole("HR_ADMIN");
  const isAdmin = role === "ADMIN";
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<HRAdminSubjectType | null>(null);
  const summary = useQuery({
    queryKey: ["hr-admin", "overview"],
    queryFn: getHRAdminOverview,
    enabled: !section,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!summary.data || section) return;
    const delay = summary.dataUpdatedAt + summary.data.refresh_after_ms - Date.now();
    const timer = window.setTimeout(
      () => {
        void queryClient.invalidateQueries({ queryKey: ["hr-admin", "overview"] });
        void queryClient.invalidateQueries({ queryKey: ["hr-admin", "compliance-records"] });
      },
      Math.max(0, delay) + 100
    );
    return () => window.clearTimeout(timer);
  }, [queryClient, section, summary.data, summary.dataUpdatedAt]);

  if (section) {
    return (
      <ContentLayout
        header={
          <Header
            actions={isAdmin ? <Button variant="primary">Create record</Button> : undefined}
            description="This product area is ready for the dedicated HR/Admin workflow pages."
            variant="h1"
          >
            {SECTION_TITLES[section] ?? "HR/Admin"}
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
            title={`${SECTION_TITLES[section] ?? "HR/Admin"} page is next`}
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
        {summary.isError ? (
          <PageError description="Could not load subject totals." onRetry={() => void summary.refetch()} />
        ) : summary.data ? (
          <ImageAccordion groups={summary.data.groups} selected={selected} onSelect={setSelected} />
        ) : (
          <PageLoading>Loading subject totals...</PageLoading>
        )}
        {selected && <SubjectDirectory key={selected} type={selected} canWrite={isAdmin || role === "USER"} />}
      </SpaceBetween>
    </ContentLayout>
  );
}
