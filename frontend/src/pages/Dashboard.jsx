import { useAuth } from '../context/AuthContext.jsx';
import LandlordHome from './dashboards/LandlordHome.jsx';
import HotelHome from './dashboards/HotelHome.jsx';
import ShortletHome from './dashboards/ShortletHome.jsx';
import AgentHome from './dashboards/AgentHome.jsx';

// The home screen is bespoke per role. Each role signs up to a different job —
// a landlord watches rent and occupancy, a hotelier watches tonight's arrivals,
// a short-let host watches the calendar and payouts, an agent watches listings
// and enquiries — so each gets its own dashboard rather than a reworded copy.
export default function Dashboard() {
  const { role } = useAuth();
  if (role === 'hotelier') return <HotelHome />;
  if (role === 'shortlet') return <ShortletHome />;
  if (role === 'agent') return <AgentHome />;
  return <LandlordHome />;
}
