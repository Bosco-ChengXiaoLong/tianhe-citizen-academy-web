import { chromium, request } from "playwright";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
const root = new URL("../../", import.meta.url),
  adminRoot = new URL("../", import.meta.url),
  h5Root = new URL("../../h5/", import.meta.url);
const state = JSON.parse(
  await readFile(new URL("server/.local/integration-state.json", root), "utf8"),
);
const fixtures = JSON.parse(
  await readFile(new URL("server/.local/growth-fixtures.json", root), "utf8"),
);
assert.equal(state.database, "qingmu_academy_dev");
assert.equal(fixtures.base, "http://127.0.0.1:18082");
const api = await request.newContext({ baseURL: fixtures.base });
let adminToken;
async function call(path, body, token = adminToken, method) {
  const r = await api.fetch(path, {
    method: method ?? (body ? "POST" : "GET"),
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await r.json();
  assert.equal(
    r.status(),
    200,
    `${path.split("?")[0]}: ${r.status()} ${json.code}`,
  );
  return json.data ?? json;
}
const prefix = "/api/admin/v1";
adminToken = (
  await call(
    prefix + "/auth/login",
    { username: state.adminUsername, password: state.adminPassword },
    null,
  )
).accessToken;
const servers = [adminRoot, h5Root].map((cwd, i) =>
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(5204 + i),
      "--strictPort",
    ],
    {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        VITE_DATA_SOURCE: "api",
        VITE_API_BASE_URL: i ? "/api" : "/api/admin/v1",
        API_PROXY_TARGET: fixtures.base,
      },
      stdio: "ignore",
    },
  ),
);
const accessibility = [],
  checks = [],
  out = new URL("../output/playwright/media-member-real/", import.meta.url);
