import { ArrowDownUp, ArrowRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, formatDate, LoadingState, PageHeader, SearchField, StatusBadge } from '../components/ui';
import type { Project } from '../types';

export default function ProjectsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api<Project[]>(`/projects?q=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`).then(data => { if (active) setProjects(data); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, status]);
  const visible = [...projects].sort((a, b) => (new Date(a.deadline).getTime() - new Date(b.deadline).getTime()) * (sort === 'asc' ? 1 : -1));
  return <><PageHeader eyebrow={isAdmin ? 'STUDIO WORKSPACE' : 'YOUR WORKSPACE'} title={isAdmin ? 'Projects' : 'My projects'} description={isAdmin ? 'A shared view of everything your studio is making.' : 'Everything we’re creating together, all in one place.'} action={isAdmin && <Link to="/projects/new" className="button button-primary"><Plus size={17} /> New project</Link>} />
    <section className="section-card table-card"><div className="toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search by project or client..." /><div className="toolbar-controls"><select className="select-control" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select><button className="button button-secondary button-small" onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}><ArrowDownUp size={15} /> Deadline {sort === 'asc' ? '↑' : '↓'}</button></div></div>
      {loading ? <LoadingState label="Loading projects" /> : error ? <ErrorState message={error} /> : visible.length === 0 ? <EmptyState title={isAdmin ? 'No projects found' : 'No projects yet'} text={search || status ? 'Try changing your search or filters.' : isAdmin ? 'Create your first project and give the collaboration a home.' : 'The studio will share projects with you here.'} action={isAdmin && !search && !status && <Link className="button button-primary button-small" to="/projects/new"><Plus size={15} /> New project</Link>} /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Project</th>{isAdmin && <th>Client</th>}<th>Service</th><th>Status</th><th>Deadline</th><th>Deliverables</th><th aria-label="Open" /></tr></thead><tbody>{visible.map(project => { const count = project.deliverableCount ?? 0; const progress = count ? Math.round((project.completedCount ?? 0) / count * 100) : 0; return <tr key={project.id}><td><Link className="table-project" to={`/projects/${project.id}`}><span className="project-avatar">{project.name.slice(0, 1)}</span><span><strong>{project.name}</strong><small>{project.description || 'No description added'}</small></span></Link></td>{isAdmin && <td><div className="client-cell"><span className="avatar avatar-small">{project.client?.name.split(' ').map(w => w[0]).slice(0, 2).join('') ?? '—'}</span>{project.client?.name ?? 'Unassigned'}</div></td>}<td className="service-cell">{project.serviceType.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</td><td><StatusBadge status={project.status} /></td><td><span className={new Date(project.deadline) < new Date() && !['COMPLETED', 'ARCHIVED'].includes(project.status) ? 'overdue' : ''}>{formatDate(project.deadline)}</span></td><td><div className="table-progress"><span>{project.completedCount ?? 0}/{count}</span><span className="mini-progress"><i style={{ width: `${progress}%` }} /></span></div></td><td><Link aria-label={`Open ${project.name}`} className="row-open" to={`/projects/${project.id}`}><ArrowRight size={16} /></Link></td></tr>; })}</tbody></table></div>}
    </section>
  </>;
}
