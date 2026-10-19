import { createReadStream } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { ActivityType, DeliverableStatus, FileKind, ProjectStatus, Role, VersionReviewStatus } from './generated/prisma/client.js';
import { prisma } from './db.js';
import { authenticate, createSession, destroySession, requireRole, verifyCsrf } from './auth.js';
import { asyncRoute, fail, ok, type AuthedRequest } from './http.js';
import { storage } from './storage.js';
import { canAccessProject, canApproveVersion, canCommentOnVersion, canDownload, canRequestRevision } from './policies.js';
import { clientPatchSchema, clientSchema, deliverablePatchSchema, deliverableSchema, loginSchema, messageSchema, parse, projectPatchSchema, projectSchema, versionSchema } from './validation.js';

export const api = Router();
const adminOnly = [authenticate, verifyCsrf, requireRole(Role.ADMIN)];
const mutating = [authenticate, verifyCsrf];
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

function routeId(req: AuthedRequest, key = 'id') {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function userView(user: { id: string; name: string; email: string; role: Role; active?: boolean; createdAt?: Date }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, ...(user.active === undefined ? {} : { active: user.active }), ...(user.createdAt ? { createdAt: user.createdAt } : {}) };
}

async function requireProjectAccess(projectId: string, req: AuthedRequest) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } },
  });
  if (!project) fail(404, 'Project not found.');
  if (!canAccessProject(req.auth!.role, project.members.map(m => m.userId), req.auth!.userId)) fail(404, 'Project not found.');
  const { internalNotes, ...visibleProject } = project;
  return { ...visibleProject, ...(req.auth?.role === Role.ADMIN ? { internalNotes } : {}) };
}

async function requireDeliverableAccess(deliverableId: string, req: AuthedRequest) {
  const deliverable = await prisma.deliverable.findUnique({
    where: { id: deliverableId },
    include: { project: { include: { members: { select: { userId: true } } } } },
  });
  if (!deliverable) fail(404, 'Deliverable not found.');
  if (!canAccessProject(req.auth!.role, deliverable.project.members.map(m => m.userId), req.auth!.userId)) fail(404, 'Deliverable not found.');
  return deliverable;
}

async function logActivity(projectId: string, actorId: string | null, type: ActivityType, message: string, deliverableId?: string) {
  return prisma.activityLog.create({ data: { projectId, actorId, type, message, ...(deliverableId ? { deliverableId } : {}) } });
}

async function parseUpload(file: Express.Multer.File | undefined) {
  if (!file) fail(400, 'Choose a file to upload.');
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const allowed: Record<string, string[]> = {
    jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], pdf: ['application/pdf'], mp4: ['video/mp4'],
  };
  const detected = await fileTypeFromBuffer(file.buffer);
  const actualMime = detected?.mime;
  if (!allowed[ext] || !actualMime || !allowed[ext].includes(actualMime)) fail(400, 'This file type is not supported or the file content does not match its extension.');
  const baseName = path.basename(file.originalname).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) || `upload.${ext}`;
  return { ext, mimeType: actualMime, originalName: baseName, size: file.size, buffer: file.buffer };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB ?? 100) * 1024 * 1024, files: 8 },
});

api.post('/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) fail(401, 'Email or password is incorrect.');
  const csrfToken = await createSession(user.id, res);
  res.json(ok({ user: userView(user), csrfToken }));
}));

api.post('/auth/logout', ...mutating, asyncRoute(async (req, res) => {
  await destroySession(req, res);
  res.json(ok({ loggedOut: true }));
}));

api.get('/auth/me', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  res.json(ok({ user: userView(user), csrfToken: auth.csrfToken }));
}));

