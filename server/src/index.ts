import './load-env.js';
import { createApp } from './app.js';
import { prisma } from './db.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();
const server = app.listen(port, () => console.log(`Leeloo API listening on http://localhost:${port}`));
const cleanupTimer = setInterval(() => { void prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }); }, 60 * 60 * 1000);
cleanupTimer.unref();

async function shutdown() {
  clearInterval(cleanupTimer);
  server.close();
  await prisma.$disconnect();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
