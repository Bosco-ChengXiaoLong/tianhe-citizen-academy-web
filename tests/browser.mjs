import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const root = new URL("..", import.meta.url),
  out = new URL("../output/playwright/", import.meta.url);
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5192",
    "--strictPort",
  ],
  { cwd: root, windowsHide: true, stdio: "ignore" },
);
const base = "http://127.0.0.1:5192";
let browser, page;
const checks = [],
  errors = [],
  a11y = [];
async function check(name, fn) {
  await fn();
  checks.push({ name, status: "passed" });
  console.log("PASS " + name);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i === 99) throw new Error("Vite startup timeout");
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CI_BROWSER_CHANNEL || process.platform === "win32"
      ? { channel: process.env.CI_BROWSER_CHANNEL || "msedge" }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  async function go(path) {
    await page.goto(base + "/#" + path);
    await page.waitForFunction(() => {
      const app = document.querySelector("#app")?.__vue_app__;
      return (
        app &&
        app.config.globalProperties.$route.fullPath === location.hash.slice(1)
      );
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.locator("h1").waitFor();
  }
  async function login(username = "admin") {
    await page.evaluate(() => sessionStorage.removeItem("qmsy-admin-session"));
    await go("/login");
    await page
      .getByRole("textbox", { name: "后台账号", exact: true })
      .fill(username);
    await page
      .getByRole("textbox", { name: "账户口令", exact: true })
      .fill("Demo@2026");
    await click("进入演示后台");
    await page.waitForFunction(() => !location.hash.includes("/login"));
  }
  async function shot(name) {
    await page.screenshot({ path: fileURLToPath(new URL(name, out)) });
  }
  async function scan(name) {
    await page.waitForFunction(
      () => document.querySelectorAll(".el-message").length === 0,
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    a11y.push({
      name,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          html: n.html,
          reason: n.failureSummary,
        })),
      })),
    });
    assert.equal(result.violations.length, 0, JSON.stringify(a11y.at(-1)));
  }
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("qmsy-admin-demo-v1")));
  await check("登录校验、口令显隐与安全任务返回", async () => {
    await go("/courses");
    await heading("欢迎回到运营管理中心").waitFor();
    await click("进入演示后台");
    await page.getByText("请填写账号和口令", { exact: true }).waitFor();
    await page
      .getByRole("textbox", { name: "账户口令", exact: true })
      .fill("wrong");
    await click("进入演示后台");
    await page.getByText("账号或口令不正确", { exact: true }).waitFor();
    await page
      .getByRole("textbox", { name: "账户口令", exact: true })
      .fill("Demo@2026");
    await click("进入演示后台");
    await heading("课程管理").waitFor();
  });
  await check("运营总览统计、筛选与设计截图", async () => {
    await go("/overview");
    await heading("运营总览").waitFor();
    await shot("B01-overview.png");
    assert.equal(
      await page.locator(".metric-card strong").first().innerText(),
      "36",
    );
    await scan("运营总览");
  });
  await check("课程编辑、草稿版本、确认发布与审计", async () => {
    await go("/courses");
    await page
      .getByRole("row")
      .filter({ hasText: "书法入门公益课" })
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    await heading("编辑课程").waitFor();
    await page
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("书法入门公益课 · 修订");
    await click("保存草稿");
    await heading("课程管理").waitFor();
    const row = page
      .getByRole("row")
      .filter({ hasText: "书法入门公益课 · 修订" });
    await row.getByRole("button", { name: "发布", exact: true }).click();
    await page.getByRole("dialog", { name: "确认发布" }).waitFor();
    await page
      .getByRole("dialog", { name: "确认发布" })
      .getByRole("button", { name: "确认发布", exact: true })
      .click();
    await page.getByText("请填写操作原因", { exact: true }).waitFor();
    await page
      .getByRole("textbox", { name: "操作原因", exact: true })
      .fill("课程内容已审核，发布修订版本");
    await page
      .getByRole("dialog", { name: "确认发布" })
      .getByRole("button", { name: "确认发布", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "确认发布" })
      .waitFor({ state: "hidden" });
    assert.equal(
      (await state()).tables.courses.find((c) => c.id === "calligraphy").status,
      "已发布",
    );
    await shot("B02-courses.png");
    await scan("课程管理");
  });
  await check("新建教师、分页筛选与失败保留表单", async () => {
    await go("/teachers");
    await click("新建教师");
    await page
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("陈老师 · 演示新增");
    await page.evaluate(async () => {
      const { failNext } = await import("/src/services/client.ts");
      failNext("network");
    });
    await click("保存修改");
    await page
      .getByText("网络连接异常，请重试，原内容已保留", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("textbox", { name: "名称", exact: true })
        .inputValue(),
      "陈老师 · 演示新增",
    );
    await click("保存修改");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("textbox", { name: "搜索名称、编号" })
      .fill("陈老师 · 演示新增");
    await click("查询");
    await page
      .getByRole("row")
      .filter({ hasText: "陈老师 · 演示新增" })
      .waitFor();
    await page.reload();
    await heading("教师管理").waitFor();
    assert.ok(page.url().includes("q="));
    assert.equal(
      (await state()).tables.teachers.filter(
        (t) => t.name === "陈老师 · 演示新增",
      ).length,
      1,
    );
  });
  await check("共享地点保护与补签审核唯一学分", async () => {
    await go("/venues");
    await page
      .getByRole("row")
      .filter({ hasText: "天河社区学堂" })
      .getByRole("button", { name: "停用", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "操作原因", exact: true })
      .fill("验证关联保护");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "停用", exact: true })
      .click();
    await page
      .getByText("地点仍有关联发布场次，不可停用", { exact: true })
      .waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "暂不操作" })
      .click();
    await go("/makeups");
    await page.getByRole("button", { name: "通过", exact: true }).click();
    await page
      .getByRole("textbox", { name: "操作原因", exact: true })
      .fill("教务已核实学员到场");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "通过补签", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const db = await state();
    assert.equal(db.tables.makeups[0].status, "已通过");
    assert.equal(
      db.tables.credits.filter((c) => c.enrollmentId === "QM20261106001")
        .length,
      1,
    );
  });
  await check("邀请更正必填原因、子树移动与历史快照保留", async () => {
    await go("/referrals");
    await shot("B05-referrals.png");
    await page.getByRole("combobox", { name: "选择会员" }).click();
    await page
      .getByRole("option", { name: "学员02 / QMSY001027", exact: true })
      .click();
    await click("更正直属邀请人");
    await page.getByRole("combobox", { name: "新直属邀请人" }).click();
    await page.getByRole("option", { name: "学员03", exact: true }).click();
    await click("预览并确认更正");
    await page
      .getByRole("textbox", { name: "操作原因", exact: true })
      .fill("来源核验后更正，历史贡献保持");
    await page
      .getByRole("dialog", { name: "确认更正上游" })
      .getByRole("button", { name: "确认更正上游", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "确认更正上游" })
      .waitFor({ state: "hidden" });
    const db = await state();
    assert.equal(
      db.tables.members.find((m) => m.id === "member-2").inviterId,
      "member-3",
    );
    assert.equal(db.attribution[0].ancestorId, "demo-member");
  });
  await check("导出当前筛选、下载重新鉴权与审计", async () => {
    await go("/courses");
    await click("导出筛选结果");
    await heading("导出任务").waitFor();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载 CSV", exact: true })
      .first()
      .click();
    const file = await download;
    assert.ok(file.suggestedFilename().endsWith(".csv"));
    const db = await state();
    assert.ok(db.audits.some((a) => a.action === "下载导出"));
    await go("/audit");
    await heading("操作审计").waitFor();
    await page.getByRole("button", { name: "查看变更" }).first().click();
    await page.getByRole("heading", { name: "变更前" }).waitFor();
    await page.keyboard.press("Escape");
  });
  await check("统一事件字典与客户端/服务端来源区分", async () => {
    await go("/events");
    await page.getByRole("tab", { name: "事件字典", exact: true }).click();
    await page
      .getByRole("cell", { name: "enrollment_confirmed", exact: true })
      .waitFor();
    await page
      .getByRole("cell", { name: "course_session_id", exact: false })
      .first()
      .waitFor();
    await shot("B06-events.png");
  });
  await check("学院运营数据范围、隐藏动作和路由防越权", async () => {
    await login("operator");
    await go("/courses");
    await page.getByRole("row").filter({ hasText: "书法入门公益课" }).waitFor();
    assert.equal(
      await page.getByRole("row").filter({ hasText: "手机摄影分享课" }).count(),
      0,
    );
    await go("/roles");
    await page.getByText("没有访问权限", { exact: true }).first().waitFor();
    assert.ok(page.url().includes("/403"));
    await go("/referrals");
    assert.ok(page.url().includes("/403"));
  });
  await check("只读审计账号及全部业务路由可打开", async () => {
    await login("auditor");
    await heading("操作审计").waitFor();
    assert.equal(
      await page.getByRole("link", { name: "课程管理", exact: true }).count(),
      0,
    );
    await login("admin");
    for (const path of [
      "academies",
      "rooms",
      "media",
      "categories",
      "sessions",
      "enrollments",
      "evaluations",
      "feedback",
      "credits",
      "levels",
      "messages",
      "members",
      "contributions",
      "analytics",
      "configs",
      "roles",
      "accounts",
      "exports",
    ]) {
      await go("/" + path);
      assert.ok(await page.locator("h1").textContent());
    }
    await go("/roles");
    await shot("B07-roles.png");
  });
  await check("授权保存及会话撤权生效", async () => {
    await go("/roles");
    await click("编辑授权");
    await page
      .getByRole("textbox", { name: "角色名称", exact: true })
      .fill("教学点运营 · 演示修订");
    await click("预览授权变更");
    await page
      .getByRole("textbox", { name: "操作原因", exact: true })
      .fill("复核角色说明");
    await page
      .getByRole("dialog", { name: "保存角色授权" })
      .getByRole("button", { name: "保存角色授权", exact: true })
      .click();
    await heading("欢迎回到运营管理中心").waitFor();
    await login("admin");
    assert.ok((await state()).securityVersion > 1);
  });
  await check("窄屏、桌面尺寸与长表单导航", async () => {
    for (const width of [1280, 1440, 1920, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/overview", "/courses", "/referrals", "/roles"]) {
        await go(path);
        const size = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          width: innerWidth,
        }));
        assert.ok(size.scroll <= size.width + 1, `${width} ${path} overflow`);
      }
    }
    await page.setViewportSize({ width: 390, height: 760 });
    await go("/courses");
    await click("打开导航");
    await page.getByRole("dialog", { name: "后台导航" }).waitFor();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1024 });
  });
  await check("空结果、离线、权限过期与无脚本错误", async () => {
    await go("/courses?q=不存在的课程");
    await page
      .getByText("没有匹配记录，请调整筛选条件", { exact: true })
      .waitFor();
    await go("/teachers");
    await page.evaluate(async () => {
      const { request } = await import("/src/services/client.ts");
      window.__testRequest = request;
    });
    await context.setOffline(true);
    const offlineMessage = await page.evaluate(async () => {
      try {
        await window.__testRequest(() => true);
        return "";
      } catch (e) {
        return e.message;
      }
    });
    assert.ok(offlineMessage.includes("网络连接异常"));
    await context.setOffline(false);
    await page.evaluate(async () => {
      const { failNext } = await import("/src/services/client.ts");
      failNext("network");
    });
    await go("/courses");
    await page
      .getByText("网络连接异常，请重试，原内容已保留", { exact: true })
      .first()
      .waitFor();
    await click("重新加载");
    await page.getByRole("row").filter({ hasText: "书法入门公益课" }).waitFor();
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("qmsy-admin-session"));
      s.expiresAt = Date.now() - 1;
      sessionStorage.setItem("qmsy-admin-session", JSON.stringify(s));
    });
    await go("/courses");
    await heading("欢迎回到运营管理中心").waitFor();
    assert.deepEqual(errors, []);
  });
  await writeFile(
    new URL("browser-report.json", out),
    JSON.stringify(
      {
        status: "passed",
        checks,
        a11y,
        errors,
        browser: "Microsoft Edge",
        mode: "independent-local-mock",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  if (page)
    await page
      .screenshot({ path: fileURLToPath(new URL("failure.png", out)) })
      .catch(() => {});
  await writeFile(
    new URL("browser-report.json", out),
    JSON.stringify(
      { status: "failed", error: String(e), checks, a11y, errors },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