api.get('/dashboard', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const where = auth.role === Role.ADMIN ? { status: { not: ProjectStatus.ARCHIVED } } : { members: { some: { userId: auth.userId } }, status: { not: ProjectStatus.ARCHIVED } };
  const projects = await prisma.project.findMany({ where, include: { deliverables: { select: { id: true, status: true } }, members: { include: { user: { select: { name: true } } } } } });
  const projectIds = projects.map(p => p.id);
  const [activities, deadlines] = await Promise.all([
    prisma.activityLog.findMany({ where: { projectId: { in: projectIds } }, orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } }, project: { select: { name: true } }, deliverable: { select: { title: true } } } }),
    prisma.project.findMany({ where: { id: { in: projectIds }, deadline: { gte: new Date() } }, orderBy: { deadline: 'asc' }, take: 5, include: { members: { include: { user: { select: { name: true } } } } } }),
  ]);
  const stats = {
    activeProjects: projects.filter(p => p.status === ProjectStatus.ACTIVE || p.status === ProjectStatus.DRAFT).length,
    awaitingApproval: projects.reduce((n, p) => n + p.deliverables.filter(d => d.status === DeliverableStatus.IN_REVIEW).length, 0),
    revisions: projects.reduce((n, p) => n + p.deliverables.filter(d => d.status === DeliverableStatus.REVISION_REQUESTED).length, 0),
    completedProjects: projects.filter(p => p.status === ProjectStatus.COMPLETED).length,
  };
  const safeDeadlines = deadlines.map(({ internalNotes: _notes, creatorId: _creator, ...project }) => project);
  res.json(ok({ stats, deadlines: safeDeadlines, activities }));
}));

api.get('/clients', ...adminOnly, asyncRoute(async (_req, res) => {
  const clients = await prisma.user.findMany({ where: { role: Role.CLIENT }, orderBy: { name: 'asc' }, include: { memberships: { include: { project: { select: { id: true, name: true, status: true, deadline: true } } } } } });
  res.json(ok(clients.map(c => ({ ...userView(c), projects: c.memberships.map(m => m.project) }))));
}));

api.post('/clients', ...adminOnly, asyncRoute(async (req, res) => {
  const input = parse(clientSchema, req.body);
  const user = await prisma.user.create({ data: { ...input, email: input.email.toLowerCase().trim(), passwordHash: await bcrypt.hash(input.password, 12), role: Role.CLIENT } });
  res.status(201).json(ok(userView(user)));
}));

api.patch('/clients/:id', ...adminOnly, asyncRoute(async (req, res) => {
  const input = parse(clientPatchSchema, req.body);
  const { password, ...rest } = input;
  const user = await prisma.$transaction(async tx => {
    const updated = await tx.user.update({ where: { id: routeId(req as AuthedRequest), role: Role.CLIENT }, data: { ...rest, ...(rest.email ? { email: rest.email.toLowerCase().trim() } : {}), ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) } });
    if (password || rest.active === false) await tx.session.deleteMany({ where: { userId: updated.id } });
    return updated;
  });
  res.json(ok(userView(user)));
}));

api.get('/projects', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const query = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '');
  const where = {
    ...(auth.role === Role.CLIENT ? { members: { some: { userId: auth.userId } }, status: { not: ProjectStatus.ARCHIVED } } : {}),
    ...(status && Object.values(ProjectStatus).includes(status as ProjectStatus) && (auth.role === Role.ADMIN || status !== ProjectStatus.ARCHIVED) ? { status: status as ProjectStatus } : {}),
    ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { members: { some: { user: { name: { contains: query, mode: 'insensitive' as const } } } } }] } : {}),
  };
  const projects = await prisma.project.findMany({ where, orderBy: { deadline: 'asc' }, include: { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }, deliverables: { select: { id: true, status: true } } } });
  res.json(ok(projects.map(p => {
    const { internalNotes, ...view } = p;
    return { ...view, ...(auth.role === Role.ADMIN ? { internalNotes } : {}), client: p.members[0]?.user ?? null, deliverableCount: p.deliverables.length, completedCount: p.deliverables.filter(d => d.status === DeliverableStatus.DELIVERED).length };
  })));
}));

api.post('/projects', ...adminOnly, asyncRoute(async (req, res) => {
  const input = parse(projectSchema, req.body);
  const client = await prisma.user.findFirst({ where: { id: input.clientId, role: Role.CLIENT, active: true } });
  if (!client) fail(400, 'Choose an active client account.');
  const { clientId, ...data } = input;
  const project = await prisma.project.create({ data: { ...data, creatorId: (req as AuthedRequest).auth!.userId, members: { create: { userId: clientId } } } });
  await logActivity(project.id, (req as AuthedRequest).auth!.userId, ActivityType.PROJECT_CREATED, `Created project ${project.name}`);
  res.status(201).json(ok(await requireProjectAccess(project.id, req as AuthedRequest)));
}));

