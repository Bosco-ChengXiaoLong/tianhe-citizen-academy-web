import type {
  AdminCourseDTO,
  CourseSessionDTO,
  EnrollmentDTO,
  PageDTO,
  MutationDTO,
} from "../../../shared/contracts/entities";
export type {
  AdminCourseDTO,
  CourseSessionDTO,
  EnrollmentDTO,
} from "../../../shared/contracts/entities";
/** Reserved Java API boundary, not an implemented HTTP backend. API mode must fail explicitly until connected. */
export interface AdminApi {
  courses(
    query: {
      academyId?: string;
      keyword?: string;
      page: number;
      pageSize: number;
    },
    signal?: AbortSignal,
  ): Promise<PageDTO<AdminCourseDTO>>;
  saveCourse(input: MutationDTO<AdminCourseDTO>): Promise<AdminCourseDTO>;
  saveSession(input: MutationDTO<CourseSessionDTO>): Promise<CourseSessionDTO>;
  enroll(
    input: MutationDTO<{ memberId: string; courseSessionId: string }>,
  ): Promise<EnrollmentDTO>;
  getRequestResult(requestId: string): Promise<unknown>;
}
