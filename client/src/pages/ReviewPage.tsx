import { ArrowLeft, Check, CheckCircle2, Download, FileImage, FileText, MessageCircle, Send, ShieldCheck, Video } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, fileUrl, json } from '../api';
import { useAuth } from '../auth';
import type { Deliverable, Version } from '../types';
import { EmptyState, ErrorState, formatDate, formatSize, LoadingState, PageHeader, StatusBadge, useLoad } from '../components/ui';

export default function ReviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad<Deliverable>(`/deliverables/${id}`);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const clientCanReview = user?.role === 'CLIENT' && data?.status === 'IN_REVIEW' && data.currentVersion?.reviewStatus === 'SUBMITTED';
  const activeVersion: Version | undefined = data?.versions?.find(version => version.id === selectedVersion) ?? data?.currentVersion ?? undefined;

  async function postComment(event: React.FormEvent) {
    event.preventDefault(); if (!activeVersion || !comment.trim()) return;
    setBusy(true);
    try { await api(`/versions/${activeVersion.id}/comments`, json('POST', { message: comment })); setComment(''); toast.success('Comment added'); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function requestRevision(event: React.FormEvent) {
    event.preventDefault(); if (!data?.currentVersion) return;
    setBusy(true);
    try { await api(`/versions/${data.currentVersion.id}/revisions`, json('POST', { message: revision })); setRevision(''); setRevisionOpen(false); toast.success('Revision request sent to the studio'); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function approve() {
    if (!data?.currentVersion || !window.confirm(`Approve “${data.title}”, version ${data.currentVersion.versionNumber}? The studio will be able to prepare the final files.`)) return;
    setBusy(true);
    try { await api(`/versions/${data.currentVersion.id}/approval`, json('POST', {})); toast.success('Design approved'); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (loading) return <LoadingState label="Loading design review" />;
  if (error || !data) return <ErrorState message={error || 'This design could not be found.'} retry={() => void reload()} />;
  const comments = activeVersion?.comments ?? data.comments?.filter(item => item.version?.versionNumber === activeVersion?.versionNumber) ?? [];
  const preview = activeVersion?.file;
  const isImage = preview?.mimeType.startsWith('image/');
  const isVideo = preview?.mimeType.startsWith('video/');
  const isPdf = preview?.mimeType === 'application/pdf';
  return <><div className="project-breadcrumb"><Link to={`/projects/${data.project?.id}`}><ArrowLeft size={14} /> {data.project?.name ?? 'Project'}</Link><span>/</span>Design review</div><PageHeader eyebrow="DESIGN REVIEW" title={data.title} description={data.description || 'Review the latest work, share feedback, and keep the project moving.'} action={<StatusBadge status={data.status} />} />
    {clientCanReview && <div className="review-callout"><span className="review-callout-icon"><ShieldCheck size={18} /></span><div><strong>This design is ready for your review</strong><p>Take a look, then approve it or tell us what you’d like to refine.</p></div><span className="review-callout-version">Version {data.currentVersion?.versionNumber}</span></div>}
    <div className="review-layout"><div className="review-main"><section className="section-card preview-card"><div className="preview-heading"><div><div className="eyebrow">DESIGN PREVIEW</div><h2>{activeVersion ? `Version ${activeVersion.versionNumber}` : 'No version submitted yet'}</h2></div>{activeVersion && <StatusBadge status={activeVersion.reviewStatus === 'SUBMITTED' && data.status === 'IN_REVIEW' ? 'IN_REVIEW' : activeVersion.reviewStatus} />}</div>{preview ? <div className={`design-preview ${isImage ? 'image-preview' : ''}`}>{isImage ? <img src={fileUrl(preview.id, true)} alt={`${data.title} version ${activeVersion?.versionNumber}`} /> : isPdf ? <iframe title={`${data.title} PDF preview`} src={fileUrl(preview.id, true)} /> : isVideo ? <video controls preload="metadata" src={fileUrl(preview.id, true)} /> : <div className="unsupported-preview"><FileText size={34} /><strong>Preview unavailable</strong><span>{preview.originalName} · {formatSize(preview.size)}</span><a href={fileUrl(preview.id)} className="button button-secondary button-small"><Download size={15} /> Download file</a></div>}</div> : <EmptyState title="No design version yet" text="The studio hasn’t uploaded a version for this deliverable." />}{activeVersion && <div className="preview-file-meta"><div className="preview-file-type">{isVideo ? <Video size={16} /> : isImage ? <FileImage size={16} /> : <FileText size={16} />}<strong>{preview?.originalName ?? 'Version file'}</strong><span>{preview ? `${preview.mimeType.split('/')[1]?.toUpperCase()} · ${formatSize(preview.size)}` : ''}</span></div><div className="preview-uploader">Uploaded by <strong>{activeVersion.uploadedBy.name}</strong><span>·</span>{formatDate(activeVersion.createdAt)}</div>{preview && <a className="icon-link" href={fileUrl(preview.id)} aria-label="Download version"><Download size={16} /></a>}</div>}</section>
      <section className="section-card comments-card"><div className="section-head"><div><h2>Feedback & comments</h2><p>Keep conversation attached to the version you’re reviewing.</p></div><span className="count-pill">{comments.length}</span></div><div className="comment-thread">{comments.length ? comments.map(item => <article className={`comment-item ${item.revisionRequest ? 'revision-comment' : ''}`} key={item.id}><span className={`avatar ${item.author.role === 'ADMIN' ? 'avatar-agency' : ''}`}>{item.author.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><div className="comment-content"><div className="comment-meta"><strong>{item.author.name}</strong>{item.author.role === 'ADMIN' && <span className="role-tag">STUDIO</span>}{item.revisionRequest && <StatusBadge status="REVISION_REQUESTED" />}<time>{format(new Date(item.createdAt), 'MMM d · h:mm a')}</time></div><p>{item.message}</p></div></article>) : <div className="no-comments"><MessageCircle size={17} /><span>No comments on this version yet.</span></div>}</div>{activeVersion && (user?.role === 'ADMIN' || (user?.role === 'CLIENT' && activeVersion.id === data.currentVersionId && ['IN_REVIEW', 'REVISION_REQUESTED'].includes(data.status))) && <form className="comment-form" onSubmit={postComment}><textarea className="form-control" value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Add a comment or question..." maxLength={4000} /><div className="comment-form-bottom"><span>Be specific — it helps us get every detail right.</span><button className="button button-primary button-small" disabled={busy || !comment.trim()}><Send size={14} /> {busy ? 'Sending…' : 'Comment'}</button></div></form>}</section></div>
      <aside className="review-aside"><section className="section-card review-actions-card"><div className="section-head"><div><h2>Review this design</h2><p>Good design is a conversation.</p></div></div>{clientCanReview ? <div className="review-action-buttons"><button className="button button-primary review-approve" onClick={() => void approve()} disabled={busy}><Check size={17} /> Approve design</button><button className="button button-secondary" onClick={() => setRevisionOpen(true)} disabled={busy}>Request a revision</button><small>Approvals are recorded for this exact version.</small></div> : data.status === 'APPROVED' || data.status === 'DELIVERED' ? <div className="approved-message"><span><CheckCircle2 size={18} /></span><div><strong>Design approved</strong><p>The studio has recorded your approval. Final files will appear here after delivery.</p></div></div> : <div className="review-status-message"><Clock3Icon /><p>{data.status === 'REVISION_REQUESTED' ? 'Your requested changes are with the studio.' : 'Review actions will appear when a version is ready.'}</p></div>}</section>
        <section className="section-card version-card"><div className="section-head"><div><h2>Version history</h2><p>Every iteration, kept in one place.</p></div></div>{data.versions?.length ? <div className="version-select-list">{data.versions.map(version => <button className={`version-select ${activeVersion?.id === version.id ? 'version-selected' : ''}`} key={version.id} onClick={() => setSelectedVersion(version.id)}><span className="version-radio" /><span className="version-select-info"><strong>Version {version.versionNumber}{version.id === data.currentVersionId && <em>Current</em>}</strong><small>{formatDate(version.createdAt)} · {version.uploadedBy.name}</small>{version.notes && <small>{version.notes}</small>}</span><StatusBadge status={version.reviewStatus === 'SUBMITTED' && version.id === data.currentVersionId && data.status === 'IN_REVIEW' ? 'IN_REVIEW' : version.reviewStatus} /></button>)}</div> : <p className="quiet-text">No versions have been uploaded yet.</p>}</section>
        {data.files?.length ? <section className="section-card final-files-card"><div className="section-head"><div><h2>Final files</h2><p>Ready to download and use.</p></div></div>{data.files.map(file => <a key={file.id} className="final-download" href={fileUrl(file.id)}><span><FileText size={16} /></span><div><strong>{file.originalName}</strong><small>{formatSize(file.size)} · {formatDate(file.createdAt)}</small></div><Download size={16} /></a>)}</section> : null}
      </aside></div>
    {revisionOpen && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-modal="true" aria-label="Request a revision"><div className="modal-heading"><h2>Request a revision</h2><button className="icon-button" onClick={() => setRevisionOpen(false)} aria-label="Close"><span>×</span></button></div><p className="modal-description">Tell the studio what you’d like to change in version {data.currentVersion?.versionNumber}. This note will be attached to the design.</p><form onSubmit={requestRevision}><label className="field-label" htmlFor="revision-message">What should we refine?</label><textarea id="revision-message" className="form-control revision-input" value={revision} onChange={e => setRevision(e.target.value)} rows={5} maxLength={4000} required minLength={1} placeholder="Share clear, constructive feedback…" /><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setRevisionOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy || !revision.trim()}><Send size={15} />{busy ? 'Sending…' : 'Send revision request'}</button></div></form></div></div>}
  </>;
}

function Clock3Icon() { return <span className="review-clock">◷</span>; }
