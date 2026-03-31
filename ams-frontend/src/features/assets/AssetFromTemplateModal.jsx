import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useApi } from "../../hooks/useApi";
import AssetForm from "./AssetForm";

function countRequirements(template) {
  return (template.categories || []).reduce(
    (total, category) => total + (category.components || []).reduce((componentTotal, component) => componentTotal + (component.requirements || []).length, 0),
    0,
  );
}

function AssetFromTemplateModal({ onClose, onCreated }) {
  const api = useApi();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get("/asset-templates", { signal: controller.signal })
      .then((res) => { if (!controller.signal.aborted) setTemplates(res || []); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);

  const selectedTemplate = useMemo(
    () => templates.find(template => template.template_id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addasset/from-template", { ...form, template_id: selectedTemplateId });
      onCreated?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={selectedTemplate ? `Add Asset — ${selectedTemplate.name}` : "Add Asset From Template"} onClose={onClose} width={selectedTemplate ? 680 : 760}>
      {!selectedTemplate ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {loading && <div style={{ color: "var(--text-2)", fontSize: 12 }}>Loading templates...</div>}
          {!loading && templates.length === 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 16, color: "var(--text-2)", fontSize: 12 }}>
              No templates are available yet.
            </div>
          )}
          {!loading && templates.map(template => (
            <button
              key={template.template_id}
              type="button"
              onClick={() => setSelectedTemplateId(template.template_id)}
              style={{
                textAlign: "left",
                border: "1px solid var(--border)",
                background: "var(--bg-2)",
                borderRadius: 4,
                padding: 14,
                color: "var(--text-0)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>{template.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
                {template.categories?.length || 0} categories · {countRequirements(template)} test requirements
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 12, background: "var(--bg-2)" }}>
            <div style={{ fontSize: 11, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Template Summary</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>{selectedTemplate.name}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-2)" }}>
              {selectedTemplate.categories?.length || 0} categories · {countRequirements(selectedTemplate)} test requirements
            </div>
          </div>

          <AssetForm
            initial={{ status: "ACTIVE", template_id: selectedTemplateId }}
            onSubmit={handleCreate}
            onClose={() => setSelectedTemplateId("")}
            submitting={submitting}
            templateMode="locked"
            templateName={selectedTemplate.name}
            submitLabel="Create Asset"
          />
        </div>
      )}
    </Modal>
  );
}

export default AssetFromTemplateModal;
