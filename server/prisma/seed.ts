import '../src/load-env.js';
import bcrypt from 'bcryptjs';
import { ActivityType, DeliverableStatus, ProjectStatus, Role, ServiceType } from '../src/generated/prisma/client.js';
import { prisma } from '../src/db.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seed is disabled in production.');
}

const passwordHash = await bcrypt.hash('LeelooDemo2026!', 12);
const users = [
  { email: 'studio@leeloo.dev', name: 'Leeloo Studio', role: Role.ADMIN },
  { email: 'maya@example.dev', name: 'Maya Chen', role: Role.CLIENT },
  { email: 'noah@example.dev', name: 'Noah Rivera', role: Role.CLIENT },
] as const;

for (const user of users) {
  await prisma.user.upsert({ where: { email: user.email }, update: { name: user.name, passwordHash, role: user.role, active: true }, create: { ...user, passwordHash } });
}

const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'studio@leeloo.dev' } });
const maya = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@example.dev' } });
const noah = await prisma.user.findUniqueOrThrow({ where: { email: 'noah@example.dev' } });
const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * 86400000);

const records = [
  { name: 'Sunday Market identity', description: 'A fresh identity for a neighborhood makers market.', serviceType: ServiceType.BRANDING, deadline: inDays(12), clientId: maya.id, status: ProjectStatus.ACTIVE, deliverables: [{ title: 'Primary logo', status: DeliverableStatus.IN_PROGRESS }, { title: 'Color and type guide', status: DeliverableStatus.NOT_STARTED }] },
  { name: 'Field Notes social launch', description: 'Launch assets for a new outdoor journal.', serviceType: ServiceType.SOCIAL_MEDIA_DESIGN, deadline: inDays(21), clientId: noah.id, status: ProjectStatus.ACTIVE, deliverables: [{ title: 'Launch post set', status: DeliverableStatus.NOT_STARTED }] },
  { name: 'Northstar campaign', description: 'Campaign design and delivery are wrapped up.', serviceType: ServiceType.GRAPHIC_DESIGN, deadline: inDays(-3), clientId: maya.id, status: ProjectStatus.COMPLETED, deliverables: [{ title: 'Campaign key visual', status: DeliverableStatus.DELIVERED }, { title: 'Story format', status: DeliverableStatus.DELIVERED }] },
] as const;

for (const record of records) {
  let project = await prisma.project.findFirst({ where: { name: record.name } });
  if (!project) {
    project = await prisma.project.create({ data: {
      name: record.name, description: record.description, serviceType: record.serviceType, status: record.status,
      startDate: inDays(-8), deadline: record.deadline, creatorId: admin.id,
      members: { create: { userId: record.clientId } },
      deliverables: { create: record.deliverables.map(d => ({ title: d.title, status: d.status, description: 'Design files and review notes will appear here.' })) },
    } });
    await prisma.activityLog.create({ data: { projectId: project.id, actorId: admin.id, type: ActivityType.PROJECT_CREATED, message: `Created project ${project.name}` } });
  }
}

console.log('Demo accounts ready (development only): studio@leeloo.dev, maya@example.dev, noah@example.dev');
await prisma.$disconnect();
