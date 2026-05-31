import {
  AppLayout,
  Box,
  Flashbar,
  HelpPanel,
  SideNavigation,
  SpaceBetween,
  TopNavigation,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Select } from "../shared/OptimizedSelect";
import { listAllAssets, listAllClientAssets, logoutRequest } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";

const TOP_NAV_I18N = {
  searchDismissIconAriaLabel: "Close search",
  searchIconAriaLabel: "Search",
  searchPlaceholder: "Search",
  searchClearAriaLabel: "Clear search",
  overflowMenuTriggerText: "More",
  overflowMenuTitleText: "All",
};

function getHelpPanelContent(pathname: string) {
  if (pathname.startsWith("/dashboard")) {
    return {
      title: "Asset dashboard",
      content:
        "This dashboard is scoped to the selected asset. Change the asset from the left navigation to update the donut summary and operational lists.",
    };
  }

  if (pathname === "/assets") {
    return {
      title: "Assets directory",
      content:
        "Use this page to create assets and jump into the operational workspace for a specific asset.",
    };
  }

  if (pathname.includes("/routine-maintenance")) {
    return {
      title: "Routine maintenance",
      content:
        "Track working hours, review maintenance thresholds, and close routine maintenance events for the selected asset.",
    };
  }

  if (pathname.startsWith("/assets/")) {
    return {
      title: "Asset workspace",
      content:
        "The asset page is the primary workspace. Review asset details, select a component from the left pane, and manage that component's certificates on the right.",
    };
  }

  if (pathname.startsWith("/templates")) {
    return {
      title: "Templates",
      content:
        "Templates define the component blueprint and default certificate tests for new assets. Use Configure to stage the component and test design before it is applied.",
    };
  }

  if (pathname.startsWith("/catalog")) {
    return {
      title: "Catalog",
      content:
        "The catalog powers template and certificate workflows. Manage main categories, categories, and test types here before configuring templates.",
    };
  }

  if (pathname.startsWith("/client-access")) {
    return {
      title: "Client access",
      content:
        "Create project records, connect client users to active projects, and suspend access when a project closes.",
    };
  }

  if (pathname.startsWith("/scheduler")) {
    return {
      title: "Scheduler management",
      content:
        "Review certificate notification outcomes, inspect send failures, and clear notification history for a certificate when an administrator needs the scheduler to notify again.",
    };
  }

  if (pathname.startsWith("/administration")) {
    return {
      title: "Administration",
      content:
        "Manage system users, competent persons, and competency categories that are required for certificate upload audit history.",
    };
  }

  return {
    title: "AMS Cloudscape",
    content:
      "This app is structured around asset-first navigation, Cloudscape page composition, and session-backed access to the live AMS API.",
  };
}

