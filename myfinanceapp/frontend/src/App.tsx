// Main App Component with Routing
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AccountsPage from './pages/AccountsPage';
import CategoriesPage from './pages/CategoriesPage';
import EnvelopesPage from './pages/EnvelopesPage';
import DebtsPage from './pages/DebtsPage';
import InvestmentsPage from './pages/InvestmentsPage';
import RecurringPage from './pages/RecurringPage';
import BudgetsPage from './pages/BudgetsPage';
import WorkHoursPage from './pages/WorkHoursPage';
import BackupPage from './pages/BackupPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import SecurityPage from './pages/SecurityPage';

// Layout
import Layout from './components/Layout';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Create dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#0E1117',
      paper: '#262730',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: '1px solid #404040',
        },
      },
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
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Router>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
