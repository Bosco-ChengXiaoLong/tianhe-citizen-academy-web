/** 在 Java 数据契约与页面展示或表单模型之间做显式转换。 */
import type { Row } from "../types";
/** UI labels are projections. Requests contain canonical Java names and state values only. */
export const bookingState = { 已报名: "active", 已取消: "cancelled" } as const;
export const attendanceState = {
  未签到: "none",
  已签到: "signed-in",
  已完成: "completed",
} as const;
export function courseDraft(row: Row, coverUrl: string, reason: string) {
  return {
    academyId: row.academyId,
    categoryId: String(row.categoryId),
    teacherId:
      row.teacherSource === "course_only"
        ? undefined
        : String(row.teacherId ?? ""),
    teacherInput:
      row.teacherSource === "course_only"
        ? {
            name: String(row.teacherName ?? "").trim(),
            description: String(row.teacherDescription ?? ""),
          }
        : undefined,
    title: row.name,
    description: String(row.description),
    coverUrl: row.uploadedCoverId ? undefined : coverUrl,
    coverMediaId: row.uploadedCoverId || undefined,
    firstSessionDraft: row.firstSessionDraftJson
      ? JSON.parse(String(row.firstSessionDraftJson))
      : undefined,
    clearFirstSessionDraft: row.clearFirstSessionDraft === true,
    version: row.version || undefined,
    reason,
  };
}
export const instant = (value: unknown) => {
  const text = String(value);
  return /Z$|[+-]\d{2}:\d{2}$/.test(text)
    ? new Date(text).toISOString()
    : new Date(text.replace(" ", "T") + "+08:00").toISOString();
};
/** 将排课表单时间及课程码转换为服务端场次请求。 */
export function sessionDraft(row: Row, classroomCode: string, reason: string) {
  return {
    courseId: String(row.courseId),
    classroomId: String(row.roomId),
    teacherId: String(row.teacherId),
    startsAt: instant(row.startAt),
    endsAt: instant(row.endAt),
    registrationStartsAt: instant(row.registrationStart),
    registrationEndsAt: instant(row.registrationEnd),
    capacity: Number(row.capacity),
    credits: Number(row.credits),
    classroomCode,
    version: row.version || undefined,
    reason,
  };
}
export function resourceDraft(row: Row, reason: string) {
  return {
    name: row.name,
    description: String(row.description ?? ""),
    enabled: row.status !== "停用",
    version: row.version || undefined,
    sortOrder: Number(row.sort ?? 0),
    address: row.address,
    longitude: row.longitude,
    latitude: row.latitude,
    venueId: row.venueId,
    capacity: row.capacity,
    academyIds: row.academyIds,
    coverUrl: row.coverUrl,
    reason,
  };
}
