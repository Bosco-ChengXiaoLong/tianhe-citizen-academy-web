import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../../", import.meta.url);
const state = JSON.parse(
  await readFile(new URL("server/.local/integration-state.json", root), "utf8"),
);
const fixtures = JSON.parse(
  await readFile(
    new URL("server/.local/integration-fixtures.json", root),
    "utf8",
  ),
);
const output = new URL(".work/local-integration/browser/", root);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const admin = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
const mobile = await browser.newPage({
  viewport: { width: 375, height: 812 },
  isMobile: true,
});
const errors = [];
for (const p of [admin, mobile])
  p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push({ name, status: "passed" });
  console.log("PASS " + name);
}
try {
  await check("Admin real login + dashboard", async () => {
    await admin.goto("http://127.0.0.1:5188/#/login");
    await admin
      .getByRole("textbox", { name: "后台账号", exact: true })
      .fill(state.adminUsername);
    await admin
      .getByRole("textbox", { name: "账户口令", exact: true })
      .fill(state.adminPassword);
    await admin
      .getByRole("button", { name: "登录管理后台", exact: true })
      .click();
    await admin.waitForURL("**/#/overview");
    await admin.getByText("累计用户", { exact: true }).waitFor();
    await admin.screenshot({
      path: new URL("admin-overview.png", output).pathname.replace(
        /^\/([A-Z]:)/,
        "$1",
      ),
      fullPage: true,
    });
  });
  await check("Admin all 26 real routes", async () => {
    for (const path of [
      "courses",
      "academies",
      "venues",
      "rooms",
      "teachers",
      "categories",
      "media",
      "sessions",
      "enrollments",
      "makeups",
      "evaluations",
      "feedback",
      "credits",
      "levels",
      "messages",
      "members",
      "referrals",
      "contributions",
      "analytics",
      "events",
      "configs",
      "roles",
      "accounts",
      "audit",
      "exports",
    ]) {
      await admin.goto(`http://127.0.0.1:5188/#/${path}`);
      await admin.waitForTimeout(450);
      const text = await admin.locator("body").innerText();
      assert(
        !text.includes("API 模式尚未接入") &&
          !text.includes("页面暂时无法加载"),
        path + ": " + text.slice(0, 80),
      );
    }
  });
  await check(
    "H5 real public course and explicit session selection",
    async () => {
      await mobile.goto("http://127.0.0.1:5190/#/");
      await mobile.getByText("联调·书法入门公益课", { exact: true }).waitFor();
      await mobile.goto("http://127.0.0.1:5190/#/student-login");
      await mobile
        .getByLabel("学号", { exact: true })
        .fill(fixtures.studentNumber);
      await mobile
        .getByLabel("账户口令", { exact: true })
        .fill(fixtures.studentPassword);
      const checkbox = mobile.getByRole("checkbox");
      await checkbox.check();
      await mobile
        .getByRole("button", { name: "登录并继续", exact: true })
        .click();
      await mobile.waitForTimeout(800);
      await mobile.evaluate(async (sessionId) => {
        const t = JSON.parse(sessionStorage.getItem("qingmu-h5-api-tokens"));
        const h = {
          Authorization: "Bearer " + t.accessToken,
          "Content-Type": "application/json",
        };
        const e = await (
          await fetch("/api/enrollments", { headers: h })
        ).json();
        for (const r of e.data.items.filter(
          (r) =>
            r.courseSessionId === sessionId &&
            r.status === "active" &&
            r.attendance === "none",
        ))
          await fetch("/api/enrollments/" + r.id + "/cancel", {
            method: "POST",
            headers: { ...h, "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({
              reason: "浏览器回归准备：取消同场次旧测试报名",
            }),
          });
      }, fixtures.sessions[1].id);
      await mobile.goto(`http://127.0.0.1:5190/#/enroll/${fixtures.course.id}`);
      await mobile.getByRole("combobox", { name: "选择上课场次" }).waitFor();
      assert(
        (await mobile
          .getByRole("combobox", { name: "选择上课场次" })
          .locator("option")
          .count()) >= 2,
      );
      await mobile
        .getByRole("combobox", { name: "选择上课场次" })
        .selectOption(fixtures.sessions[1].id);
      await mobile
        .getByRole("button", { name: "确认免费报名", exact: true })
        .click();
      await mobile.waitForURL("**/success");
      await mobile.screenshot({
        path: new URL("h5-enrolled.png", output).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
        fullPage: true,
      });
    },
  );
  await check("H5 API pages and persisted identity", async () => {
    for (const path of [
      "classes",
      "mine",
      "favorites",
      "credits",
      "messages",
      "makeup-records",
      "feedback",
      "growth",
      "ranking",
      "invite",
      "privacy",
      "academies",
      "settings",
    ]) {
      await mobile.goto(`http://127.0.0.1:5190/#/${path}`);
      await mobile.waitForTimeout(300);
      assert(
        !(await mobile.locator("body").innerText()).includes(
          "页面暂时无法打开",
        ),
        path,
      );
    }
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, pageErrors: errors }));
} finally {
  await writeFile(
    new URL("report.json", output),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  await admin
    .screenshot({
      path: new URL("admin-last.png", output).pathname.replace(
        /^\/([A-Z]:)/,
        "$1",
      ),
      fullPage: true,
    })
    .catch(() => {});
  await mobile
    .screenshot({
      path: new URL("h5-last.png", output).pathname.replace(
        /^\/([A-Z]:)/,
        "$1",
      ),
      fullPage: true,
    })
    .catch(() => {});
  await browser.close();
}
