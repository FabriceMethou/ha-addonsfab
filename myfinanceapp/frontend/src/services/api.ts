// API Service with Axios
import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

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
  (config: InternalAxiosRequestConfig) => {
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
  (error: AxiosError) => {
    if (isDebugEnabled()) {
      console.error('[DEBUG API] Request error:', error);
    }
    return Promise.reject(error);
  }
);

// Track whether a token refresh is already in progress
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

// Response interceptor to handle auth errors and debug logging
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Debug logging
    if (isDebugEnabled()) {
      console.log(`[DEBUG API] ← ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        data: response.data,
      });
    }
    return response;
  },
  async (error: AxiosError) => {
    // Debug logging
    if (isDebugEnabled()) {
      console.error(`[DEBUG API] ← ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
        error: error.response?.data || error.message,
      });
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh if the failing request is the refresh endpoint itself
      if (originalRequest.url === '/api/auth/refresh') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // No refresh token — logout immediately
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Another refresh is already in progress — queue this request
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token, refresh_token: newRefreshToken, user } = response.data;
        localStorage.setItem('access_token', access_token);
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken);
        }
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
        }

        isRefreshing = false;
        onTokenRefreshed(access_token);

        // Retry the original request with the new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
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
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refresh_token: refreshToken }),
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
  registerUser: (data: Record<string, unknown>) => api.post('/api/auth/register', data),
  updateUser: (userId: number, data: Record<string, unknown>) => api.put(`/api/auth/users/${userId}`, data),
  deleteUser: (userId: number) => api.delete(`/api/auth/users/${userId}`),
  getLoginHistory: (userId?: number, limit: number = 50) =>
    api.get('/api/auth/login-history', { params: { user_id: userId, limit } }),
};

// Currencies API
export const currenciesAPI = {
  getAll: (activeOnly: boolean = true) => api.get(`/api/currencies/?active_only=${activeOnly}`),
  getByCode: (code: string) => api.get(`/api/currencies/${code}`),
  create: (data: Record<string, unknown>) => api.post('/api/currencies/', data),
  update: (code: string, data: Record<string, unknown>) => api.put(`/api/currencies/${code}`, data),
  delete: (code: string) => api.delete(`/api/currencies/${code}`),
  getAccountTypes: () => api.get('/api/currencies/account-types/list'),
};

// Accounts API
export const accountsAPI = {
  getAll: () => api.get('/api/accounts/'),
  getById: (id: number) => api.get(`/api/accounts/${id}`),
  create: (data: Record<string, unknown>) => api.post('/api/accounts/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/accounts/${id}`, data),
  delete: (id: number) => api.delete(`/api/accounts/${id}`),
  // Banks
  getBanks: () => api.get('/api/accounts/banks/all'),
  createBank: (data: Record<string, unknown>) => api.post('/api/accounts/banks/', data),
  updateBank: (id: number, data: Record<string, unknown>) => api.put(`/api/accounts/banks/${id}`, data),
  deleteBank: (id: number) => api.delete(`/api/accounts/banks/${id}`),
  // Owners
  getOwners: () => api.get('/api/accounts/owners/all'),
  createOwner: (data: Record<string, unknown>) => api.post('/api/accounts/owners/', data),
  updateOwner: (id: number, data: Record<string, unknown>) => api.put(`/api/accounts/owners/${id}`, data),
  deleteOwner: (id: number) => api.delete(`/api/accounts/owners/${id}`),
  // Summary
  getSummary: () => api.get('/api/accounts/summary/balances'),
  // Validations
  createValidation: (data: Record<string, unknown>) => api.post('/api/accounts/validations/', data),
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
  getAll: (params?: Record<string, unknown>) => api.get('/api/transactions/', { params }),
  getById: (id: number) => api.get(`/api/transactions/${id}`),
  create: (data: Record<string, unknown>) => api.post('/api/transactions/', data),
  createBulk: (data: Record<string, unknown>[]) => api.post('/api/transactions/bulk', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/transactions/${id}`, data),
  delete: (id: number) => api.delete(`/api/transactions/${id}`),
  search: (filters: Record<string, unknown>) => api.post('/api/transactions/search', filters),
  getSummary: (params?: Record<string, unknown>) => api.get('/api/transactions/stats/summary', { params }),
  getSummaryByOwner: (params?: Record<string, unknown>) => api.get('/api/transactions/stats/summary-by-owner', { params }),
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
  createType: (data: Record<string, unknown>) => api.post('/api/categories/types', data),
  createSubtype: (data: Record<string, unknown>) => api.post('/api/categories/subtypes', data),
  updateType: (id: number, data: Record<string, unknown>) => api.put(`/api/categories/types/${id}`, data),
  deleteType: (id: number) => api.delete(`/api/categories/types/${id}`),
  updateSubtype: (id: number, data: Record<string, unknown>) => api.put(`/api/categories/subtypes/${id}`, data),
  deleteSubtype: (id: number) => api.delete(`/api/categories/subtypes/${id}`),
};

// Envelopes API
export const envelopesAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/envelopes/?include_inactive=${includeInactive}`),
  create: (data: Record<string, unknown>) => api.post('/api/envelopes/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/envelopes/${id}`, data),
  delete: (id: number) => api.delete(`/api/envelopes/${id}`),
  permanentDelete: (id: number) => api.delete(`/api/envelopes/${id}?permanent=true`),
  reactivate: (id: number) => api.put(`/api/envelopes/${id}/reactivate`),
  getTransactions: (id: number) => api.get(`/api/envelopes/${id}/transactions`),
  addTransaction: (data: Record<string, unknown>) => api.post('/api/envelopes/transactions', data),
};

// Debts API
export const debtsAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/debts/?include_inactive=${includeInactive}`),
  create: (data: Record<string, unknown>) => api.post('/api/debts/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/debts/${id}`, data),
  delete: (id: number) => api.delete(`/api/debts/${id}`),
  getSummary: () => api.get('/api/debts/summary'),
  getPayments: (id: number) => api.get(`/api/debts/${id}/payments`),
  addPayment: (data: Record<string, unknown>) => api.post('/api/debts/payments', data),
  getSchedule: (id: number) => api.get(`/api/debts/${id}/schedule`),
  getPayoff: (id: number) => api.get(`/api/debts/${id}/payoff`),
};

