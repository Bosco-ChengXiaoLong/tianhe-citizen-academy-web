import { api } from "./http";
import { isApi } from "./data-source";
import { repository } from "./client";
import { descendants, ancestors } from "../domain/referrals";
import { uuid } from "../utils/uuid";
import type {
  GrowthReport,
  ReferrerRow,
  CareProfile,
  FollowupRecord,
} from "../../shared/contracts/growth";
import type { Row } from "../types";
export type Query = Record<string, string | number | undefined>;
export function queryString(q: Query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}
export async function get<T>(
  path: string,
  q: Query = {},
  signal?: AbortSignal,
) {
  return api.request<T>("GET", `${path}?${queryString(q)}`, undefined, {
    authenticated: true,
    signal,
  });
}
export async function write<T>(method: string, path: string, body: unknown) {
  return api.request<T>(method, path, body, { authenticated: true });
}
const pageOf = <T>(items: T[], q: Query) => ({
  items: items.slice(
    (Number(q.page ?? 1) - 1) * Number(q.pageSize ?? 20),
    Number(q.page ?? 1) * Number(q.pageSize ?? 20),
  ),
  total: items.length,
  page: Number(q.page ?? 1),
  pageSize: Number(q.pageSize ?? 20),
});
function days(q: Query) {
  const to = new Date(
    String(
      q.end ??
        new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    ) + "T00:00:00Z",
  );
  const from = new Date(
    String(
      q.start ??
        new Date(to.getTime() - 29 * 86400000).toISOString().slice(0, 10),
    ) + "T00:00:00Z",
  );
  const points: Record<string, any>[] = [];
  for (
    let t = from.getTime();
    t <= to.getTime() && points.length < 366;
    t += 86400000
  )
    points.push({
      day: new Date(t).toISOString().slice(0, 10),
      visits: 0,
      visitors: 0,
      registrations: 0,
      newMembers: 0,
      activeMembers: 0,
      enrollments: 0,
    });
  return points;
}
function inRange(date: unknown, q: Query) {
  const points = days(q),
    value = String(date ?? "");
  const s = value.includes("T")
    ? new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })
    : value.slice(0, 10);
  return (
    !!points.length &&
    s >= points[0]!.day &&
    s <= points[points.length - 1]!.day
  );
}
function referralMembers() {
  if (!repository.globalCan("referral:read"))
    throw Error("需要全局邀请读取权限");
  return repository.read().tables.members;
}
function mockRegistrations() {
  referralMembers();
  const key = "qingmu-growth-registration-mock-v1";
  let facts: {
    memberId: string;
    inviterId: string;
    createdAt: string;
    channel: string;
  }[];
  try {
    facts = JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    facts = null as any;
  }
  if (!Array.isArray(facts)) {
    facts = repository
      .read()
      .tables.members.filter((m) => m.inviterId)
      .map((m) => ({
        memberId: m.id,
        inviterId: String(m.inviterId),
        createdAt: m.createdAt,
        channel: "historical",
      }));
    localStorage.setItem(key, JSON.stringify(facts));
  }
  return facts;
}
function mockReport(q: Query): GrowthReport {
  const members = mockRegistrations();
  const invited = members.filter(
    (m) =>
      (!q.inviterId || m.inviterId === q.inviterId) &&
      (!q.channel || m.channel === q.channel) &&
      inRange(m.createdAt, q),
  );
  const points = days(q);
  for (const m of invited) {
    const p = points.find((d) => d.day === m.createdAt.slice(0, 10));
    if (p) p.registrations++;
  }
  return {
    visits: 0,
    visitors: 0,
    registrations: invited.length,
    unlinkedRegistrations: invited.length,
    convertedVisitors: 0,
    enrolledVisitors: 0,
    attendedVisitors: 0,
    conversionRate: null,
    collectionEnabled: false,
    updatedAt: new Date().toISOString(),
    cohortDescription:
      "演示模式无真实访问采集；首次读取的关系快照视为历史注册，不因更正关系而重算。",
    trend: points as any,
    channels: [
      {
        channel: "historical",
        registrations: invited.length,
        unlinkedRegistrations: invited.length,
      },
    ],
  };
}
type CareStore = {
  notes: Record<string, CareProfile>;
  records: Record<string, FollowupRecord[]>;
};
function careStore(): CareStore {
  try {
    return JSON.parse(
      localStorage.getItem("qingmu-care-mock-v1") ??
        '{"notes":{},"records":{}}',
    );
  } catch {
    return { notes: {}, records: {} };
  }
}
function saveCare(db: CareStore) {
  localStorage.setItem("qingmu-care-mock-v1", JSON.stringify(db));
}
function memberPermission(id: string, action: string) {
  const m = repository.list("members").find((m) => m.id === id);
  if (!m || !repository.can(action, [m.academyId]))
    throw Error("没有此学员的操作权限");
}
export const growth = {
  report: (q: Query = {}, signal?: AbortSignal) =>
    isApi
      ? get<GrowthReport>("/growth/report", q, signal)
      : Promise.resolve(mockReport(q)),
  referrers: (q: Query = {}, signal?: AbortSignal) => {
    if (isApi)
      return get<{ items: ReferrerRow[]; total: number }>(
        "/growth/referrers",
        q,
        signal,
      );
    const members = referralMembers(),
      facts = mockRegistrations().filter(
        (f) =>
          inRange(f.createdAt, q) && (!q.channel || f.channel === q.channel),
      );
    let items = members
      .filter(
        (m) =>
          members.some((c) => c.inviterId === m.id) ||
          facts.some((f) => f.inviterId === m.id),
      )
      .map((m) => ({
        id: m.id,
        displayName: m.name,
        studentNo: String(m.studentNo ?? ""),
        visits: 0,
        visitors: 0,
        registrations: facts.filter((f) => f.inviterId === m.id).length,
        unlinkedRegistrations: facts.filter((f) => f.inviterId === m.id).length,
        convertedVisitors: 0,
        conversionRate: null,
        directCount: members.filter((c) => c.inviterId === m.id).length,
        downstreamCount: descendants(members, m.id).length,
        enrollments: repository
          .read()
          .attribution.filter((f) => f.ancestorId === m.id && f.valid).length,
      }));
    if (q.keyword)
      items = items.filter((m) =>
        (m.displayName + m.studentNo).includes(String(q.keyword)),
      );
    const sort = String(q.sort ?? "registrations") as "registrations";
    items.sort((a, b) => Number(b[sort] ?? 0) - Number(a[sort] ?? 0));
    return Promise.resolve(pageOf(items, q));
  },
  overview: async (q: Query = {}, signal?: AbortSignal) => {
    if (isApi) {
      const [summary, daily] = await Promise.all([
        get<Record<string, any>>("/overview", q, signal),
        get<{
          trend: Record<string, unknown>[];
          updatedAt: string;
          activeDefinition: string;
        }>("/overview/trend", q, signal),
      ]);
      return { ...summary, ...daily };
    }
    const db = repository.read();
    const allowed = (academyId: string) =>
      repository.can("overview:read", academyId ? [academyId] : undefined) &&
      (!q.academyId || academyId === q.academyId);
    if (!repository.can("overview:read")) throw Error("没有总览读取权限");
    const members = db.tables.members.filter((m) => allowed(m.academyId));
    const enrollments = db.tables.enrollments.filter(
      (e) =>
        allowed(e.academyId) &&
        e.status === "已报名" &&
        inRange(e.createdAt, q),
    );
    const care = careStore(),
      today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Shanghai",
      });
    const trend = days(q);
    for (const p of trend) {
      p.newMembers = members.filter(
        (m) => m.status === "启用" && m.createdAt.slice(0, 10) === p.day,
      ).length;
      p.enrollments = enrollments.filter(
        (e) => e.createdAt.slice(0, 10) === p.day,
      ).length;
      p.activeMembers = new Set(
        enrollments
          .filter((e) => e.createdAt.slice(0, 10) === p.day)
          .map((e) => e.memberId),
      ).size;
    }
    return {
      cumulativeMembers: members.filter((m) => m.status === "启用").length,
      newMembers: members.filter(
        (m) => m.status === "启用" && inRange(m.createdAt, q),
      ).length,
      activeMembers: new Set(enrollments.map((e) => e.memberId)).size,
      enrollments: enrollments.length,
      pendingMakeups: db.tables.makeups
        .filter((m) => allowed(m.academyId))
        .filter((m) => m.status === "待审核").length,
      pendingFeedback: repository.globalCan("feedback:read")
        ? db.tables.feedback.filter((f) => f.status !== "已处理").length
        : null,
      dueFollowupMembers: members.filter((m) =>
        (care.records[m.id] ?? []).some(
          (f) =>
            f.status === "open" &&
            f.nextContactDate &&
            f.nextContactDate <= today,
        ),
      ).length,
      unenrolledMembers: members.filter(
        (m) =>
          !db.tables.enrollments.some(
            (e) => e.memberId === m.id && e.status === "已报名",
          ),
      ).length,
      notAttendedMembers: members.filter((m) =>
        db.tables.enrollments.some(
          (e) =>
            e.memberId === m.id &&
            e.status === "已报名" &&
            e.attendance !== "已完成" &&
            String(
              db.tables.sessions.find((s) => s.id === e.sessionId)?.endAt ??
                "9999",
            ) < today,
        ),
      ).length,
      hotCourses: db.tables.courses
        .filter((c) => allowed(c.academyId))
        .map((c) => ({
          title: c.name,
          enrollments: enrollments.filter((e) => e.courseId === c.id).length,
        })),
      trend,
      updatedAt: new Date().toISOString(),
      activeDefinition: "演示统计依据本地学员与报名记录，无真实访问流量。",
    };
  },
  summary: async (id: string) => {
    if (isApi) return get<Record<string, any>>(`/referrals/${id}`);
    const members = referralMembers(),
      m = members.find((m) => m.id === id);
    return {
      displayName: m?.name,
      studentNo: m?.studentNo,
      direct: members.filter((m) => m.inviterId === id).length,
      downstream: descendants(members, id).length,
      upstream: ancestors(members, id).map((m) => ({
        id: m.id,
        displayName: m.name,
      })),
    };
  },
  downstream: (id: string, q: Query = {}, signal?: AbortSignal) => {
    if (isApi)
      return get<{ items: Record<string, any>[]; total: number }>(
        `/referrals/${id}/downstream`,
        q,
        signal,
      );
    const members = referralMembers();
    const items = (
      q.direct === "true"
        ? members.filter((m) => m.inviterId === id)
        : descendants(members, id)
    ).map((m) => ({
      ...m,
      displayName: m.name,
      inviterName: members.find((p) => p.id === m.inviterId)?.name,
      studentNo: m.studentNo,
      depth: ancestors(members, m.id).findIndex((a) => a.id === id) + 1,
      enrollments: repository
        .read()
        .tables.enrollments.filter(
          (e) => e.memberId === m.id && e.status === "已报名",
        ).length,
      attendance: repository
        .read()
        .tables.enrollments.filter(
          (e) => e.memberId === m.id && e.attendance === "已完成",
        ).length,
    }));
    return Promise.resolve(pageOf(items, q));
  },
  facts: (id: string, q: Query = {}) =>
    isApi
      ? get<{ items: Record<string, any>[]; total: number }>(
          `/referrals/${id}/contributions`,
          q,
        )
      : Promise.resolve(
          pageOf(
            (referralMembers(), repository.read().attribution)
              .filter((a) => a.ancestorId === id)
              .map((a) => ({
                ...a,
                displayName: repository
                  .read()
                  .tables.members.find((m) => m.id === a.memberId)?.name,
              })),
            q,
          ),
        ),
  members: (q: Query = {}, signal?: AbortSignal) => {
    if (isApi)
      return get<{ items: Record<string, any>[]; total: number }>(
        "/members",
        q,
        signal,
      );
    const db = repository.read(),
      care = careStore();
    let items = repository.list("members").map((m) => ({
      ...m,
      displayName: m.name,
      source: m.source,
      nextContactDate: (care.records[m.id] ?? [])
        .filter((f) => f.status === "open" && f.nextContactDate)
        .map((f) => f.nextContactDate)
        .sort()[0],
    }));
    if (q.academyId) items = items.filter((m) => m.academyId === q.academyId);
    if (q.segment === "current")
      items = items.filter((m) => m.status === "启用");
    if (q.segment === "new")
      items = items.filter(
        (m) => m.status === "启用" && inRange(m.createdAt, q),
      );
    if (q.segment === "active")
      items = items.filter((m) =>
        db.tables.enrollments.some(
          (e) =>
            e.memberId === m.id &&
            inRange(e.createdAt, q) &&
            (!q.academyId || e.academyId === q.academyId),
        ),
      );
    if (q.keyword)
      items = items.filter((m) =>
        (m.name + String((m as unknown as Row).studentNo ?? "")).includes(
          String(q.keyword),
        ),
      );
    if (q.segment === "due")
      items = items.filter(
        (m) =>
          m.nextContactDate &&
          m.nextContactDate <=
            new Date().toLocaleDateString("sv-SE", {
              timeZone: "Asia/Shanghai",
            }),
      );
    if (q.segment === "unenrolled")
      items = items.filter(
        (m) =>
          !db.tables.enrollments.some(
            (e) => e.memberId === m.id && e.status === "已报名",
          ),
      );
    if (q.segment === "not_attended")
      items = items.filter((m) =>
        db.tables.enrollments.some(
          (e) =>
            e.memberId === m.id &&
            e.status === "已报名" &&
            e.attendance !== "已完成" &&
            String(
              db.tables.sessions.find((s) => s.id === e.sessionId)?.endAt ??
                "9999",
            ) <
              new Date().toLocaleDateString("sv-SE", {
                timeZone: "Asia/Shanghai",
              }),
        ),
      );
    return Promise.resolve(pageOf(items, q));
  },
  member: (id: string) =>
    isApi
      ? get<Record<string, any>>(`/members/${id}`)
      : Promise.resolve(repository.list("members").find((m) => m.id === id)!),
  saveMember: async (
    id: string | undefined,
    input: Record<string, unknown>,
  ) => {
    if (isApi)
      return write<Record<string, any>>(
        id ? "PUT" : "POST",
        `/members${id ? "/" + id : ""}`,
        input,
      );
    if (input.invitationToken)
      throw Error("真实邀请凭据请在API模式核验，演示模式不生成虚假注册归因");
    const old = id
      ? repository.list("members").find((m) => m.id === id)
      : undefined;
    const saved = repository.save("members", {
      ...old,
      id: id ?? uuid(),
      name: String(input.displayName),
      studentNo: String(input.studentNo),
      phone:
        input.phone === undefined
          ? String(old?.phone ?? "")
          : String(input.phone),
      academyId: String(input.academyId ?? ""),
      status: input.active ? "启用" : "停用",
      source: "admin_verified",
      version: Number(input.version),
      createdAt: old?.createdAt ?? new Date().toISOString(),
    } as Row);
    return saved;
  },
  care: (id: string) =>
    isApi
      ? get<CareProfile>(`/members/${id}/care`)
      : Promise.resolve(
          (memberPermission(id, "member:read"),
          careStore().notes[id] ?? { note: "", version: 0 }),
        ),
  note: async (id: string, profile: CareProfile, reason: string) => {
    if (isApi)
      return write<CareProfile>("PUT", `/members/${id}/care`, {
        version: profile.version,
        content: profile.note,
        reason,
      });
    memberPermission(id, "member:write");
    if (!reason.trim() || reason.length > 500 || profile.note.length > 3000)
      throw Error("请检查备注及修改说明长度");
    const db = careStore();
    if ((db.notes[id]?.version ?? 0) !== profile.version)
      throw Error("备注已更新，请重新读取");
    const note = {
      ...profile,
      version: profile.version + 1,
      actorName: "演示工作人员",
      updatedAt: new Date().toISOString(),
    };
    db.notes[id] = note;
    saveCare(db);
    return note;
  },
  followups: (id: string, q: Query = {}) =>
    isApi
      ? get<{ items: FollowupRecord[]; total: number }>(
          `/members/${id}/followups`,
          q,
        )
      : Promise.resolve(
          (memberPermission(id, "member:read"),
          pageOf(careStore().records[id] ?? [], q)),
        ),
  append: async (
    id: string,
    input: { id: string; content: string; nextContactDate?: string },
  ) => {
    if (isApi) return write("POST", `/members/${id}/followups`, input);
    memberPermission(id, "member:write");
    const db = careStore();
    const rows = (db.records[id] ??= []);
    if (!input.content.trim() || input.content.length > 3000)
      throw Error("跟进内容须1至3000字");
    const old = rows.find((r) => r.id === input.id);
    if (
      old &&
      (old.content !== input.content ||
        old.nextContactDate !== (input.nextContactDate ?? null))
    )
      throw Error("跟进请求编号重复");
    if (!rows.some((r) => r.id === input.id))
      rows.unshift({
        ...input,
        nextContactDate: input.nextContactDate ?? null,
        status: "open",
        version: 1,
        createdAt: new Date().toISOString(),
        actorName: "演示工作人员",
      });
    saveCare(db);
  },
  complete: async (id: string, row: FollowupRecord) => {
    if (isApi)
      return write("POST", `/members/${id}/followups/${row.id}/complete`, {
        version: row.version,
        reason: "完成本次教务跟进",
      });
    memberPermission(id, "member:write");
    const db = careStore(),
      found = db.records[id]?.find((f) => f.id === row.id);
    if (!found || found.version !== row.version || found.status !== "open")
      throw Error("跟进记录已更新");
    found.status = "completed";
    found.version++;
    saveCare(db);
  },
};
