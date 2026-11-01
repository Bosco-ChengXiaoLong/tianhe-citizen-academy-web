import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import { modules } from "./config/modules";
import { readSession, repository } from "./services/client";
import { safeReturn } from "./domain/permissions";
declare module "vue-router" {
  interface RouteMeta {
    title: string;
    module?: string;
    permission?: string;
    public?: boolean;
  }
}
import { isApi } from "./services/data-source";
import { api } from "./services/http";
import { apiRepository } from "./services/api-repository";
const custom: Record<string, () => Promise<unknown>> = {
  overview: () => import("./pages/Overview.vue"),
  referrals: () => import("./pages/Referrals.vue"),
  contributions: () => import("./pages/Referrals.vue"),
  analytics: () => import("./pages/Analytics.vue"),
  events: () => import("./pages/Analytics.vue"),
  roles: () => import("./pages/Permissions.vue"),
  accounts: () => import("./pages/Accounts.vue"),
  audit: () => import("./pages/Audit.vue"),
  exports: () => import("./pages/Exports.vue"),
};
const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    component: () => import("./pages/Login.vue"),
    meta: { title: "后台登录", public: true },
  },
  {
    path: "/",
    component: () => import("./components/AdminShell.vue"),
    children: [
      { path: "", redirect: "/overview" },
      ...modules.map((m) => ({
        path: m.key,
        component:
          isApi && (custom[m.key] || ["configs", "levels"].includes(m.key))
            ? () => import("./pages/ApiOperations.vue")
            : (custom[m.key] ?? (() => import("./pages/EntityList.vue"))),
        meta: { title: m.title, module: m.key, permission: m.permission },
      })),
      {
        path: "courses/new",
        component: () => import("./pages/CourseEditor.vue"),
        meta: {
          title: "新建课程",
          module: "courses",
          permission: "course:write",
        },
      },
      {
        path: "courses/:id/edit",
        component: () => import("./pages/CourseEditor.vue"),
        meta: {
          title: "编辑课程",
          module: "courses",
          permission: "course:write",
        },
      },
      {
        path: "403",
        component: () => import("./pages/Status.vue"),
        meta: { title: "没有访问权限" },
      },
      {
        path: ":pathMatch(.*)*",
        component: () => import("./pages/Status.vue"),
        meta: { title: "页面不存在" },
      },
    ],
  },
];
const scroll = new Map<string, { left: number; top: number }>();
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    scroll.set(from.fullPath, { left: window.scrollX, top: window.scrollY });
    return saved ?? scroll.get(to.fullPath) ?? { left: 0, top: 0 };
  },
});
router.beforeEach(async (to) => {
  if (isApi) {
    if (!api.session) {
      if (to.meta.public) return;
      return { path: "/login", query: { redirect: to.fullPath } };
    }
    try {
      await apiRepository.identity();
    } catch (e) {
      if (!api.session)
        return to.meta.public
          ? undefined
          : { path: "/login", query: { redirect: to.fullPath } };
      throw e;
    }
    if (to.meta.public) return safeReturn(to.query.redirect);
    if (to.meta.permission && !apiRepository.can(to.meta.permission))
      return "/403";
    if (!["/403"].includes(to.path)) await apiRepository.references();
    return;
  }
  const s = readSession();
  let valid = !!s && s.expiresAt > Date.now();
  try {
    const db = repository.read();
    valid =
      valid &&
      db.accounts.some((a) => a.id === s?.accountId && a.active) &&
      s?.securityVersion === db.securityVersion;
  } catch {
    valid = false;
  }
  if (to.meta.public) {
    if (valid) return safeReturn(to.query.redirect);
    return;
  }
  if (!valid)
    return { path: "/login", query: { redirect: to.fullPath }, replace: true };
  if (to.meta.permission && !repository.can(to.meta.permission)) return "/403";
});
router.afterEach((to) => {
  document.title = `${to.meta.title} · 青木私语学苑后台`;
});
