import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import StatusBadge from "../../components/ui/StatusBadge";
import Table from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirm } from "../../hooks/useConfirm";
import { formatDate } from "../../utils/format";
import AssetForm from "./AssetForm";

function AssetsPage() {
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

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/assets?page=${p}&limit=20`, { signal: opts.signal });
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

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addasset", form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updateasset/${selected.asset_id}`, form);
      setModal(null);
      setSelected(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this asset?"))) return;
    await api.del(`/deleteasset/${id}`); load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle={`${meta?.total || 0} registered assets`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Asset</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "asset_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{v}</span> },
            { key: "name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            { key: "location", label: "Location" },
            { key: "assigned_project", label: "Project" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "asset_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>

      {modal === "create" && <Modal title="New Asset" onClose={() => setModal(null)}>
        <AssetForm onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Asset" onClose={() => { setModal(null); setSelected(null); }}>
        <AssetForm initial={selected} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

export default AssetsPage;

