<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { repository } from "../services/client";
import { eventSamples } from "../mock/events";
import { descendants } from "../domain/referrals";
import type { Row, TableName } from "../types";
import PageHeading from "../components/PageHeading.vue";
const router = useRouter();
const academy = ref(""),
  range = ref<string[]>(["2026-11-01", "2026-11-01"]);
const db = repository.read();
const filterAcademy = ref(academy.value),
  filterRange = ref<string[] | null>([...range.value]);
function apply() {
  academy.value = filterAcademy.value;
  range.value = Array.isArray(filterRange.value) ? [...filterRange.value] : [];
}

function records(t: TableName) {
  try {
    return repository
      .list(t)
      .filter((r) => !academy.value || r.academyId === academy.value);
  } catch {
    return [];
  }
}
const start = computed(() => range.value?.[0] ?? ""),
  end = computed(() => range.value?.[1] ?? "");
const inRange = (date: string) =>
  (!start.value || date.slice(0, 10) >= start.value) &&
  (!end.value || date.slice(0, 10) <= end.value);
const members = computed(() =>
  db.tables.members.filter(
    (m) =>
      repository.can("overview:read", [m.academyId]) &&
      (!academy.value || m.academyId === academy.value),
  ),
);
const events = computed(() =>
  eventSamples.filter(
    (e) =>
      repository.can("overview:read", [e.academy_id]) &&
      e.status === "已接收" &&
      (!academy.value || e.academy_id === academy.value) &&
      inRange(e.occurred_at),
  ),
);
const enrollments = computed(() =>
  db.tables.enrollments
    .filter((e) => repository.can("overview:read", [e.academyId]))
    .filter((e) => e.status === "已报名" && inRange(String(e.createdAt))),
);
const metrics = computed(() => [
  {
    label: "累计用户",
    value: members.value.length,
    detail: "授权范围 · 当前有效会员",
    to: "/members",
  },
  {
    label: "本期新增",
    value: members.value.filter((m) => inRange(String(m.createdAt))).length,
    detail: "按注册日期筛选",
    to: "/members",
  },
  {
    label: "活跃用户",
    value: new Set(events.value.map((e) => e.member_id).filter(Boolean)).size,
    detail: "模拟事件 · 周期内去重",
    to: "/analytics",
  },
  {
    label: "有效报名",
    value: enrollments.value.length,
    detail: "授权场次 · 有效报名记录",
    to: "/enrollments",
  },
]);
const courses = computed(() =>
  records("courses")
    .map((c) => ({
      ...c,
      views: events.value.filter(
        (e) => e.course_id === c.id && e.event_name === "course_view",
      ).length,
      registrations: enrollments.value.filter((e) => e.courseId === c.id)
        .length,
    }))
    .sort((a, b) => b.views - a.views),
);
const referrals = computed(() =>
  repository.can("referral:read")
    ? db.tables.members.slice(0, 4).map((m) => ({
        id: m.id,
        name: m.name,
        direct: db.tables.members.filter((c) => c.inviterId === m.id).length,
        total: descendants(db.tables.members, m.id).length,
        registrations: db.attribution.filter(
          (a) => a.ancestorId === m.id && a.valid,
        ).length,
      }))
    : [],
);
const groups = computed(() => {
  const active = new Set(events.value.map((e) => e.member_id).filter(Boolean));
  const enrolled = new Set(enrollments.value.map((e) => String(e.memberId)));
  return [
    {
      name: "本期新注册且活跃",
      value: [...active].filter((id) =>
        members.value.some((m) => m.id === id && inRange(m.createdAt)),
      ).length,
    },
    {
      name: "有效浏览未报名",
      value: [...active].filter(
        (id) =>
          !members.value.some((m) => m.id === id && inRange(m.createdAt)) &&
          !enrolled.has(id),
      ).length,
    },
    {
      name: "已报名及其他活跃",
      value: [...active].filter(
        (id) =>
          !members.value.some((m) => m.id === id && inRange(m.createdAt)) &&
          enrolled.has(id),
      ).length,
    },
  ];
});
const can = (path: string) => {
  const p: Record<string, string> = {
    "/members": "member:read",
    "/analytics": "analytics:read",
    "/enrollments": "teaching:read",
    "/courses": "course:read",
    "/referrals": "referral:read",
  };
  return repository.can(p[path] ?? "overview:read");
};
function go(path: string) {
  if (can(path))
    void router.push({ path, query: { academy: academy.value || undefined } });
}
</script>
<template>
  <PageHeading
    title="运营总览"
    description="关注学员、课程与邀请贡献，点击明细继续查看。"
  />
  <form class="filter-bar overview-filter" novalidate @submit.prevent="apply">
    <el-date-picker
      v-model="filterRange"
      type="daterange"
      format="YYYY.MM.DD"
      value-format="YYYY-MM-DD"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      range-separator="—"
      aria-label="统计日期"
    /><el-select
      v-model="filterAcademy"
      placeholder="全部学院"
      clearable
      aria-label="统计学院"
      ><el-option
        v-for="a in db.tables.academies.filter((a) =>
          repository.can('overview:read', [a.id]),
        )"
        :key="a.id"
        :label="a.name"
        :value="a.id" /></el-select
    ><el-button type="primary" native-type="submit">查询</el-button
    ><span class="muted">统计口径：模拟数据 · 授权范围 · 周期内去重</span>
  </form>
  <div class="metrics">
    <component
      :is="can(item.to) ? 'button' : 'div'"
      v-for="item in metrics"
      :key="item.label"
      class="metric-card"
      @click="go(item.to)"
      ><span>{{ item.label }}</span
      ><strong>{{ item.value }}</strong
      ><small>{{ item.detail }}</small></component
    >
  </div>
  <div class="dashboard-grid">
    <section class="panel">
      <h2>热门课程</h2>
      <el-table :data="courses" aria-label="热门课程"
        ><el-table-column label="课程名称" min-width="180"
          ><template #default="{ row }"
            ><el-button
              v-if="can('/courses')"
              link
              type="primary"
              @click="go('/courses')"
              >{{ row.name }}</el-button
            ><span v-else>{{ row.name }}</span></template
          ></el-table-column
        ><el-table-column prop="views" label="浏览人数" /><el-table-column
          prop="registrations"
          label="报名"
      /></el-table>
      <p class="muted">浏览与报名分别展示；未使用不透明偏好分。</p>
    </section>
    <section class="panel">
      <h2>邀请贡献排行</h2>
      <el-table :data="referrals" aria-label="邀请贡献排行"
        ><el-table-column prop="name" label="邀请人" /><el-table-column
          prop="direct"
          label="直属新增" /><el-table-column
          prop="total"
          label="全部下游" /><el-table-column
          prop="registrations"
          label="带来报名" /><template #empty
          ><el-empty
            :description="
              repository.can('referral:read')
                ? '暂无贡献数据'
                : '当前角色无全局增长数据权限'
            "
            :image-size="40" /></template
      ></el-table>
    </section>
    <section class="panel">
      <h2>活跃人群分布</h2>
      <el-table :data="groups" aria-label="活跃人群分布"
        ><el-table-column
          prop="name"
          label="人群"
          min-width="200"
        /><el-table-column prop="value" label="活跃人数" /><el-table-column
          label="查看"
          ><template #default
            ><el-button
              v-if="can('/analytics')"
              link
              type="primary"
              @click="go('/analytics')"
              >查看明细</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <p class="muted">分组互斥，合计与活跃用户数核对。</p>
    </section>
    <section class="panel">
      <h2>教务与运营待办</h2>
      <div class="todo-row">
        <span>待发布课程</span
        ><el-button text type="primary" @click="go('/courses')"
          >{{
            records("courses").filter((r: Row) => r.status === "草稿").length
          }}
          门</el-button
        >
      </div>
      <div class="todo-row">
        <span>补签待审核</span
        ><RouterLink v-if="repository.can('teaching:read')" to="/makeups"
          >{{
            records("makeups").filter((r) => r.status === "待审核").length
          }}
          条</RouterLink
        ><span v-else>无权限</span>
      </div>
      <div class="todo-row">
        <span>埋点质量待核对</span
        ><RouterLink v-if="repository.can('event:read')" to="/events"
          >{{
            eventSamples.filter((e) => e.status !== "已接收").length
          }}
          条</RouterLink
        ><span v-else>无权限</span>
      </div>
      <p class="muted">示例更新时间：2026-11-01；没有真实线上统计。</p>
    </section>
  </div>
</template>
