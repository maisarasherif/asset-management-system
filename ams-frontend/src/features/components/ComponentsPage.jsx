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
import ComponentRequirementForm from "./ComponentRequirementForm";
import ComponentForm from "./ComponentForm";

function sortCertificatesNewestFirst(certificates) {
  return [...certificates].sort((left, right) => {
    const leftIssue = new Date(left?.issue_date || 0).getTime();
    const rightIssue = new Date(right?.issue_date || 0).getTime();
    if (rightIssue !== leftIssue) return rightIssue - leftIssue;
    const leftCreated = new Date(left?.created_at || 0).getTime();
    const rightCreated = new Date(right?.created_at || 0).getTime();
    return rightCreated - leftCreated;
  });
}

function getStatusBadge(status) {
  if (status === "EXPIRED") return { label: "Expired", cls: "red" };
  if (status === "EXPIRING_SOON") return { label: "Due Soon", cls: "amber" };
  if (status === "VALID") return { label: "Valid", cls: "green" };
  return { label: "Unknown", cls: "dim" };
}

function ComponentsPage({ selectedAssetId, initialComponentId, onBackToAssets }) {
  const api = useApi();
  const { user, isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const { notifyInfo, notifyError } = useFeedback();
  const [data, setData] = useState([]);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [testTypes, setTestTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [certModal, setCertModal] = useState(null);
  const [requirementModal, setRequirementModal] = useState(null);
  const [selectedRequirement, setSelectedRequirement] = useState(null);
  const [requirementsByComponent, setRequirementsByComponent] = useState({});
  const [requirementsLoadingByComponent, setRequirementsLoadingByComponent] = useState({});
  const [requirementsErrorByComponent, setRequirementsErrorByComponent] = useState({});
  const [certificatesByComponent, setCertificatesByComponent] = useState({});
  const [certificatesLoadingByComponent, setCertificatesLoadingByComponent] = useState({});
  const [certificatesErrorByComponent, setCertificatesErrorByComponent] = useState({});
  const [uploadBusyByCertificate, setUploadBusyByCertificate] = useState({});
  const [uploadAuditByCertificate, setUploadAuditByCertificate] = useState({});
  const [uploadAuditLoadingByCertificate, setUploadAuditLoadingByCertificate] = useState({});
  const [uploadAuditErrorByCertificate, setUploadAuditErrorByCertificate] = useState({});
  const [expandedCertId, setExpandedCertId] = useState(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const [componentsRes, assetsRes, categoriesRes, testTypesRes] = await Promise.all([
        api.get("/components?page=1&limit=500", { signal: opts.signal }),
        api.get("/assets?limit=200", { signal: opts.signal }),
        api.get("/categories?limit=500", { signal: opts.signal }),
        api.get("/test-types", { signal: opts.signal }),
      ]);

      if (opts.signal?.aborted) return;

      setData(componentsRes?.data || []);
      setAssets(assetsRes?.data || []);
      setCategories(categoriesRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    } finally {
      if (!opts.signal?.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const loadRequirementsForComponent = useCallback(async (componentID) => {
    setRequirementsLoadingByComponent(prev => ({ ...prev, [componentID]: true }));
    setRequirementsErrorByComponent(prev => ({ ...prev, [componentID]: "" }));
    try {
      const response = await api.get(`/component/${componentID}/requirements`, { silentError: true });
      setRequirementsByComponent(prev => ({ ...prev, [componentID]: response || [] }));
    } catch (error) {
      setRequirementsErrorByComponent(prev => ({
        ...prev,
        [componentID]: error?.message || "Failed to load requirements.",
      }));
    } finally {
      setRequirementsLoadingByComponent(prev => ({ ...prev, [componentID]: false }));
    }
  }, [api]);

  const loadCertificatesForComponent = useCallback(async (componentID) => {
    setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: true }));
    setCertificatesErrorByComponent(prev => ({ ...prev, [componentID]: "" }));
    try {
      const response = await api.get(`/certificates/component/${componentID}?page=1&limit=100`, { silentError: true });
      setCertificatesByComponent(prev => ({ ...prev, [componentID]: response?.data || [] }));
    } catch (error) {
      setCertificatesErrorByComponent(prev => ({
        ...prev,
        [componentID]: error?.message || "Failed to load certificates.",
      }));
    } finally {
      setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: false }));
    }
  }, [api]);

  const loadCertificateUploadAudit = useCallback(async (certificateID) => {
    setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: true }));
    setUploadAuditErrorByCertificate(prev => ({ ...prev, [certificateID]: "" }));
    try {
      const response = await api.get(`/certificate/${certificateID}/uploads?page=1&limit=25`, { silentError: true });
      setUploadAuditByCertificate(prev => ({ ...prev, [certificateID]: response?.data || [] }));
    } catch (error) {
      setUploadAuditErrorByCertificate(prev => ({
        ...prev,
        [certificateID]: error?.message || "Failed to load upload audit log.",
      }));
    } finally {
      setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: false }));
    }
  }, [api]);

  const componentsForAsset = useMemo(
    () => data.filter(component => component.asset_id === selectedAssetId),
    [data, selectedAssetId],
  );

  const selectedAsset = useMemo(
    () => assets.find(asset => asset.asset_id === selectedAssetId) || null,
    [assets, selectedAssetId],
  );

  const selectedComponent = useMemo(
    () => componentsForAsset.find(component => component.component_id === selectedComponentId) || null,
    [componentsForAsset, selectedComponentId],
  );

  const currentRequirements = useMemo(
    () => requirementsByComponent[selectedComponentId] || [],
    [requirementsByComponent, selectedComponentId],
  );

  const currentCertificates = useMemo(
    () => sortCertificatesNewestFirst(certificatesByComponent[selectedComponentId] || []),
    [certificatesByComponent, selectedComponentId],
  );

  const isStructureLocked = !!selectedAsset?.template_id;

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map(category => [category.category_id, category.category_name])),
    [categories],
  );

  const testTypeNameById = useMemo(
    () => Object.fromEntries(testTypes.map(testType => [testType.test_id, testType.test_name])),
    [testTypes],
  );

  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedComponentId("");
      return;
    }
    if (componentsForAsset.length === 0) {
      setSelectedComponentId("");
      return;
    }
    const currentSelectionExists = componentsForAsset.some(component => component.component_id === selectedComponentId);
    if (!currentSelectionExists) {
      const preferredComponent = initialComponentId && componentsForAsset.some(component => component.component_id === initialComponentId)
        ? initialComponentId
        : componentsForAsset[0].component_id;
      setSelectedComponentId(preferredComponent);
      setExpandedCertId(null);
    }
  }, [selectedAssetId, componentsForAsset, selectedComponentId, initialComponentId]);

  useEffect(() => {
    componentsForAsset.forEach(component => {
      if (requirementsByComponent[component.component_id] === undefined && !requirementsLoadingByComponent[component.component_id]) {
        loadRequirementsForComponent(component.component_id);
      }
      if (certificatesByComponent[component.component_id] === undefined && !certificatesLoadingByComponent[component.component_id]) {
        loadCertificatesForComponent(component.component_id);
      }
    });
  }, [
    componentsForAsset,
    requirementsByComponent,
    requirementsLoadingByComponent,
    loadRequirementsForComponent,
    certificatesByComponent,
    certificatesLoadingByComponent,
    loadCertificatesForComponent,
  ]);

  useEffect(() => {
    currentCertificates.forEach(certificate => {
      if (!certificate?.certificate_id) return;
      if (!uploadAuditByCertificate[certificate.certificate_id] && !uploadAuditLoadingByCertificate[certificate.certificate_id]) {
        loadCertificateUploadAudit(certificate.certificate_id);
      }
    });
  }, [currentCertificates, uploadAuditByCertificate, uploadAuditLoadingByCertificate, loadCertificateUploadAudit]);

  useEffect(() => {
    if (currentCertificates.length === 0) {
      if (expandedCertId) setExpandedCertId(null);
      return;
    }
    const currentCertificateIds = new Set(currentCertificates.map(certificate => certificate.certificate_id));
    if (!expandedCertId || !currentCertificateIds.has(expandedCertId)) {
      setExpandedCertId(currentCertificates[0].certificate_id);
    }
  }, [currentCertificates, expandedCertId]);

  const groupedComponents = useMemo(() => {
    const groups = new Map();
    const sortedComponents = [...componentsForAsset].sort((left, right) => {
      const leftSort = left.sort_order ?? 0;
      const rightSort = right.sort_order ?? 0;
      if (leftSort !== rightSort) return leftSort - rightSort;
      return left.name.localeCompare(right.name);
    });

    sortedComponents.forEach((component, index) => {
      const groupKey = component.category_id || "uncategorized";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          category_id: groupKey,
          category_name: categoryNameById[groupKey] || "Uncategorized",
          order: index,
          components: [],
        });
      }
      groups.get(groupKey).components.push(component);
    });

    return Array.from(groups.values()).sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.category_name.localeCompare(right.category_name);
    });
  }, [componentsForAsset, categoryNameById]);

  const activeRequirementIds = useMemo(
    () => new Set(currentRequirements.map(requirement => requirement.requirement_id)),
    [currentRequirements],
  );

  const requirementNameById = useMemo(
    () => Object.fromEntries(currentRequirements.map(requirement => [requirement.requirement_id, `${requirement.label} - ${requirement.test_name}`])),
    [currentRequirements],
  );

  const requirementHistories = useMemo(
    () => currentRequirements.map(requirement => {
      const certificates = sortCertificatesNewestFirst(
        currentCertificates.filter(certificate => certificate.requirement_id === requirement.requirement_id),
      );
      return {
        requirement,
        certificates,
        latest: certificates[0] || null,
      };
    }),
    [currentRequirements, currentCertificates],
  );

  const legacyCertificates = useMemo(
    () => currentCertificates.filter(certificate => !certificate.requirement_id || !activeRequirementIds.has(certificate.requirement_id)),
    [currentCertificates, activeRequirementIds],
  );

  const getComponentBadge = useCallback((componentID) => {
    const requirements = requirementsByComponent[componentID] || [];
    const certificates = sortCertificatesNewestFirst(certificatesByComponent[componentID] || []);

    if (requirements.length > 0) {
      const latestPerRequirement = requirements.map(requirement => (
        certificates.find(certificate => certificate.requirement_id === requirement.requirement_id) || null
      ));
      if (latestPerRequirement.some(certificate => !certificate)) return { label: "No Cert", cls: "dim" };
      if (latestPerRequirement.some(certificate => certificate?.status === "EXPIRED")) return { label: "Expired", cls: "red" };
      if (latestPerRequirement.some(certificate => certificate?.status === "EXPIRING_SOON")) return { label: "Due Soon", cls: "amber" };
      return { label: "OK", cls: "green" };
    }

    const latest = certificates[0];
    if (!latest) return { label: "No Cert", cls: "dim" };
    if (latest.status === "EXPIRED") return { label: "Expired", cls: "red" };
    if (latest.status === "EXPIRING_SOON") return { label: "Due Soon", cls: "amber" };
    return { label: "OK", cls: "green" };
  }, [requirementsByComponent, certificatesByComponent]);

  const expiryToneClass = useCallback((certificate) => {
    if (!certificate?.expiry_date) return "";
    const expiryDate = new Date(certificate.expiry_date);
    if (Number.isNaN(expiryDate.getTime())) return "";
    const days = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "expired";
    if (days <= 30) return "warning";
    return "";
  }, []);

  const viewCertificateFile = useCallback(async (certificateID) => {
    try {
      const response = await api.get(`/certificate/${certificateID}/file`);
      if (response?.url) {
        window.open(response.url, "_blank", "noopener,noreferrer");
        return;
      }
      notifyError("Certificate file URL is not available.");
    } catch (error) {
      notifyError(error?.message || "Failed to open certificate file.");
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
      if (!response.ok) throw new Error(payload?.error || payload?.message || `Upload failed (${response.status})`);

      notifyInfo(payload?.message || "Certificate file uploaded.");
      await Promise.all([
        loadCertificatesForComponent(componentID),
        loadCertificateUploadAudit(certificateID),
      ]);
    } catch (error) {
      notifyError(error?.message || "Failed to upload certificate file.");
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

  const handleCreateComponent = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addcomponent", form);
      setModal(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateComponent = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updatecomponent/${selected.component_id}`, form);
      setModal(null);
      setSelected(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComponent = async (componentID, clearSelection = false) => {
    if (!(await confirmAction("Delete this component?"))) return;
    await api.del(`/deletecomponent/${componentID}`);
    if (clearSelection) setSelectedComponentId("");
    await load();
  };

  const handleCreateRequirement = async (form) => {
    if (!selectedComponentId) return;
    setSubmitting(true);
    try {
      const response = await api.post(`/component/${selectedComponentId}/requirements`, form);
      setRequirementsByComponent(prev => ({ ...prev, [selectedComponentId]: response || [] }));
      setRequirementModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRequirement = async (form) => {
    if (!selectedRequirement?.requirement_id) return;
    setSubmitting(true);
    try {
      const response = await api.put(`/component/requirement/${selectedRequirement.requirement_id}`, form);
      setRequirementsByComponent(prev => ({ ...prev, [selectedComponentId]: response || [] }));
      setRequirementModal(null);
      setSelectedRequirement(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequirement = async (requirement) => {
    if (!(await confirmAction(`Archive requirement "${requirement.label}"?`))) return;
    const response = await api.del(`/component/requirement/${requirement.requirement_id}`);
    setRequirementsByComponent(prev => ({ ...prev, [selectedComponentId]: response || [] }));
    setSelectedRequirement(null);
    await loadCertificatesForComponent(selectedComponentId);
  };

  const handleCreateCertificate = async (form) => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        issue_date: new Date(form.issue_date).toISOString(),
        expiry_date: new Date(form.expiry_date).toISOString(),
      };
      await api.post("/addcertificate", payload);
      setCertModal(null);
      setExpandedCertId(null);
      await loadCertificatesForComponent(form.component_id || selectedComponentId);
    } finally {
      setSubmitting(false);
    }
  };

  const requirementInitial = selectedRequirement
    ? { label: selectedRequirement.label, test_id: selectedRequirement.test_id }
    : null;

  const certificateInitial = certModal
    ? {
      component_id: certModal.component_id || selectedComponentId,
      requirement_id: certModal.requirement_id || "",
      certificate_name: "",
      issue_date: "",
      expiry_date: "",
      issuing_authority: "",
      test_id: certModal.test_id || "",
      imca_ref: "",
      imca_d018: "",
      maintenance_notes: "",
    }
    : null;

  const renderCertificateEntry = (certificate, index, total) => {
    const isOpen = expandedCertId === certificate.certificate_id;
    const status = getStatusBadge(certificate.status);
    const contextLabel = certificate.requirement_id
      ? (requirementNameById[certificate.requirement_id] || "Archived requirement")
      : (testTypeNameById[certificate.test_id] || certificate.test_id || "Direct certificate");

    return (
      <div key={certificate.certificate_id} style={{ borderBottom: index < total - 1 ? "1px solid var(--border)" : "none" }}>
        <div
          className="cert-editorial-header"
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setExpandedCertId(isOpen ? null : certificate.certificate_id)}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "1px 6px",
              borderRadius: 2,
              border: "1px solid",
              marginRight: 6,
              ...(status.cls === "red"
                ? { color: "var(--red)", borderColor: "var(--red-border)", background: "var(--red-bg)" }
                : status.cls === "amber"
                  ? { color: "var(--amber)", borderColor: "var(--amber-border)", background: "var(--amber-bg)" }
                  : status.cls === "green"
                    ? { color: "var(--green)", borderColor: "var(--green-border)", background: "var(--green-bg)" }
                    : { color: "var(--text-2)", borderColor: "var(--border-mid)", background: "var(--bg-3)" })
            }}
          >
            {status.label}
          </span>
          <span className="cert-editorial-title" style={{ flex: 1 }}>
            {certificate.certificate_name || "Unnamed Certificate"}
            <span style={{ fontSize: 11, color: "rgba(240,232,216,0.6)", fontFamily: "var(--font-sans)", marginLeft: 8 }}>
              - expires {formatDate(certificate.expiry_date)}
            </span>
          </span>
          {isAdmin && (
            <button
              className="btn-upload-editorial"
              onClick={(event) => {
                event.stopPropagation();
                handleCertificateUploadClick(selectedComponent.component_id, certificate.certificate_id);
              }}
              disabled={!!uploadBusyByCertificate[certificate.certificate_id]}
            >
              {uploadBusyByCertificate[certificate.certificate_id] ? "Uploading..." : "Upload File"}
            </button>
          )}
          <button
            className="btn-view-editorial"
            onClick={(event) => {
              event.stopPropagation();
              viewCertificateFile(certificate.certificate_id);
            }}
            disabled={!certificate.certificate_file}
          >
            View File
          </button>
          <span
            style={{
              color: "rgba(240,232,216,0.6)",
              fontSize: 14,
              marginLeft: 8,
              transition: "transform 0.25s",
              display: "inline-block",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            v
          </span>
        </div>

        <div className={`cert-accordion-body${isOpen ? " open" : ""}`}>
          <div className="cert-accordion-inner">
            <div className="cert-editorial-fields">
              <div className="cert-editorial-row"><div className="cert-editorial-label">Requirement / Test Type</div><div className="cert-editorial-value">{contextLabel}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">Issued By</div><div className="cert-editorial-value">{certificate.issuing_authority || "-"}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">Certificate ID</div><div className="cert-editorial-value">{certificate.certificate_id || "-"}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">Issue Date</div><div className="cert-editorial-value">{formatDate(certificate.issue_date)}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">Expiry Date</div><div className={`cert-editorial-value ${expiryToneClass(certificate)}`}>{formatDate(certificate.expiry_date)}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">IMCA Ref</div><div className="cert-editorial-value">{certificate.imca_ref || "-"}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">IMCA D018</div><div className="cert-editorial-value">{certificate.imca_d018 || "-"}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">Maintenance Notes</div><div className="cert-editorial-value">{certificate.maintenance_notes || "-"}</div></div>
              <div className="cert-editorial-row"><div className="cert-editorial-label">File</div><div className="cert-editorial-value">{certificate.certificate_file || "No file linked."}</div></div>
            </div>

            <div className="audit-editorial">
              <div className="audit-editorial-head">
                <span className="audit-editorial-title">Upload history</span>
                <span className="audit-editorial-count">{(uploadAuditByCertificate[certificate.certificate_id] || []).length} entries</span>
              </div>
              {uploadAuditLoadingByCertificate[certificate.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-2)" }}>Loading audit log...</div>}
              {uploadAuditErrorByCertificate[certificate.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--red)" }}>{uploadAuditErrorByCertificate[certificate.certificate_id]}</div>}
              {!uploadAuditLoadingByCertificate[certificate.certificate_id] && !uploadAuditErrorByCertificate[certificate.certificate_id] && (
                <table className="audit-editorial-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(uploadAuditByCertificate[certificate.certificate_id] || []).map((entry, entryIndex) => (
                      <tr key={`${entry.uploaded_at || "upload"}-${entryIndex}`}>
                        <td className="audit-mono">{entry.uploaded_at ? new Date(entry.uploaded_at).toLocaleString() : "-"}</td>
                        <td>{entry.uploaded_by || "Unknown"}</td>
                        <td><span className="audit-dot" /><span className="audit-pill">Uploaded</span></td>
                        <td className="audit-mono">{entry.file_name || entry.file_key || "(unknown file)"}</td>
                      </tr>
                    ))}
                    {(uploadAuditByCertificate[certificate.certificate_id] || []).length === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--text-2)" }}>No upload history recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Components"
        subtitle={selectedAsset ? `${componentsForAsset.length || 0} components in ${selectedAsset.name}` : "Select an asset to inspect its structure"}
        action={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={onBackToAssets}>Dashboard</Button>
            {isAdmin && selectedAsset && !isStructureLocked && (
              <Button variant="primary" onClick={() => setModal("create")}>Add Component</Button>
            )}
          </div>
        )}
      />

      {loading && <Card style={{ padding: 20, color: "var(--text-2)", fontSize: 12 }}>Loading components...</Card>}

      {!loading && !selectedAsset && (
        <Card style={{ padding: 20, color: "var(--text-2)", fontSize: 12 }}>
          Open an asset from the dashboard to inspect its components and certificate requirements.
        </Card>
      )}

      {!loading && selectedAsset && (
        <div className="comp-layout">
          <aside className="comp-nav">
            <div className="comp-nav-hero">
              <div className="comp-nav-title">{selectedAsset.name}</div>
              <div className="comp-nav-tags">
                <span className="comp-nav-tag">{selectedAsset.status || "Unknown"}</span>
                <span className="comp-nav-tag">{selectedAsset.template_id ? "Template-linked" : "Manual"}</span>
                {selectedAsset.location && <span className="comp-nav-tag">{selectedAsset.location}</span>}
              </div>
            </div>

            <div className="comp-nav-list">
              {groupedComponents.map(group => (
                <div key={group.category_id}>
                  <div style={{ padding: "12px 14px 6px", fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {group.category_name}
                  </div>
                  {group.components.map(component => {
                    const badge = getComponentBadge(component.component_id);
                    return (
                      <button
                        key={component.component_id}
                        className={`comp-nav-item ${selectedComponentId === component.component_id ? "active" : ""}`}
                        onClick={() => setSelectedComponentId(component.component_id)}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{component.name}</span>
                        <span className={`comp-badge ${badge.cls}`}>{badge.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {componentsForAsset.length === 0 && <div style={{ padding: "12px 14px", color: "var(--text-2)", fontSize: 12 }}>No components in this asset yet.</div>}
            </div>
          </aside>

          <section className="comp-content">
            {selectedAsset.template_id && (
              <Card style={{ marginBottom: 14, padding: 14, background: "var(--bg-2)" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Template Control
                </div>
                <div style={{ fontSize: 13, color: "var(--text-1)" }}>
                  This asset inherits its structure from a template. Component names, categories, and test requirements must be changed through template management.
                </div>
              </Card>
            )}

            {requirementsErrorByComponent[selectedComponentId] && <Card style={{ marginBottom: 12, padding: 12, color: "var(--red)", fontSize: 11 }}>{requirementsErrorByComponent[selectedComponentId]}</Card>}
            {certificatesErrorByComponent[selectedComponentId] && <Card style={{ marginBottom: 12, padding: 12, color: "var(--red)", fontSize: 11 }}>{certificatesErrorByComponent[selectedComponentId]}</Card>}

            {!selectedComponent && <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12 }}>Select a component from the left pane.</Card>}

            {selectedComponent && (
              <>
                <div className="comp-head">
                  <div>
                    <div className="comp-head-title">{selectedComponent.name}</div>
                    <div className="comp-head-sub">
                      {(selectedComponent.manufacturer || "Unknown manufacturer")}
                      {" - "}
                      {(selectedComponent.model || "Unknown model")}
                      {" - "}
                      {(categoryNameById[selectedComponent.category_id] || "Uncategorized")}
                    </div>
                  </div>

                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <Button variant="primary" onClick={() => setCertModal({ component_id: selectedComponentId, requirement_id: "" })}>Add Certificate</Button>
                      {!isStructureLocked && (
                        <>
                          <Button onClick={() => { setSelected(selectedComponent); setModal("edit"); }}>Edit Component</Button>
                          <Button variant="danger" onClick={() => handleDeleteComponent(selectedComponent.component_id, true)}>Delete</Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="comp-meta" style={{ marginTop: 16 }}>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Component ID</div><div className="comp-meta-value">{selectedComponent.component_id}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Serial</div><div className="comp-meta-value">{selectedComponent.serial_number || "-"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Safety Critical</div><div className="comp-meta-value">{selectedComponent.safety_critical || "-"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Equipment Type</div><div className="comp-meta-value">{selectedComponent.equipment_type || "-"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Structure</div><div className="comp-meta-value">{selectedComponent.structure || "-"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Latest Issue Date</div><div className="comp-meta-value">{currentCertificates[0] ? formatDate(currentCertificates[0].issue_date) : "-"}</div></div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
                  <Card>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>Test Requirements</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                          {currentRequirements.length > 0 ? `${currentRequirements.length} active requirement${currentRequirements.length === 1 ? "" : "s"}` : "This component has no configured test requirements yet."}
                        </div>
                      </div>
                      {isAdmin && !isStructureLocked && <Button variant="primary" onClick={() => { setSelectedRequirement(null); setRequirementModal("create"); }}>Add Requirement</Button>}
                    </div>

                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                      {requirementsLoadingByComponent[selectedComponentId] && <div style={{ color: "var(--text-2)", fontSize: 12 }}>Loading requirements...</div>}
                      {!requirementsLoadingByComponent[selectedComponentId] && requirementHistories.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 12 }}>No test requirements configured for this component.</div>}

                      {requirementHistories.map(({ requirement, certificates, latest }) => {
                        const latestStatus = latest ? getStatusBadge(latest.status) : { label: "No certificate yet", cls: "dim" };
                        return (
                          <div key={requirement.requirement_id} style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", background: "var(--bg-2)" }}>
                            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Requirement</div>
                                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>{requirement.label}</div>
                                <div style={{ fontSize: 12, color: "var(--text-1)", marginTop: 6 }}>
                                  {requirement.test_name}
                                  {requirement.validity_duration ? ` - ${requirement.validity_duration} month validity` : ""}
                                </div>
                                {requirement.test_description && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>{requirement.test_description}</div>}
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                                <span className={`comp-badge ${latestStatus.cls}`}>{latestStatus.label}</span>
                                {isAdmin && <Button variant="primary" size="sm" onClick={() => setCertModal({ component_id: selectedComponentId, requirement_id: requirement.requirement_id, test_id: requirement.test_id })}>{latest ? "Add Renewal" : "Add Certificate"}</Button>}
                                {isAdmin && !isStructureLocked && (
                                  <>
                                    <Button size="sm" onClick={() => { setSelectedRequirement(requirement); setRequirementModal("edit"); }}>Edit</Button>
                                    <Button size="sm" variant="danger" onClick={() => handleDeleteRequirement(requirement)}>Archive</Button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div style={{ padding: "0 16px 16px" }}>
                              {latest ? (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg-1)" }}>
                                  <div><div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Certificate</div><div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{latest.certificate_name || "-"}</div></div>
                                  <div><div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Issue Date</div><div style={{ marginTop: 6, fontSize: 13 }}>{formatDate(latest.issue_date)}</div></div>
                                  <div><div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Expiry Date</div><div style={{ marginTop: 6, fontSize: 13 }} className={expiryToneClass(latest)}>{formatDate(latest.expiry_date)}</div></div>
                                  <div><div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Authority</div><div style={{ marginTop: 6, fontSize: 13 }}>{latest.issuing_authority || "-"}</div></div>
                                </div>
                              ) : (
                                <div style={{ padding: "14px 16px", border: "1px dashed var(--border-mid)", borderRadius: 4, color: "var(--text-2)", fontSize: 12, background: "var(--bg-1)" }}>
                                  No certificate yet
                                </div>
                              )}

                              {certificates.length > 0 && (
                                <div style={{ marginTop: 14 }}>
                                  <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Certificate History</div>
                                  <div className="cert-editorial-card">
                                    {certificates.map((certificate, index) => renderCertificateEntry(certificate, index, certificates.length))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {legacyCertificates.length > 0 && (
                    <Card>
                      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>Archived / Legacy Certificate History</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                          These certificates stay viewable for audit history, but they are not tied to an active requirement anymore.
                        </div>
                      </div>
                      <div className="cert-editorial-card" style={{ margin: 16 }}>
                        {legacyCertificates.map((certificate, index) => renderCertificateEntry(certificate, index, legacyCertificates.length))}
                      </div>
                    </Card>
                  )}

                  {currentRequirements.length === 0 && certificatesLoadingByComponent[selectedComponentId] && <Card style={{ padding: 12, color: "var(--text-2)", fontSize: 12 }}>Loading certificates...</Card>}
                  {currentRequirements.length === 0 && !certificatesLoadingByComponent[selectedComponentId] && currentCertificates.length === 0 && <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12, textAlign: "center" }}>No certificates linked to this component.{isAdmin && <span> Use Add Certificate above to add one.</span>}</Card>}
                  {currentRequirements.length === 0 && currentCertificates.length > 0 && (
                    <Card>
                      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>Certificate History</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                          This component is still using direct certificate records without configured test requirements.
                        </div>
                      </div>
                      <div className="cert-editorial-card" style={{ margin: 16 }}>
                        {currentCertificates.map((certificate, index) => renderCertificateEntry(certificate, index, currentCertificates.length))}
                      </div>
                    </Card>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {modal === "create" && (
        <Modal title="New Component" onClose={() => setModal(null)} width={640}>
          <ComponentForm initial={selectedAssetId ? { asset_id: selectedAssetId, safety_critical: "NO" } : undefined} assets={assets} categories={categories} onSubmit={handleCreateComponent} onClose={() => setModal(null)} submitting={submitting} />
        </Modal>
      )}

      {modal === "edit" && selected && (
        <Modal title="Edit Component" onClose={() => { setModal(null); setSelected(null); }} width={640}>
          <ComponentForm initial={selected} assets={assets} categories={categories} onSubmit={handleUpdateComponent} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
        </Modal>
      )}

      {requirementModal === "create" && (
        <Modal title={`Add Requirement - ${selectedComponent?.name || "Component"}`} onClose={() => setRequirementModal(null)} width={560}>
          <ComponentRequirementForm testTypes={testTypes} onSubmit={handleCreateRequirement} onClose={() => setRequirementModal(null)} submitting={submitting} />
        </Modal>
      )}

      {requirementModal === "edit" && selectedRequirement && (
        <Modal title={`Edit Requirement - ${selectedRequirement.label}`} onClose={() => { setRequirementModal(null); setSelectedRequirement(null); }} width={560}>
          <ComponentRequirementForm initial={requirementInitial} testTypes={testTypes} onSubmit={handleUpdateRequirement} onClose={() => { setRequirementModal(null); setSelectedRequirement(null); }} submitting={submitting} />
        </Modal>
      )}

      {certModal && selectedComponent && (
        <Modal title={`Add Certificate - ${selectedComponent.name}`} onClose={() => setCertModal(null)} width={620}>
          <CertificateForm initial={certificateInitial} components={data} testTypes={testTypes} requirements={currentRequirements} onSubmit={handleCreateCertificate} onClose={() => setCertModal(null)} submitting={submitting} />
        </Modal>
      )}
    </div>
  );
}

export default ComponentsPage;
