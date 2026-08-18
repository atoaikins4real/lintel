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

// Turns an axios failure into something a person can actually act on.
// Distinguishes "the server said no and why" from "the server was never
// reached" and from "you're not allowed" — a bare "something went wrong"
// hides all three.
export function readApiError(err, action = 'complete that') {
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.error;

  if (!err?.response) {
    return `Couldn't reach the server to ${action}. Check your connection and try again.`;
  }
  if (status === 401) return 'Your session expired — please sign in again.';
  if (status === 403) {
    return serverMessage || `You don't have permission to ${action}. Ask a manager for access.`;
  }
  if (status === 429) return serverMessage || 'Too many attempts — please wait a moment and try again.';
  // 402 = subscription lapsed or a plan limit reached. The server's
  // message explains exactly which, and what to do about it.
  if (status === 402) return serverMessage || 'Your subscription needs attention before you can add new records.';
  return serverMessage || `Couldn't ${action} (error ${status}). Please try again.`;
}

// Auth
export const getBootstrapStatus = () => api.get('/auth/bootstrap-status').then((r) => r.data);
export const login = (payload) => api.post('/auth/login', payload).then((r) => r.data);
export const register = (payload) => api.post('/auth/register', payload).then((r) => r.data);
export const signup = (payload) => api.post('/auth/signup', payload).then((r) => r.data);
export const getMe = () => api.get('/auth/me').then((r) => r.data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword = (token, password) =>
  api.post('/auth/reset-password', { token, password }).then((r) => r.data);
export const getStaffUsers = () => api.get('/auth/users').then((r) => r.data);
export const updateUserRole = (id, role) => api.patch(`/auth/users/${id}`, { role }).then((r) => r.data);
export const devLogin = (role) => api.post('/auth/dev-login', { role }).then((r) => r.data);

// Tenants
export const getTenants = (params) => api.get('/tenants', { params }).then((r) => r.data);
export const getTenant = (id) => api.get(`/tenants/${id}`).then((r) => r.data);
export const createTenant = (payload) => api.post('/tenants', payload).then((r) => r.data);
export const updateTenant = (id, payload) => api.put(`/tenants/${id}`, payload).then((r) => r.data);
export const deleteTenant = (id) => api.delete(`/tenants/${id}`).then((r) => r.data);
export const recomputeTenant = (id) => api.post(`/tenants/${id}/recompute`).then((r) => r.data);
export const getUpgradeEligible = () => api.get('/tenants/upgrade-eligible').then((r) => r.data);
export const addTierEvent = (id, payload) => api.post(`/tenants/${id}/tier-events`, payload).then((r) => r.data);

// Properties (buildings/estates — units live inside one)
export const getProperties = () => api.get('/properties').then((r) => r.data);
export const getProperty = (id) => api.get(`/properties/${id}`).then((r) => r.data);
export const createProperty = (payload) => api.post('/properties', payload).then((r) => r.data);
export const updateProperty = (id, payload) => api.put(`/properties/${id}`, payload).then((r) => r.data);
export const deleteProperty = (id) => api.delete(`/properties/${id}`).then((r) => r.data);

// Tenant onboarding sub-resources
export const getTenantContacts = (id) => api.get(`/tenants/${id}/contacts`).then((r) => r.data);
export const addTenantContact = (id, payload) => api.post(`/tenants/${id}/contacts`, payload).then((r) => r.data);
export const deleteTenantContact = (id, childId) => api.delete(`/tenants/${id}/contacts/${childId}`);
export const addTenantOccupant = (id, payload) => api.post(`/tenants/${id}/occupants`, payload).then((r) => r.data);
export const deleteTenantOccupant = (id, childId) => api.delete(`/tenants/${id}/occupants/${childId}`);
export const addTenantVehicle = (id, payload) => api.post(`/tenants/${id}/vehicles`, payload).then((r) => r.data);
export const deleteTenantVehicle = (id, childId) => api.delete(`/tenants/${id}/vehicles/${childId}`);
export const completeOnboarding = (id) => api.post(`/tenants/${id}/complete-onboarding`).then((r) => r.data);

// Access credentials (keycards / fobs / PINs)
export const getCredentials = (params) => api.get('/access/credentials', { params }).then((r) => r.data);
export const issueCredential = (payload) => api.post('/access/credentials', payload).then((r) => r.data);
export const updateCredential = (id, payload) => api.patch(`/access/credentials/${id}`, payload).then((r) => r.data);
export const getAccessEvents = (params) => api.get('/access/events', { params }).then((r) => r.data);

// Units
export const getUnits = (params) => api.get('/units', { params }).then((r) => r.data);
export const getUnit = (id) => api.get(`/units/${id}`).then((r) => r.data);
export const createUnit = (payload) => api.post('/units', payload).then((r) => r.data);
export const updateUnit = (id, payload) => api.put(`/units/${id}`, payload).then((r) => r.data);

// Leases
export const getLeases = (params) => api.get('/leases', { params }).then((r) => r.data);
export const createLease = (payload) => api.post('/leases', payload).then((r) => r.data);
export const updateLease = (id, payload) => api.put(`/leases/${id}`, payload).then((r) => r.data);
export const deleteLease = (id) => api.delete(`/leases/${id}`).then((r) => r.data);

// Payments
export const getPayments = (params) => api.get('/payments', { params }).then((r) => r.data);
export const createPayment = (payload) => api.post('/payments', payload).then((r) => r.data);
export const updatePayment = (id, payload) => api.put(`/payments/${id}`, payload).then((r) => r.data);
export const deletePayment = (id) => api.delete(`/payments/${id}`).then((r) => r.data);

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
export const deleteFault = (id) => api.delete(`/faults/${id}`).then((r) => r.data);
export const updateRenovation = (id, payload) => api.put(`/renovations/${id}`, payload).then((r) => r.data);
export const deleteRenovation = (id) => api.delete(`/renovations/${id}`).then((r) => r.data);
export const deleteStaffUser = (id) => api.delete(`/auth/users/${id}`).then((r) => r.data);
export const deleteCredential = (id) => api.delete(`/access/credentials/${id}`).then((r) => r.data);

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
export const getPropertyPnl = (params) => api.get('/reports/property-pnl', { params }).then((r) => r.data);
export const getRentRoll = () => api.get('/reports/rent-roll').then((r) => r.data);
export const getTenantStatement = (tenantId) =>
  api.get(`/reports/tenant-statement/${tenantId}`).then((r) => r.data);

// Public showcase — no auth required. The company is identified by its
// slug in the URL, since there's no session to read it from.
export const getPublicUnits = (slug) => api.get(`/public/${slug}/units`).then((r) => r.data);
export const getPublicUnit = (slug, id) => api.get(`/public/${slug}/units/${id}`).then((r) => r.data);
export const createInquiry = (slug, unitId, payload) =>
  api.post(`/public/${slug}/units/${unitId}/inquiries`, payload).then((r) => r.data);

// Platform owner (admin) — cross-company. 404s for anyone who isn't one.
export const getSubscribers = () => api.get('/admin/subscribers').then((r) => r.data);
export const updateSubscription = (companyId, payload) =>
  api.patch(`/admin/subscribers/${companyId}/subscription`, payload).then((r) => r.data);
export const updatePlan = (id, payload) => api.put(`/admin/plans/${id}`, payload).then((r) => r.data);

// Company profile
export const getCompany = () => api.get('/company').then((r) => r.data);
export const updateCompany = (payload) => api.put('/company', payload).then((r) => r.data);

// Booking inquiries — staff-side review of "Book now" submissions from the
// public showcase.
export const getBookingInquiries = (params) => api.get('/booking-inquiries', { params }).then((r) => r.data);
export const updateBookingInquiry = (id, status) =>
  api.patch(`/booking-inquiries/${id}`, { status }).then((r) => r.data);

// Uploads
export const uploadPhoto = (payload) => api.post('/uploads/photo', payload).then((r) => r.data);

// Settings — default currency, payout destination, subscription
export const getSettings = () => api.get('/settings').then((r) => r.data);
export const updateSettings = (payload) => api.put('/settings', payload).then((r) => r.data);

export { TOKEN_KEY };
