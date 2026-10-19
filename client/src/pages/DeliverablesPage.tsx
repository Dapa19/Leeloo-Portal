import { ArrowRight, CheckCircle2, Clock3, FileStack, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, useLoad } from '../components/ui';
import type { Deliverable } from '../types';

interface DeliverableWithProject extends Deliverable { project: { id: string; name: string; deadline: string }; }

export default function DeliverablesPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad<DeliverableWithProject[]>('/deliverables');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const filtered = useMemo(() => (data ?? []).filter(item => (!status || item.status === status) && `${item.title} ${item.project.name}`.toLowerCase().includes(query.toLowerCase())), [data, query, status]);
  const isAdmin = user?.role === 'ADMIN';
  return <><PageHeader eyebrow="THE WORK, IN FOCUS" title="Deliverables" description={isAdmin ? 'Track design work and review status across all your projects.' : 'Review each piece of work and download final files as they arrive.'} />
    <section className="section-card table-card"><div className="toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search deliverables..." /></label><select className="select-control" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{[['NOT_STARTED','Not started'],['IN_PROGRESS','In progress'],['IN_REVIEW','In review'],['REVISION_REQUESTED','Revision requested'],['APPROVED','Approved'],['DELIVERED','Delivered']].map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></div>{loading ? <LoadingState label="Loading deliverables" /> : error ? <ErrorState message={error} retry={() => void reload()} /> : filtered.length ? <div className="deliverable-directory">{filtered.map(item => <article className="directory-row" key={item.id}><span className="deliverable-file-icon"><FileStack size={18} /></span><div className="directory-main"><Link to={`/projects/${item.project.id}`}><strong>{item.title}</strong></Link><Link className="directory-project" to={`/projects/${item.project.id}`}>{item.project.name}</Link></div><StatusBadge status={item.status} /><div className="directory-meta">{item.status === 'DELIVERED' ? <><CheckCircle2 size={15} /> Delivered</> : <><Clock3 size={15} />{item.deadline ? new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No deadline'}</>}</div>{!isAdmin && item.currentVersion && ['IN_REVIEW','REVISION_REQUESTED'].includes(item.status) ? <Link className="button button-primary button-small" to={`/review/${item.id}`}>Review <ArrowRight size={14} /></Link> : <Link className="icon-link" to={`/projects/${item.project.id}`} aria-label={`Open ${item.title}`}><ArrowRight size={16} /></Link>}</article>)}</div> : <EmptyState title="No deliverables match" text={query || status ? 'Try clearing your search or status filter.' : 'Deliverables will appear as your projects take shape.'} />}</section>
  </>;
}