api.get('/projects/:id', authenticate, asyncRoute(async (req, res) => {
  const project = await requireProjectAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const full = await prisma.project.findUniqueOrThrow({ where: { id: routeId(req as AuthedRequest) }, include: {
    members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
    deliverables: { orderBy: { createdAt: 'asc' }, include: {
      currentVersion: { include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } }, comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } } } }, approvals: { orderBy: { createdAt: 'desc' }, include: { approver: { select: { id: true, name: true } } } } } },
      versions: { orderBy: { versionNumber: 'desc' }, include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } }, approvals: { orderBy: { createdAt: 'desc' }, include: { approver: { select: { id: true, name: true } } } } } },
      comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } }, version: { select: { versionNumber: true } } } },
      approvals: { orderBy: { createdAt: 'desc' }, include: { approver: { select: { id: true, name: true } }, version: { select: { versionNumber: true } } } },
      files: { where: { kind: FileKind.FINAL }, orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true, uploadedBy: { select: { name: true } } } },
    } },
  } });
  const { internalNotes: _internalNotes, ...safeProject } = full;
  const visibleNotes = (req as AuthedRequest).auth?.role === Role.ADMIN ? { internalNotes: (project as typeof full & { internalNotes?: string | null }).internalNotes } : {};
  const activities = await prisma.activityLog.findMany({ where: { projectId: routeId(req as AuthedRequest) }, orderBy: { createdAt: 'desc' }, take: 20, include: { actor: { select: { id: true, name: true, role: true } }, deliverable: { select: { title: true } } } });
  res.json(ok({ ...safeProject, ...visibleNotes, activities }));
}));

api.patch('/projects/:id', ...adminOnly, asyncRoute(async (req, res) => {
  const input = parse(projectPatchSchema, req.body);
  const { clientId, ...fields } = input;
  const project = await prisma.project.findUnique({ where: { id: routeId(req as AuthedRequest) } });
  if (!project) fail(404, 'Project not found.');
  if (clientId) {
    const client = await prisma.user.findFirst({ where: { id: clientId, role: Role.CLIENT, active: true } });
    if (!client) fail(400, 'Choose an active client account.');
  }
  const updated = await prisma.$transaction(async tx => {
    if (clientId) {
      await tx.projectMember.deleteMany({ where: { projectId: project.id } });
      await tx.projectMember.create({ data: { projectId: project.id, userId: clientId } });
    }
    return tx.project.update({ where: { id: project.id }, data: { ...fields, ...(fields.status === ProjectStatus.ARCHIVED ? { archivedAt: project.archivedAt ?? new Date() } : fields.status ? { archivedAt: null } : {}) }, include: { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } } });
  });
  await logActivity(project.id, (req as AuthedRequest).auth!.userId, ActivityType.PROJECT_UPDATED, `Updated project ${updated.name}`);
  res.json(ok(updated));
}));

api.post('/projects/:id/archive', ...adminOnly, asyncRoute(async (req, res) => {
  const project = await prisma.project.update({ where: { id: routeId(req as AuthedRequest) }, data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() } });
  await logActivity(project.id, (req as AuthedRequest).auth!.userId, ActivityType.PROJECT_UPDATED, `Archived project ${project.name}`);
  res.json(ok({ id: project.id, status: project.status }));
}));

api.get('/projects/:id/deliverables', authenticate, asyncRoute(async (req, res) => {
  await requireProjectAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const deliverables = await prisma.deliverable.findMany({ where: { projectId: routeId(req as AuthedRequest) }, orderBy: { createdAt: 'asc' }, include: { currentVersion: { include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } } } }, _count: { select: { comments: true, versions: true } } } });
  res.json(ok(deliverables));
}));

api.get('/deliverables', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const deliverables = await prisma.deliverable.findMany({
    where: auth.role === Role.ADMIN ? {} : { project: { members: { some: { userId: auth.userId } }, status: { not: ProjectStatus.ARCHIVED } } },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    include: { project: { select: { id: true, name: true, deadline: true } }, currentVersion: { include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } } } }, _count: { select: { comments: true, versions: true } } },
  });
  res.json(ok(deliverables));
}));

