import { describe, expect, it } from 'vitest';
import { DeliverableStatus, FileKind, Role, VersionReviewStatus } from './generated/prisma/client.js';
import { calculateProgress, canAccessProject, canApproveVersion, canCommentOnVersion, canDownload, canRequestRevision } from './policies.js';

describe('project access policy', () => {
  it('lets an agency admin manage projects and limits clients to assigned projects', () => {
    expect(canAccessProject(Role.ADMIN, [], 'agency')).toBe(true);
    expect(canAccessProject(Role.CLIENT, ['project-a'], 'client-a')).toBe(false);
    expect(canAccessProject(Role.CLIENT, ['client-a'], 'client-a')).toBe(true);
  });

  it('never exposes another client’s file and keeps final downloads gated on delivery', () => {
    expect(canDownload({ role: Role.CLIENT, isMember: false, fileKind: FileKind.DESIGN, deliverableStatus: DeliverableStatus.IN_REVIEW })).toBe(false);
    expect(canDownload({ role: Role.CLIENT, isMember: true, fileKind: FileKind.FINAL, deliverableStatus: DeliverableStatus.APPROVED })).toBe(false);
    expect(canDownload({ role: Role.CLIENT, isMember: true, fileKind: FileKind.FINAL, deliverableStatus: DeliverableStatus.DELIVERED })).toBe(true);
  });
});

describe('version review policy', () => {
  const openReview = { role: Role.CLIENT, isMember: true, isCurrentVersion: true, deliverableStatus: DeliverableStatus.IN_REVIEW } as const;

  it('accepts comments and revision requests only on the client’s current open review', () => {
    expect(canCommentOnVersion(openReview)).toBe(true);
    expect(canRequestRevision(openReview)).toBe(true);
    expect(canCommentOnVersion({ ...openReview, isCurrentVersion: false })).toBe(false);
    expect(canRequestRevision({ ...openReview, deliverableStatus: DeliverableStatus.APPROVED })).toBe(false);
  });

  it('records an approval against one eligible submitted version only', () => {
    const approval = { ...openReview, reviewStatus: VersionReviewStatus.SUBMITTED };
    expect(canApproveVersion(approval)).toBe(true);
    expect(canApproveVersion({ ...approval, reviewStatus: VersionReviewStatus.APPROVED })).toBe(false);
    expect(canApproveVersion({ ...approval, isCurrentVersion: false })).toBe(false);
    expect(canApproveVersion({ ...approval, role: Role.ADMIN })).toBe(false);
  });

  it('calculates project progress from delivered deliverables only', () => {
    expect(calculateProgress(0, 0)).toBe(0);
    expect(calculateProgress(1, 4)).toBe(25);
    expect(calculateProgress(9, 4)).toBe(100);
  });
});
