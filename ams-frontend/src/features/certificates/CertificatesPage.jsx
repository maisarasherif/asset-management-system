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
import CertificateForm from "./CertificateForm";

function CertificatesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [components, setComponents] = useState([]);
  const [testTypes, setTestTypes] = useState([]);
  const [requirements, setRequirements] = useState([]);

  const deriveStatusFromExpiry = useCallback((expiryDateValue) => {
    if (!expiryDateValue) return "VALID";
    const parsed = new Date(expiryDateValue);
    if (Number.isNaN(parsed.getTime())) return "VALID";
    const days = Math.floor((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "EXPIRED";
    if (days <= 30) return "EXPIRING_SOON";
    return "VALID";
  }, []);

  const load = useCallback(async (p = 1, opts = { silent: false, signal: null }) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get(`/certificates?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally {
      if (!opts.signal?.aborted) {
        if (opts.silent) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get("/components?limit=200", { signal: controller.signal }),
      api.get("/test-types", { signal: controller.signal }),
    ]).then(async ([componentsRes, testTypesRes]) => {
      if (controller.signal.aborted) return;
      const componentsData = componentsRes?.data || [];
      setComponents(componentsData);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
      const requirementResponses = await Promise.all(
        componentsData.map(component => api.get(`/component/${component.component_id}/requirements`, { signal: controller.signal, silentError: true }))
      );
      if (!controller.signal.aborted) {
        setRequirements(requirementResponses.flatMap(response => response || []));
      }
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setActionError("");
    setSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      certificate_id: tempId,
      component_id: form.component_id,
      certificate_name: form.certificate_name,
      issuing_authority: form.issuing_authority,
      expiry_date: new Date(form.expiry_date).toISOString(),
      status: deriveStatusFromExpiry(form.expiry_date),
    };

    // Close immediately so the action feels responsive.
    setModal(null);
    setData(prev => [optimistic, ...prev.filter(r => r.certificate_id !== tempId)].slice(0, 20));
    setMeta(prev => prev
      ? { ...prev, total: (prev.total || 0) + 1 }
      : { page, total_pages: 1, total: 1 }
    );

    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      const created = await api.post("/addcertificate", payload);
      setData(prev => [created, ...prev.filter(r => r.certificate_id !== tempId && r.certificate_id !== created?.certificate_id)].slice(0, 20));
    } catch (e) {
      setData(prev => prev.filter(r => r.certificate_id !== tempId));
      setMeta(prev => prev ? { ...prev, total: Math.max(0, (prev.total || 1) - 1) } : prev);
      setActionError(e?.message || "Failed to add certificate.");
    } finally {
      setSubmitting(false);
      load(page, { silent: true });
    }
  };
  const handleUpdate = async (form) => {
    setActionError("");
    setSubmitting(true);
    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      await api.put(`/updatecertificate/${selected.certificate_id}`, payload);
      setModal(null);
      load(page, { silent: true });
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    setActionError("");
    if (!(await confirmAction("Delete this certificate?"))) return;
    try {
      await api.del(`/deletecertificate/${id}`);
      load(page, { silent: true });
    } catch (e) {
      setActionError(e?.message || "Failed to delete certificate.");
    }
  };

  return (
    <div className="fade-in">
      <PageHeader title="Certificates" subtitle={`${meta?.total || 0} compliance certificates`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Certificate</Button>} />
      {actionError && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--red)" }}>{actionError}</div>}
      {refreshing && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--text-2)" }}>Refreshing list...</div>}
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "certificate_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v}</span> },
            { key: "certificate_name", label: "Certificate", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "component_id", label: "Component" },
            { key: "issuing_authority", label: "Authority" },
            { key: "expiry_date", label: "Expiry", render: v => <span style={{ fontFamily: "var(--font-mono)" }}>{formatDate(v)}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            isAdmin ? { key: "certificate_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal === "create" && <Modal title="New Certificate" onClose={() => setModal(null)} width={600}>
        <CertificateForm components={components} testTypes={testTypes} requirements={requirements} onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Certificate" onClose={() => { setModal(null); setSelected(null); }} width={600}>
        <CertificateForm initial={{ ...selected, issue_date: selected.issue_date?.slice(0,10), expiry_date: selected.expiry_date?.slice(0,10) }} components={components} testTypes={testTypes} requirements={requirements} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

export default CertificatesPage;

