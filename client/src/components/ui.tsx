import React from 'react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { ArrowUpRight, FileText, FolderOpen, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { Activity } from '../types';

export function useLoad<T>(url: string, enabled = true) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const load = React.useCallback(async () => {
    if (!enabled) { setLoading(false); setData(null); setError(''); return; }
    setLoading(true); setError('');
    try { setData(await api<T>(url)); } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [url, enabled]);
  React.useEffect(() => { void load(); }, [load]);
  return { data, setData, loading, error, reload: load };
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-actions">{action}</div>}</div>;
}

const statusLabels: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed', ARCHIVED: 'Archived', NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', IN_REVIEW: 'In review', REVISION_REQUESTED: 'Revision requested', APPROVED: 'Approved', DELIVERED: 'Delivered', SUBMITTED: 'Submitted' };
export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status.toLowerCase()}`}><span className="status-dot" />{statusLabels[status] ?? status}</span>; }
export function formatDate(value?: string | null) { if (!value) return 'No date set'; const date = typeof value === 'string' ? parseISO(value) : new Date(value); return Number.isNaN(date.getTime()) ? 'No date set' : format(date, 'MMM d, yyyy'); }
export function dueText(value?: string | null) { if (!value) return 'No deadline'; const date = parseISO(value); if (isToday(date)) return 'Due today'; return `${isPast(date) ? 'Overdue · ' : ''}${format(date, 'MMM d')}`; }
export function formatSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} MB`; }

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><FolderOpen size={21} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function LoadingState({ label = 'Loading your workspace' }: { label?: string }) { return <div className="inline-loading"><span className="spinner" />{label}</div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="error-state"><strong>We couldn’t load this page</strong><p>{message}</p>{retry && <button className="button button-secondary button-small" onClick={retry}>Try again</button>}</div>; }

export function ActivityList({ items, showProject = false }: { items: Activity[]; showProject?: boolean }) {
  return <div className="activity-list">{items.map(item => <div className="activity-row" key={item.id}><span className={`activity-icon activity-${item.type.toLowerCase()}`}><FileText size={16} /></span><div className="activity-copy"><p>{item.message}</p><span>{item.actor?.name ?? 'Leeloo Studio'}{item.deliverable?.title ? ` · ${item.deliverable.title}` : ''}{showProject && item.project ? <><span className="muted-dot"> · </span><a className="subtle-link" href={`/projects/${item.project.id}`}>{item.project.name}<ArrowUpRight size={12} /></a></> : ''}</span></div><time>{formatDate(item.createdAt)}</time></div>)}</div>;
}

export function SearchField({ value, onChange, placeholder = 'Search projects...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="search-field"><Search size={16} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />{value && <button type="button" aria-label="Clear search" onClick={() => onChange('')}>×</button>}</label>; }

