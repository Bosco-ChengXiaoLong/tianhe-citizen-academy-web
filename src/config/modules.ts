import type { ModuleDefinition, Field } from "../types";
import { isApi } from "../services/data-source";
const academy: Field = {
  key: "academyId",
  label: "所属学院",
  kind: "select",
  relation: "academies",
  required: true,
};
const name: Field = { key: "name", label: "名称", required: true };
const description: Field = {
  key: "description",
  label: "说明",
  kind: "textarea",
};
const relation = (
  key: string,
  label: string,
  target: Field["relation"],
): Field => ({ key, label, kind: "select", relation: target, required: true });
const baseColumns = [
  { key: "name", label: "名称", width: 220 },
  { key: "academyId", label: "学院", width: 170 },
  { key: "status", label: "状态", width: 130 },
  { key: "version", label: "版本", width: 90 },
];
export const modules: ModuleDefinition[] = [
  {
    key: "overview",
    title: "运营总览",
    group: "工作台",
    icon: "house",
    permission: "overview:read",
    description: "关注学员、课程与邀请贡献，点击明细继续查看。",
  },
  {
    key: "courses",
    title: "课程管理",
    group: "内容管理",
    icon: "book",
    table: "courses",
    permission: "course:read",
    description: "管理课程内容、发布版本及关联场次。",
    fields: [
      name,
      academy,
      relation("categoryId", "课程分类", "categories"),
      relation("teacherId", "授课老师", "teachers"),
      relation("venueId", "授课地点", "venues"),
      relation("coverId", "封面素材", "media"),
      { ...description, required: true },
    ],
  },
  {
    key: "academies",
    title: "学院管理",
    group: "内容管理",
    icon: "school",
    table: "academies",
    permission: "academy:read",
    description: "配置学院信息与展示状态。",
    fields: [
      name,
      academy,
      description,
      { key: "sort", label: "展示排序", kind: "number", min: 0 },
    ],
  },
  {
    key: "venues",
    title: "上课地点",
    group: "内容管理",
    icon: "pin",
    table: "venues",
    permission: "venue:read",
    description: "学院与地点分别管理，共享地点变更需全部关联范围授权。",
    fields: [
      name,
      academy,
      {
        key: "academyIds",
        label: "关联学院",
        kind: "select",
        relation: "academies",
        required: true,
      },
      { key: "address", label: "地址", required: true },
      { key: "longitude", label: "经度", kind: "number" },
      { key: "latitude", label: "纬度", kind: "number" },
      description,
    ],
  },
  {
    key: "rooms",
    title: "教室管理",
    group: "内容管理",
    icon: "pin",
    table: "rooms",
    permission: "venue:read",
    description: "维护地点下的教室与容量。",
    fields: [
      name,
      academy,
      relation("venueId", "所属地点", "venues"),
      {
        key: "capacity",
        label: "教室容量",
        kind: "number",
        min: 1,
        required: true,
      },
    ],
  },
  {
    key: "teachers",
    title: "教师管理",
    group: "内容管理",
    icon: "user",
    table: "teachers",
    permission: "teacher:read",
    description: "教师资料和课程关联。",
    fields: [name, academy, description],
  },
  {
    key: "categories",
    title: "课程分类",
    group: "内容管理",
    icon: "book",
    table: "categories",
    permission: "category:read",
    description: "维护课程分类与排序。",
    fields: [
      name,
      academy,
      { key: "sort", label: "排序", kind: "number", min: 0 },
    ],
  },
  {
    key: "media",
    title: "素材管理",
    group: "内容管理",
    icon: "book",
    table: "media",
    permission: "media:read",
    description: "校验图片类型及大小，演示素材仅保存本地预览资料。",
    fields: [
      name,
      academy,
      { key: "url", label: "图片", kind: "asset", required: true },
      description,
    ],
  },
  {
    key: "sessions",
    title: "排课场次",
    group: "教务运营",
    icon: "calendar",
    table: "sessions",
    permission: "session:read",
    description: "课程与场次分离；发布前检查教师、教室、窗口及容量冲突。",
    fields: [
      name,
      academy,
      relation("courseId", "课程", "courses"),
      relation("teacherId", "授课老师", "teachers"),
      relation("roomId", "教室", "rooms"),
      { key: "startAt", label: "开课时间", kind: "datetime", required: true },
      { key: "endAt", label: "结束时间", kind: "datetime", required: true },
      {
        key: "registrationStart",
        label: "报名开始",
        kind: "datetime",
        required: true,
      },
      {
        key: "registrationEnd",
        label: "报名截止",
        kind: "datetime",
        required: true,
      },
      {
        key: "capacity",
        label: "名额",
        kind: "number",
        min: 1,
        required: true,
      },
      { key: "credits", label: "场次学分", kind: "number", min: 0 },
      { key: "changeReason", label: "变更原因", kind: "textarea" },
    ],
  },
  {
    key: "enrollments",
    title: "报名与考勤",
    group: "教务运营",
    icon: "calendar",
    table: "enrollments",
    permission: "teaching:read",
    description: "查看报名名单、人工签到签退与取消历史。",
    columns: [
      { key: "name", label: "学员与课程", width: 280 },
      { key: "status", label: "报名状态" },
      { key: "attendance", label: "出勤状态" },
      { key: "sessionId", label: "场次", width: 220 },
    ],
  },
  {
    key: "makeups",
    title: "补签审核",
    group: "教务运营",
    icon: "calendar",
    table: "makeups",
    permission: "teaching:read",
    description: "审核更正出勤，待审核不计学分。",
    columns: [
      { key: "name", label: "申请", width: 220 },
      { key: "reason", label: "申请原因", width: 280 },
      { key: "status", label: "审核状态" },
    ],
  },
  {
    key: "evaluations",
    title: "课程评价",
    group: "教务运营",
    icon: "book",
    table: "evaluations",
    permission: "teaching:read",
    description: "查看真实评价记录，运营不可修改学员评价。",
    columns: [
      { key: "name", label: "课程", width: 220 },
      { key: "rating", label: "评分" },
      { key: "description", label: "评价内容", width: 340 },
    ],
  },
  {
    key: "feedback",
    title: "帮助与反馈",
    group: "教务运营",
    icon: "bell",
    table: "feedback",
    permission: "feedback:read",
    description: "核对问题，回复并记录处理结果。",
    fields: [
      { key: "reply", label: "站内回复", kind: "textarea", required: true },
    ],
  },
  {
    key: "credits",
    title: "学分流水",
    group: "教务运营",
    icon: "school",
    table: "credits",
    permission: "credit:read",
    description: "学分来自可信出勤事实；冲正保留原记录。",
    columns: [
      { key: "name", label: "流水", width: 220 },
      { key: "memberId", label: "会员" },
      { key: "amount", label: "学分" },
      { key: "status", label: "状态" },
    ],
  },
  {
    key: "levels",
    title: "等级与权益",
    group: "教务运营",
    icon: "school",
    table: "levels",
    permission: "level:read",
    description: "等级规则有版本，示例门槛不代表正式运营规则。",
    fields: [
      name,
      academy,
      { key: "threshold", label: "所需学分", kind: "number", min: 0 },
      description,
    ],
  },
  {
    key: "messages",
    title: "站内消息",
    group: "教务运营",
    icon: "bell",
    table: "messages",
    permission: "message:read",
    description: "配置通知；本地发送记录不等于真实送达。",
    fields: [
      name,
      academy,
      {
        key: "recipient",
        label: "收件范围",
        kind: "select",
        options: ["全体学员", "本学院学员"],
      },
      description,
    ],
  },
  {
    key: "members",
    title: "学员管理",
    group: "用户与增长",
    icon: "users",
    table: "members",
    permission: "member:read",
    description: "管理授权学院内的学员账号；手机号可为空，已有号码仅脱敏展示。",
    columns: [
      { key: "name", label: "展示名", width: 160 },
      { key: "studentNo", label: "学号", width: 180 },
      { key: "academyId", label: "业务学院", width: 160 },
      { key: "phoneMasked", label: "手机号（选填）", width: 160 },
      { key: "source", label: "注册来源" },
    ],
  },
  {
    key: "referrals",
    title: "用户与邀请关系",
    group: "用户与增长",
    icon: "users",
    permission: "referral:read",
    description: "查看当前上游、下游及历史归因，更正不回写历史贡献。",
  },
  {
    key: "contributions",
    title: "邀请贡献",
    group: "用户与增长",
    icon: "users",
    permission: "referral:read",
    description: "当前树与历史归因分开统计，不累加祖先贡献作为平台新增。",
  },
  {
    key: "analytics",
    title: "课程偏好与活跃",
    group: "数据分析",
    icon: "sliders",
    permission: "analytics:read",
    description: "同一观察人群的漏斗与互斥活跃分组。",
  },
  {
    key: "events",
    title: "埋点事件与质量",
    group: "数据分析",
    icon: "sliders",
    permission: "event:read",
    description: "与 H5 共用 v1.0.0 字典；浏览事件与服务端事实分来源校验。",
  },
  {
    key: "configs",
    title: "首页展示配置",
    group: "内容管理",
    icon: "sliders",
    table: "configs",
    permission: "config:read",
    description:
      "轮播图素材、排序与启停，首页入口、推荐课程、客服与福利外链；支持草稿、发布、审计及回滚。",
    fields: [
      name,
      academy,
      description,
      {
        key: "courseIds",
        label: "推荐课程",
        kind: "select",
        relation: "courses",
      },
      { key: "serviceText", label: "客服说明", kind: "textarea" },
      { key: "externalUrl", label: "福利外链" },
    ],
  },
  {
    key: "roles",
    title: "角色与数据权限",
    group: "系统管理",
    icon: "user",
    permission: "role:read",
    description: "按动作分配学院范围，多角色按相同动作取并集。",
  },
  {
    key: "accounts",
    title: "后台账号",
    group: "系统管理",
    icon: "user",
    permission: "role:read",
    description: "独立后台身份，账号启停及角色变更使模拟会话失效。",
  },
  {
    key: "audit",
    title: "操作审计",
    group: "系统管理",
    icon: "clock",
    permission: "audit:read",
    description: "操作对象、原因、前后值及请求标识，只读留痕。",
  },
  {
    key: "exports",
    title: "导出任务",
    group: "系统管理",
    icon: "clock",
    permission: "export:read",
    description: "只导出当前授权数据，下载时再次检查范围和有效期。",
  },
];
export const columnsFor = (module: ModuleDefinition) =>
  module.columns ?? baseColumns;
