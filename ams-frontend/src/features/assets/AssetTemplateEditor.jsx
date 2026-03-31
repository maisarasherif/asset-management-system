import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function makeClientId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyRequirement() {
  return {
    _key: makeClientId("req"),
    template_requirement_id: "",
    test_id: "",
    label: "",
  };
}

function emptyComponent() {
  return {
    _key: makeClientId("cmp"),
    template_component_id: "",
    name: "",
    serial_number: "",
    manufacturer: "",
    description: "",
    equipment_type: "",
    structure: "",
    model: "",
    class: "",
    class_code: "",
    safety_critical: "NO",
    requirements: [],
  };
}

function emptyCategory() {
  return {
    _key: makeClientId("cat"),
    template_category_id: "",
    category_id: "",
    components: [],
  };
}

function normalizeTemplate(template) {
  if (!template) return { name: "", categories: [] };
  return {
    name: template.name || "",
    categories: (template.categories || []).map(category => ({
      _key: category.template_category_id || makeClientId("cat"),
      template_category_id: category.template_category_id || "",
      category_id: category.category_id || "",
      components: (category.components || []).map(component => ({
        _key: component.template_component_id || makeClientId("cmp"),
        template_component_id: component.template_component_id || "",
        name: component.name || "",
        serial_number: component.serial_number || "",
        manufacturer: component.manufacturer || "",
        description: component.description || "",
        equipment_type: component.equipment_type || "",
        structure: component.structure || "",
        model: component.model || "",
        class: component.class || "",
        class_code: component.class_code || "",
        safety_critical: component.safety_critical || "NO",
        requirements: (component.requirements || []).map(requirement => ({
          _key: requirement.template_requirement_id || makeClientId("req"),
          template_requirement_id: requirement.template_requirement_id || "",
          test_id: requirement.test_id || "",
          label: requirement.label || "",
        })),
      })),
    })),
  };
}

function AssetTemplateEditor({ initialTemplate, categories, testTypes, onSubmit, onCancel, submitting = false }) {
  const [form, setForm] = useState(() => normalizeTemplate(initialTemplate));

  useEffect(() => {
    setForm(normalizeTemplate(initialTemplate));
  }, [initialTemplate]);

  const updateCategory = (categoryIndex, updater) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.map((category, idx) => (
        idx === categoryIndex ? updater(category) : category
      )),
    }));
  };

  const updateComponent = (categoryIndex, componentIndex, updater) => {
    updateCategory(categoryIndex, category => ({
      ...category,
      components: category.components.map((component, idx) => (
        idx === componentIndex ? updater(component) : component
      )),
    }));
  };

  const updateRequirement = (categoryIndex, componentIndex, requirementIndex, updater) => {
    updateComponent(categoryIndex, componentIndex, component => ({
      ...component,
      requirements: component.requirements.map((requirement, idx) => (
        idx === requirementIndex ? updater(requirement) : requirement
      )),
    }));
  };

  const categoryOptions = categories.map(category => ({ value: category.category_id, label: category.category_name }));
  const testTypeOptions = testTypes.map(testType => ({ value: testType.test_id, label: testType.test_name }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Input label="Template Name" value={form.name} onChange={(value) => setForm(prev => ({ ...prev, name: value }))} required />

      {form.categories.map((category, categoryIndex) => (
        <div key={category._key} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 14, display: "flex", flexDirection: "column", gap: 14, background: "var(--bg-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Input
                label={`Category ${categoryIndex + 1}`}
                value={category.category_id}
                onChange={(value) => updateCategory(categoryIndex, current => ({ ...current, category_id: value }))}
                options={categoryOptions}
                required
              />
            </div>
            <Button variant="danger" onClick={() => setForm(prev => ({ ...prev, categories: prev.categories.filter((_, idx) => idx !== categoryIndex) }))} disabled={submitting}>Remove</Button>
          </div>

          {category.components.map((component, componentIndex) => (
            <div key={component._key} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 14, background: "var(--bg-1)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700 }}>
                  Component {componentIndex + 1}
                </div>
                <Button variant="danger" size="sm" onClick={() => updateCategory(categoryIndex, current => ({ ...current, components: current.components.filter((_, idx) => idx !== componentIndex) }))} disabled={submitting}>Remove</Button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="Name" value={component.name} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, name: value }))} required />
                <Input label="Serial Number" value={component.serial_number} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, serial_number: value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="Manufacturer" value={component.manufacturer} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, manufacturer: value }))} />
                <Input label="Model" value={component.model} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, model: value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Input label="Equipment Type" value={component.equipment_type} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, equipment_type: value }))} />
                <Input label="Structure" value={component.structure} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, structure: value }))} />
                <Input label="Class" value={component.class} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, class: value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="Class Code" value={component.class_code} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, class_code: value }))} />
                <Input label="Safety Critical" value={component.safety_critical} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, safety_critical: value }))} options={[{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }]} required />
              </div>
              <Input label="Description" type="textarea" value={component.description} onChange={(value) => updateComponent(categoryIndex, componentIndex, current => ({ ...current, description: value }))} />

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Test Requirements</div>
                {component.requirements.map((requirement, requirementIndex) => (
                  <div key={requirement._key} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 12, background: "var(--bg-2)", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
                    <Input label="Label" value={requirement.label} onChange={(value) => updateRequirement(categoryIndex, componentIndex, requirementIndex, current => ({ ...current, label: value }))} required />
                    <Input label="Test Type" value={requirement.test_id} onChange={(value) => updateRequirement(categoryIndex, componentIndex, requirementIndex, current => ({ ...current, test_id: value }))} options={testTypeOptions} required />
                    <Button variant="danger" size="sm" onClick={() => updateComponent(categoryIndex, componentIndex, current => ({ ...current, requirements: current.requirements.filter((_, idx) => idx !== requirementIndex) }))} disabled={submitting}>Remove</Button>
                  </div>
                ))}
                <Button onClick={() => updateComponent(categoryIndex, componentIndex, current => ({ ...current, requirements: [...current.requirements, emptyRequirement()] }))} disabled={submitting}>+ Add Requirement</Button>
              </div>
            </div>
          ))}

          <Button variant="primary" onClick={() => updateCategory(categoryIndex, current => ({ ...current, components: [...current.components, emptyComponent()] }))} disabled={submitting}>+ Add Component</Button>
        </div>
      ))}

      <Button onClick={() => setForm(prev => ({ ...prev, categories: [...prev.categories, emptyCategory()] }))} disabled={submitting}>+ Add Category</Button>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button onClick={onCancel} disabled={submitting}>Back</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}

export default AssetTemplateEditor;
