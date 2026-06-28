import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageLoading } from "../components/shared/PageStates";
import { useAuth } from "../providers/auth-context";

export const AppChrome = lazy(() =>
  import("../components/layout/AppShellLayout").then((module) => ({
    default: module.AppChrome,
  }))
);

export const DashboardPage = lazy(() =>
  import("../features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  }))
);

export const AssetsDirectoryPage = lazy(() =>
  import("../features/assets/AssetsDirectoryPage").then((module) => ({
    default: module.AssetsDirectoryPage,
  }))
);

export const AssetFormPage = lazy(() =>
  import("../features/assets/AssetFormPage").then((module) => ({
    default: module.AssetFormPage,
  }))
);

export const AssetWorkspacePage = lazy(() =>
  import("../features/assets/AssetWorkspacePage").then((module) => ({
    default: module.AssetWorkspacePage,
  }))
);

export const AssetRoutineMaintenancePage = lazy(() =>
  import("../features/assets/AssetRoutineMaintenancePage").then((module) => ({
    default: module.AssetRoutineMaintenancePage,
  }))
);

export const ComponentFormPage = lazy(() =>
  import("../features/assets/ComponentFormPage").then((module) => ({
    default: module.ComponentFormPage,
  }))
);

export const CertificateFormPage = lazy(() =>
  import("../features/assets/CertificateFormPage").then((module) => ({
    default: module.CertificateFormPage,
  }))
);

export const CertificateDetailPage = lazy(() =>
  import("../features/assets/CertificateDetailPage").then((module) => ({
    default: module.CertificateDetailPage,
  }))
);

export const TemplatesPage = lazy(() =>
  import("../features/templates/TemplatesPage").then((module) => ({
    default: module.TemplatesPage,
  }))
);

export const TemplateCreatePage = lazy(() =>
  import("../features/templates/TemplateCreatePage").then((module) => ({
    default: module.TemplateCreatePage,
  }))
);

export const TemplateDetailPage = lazy(() =>
  import("../features/templates/TemplateDetailPage").then((module) => ({
    default: module.TemplateDetailPage,
  }))
);

export const TemplateConfigurePage = lazy(() =>
  import("../features/templates/TemplateConfigurePage").then((module) => ({
    default: module.TemplateConfigurePage,
  }))
);

export const CatalogPage = lazy(() =>
  import("../features/catalog/CatalogPage").then((module) => ({
    default: module.CatalogPage,
  }))
);

export const AccountPage = lazy(() =>
  import("../features/account/AccountPage").then((module) => ({
    default: module.AccountPage,
  }))
);

export const AdministrationPage = lazy(() =>
  import("../features/admin/AdministrationPage").then((module) => ({
    default: module.AdministrationPage,
  }))
);

export const ClientAccessPage = lazy(() =>
  import("../features/admin/ClientAccessPage").then((module) => ({
    default: module.ClientAccessPage,
  }))
);

export const SchedulerManagementPage = lazy(() =>
  import("../features/admin/SchedulerManagementPage").then((module) => ({
    default: module.SchedulerManagementPage,
  }))
);

export const HRAdminOverviewPage = lazy(() =>
  import("../features/hr-admin/HRAdminOverviewPage").then((module) => ({
    default: module.HRAdminOverviewPage,
  }))
);

export const HRAdminPersonsPage = lazy(() =>
  import("../features/hr-admin/HRAdminPersonsPage").then((module) => ({
    default: module.HRAdminPersonsPage,
  }))
);

export const HRAdminVehiclesPage = lazy(() =>
  import("../features/hr-admin/HRAdminVehiclesPage").then((module) => ({
    default: module.HRAdminVehiclesPage,
  }))
);

export const HRAdminRecordsPage = lazy(() =>
  import("../features/hr-admin/HRAdminRecordsPage").then((module) => ({
    default: module.HRAdminRecordsPage,
  }))
);

export const HRAdminRecordTypesPage = lazy(() =>
  import("../features/hr-admin/HRAdminRecordTypesPage").then((module) => ({
    default: module.HRAdminRecordTypesPage,
  }))
);

export const ClientAssetsPage = lazy(() =>
  import("../features/client/ClientAssetsPage").then((module) => ({
    default: module.ClientAssetsPage,
  }))
);

export const ClientAssetViewPage = lazy(() =>
  import("../features/client/ClientAssetViewPage").then((module) => ({
    default: module.ClientAssetViewPage,
  }))
);

export const ForgotPasswordPage = lazy(() =>
  import("../features/auth/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  }))
);

export const ResetPasswordPage = lazy(() =>
  import("../features/auth/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  }))
);

export function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoading>{"Loading the next page\u2026"}</PageLoading>}>
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

export function RequireAuth({ children }: { children: ReactNode }) {
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

export function RequireAdmin({ children }: { children: ReactNode }) {
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

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSessionLoading, isSuperAdmin } = useAuth();

  if (isSessionLoading) {
    return <AuthCheckPage />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (!isSuperAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

export function RequireProductAccess({ children }: { children: ReactNode }) {
  const { hasProductAccess, isAuthenticated, isProductAccessLoading, isSessionLoading } = useAuth();

  if (isSessionLoading || isProductAccessLoading) {
    return <AuthCheckPage />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (!hasProductAccess("HR_ADMIN", ["ADMIN", "USER", "VIEWER"])) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

export function RequireHRAdminAdmin({ children }: { children: ReactNode }) {
  const { hasProductAccess, isAuthenticated, isProductAccessLoading, isSessionLoading } = useAuth();

  if (isSessionLoading || isProductAccessLoading) {
    return <AuthCheckPage />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (!hasProductAccess("HR_ADMIN", ["ADMIN"])) {
    return <Navigate replace to="/hr-admin" />;
  }

  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSessionLoading } = useAuth();

  if (isSessionLoading) {
    return <AuthCheckPage />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}
