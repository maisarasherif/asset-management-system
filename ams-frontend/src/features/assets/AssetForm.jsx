import { useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function AssetForm({
  initial,
  onSubmit,
  onClose,
  submitting = false,
  templateOptions = [],
  templateMode = "hidden",
  templateName = "",
  submitLabel = "Save Asset",
}) {
  const [form, setForm] = useState(initial || {
    name: "",
    description: "",
    status: "ACTIVE",
    location: "",
    assigned_project: "",
    photo: "",
    datasheet: "",
    template_id: "",
  });

  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {templateMode === "select" && (
        <Input
          label="Template"
          value={form.template_id || ""}
          onChange={f("template_id")}
          options={templateOptions.map(template => ({ value: template.template_id, label: template.name }))}
        />
      )}

      {templateMode === "locked" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Template</label>
          <div style={{
            width: "100%",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "8px 10px",
            color: "var(--text-0)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}>{templateName || "Selected Template"}</div>
        </div>
      )}

      <Input label="Name" value={form.name} onChange={f("name")} required />
      <Input label="Status" value={form.status} onChange={f("status")} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }, { value: "MAINTENANCE", label: "Maintenance" }]} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Location" value={form.location} onChange={f("location")} />
        <Input label="Assigned Project" value={form.assigned_project} onChange={f("assigned_project")} />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Photo URL" value={form.photo} onChange={f("photo")} />
        <Input label="Datasheet URL" value={form.datasheet} onChange={f("datasheet")} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export default AssetForm;
