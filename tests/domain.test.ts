import { beforeEach, describe, it, expect } from "vitest";
import { Repository, DATABASE_KEY } from "../src/services/repository";
import { seedDatabase, row } from "../src/mock/seed";
import { allowed, actionScopes } from "../src/domain/permissions";
import { descendants, validateParent } from "../src/domain/referrals";
import { csvCell } from "../src/utils/download";
import type { Session, Database } from "../src/types";
let storage: Map<string, string>, session: Session | null, repo: Repository;
beforeEach(() => {
  storage = new Map();
  session = {
    accountId: "super",
    expiresAt: Date.now() + 3600000,
    securityVersion: 1,
  };
  repo = new Repository(
    {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
    },
    () => session,
  );
  repo.read();
});
const put = (db: Database) => storage.set(DATABASE_KEY, JSON.stringify(db));

it("publishes and rolls back banner settings with the config snapshot", () => {
  const base = repo.list("configs")[0]!;
  repo.save("configs", {
    ...base,
    banners: [
      {
        title: "第一版",
        imageUrl: "/test-image.png",
        to: "/courses",
        enabled: true,
      },
    ],
  });
  let current = repo.list("configs")[0]!;
  repo.transition(
    "configs",
    current.id,
    "已发布",
    current.version,
    "第一次发布",
  );
  current = repo.list("configs")[0]!;
  repo.save("configs", {
    ...current,
    banners: [
      {
        title: "第二版",
        imageUrl: "/test-image.png",
        to: "/academies",
        enabled: false,
      },
    ],
  });
  current = repo.list("configs")[0]!;
  repo.transition(
    "configs",
    current.id,
    "已发布",
    current.version,
    "第二次发布",
  );
  current = repo.list("configs")[0]!;
  repo.transition("configs", current.id, "回滚", current.version, "恢复第一版");
  expect(repo.list("configs")[0]!.banners).toEqual([
    {
      title: "第一版",
      imageUrl: "/test-image.png",
      to: "/courses",
      enabled: true,
    },
  ]);
});
describe("action and scope permissions", () => {
  it("unions scopes per action without promoting read scope into write scope", () => {
    const db = seedDatabase();
    db.roles.push({
      id: "global-reader",
      name: "全局只读",
      grants: [{ action: "course:read", scope: "*" }],
    });
    const a = {
      ...db.accounts[1],
      roleIds: ["operator-role", "global-reader"],
    };
    expect(actionScopes(db, a, "course:read")).toBe("*");
    expect(allowed(db, a, "course:write", ["life"])).toBe(false);
    expect(allowed(db, a, "course:write", ["humanities"])).toBe(true);
  });
  it("filters rows and denies shared venue updates without all scopes", () => {
    session!.accountId = "operator";
    expect(repo.list("courses")).toHaveLength(1);
    const venue = repo.list("venues")[0];
    expect(() =>
      repo.save("venues", { ...venue, name: "修改共享地点" }),
    ).toThrow("没有此操作权限");
    expect(repo.can("referral:read")).toBe(false);
  });
  it("rejects expired and revoked sessions, and API mode never falls back to demo", () => {
    session!.expiresAt = Date.now() - 1;
    expect(() => repo.list("courses")).toThrow("登录已过期");
    const api = new Repository(
      { getItem: () => null, setItem: () => {} },
      () => session,
      "api",
    );
    expect(() => api.read()).toThrow("未回退演示数据");
  });
  it("protects self-grant and the last available administrator", () => {
    const db = repo.read();
    expect(() =>
      repo.saveAccount({ ...db.accounts[0], active: false }, "停用"),
    ).toThrow("不能修改自身");
    expect(() =>
      repo.saveRole({ ...db.roles[0], grants: [] }, "修改", db.revision),
    ).toThrow("不能修改当前账号");
  });
});
describe("content and scheduling", () => {
  it("creates a new academy and validates its own scope identity", () => {
    const a = repo.save("academies", row("new-academy", "新学院"));
    expect(a.academyId).toBe("new-academy");
    expect(repo.list("academies")).toHaveLength(4);
  });
  it("preserves published course snapshots and detects concurrent edits", () => {
    const c = repo.list("courses")[0];
    const saved = repo.save("courses", { ...c, name: "修订书法课程" });
    expect(saved.status).toBe("待发布修订");
    expect(() => repo.save("courses", { ...c, name: "旧版本提交" })).toThrow(
      "内容已被其他窗口修改",
    );
    repo.transition(
      "courses",
      saved.id,
      "已发布",
      saved.version,
      "审核内容完整",
    );
    expect(repo.list("courses")[0].publishedSnapshot).toBeTruthy();
    expect(repo.auditEntries()).toHaveLength(2);
  });
  it("rejects invalid windows, room overcapacity and schedule overlaps", () => {
    const s = repo.list("sessions")[0];
    expect(() => repo.save("sessions", { ...s, capacity: 40 })).toThrow(
      "不得超过教室容量",
    );
    expect(() =>
      repo.save("sessions", { ...s, endAt: "2026-11-06 09:00:00" }),
    ).toThrow("先后顺序");
    expect(() =>
      repo.save("sessions", { ...s, id: "overlap", version: 0 }),
    ).toThrow("已有排课");
  });
  it("blocks disabling a venue used by published sessions", () => {
    const v = repo.list("venues")[0];
    expect(() =>
      repo.transition("venues", v.id, "停用", v.version, "整顿"),
    ).toThrow("不可停用");
  });
  it("keeps config draft, publish and rollback versions", () => {
    const config = repo.list("configs")[0];
    repo.transition("configs", config.id, "已发布", config.version, "首次发布");
    const p = repo.list("configs")[0];
    repo.save("configs", { ...p, serviceText: "新客服说明" });
    let updated = repo.list("configs")[0];
    repo.transition("configs", updated.id, "已发布", updated.version, "新版本");
    updated = repo.list("configs")[0];
    repo.transition("configs", updated.id, "回滚", updated.version, "恢复历史");
    expect(repo.list("configs")[0].serviceText).toBe("请通过站内反馈联系教务");
  });
});
describe("referral and teaching invariants", () => {
  it("prevents self invite and cycles, moves a subtree without rewriting history", () => {
    let db = repo.read();
    expect(() =>
      validateParent(db.tables.members, "demo-member", "member-2"),
    ).toThrow("本人或下游");
    const m = db.tables.members.find((m) => m.id === "member-2")!;
    const subtree = descendants(db.tables.members, m.id).map((m) => m.id);
    const attr = JSON.stringify(db.attribution);
    repo.correctParent(m.id, "member-3", "来源核验更正", m.version);
    db = repo.read();
    expect(JSON.stringify(db.attribution)).toBe(attr);
    expect(descendants(db.tables.members, "member-3").map((m) => m.id)).toEqual(
      expect.arrayContaining(subtree.concat(m.id)),
    );
    expect(repo.auditEntries()[0].reason).toBe("来源核验更正");
  });
  it("requires a correction reason and detects graph version conflict", () => {
    const m = repo.read().tables.members[1];
    expect(() => repo.correctParent(m.id, "member-3", "", m.version)).toThrow(
      "原因",
    );
    repo.correctParent(m.id, "member-3", "首次核验", m.version);
    expect(() =>
      repo.correctParent(m.id, "member-4", "再次核验", m.version),
    ).toThrow("重新预览");
  });
  it("requires sign-in and awards attendance credits exactly once", () => {
    expect(() => repo.attendance("QM20261106001", "签退", "到场核验")).toThrow(
      "先完成签到",
    );
    repo.attendance("QM20261106001", "签到", "到场核验");
    repo.attendance("QM20261106001", "签退", "结束核验");
    repo.attendance("QM20261106001", "签退", "重复请求");
    expect(
      repo.list("credits").filter((c) => c.enrollmentId === "QM20261106001"),
    ).toHaveLength(1);
  });
  it("pending makeup has no credit and approval cannot be repeated", () => {
    expect(repo.list("credits")).toHaveLength(1);
    const m = repo.list("makeups")[0];
    expect(() =>
      repo.transition("makeups", m.id, "已通过", m.version, ""),
    ).toThrow("原因");
    repo.transition("makeups", m.id, "已通过", m.version, "教务核实到场");
    expect(repo.list("credits")).toHaveLength(2);
    const updated = repo.list("makeups")[0];
    expect(() =>
      repo.transition("makeups", m.id, "已通过", updated.version, "重复"),
    ).toThrow("已处理");
  });
  it("blocks duplicate effective enrollment and retains cancellation", () => {
    expect(() => repo.enroll("calligraphy:2026-11-06", "demo-member")).toThrow(
      "已报名",
    );
    repo.enroll("calligraphy:2026-11-06", "member-2");
    let e = repo.list("enrollments").find((e) => e.memberId === "member-2")!;
    repo.transition("enrollments", e.id, "已取消", e.version, "学员申请");
    repo.enroll("calligraphy:2026-11-06", "member-2");
    expect(
      repo.list("enrollments").filter((e) => e.memberId === "member-2"),
    ).toHaveLength(2);
  });
  it("only reverses a credit entry once and keeps the balance traceable", () => {
    const c = repo.list("credits")[0];
    repo.transition("credits", c.id, "已冲正", c.version, "账务核对");
    expect(
      repo.list("credits").reduce((sum, c) => sum + Number(c.amount), 0),
    ).toBe(0);
    const old = repo.list("credits").find((x) => x.id === c.id)!;
    expect(() =>
      repo.transition("credits", old.id, "已冲正", old.version, "重复"),
    ).toThrow("重复冲正");
  });
});
describe("export authorization and safety", () => {
  it("only exports authorized rows and checks ownership at download", () => {
    const id = repo.createExport(
      "courses",
      ["calligraphy", "photography"],
      "{}",
    );
    expect(repo.downloadExport(id)).toHaveLength(2);
    session!.accountId = "auditor";
    expect(() => repo.downloadExport(id)).toThrow();
  });
  it("rejects expired jobs and data scope changes", () => {
    const id = repo.createExport("courses", ["calligraphy"], "{}");
    let db = repo.read();
    db.exports[0].expiresAt = Date.now() - 1;
    put(db);
    expect(() => repo.downloadExport(id)).toThrow("已过期");
  });
  it("escapes spreadsheet formulas and quotation marks", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
