import {
  Alert,
  Box,
  Button,
  FileUpload,
  Input,
  FormField,
  Modal,
  SpaceBetween,
  Textarea,
} from "@cloudscape-design/components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppDatePicker } from "../../components/shared/AppDatePicker";
import type { SelectProps } from "@cloudscape-design/components/select";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { Select } from "../../components/shared/OptimizedSelect";
import { createComplianceRecord, listComplianceRecordTypes, listHRAdminPersons, listHRAdminVehicles, listHRAdminCompanies, renewComplianceRecord, uploadComplianceRecordDocument } from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  ComplianceRecordType,
  ComplianceRecordInput,
  ComplianceRecordVersionInput,
  HRAdminSubjectType,
} from "../../types/ams";
import { humanizeEnum, toIsoDate } from "../../utils/format";
import type { RecordEditor } from "./hrAdminRegistry";

const SUBJECT_TYPE_OPTIONS = [
  { label: "Person", value: "PERSON" },
  { label: "Vehicle", value: "VEHICLE" },
  { label: "Company", value: "COMPANY" },
];
const COMPLIANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const COMPLIANCE_DOCUMENT_MAX_LABEL = "10 MB";

function recordTypeIntValue(value: ComplianceRecordType["default_validity_months"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function calculatedExpiryDate(
  issueDate: string,
  recordType: Pick<ComplianceRecordType, "default_validity_months" | "renewal_behavior"> | undefined
) {
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

async function loadSubjects(subjectType: HRAdminSubjectType, page: number, search: string) {
  const filters = { status: "ACTIVE", search };
  if (subjectType === "PERSON") {
    const result = await listHRAdminPersons(page, 20, filters);
    return { ...result, data: result.data.map((item) => ({ label: item.full_name, value: item.person_id, description: item.person_code || item.display_id })) };
  }
  if (subjectType === "VEHICLE") {
    const result = await listHRAdminVehicles(page, 20, filters);
    return { ...result, data: result.data.map((item) => ({ label: item.plate_number, value: item.vehicle_id, description: [item.make, item.model].filter(Boolean).join(" ") || item.display_id })) };
  }
  const result = await listHRAdminCompanies(page, 20, filters);
  return { ...result, data: result.data.map((item) => ({ label: item.company_name, value: item.company_id, description: item.company_code || item.display_id })) };
}

function recordTypeOption(item: ComplianceRecordType) {
  return {
    label: item.type_name,
    value: item.record_type_id,
    description: humanizeEnum(item.renewal_behavior) + (item.requires_document ? " - document required" : ""),
  };
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

export function RecordEditorModal({
  editor,
  onSaved,
  onDismiss,
}: {
  editor: RecordEditor;
  onSaved: () => void;
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const [errorMessage, setModalError] = useState("");
  const [draft, setDraft] = useState<RecordEditor>(editor);
  const [issueDateError, setIssueDateError] = useState("");
  const [expiryDateError, setExpiryDateError] = useState("");

  const subjectType = draft?.subject_type ?? "PERSON";
  const [selectedSubject, setSelectedSubject] = useState<SelectProps.Option | null>(null);
  const [selectedRecordType, setSelectedRecordType] = useState<SelectProps.Option | null>(null);
  const currentRecordType = draft?.policy;

  const saveRecordMutation = useMutation<unknown, Error, NonNullable<RecordEditor>>({
    mutationFn: async (draft) => {
      const documentFile = draft.selected_file
        ? (await uploadComplianceRecordDocument(draft.selected_file)).document_file
        : draft.document_file;
      const preparedDraft = { ...draft, document_file: documentFile, selected_file: null };
      if (draft.selected_file) {
        // Keep the uploaded key available if only the version request needs retrying.
        setDraft((current) =>
          current && current.selected_file === draft.selected_file
            ? { ...current, selected_file: null, document_file: documentFile }
            : current
        );
      }
      return preparedDraft.mode === "renew" && preparedDraft.record_id
        ? renewComplianceRecord(preparedDraft.record_id, toVersionInput(preparedDraft))
        : createComplianceRecord(toRecordInput(preparedDraft));
    },
    onSuccess: (_response, draft) => {
      onSaved();
      setModalError("");
      success(
        draft.mode === "renew" ? "Record version added" : "Compliance record created",
        draft.mode === "renew" ? "The current version was updated." : "The record is ready for renewal tracking."
      );
      void queryClient.invalidateQueries({ queryKey: ["hr-admin"] });
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const saveRecord = (draft: NonNullable<RecordEditor>) => {
    const recordType = draft.policy;
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

  const loading = saveRecordMutation.isPending;
  const updateIssueDate = (issueDate: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const recordType = current.policy;
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
      onDismiss={() => {
        if (!loading) onDismiss();
      }}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button disabled={loading} onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(issueDateError || expiryDateError)}
            loading={loading}
            variant="primary"
            onClick={() => draft && saveRecord(draft)}
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
                onChange={({ detail }) => {
                  setSelectedSubject(null);
                  setSelectedRecordType(null);
                  setDraft(
                    (current) =>
                      current && {
                        ...current,
                        subject_type: (detail.selectedOption.value as HRAdminSubjectType) || "PERSON",
                        subject_id: "",
                        record_type_id: "",
                        policy: undefined,
                        expiry_date: "",
                      }
                  );
                }}
              />
            </FormField>
            <FormField label="Subject" constraintText="Required">
              <PagedSelect key={subjectType} label="Subject" selected={selectedSubject}
                queryKey={["hr-admin", "record-subject-options", subjectType]}
                load={(page, search) => loadSubjects(subjectType, page, search)}
                getOption={(option) => option}
                onSelect={(option) => {
                  setSelectedSubject(option);
                  setDraft((current) => current && { ...current, subject_id: option?.value ?? "" });
                }} />
            </FormField>
            <FormField label="Record type" constraintText="Required">
              <PagedSelect key={subjectType} label="Record type" selected={selectedRecordType}
                queryKey={["hr-admin", "compliance-record-types", "editor", subjectType]}
                load={(page, search) => listComplianceRecordTypes(page, 20, { search, subject_type: subjectType, status: "ACTIVE" })}
                getOption={recordTypeOption}
                onSelect={(option, recordType) => {
                  setSelectedRecordType(option);
                  setDraft((current) => current && {
                    ...current,
                    record_type_id: option?.value ?? "",
                    policy: recordType,
                    expiry_date: calculatedExpiryDate(current.issue_date, recordType)
                      || (recordType?.renewal_behavior === "ONE_TIME" ? "" : current.expiry_date),
                  });
                }} />
            </FormField>
          </>
        ) : null}
        <FormField
          label="Issue date"
          errorText={issueDateError || undefined}
          description={
            currentRecordType?.renewal_behavior === "RENEWABLE" &&
            recordTypeIntValue(currentRecordType.default_validity_months)
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
            onChange={({ detail }) => setDraft((current) => current && { ...current, notes: detail.value })}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
