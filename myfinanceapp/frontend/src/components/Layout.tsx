import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Building2,
  FolderTree,
  PiggyBank,
  CreditCard,
  TrendingUp,
  RefreshCw,
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Button from './shadcn/Button';

const DRAWER_WIDTH = 256;
const DRAWER_COLLAPSED_WIDTH = 72;

const menuItems = [
  { text: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { text: 'Transactions', icon: Receipt, path: '/transactions' },
  { text: 'Accounts', icon: Building2, path: '/accounts' },
  { text: 'Categories', icon: FolderTree, path: '/categories' },
  { text: 'Envelopes', icon: PiggyBank, path: '/envelopes' },
  { text: 'Debts', icon: CreditCard, path: '/debts' },
  { text: 'Investments', icon: TrendingUp, path: '/investments' },
  { text: 'Recurring', icon: RefreshCw, path: '/recurring' },
  { text: 'Budgets', icon: Wallet, path: '/budgets' },
  { text: 'Work Hours', icon: Clock, path: '/work-hours' },
  { text: 'Backup', icon: HardDrive, path: '/backup' },
  { text: 'Reports', icon: BarChart3, path: '/reports' },
  { text: 'Reconcile', icon: FileSpreadsheet, path: '/reconcile' },
  { text: 'Notifications', icon: Bell, path: '/notifications' },
  { text: 'Security', icon: Shield, path: '/security' },
  { text: 'Settings', icon: Settings, path: '/settings' },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPage = menuItems.find((item) => item.path === location.pathname);
  const drawerWidth = sidebarCollapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH;

  const NavContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        {collapsed ? (
          <span className="text-xl font-bold text-foreground mx-auto">FT</span>
        ) : (
          <span className="text-xl font-bold text-foreground">Finance Tracker</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.text}
              onClick={() => handleNavigation(item.path)}
              title={collapsed ? item.text : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-1 ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
              {!collapsed && <span>{item.text}</span>}
            </button>
          );
        })}
      </nav>

    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex md:flex-col fixed inset-y-0 left-0 z-30 glass-soft transition-all duration-300"
        style={{ width: drawerWidth }}
      >
        <NavContent collapsed={sidebarCollapsed} />

        {/* Collapse Button */}
        <button
          onClick={handleSidebarCollapse}
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
            onClick={handleDrawerToggle}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 glass shadow-xl">
            <div className="absolute right-2 top-2">
              <button
                onClick={handleDrawerToggle}
                className="p-2 rounded-lg hover:bg-surface-hover text-foreground-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavContent collapsed={false} />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-300"
        style={{ marginLeft: isMobile ? 0 : drawerWidth }}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 md:px-6 glass-soft border-b border-border">
          <div className="flex items-center gap-4">
            <button
              onClick={handleDrawerToggle}
              className="md:hidden p-2 rounded-lg hover:bg-surface-hover text-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {currentPage?.text || 'Finance Tracker'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-foreground-muted hidden sm:block">
              {user?.username}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:flex">
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
  );
}
