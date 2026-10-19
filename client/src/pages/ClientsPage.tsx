import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Plus, UserRound, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { api, json } from '../api';
import { Modal } from './ProjectPage';
import type { Client } from '../types';
import { EmptyState, ErrorState, LoadingState, PageHeader, useLoad } from '../components/ui';

const schema = z.object({ name: z.string().trim().min(2, 'Add a client name.'), email: z.string().email('Enter a valid email.'), password: z.string().min(10, 'Use at least 10 characters.') });
type Values = z.infer<typeof schema>;

export default function ClientsPage() {
  const { data, loading, error, reload } = useLoad<Client[]>('/clients');
  const [selected, setSelected] = useState<Client | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const clients = data ?? [];
  async function toggleActive(client: Client) {
    try { await api(`/clients/${client.id}`, json('PATCH', { active: !client.active })); toast.success(client.active ? 'Client access paused' : 'Client access restored'); await reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function save(values: Values) {
    setBusy(true);
    try {
      if (selected) await api(`/clients/${selected.id}`, json('PATCH', values));
      else await api('/clients', json('POST', values));
      toast.success(selected ? 'Client account updated' : 'Client account created'); setSelected(null); setNewOpen(false); await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="YOUR PEOPLE" title="Clients" description="Manage the people you work with and the projects you share." action={<button className="button button-primary" onClick={() => setNewOpen(true)}><Plus size={17} /> Add client</button>} />{loading ? <LoadingState label="Loading clients" /> : error ? <ErrorState message={error} retry={() => void reload()} /> : clients.length ? <section className="client-grid">{clients.map(client => <article className={`client-card ${!client.active ? 'client-inactive' : ''}`} key={client.id}><div className="client-card-head"><span className="client-avatar">{client.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><span className={`client-state ${client.active ? '' : 'client-state-paused'}`}>{client.active ? <><UserRoundCheck size={13} /> Active</> : <><UserRoundX size={13} /> Paused</>}</span></div><h2>{client.name}</h2><a className="client-email" href={`mailto:${client.email}`}><Mail size={14} />{client.email}</a><div className="client-projects-heading">PROJECTS <span>{client.projects.length}</span></div>{client.projects.length ? <div className="client-project-tags">{client.projects.slice(0, 3).map(project => <Link to={`/projects/${project.id}`} key={project.id}>{project.name}</Link>)}{client.projects.length > 3 && <span className="more-projects">+{client.projects.length - 3} more</span>}</div> : <p className="no-client-projects">No projects assigned yet.</p>}<div className="client-card-actions"><button className="button button-secondary button-small" onClick={() => setSelected(client)}><UserRound size={14} /> Edit account</button><button className="button button-quiet button-small" onClick={() => void toggleActive(client)}>{client.active ? 'Pause access' : 'Restore access'}</button></div></article>)}</section> : <section className="section-card"><EmptyState title="No client accounts yet" text="Create an account for your first client, then assign them to a project." action={<button className="button button-primary button-small" onClick={() => setNewOpen(true)}><Plus size={15} /> Add client</button>} /></section>}{(newOpen || selected) && <ClientModal client={selected} busy={busy} onClose={() => { setSelected(null); setNewOpen(false); }} onSave={save} />}</>;
}

function ClientModal({ client, busy, onClose, onSave }: { client: Client | null; busy: boolean; onClose: () => void; onSave: (values: Values) => void }) {
  const formSchema = client ? schema.extend({ password: z.string().min(10, 'Use at least 10 characters.').or(z.literal('')) }) : schema;
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: { name: client?.name ?? '', email: client?.email ?? '', password: '' } });
  return <Modal title={client ? 'Edit client account' : 'Create client account'} onClose={onClose}><p className="modal-description">{client ? 'Update account details or set a new temporary password.' : 'The client can sign in with these details. Share the password with them securely.'}</p><form className="form-grid" onSubmit={handleSubmit(onSave)}><div className="form-field form-span"><label>Full name</label><input className="form-control" placeholder="e.g. Alex Morgan" {...register('name')} />{errors.name && <small className="field-error">{errors.name.message}</small>}</div><div className="form-field form-span"><label>Email address</label><input className="form-control" type="email" placeholder="alex@company.com" {...register('email')} />{errors.email && <small className="field-error">{errors.email.message}</small>}</div><div className="form-field form-span"><label>{client ? 'New password' : 'Temporary password'}</label><input className="form-control" type="password" autoComplete="new-password" placeholder={client ? 'Leave empty to keep current password' : 'At least 10 characters'} {...register('password')} />{errors.password && <small className="field-error">{errors.password.message}</small>}</div><div className="form-actions form-span"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : client ? 'Save changes' : 'Create account'}</button></div></form></Modal>;
}