api.get('/deliverables/:id', authenticate, asyncRoute(async (req, res) => {
  await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const deliverable = await prisma.deliverable.findUniqueOrThrow({ where: { id: routeId(req as AuthedRequest) }, include: {
    project: { select: { id: true, name: true, status: true } },
    currentVersion: { include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } }, comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } } } }, approvals: { include: { approver: { select: { id: true, name: true } } } } } },
    versions: { orderBy: { versionNumber: 'desc' }, include: { uploadedBy: { select: { id: true, name: true } }, file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } }, approvals: { include: { approver: { select: { id: true, name: true } } } } } },
    comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } }, version: { select: { versionNumber: true } } } },
    approvals: { orderBy: { createdAt: 'desc' }, include: { approver: { select: { id: true, name: true } }, version: { select: { versionNumber: true } } } },
    files: { where: { kind: FileKind.FINAL }, orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true, uploadedBy: { select: { name: true } } } },
  } });
  res.json(ok(deliverable));
}));

api.post('/projects/:id/deliverables', ...adminOnly, asyncRoute(async (req, res) => {
  await requireProjectAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const input = parse(deliverableSchema, req.body);
  if (input.status && !([DeliverableStatus.NOT_STARTED, DeliverableStatus.IN_PROGRESS] as DeliverableStatus[]).includes(input.status)) fail(400, 'New deliverables can only start as not started or in progress.');
  const item = await prisma.deliverable.create({ data: { ...input, projectId: routeId(req as AuthedRequest) } });
  await logActivity(routeId(req as AuthedRequest), (req as AuthedRequest).auth!.userId, ActivityType.PROJECT_UPDATED, `Added deliverable ${item.title}`, item.id);
  res.status(201).json(ok(item));
}));

api.patch('/deliverables/:id', ...adminOnly, asyncRoute(async (req, res) => {
  const item = await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const input = parse(deliverablePatchSchema, req.body);
  if (input.status) {
    if (!([DeliverableStatus.NOT_STARTED, DeliverableStatus.IN_PROGRESS] as DeliverableStatus[]).includes(input.status)) fail(400, 'Review and delivery statuses are set by the design workflow.');
    const history = await prisma.deliverableVersion.count({ where: { deliverableId: item.id } });
    if (history) fail(409, 'A deliverable with submitted versions can no longer have its status changed manually.');
  }
  const updated = await prisma.deliverable.update({ where: { id: item.id }, data: input });
  await logActivity(item.projectId, (req as AuthedRequest).auth!.userId, ActivityType.PROJECT_UPDATED, `Updated deliverable ${updated.title}`, item.id);
  res.json(ok(updated));
}));

api.delete('/deliverables/:id', ...adminOnly, asyncRoute(async (req, res) => {
  const item = await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const history = await prisma.deliverable.findUniqueOrThrow({ where: { id: item.id }, include: { _count: { select: { comments: true, approvals: true, versions: true } } } });
  if (history._count.comments || history._count.approvals || history._count.versions) fail(409, 'This deliverable has review history and cannot be deleted.');
  await prisma.deliverable.delete({ where: { id: item.id } });
  res.json(ok({ deleted: true }));
}));

api.post('/deliverables/:id/versions', ...adminOnly, upload.single('file'), asyncRoute(async (req, res) => {
  const item = await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const input = parse(versionSchema, req.body ?? {});
  const parsed = await parseUpload(req.file);
  const key = await storage.save(parsed.buffer, parsed.ext);
  try {
    const version = await prisma.$transaction(async tx => {
      const latest = await tx.deliverableVersion.aggregate({ where: { deliverableId: item.id }, _max: { versionNumber: true } });
      const number = (latest._max.versionNumber ?? 0) + 1;
      const created = await tx.deliverableVersion.create({ data: {
        deliverableId: item.id, versionNumber: number, notes: input.notes, uploadedById: (req as AuthedRequest).auth!.userId,
        file: { create: { projectId: item.projectId, deliverableId: item.id, kind: FileKind.DESIGN, storageKey: key, originalName: parsed.originalName, mimeType: parsed.mimeType, size: parsed.size, uploadedById: (req as AuthedRequest).auth!.userId } },
      }, include: { file: { select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } }, uploadedBy: { select: { id: true, name: true } } } });
      await tx.deliverable.update({ where: { id: item.id }, data: { currentVersionId: created.id, status: DeliverableStatus.IN_REVIEW } });
      await tx.activityLog.create({ data: { projectId: item.projectId, deliverableId: item.id, actorId: (req as AuthedRequest).auth!.userId, type: ActivityType.DESIGN_UPLOADED, message: `Submitted ${item.title} · version ${number}` } });
      return created;
    });
    res.status(201).json(ok(version));
  } catch (error) { await storage.remove(key); throw error; }
}));

