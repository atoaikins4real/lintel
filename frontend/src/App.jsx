import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantDetail from './pages/TenantDetail.jsx';
import Units from './pages/Units.jsx';
import UnitDetail from './pages/UnitDetail.jsx';
import Properties from './pages/Properties.jsx';
import PropertyDetail from './pages/PropertyDetail.jsx';
import PropertyOnboarding from './pages/PropertyOnboarding.jsx';
import UnitOnboarding from './pages/UnitOnboarding.jsx';
import TenantOnboarding from './pages/TenantOnboarding.jsx';
import AccessCards from './pages/AccessCards.jsx';
import Leases from './pages/Leases.jsx';
import Payments from './pages/Payments.jsx';
import FaultsRenovations from './pages/FaultsRenovations.jsx';
import BookingRequests from './pages/BookingRequests.jsx';
import Reports from './pages/Reports.jsx';
import Staff from './pages/Staff.jsx';
import SettingsPage from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Showcase from './pages/Showcase.jsx';
import ShowcaseDetail from './pages/ShowcaseDetail.jsx';
import DevPanel from './components/DevPanel.jsx';

const showDevPanel = import.meta.env.DEV && import.meta.env.VITE_DEV_MODE === 'true';

function App() {
  return (
    <AuthProvider>
      {showDevPanel && <DevPanel />}
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public — the token in the URL is the credential */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Public — no auth, meant to be shared on social media. The
            company slug identifies whose listings to show, since there's
            no session to read it from. */}
        <Route path="/showcase/:slug" element={<Showcase />} />
        <Route path="/showcase/:slug/:id" element={<ShowcaseDetail />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              {/* Inside RequireAuth so settings are only fetched once
                  there's a session to fetch them with. */}
              <SettingsProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tenants" element={<Tenants />} />
                    <Route path="/tenants/onboard" element={<TenantOnboarding />} />
                    <Route path="/tenants/:id/onboard" element={<TenantOnboarding />} />
                    <Route path="/tenants/:id" element={<TenantDetail />} />
                    <Route path="/properties" element={<Properties />} />
                    <Route path="/properties/onboard" element={<PropertyOnboarding />} />
                    <Route path="/properties/:id/edit" element={<PropertyOnboarding />} />
                    <Route path="/properties/:id" element={<PropertyDetail />} />
                    <Route path="/units" element={<Units />} />
                    <Route path="/units/onboard" element={<UnitOnboarding />} />
                    <Route path="/units/:id/edit" element={<UnitOnboarding />} />
                    <Route path="/units/:id" element={<UnitDetail />} />
                    <Route path="/access" element={<AccessCards />} />
                    <Route path="/leases" element={<Leases />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/faults-renovations" element={<FaultsRenovations />} />
                    <Route path="/booking-requests" element={<BookingRequests />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/staff" element={<Staff />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </Layout>
              </SettingsProvider>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
