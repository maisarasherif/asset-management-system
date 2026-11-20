export const activeArchived = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const componentKindFacet = { key: "component_kind", label: "Component kind", options: [
  { value: "NORMAL", label: "Component" }, { value: "SELF", label: "Equipment" },
] };
