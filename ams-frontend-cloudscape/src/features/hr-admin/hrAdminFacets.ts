import { activeArchived } from "../../components/shared/listFacetOptions";
import { expiryLabels, subjectGroups } from "./hrAdminRegistry";

const subjectGroupFacet = {
  key: "subject_type",
  label: "Subject group",
  options: Object.entries(subjectGroups).map(([value, label]) => ({ value, label })),
  clear: ["record_type_id"],
};

export const recordTypeFacets = [
  subjectGroupFacet,
  { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }] },
];

export const recordFacets = [
  subjectGroupFacet,
  { key: "status", label: "Record status", options: activeArchived },
  { key: "expiry_status", label: "Expiry status", options: Object.entries(expiryLabels).map(([value, label]) => ({ value, label })) },
];
