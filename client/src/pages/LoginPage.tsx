import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth';

const schema = z.object({ email: z.string().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
type LoginValues = z.infer<typeof schema>;

export default function LoginPage({ portal }: { portal: 'agency' | 'client' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  async function submit(values: LoginValues) { setError(''); try { await login(values.email, values.password, portal); navigate(`/${portal}`, { replace: true }); } catch (e) { setError((e as Error).message); } }
  const isAgency = portal === 'agency';
  return <main className={`login-page login-page-${portal}`}><section className="login-panel"><div className="login-brand"><span className="brand-mark">L</span><span>leeloo<span className="brand-light">.studio</span></span></div><div className="login-intro"><div className="eyebrow">{isAgency ? 'AGENCY WORKSPACE' : 'CLIENT PORTAL'}</div><h1>{isAgency ? <>Your studio,<br />in sync.</> : <>Good work happens<br />in good company.</>}</h1><p>{isAgency ? 'Manage projects, deliverables, and client reviews in one place.' : 'Your projects, feedback, and final files all in one place.'}</p></div><form onSubmit={handleSubmit(submit)} className="login-form" noValidate><label className="field-label" htmlFor="email">Email address</label><div className="input-with-icon"><Mail size={17} /><input id="email" type="email" autoComplete="username" placeholder={isAgency ? 'you@studio.com' : 'you@company.com'} {...register('email')} /></div>{errors.email && <span className="field-error">{errors.email.message}</span>}<label className="field-label password-label" htmlFor="password">Password</label><div className="input-with-icon"><LockKeyhole size={17} /><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} /></div>{errors.password && <span className="field-error">{errors.password.message}</span>}{error && <div className="form-alert">{error}</div>}<button className="button button-primary login-submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}</button></form><div className="login-footnote"><Check size={14} /> Secure access to your {isAgency ? 'agency workspace' : 'client workspace'}</div><div className="login-portal-switch">{isAgency ? <>A client? <Link to="/client/login">Go to client sign in</Link></> : <>Agency team? <Link to="/agency/login">Go to agency sign in</Link></>}</div></section><aside className="login-aside"><div className="login-note"><span className="login-note-line" /><p>{isAgency ? '“A clear view of the work gives your team more room to do its best thinking.”' : '“The best projects are built together. This is where the little details become something great.”'}</p><span>THE LEELOO STUDIO TEAM</span></div><div className="login-aside-footer">Thoughtful design. Clear collaboration.</div></aside></main>;
}
