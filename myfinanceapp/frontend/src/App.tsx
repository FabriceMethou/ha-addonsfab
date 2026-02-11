// Main App Component with Routing
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastContextProvider } from './contexts/ToastContext';

// Eager imports — needed immediately
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

// Lazy-loaded pages — each becomes its own chunk
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const EnvelopesPage = lazy(() => import('./pages/EnvelopesPage'));
const DebtsPage = lazy(() => import('./pages/DebtsPage'));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'));
const RecurringPage = lazy(() => import('./pages/RecurringPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const WorkHoursPage = lazy(() => import('./pages/WorkHoursPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const ReconcilePage = lazy(() => import('./pages/ReconcilePage'));

// Page loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 2 * 60 * 1000,  // 2 min — data considered fresh, prevents refetch on navigation
      gcTime: 10 * 60 * 1000,    // 10 min — unused cache kept in memory
    },
  },
});

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="envelopes" element={<EnvelopesPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="work-hours" element={<WorkHoursPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reconcile" element={<ReconcilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <ToastContextProvider>
            <AppRoutes />
          </ToastContextProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
