/** Canonical Java wire contract. Chinese labels and derived class tabs are UI projections. */
export const IMAGE_UPLOAD = {
  mimeTypes: ["image/jpeg", "image/png"] as const,
  maxBytes: 2 * 1024 * 1024,
  maxPixels: 8_000_000,
  maxAttachments: 3,
} as const;
export type EnrollmentStatus = "active" | "cancelled";
export type AttendanceStatus = "none" | "signed-in" | "completed";
export type ClassStatus = "upcoming" | "review" | "finished" | "cancelled";
export type CourseStatus = "draft" | "published" | "unpublished" | "archived";
export type SessionStatus = "open" | "closed" | "cancelled";
export interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T;
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
  expiresIn: number;
  refreshExpiresAt: string;
}
export interface MediaDTO {
  id: string;
  url: string;
  contentType: "image/jpeg" | "image/png";
  bytes: number;
  width: number;
  height: number;
  visibility: "public" | "private";
}
export const publishAction = (module: string) =>
  module === "sessions"
    ? "session:write"
    : module === "configs"
      ? "config:publish"
      : "course:publish";
