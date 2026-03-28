import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import StatusBadge from "../../components/ui/StatusBadge";
import Table from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { useConfirm } from "../../hooks/useConfirm";
import { formatDate } from "../../utils/format";

function UsersPage() {
  const api = useApi();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "USER" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/users?page=${p}&limit=20`, { signal: opts.signal });
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

  const openCreate = () => { setForm({ first_name: "", last_name: "", email: "", password: "", role: "USER" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ first_name: row.first_name, last_name: row.last_name, email: row.email, role: row.role }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/register", form);
      else await api.put(`/updateuser/${selected.user_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this user?"))) return;
    await api.del(`/deleteuser/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Users" subtitle={`${meta?.total || 0} system users`}
        action={<Button variant="primary" onClick={openCreate}>+ Register User</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "user_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "first_name", label: "First Name" },
            { key: "last_name", label: "Last Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", render: v => <StatusBadge status={v} /> },
            { key: "created_at", label: "Joined", render: v => formatDate(v) },
            { key: "user_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )}
          ]}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "Register User" : "Edit User"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="First Name" value={form.first_name} onChange={v => setForm(p => ({ ...p, first_name: v }))} required />
            <Input label="Last Name" value={form.last_name} onChange={v => setForm(p => ({ ...p, last_name: v }))} required />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
          {modal === "create" && <Input label="Password" type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} required />}
          <Input label="Role" value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={[{value:"ADMIN",label:"Admin"},{value:"USER",label:"User"}]} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : (modal === "create" ? "Register" : "Save")}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

export default UsersPage;