api.get('/deliverables/:id/comments', authenticate, asyncRoute(async (req, res) => {
  await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const comments = await prisma.comment.findMany({ where: { deliverableId: routeId(req as AuthedRequest) }, orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true, role: true } }, version: { select: { versionNumber: true } } } });
  res.json(ok(comments));
}));

api.post('/versions/:id/comments', ...mutating, asyncRoute(async (req, res) => {
  const version = await prisma.deliverableVersion.findUnique({ where: { id: routeId(req as AuthedRequest) }, include: { deliverable: { include: { project: { include: { members: true } } } } } });
  if (!version) fail(404, 'Version not found.');
  const auth = (req as AuthedRequest).auth!;
  if (auth.role === Role.CLIENT) {
    if (!version.deliverable.project.members.some(m => m.userId === auth.userId)) fail(404, 'Version not found.');
    if (!canCommentOnVersion({ role: auth.role, isMember: true, isCurrentVersion: version.deliverable.currentVersionId === version.id, deliverableStatus: version.deliverable.status })) fail(409, 'This version is no longer open for review.');
  }
  const { message } = parse(messageSchema, req.body);
  const comment = await prisma.comment.create({ data: { deliverableId: version.deliverableId, versionId: version.id, authorId: auth.userId, message }, include: { author: { select: { id: true, name: true, role: true } } } });
  await logActivity(version.deliverable.projectId, auth.userId, ActivityType.COMMENT_ADDED, `Commented on ${version.deliverable.title}`, version.deliverableId);
  res.status(201).json(ok(comment));
}));

api.post('/versions/:id/revisions', ...mutating, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  if (auth.role !== Role.CLIENT) fail(403, 'Only a project client can request a revision.');
  const version = await prisma.deliverableVersion.findUnique({ where: { id: routeId(req as AuthedRequest) }, include: { deliverable: { include: { project: { include: { members: true } } } } } });
  if (!version || !version.deliverable.project.members.some(m => m.userId === auth.userId)) fail(404, 'Version not found.');
  if (!canRequestRevision({ role: auth.role, isMember: true, isCurrentVersion: version.deliverable.currentVersionId === version.id, deliverableStatus: version.deliverable.status })) fail(409, 'This version is no longer open for review.');
  const { message } = parse(messageSchema, req.body);
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.deliverable.updateMany({ where: { id: version.deliverableId, currentVersionId: version.id, status: DeliverableStatus.IN_REVIEW }, data: { status: DeliverableStatus.REVISION_REQUESTED } });
    if (changed.count !== 1) fail(409, 'This version is no longer open for review.');
    const comment = await tx.comment.create({ data: { deliverableId: version.deliverableId, versionId: version.id, authorId: auth.userId, message, revisionRequest: true }, include: { author: { select: { id: true, name: true, role: true } } } });
    await tx.deliverableVersion.update({ where: { id: version.id }, data: { reviewStatus: VersionReviewStatus.REVISION_REQUESTED } });
    await tx.activityLog.create({ data: { projectId: version.deliverable.projectId, deliverableId: version.deliverableId, actorId: auth.userId, type: ActivityType.REVISION_REQUESTED, message: `Revision requested for ${version.deliverable.title}` } });
    return comment;
  });
  res.status(201).json(ok(result));
}));

