import { useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function ComponentRequirementForm({ initial, testTypes, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || { label: "", test_id: "" });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input label="Requirement Label" value={form.label} onChange={f("label")} required />
      <Input
        label="Test Type"
        value={form.test_id}
        onChange={f("test_id")}
        options={testTypes.map(testType => ({ value: testType.test_id, label: testType.test_name }))}
        required
      />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Requirement"}
        </Button>
      </div>
    </div>
  );
}

export default ComponentRequirementForm;