export function AppShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { items } = useFlashbar();
  const { isAdmin, isClient, selectedAssetId, setSelectedAssetId } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);

  const assetsQuery = useQuery({
    queryKey: [isClient ? "client-assets" : "assets", "all"],
    queryFn: isClient ? listAllClientAssets : listAllAssets,
  });

  useEffect(() => {
    if (!selectedAssetId && assetsQuery.data && assetsQuery.data.length > 0) {
      setSelectedAssetId(assetsQuery.data[0].asset_id);
    }
  }, [assetsQuery.data, selectedAssetId, setSelectedAssetId]);

  const assetOptions = useMemo(
    () =>
      (assetsQuery.data || []).map((asset) => ({
        label: `${asset.display_id} - ${asset.name}`,
        value: asset.asset_id,
      })),
    [assetsQuery.data]
  );

  const selectedAssetOption =
    assetOptions.find((option) => option.value === selectedAssetId) ?? null;

  const helpPanel = getHelpPanelContent(location.pathname);
  const activeHref = location.pathname.startsWith("/assets")
    ? "/assets"
    : location.pathname.startsWith("/client/assets")
      ? "/client/assets"
      : location.pathname.startsWith("/templates")
        ? "/templates"
        : location.pathname.startsWith("/catalog")
          ? "/catalog"
          : location.pathname.startsWith("/client-access")
            ? "/client-access"
            : location.pathname.startsWith("/scheduler")
              ? "/scheduler"
              : location.pathname.startsWith("/administration")
                ? "/administration"
                : location.pathname;

  return (
    <AppLayout
      content={<div className="app-layout-content"><Outlet /></div>}
      navigation={
        <SpaceBetween direction="vertical" size="l">
          <div className="navigation-panel">
            <Box variant="awsui-key-label">Current asset</Box>
            <Select
              ariaLabel="Select asset"
              disabled={assetsQuery.isLoading || assetOptions.length === 0}
              loadingText="Loading assets"
              options={assetOptions}
              placeholder="Select an asset"
              selectedOption={selectedAssetOption}
              statusType={assetsQuery.isLoading ? "loading" : "finished"}
              onChange={({ detail }) => {
                const nextAssetId = detail.selectedOption.value ?? null;
                setSelectedAssetId(nextAssetId);

                if (!nextAssetId) return;

                if (isClient) {
                  navigate(`/client/assets/${nextAssetId}`);
                  return;
                }

                if (location.pathname.includes("/routine-maintenance")) {
                  navigate(`/assets/${nextAssetId}/routine-maintenance`);
                  return;
                }

                if (location.pathname.startsWith("/assets/") && !location.pathname.endsWith("/new")) {
                  navigate(`/assets/${nextAssetId}`);
                  return;
                }

                navigate("/dashboard");
              }}
            />
          </div>
          <SideNavigation
            activeHref={activeHref}
            header={{ href: isClient ? "/client/assets" : "/dashboard", text: "AMS Cloudscape" }}
            items={
              isClient
                ? [
                    { type: "link", text: "My assets", href: "/client/assets" },
                    { type: "link", text: "Account", href: "/account" },
                  ]
                : [
                    { type: "link", text: "Dashboard", href: "/dashboard" },
                    { type: "link", text: "Assets directory", href: "/assets" },
                    ...(isAdmin
	                      ? [
	                          { type: "link" as const, text: "Templates", href: "/templates" },
	                          { type: "link" as const, text: "Catalog", href: "/catalog" },
	                          { type: "link" as const, text: "Administration", href: "/administration" },
	                          { type: "link" as const, text: "Client access", href: "/client-access" },
	                          { type: "link" as const, text: "Scheduler", href: "/scheduler" },
	                        ]
                      : []),
                    { type: "link", text: "Account", href: "/account" },
                  ]
            }
            onFollow={(event) => {
              event.preventDefault();
              if (event.detail.href) {
                navigate(event.detail.href);
              }
            }}
          />
        </SpaceBetween>
      }
      navigationOpen={navigationOpen}
      notifications={<Flashbar items={items} stackItems />}
      stickyNotifications
      tools={
        <HelpPanel header={<h2>{helpPanel.title}</h2>}>
          <Box color="text-body-secondary">{helpPanel.content}</Box>
        </HelpPanel>
      }
      toolsOpen={toolsOpen}
      onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      headerSelector="#top-navigation"
    />
  );
}

export function AppChrome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearAll } = useFlashbar();
  const { logout, session } = useAuth();
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.clear();
      clearAll();
      logout();
      navigate("/login", { replace: true });
    },
  });
  const fullName = `${session?.firstName || ""} ${session?.lastName || ""}`.trim();

  return (
    <>
      <div id="top-navigation">
        <TopNavigation
          i18nStrings={TOP_NAV_I18N}
          identity={{
            href: session?.role === "CLIENT" ? "/client/assets" : "/dashboard",
            title: "Asset Management System",
            onFollow: (event) => {
              event.preventDefault();
              navigate(session?.role === "CLIENT" ? "/client/assets" : "/dashboard");
            },
          }}
          utilities={[
            {
              type: "menu-dropdown",
              iconName: "user-profile",
              text: fullName || "Account",
              description: session?.email,
              items: [
                { id: "account", text: "Account" },
                { id: "logout", text: "Sign out" },
              ],
              onItemClick: ({ detail }) => {
                if (detail.id === "logout") {
                  if (!logoutMutation.isPending) {
                    logoutMutation.mutate();
                  }
                  return;
                }

                if (detail.id === "account") {
                  navigate("/account");
                }
              },
            },
          ]}
        />
      </div>
      <AppShellLayout />
    </>
  );
}