api.post('/versions/:id/approval', ...mutating, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  if (auth.role !== Role.CLIENT) fail(403, 'Only a project client can approve a version.');
  const version = await prisma.deliverableVersion.findUnique({ where: { id: routeId(req as AuthedRequest) }, include: { deliverable: { include: { project: { include: { members: true } } } } } });
  if (!version || !version.deliverable.project.members.some(m => m.userId === auth.userId)) fail(404, 'Version not found.');
  if (!canApproveVersion({ role: auth.role, isMember: true, isCurrentVersion: version.deliverable.currentVersionId === version.id, deliverableStatus: version.deliverable.status, reviewStatus: version.reviewStatus })) fail(409, 'This version is no longer open for approval.');
  const approval = await prisma.$transaction(async tx => {
    const changed = await tx.deliverable.updateMany({ where: { id: version.deliverableId, currentVersionId: version.id, status: DeliverableStatus.IN_REVIEW }, data: { status: DeliverableStatus.APPROVED } });
    if (changed.count !== 1) fail(409, 'This version is no longer open for approval.');
    const record = await tx.approval.create({ data: { deliverableId: version.deliverableId, versionId: version.id, approverId: auth.userId }, include: { approver: { select: { id: true, name: true } } } });
    await tx.deliverableVersion.update({ where: { id: version.id }, data: { reviewStatus: VersionReviewStatus.APPROVED } });
    await tx.activityLog.create({ data: { projectId: version.deliverable.projectId, deliverableId: version.deliverableId, actorId: auth.userId, type: ActivityType.VERSION_APPROVED, message: `Approved ${version.deliverable.title} · version ${version.versionNumber}` } });
    return record;
  });
  res.status(201).json(ok(approval));
}));

api.post('/deliverables/:id/deliver', ...adminOnly, upload.array('files', 8), asyncRoute(async (req, res) => {
  const item = await requireDeliverableAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  if (item.status !== DeliverableStatus.APPROVED) fail(409, 'Approve a submitted design version before final delivery.');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) fail(400, 'Choose at least one final file.');
  const saved: string[] = [];
  try {
    const parsedFiles = await Promise.all(files.map(parseUpload));
    for (const parsed of parsedFiles) saved.push(await storage.save(parsed.buffer, parsed.ext));
    const assets = await prisma.$transaction(async tx => {
      const changed = await tx.deliverable.updateMany({ where: { id: item.id, status: DeliverableStatus.APPROVED }, data: { status: DeliverableStatus.DELIVERED } });
      if (changed.count !== 1) fail(409, 'This deliverable is no longer ready for delivery.');
      const records = await Promise.all(parsedFiles.map((f, i) => tx.fileAsset.create({ data: { projectId: item.projectId, deliverableId: item.id, kind: FileKind.FINAL, storageKey: saved[i]!, originalName: f.originalName, mimeType: f.mimeType, size: f.size, uploadedById: (req as AuthedRequest).auth!.userId }, select: { id: true, originalName: true, mimeType: true, size: true, kind: true, createdAt: true } })));
      await tx.activityLog.create({ data: { projectId: item.projectId, deliverableId: item.id, actorId: (req as AuthedRequest).auth!.userId, type: ActivityType.FINAL_DELIVERED, message: `Delivered final files for ${item.title}` } });
      return records;
    });
    res.status(201).json(ok(assets));
  } catch (error) { await Promise.all(saved.map(storage.remove.bind(storage))); throw error; }
}));

api.get('/files/:id/download', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const asset = await prisma.fileAsset.findUnique({ where: { id: routeId(req as AuthedRequest) }, include: { project: { include: { members: { select: { userId: true } } } }, deliverable: { select: { status: true } } } });
  if (!asset) fail(404, 'File not found.');
  const allowed = canDownload({ role: auth.role, isMember: asset.project.members.some(m => m.userId === auth.userId), fileKind: asset.kind, deliverableStatus: asset.deliverable.status });
  if (!allowed) fail(404, 'File not found.');
  const inline = req.query.inline === '1' && ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4'].includes(asset.mimeType);
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', asset.size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`);
  createReadStream(storage.absolutePath(asset.storageKey)).on('error', () => { if (res.headersSent) res.destroy(); else res.status(404).json({ error: { message: 'File not found.' } }); }).pipe(res);
}));

api.get('/projects/:id/activity', authenticate, asyncRoute(async (req, res) => {
  await requireProjectAccess(routeId(req as AuthedRequest), req as AuthedRequest);
  const activities = await prisma.activityLog.findMany({ where: { projectId: routeId(req as AuthedRequest) }, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true, role: true } }, deliverable: { select: { title: true } } } });
  res.json(ok(activities));
}));

api.get('/activity', authenticate, asyncRoute(async (req, res) => {
  const auth = (req as AuthedRequest).auth!;
  const activities = await prisma.activityLog.findMany({ where: auth.role === Role.ADMIN ? {} : { project: { members: { some: { userId: auth.userId } } } }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { id: true, name: true, role: true } }, project: { select: { id: true, name: true } }, deliverable: { select: { title: true } } } });
  res.json(ok(activities));
}));

