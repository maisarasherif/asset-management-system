import { FormField } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { PagedSelect } from "../../components/shared/PagedSelect";
import type { ListControls } from "../../components/shared/useListControls";
import { listComplianceRecordTypes } from "../../lib/api/ams";
import type { ComplianceRecordType } from "../../types/ams";

const recordTypeOption = (item: ComplianceRecordType) => ({ label: item.type_name, value: item.record_type_id });

export function RecordTypeFilter({ controls }: { controls: ListControls }) {
  const { subject_type, record_type_id } = controls.filters;
  const selectedType = useQuery({
    queryKey: ["hr-admin", "compliance-record-types", "selected", record_type_id],
    queryFn: () => listComplianceRecordTypes(1, 1, { record_type_id }),
    enabled: Boolean(record_type_id),
    retry: false,
  });
  const recordType = selectedType.data?.data[0];
  return (
    <FormField label="Record type">
      <PagedSelect key={subject_type} label="Record type" allLabel="All record types"
        queryKey={["hr-admin", "compliance-record-types", "filter", subject_type]}
        load={(page, search) => listComplianceRecordTypes(page, 20, { search, subject_type })}
        getOption={recordTypeOption}
        selected={recordType ? recordTypeOption(recordType) : record_type_id ? { label: record_type_id, value: record_type_id } : null}
        onSelect={(option) => controls.setFilters({ record_type_id: option?.value ?? "" })} />
    </FormField>
  );
}
