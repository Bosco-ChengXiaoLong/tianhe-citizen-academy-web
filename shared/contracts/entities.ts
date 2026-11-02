import type {
  EnrollmentStatus,
  AttendanceStatus,
  SessionStatus,
  ClassStatus,
  CourseStatus,
} from "./protocol";
export type EntityId = string;
export interface AcademyDTO {
  id: EntityId;
  name: string;
  description: string | null;
  coverUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  version: number;
}
export interface VenueDTO {
  id: EntityId;
  academyIds: EntityId[];
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  description: string | null;
  enabled: boolean;
  version: number;
}
export interface PublicCourseDTO {
  id: EntityId;
  academyId: EntityId;
  categoryId: EntityId;
  teacherId: EntityId;
  title: string;
  description: string;
  coverUrl: string;
  publishedVersion: number;
  academyName: string;
  teacherName: string;
  categoryName: string;
  sessions: CourseSessionDTO[];
}
export interface AdminCourseDTO extends Omit<
  PublicCourseDTO,
  | "publishedVersion"
  | "sessions"
  | "academyName"
  | "teacherName"
  | "categoryName"
> {
  publishedVersion: number | null;
  status: CourseStatus;
  version: number;
}
export interface CourseSessionDTO {
  id: EntityId;
  courseId: EntityId;
  academyId: EntityId;
  classroomId: EntityId;
  teacherId: EntityId;
  startsAt: string;
  endsAt: string;
  registrationStartsAt: string;
  registrationEndsAt: string;
  cancelClosesAt: string;
  checkinOpensAt: string;
  checkinClosesAt: string;
  checkoutOpensAt: string;
  checkoutClosesAt: string;
  capacity: number;
  booked: number;
  credits: number | null;
  status: SessionStatus;
  version: number;
  policyVersion: number;
  venueId?: EntityId;
  venueName?: string;
  address?: string;
  classroomName?: string;
  teacherName?: string;
}
export interface EnrollmentDTO {
  id: EntityId;
  memberId: EntityId;
  courseSessionId: EntityId;
  courseId?: EntityId;
  status: EnrollmentStatus;
  attendance: AttendanceStatus;
  evaluated: boolean;
  rating?: number;
  review?: string;
  version: number;
  classStatus?: ClassStatus;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
  snapshot: Record<string, unknown>;
  currentSession?: Record<string, unknown>;
}
export interface PageDTO<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface MutationDTO<T> {
  requestId: string;
  version?: number;
  reason?: string;
  data: T;
}
export interface RoleGrantDTO {
  action: string;
  global: boolean;
  academyIds: EntityId[];
}
export interface RoleDTO {
  code: string;
  name: string;
  enabled: boolean;
  version: number;
  grants: RoleGrantDTO[];
}
export interface ExportJobDTO {
  id: EntityId;
  dataset: string;
  status: "queued" | "ready" | "failed" | "expired";
  attempts: number;
  rowCount: number | null;
  errorCode: string | null;
  expiresAt: string;
  createdAt: string;
}
