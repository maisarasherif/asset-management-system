import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppChrome } from "../components/layout/AppShellLayout";
import { PlaceholderPage } from "../components/shared/PlaceholderPage";
import { RouteErrorPage } from "../components/shared/RouteErrorPage";
import { AccountPage } from "../features/account/AccountPage";
import { AssetFormPage } from "../features/assets/AssetFormPage";
import { AssetsDirectoryPage } from "../features/assets/AssetsDirectoryPage";
import { AssetWorkspacePage } from "../features/assets/AssetWorkspacePage";
import { CertificateDetailPage } from "../features/assets/CertificateDetailPage";
import { CertificateFormPage } from "../features/assets/CertificateFormPage";
import { ComponentFormPage } from "../features/assets/ComponentFormPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { useAuth } from "../providers/AuthProvider";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
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
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <AppChrome />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <Navigate replace to="/dashboard" />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "assets",
        element: <AssetsDirectoryPage />,
      },
      {
        path: "assets/new",
        element: <AssetFormPage />,
      },
      {
        path: "assets/:assetId",
        element: <AssetWorkspacePage />,
      },
      {
        path: "assets/:assetId/edit",
        element: <AssetFormPage />,
      },
      {
        path: "assets/:assetId/components/new",
        element: <ComponentFormPage />,
      },
      {
        path: "assets/:assetId/components/:componentId/edit",
        element: <ComponentFormPage />,
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/new",
        element: <CertificateFormPage />,
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/:certificateId",
        element: <CertificateDetailPage />,
      },
      {
        path: "assets/:assetId/components/:componentId/certificates/:certificateId/edit",
        element: <CertificateFormPage />,
      },
      {
        path: "templates",
        element: (
          <PlaceholderPage
            description="Templates are planned for the next implementation pass. This route is reserved for the admin template workspace."
            title="Templates"
          />
        ),
      },
      {
        path: "templates/new",
        element: (
          <PlaceholderPage
            description="Template creation will land in the Phase 2 admin workspace."
            title="Create template"
          />
        ),
      },
      {
        path: "templates/:templateId",
        element: (
          <PlaceholderPage
            description="Template detail will be implemented with the configuration workflow in Phase 2."
            title="Template detail"
          />
        ),
      },
      {
        path: "templates/:templateId/configure",
        element: (
          <PlaceholderPage
            description="Template configuration will use a staged wizard in the next pass."
            title="Configure template"
          />
        ),
      },
      {
        path: "catalog",
        element: (
          <PlaceholderPage
            description="Catalog management for categories and test types is reserved for the next pass."
            title="Catalog"
          />
        ),
      },
      {
        path: "account",
        element: <AccountPage />,
      },
    ],
  },
]);
