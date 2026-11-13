/** Canonical Java wire contract. Chinese labels and derived class tabs are UI projections. */
export const IMAGE_UPLOAD = {
  mimeTypes: ["image/jpeg", "image/png"] as const,
  maxBytes: 2 * 1024 * 1024,
  maxPixels: 8_000_000,
  maxAttachments: 3,
} as const;
export type EnrollmentStatus = "active" | "cancelled";
/** 考勤状态与报名状态独立。同一已报名记录可经历待签到、已签到和已签退。 */
export type AttendanceStatus = "none" | "signed-in" | "completed";
export type ClassStatus = "upcoming" | "review" | "finished" | "cancelled";
export type CourseStatus = "draft" | "published" | "unpublished" | "archived";
export type SessionStatus = "open" | "closed" | "cancelled";
/** 所有标准 JSON 接口携带业务码和请求追踪标识。 */
export interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T;
  /** 服务端追踪标识，排查问题时可用它关联日志。 */
  requestId: string;
}
export interface PageQuery {
  page?: number;
  pageSize?: number;
}
export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** 访问令牌的有效秒数，用于计算客户端提前刷新时间。 */
  expiresIn: number;
  /** 刷新凭据的绝对到期时间。 */
  refreshExpiresAt: string;
}
export interface MediaDTO {
  id: string;
  url: string;
  contentType: "image/jpeg" | "image/png";
  bytes: number;
  width: number;
  height: number;
  /** 公开素材可直接读取，私有附件走鉴权接口。 */
  visibility: "public" | "private";
}
export const publishAction = (module: string) =>
  module === "sessions"
    ? "session:write"
    : module === "configs"
      ? "config:publish"
      : "course:publish";
