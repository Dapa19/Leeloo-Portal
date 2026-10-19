import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { Prisma } from './generated/prisma/client.js';
import { api } from './routes.js';

export function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'"], frameSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cors({ origin: clientOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api', api);
  if (process.env.NODE_ENV === 'production') {
    const clientBuild = path.resolve(process.cwd(), '../client/dist');
    app.use(express.static(clientBuild, { index: false, immutable: true, maxAge: '1y' }));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => res.sendFile(path.join(clientBuild, 'index.html'), error => { if (error) next(error); }));
  }
  app.use((_req, res) => res.status(404).json({ error: { message: 'Not found.' } }));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' ? 413 : 400;
      res.status(status).json({ error: { message: status === 413 ? 'The upload exceeds the configured limit.' : 'The upload could not be processed.' } });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') { res.status(409).json({ error: { message: 'A record with these details already exists.' } }); return; }
      if (error.code === 'P2025') { res.status(404).json({ error: { message: 'The requested record was not found.' } }); return; }
    }
    const status = Number((error as { status?: number }).status ?? 500);
    if (status >= 400 && status < 500) { res.status(status).json({ error: { message: error.message } }); return; }
    console.error('Unhandled API error:', error);
    res.status(500).json({ error: { message: 'Something went wrong. Please try again.' } });
  };
  app.use(errorHandler);
  return app;
}
