import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useApi } from "../../hooks/useApi";
import { formatDate } from "../../utils/format";

function CertificateDetailsPage({ certificateId, onBack }) {
  const api = useApi();
  const [certificate, setCertificate] = useState(null);
  const [testTypes, setTestTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!certificateId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api.get(`/certificate/${certificateId}`, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setCertificate(res || null);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load certificate.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, certificateId]);

  useEffect(() => {
    const controller = new AbortController();
    api.get("/test-types", { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setTestTypes(res?.data || res || []);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") console.error(e);
      });
    return () => controller.abort();
  }, [api]);

  const testTypeName = useMemo(() => {
    if (!certificate?.test_id) return "-";
    const found = testTypes.find(t => t.test_id === certificate.test_id);
    return found?.test_name || certificate.test_id;
  }, [certificate?.test_id, testTypes]);

  const details = [
    { label: "Certificate ID", value: certificate?.certificate_id },
    { label: "Component ID", value: certificate?.component_id },
    { label: "Test Type ID", value: certificate?.test_id },
    { label: "Issue Date", value: formatDate(certificate?.issue_date) },
    { label: "Expiry Date", value: formatDate(certificate?.expiry_date) },
    { label: "Issuing Authority", value: certificate?.issuing_authority },
    { label: "IMCA Ref", value: certificate?.imca_ref },
    { label: "IMCA D018", value: certificate?.imca_d018 },
    { label: "Certificate File", value: certificate?.certificate_file },
    { label: "Created At", value: formatDate(certificate?.created_at) },
    { label: "Updated At", value: formatDate(certificate?.updated_at) },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={certificate?.certificate_name || "Certificate Details"}
        subtitle={certificateId ? `Record: ${certificateId}` : "No certificate selected"}
        action={<Button onClick={onBack}>Back to Components</Button>}
      />
      {loading && (
        <Card style={{ padding: 16, color: "var(--text-2)", fontSize: 12 }}>Loading certificate...</Card>
      )}
      {!loading && error && (
        <Card style={{ padding: 16, color: "var(--red)", fontSize: 12 }}>{error}</Card>
      )}
      {!loading && !error && certificate && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ padding: 18, borderColor: "var(--border-bright)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                  Test Type
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.2 }}>
                  {testTypeName}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-1)" }}>
                  {certificate?.certificate_name || "-"}
                </div>
              </div>
              <div style={{ justifySelf: "end", minWidth: 180, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Certificate Status
                </div>
                <StatusBadge status={certificate?.status || "VALID"} />
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Certificate Details
            </div>
            <div style={{ padding: "6px 14px 10px" }}>
              {details.map((item) => (
                <div key={item.label} style={{
                  display: "grid",
                  gridTemplateColumns: "220px minmax(0, 1fr)",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-0)", wordBreak: "break-word" }}>
                    {item.value || "-"}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Maintenance Notes
            </div>
            <div style={{ padding: "14px", fontSize: 13, lineHeight: 1.55, color: "var(--text-0)", minHeight: 90, whiteSpace: "pre-wrap" }}>
              {certificate?.maintenance_notes || "-"}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default CertificateDetailsPage;