await mkdir(out, { recursive: true });
async function scan(page, name) {
  await page.waitForFunction(
    () => document.querySelectorAll(".el-message").length === 0,
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  accessibility.push({ name, violations: result.violations.length });
  assert.deepEqual(
    result.violations,
    [],
    JSON.stringify(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
}
let browser;
try {
  for (const port of [5204, 5205])
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
      } catch {}
      if (i === 99) throw Error("Vite startup timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const admin = await context.newPage(),
    h5 = await context.newPage(),
    errors = [];
  for (const p of [admin, h5]) p.on("pageerror", (e) => errors.push(e.message));
  await h5.setViewportSize({ width: 375, height: 812 });
  const bundle = {
    accessToken: adminToken,
    refreshToken: "not-used-in-short-test",
    expiresAt: Date.now() + 600000,
    expiresIn: 600,
    tokenType: "Bearer",
  };
  await admin.addInitScript(
    (b) => sessionStorage.setItem("qingmu-admin-api-tokens", JSON.stringify(b)),
    bundle,
  );
  const suffix = randomUUID().slice(0, 8),
    png = fileURLToPath(new URL("h5/src/assets/images/calligraphy.png", root));
  let uploads = 0;
  admin.on("request", (r) => {
    if (
      r.method() === "POST" &&
      new URL(r.url()).pathname === "/api/admin/v1/media"
    )
      uploads++;
  });
  async function createMedia(name) {
    await admin.goto("http://127.0.0.1:5204/#/media");
    await admin.getByRole("button", { name: "新建素材", exact: true }).click();
    const d = admin.getByRole("dialog", { name: "新建素材管理", exact: true });
    await d.locator("input[type=file]").setInputFiles(png);
    await d.locator(".media-preview img").waitFor();
    await d.getByRole("textbox", { name: "名称", exact: true }).fill(name);
    await d.getByRole("button", { name: "保存修改", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    return (await call(prefix + "/media?keyword=" + encodeURIComponent(name)))
      .items[0];
  }
  const name = "素材回归·" + suffix,
    asset = await createMedia(name);
  assert(asset);
  const before = uploads;
  let row = admin.getByRole("row").filter({ hasText: name });
  assert.equal(
    await row.getByRole("button", { name: "停用", exact: true }).count(),
    0,
  );
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  let d = admin.getByRole("dialog", { name: "编辑素材管理", exact: true });
  assert.equal(await d.locator("input[type=file]").count(), 0);
  await d
    .getByRole("textbox", { name: "名称", exact: true })
    .fill(name + "已编辑");
  const update = admin.waitForResponse(
    (r) =>
      r.request().method() === "PUT" && r.url().endsWith("/media/" + asset.id),
  );
  await d.getByRole("button", { name: "保存修改", exact: true }).click();
  assert.equal((await update).status(), 200);
  await d.waitFor({ state: "hidden" });
  assert.equal(uploads, before);
  checks.push("编辑素材只PUT原ID、不新增文件，列表无停用按钮");
  row = admin.getByRole("row").filter({ hasText: name + "已编辑" });
  await row.getByRole("button", { name: "删除", exact: true }).click();
  d = admin.getByRole("dialog", { name: "删除", exact: true });
  await d
    .getByRole("textbox", { name: "操作原因", exact: true })
    .fill("未引用素材删除回归");
  await d.getByRole("button", { name: "删除", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  assert.equal((await api.get("/api/media/" + asset.id)).status(), 404);
  checks.push("删除使用独立确认字段成功，公开资源404");
  const usedName = "引用素材·" + suffix,
    used = await createMedia(usedName);
  await call(prefix + "/resources/academies", {
    name: "引用学院·" + suffix,
    enabled: true,
    coverUrl: "/api/media/" + used.id,
    reason: "本机引用保护回归",
  });
  const uses = await call(prefix + "/media/" + used.id + "/references");
  assert(uses.items.some((u) => u.name.includes("引用学院·" + suffix)));
  row = admin.getByRole("row").filter({ hasText: usedName });
  await row.getByRole("button", { name: "删除", exact: true }).click();
  d = admin.getByRole("dialog", { name: "删除", exact: true });
  await d.getByText("学院：引用学院·" + suffix, { exact: true }).waitFor();
  await d
    .getByRole("textbox", { name: "操作原因", exact: true })
    .fill("应被引用保护拒绝");
  const blocked = admin.waitForResponse(
    (r) =>
      r.url().endsWith("/media/" + used.id + "/delete") &&
      r.request().method() === "POST",
  );
  await d.getByRole("button", { name: "删除", exact: true }).click();
  assert.equal((await blocked).status(), 409);
  await d.getByText(/素材不能删除或停用/).waitFor();
  assert.equal((await api.get("/api/media/" + used.id)).status(), 200);
  await admin.screenshot({
    path: fileURLToPath(new URL("reference-block.png", out)),
    fullPage: true,
  });
  checks.push("显示具体引用学院，删除409且原图保持公开可读");
  await scan(admin, "素材引用删除提示");
  await h5.goto("http://127.0.0.1:5205/api/media/" + used.id);
  await h5.locator("img").evaluate((img) => img.decode());
  assert(await h5.locator("img").evaluate((img) => img.naturalWidth > 0));
  const student = "MEDIA_" + suffix.toUpperCase(),
    password = "Media!" + suffix + "Aa9";
  const member = await call(prefix + "/members", {
    displayName: "资料回归·" + suffix,
    studentNo: student,
    phone: "13800000000",
    active: true,
    version: 0,
    password,
    reason: "本机联系资料回归",
  });
  assert.equal(member.phone, "13800000000");
  await admin.goto("http://127.0.0.1:5204/#/members?q=" + student);
  row = admin.getByRole("row").filter({ hasText: student });
  await row.getByText("13800000000", { exact: true }).waitFor();
  assert.match(await row.innerText(), /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  assert(!/T\d{2}:/.test(await row.innerText()));
  await admin.screenshot({
    path: fileURLToPath(new URL("member-phone-time.png", out)),
    fullPage: true,
  });
  await scan(admin, "学员手机号与时间列表");
  const login = await call(
      "/api/auth/student-login",
      { studentNumber: student, password },
      null,
    ),
    me = await call("/api/me", null, login.accessToken);
  assert.equal(me.contactPhoneMasked, "138****0000");
  assert.equal(me.phoneMasked, null);
  assert(!("phone" in me));
  await h5.addInitScript(
    (b) => sessionStorage.setItem("qingmu-h5-api-tokens", JSON.stringify(b)),
    { ...login, expiresAt: Date.now() + 600000 },
  );
  await h5.goto("http://127.0.0.1:5205/#/settings");
  await h5
    .getByText("联系手机号：138****0000（教务联系资料）", { exact: true })
    .waitFor();
  await h5.screenshot({
    path: fileURLToPath(new URL("h5-contact.png", out)),
    fullPage: true,
  });
  checks.push(
    "后台展示联系手机号及北京时间，H5只展示脱敏联系资料，不产生已验证身份",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("report.json", out),
    JSON.stringify(
      {
        checks,
        accessibility,
        pageErrors: errors,
        environment:
          "Real Java8/MySQL/Redis localhost; no business API fixtures",
        remoteDeployed: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  for (const page of browser?.contexts()[0]?.pages() ?? [])
    await page
      .screenshot({
        path: fileURLToPath(
          new URL(
            page.url().includes("5204")
              ? "failure-admin.png"
              : "failure-h5.png",
            out,
          ),
        ),
        fullPage: true,
      })
      .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await api.dispose();
  for (const server of servers) server.kill();
}
