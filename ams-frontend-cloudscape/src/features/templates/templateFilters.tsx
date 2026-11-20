import type { TemplateConfigurationComponent } from "../../types/ams";
import { ListFilters, ListPagination } from "../../components/shared/ListFilters";
import { useListControls } from "../../components/shared/useListControls";

export function useTemplateComponentFilters(components: TemplateConfigurationComponent[], categoryLabels: ReadonlyMap<string, string>) {
  const controls = useListControls("components", ["category_id"]);
  const { search, limit } = controls.query;
  const filter = search.toLowerCase();
  const category = controls.filters.category_id;
  const matching = components.filter((item) =>
    (!category || (item.scope_category_id ?? item.category_id) === category) &&
    (!filter || [item.display_id, item.name, item.equipment_type, item.description]
      .some((value) => value?.toLowerCase().includes(filter)))
  );
  const meta = { page: controls.page, limit, total: matching.length, total_pages: Math.max(1, Math.ceil(matching.length / limit)) };
  const start = (controls.page - 1) * limit;
  const options = [...new Map(components.flatMap((item) => {
    const value = item.scope_category_id ?? item.category_id;
    return value ? [[value, { value, label: categoryLabels.get(value) ?? "Unmapped category" }] as const] : [];
  })).values()];
  return {
    items: matching.slice(start, start + limit), total: matching.length,
    filter: <ListFilters controls={controls} label="Search configured components"
      facets={[{ key: "category_id", label: "Category", options }]} />,
    pagination: <ListPagination controls={controls} meta={meta} />,
  };
}
