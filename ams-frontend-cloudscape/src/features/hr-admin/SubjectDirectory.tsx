import { activeArchived } from "../../components/shared/listFacetOptions";
import { ListFilters, ListPagination } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";
import { recordFacets } from "./hrAdminFacets";
import type { ListQuery } from "../../lib/api/list-query";
import {
  Badge,
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  StatusIndicator,
  Table,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageError } from "../../components/shared/PageStates";
import {
  listComplianceRecords,
  listHRAdminCompanies,
  listHRAdminPersons,
  listHRAdminVehicles,
} from "../../lib/api/ams";
import type { ComplianceRecord, HRAdminSubjectStatus, HRAdminSubjectType } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";
import { formatDocumentDate } from "./hrAdminDates";
import { RecordEditorModal } from "./RecordEditorModal";
import { expiryLabels, subjectGroups, renewalDraft, type RecordEditor } from "./hrAdminRegistry";

interface Subject {
  id: string;
  name: string;
  description: string;
  status: HRAdminSubjectStatus;
}

const pageSize = 10;
async function loadDirectory(type: HRAdminSubjectType, page: number, filters: ListQuery) {
  if (type === "PERSON") {
    const { data, meta } = await listHRAdminPersons(page, pageSize, filters);
    return {
      meta,
      items: data.map((p) => ({
        id: p.person_id,
        name: p.full_name,
        description: p.department || p.person_code,
        status: p.status,
      })),
    };
  }
  if (type === "VEHICLE") {
    const { data, meta } = await listHRAdminVehicles(page, pageSize, filters);
    return {
      meta,
      items: data.map((v) => ({
        id: v.vehicle_id,
        name: v.plate_number,
        description: [v.make, v.model].filter(Boolean).join(" "),
        status: v.status,
      })),
    };
  }
  const { data, meta } = await listHRAdminCompanies(page, pageSize, filters);
  return {
    meta,
    items: data.map((c) => ({
      id: c.company_id,
      name: c.company_name,
      description: c.company_code || c.location,
      status: c.status,
    })),
  };
}

const indicators = {
  ARCHIVED: "stopped",
  EXPIRED: "error",
  DUE_NOW: "warning",
  UPCOMING: "pending",
  OK: "success",
  NO_EXPIRY: "success",
  MISSING_EXPIRY: "warning",
  UNTRACKED: "stopped",
} as const;

