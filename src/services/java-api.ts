import { uuid } from "../../../shared/utils/uuid";
import { api } from "./http";
import type {
  PageDTO,
  AdminCourseDTO,
  CourseSessionDTO,
  EnrollmentDTO,
} from "../../../shared/contracts/entities";
import type { MediaDTO } from "../../../shared/contracts/protocol";
const auth = { authenticated: true };
export const javaAdmin = {
  login: (username: string, password: string) =>
    api.login("/auth/login", { username, password }),
  me: () => api.request("GET", "/auth/me", undefined, auth),
  page: <T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) query.set(key, String(value));
    return api.request<PageDTO<T>>("GET", `${path}?${query}`, undefined, auth);
  },
  save: <T>(path: string, input: unknown, create = false) =>
    api.request<T>(create ? "POST" : "PUT", path, input, auth),
  command: <T>(path: string, input: unknown, requestId: string = uuid()) =>
    api.request<T>("POST", path, input, { ...auth, requestId }),
  courses: (page = 1, pageSize = 20) =>
    javaAdmin.page<AdminCourseDTO>("/courses", { page, pageSize }),
  sessions: (academyId?: string, page = 1, pageSize = 20) =>
    javaAdmin.page<CourseSessionDTO>("/sessions", {
      academyId,
      page,
      pageSize,
    }),
  enrollments: (
    academyId?: string,
    courseSessionId?: string,
    page = 1,
    pageSize = 20,
  ) =>
    javaAdmin.page<EnrollmentDTO>("/enrollments", {
      academyId,
      courseSessionId,
      page,
      pageSize,
    }),
  enroll: (
    memberId: string,
    courseSessionId: string,
    reason: string,
    requestId: string,
  ) =>
    javaAdmin.command<EnrollmentDTO>(
      "/enrollments",
      { memberId, courseSessionId, reason },
      requestId,
    ),
  upload: async (file: File, reason: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("reason", reason);
    return api.request<MediaDTO>("POST", "/media", form, auth);
  },
  download: (id: string) =>
    api.request<Blob>("GET", `/exports/${id}/download`, undefined, {
      ...auth,
      blob: true,
    }),
  logout: () => api.logout("/auth/logout"),
};
