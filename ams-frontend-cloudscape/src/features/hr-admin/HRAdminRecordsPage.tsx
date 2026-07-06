import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonDropdown,
  Container,
  ContentLayout,
  FileUpload,
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
import { AppDatePicker } from "../../components/shared/AppDatePicker";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { Select } from "../../components/shared/OptimizedSelect";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  archiveComplianceRecord,
  createComplianceRecord,
  getComplianceRecordDownloadUrl,
  listComplianceRecords,
  listComplianceRecordTypes,
  listHRAdminCompanies,
  listHRAdminPersons,
  listHRAdminVehicles,
  renewComplianceRecord,
  uploadComplianceRecordDocument,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  ComplianceRecord,
  ComplianceRecordInput,
  ComplianceRecordType,
  ComplianceRecordVersionInput,
  HRAdminCompany,
  HRAdminPerson,
  HRAdminSubjectType,
  HRAdminVehicle,
} from "../../types/ams";
import { formatDateTime, humanizeEnum, toIsoDate } from "../../utils/format";

type RecordEditor =
  | {
      mode: "create" | "renew";
      record_id?: string;
      record_label?: string;
      subject_type: HRAdminSubjectType;
      subject_id: string;
      record_type_id: string;
      issue_date: string;
      expiry_date: string;
      document_file: string;
      selected_file: File | null;
      issuing_authority: string;
      notes: string;
    }
  | null;

type ArchiveTarget =
  | {
      id: string;
      label: string;
      reason: string;
    }
  | null;

const SUBJECT_TYPE_OPTIONS = [
  { label: "Person", value: "PERSON" },
  { label: "Vehicle", value: "VEHICLE" },
  { label: "Company", value: "COMPANY" },
];
const COMPLIANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const COMPLIANCE_DOCUMENT_MAX_LABEL = "10 MB";

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function pgTextValue(value: ComplianceRecord["document_file"] | ComplianceRecord["issuing_authority"] | ComplianceRecord["notes"]) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.String === "string") {
    return value.String;
  }
  return "";
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

function recordTypeIntValue(value: ComplianceRecordType["default_validity_months"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function calculatedExpiryDate(issueDate: string, recordType: ComplianceRecordType | undefined) {
  const validityMonths = recordTypeIntValue(recordType?.default_validity_months ?? null);
  if (!issueDate || recordType?.renewal_behavior !== "RENEWABLE" || !validityMonths) {
    return "";
  }

  const [year, month, day] = issueDate.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + validityMonths);
  return date.toISOString().slice(0, 10);
}

function dateInputValue(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  if (typeof value === "object" && value !== null) {
    const maybeTime = (value as { Time?: string }).Time;
    return maybeTime ? dateInputValue(maybeTime) : "";
  }
  return "";
}

function dateLabel(value: unknown) {
  return formatDateTime(value).replace(", 12:00 AM", "");
}

function statusBadge(status: ComplianceRecord["status"]) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function expirySignal(record: ComplianceRecord) {
  if (record.status !== "ACTIVE") {
    return "Archived";
  }
  const inputValue = dateInputValue(record.expiry_date);
  if (!inputValue) {
    return record.renewal_behavior === "RENEWABLE" ? "Missing expiry" : "No expiry";
  }
  const expiryTime = new Date(`${inputValue}T00:00:00.000Z`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiryTime - today.getTime()) / 86_400_000);
  if (days < 0) {
    return "Expired";
  }
  if (days <= 30) {
    return `${days}d left`;
  }
  return "Valid";
}

function subjectLabel(record: ComplianceRecord) {
  return `${humanizeEnum(record.subject_type)} - ${record.subject_name || record.subject_id}`;
}

