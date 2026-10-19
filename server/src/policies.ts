import { DeliverableStatus, FileKind, Role, VersionReviewStatus } from './generated/prisma/client.js';

export function canAccessProject(role: Role, memberIds: string[], userId: string) {
  return role === Role.ADMIN || memberIds.includes(userId);
}

export function canCommentOnVersion(input: { role: Role; isMember: boolean; isCurrentVersion: boolean; deliverableStatus: DeliverableStatus }) {
  if (input.role === Role.ADMIN) return true;
  return input.isMember && input.isCurrentVersion && ([DeliverableStatus.IN_REVIEW, DeliverableStatus.REVISION_REQUESTED] as DeliverableStatus[]).includes(input.deliverableStatus);
}

export function canRequestRevision(input: { role: Role; isMember: boolean; isCurrentVersion: boolean; deliverableStatus: DeliverableStatus }) {
  return input.role === Role.CLIENT && input.isMember && input.isCurrentVersion && input.deliverableStatus === DeliverableStatus.IN_REVIEW;
}

export function canApproveVersion(input: { role: Role; isMember: boolean; isCurrentVersion: boolean; deliverableStatus: DeliverableStatus; reviewStatus: VersionReviewStatus }) {
  return input.role === Role.CLIENT && input.isMember && input.isCurrentVersion && input.deliverableStatus === DeliverableStatus.IN_REVIEW && input.reviewStatus === VersionReviewStatus.SUBMITTED;
}

export function canDownload(input: { role: Role; isMember: boolean; fileKind: FileKind; deliverableStatus: DeliverableStatus }) {
  return (input.role === Role.ADMIN || input.isMember) && (input.fileKind !== FileKind.FINAL || input.deliverableStatus === DeliverableStatus.DELIVERED);
}

export function calculateProgress(delivered: number, total: number) {
  return total === 0 ? 0 : Math.round(Math.min(Math.max(delivered, 0), total) / total * 100);
}