// Investments API
export const investmentsAPI = {
  // Securities (master list)
  getSecurities: (params: Record<string, unknown> = {}) => api.get('/api/investments/securities', { params }),
  createSecurity: (data: Record<string, unknown>) => api.post('/api/investments/securities', data),
  updateSecurity: (id: number, data: Record<string, unknown>) => api.put(`/api/investments/securities/${id}`, data),
  deleteSecurity: (id: number) => api.delete(`/api/investments/securities/${id}`),

  // Holdings
  getHoldings: () => api.get('/api/investments/holdings'),
  createHolding: (data: Record<string, unknown>) => api.post('/api/investments/holdings', data),
  updateHolding: (id: number, data: Record<string, unknown>) => api.put(`/api/investments/holdings/${id}`, data),
  deleteHolding: (id: number) => api.delete(`/api/investments/holdings/${id}`),
  getCurrentPrice: (id: number) => api.get(`/api/investments/holdings/${id}/current-price`),
  getSummary: () => api.get('/api/investments/summary'),
  getTransactions: () => api.get('/api/investments/transactions'),
  addTransaction: (data: Record<string, unknown>) => api.post('/api/investments/transactions', data),
  createTransaction: (data: Record<string, unknown>) => api.post('/api/investments/transactions', data),
  updateTransaction: (id: number, data: Record<string, unknown>) => api.put(`/api/investments/transactions/${id}`, data),
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
  create: (data: Record<string, unknown>) => api.post('/api/recurring/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/recurring/${id}`, data),
  delete: (id: number) => api.delete(`/api/recurring/${id}`),
  generate: () => api.post('/api/recurring/generate'),
};

// Work Profiles API
export const workProfilesAPI = {
  getAll: (displayCurrency?: string) =>
    api.get('/api/work-profiles/', { params: displayCurrency ? { display_currency: displayCurrency } : undefined }),
  getByOwner: (ownerId: number) => api.get(`/api/work-profiles/${ownerId}`),
  create: (data: Record<string, unknown>) => api.post('/api/work-profiles/', data),
  update: (ownerId: number, data: Record<string, unknown>) => api.put(`/api/work-profiles/${ownerId}`, data),
  delete: (ownerId: number) => api.delete(`/api/work-profiles/${ownerId}`),
  calculate: (amount: number, ownerId: number, amountCurrency?: string) =>
    api.post('/api/work-profiles/calculate', null, {
      params: { amount, owner_id: ownerId, ...(amountCurrency && { amount_currency: amountCurrency }) },
    }),
};

// Backups API
export const backupsAPI = {
  getAll: () => api.get('/api/backups/'),
  create: (data: Record<string, unknown>) => api.post('/api/backups/', data),
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
  updateSettings: (data: Record<string, unknown>) => api.put('/api/backups/settings', data),
  cleanup: () => api.post('/api/backups/cleanup'),
  // Cloud backup APIs
  getCloudConfig: () => api.get('/api/backups/cloud/config'),
  updateCloudConfig: (data: Record<string, unknown>) => api.put('/api/backups/cloud/config', data),
  listCloudBackups: () => api.get('/api/backups/cloud/backups'),
  syncToCloud: (backupId: string) => api.post(`/api/backups/cloud/${backupId}/sync`),
};

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/api/settings/'),
  get: (key: string) => api.get(`/api/settings/${key}`),
  update: (key: string, value: unknown) => api.put(`/api/settings/${key}`, { value }),
};

