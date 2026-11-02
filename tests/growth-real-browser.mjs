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
  out = new URL("../output/playwright/growth-real/", import.meta.url);
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
  const visitStart = await call(
    prefix + "/growth/report?inviterId=" + fixtures.referrer.id,
  );
  await h5.goto(
    `http://127.0.0.1:5205/#/courses?invite=${fixtures.invite.token}&invitation=${fixtures.invite.invitationId}&channel=qrcode`,
  );
  await h5
    .getByRole("button", { name: "同意邀请访问统计", exact: true })
    .waitFor();
  assert.equal(
    (await call(prefix + "/growth/report?inviterId=" + fixtures.referrer.id))
      .visits,
    visitStart.visits,
  );
  await h5
    .getByRole("button", { name: "同意邀请访问统计", exact: true })
    .click();
  await h5.waitForFunction(
    () =>
      !!JSON.parse(
        sessionStorage.getItem("qingmu-invitation-candidate") ?? "null",
      )?.visitId,
  );
  await h5
    .getByRole("button", { name: "出示注册来源凭据", exact: true })
    .click();
  const source = await h5.locator(".invitation-source__credential").innerText();
  assert(source.includes("visit="));
  const visited = await call(
    prefix + "/growth/report?inviterId=" + fixtures.referrer.id,
  );
  assert.equal(visited.visits, visitStart.visits + 1);
  checks.push("真实H5邀请落地，未同意不采集，同意后服务端确认访问与注册凭据");
  const suffix = randomUUID().slice(0, 8).toUpperCase(),
    student = "BROWSER_" + suffix,
    password = "Browser!" + suffix + "Aa9";
  await admin.goto("http://127.0.0.1:5204/#/members");
  await admin.getByRole("heading", { name: "学员管理", exact: true }).waitFor();
  await admin.getByRole("button", { name: "新建学员", exact: true }).click();
  const dialog = admin.getByRole("dialog", { name: "新建学员", exact: true });
  await dialog
    .getByRole("textbox", { name: "学员姓名", exact: true })
    .fill("浏览器闭环·" + suffix);
  await dialog
    .getByRole("textbox", { name: "学员学号", exact: true })
    .fill(student);
  await dialog.getByLabel("学员账户口令", { exact: true }).fill(password);
  await dialog
    .getByRole("textbox", { name: "邀请来源凭据", exact: true })
    .fill(source);
  await dialog
    .getByRole("textbox", { name: "学员操作原因", exact: true })
    .fill("本机三端闭环联调");
  await dialog.getByRole("button", { name: "保存学员", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const drawer = admin.getByRole("dialog", {
    name: "学员详情与教务跟进",
    exact: true,
  });
  await drawer.getByRole("heading", { name: new RegExp(suffix) }).waitFor();
  const member = (await call(prefix + "/members?keyword=" + student)).items[0];
  assert(member);
  const after = await call(
    prefix + "/growth/report?inviterId=" + fixtures.referrer.id,
  );
  assert.equal(after.registrations, visited.registrations + 1);
  assert.equal(after.convertedVisitors, visited.convertedVisitors + 1);
  checks.push("后台粘贴H5来源建档，真实注册和访问转化同步增长");
  await drawer
    .getByRole("textbox", { name: "内部备注", exact: true })
    .fill("内部测试备注：只对授权教务可见");
  await drawer
    .getByRole("textbox", { name: "备注修改说明", exact: true })
    .fill("验证三端权限边界");
  const noteResponse = admin.waitForResponse(
    (r) =>
      r.url().includes(`/members/${member.id}/care`) &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );
  await drawer
    .getByRole("button", { name: "保存内部备注", exact: true })
    .click();
  await noteResponse;
  assert.equal(
    (await call(prefix + `/members/${member.id}/care`)).note,
    "内部测试备注：只对授权教务可见",
  );
  await drawer
    .getByRole("textbox", { name: "跟进内容", exact: true })
    .fill("已联系，请下周确认课程");
  await drawer
    .locator("#followup-date")
    .fill(
      new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    );
  await drawer.locator("#followup-date").press("Tab");
  const appendResponse = admin.waitForResponse(
    (r) =>
      r.url().includes(`/members/${member.id}/followups`) &&
      r.request().method() === "POST",
  );
  await drawer.getByRole("button", { name: "追加跟进", exact: true }).click();
  const appended = await appendResponse;
  const appendBody = await appended.json();
  assert.equal(appended.status(), 200);
  assert.equal(appendBody.code, "OK", appendBody.message);
  assert.equal(
    (await call(prefix + `/members/${member.id}/followups`)).items[0].content,
    "已联系，请下周确认课程",
  );

  await drawer
    .getByText("已联系，请下周确认课程", { exact: true })
    .scrollIntoViewIfNeeded();
  checks.push("内部备注持久化，跟进追加后回显记录人和内容");
  await scan(admin, "学员备注与跟进");
  await drawer.locator(".el-drawer__close-btn").click();
  await admin.goto(
    "http://127.0.0.1:5204/?detail-refresh=1#/members?member=" + member.id,
  );
  await admin.getByRole("textbox", { name: "内部备注", exact: true }).waitFor();
  assert.equal(
    await admin
      .getByRole("textbox", { name: "内部备注", exact: true })
      .inputValue(),
    "内部测试备注：只对授权教务可见",
  );
  await drawer.locator(".el-drawer__close-btn").click();
  await admin.goto("http://127.0.0.1:5204/?dashboard=1#/overview");
  await admin
    .getByRole("heading", { name: "新增学员与活跃趋势", exact: true })
    .waitFor();
  await admin.locator(".trend-chart__canvas canvas").first().waitFor();
  await admin
    .getByRole("button", { name: "查看图表数据", exact: true })
    .first()
    .click();
  await admin.getByRole("region", { name: "新增学员与活跃趋势明细" }).waitFor();
  await admin.screenshot({
    path: fileURLToPath(new URL("overview.png", out)),
    fullPage: true,
  });
  checks.push("首页折线图、可访问数据表、邀请漏斗与待办从真实SQL读取");
  await scan(admin, "真实运营总览");
  await admin.goto(
    "http://127.0.0.1:5204/?referrer=1#/referrals?member=" +
      fixtures.referrer.id,
  );
  await admin
    .getByRole("heading", { name: "该推荐人的访问与注册趋势", exact: true })
    .waitFor();
  await admin.getByText("浏览器闭环·" + suffix, { exact: true }).waitFor();
  await admin.getByRole("tab", { name: "关系结构", exact: true }).click();
  await admin.locator("details summary").first().click();
  await admin
    .locator("details")
    .first()
    .locator("summary")
    .filter({ hasText: "浏览器闭环·" + suffix })
    .waitFor();
  await admin.getByRole("tab", { name: "历史归因", exact: true }).click();
  await admin.getByText("浏览器闭环·" + suffix, { exact: true }).waitFor();
  await admin.screenshot({
    path: fileURLToPath(new URL("referrer.png", out)),
    fullPage: true,
  });
  checks.push("个人贡献、被邀请名单、按需展开关系与历史归因互相一致");
  await scan(admin, "推荐人工作台");
  await h5.goto("http://127.0.0.1:5205/?login-test=1#/feedback");
  await h5.getByRole("link", { name: "使用账号登录", exact: true }).click();
  await h5.getByLabel("学号", { exact: true }).fill(student);
  await h5.getByLabel("账户口令", { exact: true }).fill(password);
  await h5.getByRole("checkbox").check();
  await h5.getByRole("button", { name: "登录并继续", exact: true }).click();
  await h5.getByRole("heading", { name: "帮助与反馈", exact: true }).waitFor();
  const h5Token = await h5.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("qingmu-h5-api-tokens")).accessToken,
  );
  const me = await call("/api/me", null, h5Token);
  assert(!("note" in me));
  const png = fileURLToPath(
    new URL("h5/src/assets/images/calligraphy.png", root),
  );
  await h5.locator("input[type=file]").setInputFiles(png);
  await h5.locator(".attachment__preview img").waitFor();
  await h5.waitForFunction(
    () => !document.querySelector("input[type=file]").disabled,
  );
  await h5.locator("input[type=file]").setInputFiles(png);
  await h5.waitForFunction(
    () =>
      document.querySelectorAll(".attachment__preview img").length === 2 &&
      !document.querySelector("input[type=file]").disabled,
  );
  const imageInfo = await h5
    .locator(".attachment__preview img")
    .evaluateAll(async (imgs) => {
      await Promise.all(imgs.map((i) => i.decode()));
      return imgs.map((i) => ({ source: i.src, width: i.naturalWidth }));
    });
  assert(imageInfo.every((i) => i.source.startsWith("blob:") && i.width > 0));
  await h5.screenshot({
    path: fileURLToPath(new URL("h5-attachments.png", out)),
    fullPage: true,
  });
  checks.push(
    "新学员账号无需手机号登录，内部备注无泄露，H5多张附件真实上传与鉴权回显",
  );
  const feedbackText = "三端图片回归·" + suffix;
  await h5
    .getByRole("textbox", { name: "问题描述", exact: true })
    .fill(feedbackText);
  await h5.getByRole("button", { name: "提交反馈", exact: true }).click();
  await h5.getByRole("heading", { name: "反馈已收到", exact: true }).waitFor();
  const feedbackRows = (await call("/api/feedback", null, h5Token)).items;
  const feedback = feedbackRows.find((f) => f.content === feedbackText);
  assert.equal(feedback.attachments.length, 2);
  const attachment = feedback.attachments[0].id;
  assert.equal((await api.get("/api/attachments/" + attachment)).status(), 401);
  const otherToken = (
    await call(
      "/api/auth/student-login",
      {
        studentNumber: fixtures.referrer.studentNumber,
        password: fixtures.referrer.password,
      },
      null,
    )
  ).accessToken;
  assert.equal(
    (
      await api.get("/api/attachments/" + attachment, {
        headers: { Authorization: "Bearer " + otherToken },
      })
    ).status(),
    404,
  );
  await admin.goto("http://127.0.0.1:5204/?proof=1#/feedback");
  await admin
    .getByRole("row")
    .filter({ hasText: feedbackText })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  const proof = admin.getByRole("dialog", { name: "记录详情", exact: true });
  await proof.locator(".attachment-gallery summary").click();
  await proof.locator(".attachment-gallery img").nth(1).waitFor();
  await proof
    .locator(".attachment-gallery img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await proof.screenshot({
    path: fileURLToPath(new URL("admin-proof.png", out)),
  });
  await proof
    .getByRole("button", { name: "关闭此对话框", exact: true })
    .click();
  await h5.goto("http://127.0.0.1:5205/?proof-return=1#/feedback");
  await h5.locator(".attachment-gallery summary").first().click();
  await h5.locator(".attachment-gallery img").nth(1).waitFor();
  await h5
    .locator(".attachment-gallery img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  checks.push(
    "H5提交两张证明→Java存储关联→后台授权预览→H5历史回看完整闭环；匿名与其他学员不可读取",
  );
  await scan(h5, "H5反馈与历史图片");
  await admin.goto("http://127.0.0.1:5204/?media=1#/media");
  await admin.getByRole("heading", { name: "素材管理", exact: true }).waitFor();
  await admin.getByRole("button", { name: "新建素材", exact: true }).click();
  const media = admin.getByRole("dialog", {
    name: "新建素材管理",
    exact: true,
  });
  await media.locator("input[type=file]").setInputFiles(png);
  await media.locator(".media-preview img").waitFor();
  await media.locator(".media-preview img").evaluate((img) => img.decode());
  await media
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("回显素材·" + suffix);
  await media.getByRole("button", { name: "保存修改", exact: true }).click();
  await media.waitFor({ state: "hidden" });
  const mediaRow = admin
    .getByRole("row")
    .filter({ hasText: "回显素材·" + suffix });
  await mediaRow.locator(".media-preview img").waitFor();
  await mediaRow.getByRole("button", { name: "编辑", exact: true }).click();
  const mediaEdit = admin.getByRole("dialog", {
    name: "编辑素材管理",
    exact: true,
  });
  await mediaEdit.locator(".media-preview img").evaluate((i) => i.decode());
  await mediaEdit.locator(".media-preview img").click();
  await admin.locator(".el-image-viewer__img").waitFor();
  await admin.keyboard.press("Escape");
  checks.push(
    "后台上传→保存列表缩略图→重编辑图片回显→大图预览使用真实服务器URL",
  );
  await scan(admin, "素材编辑与图片预览");
  assert.deepEqual(errors, []);
  const report = {
    environment:
      "Real Java8 + MySQL qingmu_academy_dev + local Redis, no route fixtures",
    checks,
    pageErrors: errors,
    accessibility,
    remoteDeployed: false,
  };
  await writeFile(new URL("report.json", out), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await writeFile(
    new URL("server/.local/growth-browser-member.json", root),
    JSON.stringify({ id: member.id, student, password }),
    { encoding: "utf8" },
  );
} catch (e) {
  for (const p of browser?.contexts()[0]?.pages() ?? []) {
    await p
      .locator(".invitation-source__credential")
      .evaluateAll((nodes) =>
        nodes.forEach((node) => (node.textContent = "邀请凭据已隐藏")),
      )
      .catch(() => {});
    await p
      .screenshot({
        path: fileURLToPath(
          new URL(
            p.url().includes("5204") ? "admin-failure.png" : "h5-failure.png",
            out,
          ),
        ),
        fullPage: true,
      })
      .catch(() => {});
  }
  console.error(e);
  throw e;
} finally {
  await browser?.close();
  await api.dispose();
  for (const s of servers) s.kill();
}
