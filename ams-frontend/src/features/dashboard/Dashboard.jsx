import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import Table from "../../components/ui/Table";
import { BASE_URL } from "../../constants";
import { useAuth } from "../../hooks/useAuth";
import { useApi } from "../../hooks/useApi";
import { useFeedback } from "../../hooks/useFeedback";
import { formatDate } from "../../utils/format";
import CertDonut from "./CertDonut";

function Dashboard({ onOpenAsset, onOpenComponent }) {
  const api = useApi();
  const { user, logout } = useAuth();
  const { notifyError, notifyInfo } = useFeedback();
  const [allCerts, setAllCerts]     = useState([]);
  const [assets, setAssets]         = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [certFilter, setCertFilter] = useState("ALL");

  const load = useCallback(async (signal) => {
    Promise.all([
      api.get("/assets?limit=200", { signal }),
      api.get("/components?page=1&limit=500", { signal }),
      api.get("/certificates/dashboard?limit=1000", { signal }),
    ]).then(([a, comp, d]) => {
      if (signal?.aborted) return;
      setAssets(a?.data || []);
      setComponents(comp?.data || []);
      setAllCerts(d?.data || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleCerts = useMemo(() => {
    if (selectedAssetId) return allCerts.filter(c => c.asset_id === selectedAssetId);
    return allCerts;
  }, [allCerts, selectedAssetId]);

  const alertCerts = useMemo(() => {
    const base = visibleCerts.filter(c => c.status === "EXPIRED" || c.status === "EXPIRING_SOON");
    if (certFilter === "ALL") return base;
    return base.filter(c => c.status === certFilter);
  }, [visibleCerts, certFilter]);

  const selectedAsset = useMemo(() => assets.find(a => a.asset_id === selectedAssetId) || null, [assets, selectedAssetId]);
  const selectedAssetComponents = useMemo(
    () => components.filter(component => component.asset_id === selectedAssetId),
    [components, selectedAssetId]
  );

  const getAssetBadge = useCallback((assetId) => {
    const certs = allCerts.filter(c => c.asset_id === assetId);
    if (certs.some(c => c.status === "EXPIRED"))       return { cls: "red",   label: "!" };
    if (certs.some(c => c.status === "EXPIRING_SOON")) return { cls: "amber", label: "~" };
    if (certs.length > 0)                              return { cls: "green", label: "OK" };
    return { cls: "dim", label: "—" };
  }, [allCerts]);

  const handleDownloadReport = useCallback(async () => {
    if (!user?.token) {
      notifyError("Your session has expired. Please sign in again.");
      return;
    }

    setReportBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/certificates/report.pdf`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please log in again.");
      }

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to generate report (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename=\"([^\"]+)\"/i);
      const filename = filenameMatch?.[1] || `certificate-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      notifyInfo("Certificate report downloaded.");
    } catch (error) {
      notifyError(error?.message || "Failed to generate certificate report.");
    } finally {
      setReportBusy(false);
    }
  }, [logout, notifyError, notifyInfo, user?.token]);

  return (
    <div className="fade-in">
      <PageHeader
        title={selectedAsset ? selectedAsset.name : "Operations Dashboard"}
        subtitle={selectedAsset ? `Asset dashboard · ${visibleCerts.length} certificates` : "Real-time compliance overview"}
        action={<Button variant="primary" onClick={handleDownloadReport} disabled={reportBusy}>{reportBusy ? "Generating..." : "Certificate Report PDF"}</Button>}
      />
      <div className="comp-layout">
        <aside className="comp-nav">
          <div className="comp-nav-hero">
            <div className="comp-nav-title">Assets</div>
            <div className="comp-nav-tags">
              <span className="comp-nav-tag">{loading ? "..." : `${assets.length} Total`}</span>
            </div>
          </div>
          <div className="comp-nav-list">
            <button
              className={`comp-nav-item ${selectedAssetId === null ? "active" : ""}`}
              onClick={() => setSelectedAssetId(null)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>All Assets</span>
              <span className="comp-badge dim">Overview</span>
            </button>
            {loading && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>Loading...</div>}
            {!loading && assets.map(asset => {
              const badge = getAssetBadge(asset.asset_id);
              const isActive = selectedAssetId === asset.asset_id;
              return (
                <div key={asset.asset_id} style={{ display: "flex", alignItems: "center", borderLeft: isActive ? "2px solid var(--red)" : "2px solid transparent", background: isActive ? "var(--bg-2)" : "transparent" }}>
                  <button
                    style={{ flex: 1, border: "none", background: "transparent", color: isActive ? "var(--text-0)" : "var(--text-1)", textAlign: "left", padding: "8px 8px 8px 14px", fontSize: 12, fontWeight: isActive ? 600 : 400, display: "flex", alignItems: "center", gap: 8, overflow: "hidden", cursor: "pointer" }}
                    onClick={() => setSelectedAssetId(asset.asset_id)}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</span>
                    <span className={`comp-badge ${badge.cls}`} style={{ flexShrink: 0 }}>{badge.label}</span>
                  </button>
                  <button
                    title="Open Components"
                    onClick={() => onOpenAsset(asset.asset_id)}
                    style={{ flexShrink: 0, border: "none", background: "transparent", color: "var(--ink-dim)", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                  >{"->"}</button>
                </div>
              );
            })}
            {!loading && assets.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No assets found.</div>}
          </div>
        </aside>

        <section className="comp-content">
          {selectedAsset && (
            <Card style={{ marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: selectedAsset.photo ? "minmax(520px, 46%) 1fr" : "1fr" }}>
                {selectedAsset.photo && (
                  <div style={{ borderRight: "1px solid var(--border)", height: 340, overflow: "hidden", flexShrink: 0 }}>
                    <img
                      src={selectedAsset.photo}
                      alt={selectedAsset.name}
                      style={{ width: "100%", height: 340, objectFit: "cover", display: "block" }}
                      onError={e => { e.target.style.display = "none"; e.target.parentNode.style.display = "none"; }}
                    />
                  </div>
                )}
                <div>
                  <div className="comp-meta">
                    {/* Row 1: Status, Location, Asset ID — 3 columns */}
                    <div className="comp-meta-cell"><div className="comp-meta-label">Status</div><div className="comp-meta-value"><StatusBadge status={selectedAsset.status} /></div></div>
                    <div className="comp-meta-cell"><div className="comp-meta-label">Location</div><div className="comp-meta-value">{selectedAsset.location || "—"}</div></div>
                    <div className="comp-meta-cell" style={{ borderRight: "none" }}><div className="comp-meta-label">Asset ID</div><div className="comp-meta-value" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{selectedAsset.asset_id}</div></div>
                    {/* Row 2: Project — full width */}
                    <div className="comp-meta-cell" style={{ gridColumn: "1 / -1", borderRight: "none" }}><div className="comp-meta-label">Project</div><div className="comp-meta-value">{selectedAsset.assigned_project || "—"}</div></div>
                    {/* Row 3: Description — full width, conditional */}
                    {selectedAsset.description && (
                      <div className="comp-meta-cell" style={{ gridColumn: "1 / -1", borderRight: "none" }}><div className="comp-meta-label">Description</div><div className="comp-meta-value" style={{ color: "var(--ink-mid)", fontWeight: 400 }}>{selectedAsset.description}</div></div>
                    )}
                    <div className="comp-meta-cell" style={{ gridColumn: "1 / -1", borderRight: "none" }}>
                      <div className="comp-meta-label">Components</div>
                      {selectedAssetComponents.length > 0 ? (
                        <div className="asset-component-list">
                          {selectedAssetComponents.map(component => (
                            <button
                              key={component.component_id}
                              type="button"
                              className="asset-component-chip"
                              onClick={() => onOpenComponent(selectedAsset.asset_id, component.component_id)}
                              title={component.component_id}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {component.name}
                              </span>
                              <span className="asset-component-chip-id">{component.component_id}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="comp-meta-value" style={{ color: "var(--text-2)", fontWeight: 400 }}>No components linked to this asset yet.</div>
                      )}
                    </div>
                    {/* Row 4: Datasheet — full width, conditional */}
                    {selectedAsset.datasheet && (
                      <div className="comp-meta-cell" style={{ gridColumn: "1 / -1", borderRight: "none", borderBottom: "none" }}>
                        <div className="comp-meta-label">Datasheet</div>
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={selectedAsset.datasheet}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--primary)", color: "#fff", borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none" }}
                          >Download</a>
                        </div>
                      </div>
                    )}
                    {/* Last columned row bottom border fix */}
                    {!selectedAsset.datasheet && !selectedAsset.description && (
                      <div style={{ gridColumn: "1 / -1", borderTop: "none" }} />
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="dashboard-summary-grid">
            <Card>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>Certificate Status</span>
              </div>
              <div style={{ padding: "8px 16px 16px" }}>
                <CertDonut certs={visibleCerts} loading={loading} />
              </div>
            </Card>

            <Card>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--amber)", fontSize: 14 }}>!</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>Certificate Alerts</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-2)" }}>{alertCerts.length} ITEMS</span>
                <select
                  value={certFilter}
                  onChange={e => setCertFilter(e.target.value)}
                  style={{ fontSize: 10, fontFamily: "var(--font-mono)", background: "var(--bg-2)", border: "1px solid var(--border-mid)", borderRadius: 3, color: "var(--text-0)", padding: "3px 7px" }}
                >
                  <option value="ALL">All Alerts</option>
                  <option value="EXPIRING_SOON">Expiring Soon</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>
              {alertCerts.length === 0 && !loading ? (
                <div style={{ padding: 32, textAlign: "center" }}>
                  <div style={{ color: "var(--green)", fontSize: 28, marginBottom: 8 }}>OK</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>All Clear</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)" }}>No certificates require attention.</div>
                </div>
              ) : (
                <Table
                  loading={loading}
                  data={alertCerts}
                  onRowClick={row => onOpenComponent(row.asset_id, row.component_id)}
                  columns={[
                    { key: "certificate_name", label: "Certificate" },
                    { key: "component_name",   label: "Component" },
                    { key: "asset_name",       label: "Asset" },
                    { key: "expiry_date",      label: "Expires", render: v => <span style={{ color: "var(--amber)", fontWeight: 600 }}>{formatDate(v)}</span> },
                    { key: "status",           label: "Status",  render: v => <StatusBadge status={v} /> },
                  ]}
                />
              )}
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;

