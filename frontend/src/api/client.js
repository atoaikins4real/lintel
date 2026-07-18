import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL });

const TOKEN_KEY = 'lintel_token';

// "Remember me" support: checked -> localStorage (survives browser restart),
// unchecked -> sessionStorage (cleared when the tab closes). Read both so an
// existing session keeps working regardless of which one it landed in.
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
export function storeToken(token, remember) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

// Auth
export const getBootstrapStatus = () => api.get('/auth/bootstrap-status').then((r) => r.data);
export const login = (payload) => api.post('/auth/login', payload).then((r) => r.data);
export const register = (payload) => api.post('/auth/register', payload).then((r) => r.data);
export const getMe = () => api.get('/auth/me').then((r) => r.data);
export const getStaffUsers = () => api.get('/auth/users').then((r) => r.data);
export const devLogin = (role) => api.post('/auth/dev-login', { role }).then((r) => r.data);

// Tenants
export const getTenants = (params) => api.get('/tenants', { params }).then((r) => r.data);
export const getTenant = (id) => api.get(`/tenants/${id}`).then((r) => r.data);
export const createTenant = (payload) => api.post('/tenants', payload).then((r) => r.data);
export const updateTenant = (id, payload) => api.put(`/tenants/${id}`, payload).then((r) => r.data);
export const recomputeTenant = (id) => api.post(`/tenants/${id}/recompute`).then((r) => r.data);
export const getUpgradeEligible = () => api.get('/tenants/upgrade-eligible').then((r) => r.data);
export const addTierEvent = (id, payload) => api.post(`/tenants/${id}/tier-events`, payload).then((r) => r.data);

// Units
export const getUnits = (params) => api.get('/units', { params }).then((r) => r.data);
export const getUnit = (id) => api.get(`/units/${id}`).then((r) => r.data);
export const createUnit = (payload) => api.post('/units', payload).then((r) => r.data);
export const updateUnit = (id, payload) => api.put(`/units/${id}`, payload).then((r) => r.data);

// Leases
export const getLeases = (params) => api.get('/leases', { params }).then((r) => r.data);
export const createLease = (payload) => api.post('/leases', payload).then((r) => r.data);
export const updateLease = (id, payload) => api.put(`/leases/${id}`, payload).then((r) => r.data);

// Payments
export const getPayments = (params) => api.get('/payments', { params }).then((r) => r.data);
export const createPayment = (payload) => api.post('/payments', payload).then((r) => r.data);
export const updatePayment = (id, payload) => api.put(`/payments/${id}`, payload).then((r) => r.data);

// Expenses
export const getExpenses = (params) => api.get('/expenses', { params }).then((r) => r.data);
export const createExpense = (payload) => api.post('/expenses', payload).then((r) => r.data);

// Renovations
export const getRenovations = (params) => api.get('/renovations', { params }).then((r) => r.data);
export const createRenovation = (payload) => api.post('/renovations', payload).then((r) => r.data);

// Faults
export const getFaults = (params) => api.get('/faults', { params }).then((r) => r.data);
export const createFault = (payload) => api.post('/faults', payload).then((r) => r.data);
export const updateFault = (id, payload) => api.put(`/faults/${id}`, payload).then((r) => r.data);

// Performance
export const getUnitsPerformance = (params) => api.get('/performance/units', { params }).then((r) => r.data);
export const getUnitPerformance = (id, params) =>
  api.get(`/performance/units/${id}`, { params }).then((r) => r.data);

// Billing
export const getBillingSummary = () => api.get('/billing/summary').then((r) => r.data);
export const generateCharges = () => api.post('/billing/generate').then((r) => r.data);
export const flagLatePayments = () => api.post('/billing/flag-late').then((r) => r.data);

// Reports
export const getMonthlyReport = (params) => api.get('/reports/monthly', { params }).then((r) => r.data);
export const getExpenseBreakdown = (params) => api.get('/reports/expense-breakdown', { params }).then((r) => r.data);
export const getReportsSummary = () => api.get('/reports/summary').then((r) => r.data);

export { TOKEN_KEY };
