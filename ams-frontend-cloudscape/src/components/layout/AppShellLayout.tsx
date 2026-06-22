import {
  AppLayout,
  Box,
  ButtonDropdown,
  Flashbar,
  HelpPanel,
  SideNavigation,
  TopNavigation,
  type SideNavigationProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Select } from "../shared/OptimizedSelect";
import { listAllAssets, listAllClientAssets, logoutRequest } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { ProductAccess, ProductKey, Role } from "../../types/ams";

const TOP_NAV_I18N = {
  searchDismissIconAriaLabel: "Close search",
  searchIconAriaLabel: "Search",
  searchPlaceholder: "Search",
  searchClearAriaLabel: "Clear search",
  overflowMenuTriggerText: "More",
  overflowMenuTitleText: "All",
};

const APP_LAYOUT_ARIA_LABELS = {
  navigation: "Primary navigation",
  navigationClose: "Close primary navigation",
  navigationToggle: "Open primary navigation",
  notifications: "Notifications",
  tools: "Page help",
  toolsClose: "Close page help",
  toolsToggle: "Open page help",
};

const DESKTOP_NAVIGATION_QUERY = "(min-width: 1101px)";

type NavigationItem = {
  href: string;
  text: string;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

function roleDisplayName(role: Role | undefined) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Top Administrator";
    case "ADMIN":
      return "Administrator";
    case "USER":
      return "User";
    case "CLIENT":
      return "Client";
    default:
      return "User";
  }
}

function fallbackName(role: Role | undefined) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Administrator";
    case "CLIENT":
      return "Client";
    default:
      return "User";
  }
}

function initialsForName(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

function isDesktopNavigation() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_NAVIGATION_QUERY).matches;
}

function getHelpPanelContent(pathname: string) {
  if (pathname.startsWith("/hr-admin")) {
    return {
      title: "HR/Admin",
      content:
        "Use this product area for company responsibility records across persons, vehicles, companies, and their compliance renewals.",
    };
  }

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
        "Review notification jobs, inspect send failures, and run the certificate expiry scheduler manually when the cron schedule should not wait.",
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
    title: "AMS",
    content:
      "This app is structured around asset-first navigation and session-backed access to the live AMS API.",
  };
}

function productLabel(productKey: ProductKey) {
  switch (productKey) {
    case "HR_ADMIN":
      return "HR/Admin";
    case "AMS":
    default:
      return "Asset Management";
  }
}

function productHref(productKey: ProductKey) {
  return productKey === "HR_ADMIN" ? "/hr-admin" : "/dashboard";
}

function ProductSwitcher({
  currentProductKey,
  isClient,
  products,
}: {
  currentProductKey: ProductKey;
  isClient: boolean;
  products: ProductAccess[];
}) {
  const navigate = useNavigate();

  if (isClient) {
    return <span className="product-switcher__label">Client portal</span>;
  }

  if (products.length <= 1) {
    return <span className="product-switcher__label">{productLabel(currentProductKey)}</span>;
  }

  return (
    <ButtonDropdown
      ariaLabel="Switch product"
      items={products.map((product) => ({
        id: product.product_key,
        text: product.product_name,
      }))}
      onItemClick={({ detail }) => {
        navigate(productHref(detail.id as ProductKey));
      }}
      variant="normal"
    >
      {productLabel(currentProductKey)}
    </ButtonDropdown>
  );
}

