import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useApi } from "../../hooks/useApi";
import { useConfirm } from "../../hooks/useConfirm";
import AssetTemplateEditor from "./AssetTemplateEditor";

function countComponents(template) {
  return (template.categories || []).reduce((total, category) => total + (category.components || []).length, 0);
}

function countRequirements(template) {
  return (template.categories || []).reduce(
    (total, category) => total + (category.components || []).reduce((componentTotal, component) => componentTotal + (component.requirements || []).length, 0),
    0,
  );
}

function AssetTemplatesModal({ onClose, onChanged }) {
  const api = useApi();
  const confirmAction = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [testTypes, setTestTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState("list");
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const load = async (signal) => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes, testTypesRes] = await Promise.all([
        api.get("/asset-templates", { signal }),
        api.get("/categories?limit=500", { signal }),
        api.get("/test-types", { signal }),
      ]);
      if (signal?.aborted) return;
      setTemplates(templatesRes || []);
      setCategories(categoriesRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => {});
    return () => controller.abort();
  }, []);

  const title = useMemo(() => {
    if (mode === "create") return "Create Template";
    if (mode === "edit") return `Edit Template${selectedTemplate?.name ? ` — ${selectedTemplate.name}` : ""}`;
    return "Manage Templates";
  }, [mode, selectedTemplate]);

  const handleSave = async (form) => {
    setSubmitting(true);
    try {
      if (mode === "create") {
        await api.post("/asset-templates", form);
      } else if (selectedTemplate?.template_id) {
        await api.put(`/asset-template/${selectedTemplate.template_id}`, form);
      }
      await load();
      setMode("list");
      setSelectedTemplate(null);
      onChanged?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (template) => {
    if (!(await confirmAction(`Delete template "${template.name}"? Linked assets will be unlinked.`))) return;
    await api.del(`/asset-template/${template.template_id}`);
    await load();
    onChanged?.();
  };

  return (
    <Modal title={title} onClose={onClose} width={mode === "list" ? 760 : 920}>
      {loading ? (
        <div style={{ color: "var(--text-2)", fontSize: 12 }}>Loading templates...</div>
      ) : mode === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{templates.length} saved templates</div>
            <Button variant="primary" onClick={() => { setSelectedTemplate(null); setMode("create"); }}>+ New Template</Button>
          </div>

          {templates.length === 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 16, color: "var(--text-2)", fontSize: 12 }}>
              No templates saved yet.
            </div>
          )}

          {templates.map(template => (
            <div key={template.template_id} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>{template.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                    {template.categories?.length || 0} categories · {countComponents(template)} components · {countRequirements(template)} test requirements
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" onClick={() => { setSelectedTemplate(template); setMode("edit"); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(template)}>Delete</Button>
                </div>
              </div>

              {template.categories?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {template.categories.map(category => (
                    <span key={category.template_category_id} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: "var(--text-1)",
                      fontFamily: "var(--font-mono)",
                    }}>{category.category_name || category.category_id}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <AssetTemplateEditor
          initialTemplate={mode === "edit" ? selectedTemplate : null}
          categories={categories}
          testTypes={testTypes}
          onSubmit={handleSave}
          onCancel={() => { setMode("list"); setSelectedTemplate(null); }}
          submitting={submitting}
        />
      )}
    </Modal>
  );
}

export default AssetTemplatesModal;
