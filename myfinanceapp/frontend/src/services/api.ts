// API Service with Axios
import axios from 'axios';

// If VITE_API_URL is not set, default to same-origin requests.
// This works with:
// - Vite dev proxy (/api -> :8000)
// - nginx reverse proxy in the unified Docker image
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Helper to check if debug logging is enabled
const isDebugEnabled = () => {
  try {
    const debugSettings = localStorage.getItem('debug_settings');
    if (debugSettings) {
      const settings = JSON.parse(debugSettings);
      return settings.debug_show_logs === true || settings.debug_log_api_calls === true;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return false;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and debug logging
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Debug logging
    if (isDebugEnabled()) {
      console.log(`[DEBUG API] → ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error) => {
    if (isDebugEnabled()) {
      console.error('[DEBUG API] Request error:', error);
    }
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors and debug logging
api.interceptors.response.use(
  (response) => {
    // Debug logging
    if (isDebugEnabled()) {
      console.log(`[DEBUG API] ← ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        data: response.data,
      });
    }
    return response;
  },
  (error) => {
    // Debug logging
    if (isDebugEnabled()) {
      console.error(`[DEBUG API] ← ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
        error: error.response?.data || error.message,
      });
    }

    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/api/auth/token', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  verifyMFA: (token: string, mfaToken: string) =>
    api.post('/api/auth/mfa/verify', { token: mfaToken }, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getCurrentUser: () => api.get('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/api/auth/change-password', { old_password: oldPassword, new_password: newPassword }),
  setupMFA: () => api.post('/api/auth/mfa/setup'),
  enableMFA: (token: string) => api.post('/api/auth/mfa/enable', { token }),
  disableMFA: () => api.post('/api/auth/mfa/disable'),
  listUsers: () => api.get('/api/auth/users'),
  registerUser: (data: any) => api.post('/api/auth/register', data),
  updateUser: (userId: number, data: any) => api.put(`/api/auth/users/${userId}`, data),
  deleteUser: (userId: number) => api.delete(`/api/auth/users/${userId}`),
  getLoginHistory: (userId?: number, limit: number = 50) =>
    api.get('/api/auth/login-history', { params: { user_id: userId, limit } }),
};

// Currencies API
export const currenciesAPI = {
  getAll: (activeOnly: boolean = true) => api.get(`/api/currencies/?active_only=${activeOnly}`),
  getByCode: (code: string) => api.get(`/api/currencies/${code}`),
  create: (data: any) => api.post('/api/currencies/', data),
  update: (code: string, data: any) => api.put(`/api/currencies/${code}`, data),
  delete: (code: string) => api.delete(`/api/currencies/${code}`),
  getAccountTypes: () => api.get('/api/currencies/account-types/list'),
};

// Accounts API
export const accountsAPI = {
  getAll: () => api.get('/api/accounts/'),
  getById: (id: number) => api.get(`/api/accounts/${id}`),
  create: (data: any) => api.post('/api/accounts/', data),
  update: (id: number, data: any) => api.put(`/api/accounts/${id}`, data),
  delete: (id: number) => api.delete(`/api/accounts/${id}`),
  // Banks
  getBanks: () => api.get('/api/accounts/banks/all'),
  createBank: (data: any) => api.post('/api/accounts/banks/', data),
  updateBank: (id: number, data: any) => api.put(`/api/accounts/banks/${id}`, data),
  deleteBank: (id: number) => api.delete(`/api/accounts/banks/${id}`),
  // Owners
  getOwners: () => api.get('/api/accounts/owners/all'),
  createOwner: (data: any) => api.post('/api/accounts/owners/', data),
  updateOwner: (id: number, data: any) => api.put(`/api/accounts/owners/${id}`, data),
  deleteOwner: (id: number) => api.delete(`/api/accounts/owners/${id}`),
  // Summary
  getSummary: () => api.get('/api/accounts/summary/balances'),
  // Validations
  createValidation: (data: any) => api.post('/api/accounts/validations/', data),
  getValidations: (accountId: number, limit: number = 10) =>
    api.get(`/api/accounts/${accountId}/validations?limit=${limit}`),
  getLatestValidation: (accountId: number) =>
    api.get(`/api/accounts/${accountId}/validations/latest`),
  // Investigation & debugging
  investigate: (accountId: number) => api.get(`/api/accounts/${accountId}/investigate`),
  searchByBank: (bankName: string) => api.get(`/api/accounts/search/${bankName}`),
  // Balance recalculation
  recalculateBalances: () => api.post('/api/accounts/recalculate-balances'),
};

// Transactions API
export const transactionsAPI = {
  getAll: (params?: any) => api.get('/api/transactions/', { params }),
  getById: (id: number) => api.get(`/api/transactions/${id}`),
  create: (data: any) => api.post('/api/transactions/', data),
  createBulk: (data: any[]) => api.post('/api/transactions/bulk', data),
  update: (id: number, data: any) => api.put(`/api/transactions/${id}`, data),
  delete: (id: number) => api.delete(`/api/transactions/${id}`),
  search: (filters: any) => api.post('/api/transactions/search', filters),
  getSummary: (params?: any) => api.get('/api/transactions/stats/summary', { params }),
  autoCategorize: (description: string) =>
    api.post('/api/transactions/auto-categorize', { description }),
  getPending: () => api.get('/api/transactions/pending/all'),
  confirm: (id: number) => api.post(`/api/transactions/${id}/confirm`),
  reject: (id: number) => api.delete(`/api/transactions/${id}/reject`),
  getAllTags: () => api.get('/api/transactions/tags/all'),
  getAllRecipients: () => api.get('/api/transactions/recipients/all'),
  getCategorizerStatus: () => api.get('/api/transactions/categorizer/status'),
  trainCategorizer: () => api.post('/api/transactions/train-categorizer'),
};

// Categories API
export const categoriesAPI = {
  getTypes: () => api.get('/api/categories/types'),
  getSubtypes: (typeId?: number) =>
    api.get('/api/categories/subtypes', { params: { type_id: typeId } }),
  getHierarchy: () => api.get('/api/categories/hierarchy'),
  createType: (data: any) => api.post('/api/categories/types', data),
  createSubtype: (data: any) => api.post('/api/categories/subtypes', data),
  updateType: (id: number, data: any) => api.put(`/api/categories/types/${id}`, data),
  deleteType: (id: number) => api.delete(`/api/categories/types/${id}`),
  updateSubtype: (id: number, data: any) => api.put(`/api/categories/subtypes/${id}`, data),
  deleteSubtype: (id: number) => api.delete(`/api/categories/subtypes/${id}`),
};

// Envelopes API
export const envelopesAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/envelopes/?include_inactive=${includeInactive}`),
  create: (data: any) => api.post('/api/envelopes/', data),
  update: (id: number, data: any) => api.put(`/api/envelopes/${id}`, data),
  delete: (id: number) => api.delete(`/api/envelopes/${id}`),
  permanentDelete: (id: number) => api.delete(`/api/envelopes/${id}?permanent=true`),
  reactivate: (id: number) => api.put(`/api/envelopes/${id}/reactivate`),
  getTransactions: (id: number) => api.get(`/api/envelopes/${id}/transactions`),
  addTransaction: (data: any) => api.post('/api/envelopes/transactions', data),
};

// Debts API
export const debtsAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/debts/?include_inactive=${includeInactive}`),
  create: (data: any) => api.post('/api/debts/', data),
  update: (id: number, data: any) => api.put(`/api/debts/${id}`, data),
  delete: (id: number) => api.delete(`/api/debts/${id}`),
  getSummary: () => api.get('/api/debts/summary'),
  getPayments: (id: number) => api.get(`/api/debts/${id}/payments`),
  addPayment: (data: any) => api.post('/api/debts/payments', data),
};

// Investments API
export const investmentsAPI = {
  // Securities (master list)
  getSecurities: (params: any = {}) => api.get('/api/investments/securities', { params }),
  createSecurity: (data: any) => api.post('/api/investments/securities', data),
  updateSecurity: (id: number, data: any) => api.put(`/api/investments/securities/${id}`, data),
  deleteSecurity: (id: number) => api.delete(`/api/investments/securities/${id}`),

  // Holdings
  getHoldings: () => api.get('/api/investments/holdings'),
  createHolding: (data: any) => api.post('/api/investments/holdings', data),
  updateHolding: (id: number, data: any) => api.put(`/api/investments/holdings/${id}`, data),
  deleteHolding: (id: number) => api.delete(`/api/investments/holdings/${id}`),
  getCurrentPrice: (id: number) => api.get(`/api/investments/holdings/${id}/current-price`),
  getSummary: () => api.get('/api/investments/summary'),
  getTransactions: () => api.get('/api/investments/transactions'),
  addTransaction: (data: any) => api.post('/api/investments/transactions', data),
  createTransaction: (data: any) => api.post('/api/investments/transactions', data),
  updateTransaction: (id: number, data: any) => api.put(`/api/investments/transactions/${id}`, data),
  deleteTransaction: (id: number) => api.delete(`/api/investments/transactions/${id}`),
  lookupISIN: (isin: string) => api.get(`/api/investments/lookup/isin/${isin}`),
  updateHoldingPrice: (holdingId: number) => api.post(`/api/investments/holdings/${holdingId}/update-price`),
  updateAllPrices: () => api.post('/api/investments/holdings/update-all-prices'),
  fixDividendTotals: () => api.post('/api/investments/fix-dividend-totals'),
};

// Recurring Transactions API
export const recurringAPI = {
  getAll: (includeInactive: boolean = false) =>
    api.get(`/api/recurring/?include_inactive=${includeInactive}`),
  getById: (id: number) => api.get(`/api/recurring/${id}`),
  create: (data: any) => api.post('/api/recurring/', data),
  update: (id: number, data: any) => api.put(`/api/recurring/${id}`, data),
  delete: (id: number) => api.delete(`/api/recurring/${id}`),
  generate: () => api.post('/api/recurring/generate'),
};

// Work Profiles API
export const workProfilesAPI = {
  getAll: (displayCurrency?: string) =>
    api.get('/api/work-profiles/', { params: displayCurrency ? { display_currency: displayCurrency } : undefined }),
  getByOwner: (ownerId: number) => api.get(`/api/work-profiles/${ownerId}`),
  create: (data: any) => api.post('/api/work-profiles/', data),
  update: (ownerId: number, data: any) => api.put(`/api/work-profiles/${ownerId}`, data),
  delete: (ownerId: number) => api.delete(`/api/work-profiles/${ownerId}`),
  calculate: (amount: number, ownerId: number, amountCurrency?: string) =>
    api.post('/api/work-profiles/calculate', null, {
      params: { amount, owner_id: ownerId, ...(amountCurrency && { amount_currency: amountCurrency }) },
    }),
};

// Backups API
export const backupsAPI = {
  getAll: () => api.get('/api/backups/'),
  create: (data: any) => api.post('/api/backups/', data),
  restore: (id: string) => api.post(`/api/backups/${id}/restore`),
  delete: (id: string) => api.delete(`/api/backups/${id}`),
  download: (id: string) => api.get(`/api/backups/${id}/download`, { responseType: 'blob' }),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/backups/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSettings: () => api.get('/api/backups/settings'),
  updateSettings: (data: any) => api.put('/api/backups/settings', data),
  cleanup: () => api.post('/api/backups/cleanup'),
};

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/api/settings/'),
  get: (key: string) => api.get(`/api/settings/${key}`),
  update: (key: string, value: any) => api.put(`/api/settings/${key}`, { value }),
};

// Budgets API
export const budgetsAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/budgets/?include_inactive=${includeInactive}`),
  getById: (id: number) => api.get(`/api/budgets/${id}`),
  create: (data: any) => api.post('/api/budgets/', data),
  update: (id: number, data: any) => api.put(`/api/budgets/${id}`, data),
  delete: (id: number) => api.delete(`/api/budgets/${id}`),
  getVsActual: (year: number, month: number) => api.get(`/api/budgets/vs-actual/${year}/${month}`),
};

