import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading"><span className="spinner" /> Preparing your workspace</div>;
  return <Suspense fallback={<div className="page-loading"><span className="spinner" /> Loading page</div>}><Routes>
    <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/new" element={<ProjectPage mode="new" />} />
      <Route path="projects/:id" element={<ProjectPage />} />
      <Route path="clients" element={<ClientsPage />} />
      <Route path="deliverables" element={<DeliverablesPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="review/:id" element={<ReviewPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></Suspense>;
}

export default function App() { return <AuthProvider><AppRoutes /></AuthProvider>; }
