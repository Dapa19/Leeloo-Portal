import './load-env.js';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { DeliverableStatus, FileKind, ProjectStatus, Role, ServiceType } from './generated/prisma/client.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
process.env.UPLOAD_DIR = './uploads-test';
const { createApp } = await import('./app.js');
const { prisma } = await import('./db.js');
const { storage } = await import('./storage.js');
const app = createApp();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx6kAAAAASUVORK5CYII=', 'base64');

describe.skipIf(!testDatabaseUrl)('Leeloo API integration', () => {
  const fixture = randomUUID();
  const emails = { admin: `agency-${fixture}@example.dev`, clientA: `client-a-${fixture}@example.dev`, clientB: `client-b-${fixture}@example.dev` };
  const userIds: string[] = [];
  const storageKeys: string[] = [];
  let sessionAdmin: { cookie: string; csrf: string };
  let sessionA: { cookie: string; csrf: string };
  let clientAId: string;
  let clientBId: string;
  let projectAId = '';
  let projectBId = '';
  let deliverableId: string;

  async function login(email: string) {
    const response = await request(app).post('/api/auth/login').send({ email, password: 'ValidDemoPass2026!' });
    expect(response.status).toBe(200);
    const header = response.headers['set-cookie'];
    const cookie = (Array.isArray(header) ? header[0] : header) ?? '';
    return { cookie: cookie.split(';')[0]!, csrf: response.body.data.csrfToken as string };
  }
  const mutating = (session: { cookie: string; csrf: string }, call: request.Test) => call.set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf);

  it('creates projects, isolates clients, preserves review history, and separates approval from delivery', async () => {
    const passwordHash = await bcrypt.hash('ValidDemoPass2026!', 4);
    const [admin, clientA, clientB] = await Promise.all([
      prisma.user.create({ data: { name: 'Fixture Studio', email: emails.admin, role: Role.ADMIN, passwordHash } }),
      prisma.user.create({ data: { name: 'Fixture Client A', email: emails.clientA, role: Role.CLIENT, passwordHash } }),
      prisma.user.create({ data: { name: 'Fixture Client B', email: emails.clientB, role: Role.CLIENT, passwordHash } }),
    ]);
    userIds.push(admin.id, clientA.id, clientB.id); clientAId = clientA.id; clientBId = clientB.id;
    sessionAdmin = await login(emails.admin);
    sessionA = await login(emails.clientA);

    const invalid = await mutating(sessionAdmin, request(app).post('/api/projects')).send({ name: 'x' });
    expect(invalid.status).toBe(400);
    const makeProject = async (name: string, clientId: string) => {
      const response = await mutating(sessionAdmin, request(app).post('/api/projects')).send({ name, clientId, description: 'Fixture project', serviceType: ServiceType.BRANDING, startDate: new Date().toISOString(), deadline: new Date(Date.now() + 86400000).toISOString(), status: ProjectStatus.ACTIVE, internalNotes: 'Private studio detail' });
      expect(response.status).toBe(201);
      return response.body.data.id as string;
    };
    projectAId = await makeProject(`Fixture A ${fixture}`, clientA.id);
    projectBId = await makeProject(`Fixture B ${fixture}`, clientB.id);

    const ownProjects = await request(app).get('/api/projects').set('Cookie', sessionA.cookie);
    expect(ownProjects.status).toBe(200);
    expect(ownProjects.body.data.map((project: { id: string }) => project.id)).toEqual([projectAId]);
    const privateProject = await request(app).get(`/api/projects/${projectAId}`).set('Cookie', sessionA.cookie);
    expect(privateProject.body.data.internalNotes).toBeUndefined();
    const deniedProject = await request(app).get(`/api/projects/${projectAId}`).set('Cookie', (await login(emails.clientB)).cookie);
    expect(deniedProject.status).toBe(404);

    const deliverableResponse = await mutating(sessionAdmin, request(app).post(`/api/projects/${projectAId}/deliverables`)).send({ title: 'Primary mark', description: 'Logo design', type: 'Branding' });
    expect(deliverableResponse.status).toBe(201);
    deliverableId = deliverableResponse.body.data.id as string;
    const version1Response = await mutating(sessionAdmin, request(app).post(`/api/deliverables/${deliverableId}/versions`)).field('notes', 'First pass').attach('file', png, { filename: 'design.png', contentType: 'image/png' });
    expect(version1Response.status).toBe(201);
    const version1 = version1Response.body.data;
    expect(version1.versionNumber).toBe(1);
    const comment = await mutating(sessionA, request(app).post(`/api/versions/${version1.id}/comments`)).send({ message: 'Could the wordmark breathe more?' });
    expect(comment.status).toBe(201);
    const revision = await mutating(sessionA, request(app).post(`/api/versions/${version1.id}/revisions`)).send({ message: 'Please open up the letter spacing.' });
    expect(revision.status).toBe(201);
    const duplicateRevision = await mutating(sessionA, request(app).post(`/api/versions/${version1.id}/revisions`)).send({ message: 'Another revision request.' });
    expect(duplicateRevision.status).toBe(409);

    const version2Response = await mutating(sessionAdmin, request(app).post(`/api/deliverables/${deliverableId}/versions`)).field('notes', 'Spacing refined').attach('file', png, { filename: 'design-v2.png', contentType: 'image/png' });
    expect(version2Response.status).toBe(201);
    const version2 = version2Response.body.data;
    expect(version2.versionNumber).toBe(2);
    const oldApproval = await mutating(sessionA, request(app).post(`/api/versions/${version1.id}/approval`)).send({});
    expect(oldApproval.status).toBe(409);
    const approval = await mutating(sessionA, request(app).post(`/api/versions/${version2.id}/approval`)).send({});
    expect(approval.status).toBe(201);
    expect(approval.body.data.versionId).toBe(version2.id);
    const duplicateApproval = await mutating(sessionA, request(app).post(`/api/versions/${version2.id}/approval`)).send({});
    expect(duplicateApproval.status).toBe(409);
    const deliverableBeforeHandoff = await request(app).get(`/api/deliverables/${deliverableId}`).set('Cookie', sessionA.cookie);
    expect(deliverableBeforeHandoff.body.data.status).toBe(DeliverableStatus.APPROVED);
    expect(deliverableBeforeHandoff.body.data.versions).toHaveLength(2);

    const final = await mutating(sessionAdmin, request(app).post(`/api/deliverables/${deliverableId}/deliver`)).attach('files', png, { filename: 'final.png', contentType: 'image/png' });
    expect(final.status).toBe(201);
    const downloaded = await request(app).get(`/api/files/${final.body.data[0].id}/download`).set('Cookie', sessionA.cookie);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toContain('image/png');

    const foreignDeliverable = await prisma.deliverable.create({ data: { projectId: projectBId, title: 'Private file' } });
    const key = await storage.save(png, 'png'); storageKeys.push(key);
    const foreignFile = await prisma.fileAsset.create({ data: { projectId: projectBId, deliverableId: foreignDeliverable.id, kind: FileKind.DESIGN, storageKey: key, originalName: 'private.png', mimeType: 'image/png', size: png.length, uploadedById: admin.id } });
    const deniedFile = await request(app).get(`/api/files/${foreignFile.id}/download`).set('Cookie', sessionA.cookie);
    expect(deniedFile.status).toBe(404);

    const persistedApproval = await prisma.approval.findUniqueOrThrow({ where: { id: approval.body.data.id } });
    expect(persistedApproval.versionId).toBe(version2.id);
  }, 30000);

  it('rejects delivery before the client approval step', async () => {
    const project = await prisma.project.findUnique({ where: { id: projectAId } });
    expect(project).not.toBeNull();
    const extra = await prisma.deliverable.create({ data: { projectId: projectAId, title: `Not approved ${fixture}` } });
    const response = await mutating(sessionAdmin, request(app).post(`/api/deliverables/${extra.id}/deliver`)).attach('files', png, { filename: 'final.png', contentType: 'image/png' });
    expect(response.status).toBe(409);
  });

  afterAll(async () => {
    if (projectAId || projectBId) {
      const projectIds = [projectAId, projectBId].filter((id): id is string => Boolean(id));
      const assets = await prisma.fileAsset.findMany({ where: { projectId: { in: projectIds } }, select: { storageKey: true } });
      storageKeys.push(...assets.map(asset => asset.storageKey));
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all(storageKeys.map(key => storage.remove(key)));
    await rm('./uploads-test', { recursive: true, force: true });
    await prisma.$disconnect();
  });
});
