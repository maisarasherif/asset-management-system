import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
import { Select } from "../../components/shared/OptimizedSelect";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  createComplianceRecordType,
  listComplianceRecordTypes,
  updateComplianceRecordType,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  ComplianceRecordType,
  ComplianceRecordTypeInput,
  ComplianceRenewalBehavior,
  HRAdminSubjectType,
} from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

type RecordTypeEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      subject_type: HRAdminSubjectType;
      type_name: string;
      renewal_behavior: ComplianceRenewalBehavior;
      default_validity_months: string;
      reminder_policy_days: string;
      requires_document: boolean;
      active: boolean;
      description: string;
    }
  | null;

const SUBJECT_TYPE_OPTIONS = [
  { label: "Person", value: "PERSON" },
  { label: "Vehicle", value: "VEHICLE" },
  { label: "Company", value: "COMPANY" },
];

const RENEWAL_BEHAVIOR_OPTIONS = [
  { label: "Renewable", value: "RENEWABLE", description: "Expiry date is required on records." },
  { label: "One time", value: "ONE_TIME", description: "No renewal duration is stored." },
];

const REMINDER_PRESETS = [
  { label: "1 month", value: "30" },
  { label: "2 months", value: "60" },
  { label: "3 months", value: "90" },
];

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function intValue(value: ComplianceRecordType["default_validity_months"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function validityLabel(recordType: ComplianceRecordType) {
  const months = intValue(recordType.default_validity_months);
  if (recordType.renewal_behavior === "ONE_TIME") {
    return "One time";
  }
  if (!months) {
    return "No default";
  }
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function reminderDaysLabel(days: number[] | null) {
  if (!days || days.length === 0) {
    return "Default policy";
  }
  return days.join(", ");
}

function statusBadge(active: boolean) {
  return <Badge color={active ? "green" : "grey"}>{active ? "Active" : "Inactive"}</Badge>;
}

function parseReminderDays(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(",").map((part) => Number(part.trim()));
}

function toRecordTypeInput(editor: NonNullable<RecordTypeEditor>): ComplianceRecordTypeInput {
  const validityMonths = editor.default_validity_months.trim()
    ? Number(editor.default_validity_months)
    : null;
  return {
    subject_type: editor.subject_type,
    type_name: editor.type_name.trim(),
    renewal_behavior: editor.renewal_behavior,
    default_validity_months: editor.renewal_behavior === "RENEWABLE" ? validityMonths : null,
    reminder_policy_days: parseReminderDays(editor.reminder_policy_days),
    requires_document: editor.requires_document,
    active: editor.active,
    description: editor.description.trim(),
  };
}

function RecordTypeEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: RecordTypeEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<RecordTypeEditor>) => void;
}) {
  const [draft, setDraft] = useState<RecordTypeEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const selectedSubject =
    SUBJECT_TYPE_OPTIONS.find((option) => option.value === draft?.subject_type) ?? null;
  const selectedBehavior =
    RENEWAL_BEHAVIOR_OPTIONS.find((option) => option.value === draft?.renewal_behavior) ?? null;

  return (
    <Modal
      visible={Boolean(editor)}
      header={draft?.mode === "edit" ? "Edit record type" : "Create record type"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create record type"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Subject type" constraintText="Required">
          <Select
            ariaLabel="Subject type"
            options={SUBJECT_TYPE_OPTIONS}
            selectedOption={selectedSubject}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    subject_type: (detail.selectedOption.value as HRAdminSubjectType) || "PERSON",
                  }
              )
            }
          />
        </FormField>
        <FormField label="Type name" constraintText="Required">
          <Input
            ariaLabel="Type name"
            value={draft?.type_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, type_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Renewal behavior" constraintText="Required">
          <Select
            ariaLabel="Renewal behavior"
            options={RENEWAL_BEHAVIOR_OPTIONS}
            selectedOption={selectedBehavior}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    renewal_behavior:
                      (detail.selectedOption.value as ComplianceRenewalBehavior) || "RENEWABLE",
                    default_validity_months:
                      detail.selectedOption.value === "ONE_TIME" ? "" : current.default_validity_months,
                  }
              )
            }
          />
        </FormField>
        {draft?.renewal_behavior === "RENEWABLE" ? (
          <FormField label="Default validity months" description="Optional; leave blank if validity varies by record.">
            <Input
              ariaLabel="Default validity months"
              type="number"
              value={draft.default_validity_months}
              onChange={({ detail }) =>
                setDraft((current) => current && { ...current, default_validity_months: detail.value })
              }
            />
          </FormField>
        ) : null}
        <FormField
          label="Reminder days"
          description="Days before expiry for this record type. Blank uses the default reminder policy."
        >
          <SpaceBetween size="xs">
            <Input
              ariaLabel="Reminder days"
              value={draft?.reminder_policy_days || ""}
              onChange={({ detail }) =>
                setDraft((current) => current && { ...current, reminder_policy_days: detail.value })
              }
            />
            <SpaceBetween direction="horizontal" size="xs">
              {REMINDER_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  onClick={() =>
                    setDraft((current) => current && { ...current, reminder_policy_days: preset.value })
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </SpaceBetween>
          </SpaceBetween>
        </FormField>
        <Checkbox
          ariaLabel="Requires document"
          checked={Boolean(draft?.requires_document)}
          onChange={({ detail }) =>
            setDraft((current) => current && { ...current, requires_document: detail.checked })
          }
        >
          Requires document
        </Checkbox>
        <Checkbox
          ariaLabel="Active"
          checked={Boolean(draft?.active)}
          onChange={({ detail }) =>
            setDraft((current) => current && { ...current, active: detail.checked })
          }
        >
          Active
        </Checkbox>
        <FormField label="Description">
          <Textarea
            ariaLabel="Description"
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function HRAdminRecordTypesPage() {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const [filterText, setFilterText] = useState("");
  const [compactTable, setCompactTable] = useState(() => isCompactViewport());
  const [editor, setEditor] = useState<RecordTypeEditor>(null);
  const [modalError, setModalError] = useState("");

  const recordTypesQuery = useQuery({
    queryKey: ["hr-admin", "compliance-record-types"],
    queryFn: () => listComplianceRecordTypes(1, 100),
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

  const invalidateRecordTypes = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-admin", "compliance-record-types"] });

  const saveRecordTypeMutation = useMutation<unknown, Error, NonNullable<RecordTypeEditor>>({
    mutationFn: (draft) =>
      draft.mode === "edit" && draft.id
        ? updateComplianceRecordType(draft.id, toRecordTypeInput(draft))
        : createComplianceRecordType(toRecordTypeInput(draft)),
    onSuccess: (_response, draft) => {
      setEditor(null);
      setModalError("");
      success(
        draft.mode === "edit" ? "Record type updated" : "Record type created",
        draft.mode === "edit"
          ? "The record type configuration was saved."
          : "The record type is ready for compliance records."
      );
      void invalidateRecordTypes();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const recordTypes = useMemo(() => recordTypesQuery.data?.data ?? [], [recordTypesQuery.data?.data]);
  const filteredRecordTypes = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return recordTypes;
    }
    return recordTypes.filter((recordType) =>
      [
        recordType.display_id,
        recordType.subject_type,
        recordType.type_name,
        recordType.renewal_behavior,
        recordType.description,
        recordType.active ? "active" : "inactive",
        reminderDaysLabel(recordType.reminder_policy_days),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [filterText, recordTypes]);

  const openEditor = (recordType?: ComplianceRecordType) => {
    setModalError("");
    if (!recordType) {
      setEditor({
        mode: "create",
        subject_type: "PERSON",
        type_name: "",
        renewal_behavior: "RENEWABLE",
        default_validity_months: "",
        reminder_policy_days: "",
        requires_document: true,
        active: true,
        description: "",
      });
      return;
    }

    setEditor({
      mode: "edit",
      id: recordType.record_type_id,
      subject_type: recordType.subject_type,
      type_name: recordType.type_name,
      renewal_behavior: recordType.renewal_behavior,
      default_validity_months: intValue(recordType.default_validity_months)?.toString() ?? "",
      reminder_policy_days: recordType.reminder_policy_days?.join(", ") ?? "",
      requires_document: recordType.requires_document,
      active: recordType.active,
      description: recordType.description || "",
    });
  };

  const columns = useMemo<TableProps.ColumnDefinition<ComplianceRecordType>[]>(() => {
    if (compactTable) {
      return [
        {
          id: "type",
          header: "Type",
          minWidth: 230,
          cell: (item) => (
            <TableCellText title={item.type_name}>
              <strong>{item.type_name}</strong>
              <br />
              {humanizeEnum(item.subject_type)} - {validityLabel(item)}
              <div className="hr-admin-persons__compact-actions">
                <Button onClick={() => openEditor(item)}>Edit</Button>
              </div>
            </TableCellText>
          ),
        },
        {
          id: "status",
          header: "Status",
          width: 100,
          minWidth: 96,
          cell: (item) => statusBadge(item.active),
        },
      ];
    }

    return [
      {
        id: "type",
        header: "Type",
        width: "25%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.type_name}>
            <strong>{item.type_name}</strong>
            <br />
            {item.display_id}
          </TableCellText>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        width: "14%",
        minWidth: 130,
        cell: (item) => humanizeEnum(item.subject_type),
      },
      {
        id: "renewal",
        header: "Renewal",
        width: "18%",
        minWidth: 170,
        cell: (item) => (
          <TableCellText title={validityLabel(item)}>
            {humanizeEnum(item.renewal_behavior)}
            <br />
            {validityLabel(item)}
          </TableCellText>
        ),
      },
      {
        id: "policy",
        header: "Reminder days",
        width: "16%",
        minWidth: 150,
        cell: (item) => reminderDaysLabel(item.reminder_policy_days),
      },
      {
        id: "document",
        header: "Document",
        width: "12%",
        minWidth: 120,
        cell: (item) => (item.requires_document ? "Required" : "Optional"),
      },
      {
        id: "status",
        header: "Status",
        width: "10%",
        minWidth: 110,
        cell: (item) => statusBadge(item.active),
      },
      {
        id: "actions",
        header: "Actions",
        width: 120,
        minWidth: 110,
        cell: (item) => (
          <TableCellActions>
            <Button onClick={() => openEditor(item)}>Edit</Button>
          </TableCellActions>
        ),
      },
    ];
  }, [compactTable]);

  const saveRecordType = (draft: NonNullable<RecordTypeEditor>) => {
    if (!draft.type_name.trim()) {
      setModalError("Enter the record type name.");
      return;
    }
    if (draft.default_validity_months.trim()) {
      const months = Number(draft.default_validity_months);
      if (!Number.isInteger(months) || months < 1 || months > 1200) {
        setModalError("Default validity months must be between 1 and 1200.");
        return;
      }
    }
    const reminderDays = parseReminderDays(draft.reminder_policy_days);
    if (reminderDays.some((day) => !Number.isInteger(day) || day < 0 || day > 3650)) {
      setModalError("Reminder days must be whole numbers between 0 and 3650.");
      return;
    }
    setModalError("");
    saveRecordTypeMutation.mutate(draft);
  };

  if (recordTypesQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin record types..."}</PageLoading>;
  }

  if (recordTypesQuery.isError || !recordTypesQuery.data) {
    return (
      <PageError
        description="The HR/Admin record types list could not be loaded."
        onRetry={() => {
          void recordTypesQuery.refetch();
        }}
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <Button variant="primary" onClick={() => openEditor()}>
              Create record type
            </Button>
          }
          description="ADMIN configuration for the compliance records users can create."
          variant="h1"
        >
          Record Types
        </Header>
      }
    >
      <Container>
        <SpaceBetween size="m">
          <Input
            ariaLabel="Search record types"
            placeholder="Search by subject, name, behavior, status, or reminder days"
            value={filterText}
            onChange={({ detail }) => setFilterText(detail.value)}
          />
          <Table
            columnDefinitions={columns}
            empty={
              <PageEmpty
                action={
                  <Button onClick={() => openEditor()} variant="primary">
                    Create record type
                  </Button>
                }
                description={
                  filterText
                    ? "No record types match the current search."
                    : "Create the first record type so HR/Admin users can start adding compliance records."
                }
                title={filterText ? "No matching record types" : "No record types yet"}
              />
            }
            header={<Header counter={`(${filteredRecordTypes.length})`}>Record type configuration</Header>}
            items={filteredRecordTypes}
            trackBy="record_type_id"
          />
        </SpaceBetween>
      </Container>

      <RecordTypeEditorModal
        editor={editor}
        errorMessage={modalError}
        loading={saveRecordTypeMutation.isPending}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
        onSubmit={saveRecordType}
      />
    </ContentLayout>
  );
}
