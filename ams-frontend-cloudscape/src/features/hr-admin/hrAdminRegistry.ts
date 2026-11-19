import type { ComplianceRecord, ComplianceRecordType, HRAdminSubjectType } from "../../types/ams";
import { documentDateInput } from "./hrAdminDates";

export const subjectGroups = { PERSON: "Persons", VEHICLE: "Vehicles", COMPANY: "Companies" } as const;

export const expiryLabels: Record<ComplianceRecord["expiry_status"], string> = {
  EXPIRED: "Expired",
  DUE_NOW: "Due now",
  UPCOMING: "Upcoming",
  OK: "Valid",
  ARCHIVED: "Archived",
  NO_EXPIRY: "No expiry",
  MISSING_EXPIRY: "Missing expiry",
  UNTRACKED: "Untracked",
};

export type RecordEditor = {
  mode: "create" | "renew";
  policy?: Pick<ComplianceRecordType, "default_validity_months" | "requires_document" | "renewal_behavior">;
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
} | null;

export function pgTextValue(
  value: ComplianceRecord["document_file"] | ComplianceRecord["issuing_authority"] | ComplianceRecord["notes"]
) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.String === "string") {
    return value.String;
  }
  return "";
}

export function renewalDraft(item: ComplianceRecord): NonNullable<RecordEditor> {
  return {
    mode: "renew",
    policy: item,
    record_id: item.record_id,
    record_label: item.display_id,
    subject_type: item.subject_type,
    subject_id: item.subject_id,
    record_type_id: item.record_type_id,
    issue_date: documentDateInput(item.issue_date),
    expiry_date: documentDateInput(item.expiry_date),
    document_file: pgTextValue(item.document_file),
    selected_file: null,
    issuing_authority: pgTextValue(item.issuing_authority),
    notes: pgTextValue(item.notes),
  };
}
