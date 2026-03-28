import { useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function CertificateForm({ initial, components, testTypes, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || {
    component_id: "", certificate_name: "", issue_date: "", expiry_date: "",
    issuing_authority: "", test_id: "", imca_ref: "", imca_d018: "", maintenance_notes: ""
  });
  const componentOptions = useMemo(
    () => components.map(c => ({ value: c.component_id, label: c.name })),
    [components]
  );
  const testTypeOptions = useMemo(
    () => testTypes.map(t => ({ value: t.test_id, label: t.test_name })),
    [testTypes]
  );
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Component" value={form.component_id} onChange={f("component_id")} options={componentOptions} required />
        <Input label="Test Type" value={form.test_id} onChange={f("test_id")} options={testTypeOptions} required />
      </div>
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

