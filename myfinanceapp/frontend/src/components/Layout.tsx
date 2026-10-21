import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Receipt,
  Building2,
  FolderTree,
  Contact,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Wallet,
  Clock,
  HardDrive,
  BarChart3,
  FileSpreadsheet,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Shield,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { alertsAPI } from "../services/api";
import Button from "./shadcn/Button";
import { Popover, PopoverTrigger, PopoverContent } from "./shadcn";
import {
  TransactionDialogProvider,
  useTransactionDialog,
} from "./TransactionDialog";

const DRAWER_WIDTH = 256;
const DRAWER_COLLAPSED_WIDTH = 72;

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { text: "Dashboard", icon: LayoutDashboard, path: "/" },
      { text: "Accounts", icon: Building2, path: "/accounts" },
      { text: "Transactions", icon: Receipt, path: "/transactions" },
      { text: "Categories", icon: FolderTree, path: "/categories" },
      { text: "Recipients", icon: Contact, path: "/recipients" },
    ],
  },
  {
    label: "Planning",
    items: [
      { text: "Budgets", icon: Wallet, path: "/budgets" },
      { text: "Envelopes", icon: PiggyBank, path: "/envelopes" },
    ],
  },
  {
    label: "Assets",
    items: [
      { text: "Investments", icon: TrendingUp, path: "/investments" },
      { text: "Debts", icon: CreditCard, path: "/debts" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { text: "Reports", icon: BarChart3, path: "/reports" },
      { text: "Work Hours", icon: Clock, path: "/work-hours" },
    ],
  },
  {
    label: "System",
    items: [
      { text: "Notifications", icon: Bell, path: "/notifications" },
      { text: "Reconcile", icon: FileSpreadsheet, path: "/reconcile" },
      { text: "Security", icon: Shield, path: "/security" },
      { text: "Settings", icon: Settings, path: "/settings" },
      { text: "Backup", icon: HardDrive, path: "/backup" },
    ],
  },
];

const ALL_MENU_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// Labels of the sidebar sections the user folded, remembered across visits.
const FOLDED_GROUPS_KEY = "sidebarFoldedGroups";

