import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Role } from './generated/prisma/client.js';
import { prisma } from './db.js';
import { fail, type AuthedRequest } from './http.js';

const COOKIE_NAME = 'leeloo.sid';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? 14);
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api',
};

export async function createSession(userId: string, res: Response) {
  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hash(rawToken), csrfToken, userId, expiresAt } });
  res.cookie(COOKIE_NAME, rawToken, { ...cookieOptions, expires: expiresAt });
  return csrfToken;
}

export async function destroySession(req: Request, res: Response) {
  const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (rawToken) await prisma.session.deleteMany({ where: { tokenHash: hash(rawToken) } });
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!rawToken) return fail(401, 'Sign in to continue.');
    const session = await prisma.session.findUnique({
      where: { tokenHash: hash(rawToken) },
      include: { user: { select: { id: true, role: true, active: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) return fail(401, 'Your session has expired. Sign in again.');
    (req as AuthedRequest).auth = { userId: session.user.id, role: session.user.role, sessionId: session.id, csrfToken: session.csrfToken };
    next();
  } catch (error) { next(error); }
}

export function requireRole(role: Role) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.role !== role) return next(Object.assign(new Error('You do not have access to this action.'), { status: 403 }));
    next();
  };
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get('origin');
  const allowedOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
  if (origin && origin !== allowedOrigin) return next(Object.assign(new Error('Request origin is not allowed.'), { status: 403 }));
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const auth = (req as AuthedRequest).auth;
  if (auth && req.get('x-csrf-token') !== auth.csrfToken) return next(Object.assign(new Error('Invalid security token. Refresh and try again.'), { status: 403 }));
  next();
}

export function newId() { return randomUUID(); }
export { COOKIE_NAME };
