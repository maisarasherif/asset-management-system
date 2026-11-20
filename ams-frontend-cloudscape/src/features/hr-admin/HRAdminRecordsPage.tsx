import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonDropdown,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  Table,
  Textarea,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  archiveComplianceRecord,
  getComplianceRecordDownloadUrl,
  listComplianceRecords,
  listComplianceRecordTypes,
  listHRAdminCompanies,
  listHRAdminPersons,
  listHRAdminVehicles,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { ComplianceRecord } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

import { formatDocumentDate } from "./hrAdminDates";
import { PermanentDeleteModal, type PermanentDeleteTarget } from "./PermanentDeleteModal";
import { RecordEditorModal } from "./RecordEditorModal";
import { expiryLabels, pgTextValue, renewalDraft, type RecordEditor } from "./hrAdminRegistry";

type ArchiveTarget =
  | {
      id: string;
      label: string;
      reason: string;
    }
  | null;

function expirySignal(record: ComplianceRecord) {
  return expiryLabels[record.expiry_status];
}

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function pgIntValue(value: ComplianceRecord["version_number"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function statusBadge(status: ComplianceRecord["status"]) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function subjectLabel(record: ComplianceRecord) {
  return `${humanizeEnum(record.subject_type)} - ${record.subject_name || record.subject_id}`;
}

function ArchiveRecordModal({
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  target,
}: {
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (target: NonNullable<ArchiveTarget>) => void;
  target: ArchiveTarget;
}) {
  const [draft, setDraft] = useState<ArchiveTarget>(target);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  return (
    <Modal
      visible={Boolean(target)}
      header={`Archive ${draft?.label || "record"}?`}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Keep record</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            Archive record
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <Alert type="warning">
          Archived compliance records stay visible for history, but HR/Admin renewal reminders will ignore them.
        </Alert>
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Archive reason" constraintText="Required">
          <Textarea
            value={draft?.reason || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, reason: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function HRAdminRecordsPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const canWrite = hrRole === "ADMIN" || hrRole === "USER";
  const canArchive = hrRole === "ADMIN";
  const [filterText, setFilterText] = useState("");
  const [compactTable, setCompactTable] = useState(() => isCompactViewport());
  const [editor, setEditor] = useState<RecordEditor>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermanentDeleteTarget | null>(null);
  const [modalError, setModalError] = useState("");

  const recordsQuery = useQuery({
    queryKey: ["hr-admin", "compliance-records"],
    queryFn: () => listComplianceRecords(1, 100),
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  });
  const recordTypesQuery = useQuery({
    queryKey: ["hr-admin", "compliance-record-types"],
    queryFn: () => listComplianceRecordTypes(1, 100),
  });
  const peopleQuery = useQuery({
    queryKey: ["hr-admin", "persons"],
    queryFn: () => listHRAdminPersons(1, 100),
  });
  const vehiclesQuery = useQuery({
    queryKey: ["hr-admin", "vehicles"],
    queryFn: () => listHRAdminVehicles(1, 100),
  });
  const companiesQuery = useQuery({
    queryKey: ["hr-admin", "companies"],
    queryFn: () => listHRAdminCompanies(1, 100),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const syncTableMode = () => setCompactTable(mediaQuery.matches);
    syncTableMode();
    mediaQuery.addEventListener("change", syncTableMode);
    return () => mediaQuery.removeEventListener("change", syncTableMode);
  }, []);

  const archiveRecordMutation = useMutation({
    mutationFn: (target: NonNullable<ArchiveTarget>) =>
      archiveComplianceRecord(target.id, target.reason.trim()),
    onSuccess: () => {
      setArchiveTarget(null);
      setModalError("");
      success("Compliance record archived", "Renewal reminders will ignore this record.");
      void queryClient.invalidateQueries({ queryKey: ["hr-admin"] });
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (recordId: string) => getComplianceRecordDownloadUrl(recordId),
    onSuccess: (response) => {
      window.open(response.url, "_blank", "noopener,noreferrer");
    },
    onError: (mutationError: Error) => {
      error("Download failed", mutationError.message);
    },
  });

  const records = useMemo(() => recordsQuery.data?.data ?? [], [recordsQuery.data?.data]);
  const recordTypes = useMemo(() => recordTypesQuery.data?.data ?? [], [recordTypesQuery.data?.data]);
  const people = useMemo(() => peopleQuery.data?.data ?? [], [peopleQuery.data?.data]);
  const vehicles = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data?.data]);
  const companies = useMemo(() => companiesQuery.data?.data ?? [], [companiesQuery.data?.data]);

  const filteredRecords = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return records;
    }
    return records.filter((record) =>
      [
        record.display_id,
        record.subject_type,
        record.subject_name,
        record.type_name,
        record.record_type_display_id,
        record.renewal_behavior,
        record.status,
        pgTextValue(record.document_file),
        pgTextValue(record.issuing_authority),
        expirySignal(record),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [filterText, records]);

  const columns = useMemo<TableProps.ColumnDefinition<ComplianceRecord>[]>(() => {
    const renewRecord = (item: ComplianceRecord) => {
      setModalError("");
      setEditor(renewalDraft(item));
    };
    const archiveRecordRow = (item: ComplianceRecord) => {
      setModalError("");
      setArchiveTarget({
        id: item.record_id,
        label: item.display_id,
        reason: "",
      });
    };
    const rowActions = (item: ComplianceRecord) => {
      const documentFile = pgTextValue(item.document_file);
      const items = [
        ...(documentFile ? [{ id: "document", text: "Open document" }] : []),
        ...(canWrite && item.status === "ACTIVE" ? [{ id: "renew", text: "Add version" }] : []),
        ...(canArchive && item.status === "ACTIVE" ? [{ id: "archive", text: "Archive" }] : []),
        ...(canArchive && item.status === "ARCHIVED" ? [{ id: "permanent-delete", text: "Permanently delete" }] : []),
      ];

      if (items.length === 0) {
        return <Box color="text-body-secondary">View only</Box>;
      }

      return (
        <ButtonDropdown
          ariaLabel={`Actions for ${item.display_id}`}
          expandToViewport
          items={items}
          onItemClick={({ detail }) => {
            if (detail.id === "document") {
              downloadMutation.mutate(item.record_id);
              return;
            }
            if (detail.id === "renew") {
              renewRecord(item);
              return;
            }
            if (detail.id === "permanent-delete") {
              setDeleteTarget({
                id: item.record_id, displayId: item.display_id, label: `${item.type_name} for ${item.subject_name || item.subject_id}`,
              });
              return;
            }
            archiveRecordRow(item);
          }}
        >
          Actions
        </ButtonDropdown>
      );
    };

    if (compactTable) {
      return [
        {
          id: "record",
          header: "Record",
          minWidth: 220,
          cell: (item) => (
            <TableCellText title={item.type_name}>
              <strong>{item.type_name}</strong>
              <br />
              {subjectLabel(item)}
              <div className="hr-admin-persons__compact-actions">{rowActions(item)}</div>
            </TableCellText>
          ),
        },
        {
          id: "status",
          header: "Status",
          width: 110,
          minWidth: 100,
          cell: (item) => (
            <SpaceBetween size="xxs">
              {statusBadge(item.status)}
              <Box color="text-body-secondary">{expirySignal(item)}</Box>
            </SpaceBetween>
          ),
        },
      ];
    }

    return [
      {
        id: "record",
        header: "Record",
        width: "22%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.type_name}>
            <strong>{item.type_name}</strong>
            <br />
            {item.display_id}
            {pgIntValue(item.version_number) ? ` - v${pgIntValue(item.version_number)}` : ""}
          </TableCellText>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        width: "20%",
        minWidth: 200,
        cell: (item) => (
          <TableCellText title={item.subject_name || item.subject_id}>
            <strong>{item.subject_name || item.subject_id}</strong>
            <br />
            {humanizeEnum(item.subject_type)}
          </TableCellText>
        ),
      },
      {
        id: "dates",
        header: "Dates",
        width: "18%",
        minWidth: 190,
        cell: (item) => (
          <TableCellText title={`Issue ${formatDocumentDate(item.issue_date)} / Expiry ${formatDocumentDate(item.expiry_date)}`}>
            Issue: {formatDocumentDate(item.issue_date)}
            <br />
            Expiry: {formatDocumentDate(item.expiry_date)}
          </TableCellText>
        ),
      },
      {
        id: "document",
        header: "Document",
        width: "14%",
        minWidth: 150,
        cell: (item) => {
          const documentFile = pgTextValue(item.document_file);
          return documentFile ? (
            <Button loading={downloadMutation.isPending} onClick={() => downloadMutation.mutate(item.record_id)}>
              Open
            </Button>
          ) : (
            <Box color="text-body-secondary">Not attached</Box>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        width: "13%",
        minWidth: 130,
        cell: (item) => (
          <SpaceBetween size="xxs">
            {statusBadge(item.status)}
            <Box color="text-body-secondary">{expirySignal(item)}</Box>
          </SpaceBetween>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        width: 140,
        minWidth: 130,
        cell: (item) => <TableCellActions>{rowActions(item)}</TableCellActions>,
      },
    ];
  }, [canArchive, canWrite, compactTable, downloadMutation]);

  const archiveRecord = (target: NonNullable<ArchiveTarget>) => {
    if (target.reason.trim().length < 3) {
      setModalError("Enter an archive reason.");
      return;
    }
    setModalError("");
    archiveRecordMutation.mutate(target);
  };

  const isLoading =
    recordsQuery.isLoading ||
    recordTypesQuery.isLoading ||
    peopleQuery.isLoading ||
    vehiclesQuery.isLoading ||
    companiesQuery.isLoading;
  const hasError =
    recordsQuery.isError ||
    recordTypesQuery.isError ||
    peopleQuery.isError ||
    vehiclesQuery.isError ||
    companiesQuery.isError;

  if (isLoading) {
    return <PageLoading>{"Loading HR/Admin compliance records..."}</PageLoading>;
  }

  if (hasError || !recordsQuery.data || !recordTypesQuery.data) {
    return (
      <PageError
        description="The HR/Admin compliance records workspace could not be loaded."
        onRetry={() => {
          void recordsQuery.refetch();
          void recordTypesQuery.refetch();
          void peopleQuery.refetch();
          void vehiclesQuery.refetch();
          void companiesQuery.refetch();
        }}
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          actions={
            canWrite ? (
              <Button
                variant="primary"
                onClick={() => {
                  setModalError("");
                  setEditor({
                    mode: "create",
                    subject_type: "PERSON",
                    subject_id: "",
                    record_type_id: "",
                    issue_date: "",
                    expiry_date: "",
                    document_file: "",
                    selected_file: null,
                    issuing_authority: "",
                    notes: "",
                  });
                }}
              >
                Create record
              </Button>
            ) : undefined
          }
          description="Compliance evidence and renewal history for company responsibility records."
          variant="h1"
        >
          Records
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hrRole === "VIEWER" ? (
          <Alert type="info">
            Viewer access allows you to inspect and download records, but not change compliance records.
          </Alert>
        ) : null}
        <Container>
          <SpaceBetween size="m">
            <Input
              ariaLabel="Search records"
              placeholder="Search by subject, type, status, authority, document, or expiry"
              value={filterText}
              onChange={({ detail }) => setFilterText(detail.value)}
            />
            <Table
              columnDefinitions={columns}
              empty={
                <PageEmpty
                  action={
                    canWrite ? (
                      <Button
                        onClick={() =>
                          setEditor({
                            mode: "create",
                            subject_type: "PERSON",
                            subject_id: "",
                            record_type_id: "",
                            issue_date: "",
                            expiry_date: "",
                            document_file: "",
                            selected_file: null,
                            issuing_authority: "",
                            notes: "",
                          })
                        }
                        variant="primary"
                      >
                        Create record
                      </Button>
                    ) : undefined
                  }
                  description={
                    filterText
                      ? "No compliance records match the current search."
                      : "Create the first compliance record after at least one active subject and record type exist."
                  }
                  title={filterText ? "No matching records" : "No records yet"}
                />
              }
              header={<Header counter={`(${filteredRecords.length})`}>Compliance records</Header>}
              items={filteredRecords}
              trackBy="record_id"
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      {editor && <RecordEditorModal
        companies={companies}
        editor={editor}
        onSaved={() => setEditor(null)}
        people={people}
        recordTypes={recordTypes}
        vehicles={vehicles}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
      />}
      <ArchiveRecordModal
        errorMessage={modalError}
        loading={archiveRecordMutation.isPending}
        target={archiveTarget}
        onDismiss={() => {
          setArchiveTarget(null);
          setModalError("");
        }}
        onSubmit={archiveRecord}
      />
      {deleteTarget && <PermanentDeleteModal kind="COMPLIANCE_RECORD" target={deleteTarget} onDismiss={() => setDeleteTarget(null)} />}
    </ContentLayout>
  );
}
