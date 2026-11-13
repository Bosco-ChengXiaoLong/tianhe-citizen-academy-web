/** Java 领域数据传输契约，保留服务端标识、状态和并发版本。 */
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
/** 学员端公开的课程信息，来源于发布版本。 */
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
  teacherSource?: "catalog" | "course_only";
  teacherDescription?: string | null;
  categoryName: string;
  sessions: CourseSessionDTO[];
}
/** 后台编辑用的课程投影，包含草稿状态及并发版本。 */
export interface AdminCourseDTO extends Omit<
  PublicCourseDTO,
  | "publishedVersion"
  | "sessions"
  | "academyName"
  | "teacherName"
  | "categoryName"
> {
  /** 最近的公开版本，课程从未发布时为空。 */
  publishedVersion: number | null;
  status: CourseStatus;
  version: number;
}
/** 排课时段、报名考勤时间窗及该场次的资源归属。 */
export interface CourseSessionDTO {
  id: EntityId;
  courseId: EntityId;
  academyId: EntityId;
  classroomId: EntityId;
  teacherId: EntityId;
  startsAt: string;
  endsAt: string;
  /** 报名开放时间，服务端统一使用绝对时间表达。 */
  registrationStartsAt: string;
  registrationEndsAt: string;
  cancelClosesAt: string;
  checkinOpensAt: string;
  checkinClosesAt: string;
  checkoutOpensAt: string;
  checkoutClosesAt: string;
  capacity: number;
  /** 当前已占用的报名名额。 */
  booked: number;
  credits: number | null;
  status: SessionStatus;
  version: number;
  /** 当前场次采用的业务规则版本。 */
  policyVersion: number;
  venueId?: EntityId;
  venueName?: string;
  address?: string;
  classroomName?: string;
  teacherName?: string;
}
/** 报名业务记录及其关联场次的快照和当前值。 */
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
  /** 服务端聚合的上课页面状态，供列表分组使用。 */
  classStatus?: ClassStatus;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
  /** 报名时保存的历史数据，用于回看当时的课程和场次信息。 */
  snapshot: Record<string, unknown>;
  /** 查询时的最新场次信息，用于展示排课变更。 */
  currentSession?: Record<string, unknown>;
}
export interface PageDTO<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
/** 写操作结果包含提交标识及新的并发版本。 */
export interface MutationDTO<T> {
  requestId: string;
  version?: number;
  reason?: string;
  data: T;
}
/** 单项操作授权及其全局或学院范围。 */
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
/** 后台异步导出任务的生命周期和产物有效期。 */
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
