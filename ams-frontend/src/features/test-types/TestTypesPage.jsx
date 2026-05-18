import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Table from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirm } from "../../hooks/useConfirm";

const EMPTY_FORM = { test_id: "", test_name: "", validity_duration: "", description: "" };
const actionGroupStyle = { display: "inline-flex", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap" };

function TestTypeModalForm({ mode, initialForm, submitting, onClose, onSave }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  return (
    <Modal title={mode === "create" ? "New Test Type" : "Edit Test Type"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {mode === "create" && <Input label="Test ID" value={form.test_id} onChange={(v) => setForm((p) => ({ ...p, test_id: v }))} required />}
        <Input label="Test Name" value={form.test_name} onChange={(v) => setForm((p) => ({ ...p, test_name: v }))} required />
        <Input label="Validity Duration (months)" type="number" value={String(form.validity_duration ?? "")} onChange={(v) => setForm((p) => ({ ...p, validity_duration: v }))} required />
        <Input label="Description" type="textarea" value={form.description} onChange={(v) => setForm((p) => ({ ...p, description: v }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(form)} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TestTypesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [draftForm, setDraftForm] = useState(EMPTY_FORM);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/test-types", { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res?.data || res || []);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally {
      if (!opts.signal?.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const openCreate = () => {
    setSelected(null);
    setDraftForm(EMPTY_FORM);
    setModal("create");
  };

  const openEdit = (row) => {
    setSelected(row);
    setDraftForm({
      test_id: row.test_id,
      test_name: row.test_name,
      validity_duration: row.validity_duration,
      description: row.description,
    });
    setModal("edit");
  };

  const handleSave = async (form) => {
    const payload = {
      ...form,
      validity_duration: Number.parseInt(form.validity_duration, 10),
    };

    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addtesttype", payload);
      else await api.put(`/updatetesttype/${selected.test_id}`, payload);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this test type?"))) return;
    await api.del(`/deletetesttype/${id}`);
    load();
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Test Types"
        subtitle="Certificate test type definitions"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Test Type</Button>}
      />
      <Card>
        <Table
          loading={loading}
          data={data}
          columns={[
            { key: "test_id", label: "ID", render: (v) => <span style={{ color: "var(--text-2)" }}>{v}</span> },
            { key: "test_name", label: "Name", render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "validity_duration", label: "Validity (months)", render: (v) => <span style={{ color: "var(--amber)" }}>{v}m</span> },
            { key: "description", label: "Description" },
            isAdmin ? {
              key: "test_id",
              label: "",
              render: (v, row) => (
                <div style={actionGroupStyle}>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
                </div>
              ),
              style: { width: 1, whiteSpace: "nowrap" },
              headerStyle: { width: 1 },
            } : null,
          ].filter(Boolean)}
        />
      </Card>
      {modal && (
        <TestTypeModalForm
          mode={modal}
          initialForm={draftForm}
          submitting={submitting}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default TestTypesPage;