export const permissionActions = [
  ...new Set(
    modules
      .flatMap((m) => [
        m.permission,
        ...(m.table ? [m.permission.replace(":read", ":write")] : []),
      ])
      .concat([
        "course:publish",
        "config:publish",
        "level:publish",
        "policy:read",
        "policy:write",
        "referral:correct",
        "role:grant",
        "admin:write",
        "export:read",
        "export:create",
        "export:download",
        "audit:export",
        "credit:write",
      ]),
  ),
];

// API forms use actual server fields. Mock examples keep their original fields.
if (isApi) {
  for (const m of modules) {
    if (["academies", "teachers", "categories", "media"].includes(m.key))
      m.fields = m.fields?.filter((f) => f.key !== "academyId");
    if (m.key === "courses")
      m.fields = m.fields?.filter((f) => f.key !== "venueId");
    if (m.key === "members")
      m.fields = [
        name,
        academy,
        { key: "studentNo", label: "学号", required: true },
        {
          key: "password",
          label: "初始或重设口令（已有账号可留空）",
          kind: "password",
        },
        { key: "invitationToken", label: "邀请凭据（选填）" },
      ];
    if (m.key === "sessions")
      m.fields = [
        ...(m.fields ?? []).filter(
          (f) => !["name", "academyId"].includes(f.key),
        ),
        {
          key: "classroomCode",
          label: "课堂签到码",
          kind: "password",
          required: true,
        },
      ];
    if (m.key === "messages")
      m.fields = [name, academy, { ...description, required: true }];
    if (m.key === "media")
      m.description = "上传公开课程图片，类型与大小由服务端核验。";
  }
}
