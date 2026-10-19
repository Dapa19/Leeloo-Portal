import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, CheckSquare2, ChevronDown, FolderKanban, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth';

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const base = isAdmin ? '/agency' : '/client';
  const nav = isAdmin
    ? [{ label: 'Dashboard', to: base, icon: LayoutDashboard }, { label: 'Projects', to: `${base}/projects`, icon: FolderKanban }, { label: 'Clients', to: `${base}/clients`, icon: Users }, { label: 'Deliverables', to: `${base}/deliverables`, icon: CheckSquare2 }, { label: 'Activity', to: `${base}/activity`, icon: Activity }]
    : [{ label: 'My Projects', to: base, icon: FolderKanban }, { label: 'Notifications', to: `${base}/activity`, icon: Activity }];
  const localPath = location.pathname.slice(base.length) || '/';
  const title = localPath === '/' ? (isAdmin ? 'Dashboard' : 'My projects') : localPath.startsWith('/projects/new') ? 'New project' : localPath.startsWith('/projects/') ? 'Project workspace' : localPath.startsWith('/review/') ? 'Design review' : nav.find(item => location.pathname === item.to)?.label ?? 'Account';
  async function signOut() { await logout(); navigate(`${base}/login`); }
  return <div className="app-shell">
    <button className="mobile-menu-button icon-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? <X size={19} /> : <Menu size={19} />}</button>
    {open && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <button className="brand" onClick={() => { navigate(base); setOpen(false); }}><span className="brand-mark">L</span><span>leeloo<span className="brand-light">.studio</span></span></button>
      <div className="workspace-label">{isAdmin ? 'WORKSPACE' : 'CLIENT PORTAL'}</div>
      <nav className="primary-nav">
        {nav.map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.to === base} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span></NavLink>; })}
      </nav>
      <div className="sidebar-spacer" />
      <NavLink to={`${base}/settings`} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item settings-link ${isActive ? 'nav-active' : ''}`}><Settings size={18} strokeWidth={1.8} /><span>Settings</span></NavLink>
      <button className="account-card" onClick={() => navigate(`${base}/settings`)}><span className="avatar">{user?.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><span className="account-details"><strong>{user?.name}</strong><small>{isAdmin ? 'Agency admin' : 'Client account'}</small></span><ChevronDown size={15} className="account-chevron" /></button>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>Leeloo Portal</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div><div className="topbar-right"><span className="workspace-chip"><span className="online-dot" /> {isAdmin ? 'Agency workspace' : 'Client workspace'}</span><button title="Sign out" className="icon-button signout-button" onClick={signOut}><LogOut size={17} /></button></div></header>
      <div className="content"><Outlet /></div>
    </main>
  </div>;
}
