import { PagedSelect } from "./PagedSelect";
import { searchActiveCompetentPersons } from "../../lib/api/ams";
import type { CompetentPerson } from "../../types/ams";

const toOption = (person: CompetentPerson) => ({
  value: person.competent_person_id,
  label: person.full_name,
  description: person.organization || person.competency_category_name,
});

export function CompetentPersonPicker({ categories, person, onSelect, disabled }: {
  categories: readonly string[];
  person: CompetentPerson | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const categoryIds = [...categories].sort().join(",");
  return <PagedSelect label="Competent Person" placeholder="Select competent person"
    queryKey={["competent-persons", "eligible-picker", categoryIds]}
    load={(page, search) => searchActiveCompetentPersons({ page, limit: 20, search, category_ids: categoryIds })}
    selected={person ? toOption(person) : null} getOption={toOption} disabled={disabled}
    onSelect={(option) => onSelect(option?.value ?? "")} />;
}