// Budgets API
export const budgetsAPI = {
  getAll: (includeInactive: boolean = false) => api.get(`/api/budgets/?include_inactive=${includeInactive}`),
  getById: (id: number) => api.get(`/api/budgets/${id}`),
  create: (data: Record<string, unknown>) => api.post('/api/budgets/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/budgets/${id}`, data),
  delete: (id: number) => api.delete(`/api/budgets/${id}`),
  getVsActual: (year: number, month: number) => api.get(`/api/budgets/vs-actual/${year}/${month}`),
};

// Reports API
export const reportsAPI = {
  getNetWorth: (params?: { owner_id?: number }) => api.get('/api/reports/net-worth', { params }),
  getNetWorthTrend: (months: number = 12, ownerId?: number) => {
    const params: Record<string, unknown> = { months };
    if (ownerId) params.owner_id = ownerId;
    return api.get('/api/reports/net-worth/trend', { params });
  },
  getSpendingByCategory: (params?: Record<string, unknown>) => api.get('/api/reports/spending-by-category', { params }),
  getIncomeVsExpenses: (params?: Record<string, unknown>) => api.get('/api/reports/income-vs-expenses', { params }),
  getSpendingPrediction: (monthsAhead: number = 1) => api.get(`/api/reports/spending-prediction?months_ahead=${monthsAhead}`),
  getMonthlySummary: (year: number, month: number, ownerId?: number) => {
    const params: Record<string, unknown> = { year, month };
    if (ownerId) params.owner_id = ownerId;
    return api.get('/api/reports/monthly-summary', { params });
  },
  getTagReport: (tag: string, params?: Record<string, unknown>) => api.get(`/api/reports/tags/${tag}`, { params }),
  getSpendingTrends: (months: number = 6, category?: string, ownerId?: number) => {
    const params: Record<string, unknown> = { months };
    if (category) params.category = category;
    if (ownerId) params.owner_id = ownerId;
    return api.get('/api/reports/spending-trends', { params });
  },
  getYearByYear: (year: number, month?: number) =>
    api.get(`/api/reports/year-by-year?year=${year}${month ? `&month=${month}` : ''}`),
};

// Alerts API
export const alertsAPI = {
  getConfig: () => api.get('/api/alerts/config'),
  updateEmailSettings: (data: Record<string, unknown>) => api.put('/api/alerts/email', data),
  updateThresholds: (data: Record<string, unknown>) => api.put('/api/alerts/thresholds', data),
  sendTestEmail: (email: string) => api.post('/api/alerts/test-email', { to_email: email }),
  getHistory: (limit: number = 20) => api.get(`/api/alerts/history?limit=${limit}`),
  disableEmail: () => api.post('/api/alerts/disable-email'),
};

// Reconciliation API
export const reconciliationAPI = {
  upload: (accountId: number, startDate: string, endDate: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(
      `/api/reconciliation/upload?account_id=${accountId}&start_date=${startDate}&end_date=${endDate}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },
  flagTransaction: (transactionId: number) =>
    api.post(`/api/reconciliation/flag/${transactionId}`),
  complete: (data: {
    account_id: number;
    validation_date: string;
    actual_balance: number;
    matched_count: number;
    added_count: number;
    flagged_count: number;
  }) => api.post('/api/reconciliation/complete', data),
};
