import { FormField } from "@cloudscape-design/components";
import { useState, type ReactNode } from "react";
import { listClientAssetCertificateTypes, searchTestTypes } from "../../lib/api/ams";
import type { TestType } from "../../types/ams";
import { ListFilters } from "./ListFilters";
import { PagedSelect } from "./PagedSelect";
import type { ListControls } from "./useListControls";

const certificateStatusFacet = { key: "status", label: "Validity", options: [
  { value: "VALID", label: "Valid" }, { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "EXPIRED", label: "Expired" }, { value: "PENDING", label: "Pending" },
] };

const toTestOption = (item: Pick<TestType, "test_id" | "test_name">) => ({ label: item.test_name, value: item.test_id });

export function CertificateListFilters({ controls, clientAssetId, children }: {
  controls: ListControls;
  clientAssetId?: string;
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState<ReturnType<typeof toTestOption> | null>(null);
  const testId = controls.filters.test_id;
  return <ListFilters controls={controls} label="Search certificates" facets={[certificateStatusFacet]}>
    <FormField label="Certificate type">
      <PagedSelect label="Certificate type" queryKey={["test-types", "certificate-filter", clientAssetId]}
        load={(page, search) => clientAssetId
          ? listClientAssetCertificateTypes(clientAssetId, { page, search, limit: 20 })
          : searchTestTypes({ page, search, limit: 20 })}
        getOption={toTestOption} allLabel="All certificate types"
        selected={selected?.value === testId ? selected : testId ? { value: testId, label: "Selected type" } : null}
        onSelect={(_, item) => {
          setSelected(item ? toTestOption(item) : null);
          controls.setFilters({ test_id: item?.test_id ?? "" });
        }} />
    </FormField>
    {children}
  </ListFilters>;
}
