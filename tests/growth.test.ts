import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Repository } from "../src/services/repository";
import { growth } from "../src/services/growth";
import type { Session } from "../src/types";
const state = vi.hoisted(() => ({ repo: undefined as unknown as Repository }));
vi.mock("../src/services/data-source", () => ({ isApi: false }));
vi.mock("../src/services/client", () => ({
  get repository() {
    return state.repo;
  },
}));
let session: Session, storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  const adapter = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
  };
  vi.stubGlobal("localStorage", adapter);
  session = {
    accountId: "super",
    expiresAt: Date.now() + 600000,
    securityVersion: 1,
  };
  state.repo = new Repository(adapter, () => session);
  state.repo.read();
});
afterEach(() => vi.unstubAllGlobals());
it("overview-only analyst can view scoped aggregate without member read", async () => {
  session.accountId = "analyst";
  expect(state.repo.can("member:read")).toBe(false);
  const data = await growth.overview();
  expect(data.cumulativeMembers).toBe(36);
  expect(data.trend.length).toBe(30);
});
it("mock historical registration is not reassigned by correcting the current tree", async () => {
  const before = await growth.report({ inviterId: "demo-member" });
  const member = state.repo
    .read()
    .tables.members.find((m) => m.id === "member-2")!;
  state.repo.correctParent(
    member.id,
    "member-3",
    "核验来源后更正",
    member.version,
  );
  expect(
    (await growth.report({ inviterId: "demo-member" })).registrations,
  ).toBe(before.registrations);
  expect((await growth.report({ channel: "qrcode" })).registrations).toBe(0);
  expect(
    (await growth.referrers({ channel: "qrcode" })).items.every(
      (r) => r.registrations === 0,
    ),
  ).toBe(true);
});
it("notes have their own optimistic version and cannot overwrite a newer draft", async () => {
  const saved = await growth.note(
    "demo-member",
    { note: "仅后台教务可见", version: 0 },
    "核验",
  );
  expect(saved.version).toBe(1);
  await expect(
    growth.note("demo-member", { note: "旧窗口", version: 0 }, "旧窗口提交"),
  ).rejects.toThrow("备注已更新");
  expect((await growth.care("demo-member")).note).toBe("仅后台教务可见");
  expect(state.repo.read().tables.members[0]!.version).toBe(1);
});
it("duplicate follow-up submission creates one record and completed work cannot be repeated", async () => {
  const item = {
    id: "test-followup",
    content: "联系确认上课",
    nextContactDate: "2026-11-02",
  };
  await growth.append("demo-member", item);
  await growth.append("demo-member", item);
  const records = await growth.followups("demo-member");
  expect(records.total).toBe(1);
  await growth.complete("demo-member", records.items[0]!);
  await expect(
    growth.complete("demo-member", records.items[0]!),
  ).rejects.toThrow();
  expect((await growth.followups("demo-member")).items[0]!.status).toBe(
    "completed",
  );
});
