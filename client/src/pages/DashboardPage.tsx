import { ArrowRight, ArrowUpRight, Clock3, FolderKanban, Plus, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import type { Activity, Project } from '../types';
import { ActivityList, dueText, EmptyState, ErrorState, formatDate, LoadingState, PageHeader, StatusBadge, useLoad } from '../components/ui';

interface DashboardData { stats: { activeProjects: number; awaitingApproval: number; revisions: number; completedProjects: number }; activities: Activity[]; deadlines: (Project & { members: { user: { name: string } }[] })[]; }

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad<DashboardData>('/dashboard');
  const { data: projects } = useLoad<Project[]>('/projects');
  const isAdmin = user?.role === 'ADMIN';
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  const stats = data?.stats;
  return <>
    <PageHeader eyebrow={isAdmin ? format(new Date(), 'EEEE, MMMM d').toUpperCase() : 'YOUR WORKSPACE'} title={isAdmin ? 'Good morning.' : `Welcome back, ${user?.name.split(' ')[0]}.`} description={isAdmin ? 'Here’s what’s moving across your studio today.' : 'A clear view of what we’re making together.'} action={isAdmin && <Link className="button button-primary" to="/projects/new"><Plus size={17} /> New project</Link>} />
    {isAdmin ? <>
      <div className="stats-grid"><Stat icon={<FolderKanban size={18} />} label="Active projects" value={stats?.activeProjects ?? 0} note="Currently in progress" /><Stat icon={<Clock3 size={18} />} label="Awaiting approval" value={stats?.awaitingApproval ?? 0} note="Ready for client review" /><Stat icon={<Sparkles size={18} />} label="Revision requests" value={stats?.revisions ?? 0} note="Needs your attention" /><Stat icon={<span className="check-stat">✓</span>} label="Completed" value={stats?.completedProjects ?? 0} note="Projects wrapped up" /></div>
      <div className="dashboard-columns"><section className="section-card"><div className="section-head"><div><h2>Upcoming deadlines</h2><p>Keep the next milestones in view.</p></div><Link to="/projects" className="text-link">All projects <ArrowRight size={14} /></Link></div>{data?.deadlines.length ? <div className="deadline-list">{data.deadlines.map(project => <Link to={`/projects/${project.id}`} className="deadline-row" key={project.id}><span className="project-avatar">{project.name.slice(0, 1)}</span><span className="deadline-project"><strong>{project.name}</strong><small>{project.members[0]?.user.name ?? 'Client'}</small></span><StatusBadge status={project.status} /><time className={new Date(project.deadline) < new Date() ? 'overdue' : ''}>{dueText(project.deadline)}</time></Link>)}</div> : <EmptyState title="No deadlines on the horizon" text="New project deadlines will show up here." action={<Link className="text-link" to="/projects/new">Create a project <ArrowRight size={14} /></Link>} />}</section><section className="section-card activity-card"><div className="section-head"><div><h2>Recent activity</h2><p>The latest updates from your projects.</p></div><Link to="/activity" className="icon-link" aria-label="See all activity"><ArrowUpRight size={17} /></Link></div>{data?.activities.length ? <ActivityList items={data.activities} showProject /> : <EmptyState title="It’s quiet here" text="Project updates will appear as your team makes progress." />}</section></div>
    </> : <ClientDashboard projects={projects ?? []} activities={data?.activities ?? []} />}
  </>;
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) { return <div className="stat-card"><span className="stat-icon">{icon}</span><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>; }

function ClientDashboard({ projects, activities }: { projects: Project[]; activities: Activity[] }) {
  return <><div className="client-intro-banner"><div><div className="eyebrow">YOUR PROJECTS</div><h2>A little progress goes a long way.</h2><p>Everything you need to stay in the loop and move things forward.</p></div><div className="client-banner-mark">L</div></div><div className="dashboard-columns client-dashboard-columns"><section className="section-card"><div className="section-head"><div><h2>In progress <span className="count-pill">{projects.filter(p => ['ACTIVE', 'DRAFT', 'ON_HOLD'].includes(p.status)).length}</span></h2><p>Your active creative projects.</p></div><Link to="/projects" className="text-link">All projects <ArrowRight size={14} /></Link></div>{projects.length ? <div className="client-project-list">{projects.map(project => { const progress = project.deliverableCount ? Math.round((project.completedCount ?? 0) / project.deliverableCount * 100) : 0; return <Link to={`/projects/${project.id}`} className="client-project-row" key={project.id}><div className="client-project-top"><div><strong>{project.name}</strong><p>{project.serviceType.replaceAll('_', ' ').toLowerCase()} <span>·</span> due {formatDate(project.deadline)}</p></div><StatusBadge status={project.status} /></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-label"><span>{progress}% complete</span><span>{project.deliverableCount ?? 0} deliverables</span></div></Link>; })}</div> : <EmptyState title="Your projects will live here" text="Once the studio shares a project with you, you’ll be able to review all the details here." />}</section><section className="section-card activity-card"><div className="section-head"><div><h2>Latest updates</h2><p>Recent notes from the studio.</p></div></div>{activities.length ? <ActivityList items={activities} /> : <EmptyState title="No new updates" text="We’ll keep you posted as your project progresses." />}</section></div></>;
}
