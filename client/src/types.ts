export type Role = 'ADMIN' | 'CLIENT';
export type Status = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED' | 'DELIVERED';
export interface User { id: string; name: string; email: string; role: Role; active?: boolean; }
export interface Project {
  id: string; name: string; description: string; serviceType: string; status: Status; startDate: string; deadline: string;
  internalNotes?: string | null; members: { userId: string; user: Pick<User, 'id' | 'name' | 'email' | 'role'> }[];
  client?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null; deliverableCount?: number; completedCount?: number;
  deliverables?: Deliverable[]; activities?: Activity[];
}
export interface FileAsset { id: string; originalName: string; mimeType: string; size: number; kind: 'DESIGN' | 'FINAL'; createdAt: string; uploadedBy?: { name: string }; }
export interface Comment { id: string; message: string; revisionRequest: boolean; createdAt: string; author: Pick<User, 'id' | 'name' | 'role'>; version?: { versionNumber: number } | null; }
export interface Version { id: string; versionNumber: number; notes?: string | null; reviewStatus: string; createdAt: string; uploadedBy: Pick<User, 'id' | 'name'>; file?: FileAsset | null; approvals?: { createdAt: string; approver: { id: string; name: string } }[]; comments?: Comment[]; }
export interface Deliverable { id: string; projectId: string; project?: { id: string; name: string; status?: Status }; title: string; description: string; type: string; status: Status; deadline?: string | null; currentVersionId?: string | null; currentVersion?: Version | null; versions?: Version[]; comments?: Comment[]; approvals?: { id: string; createdAt: string; approver: { name: string }; version: { versionNumber: number } }[]; files?: FileAsset[]; _count?: { comments: number; versions: number }; }
export interface Activity { id: string; message: string; type: string; createdAt: string; actor?: { id: string; name: string; role: Role } | null; project?: { id: string; name: string }; deliverable?: { title: string } | null; }
export interface Client extends User { projects: { id: string; name: string; status: Status; deadline: string }[]; }
