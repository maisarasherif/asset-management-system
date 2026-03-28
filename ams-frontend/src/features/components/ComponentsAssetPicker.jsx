import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import { useApi } from "../../hooks/useApi";

function ComponentsAssetPicker({ onOpenAsset }) {
  const api = useApi();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get("/assets?limit=500", { signal: controller.signal })
      .then((res) => { if (!controller.signal.aborted) setAssets(res?.data || []); })
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);

  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle="Select an asset to open its components" />
      <div className="comp-layout">
        <aside className="comp-nav">
          <div className="comp-nav-hero">
            <div className="comp-nav-title">Assets</div>
            <div className="comp-nav-tags">
              <span className="comp-nav-tag">{assets.length} Total</span>
            </div>
          </div>
          <div className="comp-nav-list">
            {loading && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>Loading assets...</div>}
            {!loading && assets.map(asset => (
              <button key={asset.asset_id} className="comp-nav-item" onClick={() => onOpenAsset(asset.asset_id)}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</span>
                <span className="comp-badge dim">Open</span>
              </button>
            ))}
            {!loading && assets.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No assets found.</div>}
          </div>
        </aside>
        <section className="comp-content">
          <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12 }}>
            Choose an asset from the left pane to open its component page.
          </Card>
        </section>
      </div>
    </div>
  );

export default ComponentsAssetPicker;

