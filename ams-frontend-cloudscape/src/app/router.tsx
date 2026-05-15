/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
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

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoading>Loading the next page...</PageLoading>}>
      {children}
    </Suspense>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (!isAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

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
