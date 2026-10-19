import type { NextFunction, Request, Response } from 'express';
import type { Role } from './generated/prisma/client.js';

export interface AuthedRequest extends Request {
  auth?: { userId: string; role: Role; sessionId: string; csrfToken: string };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function asyncRoute(fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req as AuthedRequest, res, next)).catch(next);
}

export function fail(status: number, message: string): never { throw new HttpError(status, message); }
export function ok<T>(data: T) { return { data }; }
