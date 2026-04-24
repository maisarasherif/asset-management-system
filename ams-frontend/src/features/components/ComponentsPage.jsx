import { useCallback, useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../../constants";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirm } from "../../hooks/useConfirm";
import { useFeedback } from "../../hooks/useFeedback";
import { formatDate } from "../../utils/format";
import CertificateForm from "../certificates/CertificateForm";
import ComponentForm from "./ComponentForm";

function ComponentsPage({ selectedAssetId, initialComponentId, onBackToAssets }) {
  const api = useApi();
  const { user, isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const { notifyInfo, notifyError } = useFeedback();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [certificatesByComponent, setCertificatesByComponent] = useState({});
  const [certificatesLoadingByComponent, setCertificatesLoadingByComponent] = useState({});
  const [certificatesErrorByComponent, setCertificatesErrorByComponent] = useState({});
  const [uploadBusyByCertificate, setUploadBusyByCertificate] = useState({});
  const [uploadAuditByCertificate, setUploadAuditByCertificate] = useState({});
  const [uploadAuditLoadingByCertificate, setUploadAuditLoadingByCertificate] = useState({});
  const [uploadAuditErrorByCertificate, setUploadAuditErrorByCertificate] = useState({});
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [certModal, setCertModal] = useState(null); // "add"
  const [testTypes, setTestTypes] = useState([]);
  const [expandedCertId, setExpandedCertId] = useState(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const [componentsRes, assetsRes, categoriesRes, testTypesRes] = await Promise.all([
        api.get("/components?page=1&limit=500", { signal: opts.signal }),
        api.get("/assets?limit=200", { signal: opts.signal }),
        api.get("/categories?limit=200", { signal: opts.signal }),
        api.get("/test-types", { signal: opts.signal }),
      ]);
      if (opts.signal?.aborted) return;
      const componentsData = componentsRes?.data || [];
      const assetsData = assetsRes?.data || [];
      setData(componentsData);
      setAssets(assetsData);
      setCategories(categoriesRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addcomponent", form);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updatecomponent/${selected.component_id}`, form);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id, clearSelection = false) => {
    if (!(await confirmAction("Delete this component?"))) return;
    await api.del(`/deletecomponent/${id}`);
    if (clearSelection) setSelectedComponentId("");
    load();
  };

  const loadCertificatesForComponent = useCallback(async (componentID) => {
    setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: true }));
    setCertificatesErrorByComponent(prev => ({ ...prev, [componentID]: "" }));
    try {
      const res = await api.get(`/certificates/component/${componentID}?page=1&limit=100`);
      setCertificatesByComponent(prev => ({ ...prev, [componentID]: res?.data || [] }));
    } catch (e) {
      setCertificatesErrorByComponent(prev => ({ ...prev, [componentID]: e?.message || "Failed to load certificates." }));
    } finally {
      setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: false }));
    }
  }, [api]);

  const loadCertificateUploadAudit = useCallback(async (certificateID) => {
    setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: true }));
    setUploadAuditErrorByCertificate(prev => ({ ...prev, [certificateID]: "" }));
    try {
      const res = await api.get(`/certificate/${certificateID}/uploads?page=1&limit=25`);
      setUploadAuditByCertificate(prev => ({ ...prev, [certificateID]: res?.data || [] }));
    } catch (e) {
      setUploadAuditErrorByCertificate(prev => ({ ...prev, [certificateID]: e?.message || "Failed to load upload audit log." }));
    } finally {
      setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: false }));
    }
  }, [api]);

  const handleCertCreate = async (form) => {
    setSubmitting(true);
    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      await api.post("/addcertificate", payload);
      setCertModal(null);
      setCertificatesByComponent(prev => { const n = { ...prev }; delete n[selectedComponentId]; return n; });
      loadCertificatesForComponent(selectedComponentId);
    } catch (e) {
      // error already toasted by api layer
    } finally {
      setSubmitting(false);
    }
  };

  const componentsForAsset = useMemo(
    () => data.filter(c => c.asset_id === selectedAssetId),
    [data, selectedAssetId]
  );

  useEffect(() => {
    if (!selectedAssetId) return;
    if (componentsForAsset.length === 0) {
      setSelectedComponentId("");
      return;
    }
    const exists = componentsForAsset.some(c => c.component_id === selectedComponentId);
    if (!exists) {
      const preferred = initialComponentId && componentsForAsset.some(c => c.component_id === initialComponentId)
        ? initialComponentId
        : componentsForAsset[0].component_id;
      setSelectedComponentId(preferred);
      setExpandedCertId(null);
    }
  }, [selectedAssetId, componentsForAsset, selectedComponentId, initialComponentId]);

  useEffect(() => {
    if (!selectedComponentId) return;
    if (!certificatesByComponent[selectedComponentId] && !certificatesLoadingByComponent[selectedComponentId]) {
      loadCertificatesForComponent(selectedComponentId);
    }
  }, [selectedComponentId, certificatesByComponent, certificatesLoadingByComponent, loadCertificatesForComponent]);

  useEffect(() => {
    if (componentsForAsset.length === 0) return;
    componentsForAsset.forEach(c => {
      if (!certificatesByComponent[c.component_id] && !certificatesLoadingByComponent[c.component_id]) {
        loadCertificatesForComponent(c.component_id);
      }
    });
  }, [componentsForAsset, certificatesByComponent, certificatesLoadingByComponent, loadCertificatesForComponent]);

  const selectedAsset = useMemo(
    () => assets.find(a => a.asset_id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const selectedComponent = useMemo(
    () => componentsForAsset.find(c => c.component_id === selectedComponentId) || null,
    [componentsForAsset, selectedComponentId]
  );

  const currentCertificates = useMemo(
    () => certificatesByComponent[selectedComponentId] || [],
    [certificatesByComponent, selectedComponentId]
  );

  const selectedCertificateNames = useMemo(
    () => currentCertificates.map(cert => cert.certificate_name || cert.certificate_id || "Unnamed certificate"),
    [currentCertificates]
  );

  const assetPhoto = selectedAsset?.photo?.trim() || "";

  // Load audit for ALL certificates of this component
  useEffect(() => {
    currentCertificates.forEach(cert => {
      const certID = cert.certificate_id;
      if (!certID) return;
      if (!uploadAuditByCertificate[certID] && !uploadAuditLoadingByCertificate[certID]) {
        loadCertificateUploadAudit(certID);
      }
    });
    // Auto-expand first cert if nothing is expanded yet
    if (currentCertificates.length > 0 && !expandedCertId) {
      setExpandedCertId(currentCertificates[0].certificate_id);
    }
  }, [currentCertificates, uploadAuditByCertificate, uploadAuditLoadingByCertificate, loadCertificateUploadAudit]);

  const getComponentBadge = useCallback((componentID) => {
    const certs = certificatesByComponent[componentID] || [];
    const latest = certs[0];
    if (!latest) return { label: "No Cert", cls: "dim" };
    if (latest.status === "EXPIRED") return { label: "Expired", cls: "red" };
    if (latest.status === "EXPIRING_SOON") return { label: "Due Soon", cls: "amber" };
    if (latest.status === "VALID") return { label: "OK", cls: "green" };
    return { label: "No Cert", cls: "dim" };
  }, [certificatesByComponent]);

  const expiryToneClass = useCallback((cert) => {
    if (!cert?.expiry_date) return "";
    const expiryDate = new Date(cert.expiry_date);
    if (Number.isNaN(expiryDate.getTime())) return "";
    const days = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "expired";
    if (days <= 30) return "warning";
    return "";
  }, []);

  const viewCertificateFile = useCallback(async (certificateID) => {
    try {
      const res = await api.get(`/certificate/${certificateID}/file`);
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        notifyError("Certificate file URL is not available.");
      }
    } catch (e) {
      notifyError(e?.message || "Failed to open certificate file.");
    }
  }, [api, notifyError]);

  const uploadCertificateFile = useCallback(async (componentID, certificateID, file) => {
    if (!file) return;

    if (!user?.token) {
      notifyError("Your session has expired. Please sign in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadBusyByCertificate(prev => ({ ...prev, [certificateID]: true }));
    try {
      const response = await fetch(`${BASE_URL}/certificate/${certificateID}/file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });

      let payload = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `Upload failed (${response.status})`);
      }

      notifyInfo(payload?.message || "Certificate file uploaded.");
      await Promise.all([
        loadCertificatesForComponent(componentID),
        loadCertificateUploadAudit(certificateID),
      ]);
    } catch (e) {
      notifyError(e?.message || "Failed to upload certificate file.");
    } finally {
      setUploadBusyByCertificate(prev => ({ ...prev, [certificateID]: false }));
    }
  }, [user?.token, notifyError, notifyInfo, loadCertificatesForComponent, loadCertificateUploadAudit]);

  const handleCertificateUploadClick = useCallback((componentID, certificateID) => {
    if (!isAdmin) return;
    if (!certificateID) {
      notifyError("No certificate record found for this component.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/jpeg,image/png,image/webp";
    input.onchange = () => {
      const selectedFile = input.files?.[0];
      if (selectedFile) uploadCertificateFile(componentID, certificateID, selectedFile);
    };
    input.click();
  }, [isAdmin, uploadCertificateFile, notifyError]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Components"
        subtitle={selectedAsset ? `${componentsForAsset.length || 0} components in ${selectedAsset.name}` : "Select an asset"}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onBackToAssets}>All Assets</Button>
            {isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Component</Button>}
          </div>
        }
      />
      {loading && <Card style={{ padding: 20, color: "var(--text-2)", fontSize: 12 }}>Loading components...</Card>}
      {!loading && (
        <div className="comp-layout">
          <aside className="comp-nav">
            <div className="comp-nav-head">
              <div className="comp-nav-label">Components</div>
              <div className="comp-nav-count">{componentsForAsset.length}</div>
            </div>
            <div className="comp-nav-list">
              {componentsForAsset.map(component => {
                const badge = getComponentBadge(component.component_id);
                return (
                  <button key={component.component_id} className={`comp-nav-item ${selectedComponentId === component.component_id ? "active" : ""}`} onClick={() => setSelectedComponentId(component.component_id)}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{component.name}</span>
                    <span className={`comp-badge ${badge.cls}`}>{badge.label}</span>
                  </button>
                );
              })}
              {componentsForAsset.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No components in this asset.</div>}
            </div>
          </aside>

          <section className="comp-asset-panel">
            <Card className="comp-asset-card">
              <div className="comp-asset-shell">
                <div className="comp-asset-summary">
                  <div className="comp-asset-summary-head">
                    <div className="comp-asset-eyebrow">Asset details</div>
                    <div className="comp-asset-title">{selectedAsset?.name || "No asset selected"}</div>
                    <div className="comp-asset-subtitle">
                      {selectedAsset?.description || "Select an asset to review its components, status, and certification activity."}
                    </div>
                  </div>
                  <div className="comp-asset-facts">
                    <div className="comp-asset-fact">
                      <span className="comp-asset-fact-label">Status</span>
                      <span className="comp-asset-fact-value">
                        {selectedAsset?.status ? <StatusBadge status={selectedAsset.status} /> : "N/A"}
                      </span>
                    </div>
                    <div className="comp-asset-fact">
                      <span className="comp-asset-fact-label">Assigned project</span>
                      <span className="comp-asset-fact-value">{selectedAsset?.assigned_project || "Unassigned"}</span>
                    </div>
                    <div className="comp-asset-fact">
                      <span className="comp-asset-fact-label">Components</span>
                      <span className="comp-asset-fact-value">{componentsForAsset.length}</span>
                    </div>
                    <div className="comp-asset-fact">
                      <span className="comp-asset-fact-label">Selected certificates</span>
                      <span className="comp-asset-fact-value">{currentCertificates.length}</span>
                    </div>
                    <div className="comp-asset-fact">
                      <span className="comp-asset-fact-label">Location</span>
                      <span className="comp-asset-fact-value">{selectedAsset?.location || "Not set"}</span>
                    </div>
                    <div className="comp-asset-fact comp-asset-fact-list">
                      <span className="comp-asset-fact-label">Selected certificates</span>
                      <div className="comp-asset-cert-list">
                        {selectedCertificateNames.length > 0 ? selectedCertificateNames.map(name => (
                          <span key={name} className="comp-asset-cert-chip">{name}</span>
                        )) : <span className="comp-asset-muted">No certificates on the selected component.</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="comp-asset-media">
                  {assetPhoto ? (
                    <img src={assetPhoto} alt={`${selectedAsset?.name || "Asset"} photo`} className="comp-asset-photo" />
                  ) : (
                    <div className="comp-asset-photo comp-asset-photo-placeholder">
                      <div className="comp-asset-photo-label">No photo</div>
                      <div className="comp-asset-photo-copy">Add a photo URL on the asset record to show the image here.</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </section>

          <section className="comp-content">
            {certificatesErrorByComponent[selectedComponentId] && (
              <Card style={{ padding: 10, color: "var(--red)", fontSize: 11 }}>
                {certificatesErrorByComponent[selectedComponentId]}
              </Card>
            )}
            {!selectedComponent && <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12 }}>Select a component from the left pane.</Card>}
            {selectedComponent && (
              <>
                <div className="comp-head">
                  <div>
                    <div className="comp-head-kicker">Component modifications and certifications</div>
                    <div className="comp-head-title">{selectedComponent.name}</div>
                    <div className="comp-head-sub">{selectedComponent.manufacturer || "Unknown manufacturer"} · {selectedComponent.model || "Unknown model"} · {selectedComponent.class || "No class"}</div>
                  </div>
                  {isAdmin && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button variant="primary" onClick={() => setCertModal("add")}>+ Add Certificate</Button>
                    <Button onClick={() => { setSelected(selectedComponent); setModal("edit"); }}>Edit Component</Button>
                    <Button variant="danger" onClick={() => handleDelete(selectedComponent.component_id, true)}>Delete</Button>
                  </div>}
                </div>

                <div className="comp-meta">
                  <div className="comp-meta-cell"><div className="comp-meta-label">Component ID</div><div className="comp-meta-value">{selectedComponent.component_id}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Serial</div><div className="comp-meta-value">{selectedComponent.serial_number || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Safety Critical</div><div className="comp-meta-value">{selectedComponent.safety_critical || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Equipment Type</div><div className="comp-meta-value">{selectedComponent.equipment_type || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Structure</div><div className="comp-meta-value">{selectedComponent.structure || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Last Inspection</div><div className="comp-meta-value warning">{currentCertificates[0] ? formatDate(currentCertificates[0].issue_date) : "—"}</div></div>
                </div>

                {certificatesLoadingByComponent[selectedComponentId] && (
                  <Card style={{ padding: 12, color: "var(--text-2)", fontSize: 12 }}>Loading certificates...</Card>
                )}

                {!certificatesLoadingByComponent[selectedComponentId] && currentCertificates.length === 0 && (
                  <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12, textAlign: "center" }}>
                    No certificates linked to this component.
                    {isAdmin && <span> Use <strong>+ Add Certificate</strong> above to add one.</span>}
                  </Card>
                )}

                {currentCertificates.length > 0 && (
                  <div className="cert-editorial-card">
                    {currentCertificates.map((cert, idx) => {
                      const isOpen = expandedCertId === cert.certificate_id;
                      return (
                        <div key={cert.certificate_id} style={{ borderBottom: idx < currentCertificates.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <div
                            className="cert-editorial-header"
                            style={{ cursor: "pointer", userSelect: "none" }}
                            onClick={() => setExpandedCertId(isOpen ? null : cert.certificate_id)}
                          >
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1px",
                              textTransform: "uppercase", padding: "1px 6px", borderRadius: 2,
                              border: "1px solid", marginRight: 6,
                              ...(cert.status === "EXPIRED" ? { color: "var(--red)", borderColor: "var(--red-border)", background: "var(--red-bg)" }
                                : cert.status === "EXPIRING_SOON" ? { color: "var(--amber)", borderColor: "var(--amber-border)", background: "var(--amber-bg)" }
                                : { color: "var(--green)", borderColor: "var(--green-border)", background: "var(--green-bg)" })
                            }}>{cert.status || "VALID"}</span>
                            <span className="cert-editorial-title" style={{ flex: 1 }}>
                              {cert.certificate_name || "Unnamed Certificate"}
                              <span style={{ fontSize: 11, color: "rgba(240,232,216,0.5)", fontFamily: "var(--font-sans)", marginLeft: 8 }}>
                                · expires {formatDate(cert.expiry_date)}
                              </span>
                            </span>
                            {isAdmin && (
                              <button
                                className="btn-upload-editorial"
                                onClick={e => { e.stopPropagation(); handleCertificateUploadClick(selectedComponent.component_id, cert.certificate_id); }}
                                disabled={!!uploadBusyByCertificate[cert.certificate_id]}
                              >
                                {uploadBusyByCertificate[cert.certificate_id] ? "Uploading..." : "Upload File"}
                              </button>
                            )}
                            <button
                              className="btn-view-editorial"
                              onClick={e => { e.stopPropagation(); viewCertificateFile(cert.certificate_id); }}
                              disabled={!cert.certificate_file}
                            >View File</button>
                            <span style={{ color: "rgba(240,232,216,0.6)", fontSize: 14, marginLeft: 8, transition: "transform 0.25s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>v</span>
                          </div>

                          <div className={`cert-accordion-body${isOpen ? " open" : ""}`}>
                            <div className="cert-accordion-inner">
                              <div className="cert-editorial-fields">
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Issued By</div><div className="cert-editorial-value">{cert.issuing_authority || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Certificate No.</div><div className="cert-editorial-value">{cert.certificate_id || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Issue Date</div><div className="cert-editorial-value">{formatDate(cert.issue_date)}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Expiry Date</div><div className={`cert-editorial-value ${expiryToneClass(cert)}`}>{formatDate(cert.expiry_date)}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">IMCA Ref</div><div className="cert-editorial-value">{cert.imca_ref || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">IMCA D018</div><div className="cert-editorial-value">{cert.imca_d018 || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Maintenance Notes</div><div className="cert-editorial-value">{cert.maintenance_notes || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">File</div><div className="cert-editorial-value">{cert.certificate_file || "No file linked."}</div></div>
                              </div>
                              <div className="audit-editorial">
                                <div className="audit-editorial-head"><span className="audit-editorial-title">Upload history</span><span className="audit-editorial-count">{(uploadAuditByCertificate[cert.certificate_id] || []).length} entries</span></div>
                                {uploadAuditLoadingByCertificate[cert.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-2)" }}>Loading audit log...</div>}
                                {uploadAuditErrorByCertificate[cert.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--red)" }}>{uploadAuditErrorByCertificate[cert.certificate_id]}</div>}
                                {!uploadAuditLoadingByCertificate[cert.certificate_id] && !uploadAuditErrorByCertificate[cert.certificate_id] && (
                                  <table className="audit-editorial-table">
                                    <thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>File</th></tr></thead>
                                    <tbody>
                                      {(uploadAuditByCertificate[cert.certificate_id] || []).map((entry, i) => (
                                        <tr key={`${entry.uploaded_at || "u"}-${i}`}>
                                          <td className="audit-mono">{entry.uploaded_at ? new Date(entry.uploaded_at).toLocaleString() : "—"}</td>
                                          <td>{entry.uploaded_by || "Unknown"}</td>
                                          <td><span className="audit-dot" /><span className="audit-pill">Uploaded</span></td>
                                          <td className="audit-mono">{entry.file_name || entry.file_key || "(unknown file)"}</td>
                                        </tr>
                                      ))}
                                      {(uploadAuditByCertificate[cert.certificate_id] || []).length === 0 && <tr><td colSpan={4} style={{ color: "var(--text-2)" }}>No upload history recorded yet.</td></tr>}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {modal === "create" && <Modal title="New Component" onClose={() => setModal(null)} width={640}>
        <ComponentForm
          initial={selectedAssetId ? { asset_id: selectedAssetId, safety_critical: "NO" } : undefined}
          assets={assets}
          categories={categories}
          onSubmit={handleCreate}
          onClose={() => setModal(null)}
          submitting={submitting}
        />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Component" onClose={() => { setModal(null); setSelected(null); }} width={640}>
        <ComponentForm initial={selected} assets={assets} categories={categories} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
      {certModal === "add" && selectedComponent && (
        <Modal title={`Add Certificate — ${selectedComponent.name}`} onClose={() => setCertModal(null)} width={620}>
          <CertificateForm
            initial={{ component_id: selectedComponentId, certificate_name: "", issue_date: "", expiry_date: "", issuing_authority: "", test_id: "", imca_ref: "", imca_d018: "", maintenance_notes: "" }}
            components={data}
            testTypes={testTypes}
            onSubmit={handleCertCreate}
            onClose={() => setCertModal(null)}
            submitting={submitting}
          />
        </Modal>
      )}
    </div>
  );
}

export default ComponentsPage;