function readFoldedGroups(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLDED_GROUPS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// ── Add Transaction ───────────────────────────────────────────────────────────

/** Opens the same transaction window as the Transactions page. */
function AddTransactionButton() {
  const { openAdd } = useTransactionDialog();
  return (
    <button
      onClick={() => openAdd()}
      aria-label="Add transaction"
      title="Add transaction"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
    >
      <Plus className="w-4 h-4" />
      <span className="hidden sm:inline">Add</span>
    </button>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────

function NotificationBell() {
  const { data: alertHistory } = useQuery({
    queryKey: ["alert-history-bell"],
    queryFn: async () => {
      const r = await alertsAPI.getHistory(10);
      return r.data.history || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const alerts: any[] = alertHistory || [];
  const recentAlerts = alerts.slice(0, 5);
  const unreadCount = Math.min(alerts.length, 9);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg hover:bg-surface-hover text-foreground-muted hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Recent Alerts</p>
        </div>
        {recentAlerts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Bell className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
            <p className="text-sm text-foreground-muted">No recent alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentAlerts.map((alert: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {alert.alert_type || "Alert"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-0.5 line-clamp-2">
                      {alert.message || alert.details || "—"}
                    </p>
                    {alert.triggered_at && (
                      <p className="text-[10px] text-foreground-subtle mt-1">
                        {new Date(alert.triggered_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-border bg-surface-hover/30">
          <a
            href="/notifications"
            className="text-xs text-primary hover:underline"
          >
            View all notifications →
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Nav Content ───────────────────────────────────────────────────────────────

function NavContent({
  collapsed,
  location,
  onNavigate,
}: {
  collapsed: boolean;
  location: ReturnType<typeof useLocation>;
  onNavigate: (path: string) => void;
}) {
  const [foldedGroups, setFoldedGroups] = useState<string[]>(readFoldedGroups);

  const toggleGroup = (label: string) => {
    setFoldedGroups((prev) => {
      const next = prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label];
      try {
        localStorage.setItem(FOLDED_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, but folding still works for this visit.
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        {collapsed ? (
          <span className="text-xl font-bold text-foreground mx-auto">FT</span>
        ) : (
          <span className="text-xl font-bold text-foreground">
            Finance Tracker
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          // Icons-only mode has no headings to unfold with, so it shows everything.
          const folded = !collapsed && foldedGroups.includes(group.label);
          // A folded section hiding the current page keeps its heading lit.
          const holdsActive = group.items.some((item) => item.path === location.pathname);
          const groupId = `nav-group-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!folded}
                  aria-controls={groupId}
                  className={`w-full flex items-center justify-between px-3 py-0.5 mb-1 rounded text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                    folded && holdsActive
                      ? "text-primary"
                      : "text-foreground-subtle hover:text-foreground-muted"
                  }`}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${folded ? "-rotate-90" : ""}`}
                  />
                </button>
              )}
              {collapsed && gi > 0 && (
                <div className="mx-3 my-2 border-t border-border/40" />
              )}
              <div id={groupId} hidden={folded}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.text}
                      onClick={() => onNavigate(item.path)}
                      title={collapsed ? item.text : undefined}
                      aria-label={item.text}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5 ${
                        collapsed ? "justify-center" : ""
                      } ${
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary" : ""}`}
                      />
                      {!collapsed && <span>{item.text}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallLaptop, setIsSmallLaptop] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      const smallLaptop = width >= 768 && width < 1280;
      setIsSmallLaptop(smallLaptop);
      if (smallLaptop && !localStorage.getItem("sidebarManualExpand")) {
        setSidebarCollapsed(true);
      }
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleSidebarCollapse = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    if (isSmallLaptop) {
      if (!newState) {
        localStorage.setItem("sidebarManualExpand", "true");
      } else {
        localStorage.removeItem("sidebarManualExpand");
      }
    }
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const currentPage = ALL_MENU_ITEMS.find(
    (item) => item.path === location.pathname,
  );
  const drawerWidth = sidebarCollapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    // The transaction window opened by "Add" here and by the pages below.
    <TransactionDialogProvider>
      <div className="min-h-screen flex bg-background">
        {/* Desktop Sidebar */}
        <aside
          className="hidden md:flex md:flex-col fixed inset-y-0 left-0 z-30 glass-soft transition-all duration-300"
          style={{ width: drawerWidth }}
          aria-label="Main navigation"
          aria-expanded={!sidebarCollapsed}
        >
          <NavContent
            collapsed={sidebarCollapsed}
            location={location}
            onNavigate={handleNavigation}
          />

          {/* Collapse Button */}
          <button
            onClick={handleSidebarCollapse}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors shadow-sm"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 glass shadow-xl">
              <div className="absolute right-2 top-2">
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-lg hover:bg-surface-hover text-foreground-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <NavContent
                collapsed={false}
                location={location}
                onNavigate={handleNavigation}
              />
            </aside>
          </div>
        )}

        {/* Main Content */}
        <div
          className="flex-1 flex flex-col min-h-screen transition-all duration-300"
          style={{ marginLeft: isMobile ? 0 : drawerWidth }}
        >
          {/* Top Bar */}
          <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 md:px-6 glass-soft border-b border-border">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                className="md:hidden p-2 rounded-lg hover:bg-surface-hover text-foreground"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-foreground">
                {currentPage?.text || "Finance Tracker"}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Add transaction */}
              <AddTransactionButton />

              {/* Notification Bell */}
              <NotificationBell />

              <span className="text-sm text-foreground-muted hidden md:block pl-1">
                {user?.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden sm:flex"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TransactionDialogProvider>
  );
}
