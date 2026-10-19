import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { PageHeader } from '../components/ui';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function signOut() { try { await logout(); navigate(user?.role === 'ADMIN' ? '/agency/login' : '/client/login'); } catch (e) { toast.error((e as Error).message); } }
  return <><PageHeader eyebrow="YOUR PROFILE" title="Account" description="Your Leeloo Portal sign-in and workspace details." /><div className="settings-layout"><section className="section-card account-settings-card"><div className="section-title-row"><span className="section-icon"><UserRound size={18} /></span><div><h2>Account details</h2><p>Managed by your creative workspace.</p></div></div><div className="settings-profile"><span className="account-avatar-large">{user?.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><div><strong>{user?.name}</strong><small>{user?.role === 'ADMIN' ? 'Agency admin' : 'Client account'}</small></div></div><div className="settings-detail"><Mail size={16} /><span><small>Email address</small><strong>{user?.email}</strong></span></div><div className="settings-detail"><ShieldCheck size={16} /><span><small>Workspace access</small><strong>{user?.role === 'ADMIN' ? 'Agency workspace' : 'Assigned projects only'}</strong></span></div><div className="settings-divider" /><div className="settings-security-note"><ShieldCheck size={17} /><div><strong>Your account is protected</strong><p>Your sign-in uses a secure, server-managed session. Password and access changes are handled by your workspace administrator.</p></div></div><button className="button button-secondary settings-logout" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></section><aside className="section-card workspace-note"><div className="eyebrow">BUILT FOR BETTER WORK</div><h2>Clear feedback.<br />Thoughtful work.<br />Fewer loose ends.</h2><p>Leeloo keeps every version, comment, and handoff connected to the project it belongs to.</p><span className="workspace-note-mark">L</span></aside></div></>;
}
