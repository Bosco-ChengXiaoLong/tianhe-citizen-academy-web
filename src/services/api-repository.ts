import { reactive } from "vue";
import { api } from "./http";
import { uuid } from "../../../shared/utils/uuid";
import { resourceDraft, courseDraft, sessionDraft } from "./wire-mapping";
import type { Database, Row, TableName } from "../types";
import type { PageDTO } from "../../../shared/contracts/entities";
export interface AdminIdentity {
  id: string;
  displayName: string;
  roles: string[];
  permissions: { permissionCode: string; academyId: string | null }[];
}
export const apiIdentity = reactive<{ current?: AdminIdentity }>({});
export const resourcePaths: Partial<Record<TableName, string>> = {
  academies: "academies",
  venues: "venues",
  rooms: "classrooms",
  teachers: "teachers",
  categories: "categories",
};
const prefixes: Record<string, string> = {
  rooms: "venue",
  enrollments: "teaching",
  makeups: "teaching",
  evaluations: "teaching",
  credits: "credit",
  members: "member",
  courses: "course",
  sessions: "session",
  teachers: "teacher",
  categories: "category",
  academies: "academy",
  venues: "venue",
  media: "media",
  messages: "message",
  feedback: "feedback",
  configs: "config",
  levels: "level",
};
export const labels: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  unpublished: "已下架",
  archived: "已归档",
  open: "报名中",
  closed: "已截止",
  cancelled: "已取消",
  active: "已报名",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  replied: "已回复",
  new: "待处理",
  completed: "已完成",
  "signed-in": "已签到",
  none: "未签到",
  ready: "已生成",
  queued: "排队中",
  failed: "失败",
  sent: "已发送",
};
export function viewRow(raw: Record<string, unknown>): Row {
  const r = { ...raw } as unknown as Row;
  r.id = String(raw.id ?? raw.publicId ?? raw.configKey ?? "");
  r.name = String(
    raw.name ??
      raw.title ??
      raw.displayName ??
      raw.studentNo ??
      raw.content ??
      r.id,
  );
  r.academyId = String(
    raw.academyId ??
      (Array.isArray(raw.academyIds) ? raw.academyIds[0] : "") ??
      "",
  );
  r.version = Number(raw.version ?? 1);
  r.createdAt = String(raw.createdAt ?? "");
  r.status =
    typeof raw.enabled === "boolean"
      ? raw.enabled
        ? "启用"
        : "停用"
      : typeof raw.active === "boolean"
        ? raw.active
          ? "启用"
          : "停用"
        : (labels[String(raw.status ?? raw.state)] ??
          String(raw.status ?? raw.state ?? ""));
  if (raw.startsAt) {
    r.startAt = String(raw.startsAt);
    r.endAt = String(raw.endsAt);
    r.roomId = String(raw.classroomId);
    r.registrationStart = String(raw.registrationStartsAt);
    r.registrationEnd = String(raw.registrationEndsAt);
  }
  if (raw.courseSessionId) r.sessionId = String(raw.courseSessionId);
  if (raw.attendance)
    r.attendance = labels[String(raw.attendance)] ?? String(raw.attendance);
  if (raw.content) r.description = String(raw.content);
  if (raw.body) r.description = String(raw.body);
  if (raw.source) r.status = raw.reversalOf ? "已冲正" : "已入账";
  if (raw.coverUrl) r.coverId = String(raw.coverUrl).split("/").pop() ?? "";
  if (raw.mediaUrl && !raw.url) r.url = String(raw.mediaUrl);
  if (raw.courseId && !raw.title && raw.startsAt)
    r.name = String(
      raw.courseTitle ??
        database.tables.courses.find((c) => c.id === raw.courseId)?.name ??
        r.name,
    );
  r.reviewed = Boolean(raw.evaluated);
  if (raw.status === "pending" && raw.category) r.status = "待处理";
  if (raw.status === "processing") r.status = "处理中";
  return r;
}
const tables = Object.fromEntries(
  Object.keys(prefixes).map((k) => [k, []]),
) as unknown as Record<TableName, Row[]>;
const database = reactive<Database>({
  revision: 1,
  securityVersion: 1,
  tables,
  accounts: [],
  roles: [],
  audits: [],
  exports: [],
  attribution: [],
});
export class ApiRepository {
  read() {
    return database;
  }
  can(action: string, academyIds?: string[]) {
    const grants =
      apiIdentity.current?.permissions.filter(
        (g) => g.permissionCode === action,
      ) ?? [];
    return (
      grants.some((g) => g.academyId === null) ||
      (!academyIds?.length
        ? grants.length > 0
        : academyIds.every((id) => grants.some((g) => g.academyId === id)))
    );
  }
  globalCan(action: string) {
    return !!apiIdentity.current?.permissions.some(
      (g) => g.permissionCode === action && g.academyId === null,
    );
  }
  list(table: TableName) {
    return database.tables[table];
  }
  async identity() {
    const identity = await api.request<AdminIdentity>(
      "GET",
      "/auth/me",
      undefined,
      { authenticated: true },
    );
    if (
      apiIdentity.current?.id !== identity.id ||
      JSON.stringify(apiIdentity.current?.permissions) !==
        JSON.stringify(identity.permissions)
    ) {
      for (const key of Object.keys(database.tables) as TableName[])
        database.tables[key] = [];
      database.audits = [];
      database.exports = [];
      database.roles = [];
      database.attribution = [];
    }
    apiIdentity.current = identity;
    database.accounts = [
      {
        id: identity.id,
        name: identity.displayName,
        username: identity.displayName,
        active: true,
        roleIds: identity.roles,
      },
    ];
    return identity;
  }
  async page(
    table: TableName,
    query: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
  ): Promise<PageDTO<Row>> {
    if (table === "configs" || table === "levels") {
      const key = table === "levels" ? "levels" : "home";
      const raw = await api.request<Record<string, unknown>>(
        "GET",
        `/configs/${key}`,
        undefined,
        { authenticated: true, signal },
      );
      const r = viewRow({
        ...raw,
        id: key,
        name: key === "home" ? "首页展示配置" : "等级与权益配置",
        status: "draft",
      });
      database.tables[table] = [r];
      return { items: [r], total: 1, page: 1, pageSize: 1 };
    }
    const path = resourcePaths[table]
      ? `/resources/${resourcePaths[table]}`
      : `/${table}`;
    const params = new URLSearchParams();
    const canonical = Object.entries(labels).find(
      ([, value]) => value === query.status,
    )?.[0];
    if (canonical)
      query = {
        ...query,
        status:
          table === "feedback" && canonical === "pending"
            ? "pending"
            : canonical,
      };
    if (table === "feedback" && query.status === "待处理")
      query = { ...query, status: "pending" };
    if (resourcePaths[table] && query.status)
      query = {
        ...query,
        enabled: query.status === "启用" ? "true" : "false",
        status: undefined,
      };
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== "") params.set(k, String(v));
    const result = await api.request<PageDTO<Record<string, unknown>>>(
      "GET",
      `${path}?${params}`,
      undefined,
      { authenticated: true, signal },
    );
    const items = result.items.map(viewRow);
    database.tables[table] = items;
    return { ...result, items };
  }
  async references() {
    // Reference selectors fetch every authorised page; primary lists use page()/server totals.
    for (const t of [
      "academies",
      "venues",
      "rooms",
      "teachers",
      "categories",
      "media",
      "courses",
      "sessions",
      "members",
    ] as TableName[]) {
      if (!this.can(prefixes[t] + ":read")) continue;
      const all: Row[] = [];
      for (let page = 1; ; page++) {
        const result = await this.page(t, { page, pageSize: 100 });
        all.push(...result.items);
        if (all.length >= result.total || !result.items.length) break;
      }
      database.tables[t] = all;
    }
  }
  async save(table: TableName, input: Row) {
    const create = Number(input.version) === 0;
    const reason = String(input.reason ?? "运营后台保存配置");
    let path = resourcePaths[table]
      ? `/resources/${resourcePaths[table]}`
      : `/${table}`;
    let body: unknown;
    if (resourcePaths[table]) {
      body = resourceDraft(input, reason);
      if (create) delete (body as Record<string, unknown>).version;
    } else if (table === "courses") {
      const media = database.tables.media.find((m) => m.id === input.coverId);
      body = courseDraft(
        input,
        String(media?.url ?? input.coverUrl ?? ""),
        reason,
      );
    } else if (table === "sessions")
      body = sessionDraft(input, String(input.classroomCode ?? ""), reason);
    else if (table === "members")
      body = {
        displayName: input.name,
        studentNo: input.studentNo,
        academyId: input.academyId || null,
        active: input.status !== "停用",
        version: input.version,
        password: input.password || undefined,
        invitationToken: input.invitationToken || undefined,
        reason,
      };
    else if (table === "media") {
      const assetId = String(input.url ?? "")
        .split("/")
        .pop();
      if (create && assetId) {
        input = { ...input, id: assetId, version: 1 };
        path = `/media/${assetId}`;
      }
      body = {
        name: input.name,
        description: input.description ?? "",
        enabled: input.status !== "停用",
        version: input.version,
        reason,
      };
    } else if (table === "feedback") {
      path += `/${input.id}/reply`;
      body = { version: input.version, reply: input.reply, reason };
    } else if (table === "messages")
      body = {
        title: input.name,
        body: input.description,
        academyId: input.academyId || null,
        version: input.version,
        reason,
      };
    else if (table === "configs" || table === "levels") {
      path = `/configs/${table === "levels" ? "levels" : "home"}`;
      body = {
        version: input.version,
        reason,
        settings:
          typeof input.settings === "string"
            ? JSON.parse(input.settings)
            : input.settings,
      };
    } else throw new Error("此记录请使用专用业务操作");
    if (!create && !["configs", "levels", "feedback"].includes(table))
      path += `/${input.id}`;
    if (table === "sessions" && !create) path += "/change";
    const out = await api.request<Record<string, unknown>>(
      table === "feedback" || (table === "sessions" && !create)
        ? "POST"
        : create && !["configs", "levels", "media"].includes(table)
          ? "POST"
          : "PUT",
      path,
      body,
      { authenticated: true },
    );
    await this.references();
    return viewRow(out);
  }
  async transition(
    table: TableName,
    id: string,
    status: string,
    version: number,
    reason: string,
  ) {
    let path = `/${table}/${id}`;
    let body: unknown = { version, reason };
    if (table === "courses")
      path +=
        "/" +
        ({ 已发布: "publish", 已下架: "unpublish", 已归档: "archive" }[
          status
        ] ?? "unpublish");
    else if (table === "sessions") {
      if (status === "已发布")
        throw new Error("场次保存后即开放报名，无需再次发布");
      path += "/" + (status === "已取消" ? "cancel" : "close-registration");
    } else if (table === "enrollments") path += "/cancel";
    else if (table === "makeups") {
      path += "/review";
      body = { version, reason, approved: status === "已通过" };
    } else if (table === "media") path += "/delete";
    else if (table === "feedback") path += "/process";
    else if (table === "evaluations") {
      path += "/visibility";
      body = { version, reason, hidden: status === "隐藏评价" };
    } else if (table === "messages") path += "/send";
    else if (table === "credits") path += "/reverse";
    else if (resourcePaths[table]) {
      const old = this.list(table).find((r) => r.id === id)!;
      return this.save(table, {
        ...old,
        status: status === "启用" ? "启用" : "停用",
        reason,
      });
    } else throw new Error("请使用该模块的专用操作");
    const result = await api.request("POST", path, body, {
      authenticated: true,
    });
    await this.references();
    return result;
  }
  async attendance(id: string, action: "签到" | "签退", reason: string) {
    const r = database.tables.enrollments.find((e) => e.id === id);
    return api.request(
      "POST",
      `/enrollments/${id}/attendance`,
      {
        attendance: action === "签到" ? "signed-in" : "completed",
        version: r?.version,
        reason,
      },
      { authenticated: true },
    );
  }
  async enroll(sessionId: string, memberId: string) {
    return api.request(
      "POST",
      "/enrollments",
      { courseSessionId: sessionId, memberId, reason: "教务核验后代报名" },
      { authenticated: true, requestId: uuid() },
    );
  }
  async createExport(
    table: TableName | "audit",
    ids: string[],
    filters: string,
  ) {
    const q = JSON.parse(filters);
    return api.request(
      "POST",
      "/exports",
      {
        dataset: table === "rooms" ? "classrooms" : table,
        ids,
        academyId: q.academy || undefined,
        keyword: q.q || undefined,
        reason: "运营后台按当前查询导出",
      },
      { authenticated: true },
    );
  }
}
export const apiRepository = new ApiRepository();
