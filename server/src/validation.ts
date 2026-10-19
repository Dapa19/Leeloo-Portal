import { z } from 'zod';

export const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200), portal: z.enum(['agency', 'client']).optional() });
export const projectSchema = z.object({
  name: z.string().trim().min(2).max(120), clientId: z.string().uuid(), description: z.string().max(5000).default(''),
  serviceType: z.enum(['GRAPHIC_DESIGN', 'BRANDING', 'SOCIAL_MEDIA_DESIGN', 'VIDEO_EDITING', 'WEBSITE_DEVELOPMENT', 'OTHER']),
  startDate: z.coerce.date(), deadline: z.coerce.date(), status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).default('ACTIVE'),
  internalNotes: z.string().max(5000).optional().nullable(),
});
export const projectPatchSchema = projectSchema.partial().omit({ clientId: true }).extend({ clientId: z.string().uuid().optional() });
export const clientSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(254), password: z.string().min(10).max(200) });
export const clientPatchSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), email: z.string().email().max(254).optional(), password: z.string().min(10).max(200).optional(), active: z.boolean().optional() });
export const deliverableSchema = z.object({ title: z.string().trim().min(2).max(120), description: z.string().max(3000).default(''), type: z.string().trim().min(1).max(80).default('Design'), deadline: z.coerce.date().optional().nullable(), status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'DELIVERED']).optional() });
export const deliverablePatchSchema = deliverableSchema.partial();
export const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });
export const versionSchema = z.object({ notes: z.string().max(1000).optional() });

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ');
    const error = new Error(message) as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return result.data;
}
