import { Button, Container, ContentLayout, Header, SpaceBetween } from "@cloudscape-design/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { getHRAdminOverview } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import type { HRAdminSubjectType } from "../../types/ams";
import { ComplianceStatusChart } from "./ComplianceStatusChart";
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
  const photoPanels = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!selected || section) return;
    function onBackgroundClick(event: MouseEvent) {
      if (!(event.target instanceof Element) || document.querySelector('[aria-modal="true"]')) return;
      // Keep clicks inside either pane, including the Renew form, and in shell controls.
      if (
        event.target.closest(
          "[data-hr-overview-region], button, a, input, select, textarea, label, [role='button'], [role='dialog']"
        )
      )
        return;
      setSelected(null);
    }
    document.addEventListener("click", onBackgroundClick, true);
    return () => document.removeEventListener("click", onBackgroundClick, true);
  }, [selected, section]);

  function showAllSubjects() {
    photoPanels.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    setSelected(null);
  }

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
      {summary.data ? (
        <SpaceBetween size="l">
          <div ref={photoPanels} data-hr-overview-region>
            <ImageAccordion groups={summary.data.groups} selected={selected} onSelect={setSelected} />
          </div>
          <div className="hr-overview-workspace">
            <div className="hr-overview-panes">
              {selected && (
                <div key={selected} data-hr-overview-region>
                  <SubjectDirectory type={selected} canWrite={isAdmin || role === "USER"} />
                </div>
              )}
              <section key="chart" aria-label="Compliance dashboard" data-hr-overview-region>
                <ComplianceStatusChart
                  groups={summary.data.groups}
                  actions={selected ? <Button onClick={showAllSubjects}>All subjects</Button> : undefined}
                />
              </section>
            </div>
          </div>
        </SpaceBetween>
      ) : summary.isError ? (
        <PageError description="Could not load compliance status." onRetry={() => void summary.refetch()} />
      ) : (
        <PageLoading>Loading compliance status...</PageLoading>
      )}
    </ContentLayout>
  );
}