export function AppShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { clearAll, items } = useFlashbar();
  const {
    getProductRole,
    isAdmin,
    isClient,
    isSuperAdmin,
    logout,
    selectedAssetId,
    session,
    setSelectedAssetId,
  } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [desktopNavigation, setDesktopNavigation] = useState(() => isDesktopNavigation());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const isHRAdminRoute = location.pathname.startsWith("/hr-admin");
  const hrAdminRole = getProductRole("HR_ADMIN");

  const assetsQuery = useQuery({
    queryKey: [isClient ? "client-assets" : "assets", "all"],
    queryFn: isClient ? listAllClientAssets : listAllAssets,
    enabled: !isHRAdminRoute,
  });

  useEffect(() => {
    if (isHRAdminRoute) {
      return;
    }
    if (!selectedAssetId && assetsQuery.data && assetsQuery.data.length > 0) {
      setSelectedAssetId(assetsQuery.data[0].asset_id);
    }
  }, [assetsQuery.data, isHRAdminRoute, selectedAssetId, setSelectedAssetId]);

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    const closeProfileMenu = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeProfileMenu);
    return () => document.removeEventListener("mousedown", closeProfileMenu);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const syncNavigationMode = () => {
      const nextDesktopNavigation = mediaQuery.matches;
      setDesktopNavigation(nextDesktopNavigation);
      if (nextDesktopNavigation) {
        setNavigationOpen(true);
      }
    };

    syncNavigationMode();
    mediaQuery.addEventListener("change", syncNavigationMode);
    return () => mediaQuery.removeEventListener("change", syncNavigationMode);
  }, []);

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.clear();
      clearAll();
      logout();
      navigate("/login", { replace: true });
    },
  });

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

  const navigationGroups = useMemo<NavigationGroup[]>(() => {
    if (isHRAdminRoute) {
      const groups: NavigationGroup[] = [
        {
          label: "Subjects",
          items: [
            { href: "/hr-admin/persons", text: "Persons" },
            { href: "/hr-admin/vehicles", text: "Vehicles" },
            { href: "/hr-admin/companies", text: "Companies" },
          ],
        },
        {
          label: "Compliance",
          items: [{ href: "/hr-admin/records", text: "Records" }],
        },
      ];

      if (hrAdminRole === "ADMIN") {
        groups[1].items.push({ href: "/hr-admin/record-types", text: "Record types" });
        groups.push({
          label: "Operations",
          items: [
            { href: "/hr-admin/reminder-policy", text: "Reminder policy" },
            { href: "/hr-admin/notification-config", text: "Notification config" },
          ],
        });
      }

      return groups;
    }

    if (isClient) {
      return [
        {
          label: "Overview",
          items: [{ href: "/client/assets", text: "My assets" }],
        },
      ];
    }

    const groups: NavigationGroup[] = [
      {
        label: "Overview",
        items: [
          { href: "/dashboard", text: "Dashboard" },
          { href: "/assets", text: "Asset Directory" },
        ],
      },
    ];

    if (isAdmin) {
      groups.push(
        {
          label: "Configuration",
          items: [
            { href: "/templates", text: "Templates" },
            { href: "/catalog", text: "Catalog" },
            ...(isSuperAdmin
              ? [{ href: "/scheduler", text: "Scheduler" }]
              : []),
          ],
        },
        {
          label: "Management",
          items: [
            { href: "/client-access", text: "Client Access" },
            { href: "/administration", text: "Administration" },
          ],
        }
      );
    }

    return groups;
  }, [hrAdminRole, isAdmin, isClient, isHRAdminRoute, isSuperAdmin]);

  const helpPanel = getHelpPanelContent(location.pathname);
  const activeHref = location.pathname.startsWith("/hr-admin/persons")
    ? "/hr-admin/persons"
    : location.pathname.startsWith("/hr-admin/vehicles")
      ? "/hr-admin/vehicles"
      : location.pathname.startsWith("/hr-admin/companies")
        ? "/hr-admin/companies"
        : location.pathname.startsWith("/hr-admin/records")
          ? "/hr-admin/records"
          : location.pathname.startsWith("/hr-admin/record-types")
            ? "/hr-admin/record-types"
            : location.pathname.startsWith("/hr-admin/reminder-policy")
              ? "/hr-admin/reminder-policy"
              : location.pathname.startsWith("/hr-admin/notification-config")
                ? "/hr-admin/notification-config"
                : location.pathname === "/hr-admin"
                  ? "/hr-admin"
                  : location.pathname.startsWith("/assets")
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
  const sideNavigationItems = useMemo<SideNavigationProps.Item[]>(
    () =>
      navigationGroups.map((group) => ({
        type: "section-group",
        title: group.label,
        items: group.items.map((item) => ({
          type: "link",
          text: item.text,
          href: item.href,
        })),
      })),
    [navigationGroups]
  );
  const fullName = `${session?.firstName || ""} ${session?.lastName || ""}`.trim();
  const profileName = fullName || fallbackName(session?.role);
  const profileRole = roleDisplayName(session?.role);
  const profileInitials = initialsForName(profileName);

  return (
    <AppLayout
      ariaLabels={APP_LAYOUT_ARIA_LABELS}
      content={<div className="app-layout-content"><Outlet /></div>}
      navigation={
        <div className={isHRAdminRoute ? "brand-sidebar brand-sidebar--hr-admin" : "brand-sidebar"}>
          <SideNavigation
            activeHref={activeHref}
            className="brand-sidebar__side-navigation"
            items={sideNavigationItems}
            itemsControl={
              isHRAdminRoute ? (
                <div className="brand-sidebar__product">
                  <span className="brand-sidebar__asset-label">Product</span>
                  <strong>HR/Admin</strong>
                  <span>Compliance registry</span>
                </div>
              ) : (
                <div className="brand-sidebar__asset">
                  <span className="brand-sidebar__asset-label">Current asset</span>
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
              )
            }
            onFollow={(event) => {
              event.preventDefault();
              navigate(event.detail.href);
            }}
          />
          <div className="brand-sidebar__profile" ref={profileMenuRef}>
            {profileMenuOpen ? (
              <div className="brand-sidebar__profile-menu" role="menu">
                <button
                  className="brand-sidebar__profile-menu-item"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    navigate("/account");
                  }}
                  role="menuitem"
                  type="button"
                >
                  Account
                </button>
                <button
                  className="brand-sidebar__profile-menu-item"
                  disabled={logoutMutation.isPending}
                  onClick={() => {
                    if (!logoutMutation.isPending) {
                      logoutMutation.mutate();
                    }
                  }}
                  role="menuitem"
                  type="button"
                >
                  Sign out
                </button>
              </div>
            ) : null}
            <button
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              className="brand-sidebar__profile-trigger"
              onClick={() => setProfileMenuOpen((open) => !open)}
              type="button"
            >
              <span className="brand-sidebar__avatar" aria-hidden="true">
                {profileInitials}
              </span>
              <span className="brand-sidebar__profile-copy">
                <span className="brand-sidebar__profile-name">{profileName}</span>
                <span className="brand-sidebar__profile-role">{profileRole}</span>
              </span>
            </button>
          </div>
        </div>
      }
      navigationOpen={desktopNavigation ? true : navigationOpen}
      notifications={<Flashbar items={items} stackItems />}
      stickyNotifications
      tools={
        <HelpPanel header={<h2>{helpPanel.title}</h2>}>
          <Box color="text-body-secondary">{helpPanel.content}</Box>
        </HelpPanel>
      }
      toolsOpen={toolsOpen}
      onNavigationChange={({ detail }) => {
        setNavigationOpen(desktopNavigation ? true : detail.open);
      }}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      headerSelector="#top-navigation"
    />
  );
}

export function AppChrome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isClient, products, session } = useAuth();
  const currentProductKey: ProductKey = location.pathname.startsWith("/hr-admin") ? "HR_ADMIN" : "AMS";

  return (
    <>
      <div id="top-navigation">
        <TopNavigation
          i18nStrings={TOP_NAV_I18N}
          identity={{
            href: session?.role === "CLIENT" ? "/client/assets" : "/dashboard",
            logo: {
              alt: "Porto Marine Services",
              src: "/porto-marine-logo.svg",
            },
            onFollow: (event) => {
              event.preventDefault();
              navigate(session?.role === "CLIENT" ? "/client/assets" : "/dashboard");
            },
          }}
        />
        <div className="product-switcher">
          <ProductSwitcher currentProductKey={currentProductKey} isClient={isClient} products={products} />
        </div>
      </div>
      <AppShellLayout />
    </>
  );
}
