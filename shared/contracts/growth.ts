export interface GrowthPoint {
  day: string;
  visits: number;
  visitors: number;
  registrations: number;
  newMembers: number;
  activeMembers: number;
  enrollments: number;
}
export interface GrowthReport {
  visits: number;
  visitors: number;
  registrations: number;
  unlinkedRegistrations: number;
  convertedVisitors: number;
  enrolledVisitors: number;
  attendedVisitors: number;
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
  nextContactDate: string | null;
  status: "open" | "completed";
  version: number;
  createdAt: string;
  actorName: string;
}
