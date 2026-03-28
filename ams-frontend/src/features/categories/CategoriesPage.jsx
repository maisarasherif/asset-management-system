import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import Table from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirm } from "../../hooks/useConfirm";
import { formatDate } from "../../utils/format";

function CategoriesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ category_name: "", description: "" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/categories?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const openCreate = () => { setForm({ category_name: "", description: "" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ category_name: row.category_name, description: row.description }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addcategory", form);
      else await api.put(`/updatecategory/${selected.category_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this category?"))) return;
    await api.del(`/deletecategory/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Categories" subtitle="Component classification taxonomy"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Category</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "category_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "category_name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "description", label: "Description" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "category_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "New Category" : "Edit Category"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Category Name" value={form.category_name} onChange={v => setForm(p => ({ ...p, category_name: v }))} required />
          <Input label="Description" type="textarea" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

export default CategoriesPage;

