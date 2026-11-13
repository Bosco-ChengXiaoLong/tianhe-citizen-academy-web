/** 共享邀请转化、推荐人和教务跟进的 Java 数据结构。 */
/** 以业务日期聚合的一天访问、注册及报名数据。 */
export interface GrowthPoint {
  day: string;
  visits: number;
  visitors: number;
  registrations: number;
  newMembers: number;
  activeMembers: number;
  enrollments: number;
}
/** 在选定统计范围内汇总的邀请链路和转化报表。 */
export interface GrowthReport {
  visits: number;
  visitors: number;
  registrations: number;
  /** 已归因到邀请来源但未关联统计访问的注册数。 */
  unlinkedRegistrations: number;
  convertedVisitors: number;
  enrolledVisitors: number;
  attendedVisitors: number;
  /** 转化比例，无有效分母时为空。 */
  conversionRate: number | null;
  collectionEnabled: boolean;
  updatedAt: string;
  cohortDescription: string;
  trend: GrowthPoint[];
  channels: {
    channel: string;
    registrations: number;
    unlinkedRegistrations: number;
  }[];
}
export interface ReferrerRow {
  id: string;
  displayName: string;
  studentNo: string;
  visits: number;
  visitors: number;
  registrations: number;
  unlinkedRegistrations: number;
  convertedVisitors: number;
  conversionRate: number | null;
  directCount: number;
  downstreamCount: number;
  enrollments: number;
}
export interface CareProfile {
  note: string;
  version: number;
  actorName?: string;
  updatedAt?: string;
}
export interface FollowupRecord {
  id: string;
  content: string;
  /** 下次联系的业务日期，未计划时为空。 */
  nextContactDate: string | null;
  status: "open" | "completed";
  version: number;
  createdAt: string;
  actorName: string;
}
