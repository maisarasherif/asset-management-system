import { createBrowserRouter, Navigate } from "react-router-dom";
import { RouteErrorPage } from "../components/shared/RouteErrorPage";
import { LoginPage } from "../features/auth/LoginPage";
import {
  AccountPage,
  AdministrationPage,
  AppChrome,
  AssetFormPage,
  AssetRoutineMaintenancePage,
  AssetWorkspacePage,
  AssetsDirectoryPage,
  CatalogPage,
  CertificateDetailPage,
  CertificateFormPage,
  ClientAccessPage,
  ClientAssetViewPage,
  ClientAssetsPage,
  ComponentFormPage,
  DashboardPage,
  ForgotPasswordPage,
  GuestOnly,
  RequireAdmin,
  RequireAuth,
  RequireSuperAdmin,
  RouteSuspense,
  ResetPasswordPage,
  SchedulerManagementPage,
  TemplateConfigurePage,
  TemplateCreatePage,
  TemplateDetailPage,
  TemplatesPage,
} from "./route-components";

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
    path: "/forgot-password",
    errorElement: <RouteErrorPage />,
    element: (
      <GuestOnly>
        <RouteSuspense>
          <ForgotPasswordPage />
        </RouteSuspense>
      </GuestOnly>
    ),
  },
  {
    path: "/reset-password",
    errorElement: <RouteErrorPage />,
    element: (
      <GuestOnly>
        <RouteSuspense>
          <ResetPasswordPage />
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
        path: "scheduler",
        element: (
          <RequireSuperAdmin>
            <RouteSuspense>
              <SchedulerManagementPage />
            </RouteSuspense>
          </RequireSuperAdmin>
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
