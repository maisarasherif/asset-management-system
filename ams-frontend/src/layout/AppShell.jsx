import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { DEFAULT_PAGE } from "../constants";
import TopBar from "./TopBar";

const pageImporters = {
  dashboard: () => import("../features/dashboard/Dashboard"),
  assets: () => import("../features/assets/AssetsPage"),
  components: () => import("../features/components/ComponentsPage"),
  certificates: () => import("../features/certificates/CertificatesPage"),
  certificateDetails: () => import("../features/certificates/CertificateDetailsPage"),
  categories: () => import("../features/categories/CategoriesPage"),
  testTypes: () => import("../features/test-types/TestTypesPage"),
  users: () => import("../features/users/UsersPage"),
};

const Dashboard = lazy(pageImporters.dashboard);
const AssetsPage = lazy(pageImporters.assets);
const ComponentsPage = lazy(pageImporters.components);
const CertificatesPage = lazy(pageImporters.certificates);
const CertificateDetailsPage = lazy(pageImporters.certificateDetails);
const CategoriesPage = lazy(pageImporters.categories);
const TestTypesPage = lazy(pageImporters.testTypes);
const UsersPage = lazy(pageImporters.users);

const prefetchedPages = new Set();

function preloadPage(pageName) {
  const importer = pageImporters[pageName];
  if (!importer || prefetchedPages.has(pageName)) return;
  prefetchedPages.add(pageName);
  importer().catch(() => {
    prefetchedPages.delete(pageName);
  });
}

function getLikelyNextPages(pageName) {
  switch (pageName) {
    case "dashboard":
      return ["components", "assets", "users"];
    case "assets":
      return ["components", "dashboard"];
    case "components":
      return ["dashboard", "assets", "certificates"];
    case "certificates":
      return ["components", "dashboard"];
    case "users":
      return ["dashboard", "assets"];
    default:
      return ["dashboard"];
  }
}

function PageFallback() {
  return (
    <div className="fade-in">
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          boxShadow: "var(--shadow-sm)",
          padding: 20,
          color: "var(--text-2)",
          fontSize: 12,
        }}
      >
        Loading page...
      </div>
    </div>
  );
}

export default function AppShell() {
  const [page, setPage] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("page") || DEFAULT_PAGE;
  });
  const [selectedAssetId, setSelectedAssetId] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("assetId") || "";
  });
  const [initialComponentId, setInitialComponentId] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("componentId") || "";
  });
  const [selectedCertificateId, setSelectedCertificateId] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("certificateId") || "";
  });

  const navigate = useCallback((newPage, newAssetId = "", newComponentId = "", newCertificateId = "") => {
    const params = new URLSearchParams();
    params.set("page", newPage);
    if (newAssetId) params.set("assetId", newAssetId);
    if (newComponentId) params.set("componentId", newComponentId);
    if (newCertificateId) params.set("certificateId", newCertificateId);
    window.history.pushState(
      { page: newPage, assetId: newAssetId, componentId: newComponentId, certificateId: newCertificateId },
      "",
      `?${params.toString()}`,
    );
    setPage(newPage);
    setSelectedAssetId(newAssetId);
    setInitialComponentId(newComponentId);
    setSelectedCertificateId(newCertificateId);
  }, []);

  useEffect(() => {
    const onPop = (e) => {
      const state = e.state || {};
      const sp = new URLSearchParams(window.location.search);
      setPage(state.page || sp.get("page") || DEFAULT_PAGE);
      setSelectedAssetId(state.assetId || sp.get("assetId") || "");
      setInitialComponentId(state.componentId || sp.get("componentId") || "");
      setSelectedCertificateId(state.certificateId || sp.get("certificateId") || "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const pagesToPrefetch = getLikelyNextPages(page);

    const runPrefetch = () => {
      pagesToPrefetch.forEach(preloadPage);
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(runPrefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(runPrefetch, 250);
    return () => window.clearTimeout(timeoutId);
  }, [page]);

  const topPage = ["users", "assets"].includes(page) ? page : "dashboard";

  const pages = {
    dashboard: (
      <Dashboard
        onOpenAsset={(assetID) => navigate("components", assetID)}
        onOpenComponent={(assetID, componentID) => navigate("components", assetID, componentID)}
      />
    ),
    assets: <AssetsPage />,
    components: (
      <ComponentsPage
        selectedAssetId={selectedAssetId}
        initialComponentId={initialComponentId}
        onBackToAssets={() => navigate("dashboard")}
      />
    ),
    certificates: <CertificatesPage />,
    certificateDetails: (
      <CertificateDetailsPage
        certificateId={selectedCertificateId}
        onBack={() => navigate("components", selectedAssetId, initialComponentId)}
      />
    ),
    categories: <CategoriesPage />,
    testTypes: <TestTypesPage />,
    users: <UsersPage />,
  };

  return (
    <>
      <TopBar active={topPage} onNav={(nextPage) => navigate(nextPage)} onPrefetch={preloadPage} />
      <div className="shell">
        <main className="main">
          <Suspense fallback={<PageFallback />}>
            {pages[page] || pages.dashboard}
          </Suspense>
        </main>
      </div>
    </>
  );
}
