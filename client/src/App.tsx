import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Shell from './components/Shell';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const DeliverablesPage = lazy(() => import('./pages/DeliverablesPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

type Portal = 'agency' | 'client';
type Role = 'ADMIN' | 'CLIENT';

function portalFor(role: Role): Portal { return role === 'ADMIN' ? 'agency' : 'client'; }

function PortalLogin({ portal }: { portal: Portal }) {
  const { user } = useAuth();
  if (user) return <Navigate to={`/${portalFor(user.role)}`} replace />;
  return <LoginPage portal={portal} />;
}

function ProtectedPortal({ role }: { role: Role }) {
  const { user } = useAuth();
  const portal = portalFor(role);
  if (!user) return <Navigate to={`/${portal}/login`} replace />;
  if (user.role !== role) return <Navigate to={`/${portalFor(user.role)}`} replace />;
  return <Shell />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${portalFor(user.role)}` : '/agency/login'} replace />;
}

function LegacyRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  if (location.pathname === '/login') return <Navigate to={user ? `/${portalFor(user.role)}` : '/agency/login'} replace />;
  if (!user) return <Navigate to="/agency/login" replace />;
  return <Navigate to={`/${portalFor(user.role)}${location.pathname}${location.search}`} replace />;
}

function AppRoutes() {
  const { loading } = useAuth();
  if (loading) return <div className="page-loading"><span className="spinner" /> Preparing your workspace</div>;
  return <Suspense fallback={<div className="page-loading"><span className="spinner" /> Loading page</div>}><Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/agency/login" element={<PortalLogin portal="agency" />} />
    <Route path="/client/login" element={<PortalLogin portal="client" />} />

    <Route path="/agency" element={<ProtectedPortal role="ADMIN" />}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/new" element={<ProjectPage mode="new" />} />
      <Route path="projects/:id" element={<ProjectPage />} />
      <Route path="clients" element={<ClientsPage />} />
      <Route path="deliverables" element={<DeliverablesPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="review/:id" element={<ReviewPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/agency" replace />} />
    </Route>

    <Route path="/client" element={<ProtectedPortal role="CLIENT" />}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/:id" element={<ProjectPage />} />
      <Route path="deliverables" element={<DeliverablesPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="review/:id" element={<ReviewPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/client" replace />} />
    </Route>

    <Route path="*" element={<LegacyRedirect />} />
  </Routes></Suspense>;
}

export default function App() { return <AuthProvider><AppRoutes /></AuthProvider>; }
