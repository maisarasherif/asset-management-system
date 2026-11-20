import { FormField, type SelectProps } from "@cloudscape-design/components";
import { useState } from "react";
import { listAssetComponentCategories, listComponentsByAsset } from "../../lib/api/ams";
import { PagedSelect } from "./PagedSelect";
import type { ListControls } from "./useListControls";

export function AssetCategoryFilter({ assetId, controls, client = false }: {
  assetId: string; controls: ListControls; client?: boolean;
}) {
  const [selected, setSelected] = useState<SelectProps.Option | null>(null);
  const id = controls.filters.category_id;
  return <FormField label="Category">
    <PagedSelect label="Category" queryKey={[client ? "client-asset" : "components", assetId, "categories"]}
      load={(page, search) => listAssetComponentCategories(assetId, { page, limit: 20, search }, client)}
      getOption={(category) => ({ value: category.category_id, label: category.category_name })}
      selected={selected?.value === id ? selected : id ? { value: id, label: "Selected category" } : null}
      allLabel="All categories" onSelect={(option) => {
        setSelected(option);
        controls.setFilters({ category_id: option?.value ?? "" });
      }} />
  </FormField>;
}

export function AssetComponentFilter({ assetId, controls }: { assetId: string; controls: ListControls }) {
  const [selected, setSelected] = useState<SelectProps.Option | null>(null);
  const id = controls.filters.component_id;
  return <FormField label="Component">
    <PagedSelect label="Component" queryKey={["components", assetId, "picker"]}
      load={(page, search) => listComponentsByAsset(assetId, page, 20, { search })}
      getOption={(item) => ({ value: item.component_id, label: item.name, description: item.display_id })}
      selected={selected?.value === id ? selected : id ? { value: id, label: "Selected component" } : null}
      allLabel="All components" onSelect={(option) => {
        setSelected(option);
        controls.setFilters({ component_id: option?.value ?? "" });
      }} />
  </FormField>;
}
