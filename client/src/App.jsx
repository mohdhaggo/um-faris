import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/Auth';
import { SettingsProvider } from './store/Settings';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Bookings from './pages/Bookings';
import Services from './pages/Services';
import Clients from './pages/Clients';
import Finance from './pages/Finance';
import Employees from './pages/Employees';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AuthAction from './pages/AuthAction';

export default function App() {
  const { user, loading } = useAuth();

  // Public route: Firebase password-reset / email-action handler (must work logged-out).
  if (window.location.pathname === '/auth/action') return <AuthAction />;

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );

  if (!user) return <Login />;

  return (
    <SettingsProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/services" element={<Services />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </SettingsProvider>
  );
}
