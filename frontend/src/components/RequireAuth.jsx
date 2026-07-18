import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-stone text-sm">Loading&hellip;</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
