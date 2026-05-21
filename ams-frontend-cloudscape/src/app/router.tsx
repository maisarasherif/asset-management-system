/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { PageLoading } from "../components/shared/PageStates";
import { RouteErrorPage } from "../components/shared/RouteErrorPage";
import { useAuth } from "../providers/auth-context";
import { LoginPage } from "../features/auth/LoginPage";

const AppChrome = lazy(() =>
  import("../components/layout/AppShellLayout").then((module) => ({
    default: module.AppChrome,
  }))
);

const DashboardPage = lazy(() =>
  import("../features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  }))
);
const AssetsDirectoryPage = lazy(() =>
  import("../features/assets/AssetsDirectoryPage").then((module) => ({
    default: module.AssetsDirectoryPage,
  }))
);
const AssetFormPage = lazy(() =>
  import("../features/assets/AssetFormPage").then((module) => ({
    default: module.AssetFormPage,
  }))
);
const AssetWorkspacePage = lazy(() =>
  import("../features/assets/AssetWorkspacePage").then((module) => ({
    default: module.AssetWorkspacePage,
  }))
);
const AssetRoutineMaintenancePage = lazy(() =>
  import("../features/assets/AssetRoutineMaintenancePage").then((module) => ({
    default: module.AssetRoutineMaintenancePage,
  }))
);
const ComponentFormPage = lazy(() =>
  import("../features/assets/ComponentFormPage").then((module) => ({
    default: module.ComponentFormPage,
  }))
);
const CertificateFormPage = lazy(() =>
  import("../features/assets/CertificateFormPage").then((module) => ({
    default: module.CertificateFormPage,
  }))
);
const CertificateDetailPage = lazy(() =>
  import("../features/assets/CertificateDetailPage").then((module) => ({
    default: module.CertificateDetailPage,
  }))
);
const TemplatesPage = lazy(() =>
  import("../features/templates/TemplatesPage").then((module) => ({
    default: module.TemplatesPage,
  }))
);
const TemplateCreatePage = lazy(() =>
  import("../features/templates/TemplateCreatePage").then((module) => ({
    default: module.TemplateCreatePage,
  }))
);
const TemplateDetailPage = lazy(() =>
  import("../features/templates/TemplateDetailPage").then((module) => ({
    default: module.TemplateDetailPage,
  }))
);
const TemplateConfigurePage = lazy(() =>
  import("../features/templates/TemplateConfigurePage").then((module) => ({
    default: module.TemplateConfigurePage,
  }))
);
const CatalogPage = lazy(() =>
  import("../features/catalog/CatalogPage").then((module) => ({
    default: module.CatalogPage,
  }))
);
const AccountPage = lazy(() =>
  import("../features/account/AccountPage").then((module) => ({
    default: module.AccountPage,
  }))
);
const AdministrationPage = lazy(() =>
  import("../features/admin/AdministrationPage").then((module) => ({
    default: module.AdministrationPage,
  }))
);
const ClientAccessPage = lazy(() =>
  import("../features/admin/ClientAccessPage").then((module) => ({
    default: module.ClientAccessPage,
  }))
);
const ClientAssetsPage = lazy(() =>
  import("../features/client/ClientAssetsPage").then((module) => ({
    default: module.ClientAssetsPage,
  }))
);
const ClientAssetViewPage = lazy(() =>
  import("../features/client/ClientAssetViewPage").then((module) => ({
    default: module.ClientAssetViewPage,
  }))
);

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoading>Loading the next page...</PageLoading>}>
      {children}
    </Suspense>
  );
}

function AuthCheckPage() {
  return (
    <main className="auth-check-page" aria-busy="true" aria-live="polite">
      <div className="auth-check-page__content">
        <div className="auth-check-page__spinner" aria-hidden="true" />
        <div className="auth-check-page__title">Checking authentication</div>
      </div>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
	const { isAuthenticated, isClient, isSessionLoading } = useAuth();
	const location = useLocation();

	if (isSessionLoading) {
		return <AuthCheckPage />;
	}

	if (!isAuthenticated) {
		return <Navigate replace to="/login" />;
	}

  if (isClient && !location.pathname.startsWith("/client") && location.pathname !== "/account") {
    return <Navigate replace to="/client/assets" />;
  }

  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
	const { isAdmin, isAuthenticated, isSessionLoading } = useAuth();

	if (isSessionLoading) {
		return <AuthCheckPage />;
	}

	if (!isAuthenticated) {
		return <Navigate replace to="/login" />;
	}

  if (!isAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
	const { isAuthenticated, isSessionLoading } = useAuth();

	if (isSessionLoading) {
		return <AuthCheckPage />;
	}

	if (isAuthenticated) {
		return <Navigate replace to="/dashboard" />;
  }

  return children;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    errorElement: <RouteErrorPage />,
    element: (
      <GuestOnly>
        <RouteSuspense>
          <LoginPage />
        </RouteSuspense>
      </GuestOnly>
    ),
  },
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <RouteSuspense>
          <AppChrome />
        </RouteSuspense>
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <Navigate replace to="/dashboard" />,
      },
      {
        path: "client/assets",
        element: (
          <RouteSuspense>
            <ClientAssetsPage />
          </RouteSuspense>
        ),
      },
      {
        path: "client/assets/:assetId",
        element: (
          <RouteSuspense>
            <ClientAssetViewPage />
          </RouteSuspense>
        ),
      },
      {
        path: "dashboard",
        element: (
          <RouteSuspense>
            <DashboardPage />
          </RouteSuspense>
        ),
      },
      {
        path: "assets",
        element: (
          <RouteSuspense>
            <AssetsDirectoryPage />
          </RouteSuspense>
        ),
      },
      {
        path: "assets/new",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <AssetFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "assets/:assetId",
        element: (
          <RouteSuspense>
            <AssetWorkspacePage />
          </RouteSuspense>
        ),
      },
      {
        path: "assets/:assetId/routine-maintenance",
        element: (
          <RouteSuspense>
            <AssetRoutineMaintenancePage />
          </RouteSuspense>
        ),
      },
      {
        path: "assets/:assetId/edit",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <AssetFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "assets/:assetId/components/new",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <ComponentFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "assets/:assetId/components/:componentId/edit",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <ComponentFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/new",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <CertificateFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/:certificateId",
        element: (
          <RouteSuspense>
            <CertificateDetailPage />
          </RouteSuspense>
        ),
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/:certificateId/edit",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <CertificateFormPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "templates",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <TemplatesPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "templates/new",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <TemplateCreatePage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "templates/:templateId",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <TemplateDetailPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "templates/:templateId/configure",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <TemplateConfigurePage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "catalog",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <CatalogPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "administration",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <AdministrationPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "client-access",
        element: (
          <RequireAdmin>
            <RouteSuspense>
              <ClientAccessPage />
            </RouteSuspense>
          </RequireAdmin>
        ),
      },
      {
        path: "account",
        element: (
          <RouteSuspense>
            <AccountPage />
          </RouteSuspense>
        ),
      },
    ],
  },
]);