function SubjectRecords({
  subject,
  type,
  canWrite,
}: {
  subject: Subject;
  type: HRAdminSubjectType;
  canWrite: boolean;
}) {
  const controls = useListControls(`subject-records.${subject.id}`, ["status", "expiry_status"], pageSize);
  const [editor, setEditor] = useState<RecordEditor>(null);
  const records = useQuery({
    queryKey: ["hr-admin", "compliance-records", type, subject.id, controls.query],
    queryFn: () => listComplianceRecords(controls.page, pageSize, { type, id: subject.id }, controls.query),
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  });
  const showActions = canWrite && subject.status === "ACTIVE";
  return (
    <Container
      header={
        <Header variant="h2" description={subject.description}>
          {subject.name}
        </Header>
      }
    >
      {records.isError ? (
        <PageError description="Could not load this subject’s records." onRetry={() => void records.refetch()} />
      ) : (
        <Table<ComplianceRecord>
          variant="embedded"
          trackBy="record_id"
          wrapLines
          header={
            <Header variant="h3" counter={records.data ? `(${records.data.meta.total})` : undefined}>
              Compliance records
            </Header>
          }
          items={records.data?.data ?? []}
          loading={records.isLoading}
          loadingText="Loading compliance records"
          empty="This subject has no compliance records."
          filter={<ListFilters controls={controls} label="Search subject records" facets={recordFacets.slice(1)} />}
          pagination={<ListPagination controls={controls} meta={records.data?.meta} />}
          columnDefinitions={[
            { id: "type", header: "Record type", cell: (r) => r.type_name },
            {
              id: "status",
              header: "Status",
              cell: (r) => (
                <StatusIndicator
                  type={indicators[r.expiry_status]}
                  colorOverride={r.expiry_status === "UPCOMING" ? "blue" : undefined}
                >
                  {expiryLabels[r.expiry_status]}
                </StatusIndicator>
              ),
            },
            { id: "expiry", header: "Expiry", cell: (r) => formatDocumentDate(r.expiry_date) },
            ...(showActions
              ? [
                  {
                    id: "actions",
                    header: "Actions",
                    cell: (r: ComplianceRecord) =>
                      r.status === "ACTIVE" &&
                      r.subject_status === "ACTIVE" &&
                      r.renewal_behavior === "RENEWABLE" ? (
                        <Button onClick={() => setEditor(renewalDraft(r))}>Renew</Button>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      )}
      {editor && (
        <RecordEditorModal editor={editor} onDismiss={() => setEditor(null)} onSaved={() => setEditor(null)} />
      )}
    </Container>
  );
}

const searchLabels = { PERSON: "Find a person", VEHICLE: "Find a plate or vehicle", COMPANY: "Find a company" };

export function SubjectDirectory({ type, canWrite }: { type: HRAdminSubjectType; canWrite: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useListControls(type.toLowerCase(), ["status"], pageSize);
  const controls = {
    ...list,
    onSearch: (value: string) => {
      setSelectedId(null);
      list.onSearch(value);
    },
    setFilters: (filters: Record<string, string>) => {
      setSelectedId(null);
      list.setFilters(filters);
    },
    setPage: (page: number, replace = false) => {
      setSelectedId(null);
      list.setPage(page, replace);
    },
    clear: () => {
      setSelectedId(null);
      list.clear();
    },
  };
  const directory = useQuery({
    queryKey: ["hr-admin", subjectGroups[type].toLowerCase(), "directory", controls.query],
    queryFn: () => loadDirectory(type, controls.page, controls.query),
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  });
  const items = directory.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId);
  return (
    <SpaceBetween size="m">
      <Container
        header={
          <Header variant="h2" counter={directory.data ? `(${directory.data.meta.total})` : undefined}>
            {subjectGroups[type]}
          </Header>
        }
      >
        <SpaceBetween size="s">
          <ListFilters controls={controls} label={searchLabels[type]} facets={[{ key: "status", label: "Subject status", options: activeArchived }]} />
          {directory.isError ? (
            <PageError description="Could not load the directory." onRetry={() => void directory.refetch()} />
          ) : (
            <Table<Subject>
              variant="embedded"
              selectionType="single"
              trackBy="id"
              wrapLines
              ariaLabels={{ selectionGroupLabel: subjectGroups[type], itemSelectionLabel: (_, item) => item.name }}
              onRowClick={({ detail }) => setSelectedId(detail.item.id)}
              selectedItems={selected ? [selected] : []}
              onSelectionChange={({ detail }) => setSelectedId(detail.selectedItems[0]?.id ?? null)}
              items={items}
              loading={directory.isLoading}
              loadingText="Loading subjects"
              empty={controls.hasCriteria ? "No matching subjects." : "No subjects in this group."}
              pagination={<ListPagination controls={controls} meta={directory.data?.meta} />}
              columnDefinitions={[
                {
                  id: "subject",
                  header: humanizeEnum(type),
                  cell: (item) => (
                    <div>
                      <strong>{item.name}</strong>{" "}
                      {item.status === "ARCHIVED" && <Badge color="grey">Archived</Badge>}
                      <Box color="text-body-secondary">{item.description}</Box>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </SpaceBetween>
      </Container>
      {selected ? (
        <SubjectRecords key={selected.id} subject={selected} type={type} canWrite={canWrite} />
      ) : (
        <Container header={<Header variant="h2">Compliance records</Header>}>
          <Box color="text-body-secondary">Select a subject to view its records.</Box>
        </Container>
      )}
    </SpaceBetween>
  );
}
