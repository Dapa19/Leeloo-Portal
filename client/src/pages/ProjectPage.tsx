import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CirclePlus, Clock3, Download, FilePlus2, MessageSquareText, Paperclip, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { format } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { api, fileUrl, json } from '../api';
import { useAuth } from '../auth';
import type { Client, Deliverable, Project } from '../types';
import { ActivityList, EmptyState, ErrorState, formatDate, formatSize, LoadingState, PageHeader, StatusBadge, useLoad } from '../components/ui';

const serviceOptions = [['GRAPHIC_DESIGN', 'Graphic Design'], ['BRANDING', 'Branding'], ['SOCIAL_MEDIA_DESIGN', 'Social Media Design'], ['VIDEO_EDITING', 'Video Editing'], ['WEBSITE_DEVELOPMENT', 'Website Development'], ['OTHER', 'Other']];
const projectFormSchema = z.object({ name: z.string().trim().min(2, 'Add a project name.').max(120), clientId: z.string().uuid('Choose a client.'), description: z.string().max(5000), serviceType: z.enum(['GRAPHIC_DESIGN', 'BRANDING', 'SOCIAL_MEDIA_DESIGN', 'VIDEO_EDITING', 'WEBSITE_DEVELOPMENT', 'OTHER']), startDate: z.string().min(1, 'Choose a start date.'), deadline: z.string().min(1, 'Choose a deadline.'), status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']), internalNotes: z.string().max(5000) });
type ProjectValues = z.infer<typeof projectFormSchema>;

export default function ProjectPage({ mode }: { mode?: 'new' }) {
  const { id } = useParams();
  if (mode === 'new') return <NewProject />;
  return <ProjectDetails id={id!} />;
}

function ProjectForm({ initial, clients, onSubmit, busy, submitLabel }: { initial?: Partial<ProjectValues>; clients: Client[]; onSubmit: (value: ProjectValues) => void; busy: boolean; submitLabel: string }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ProjectValues>({ resolver: zodResolver(projectFormSchema), defaultValues: { name: '', clientId: '', description: '', serviceType: 'BRANDING', startDate: format(new Date(), 'yyyy-MM-dd'), deadline: format(new Date(Date.now() + 14 * 86400000), 'yyyy-MM-dd'), status: 'ACTIVE', internalNotes: '', ...initial } });
  return <form className="form-grid" onSubmit={handleSubmit(onSubmit)} noValidate><div className="form-field form-span"><label>Project name</label><input className="form-control" placeholder="e.g. Summer campaign identity" {...register('name')} />{errors.name && <small className="field-error">{errors.name.message}</small>}</div><div className="form-field"><label>Client</label><select className="form-control" {...register('clientId')}><option value="">Select a client</option>{clients.filter(c => c.active !== false).map(client => <option value={client.id} key={client.id}>{client.name} · {client.email}</option>)}</select>{errors.clientId && <small className="field-error">{errors.clientId.message}</small>}</div><div className="form-field"><label>Service type</label><select className="form-control" {...register('serviceType')}>{serviceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="form-field"><label>Start date</label><input className="form-control" type="date" {...register('startDate')} />{errors.startDate && <small className="field-error">{errors.startDate.message}</small>}</div><div className="form-field"><label>Deadline</label><input className="form-control" type="date" {...register('deadline')} />{errors.deadline && <small className="field-error">{errors.deadline.message}</small>}</div><div className="form-field"><label>Project status</label><select className="form-control" {...register('status')}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select></div><div className="form-field form-span"><label>Description</label><textarea className="form-control" rows={3} placeholder="A short description of the project and what success looks like." {...register('description')} /></div><div className="form-field form-span"><label>Internal notes <span className="label-muted">Only visible to the agency</span></label><textarea className="form-control" rows={2} placeholder="Private details for your team" {...register('internalNotes')} /></div><div className="form-actions form-span"><button type="button" className="button button-secondary" onClick={() => history.back()}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div></form>;
}

function NewProject() {
  const navigate = useNavigate();
  const { data: clients, loading, error } = useLoad<Client[]>('/clients');
  const [busy, setBusy] = useState(false);
  async function create(value: ProjectValues) {
    setBusy(true);
    try { const project = await api<Project>('/projects', json('POST', { ...value, startDate: new Date(`${value.startDate}T12:00:00`).toISOString(), deadline: new Date(`${value.deadline}T12:00:00`).toISOString() })); toast.success('Project created'); navigate(`/projects/${project.id}`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <><Link className="back-link" to="/projects"><ArrowLeft size={15} /> Projects</Link><PageHeader eyebrow="NEW WORKSPACE" title="Create a project" description="Give your team and client a clear place to make good work together." />{loading ? <LoadingState label="Loading clients" /> : error ? <ErrorState message={error} /> : clients?.length === 0 ? <section className="section-card"><EmptyState title="Add a client first" text="Every project needs a client workspace. Create a client account, then come back to set up this project." action={<Link className="button button-primary button-small" to="/clients"><Plus size={15} /> Create a client account</Link>} /></section> : <section className="section-card project-form-card"><div className="section-title-row"><span className="section-icon"><CirclePlus size={18} /></span><div><h2>Project details</h2><p>Start with the essentials. You can add deliverables next.</p></div></div><ProjectForm clients={clients ?? []} onSubmit={create} busy={busy} submitLabel="Create project" /></section>}</>;
}

function ProjectDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: project, loading, error, reload } = useLoad<Project>(`/projects/${id}`);
  const [tab, setTab] = useState<'overview' | 'deliverables' | 'activity'>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: clients } = useLoad<Client[]>('/clients', isAdmin);
  if (loading) return <LoadingState label="Loading project" />;
  if (error || !project) return <ErrorState message={error || 'Project not found.'} retry={() => void reload()} />;
  const total = project.deliverables?.length ?? 0;
  const delivered = project.deliverables?.filter(d => d.status === 'DELIVERED').length ?? 0;
  const progress = total ? Math.round(delivered / total * 100) : 0;
  async function edit(value: ProjectValues) {
    setBusy(true);
    try { await api(`/projects/${id}`, json('PATCH', { ...value, startDate: new Date(`${value.startDate}T12:00:00`).toISOString(), deadline: new Date(`${value.deadline}T12:00:00`).toISOString() })); toast.success('Project updated'); setEditOpen(false); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function archive() { if (!window.confirm(`Archive “${project!.name}”? It will be hidden from the client workspace.`)) return; try { await api(`/projects/${id}/archive`, json('POST', {})); toast.success('Project archived'); await reload(); } catch (e) { toast.error((e as Error).message); } }
  const initial: Partial<ProjectValues> = { name: project.name, clientId: project.members[0]?.userId ?? '', description: project.description, serviceType: project.serviceType as ProjectValues['serviceType'], startDate: project.startDate.slice(0, 10), deadline: project.deadline.slice(0, 10), status: project.status as ProjectValues['status'], internalNotes: project.internalNotes ?? '' };
  return <><div className="project-breadcrumb"><Link to="/projects"><ArrowLeft size={14} /> Projects</Link><span>/</span>{project.name}</div><PageHeader eyebrow={project.serviceType.replaceAll('_', ' ')} title={project.name} description={project.description} action={isAdmin && <div className="inline-actions"><button className="button button-secondary" onClick={() => setEditOpen(true)}><Pencil size={15} /> Edit project</button>{project.status !== 'ARCHIVED' && <button className="button button-quiet-danger" onClick={archive}>Archive</button>}</div>} />
    <div className="project-meta-strip"><StatusBadge status={project.status} /><span><CalendarDays size={15} /> Due {formatDate(project.deadline)}</span><span><Clock3 size={15} /> Started {formatDate(project.startDate)}</span>{isAdmin && <span><span className="avatar avatar-tiny">{project.members[0]?.user.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>{project.members[0]?.user.name}</span>}</div>
    <div className="tabs-line" role="tablist"><button className={tab === 'overview' ? 'tab-active' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'deliverables' ? 'tab-active' : ''} onClick={() => setTab('deliverables')}>Deliverables <span className="tab-count">{total}</span></button><button className={tab === 'activity' ? 'tab-active' : ''} onClick={() => setTab('activity')}>Activity</button></div>
    {tab === 'overview' && <div className="project-overview-grid"><div className="project-overview-main"><section className="section-card progress-card"><div className="section-head"><div><h2>Project progress</h2><p>{delivered} of {total} deliverables delivered</p></div><strong className="progress-number">{progress}%</strong></div><div className="progress-track progress-large"><span style={{ width: `${progress}%` }} /></div><div className="progress-status-note">{total ? (progress === 100 ? 'Everything is delivered. Great work together.' : 'Progress is based on deliverables marked as delivered.') : 'Add deliverables to start tracking project progress.'}</div></section><section className="section-card overview-deliverables"><div className="section-head"><div><h2>Deliverables</h2><p>Work and review items for this project.</p></div><button className="text-link" onClick={() => setTab('deliverables')}>View all <ArrowRight size={14} /></button></div>{total ? project.deliverables!.slice(0, 4).map(item => <DeliverableRow key={item.id} item={item} isAdmin={isAdmin} reload={reload} />) : <EmptyState title="Nothing to deliver yet" text={isAdmin ? 'Add a deliverable to break this project into reviewable pieces.' : 'The studio will add deliverables as the project gets underway.'} action={isAdmin && <button className="button button-secondary button-small" onClick={() => setTab('deliverables')}><Plus size={14} /> Add a deliverable</button>} />}</section></div><aside className="project-overview-aside"><section className="section-card details-card"><h2>Project details</h2><Detail label="Client" value={project.members[0]?.user.name ?? '—'} /><Detail label="Service" value={project.serviceType.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} /><Detail label="Timeline" value={`${formatDate(project.startDate)} — ${formatDate(project.deadline)}`} /><Detail label="Description" value={project.description || 'No project description.'} /><div className="detail-progress"><div><span>Overall progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div></section><section className="section-card mini-activity"><div className="section-head"><div><h2>Recent activity</h2></div><button className="text-link" onClick={() => setTab('activity')}>View all <ArrowRight size={14} /></button></div>{project.activities?.length ? <ActivityList items={project.activities.slice(0, 3)} /> : <p className="quiet-text">Project updates will appear here.</p>}</section></aside></div>}
    {tab === 'deliverables' && <DeliverablesPanel project={project} isAdmin={isAdmin} reload={reload} />}
    {tab === 'activity' && <section className="section-card project-activity-panel"><div className="section-head"><div><h2>Project activity</h2><p>Every milestone and review in one timeline.</p></div></div>{project.activities?.length ? <ActivityList items={project.activities} /> : <EmptyState title="No activity yet" text="The project timeline will begin with the first update." />}</section>}
    {editOpen && <Modal title="Edit project" onClose={() => setEditOpen(false)}><ProjectForm clients={clients ?? []} initial={initial} onSubmit={edit} busy={busy} submitLabel="Save changes" /></Modal>}
  </>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-line"><span>{label}</span><strong>{value}</strong></div>; }

function DeliverablesPanel({ project, isAdmin, reload }: { project: Project; isAdmin: boolean; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = project.deliverables ?? [];
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true);
    try { await api(`/projects/${project.id}/deliverables`, json('POST', { title: data.get('title'), type: data.get('type'), deadline: data.get('deadline') ? new Date(`${data.get('deadline')}T12:00:00`).toISOString() : null, description: data.get('description') })); toast.success('Deliverable added'); setOpen(false); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="section-card deliverables-panel"><div className="section-head"><div><h2>Project deliverables</h2><p>{items.length} {items.length === 1 ? 'item' : 'items'} · {items.filter(d => d.status === 'DELIVERED').length} delivered</p></div>{isAdmin && <button className="button button-primary button-small" onClick={() => setOpen(true)}><Plus size={15} /> Add deliverable</button>}</div>{items.length ? <div className="deliverable-list">{items.map(item => <DeliverableRow key={item.id} item={item} isAdmin={isAdmin} reload={reload} detailed />)}</div> : <EmptyState title="No deliverables yet" text={isAdmin ? 'Add the first deliverable and set a clear review target.' : 'The studio will add deliverables here as work progresses.'} action={isAdmin && <button className="button button-primary button-small" onClick={() => setOpen(true)}><Plus size={15} /> Add deliverable</button>} />}{open && <Modal title="Add a deliverable" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={create}><div className="form-field form-span"><label>Title</label><input className="form-control" name="title" required minLength={2} placeholder="e.g. Primary logo" /></div><div className="form-field"><label>Type</label><select className="form-control" name="type"><option>Design</option><option>Brand guidelines</option><option>Social assets</option><option>Video</option><option>Website</option><option>Other</option></select></div><div className="form-field"><label>Deadline</label><input className="form-control" type="date" name="deadline" /></div><div className="form-field form-span"><label>Description</label><textarea className="form-control" rows={3} name="description" placeholder="What is included in this deliverable?" /></div><div className="form-actions form-span"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy} className="button button-primary">{busy ? 'Adding…' : 'Add deliverable'}</button></div></form></Modal>}</section>;
}

function DeliverableRow({ item, isAdmin, reload, detailed = false }: { item: Deliverable; isAdmin: boolean; reload: () => Promise<void>; detailed?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  async function uploadVersion(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const body = new FormData(); body.set('file', file); body.set('notes', notes);
    setUploading(true);
    try { await api(`/deliverables/${item.id}/versions`, { method: 'POST', body }); toast.success('Design version submitted for review'); setNotes(''); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setUploading(false); event.target.value = ''; }
  }
  async function deliver(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files; if (!files?.length) return;
    const body = new FormData(); Array.from(files).forEach(file => body.append('files', file)); setBusy(true);
    try { await api(`/deliverables/${item.id}/deliver`, { method: 'POST', body }); toast.success('Final files delivered'); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); event.target.value = ''; }
  }
  async function remove() {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    try { await api(`/deliverables/${item.id}`, { method: 'DELETE' }); toast.success('Deliverable deleted'); await reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/deliverables/${item.id}`, json('PATCH', {
        title: form.get('title'), type: form.get('type'), description: form.get('description'),
        deadline: form.get('deadline') ? new Date(`${form.get('deadline')}T12:00:00`).toISOString() : null,
      }));
      toast.success('Deliverable updated'); setEditing(false); await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const current = item.currentVersion;
  return <>
    <article className={`deliverable-row-card ${detailed ? 'deliverable-detailed' : ''}`}>
      <div className="deliverable-main">
        <span className="deliverable-file-icon"><FilePlus2 size={18} /></span>
        <div className="deliverable-copy">
          <div className="deliverable-title-line"><strong>{item.title}</strong><StatusBadge status={item.status} /></div>
          <p>{item.description || item.type}{item.deadline ? ` · Due ${formatDate(item.deadline)}` : ''}</p>
          {current && <div className="version-meta">Latest: v{current.versionNumber} · {formatDate(current.createdAt)} · {current.uploadedBy.name}{current.notes ? ` · ${current.notes}` : ''}</div>}
        </div>
        <div className="deliverable-right">
          {isAdmin && <button className="icon-button" onClick={() => setEditing(true)} aria-label={`Edit ${item.title}`} title="Edit deliverable"><Pencil size={15} /></button>}
          {isAdmin && <label className="button button-secondary button-small upload-label"><UploadCloud size={15} />{uploading ? 'Uploading…' : current ? 'New version' : 'Upload design'}<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4" onChange={uploadVersion} disabled={uploading} /></label>}
          {!isAdmin && current && ['IN_REVIEW', 'REVISION_REQUESTED'].includes(item.status) && <Link className="button button-primary button-small" to={`/review/${item.id}`}>Review design <ArrowRight size={14} /></Link>}
          {!isAdmin && current && !['IN_REVIEW', 'REVISION_REQUESTED'].includes(item.status) && <Link className="button button-secondary button-small" to={`/review/${item.id}`}>View design</Link>}
          {isAdmin && item.status === 'APPROVED' && <label className="button button-primary button-small upload-label"><Check size={15} />{busy ? 'Delivering…' : 'Deliver final'}<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4" onChange={deliver} disabled={busy} /></label>}
          {isAdmin && (item._count?.comments ?? 0) === 0 && (item._count?.versions ?? 0) === 0 && <button className="icon-button destructive-icon" onClick={remove} aria-label={`Delete ${item.title}`}><Trash2 size={16} /></button>}
        </div>
      </div>
      {detailed && <div className="deliverable-details">
        <div className="version-summary">
          <span><Clock3 size={14} /> {item.versions?.length ?? 0} {item.versions?.length === 1 ? 'version' : 'versions'}</span>
          <span><MessageSquareText size={14} /> {item.comments?.length ?? 0} comments</span>
          {item.approvals?.map(approval => <span key={approval.id}><Check size={14} /> Approved v{approval.version.versionNumber} by {approval.approver.name}</span>)}
        </div>
        {isAdmin && <label className="version-notes"><span>Version note <small>(optional)</small></span><input className="form-control" value={notes} onChange={event => setNotes(event.target.value)} placeholder="A short note to the client" /></label>}
        {item.files?.length ? <div className="final-file-list">{item.files.map(file => <a className="final-file-row" href={fileUrl(file.id)} key={file.id}><Paperclip size={15} /><span>{file.originalName}</span><small>{formatSize(file.size)} · Delivered {formatDate(file.createdAt)}</small><Download size={15} /></a>)}</div> : null}
        {item.versions?.length ? <div className="version-history">{item.versions.map(version => <div key={version.id}><span>Version {version.versionNumber}</span><small>{formatDate(version.createdAt)} · {version.uploadedBy.name}</small><StatusBadge status={version.reviewStatus === 'SUBMITTED' && item.status === 'IN_REVIEW' ? 'IN_REVIEW' : version.reviewStatus} />{version.file && <a href={fileUrl(version.file.id)}><Download size={14} /> Download</a>}</div>)}</div> : null}
      </div>}
    </article>
    {editing && <Modal title="Edit deliverable" onClose={() => setEditing(false)}><form className="form-grid" onSubmit={update}>
      <div className="form-field form-span"><label>Title</label><input className="form-control" name="title" minLength={2} maxLength={120} required defaultValue={item.title} /></div>
      <div className="form-field"><label>Type</label><input className="form-control" name="type" maxLength={80} required defaultValue={item.type} /></div>
      <div className="form-field"><label>Deadline</label><input className="form-control" name="deadline" type="date" defaultValue={item.deadline?.slice(0, 10) ?? ''} /></div>
      <div className="form-field form-span"><label>Description</label><textarea className="form-control" name="description" rows={3} maxLength={3000} defaultValue={item.description} /></div>
      <div className="form-actions form-span"><button type="button" className="button button-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form></Modal>}
  </>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div>; }
