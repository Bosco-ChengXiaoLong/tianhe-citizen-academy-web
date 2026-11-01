export type Value = string | number | boolean | string[];
export interface Row {
  id: string;
  name: string;
  academyId: string;
  status: string;
  version: number;
  createdAt: string;
  [key: string]: Value;
}
export interface Grant {
  action: string;
  scope: "*" | string[];
}
export interface Role {
  id: string;
  name: string;
  grants: Grant[];
}
export interface AdminAccount {
  id: string;
  name: string;
  username: string;
  roleIds: string[];
  active: boolean;
}
export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  table: string;
  target: string;
  reason: string;
  before: string;
  after: string;
  at: string;
  requestId: string;
}
export type TableName =
  | "academies"
  | "venues"
  | "rooms"
  | "teachers"
  | "categories"
  | "media"
  | "courses"
  | "sessions"
  | "members"
  | "enrollments"
  | "makeups"
  | "evaluations"
  | "feedback"
  | "credits"
  | "levels"
  | "messages"
  | "configs";
export interface ExportJob {
  id: string;
  owner: string;
  table: TableName | "audit";
  status: "ready" | "failed";
  count: number;
  expiresAt: number;
  filters: string;
  rows: Row[];
  scopeVersion: number;
}
export interface Database {
  revision: number;
  securityVersion: number;
  tables: Record<TableName, Row[]>;
  accounts: AdminAccount[];
  roles: Role[];
  audits: AuditEntry[];
  exports: ExportJob[];
  attribution: {
    id: string;
    ancestorId: string;
    memberId: string;
    enrollmentId: string;
    valid: boolean;
  }[];
}
export interface Session {
  accountId: string;
  expiresAt: number;
  securityVersion: number;
}
export interface Field {
  key: string;
  label: string;
  kind?:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "datetime"
    | "asset"
    | "password";
  required?: boolean;
  options?: string[];
  relation?: TableName;
  min?: number;
}
export interface ModuleDefinition {
  key: string;
  title: string;
  group: string;
  icon: string;
  table?: TableName;
  permission: string;
  description: string;
  columns?: { key: string; label: string; width?: number }[];
  fields?: Field[];
}
