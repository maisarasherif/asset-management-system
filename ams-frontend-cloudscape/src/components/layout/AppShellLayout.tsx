import {
  AppLayout,
  Box,
  Flashbar,
  HelpPanel,
  TopNavigation,
} from "@cloudscape-design/components";
import {
  IconCalendarTime,
  IconCategory2,
  IconFolder,
  IconLayoutDashboard,
  IconShieldCog,
  IconTemplate,
  IconUsers,
  IconBriefcase,
  type Icon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Select } from "../shared/OptimizedSelect";
import { listAllAssets, listAllClientAssets, logoutRequest } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Role } from "../../types/ams";

const TOP_NAV_I18N = {
  searchDismissIconAriaLabel: "Close search",
  searchIconAriaLabel: "Search",
  searchPlaceholder: "Search",
  searchClearAriaLabel: "Clear search",
  overflowMenuTriggerText: "More",
  overflowMenuTitleText: "All",
};

type NavigationItem = {
  href: string;
  icon: Icon;
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
    title: "AMS",
    content:
      "This app is structured around asset-first navigation and session-backed access to the live AMS API.",
  };
}

export function AppShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { clearAll, items } = useFlashbar();
  const { isAdmin, isClient, logout, selectedAssetId, session, setSelectedAssetId } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const assetsQuery = useQuery({
    queryKey: [isClient ? "client-assets" : "assets", "all"],
    queryFn: isClient ? listAllClientAssets : listAllAssets,
  });

  useEffect(() => {
    if (!selectedAssetId && assetsQuery.data && assetsQuery.data.length > 0) {
      setSelectedAssetId(assetsQuery.data[0].asset_id);
    }
  }, [assetsQuery.data, selectedAssetId, setSelectedAssetId]);

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
    if (isClient) {
      return [
        {
          label: "Overview",
          items: [{ href: "/client/assets", icon: IconBriefcase, text: "My assets" }],
        },
      ];
    }

    const groups: NavigationGroup[] = [
      {
        label: "Overview",
        items: [
          { href: "/dashboard", icon: IconLayoutDashboard, text: "Dashboard" },
          { href: "/assets", icon: IconFolder, text: "Asset Directory" },
        ],
      },
    ];

    if (isAdmin) {
      groups.push(
        {
          label: "Configuration",
          items: [
            { href: "/templates", icon: IconTemplate, text: "Templates" },
            { href: "/catalog", icon: IconCategory2, text: "Catalog" },
            { href: "/scheduler", icon: IconCalendarTime, text: "Scheduler" },
          ],
        },
        {
          label: "Management",
          items: [
            { href: "/client-access", icon: IconUsers, text: "Client Access" },
            { href: "/administration", icon: IconShieldCog, text: "Administration" },
          ],
        }
      );
    }

    return groups;
  }, [isAdmin, isClient]);

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
  const fullName = `${session?.firstName || ""} ${session?.lastName || ""}`.trim();
  const profileName = fullName || fallbackName(session?.role);
  const profileRole = roleDisplayName(session?.role);
  const profileInitials = initialsForName(profileName);

  return (
    <AppLayout
      content={<div className="app-layout-content"><Outlet /></div>}
      navigation={
        <div className="brand-sidebar">
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
          <nav className="brand-sidebar__nav" aria-label="Primary navigation">
            {navigationGroups.map((group) => (
              <div className="brand-sidebar__group" key={group.label}>
                <div className="brand-sidebar__group-label">{group.label}</div>
                <div className="brand-sidebar__group-items">
                  {group.items.map((item) => {
                    const isActive = activeHref === item.href;
                    const ItemIcon = item.icon;

                    return (
                      <button
                        aria-current={isActive ? "page" : undefined}
                        className={`brand-sidebar__nav-item${isActive ? " is-active" : ""}`}
                        key={item.href}
                        onClick={() => navigate(item.href)}
                        type="button"
                      >
                        <ItemIcon aria-hidden="true" size={19} stroke={1.8} />
                        <span>{item.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
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
  const { session } = useAuth();

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
      </div>
      <AppShellLayout />
    </>
  );
}
