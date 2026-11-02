import { uuid } from "../utils/uuid";
import { clone } from "../utils/clone";
import { seedDatabase } from "../mock/seed";
import { allowed, actionScopes, DomainError } from "../domain/permissions";
import { validateParent, descendants } from "../domain/referrals";
import type {
  Database,
  Session,
  Row,
  TableName,
  Role,
  AdminAccount,
} from "../types";
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const DATABASE_KEY = "qmsy-admin-demo-v1";
const prefixes: Record<TableName, string> = {
  academies: "academy",
  venues: "venue",
  rooms: "venue",
  teachers: "teacher",
  categories: "category",
  media: "media",
  courses: "course",
  sessions: "session",
  members: "member",
  enrollments: "teaching",
  makeups: "teaching",
  evaluations: "teaching",
  feedback: "feedback",
  credits: "credit",
  levels: "level",
  messages: "message",
  configs: "config",
};
export class Repository {
  constructor(
    private storage: StorageAdapter,
    private getSession: () => Session | null,
    private mode = "demo",
  ) {}
  read(): Database {
    if (this.mode !== "demo" && this.mode !== "mock")
      throw new DomainError(
        "NOT_CONNECTED",
        "API 模式尚未接入 Java 服务，未回退演示数据",
      );
    const raw = this.storage.getItem(DATABASE_KEY);
    if (!raw) {
      const db = seedDatabase();
      this.storage.setItem(DATABASE_KEY, JSON.stringify(db));
      return db;
    }
    try {
      const db = JSON.parse(raw) as Database;
      if (!db.tables || !Array.isArray(db.roles) || !Array.isArray(db.accounts))
        throw new Error();
      return db;
    } catch {
      throw new DomainError(
        "CORRUPT_DATA",
        "本地演示资料损坏，请在演示工具中重置",
      );
    }
  }
  private account(db: Database) {
    const s = this.getSession();
    if (!s || s.expiresAt <= Date.now())
      throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录");
    const a = db.accounts.find((a) => a.id === s.accountId);
    if (!a?.active || s.securityVersion !== db.securityVersion)
      throw new DomainError("UNAUTHORIZED", "权限已变更，请重新登录");
    return a;
  }
  can(action: string, academyIds?: string[]) {
    try {
      const d = this.read();
      const a = this.account(d);
      if (
        ["role", "admin", "audit", "referral"].includes(action.split(":")[0]) &&
        actionScopes(d, a, action) !== "*"
      )
        return false;
      return allowed(d, a, action, academyIds);
    } catch {
      return false;
    }
  }
  globalCan(action: string) {
    try {
      const db = this.read();
      return actionScopes(db, this.account(db), action) === "*";
    } catch {
      return false;
    }
  }
  private authorize(db: Database, action: string, ids?: string[]) {
    if (
      (["role", "admin", "audit", "referral"].includes(action.split(":")[0]) &&
        actionScopes(db, this.account(db), action) !== "*") ||
      !allowed(db, this.account(db), action, ids)
    )
      throw new DomainError("FORBIDDEN", "没有此操作权限或学院数据范围");
  }
  private ids(row: Row) {
    return Array.isArray(row.academyIds)
      ? (row.academyIds as string[])
      : [row.academyId];
  }
  list(table: TableName) {
    const db = this.read();
    const a = this.account(db);
    const action = `${prefixes[table]}:read`;
    this.authorize(db, action);
    const scope = actionScopes(db, a, action);
    return db.tables[table].filter(
      (r) => scope === "*" || this.ids(r).some((id) => scope.includes(id)),
    );
  }
  private audit(
    db: Database,
    action: string,
    table: string,
    target: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    db.audits.unshift({
      id: uuid(),
      actor: this.account(db).name,
      action,
      table,
      target,
      reason,
      before: JSON.stringify(before),
      after: JSON.stringify(after),
      at: new Date().toISOString(),
      requestId: uuid(),
    });
    db.audits = db.audits.slice(0, 1000);
  }
  private commit(db: Database) {
    db.revision++;
    this.storage.setItem(DATABASE_KEY, JSON.stringify(db));
  }
  private validate(db: Database, table: TableName, row: Row, old?: Row) {
    if (table === "configs" && row.banners) {
      if (!Array.isArray(row.banners) || row.banners.length > 20)
        throw new DomainError("VALIDATION", "轮播图最多20张");
      for (const banner of row.banners) {
        if (
          typeof banner !== "object" ||
          banner === null ||
          !("title" in banner) ||
          typeof banner.title !== "string" ||
          !("to" in banner) ||
          typeof banner.to !== "string" ||
          !("imageUrl" in banner) ||
          typeof banner.imageUrl !== "string" ||
          !banner.title?.trim() ||
          banner.title.length > 80 ||
          !/^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(banner.to) ||
          (banner.enabled !== false && !banner.imageUrl)
        )
          throw new DomainError(
            "VALIDATION",
            "请填写轮播说明、站内路径并选择图片",
          );
      }
    }
    if (!row.name.trim()) throw new DomainError("VALIDATION", "请填写名称");
    if (
      table !== "academies" &&
      !db.tables.academies.some(
        (a) => a.id === row.academyId && a.status !== "停用",
      )
    )
      throw new DomainError("VALIDATION", "请选择有效学院");
    if (
      table === "venues" &&
      row.status === "停用" &&
      db.tables.sessions.some(
        (s) => s.venueId === row.id && s.status === "已发布",
      )
    )
      throw new DomainError("IN_USE", "地点仍有关联发布场次，不可停用");
    if (
      table === "rooms" &&
      (!db.tables.venues.some((v) => v.id === row.venueId) ||
        Number(row.capacity) < 1)
    )
      throw new DomainError("VALIDATION", "请选择有效地点并填写教室容量");
    if (
      table === "configs" &&
      String(row.externalUrl ?? "").trim() &&
      !/^https:\/\//i.test(String(row.externalUrl))
    )
      throw new DomainError("INVALID_URL", "福利外链仅允许有效 HTTPS 地址");
    if (
      table === "levels" &&
      (!Number.isFinite(Number(row.threshold)) || Number(row.threshold) < 0)
    )
      throw new DomainError("INVALID_RULE", "学分门槛必须是非负数");
    if (table === "courses") {
      for (const [key, target] of [
        ["teacherId", "teachers"],
        ["categoryId", "categories"],
        ["venueId", "venues"],
        ["coverId", "media"],
      ] as const) {
        if (
          !db.tables[target].some(
            (r) => r.id === row[key] && r.status !== "停用",
          )
        )
          throw new DomainError(
            "VALIDATION",
            "请完整关联有效教师、分类、地点与封面",
          );
      }
      for (const [key, target] of [
        ["teacherId", "teachers"],
        ["categoryId", "categories"],
        ["coverId", "media"],
      ] as const) {
        if (
          !db.tables[target].some(
            (r) => r.id === row[key] && r.academyId === row.academyId,
          )
        )
          throw new DomainError(
            "ACADEMY_MISMATCH",
            "教师、分类和封面必须在当前学院授权范围内",
          );
      }
      const venue = db.tables.venues.find((v) => v.id === row.venueId);
      if (venue && !this.ids(venue).includes(row.academyId))
        throw new DomainError("ACADEMY_MISMATCH", "地点未关联当前学院");
      if (String(row.description).trim().length < 5)
        throw new DomainError("VALIDATION", "请填写至少5个字的课程介绍");
    }
    if (table === "sessions") {
      const course = db.tables.courses.find((c) => c.id === row.courseId);
      const room = db.tables.rooms.find((r) => r.id === row.roomId);
      if (!course || course.status !== "已发布" || !room)
        throw new DomainError("VALIDATION", "请关联已发布课程和有效教室");
      if (course.academyId !== row.academyId)
        throw new DomainError("VALIDATION", "课程与场次必须属于同一学院");
      const start = Date.parse(
          String(row.startAt).replace(" ", "T") + "+08:00",
        ),
        end = Date.parse(String(row.endAt).replace(" ", "T") + "+08:00"),
        open = Date.parse(
          String(row.registrationStart).replace(" ", "T") + "+08:00",
        ),
        close = Date.parse(
          String(row.registrationEnd).replace(" ", "T") + "+08:00",
        );
      if (
        ![start, end, open, close].every(Number.isFinite) ||
        start >= end ||
        open >= close ||
        close > start
      )
        throw new DomainError(
          "VALIDATION",
          "请检查开课、结束及报名窗口的先后顺序",
        );
      if (
        db.tables.enrollments.filter(
          (e) => e.sessionId === row.id && e.status === "已报名",
        ).length > Number(row.capacity)
      )
        throw new DomainError("CAPACITY", "名额不能小于已报名人数");
      if (
        !Number.isInteger(Number(row.capacity)) ||
        Number(row.capacity) < 1 ||
        Number(row.capacity) > Number(room.capacity)
      )
        throw new DomainError(
          "VALIDATION",
          "名额应为正整数，且不得超过教室容量",
        );
      if (
        db.tables.sessions.some(
          (s) =>
            s.id !== row.id &&
            s.status === "已发布" &&
            (s.roomId === row.roomId || s.teacherId === row.teacherId) &&
            String(s.startAt) < String(row.endAt) &&
            String(s.endAt) > String(row.startAt),
        )
      )
        throw new DomainError("CONFLICT", "教师或教室在此时段已有排课");
      if (
        old &&
        db.tables.enrollments.some(
          (e) => e.sessionId === row.id && e.status === "已报名",
        ) &&
        ["startAt", "endAt", "roomId", "teacherId"].some(
          (key) => old[key] !== row[key],
        ) &&
        !String(row.changeReason ?? "").trim()
      )
        throw new DomainError(
          "REASON_REQUIRED",
          "有学员报名的场次变更必须填写原因",
        );
      row.venueId = room.venueId;
      row.snapshot = `${course.name} / ${room.name} / ${row.startAt}`;
    }
  }
  save(table: TableName, input: Row) {
    if (
      ["members", "enrollments", "makeups", "evaluations", "credits"].includes(
        table,
      )
    )
      throw new DomainError("READ_ONLY", "该记录只能通过专用业务操作修改");
    const db = this.read();
    if (table === "academies") input = { ...input, academyId: input.id };
    const old = db.tables[table].find((r) => r.id === input.id);
    this.authorize(db, `${prefixes[table]}:write`, [
      ...new Set([...this.ids(input), ...(old ? this.ids(old) : [])]),
    ]);
    if (old && old.version !== input.version)
      throw new DomainError(
        "VERSION_CONFLICT",
        "内容已被其他窗口修改，请重新加载后编辑",
      );
    const next = clone(input);
    if (old) next.status = old.status;
    this.validate(db, table, next, old);
    next.version = (old?.version ?? 0) + 1;
    if (
      old &&
      ["courses", "configs"].includes(table) &&
      old.status === "已发布"
    )
      next.status = "待发布修订";
    if (old)
      db.tables[table] = db.tables[table].map((r) =>
        r.id === old.id ? next : r,
      );
    else db.tables[table].unshift(next);
    this.audit(
      db,
      old ? "更新" : "新建",
      table,
      next.id,
      "",
      old ?? null,
      next,
    );
    if (
      table === "sessions" &&
      old &&
      ["startAt", "endAt", "roomId", "teacherId"].some(
        (key) => old[key] !== next[key],
      )
    )
      db.tables.messages.unshift({
        id: uuid(),
        name: "课程变更通知",
        academyId: next.academyId,
        status: "待发送",
        version: 1,
        createdAt: new Date().toISOString(),
        description: String(next.changeReason),
      });
    this.commit(db);
    return next;
  }
  transition(
    table: TableName,
    id: string,
    status: string,
    version: number,
    reason: string,
  ) {
    const db = this.read();
    const row = db.tables[table].find((r) => r.id === id);
    if (!row) throw new DomainError("NOT_FOUND", "记录不存在");
    const action = `${prefixes[table]}:${["courses", "configs"].includes(table) ? "publish" : "write"}`;
    this.authorize(db, action, this.ids(row));
    if (row.version !== version)
      throw new DomainError("VERSION_CONFLICT", "版本已变化，请重新加载");
    if (!reason.trim())
      throw new DomainError("REASON_REQUIRED", "请填写操作原因");
    const statuses: Partial<Record<TableName, string[]>> = {
      academies: ["启用", "停用"],
      venues: ["启用", "停用"],
      rooms: ["启用", "停用"],
      teachers: ["启用", "停用"],
      categories: ["启用", "停用"],
      media: ["启用", "停用"],
      courses: ["已发布", "已下架", "已归档"],
      sessions: ["已发布", "已关闭"],
      makeups: ["已通过", "已驳回"],
      enrollments: ["已取消"],
      credits: ["已冲正"],
      feedback: ["已处理"],
      messages: ["已发送"],
      configs: ["已发布", "回滚"],
      levels: ["已发布", "停用"],
    };
    if (!statuses[table]?.includes(status))
      throw new DomainError("INVALID_STATE", "该状态变更不被允许");
    const before = clone(row);
    if (table === "courses" && status === "已发布") {
      this.validate(db, table, row);
      row.publishedVersion = row.version + 1;
      row.publishedSnapshot = JSON.stringify(row);
    }
    if (table === "configs" && status === "已发布") {
      this.validate(db, table, row);
      row.previousSnapshot = String(row.publishedSnapshot ?? "");
      row.publishedSnapshot = JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !["previousSnapshot", "publishedSnapshot"].includes(key),
          ),
        ),
      );
      row.publishedVersion = row.version + 1;
    }
    if (table === "configs" && status === "回滚") {
      if (!row.previousSnapshot)
        throw new DomainError("NO_HISTORY", "暂无可回滚的发布版本");
      const previous = JSON.parse(String(row.previousSnapshot)) as Row;
      for (const k of [
        "description",
        "serviceText",
        "externalUrl",
        "courseIds",
        "banners",
      ])
        if (k in previous) row[k] = previous[k];
      status = "已发布";
    }
    if (table === "venues" && status === "停用")
      this.validate(db, table, { ...row, status });
    if (table === "sessions" && status === "已发布")
      this.validate(db, table, row, row);
    if (table === "enrollments" && status === "已取消") {
      if (row.attendance !== "未签到")
        throw new DomainError("INVALID_STATE", "已到场记录不可取消报名");
      db.attribution
        .filter((a) => a.enrollmentId === row.id)
        .forEach((a) => (a.valid = false));
    }
    if (table === "makeups") {
      if (row.status !== "待审核")
        throw new DomainError("INVALID_STATE", "该申请已处理");
      if (status === "已通过") {
        const e = db.tables.enrollments.find((e) => e.id === row.enrollmentId);
        if (!e || e.status === "已取消")
          throw new DomainError("INVALID_STATE", "原报名已失效");
        e.attendance = "已完成";
        e.version++;
        this.awardCredit(db, e);
      }
    }
    if (table === "feedback" && status === "已处理") {
      if (!String(row.reply ?? "").trim())
        throw new DomainError("REPLY_REQUIRED", "请先编辑并填写站内回复");
      db.tables.messages.unshift({
        id: uuid(),
        name: "反馈答复",
        academyId: row.academyId,
        status: "待发送",
        version: 1,
        createdAt: new Date().toISOString(),
        description: String(row.reply),
        recipient: String(row.memberId),
      });
    }
    if (table === "credits" && status === "已冲正") {
      if (row.status === "已冲正" || String(row.originalId ?? ""))
        throw new DomainError("INVALID_STATE", "该流水不能重复冲正");
      db.tables.credits.unshift({
        ...row,
        id: uuid(),
        name: "学分冲正",
        amount: -Number(row.amount),
        originalId: row.id,
        status: "已入账",
        version: 1,
      });
    }
    row.status = status;
    row.version++;
    if (table === "messages" && status === "已发送")
      row.delivery = "仅生成本地发送记录，未真实送达";
    this.audit(db, status, table, id, reason, before, row);
    this.commit(db);
  }
  private awardCredit(db: Database, e: Row) {
    if (
      !db.tables.credits.some(
        (c) => c.enrollmentId === e.id && Number(c.amount) > 0,
      )
    ) {
      const session = db.tables.sessions.find((s) => s.id === e.sessionId);
      db.tables.credits.unshift({
        id: uuid(),
        name: "出勤学分",
        academyId: e.academyId,
        status: "已入账",
        version: 1,
        createdAt: new Date().toISOString(),
        memberId: e.memberId,
        enrollmentId: e.id,
        amount: Number(session?.credits ?? 0),
      });
    }
  }
  attendance(id: string, action: "签到" | "签退", reason: string) {
    const db = this.read();
    const e = db.tables.enrollments.find((r) => r.id === id);
    if (!e || e.status !== "已报名")
      throw new DomainError("INVALID_STATE", "没有有效报名");
    this.authorize(db, "teaching:write", [e.academyId]);
    if (!reason.trim())
      throw new DomainError("REASON_REQUIRED", "人工考勤需填写核验原因");
    const before = clone(e);
    if (action === "签退" && e.attendance === "未签到")
      throw new DomainError("INVALID_STATE", "请先完成签到");
    if (e.attendance === "已完成") return;
    e.attendance = action === "签到" ? "已签到" : "已完成";
    if (action === "签退") this.awardCredit(db, e);
    e.version++;
    this.audit(db, action, "enrollments", id, reason, before, e);
    this.commit(db);
  }
  enroll(sessionId: string, memberId: string) {
    const db = this.read();
    const s = db.tables.sessions.find((r) => r.id === sessionId);
    if (!s || s.status !== "已发布")
      throw new DomainError("INVALID_STATE", "请选择已发布场次");
    this.authorize(db, "teaching:write", [s.academyId]);
    if (
      !db.tables.members.some((m) => m.id === memberId && m.status === "启用")
    )
      throw new DomainError("INVALID_MEMBER", "请选择有效会员");
    if (
      db.tables.enrollments.some(
        (e) =>
          e.sessionId === sessionId &&
          e.memberId === memberId &&
          e.status === "已报名",
      )
    )
      throw new DomainError("DUPLICATE", "该学员已报名此场次");
    if (
      db.tables.enrollments.filter(
        (e) => e.sessionId === sessionId && e.status === "已报名",
      ).length >= Number(s.capacity)
    )
      throw new DomainError("FULL", "该场次名额已满");
    const e: Row = {
      id: uuid(),
      name: `${db.tables.members.find((m) => m.id === memberId)!.name} · ${s.name}`,
      academyId: s.academyId,
      status: "已报名",
      version: 1,
      createdAt: new Date().toISOString(),
      memberId,
      sessionId,
      courseId: s.courseId,
      attendance: "未签到",
      reviewed: false,
    };
    db.tables.enrollments.unshift(e);
    this.audit(db, "代报名", "enrollments", e.id, "后台代报名", null, e);
    this.commit(db);
  }
  correctParent(id: string, parentId: string, reason: string, version: number) {
    const db = this.read();
    this.authorize(db, "referral:correct");
    if (actionScopes(db, this.account(db), "referral:correct") !== "*")
      throw new DomainError("FORBIDDEN", "更正关系需全局增长权限");
    validateParent(db.tables.members, id, parentId);
    if (!reason.trim())
      throw new DomainError("REASON_REQUIRED", "请填写更正原因");
    const m = db.tables.members.find((m) => m.id === id)!;
    if (m.version !== version)
      throw new DomainError("VERSION_CONFLICT", "关系已被更正，请重新预览");
    const before = clone(m);
    const affected = descendants(db.tables.members, id).length + 1;
    m.inviterId = parentId;
    m.version++;
    this.audit(
      db,
      "更正上游",
      "members",
      id,
      reason,
      { member: before, affected },
      { member: m, affected, historicalAttribution: "保持不变" },
    );
    this.commit(db);
  }
  saveRole(role: Role, reason: string, revision: number) {
    const db = this.read();
    this.authorize(db, "role:grant");
    if (db.revision !== revision)
      throw new DomainError("VERSION_CONFLICT", "授权版本已变化，请重新加载");
    if (!reason.trim())
      throw new DomainError("REASON_REQUIRED", "请填写授权原因");
    const me = this.account(db);
    if (me.roleIds.includes(role.id))
      throw new DomainError(
        "SELF_GRANT",
        "不能修改当前账号持有的角色，请使用其他授权管理员",
      );
    for (const g of role.grants) {
      const scope = actionScopes(db, me, g.action);
      if (
        scope !== "*" &&
        (g.scope === "*" || g.scope.some((id) => !scope.includes(id)))
      )
        throw new DomainError(
          "GRANT_EXCEEDS_SCOPE",
          "不能授予超出自身范围的权限",
        );
    }
    const old = db.roles.find((r) => r.id === role.id);
    if (
      !role.name.trim() ||
      role.grants.some(
        (g) =>
          !g.action ||
          (g.scope !== "*" &&
            g.scope.some(
              (id) => !db.tables.academies.some((a) => a.id === id),
            )),
      )
    )
      throw new DomainError("VALIDATION", "请检查角色与学院范围");
    if (old) db.roles = db.roles.map((r) => (r.id === role.id ? role : r));
    else db.roles.push(role);
    if (
      !db.accounts.some(
        (a) =>
          a.active &&
          db.roles.some(
            (r) =>
              a.roleIds.includes(r.id) &&
              r.grants.some((g) => g.action === "*" && g.scope === "*"),
          ),
      )
    )
      throw new DomainError("LAST_ADMIN", "必须保留最后一个可用超级管理员");
    this.audit(db, "角色授权", "roles", role.id, reason, old ?? null, role);
    db.securityVersion++;
    this.commit(db);
  }
  saveAccount(account: AdminAccount, reason: string) {
    const db = this.read();
    this.authorize(db, "admin:write");
    const me = this.account(db);
    if (me.id === account.id)
      throw new DomainError("SELF_GRANT", "不能修改自身账号权限");
    const before = db.accounts.find((a) => a.id === account.id);
    if (
      !account.username.trim() ||
      !account.name.trim() ||
      !account.roleIds.length ||
      account.roleIds.some((id) => !db.roles.some((r) => r.id === id))
    )
      throw new DomainError("VALIDATION", "请填写有效账号、名称及角色");
    if (
      db.accounts.some(
        (a) => a.username === account.username && a.id !== account.id,
      )
    )
      throw new DomainError("DUPLICATE", "账号已存在");
    const next = db.accounts.filter((a) => a.id !== account.id).concat(account);
    if (
      !next.some(
        (a) =>
          a.active &&
          db.roles.some(
            (r) =>
              a.roleIds.includes(r.id) &&
              r.grants.some((g) => g.action === "*" && g.scope === "*"),
          ),
      )
    )
      throw new DomainError("LAST_ADMIN", "必须保留最后一个可用超级管理员");
    db.accounts = next;
    this.audit(
      db,
      "账号授权",
      "accounts",
      account.id,
      reason,
      before ?? null,
      account,
    );
    db.securityVersion++;
    this.commit(db);
  }
  auditEntries() {
    const db = this.read();
    this.authorize(db, "audit:read");
    return db.audits;
  }
  systemData() {
    const db = this.read();
    this.authorize(db, "role:read");
    return { roles: db.roles, accounts: db.accounts, revision: db.revision };
  }
  exportList() {
    const db = this.read();
    this.authorize(db, "export:read");
    return db.exports.filter((j) => j.owner === this.account(db).id);
  }
  createExport(table: TableName | "audit", ids: string[], filters: string) {
    const db = this.read();
    this.authorize(db, "export:create");
    let rows: Row[];
    if (table === "audit") {
      this.authorize(db, "audit:export");
      rows = this.auditEntries()
        .filter((a) => ids.includes(a.id))
        .map((a) => ({
          id: a.id,
          name: a.action,
          academyId: "",
          status: a.target,
          version: 1,
          createdAt: a.at,
        }));
    } else rows = this.list(table).filter((r) => ids.includes(r.id));
    const job = {
      id: uuid(),
      owner: this.account(db).id,
      table,
      status: "ready" as const,
      count: rows.length,
      expiresAt: Date.now() + 600000,
      filters,
      rows,
      scopeVersion: db.securityVersion,
    };
    db.exports.unshift(job);
    this.audit(db, "创建导出", table, job.id, "导出当前筛选可见记录", null, {
      count: rows.length,
    });
    this.commit(db);
    return job.id;
  }
  downloadExport(id: string) {
    const db = this.read();
    this.authorize(db, "export:download");
    const job = db.exports.find(
      (j) => j.id === id && j.owner === this.account(db).id,
    );
    if (
      !job ||
      job.expiresAt < Date.now() ||
      job.scopeVersion !== db.securityVersion
    )
      throw new DomainError(
        "EXPORT_EXPIRED",
        "导出已过期或权限变化，请重新创建",
      );
    if (job.table !== "audit") {
      const visible = new Set(this.list(job.table).map((r) => r.id));
      if (job.rows.some((r) => !visible.has(r.id)))
        throw new DomainError("FORBIDDEN", "导出数据范围已变化");
    } else this.authorize(db, "audit:export");
    this.audit(db, "下载导出", "exports", id, "下载重新鉴权", null, {
      count: job.count,
    });
    this.commit(db);
    return job.rows;
  }
}