function subjectOptions(
  subjectType: HRAdminSubjectType,
  people: HRAdminPerson[],
  vehicles: HRAdminVehicle[],
  companies: HRAdminCompany[]
) {
  if (subjectType === "PERSON") {
    return people
      .filter((person) => person.status === "ACTIVE")
      .map((person) => ({
        label: person.full_name,
        value: person.person_id,
        description: person.person_code || person.display_id,
      }));
  }
  if (subjectType === "VEHICLE") {
    return vehicles
      .filter((vehicle) => vehicle.status === "ACTIVE")
      .map((vehicle) => ({
        label: vehicle.plate_number,
        value: vehicle.vehicle_id,
        description: [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.display_id,
      }));
  }
  return companies
    .filter((company) => company.status === "ACTIVE")
    .map((company) => ({
      label: company.company_name,
      value: company.company_id,
      description: company.company_code || humanizeEnum(company.company_kind),
    }));
}

function recordTypeOptions(subjectType: HRAdminSubjectType, recordTypes: ComplianceRecordType[]) {
  return recordTypes
    .filter((recordType) => recordType.active && recordType.subject_type === subjectType)
    .map((recordType) => ({
      label: recordType.type_name,
      value: recordType.record_type_id,
      description: `${humanizeEnum(recordType.renewal_behavior)}${
        recordType.requires_document ? " - document required" : ""
      }`,
    }));
}

function toVersionInput(editor: NonNullable<RecordEditor>): ComplianceRecordVersionInput {
  return {
    issue_date: editor.issue_date ? toIsoDate(editor.issue_date) : null,
    expiry_date: editor.expiry_date ? toIsoDate(editor.expiry_date) : null,
    document_file: editor.document_file.trim(),
    issuing_authority: editor.issuing_authority.trim(),
    notes: editor.notes.trim(),
  };
}

function toRecordInput(editor: NonNullable<RecordEditor>): ComplianceRecordInput {
  return {
    subject_type: editor.subject_type,
    subject_id: editor.subject_id,
    record_type_id: editor.record_type_id,
    ...toVersionInput(editor),
  };
}

function isComplianceDocumentTooLarge(file: File | null) {
  return Boolean(file && file.size > COMPLIANCE_DOCUMENT_MAX_BYTES);
}

function complianceDocumentTooLargeMessage() {
  return `Compliance document must be ${COMPLIANCE_DOCUMENT_MAX_LABEL} or smaller.`;
}

function RecordEditorModal({
  editor,
  errorMessage,
  loading,
  people,
  recordTypes,
  vehicles,
  companies,
  onDismiss,
  onSubmit,
}: {
  editor: RecordEditor;
  errorMessage: string;
  loading: boolean;
  people: HRAdminPerson[];
  recordTypes: ComplianceRecordType[];
  vehicles: HRAdminVehicle[];
  companies: HRAdminCompany[];
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<RecordEditor>) => void;
}) {
  const [draft, setDraft] = useState<RecordEditor>(editor);
  const [issueDateError, setIssueDateError] = useState("");
  const [expiryDateError, setExpiryDateError] = useState("");

  useEffect(() => {
    setDraft(editor);
    setIssueDateError("");
    setExpiryDateError("");
  }, [editor]);

  const subjectType = draft?.subject_type ?? "PERSON";
  const availableSubjects = subjectOptions(subjectType, people, vehicles, companies);
  const availableRecordTypes = recordTypeOptions(subjectType, recordTypes);
  const selectedSubject =
    availableSubjects.find((option) => option.value === draft?.subject_id) ?? null;
  const selectedRecordType =
    availableRecordTypes.find((option) => option.value === draft?.record_type_id) ?? null;
  const currentRecordType = recordTypes.find((recordType) => recordType.record_type_id === draft?.record_type_id);

  const updateIssueDate = (issueDate: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const recordType = recordTypes.find((item) => item.record_type_id === current.record_type_id);
      const nextExpiry = calculatedExpiryDate(issueDate, recordType);
      return {
        ...current,
        issue_date: issueDate,
        expiry_date: nextExpiry || current.expiry_date,
      };
    });
  };

  return (
    <Modal
      visible={Boolean(editor)}
      header={draft?.mode === "renew" ? `Add version for ${draft.record_label}` : "Create compliance record"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button
            disabled={Boolean(issueDateError || expiryDateError)}
            loading={loading}
            variant="primary"
            onClick={() => draft && onSubmit(draft)}
          >
            {draft?.mode === "renew" ? "Add version" : "Create record"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        {draft?.mode === "create" ? (
          <>
            <FormField label="Subject type" constraintText="Required">
              <Select
                ariaLabel="Subject type"
                options={SUBJECT_TYPE_OPTIONS}
                selectedOption={SUBJECT_TYPE_OPTIONS.find((option) => option.value === subjectType) ?? null}
                onChange={({ detail }) =>
                  setDraft(
                    (current) =>
                      current && {
                        ...current,
                        subject_type: (detail.selectedOption.value as HRAdminSubjectType) || "PERSON",
                        subject_id: "",
                        record_type_id: "",
                        expiry_date: "",
                      }
                  )
                }
              />
            </FormField>
            <FormField label="Subject" constraintText="Required">
              <Select
                ariaLabel="Subject"
                empty="No active subjects for this subject type"
                options={availableSubjects}
                selectedOption={selectedSubject}
                onChange={({ detail }) =>
                  setDraft((current) => current && { ...current, subject_id: detail.selectedOption.value || "" })
                }
              />
            </FormField>
            <FormField label="Record type" constraintText="Required">
              <Select
                ariaLabel="Record type"
                empty="No active record types for this subject type"
                options={availableRecordTypes}
                selectedOption={selectedRecordType}
                onChange={({ detail }) => {
                  const recordTypeId = detail.selectedOption.value || "";
                  const recordType = recordTypes.find((item) => item.record_type_id === recordTypeId);
                  setDraft((current) => {
                    if (!current) {
                      return current;
                    }
                    const nextExpiry = calculatedExpiryDate(current.issue_date, recordType);
                    return {
                      ...current,
                      record_type_id: recordTypeId,
                      expiry_date:
                        nextExpiry || (recordType?.renewal_behavior === "ONE_TIME" ? "" : current.expiry_date),
                    };
                  });
                }}
              />
            </FormField>
          </>
        ) : null}
        <FormField
          label="Issue date"
          errorText={issueDateError || undefined}
          description={
            currentRecordType?.renewal_behavior === "RENEWABLE" && recordTypeIntValue(currentRecordType.default_validity_months)
              ? "Expiry auto-fills from the selected record type's default validity."
              : undefined
          }
        >
          <AppDatePicker
            ariaLabel="Issue date"
            invalid={Boolean(issueDateError)}
            value={draft?.issue_date || ""}
            onChange={updateIssueDate}
            onValidityChange={setIssueDateError}
          />
        </FormField>
        <FormField
          label="Expiry date"
          errorText={expiryDateError || undefined}
          description="Required for renewable record types."
        >
          <AppDatePicker
            ariaLabel="Expiry date"
            invalid={Boolean(expiryDateError)}
            value={draft?.expiry_date || ""}
            onChange={(expiryDate) => setDraft((current) => current && { ...current, expiry_date: expiryDate })}
            onValidityChange={setExpiryDateError}
          />
        </FormField>
        <FormField
          label="Document"
          description={`Attach the source PDF or image. Maximum size: ${COMPLIANCE_DOCUMENT_MAX_LABEL}.`}
        >
          <FileUpload
            value={draft?.selected_file ? [draft.selected_file] : []}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, selected_file: detail.value[0] ?? null })
            }
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            i18nStrings={{
              uploadButtonText: (multiple) => (multiple ? "Choose files" : "Choose file"),
              dropzoneText: (multiple) => (multiple ? "Drop files to upload" : "Drop file to upload"),
              removeFileAriaLabel: () => "Remove file",
              limitShowFewer: "Show fewer files",
              limitShowMore: "Show more files",
              errorIconAriaLabel: "Error",
            }}
          />
          {draft?.document_file && !draft.selected_file ? (
            <Box color="text-body-secondary">Current document will be retained unless a new file is selected.</Box>
          ) : null}
        </FormField>
        <FormField label="Issuing authority">
          <Input
            value={draft?.issuing_authority || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, issuing_authority: detail.value })
            }
          />
        </FormField>
        <FormField label="Notes">
          <Textarea
            value={draft?.notes || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, notes: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
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
  const [modalError, setModalError] = useState("");

  const recordsQuery = useQuery({
    queryKey: ["hr-admin", "compliance-records"],
    queryFn: () => listComplianceRecords(1, 100),
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

  const invalidateRecords = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-admin", "compliance-records"] });

  const saveRecordMutation = useMutation<unknown, Error, NonNullable<RecordEditor>>({
    mutationFn: async (draft) => {
      const documentFile = draft.selected_file
        ? (await uploadComplianceRecordDocument(draft.selected_file)).document_file
        : draft.document_file;
      const preparedDraft = { ...draft, document_file: documentFile, selected_file: null };
      return preparedDraft.mode === "renew" && preparedDraft.record_id
        ? renewComplianceRecord(preparedDraft.record_id, toVersionInput(preparedDraft))
        : createComplianceRecord(toRecordInput(preparedDraft));
    },
    onSuccess: (_response, draft) => {
      setEditor(null);
      setModalError("");
      success(
        draft.mode === "renew" ? "Record version added" : "Compliance record created",
        draft.mode === "renew" ? "The current version was updated." : "The record is ready for renewal tracking."
      );
      void invalidateRecords();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const archiveRecordMutation = useMutation({
    mutationFn: (target: NonNullable<ArchiveTarget>) =>
      archiveComplianceRecord(target.id, target.reason.trim()),
    onSuccess: () => {
      setArchiveTarget(null);
      setModalError("");
      success("Compliance record archived", "Renewal reminders will ignore this record.");
      void invalidateRecords();
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
      setEditor({
        mode: "renew",
        record_id: item.record_id,
        record_label: item.display_id,
        subject_type: item.subject_type,
        subject_id: item.subject_id,
        record_type_id: item.record_type_id,
        issue_date: dateInputValue(item.issue_date),
        expiry_date: dateInputValue(item.expiry_date),
        document_file: pgTextValue(item.document_file),
        selected_file: null,
        issuing_authority: pgTextValue(item.issuing_authority),
        notes: pgTextValue(item.notes),
      });
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
          <TableCellText title={`Issue ${dateLabel(item.issue_date)} / Expiry ${dateLabel(item.expiry_date)}`}>
            Issue: {dateLabel(item.issue_date)}
            <br />
            Expiry: {dateLabel(item.expiry_date)}
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

  const saveRecord = (draft: NonNullable<RecordEditor>) => {
    const recordType = recordTypes.find((item) => item.record_type_id === draft.record_type_id);
    if (draft.mode === "create" && !draft.subject_id) {
      setModalError("Choose the subject for this compliance record.");
      return;
    }
    if (draft.mode === "create" && !draft.record_type_id) {
      setModalError("Choose the compliance record type.");
      return;
    }
    if (recordType?.renewal_behavior === "RENEWABLE" && !draft.expiry_date) {
      setModalError("Enter the expiry date for this renewable record.");
      return;
    }
    if (recordType?.requires_document && !draft.document_file.trim() && !draft.selected_file) {
      setModalError("Attach the document for this record type.");
      return;
    }
    if (isComplianceDocumentTooLarge(draft.selected_file)) {
      setModalError(complianceDocumentTooLargeMessage());
      return;
    }
    if (draft.issue_date && draft.expiry_date && new Date(draft.expiry_date) <= new Date(draft.issue_date)) {
      setModalError("Expiry date must be after issue date.");
      return;
    }
    setModalError("");
    saveRecordMutation.mutate(draft);
  };

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

      <RecordEditorModal
        companies={companies}
        editor={editor}
        errorMessage={modalError}
        loading={saveRecordMutation.isPending}
        people={people}
        recordTypes={recordTypes}
        vehicles={vehicles}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
        onSubmit={saveRecord}
      />
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
    </ContentLayout>
  );
}