// Reports API
export const reportsAPI = {
  getNetWorth: () => api.get('/api/reports/net-worth'),
  getNetWorthTrend: (months: number = 12) => api.get(`/api/reports/net-worth/trend?months=${months}`),
  getSpendingByCategory: (params?: any) => api.get('/api/reports/spending-by-category', { params }),
  getIncomeVsExpenses: (params?: any) => api.get('/api/reports/income-vs-expenses', { params }),
  getSpendingPrediction: (monthsAhead: number = 1) => api.get(`/api/reports/spending-prediction?months_ahead=${monthsAhead}`),
  getMonthlySummary: (year: number, month: number) => api.get(`/api/reports/monthly-summary?year=${year}&month=${month}`),
  getTagReport: (tag: string, params?: any) => api.get(`/api/reports/tags/${tag}`, { params }),
  getSpendingTrends: (months: number = 6, category?: string) =>
    api.get(`/api/reports/spending-trends?months=${months}${category ? `&category=${category}` : ''}`),
  getYearByYear: (year: number, month?: number) =>
    api.get(`/api/reports/year-by-year?year=${year}${month ? `&month=${month}` : ''}`),
};

// Alerts API
export const alertsAPI = {
  getConfig: () => api.get('/api/alerts/config'),
  updateEmailSettings: (data: any) => api.put('/api/alerts/email', data),
  updateThresholds: (data: any) => api.put('/api/alerts/thresholds', data),
  sendTestEmail: (email: string) => api.post('/api/alerts/test-email', { to_email: email }),
  getHistory: (limit: number = 20) => api.get(`/api/alerts/history?limit=${limit}`),
  disableEmail: () => api.post('/api/alerts/disable-email'),
};
