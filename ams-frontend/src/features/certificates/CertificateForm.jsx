import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function CertificateForm({ initial, components, testTypes, requirements = [], onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || {
    component_id: "",
    requirement_id: "",
    certificate_name: "",
    issue_date: "",
    expiry_date: "",
    issuing_authority: "",
    test_id: "",
    imca_ref: "",
    imca_d018: "",
    maintenance_notes: "",
  });

  const componentOptions = useMemo(
    () => components.map(component => ({ value: component.component_id, label: component.name })),
    [components],
  );

  const testTypeOptions = useMemo(
    () => testTypes.map(testType => ({ value: testType.test_id, label: testType.test_name })),
    [testTypes],
  );

  const requirementsForComponent = useMemo(
    () => requirements.filter(requirement => requirement.component_id === form.component_id),
    [requirements, form.component_id],
  );

  const selectedRequirement = useMemo(
    () => requirementsForComponent.find(requirement => requirement.requirement_id === form.requirement_id) || null,
    [requirementsForComponent, form.requirement_id],
  );

  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (requirementsForComponent.length === 0) {
      if (form.requirement_id) {
        setForm(prev => ({ ...prev, requirement_id: "" }));
      }
      return;
    }

    const matchesCurrentRequirement = requirementsForComponent.some(requirement => requirement.requirement_id === form.requirement_id);
    if (!matchesCurrentRequirement) {
      setForm(prev => ({
        ...prev,
        requirement_id: requirementsForComponent[0]?.requirement_id || "",
      }));
    }
  }, [requirementsForComponent, form.requirement_id]);

  useEffect(() => {
    if (selectedRequirement) {
      setForm(prev => ({ ...prev, test_id: selectedRequirement.test_id }));
    }
  }, [selectedRequirement]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Component" value={form.component_id} onChange={f("component_id")} options={componentOptions} required />
        {requirementsForComponent.length > 0 ? (
          <Input
            label="Requirement"
            value={form.requirement_id}
            onChange={f("requirement_id")}
            options={requirementsForComponent.map(requirement => ({ value: requirement.requirement_id, label: `${requirement.label} — ${requirement.test_name}` }))}
            required
          />
        ) : (
          <Input label="Test Type" value={form.test_id} onChange={f("test_id")} options={testTypeOptions} required />
        )}
      </div>

      {requirementsForComponent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Test Type</label>
          <div style={{
            width: "100%",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "8px 10px",
            color: "var(--text-0)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}>{selectedRequirement ? `${selectedRequirement.test_name} (${selectedRequirement.label})` : "Select a requirement"}</div>
        </div>
      )}

      <Input label="Certificate Name" value={form.certificate_name} onChange={f("certificate_name")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Issue Date" type="date" value={form.issue_date} onChange={f("issue_date")} required />
        <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={f("expiry_date")} required />
      </div>
      <Input label="Issuing Authority" value={form.issuing_authority} onChange={f("issuing_authority")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="IMCA Ref" value={form.imca_ref} onChange={f("imca_ref")} />
        <Input label="IMCA D018" value={form.imca_d018} onChange={f("imca_d018")} />
      </div>
      <Input label="Maintenance Notes" type="textarea" value={form.maintenance_notes} onChange={f("maintenance_notes")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Certificate"}
        </Button>
      </div>
    </div>
  );
}

export default CertificateForm;
