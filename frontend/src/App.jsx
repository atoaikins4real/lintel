import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantDetail from './pages/TenantDetail.jsx';
import Units from './pages/Units.jsx';
import UnitDetail from './pages/UnitDetail.jsx';
import Leases from './pages/Leases.jsx';
import Payments from './pages/Payments.jsx';
import FaultsRenovations from './pages/FaultsRenovations.jsx';
import BookingRequests from './pages/BookingRequests.jsx';
import Reports from './pages/Reports.jsx';
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
        {/* Public — no auth, meant to be shared on social media */}
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/showcase/:id" element={<ShowcaseDetail />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tenants" element={<Tenants />} />
                  <Route path="/tenants/:id" element={<TenantDetail />} />
                  <Route path="/units" element={<Units />} />
                  <Route path="/units/:id" element={<UnitDetail />} />
                  <Route path="/leases" element={<Leases />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/faults-renovations" element={<FaultsRenovations />} />
                  <Route path="/booking-requests" element={<BookingRequests />} />
                  <Route path="/reports" element={<Reports />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
