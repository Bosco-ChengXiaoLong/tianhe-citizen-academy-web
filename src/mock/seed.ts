import type { Database, Row, TableName } from "../types";
export const tableNames: TableName[] = [
  "academies",
  "venues",
  "rooms",
  "teachers",
  "categories",
  "media",
  "courses",
  "sessions",
  "members",
  "enrollments",
  "makeups",
  "evaluations",
  "feedback",
  "credits",
  "levels",
  "messages",
  "configs",
];
export function row(id: string, name: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    name,
    academyId: "humanities",
    status: "启用",
    version: 1,
    createdAt: "2026-11-01T09:00:00+08:00",
    ...extra,
  };
}
export function seedDatabase(): Database {
  const tables = Object.fromEntries(
    tableNames.map((t) => [t, []]),
  ) as unknown as Record<TableName, Row[]>;
  tables.academies = [
    row("humanities", "人文艺术学院"),
    row("life", "生活美学学院", { academyId: "life" }),
    row("health", "健康活力学院", { academyId: "health" }),
  ];
  tables.venues = [
    row("tianhe", "天河社区学堂", {
      academyIds: ["humanities", "life"],
      address: "广州天河 · 示例教学点",
      capacity: 30,
      description: "正式授课地址由教务配置",
    }),
  ];
  tables.rooms = [
    row("room-a", "社区文化活动室", { venueId: "tianhe", capacity: 30 }),
  ];
  tables.teachers = [
    row("teacher-lin", "林老师", { description: "书法教学" }),
    row("teacher-chen", "陈老师", {
      academyId: "life",
      description: "手机摄影",
    }),
  ];
  tables.categories = [
    row("calligraphy-category", "书法"),
    row("photography-category", "摄影", { academyId: "life" }),
  ];
  tables.media = [
    row("cover-calligraphy", "书法公益课堂封面", {
      url: "calligraphy",
      size: 168140,
    }),
    row("cover-photography", "手机摄影封面", {
      academyId: "life",
      url: "photography",
      size: 65710,
    }),
  ];
  tables.courses = [
    row("calligraphy", "书法入门公益课", {
      status: "已发布",
      categoryId: "calligraphy-category",
      teacherId: "teacher-lin",
      venueId: "tianhe",
      coverId: "cover-calligraphy",
      description: "从握笔、运笔到基本笔画，适合零基础学员。",
      publishedVersion: 1,
    }),
    row("photography", "手机摄影分享课", {
      academyId: "life",
      status: "草稿",
      categoryId: "photography-category",
      teacherId: "teacher-chen",
      venueId: "tianhe",
      coverId: "cover-photography",
      description: "用手机记录日常生活的美好。",
      publishedVersion: 0,
    }),
  ];
  tables.sessions = [
    row("calligraphy:2026-11-06", "书法入门 · 11月06日", {
      courseId: "calligraphy",
      teacherId: "teacher-lin",
      roomId: "room-a",
      venueId: "tianhe",
      startAt: "2026-11-06 10:00:00",
      endAt: "2026-11-06 11:00:00",
      registrationStart: "2026-10-30 09:00:00",
      registrationEnd: "2026-11-05 17:00:00",
      capacity: 30,
      credits: 1.5,
      status: "已发布",
      snapshot: "天河社区学堂 / 社区文化活动室 / 林老师",
    }),
  ];
  tables.members = Array.from({ length: 36 }, (_, i) =>
    row(
      i === 0 ? "demo-member" : `member-${i + 1}`,
      i === 0 ? "周同学" : `学员${String(i + 1).padStart(2, "0")}`,
      {
        academyId: i % 3 === 0 ? "life" : "humanities",
        studentNo:
          i === 0 ? "QMSY001026" : `QMSY${String(i + 1026).padStart(6, "0")}`,
        phoneMasked: `138****${String(1000 + i)}`,
        inviterId:
          i === 0
            ? ""
            : i < 5
              ? "demo-member"
              : `member-${Math.floor(i / 3) + 1}`,
        source: i % 2 ? "好友邀请" : "自主注册",
      },
    ),
  );
  tables.enrollments = [
    row("QM20261106001", "周同学 · 书法入门", {
      memberId: "demo-member",
      sessionId: "calligraphy:2026-11-06",
      courseId: "calligraphy",
      status: "已报名",
      attendance: "未签到",
      reviewed: false,
    }),
  ];
  tables.makeups = [
    row("BQ001", "书法入门补签申请", {
      enrollmentId: "QM20261106001",
      memberId: "demo-member",
      status: "待审核",
      reason: "实际到场，申请核验签到记录。",
    }),
  ];
  tables.feedback = [
    row("FK001", "课程时间咨询", {
      memberId: "demo-member",
      status: "待处理",
      description: "请问课程如何签到？",
    }),
  ];
  tables.evaluations = [
    row("EV001", "往期书法课评价", {
      memberId: "member-2",
      rating: 5,
      description: "讲解细致，收获很多。",
      status: "已评价",
    }),
  ];
  tables.credits = [
    row("credit-opening", "往期学分结转", {
      memberId: "demo-member",
      amount: 12.5,
      enrollmentId: "history",
      status: "已入账",
    }),
  ];
  tables.levels = [
    row("level-draft", "成长等级方案", {
      status: "草稿",
      threshold: 10,
      description: "演示规则，尚未作为正式运营门槛发布",
    }),
  ];
  tables.messages = [
    row("welcome", "欢迎来到青木私语学苑", {
      status: "草稿",
      description: "在身边，学点喜欢的。",
      recipient: "全体学员",
    }),
  ];
  tables.configs = [
    row("homepage", "首页展示配置", {
      status: "草稿",
      description: "学院广场,我的课表,学苑榜单,优兑空间",
      courseIds: ["calligraphy"],
      serviceText: "请通过站内反馈联系教务",
      externalUrl: "",
      publishedVersion: 0,
    }),
  ];
  return {
    revision: 1,
    securityVersion: 1,
    tables,
    accounts: [
      {
        id: "super",
        name: "系统管理员",
        username: "admin",
        roleIds: ["super-role"],
        active: true,
      },
      {
        id: "operator",
        name: "学院运营",
        username: "operator",
        roleIds: ["operator-role"],
        active: true,
      },
      {
        id: "analyst",
        name: "数据分析员",
        username: "analyst",
        roleIds: ["analyst-role"],
        active: true,
      },
      {
        id: "auditor",
        name: "只读审计员",
        username: "auditor",
        roleIds: ["audit-role"],
        active: true,
      },
    ],
    roles: [
      {
        id: "super-role",
        name: "超级管理员",
        grants: [{ action: "*", scope: "*" }],
      },
      {
        id: "operator-role",
        name: "教学点运营",
        grants: [
          "overview:read",
          "course:read",
          "course:write",
          "course:publish",
          "academy:read",
          "academy:write",
          "venue:read",
          "venue:write",
          "teacher:read",
          "teacher:write",
          "category:read",
          "category:write",
          "media:read",
          "media:write",
          "session:read",
          "session:write",
          "member:read",
          "teaching:read",
          "teaching:write",
          "feedback:read",
          "feedback:write",
          "credit:read",
          "message:read",
          "message:write",
        ].map((action) => ({ action, scope: ["humanities"] })),
      },
      {
        id: "analyst-role",
        name: "数据分析",
        grants: [
          "overview:read",
          "analytics:read",
          "event:read",
          "course:read",
        ].map((action) => ({ action, scope: "*" })),
      },
      {
        id: "audit-role",
        name: "只读审计",
        grants: [
          { action: "audit:read", scope: "*" },
          { action: "export:read", scope: "*" },
        ],
      },
    ],
    audits: [],
    exports: [],
    attribution: [
      {
        id: "attr-1",
        ancestorId: "demo-member",
        memberId: "member-2",
        enrollmentId: "history-enrollment",
        valid: true,
      },
    ],
  };
}
