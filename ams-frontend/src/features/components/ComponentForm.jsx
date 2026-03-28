import { useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function ComponentForm({ initial, assets, categories, onSubmit, onClose, submitting = false }) {
  const baseForm = { asset_id: "", category_id: "", name: "", serial_number: "", manufacturer: "", description: "", equipment_type: "", structure: "", model: "", class: "", class_code: "", safety_critical: "NO" };
  const [form, setForm] = useState({ ...baseForm, ...(initial || {}) });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Asset" value={form.asset_id} onChange={f("asset_id")} options={assets.map(a => ({ value: a.asset_id, label: a.name }))} required />
        <Input label="Category" value={form.category_id} onChange={f("category_id")} options={categories.map(c => ({ value: c.category_id, label: c.category_name }))} required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Name" value={form.name} onChange={f("name")} required />
        <Input label="Serial Number" value={form.serial_number} onChange={f("serial_number")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Manufacturer" value={form.manufacturer} onChange={f("manufacturer")} />
        <Input label="Model" value={form.model} onChange={f("model")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Equipment Type" value={form.equipment_type} onChange={f("equipment_type")} />
        <Input label="Structure" value={form.structure} onChange={f("structure")} />
        <Input label="Class" value={form.class} onChange={f("class")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Class Code" value={form.class_code} onChange={f("class_code")} />
        <Input label="Safety Critical" value={form.safety_critical} onChange={f("safety_critical")} options={[{value:"YES",label:"Yes — Safety Critical"},{value:"NO",label:"No — Standard"}]} required />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Component"}
        </Button>
      </div>
    </div>
  );
}

export default ComponentForm;

