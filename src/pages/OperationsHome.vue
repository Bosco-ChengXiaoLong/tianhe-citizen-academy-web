<script setup lang="ts">
import { formatDateTime } from "../utils/date-time";
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { growth, type Query } from "../services/growth";
import { repository } from "../services/client";
import { isApi } from "../services/data-source";
import { useRemoteResource } from "../composables/useRemoteResource";
import PageHeading from "../components/PageHeading.vue";
import TrendChart from "../components/TrendChart.vue";
import InviteFunnel from "../components/InviteFunnel.vue";
const route = useRoute(),
  router = useRouter();
const dates = ref<string[]>([]),
  academy = ref("");
function sync() {
  dates.value =
    route.query.start && route.query.end
      ? [String(route.query.start), String(route.query.end)]
      : [];
  academy.value = String(route.query.academy ?? "");
}
watch(() => route.fullPath, sync, { immediate: true });
const query = (): Query => ({
  start: typeof route.query.start === "string" ? route.query.start : undefined,
  end: typeof route.query.end === "string" ? route.query.end : undefined,
  academyId:
    typeof route.query.academy === "string" ? route.query.academy : undefined,
});
const canGrowth = () => repository.globalCan("referral:read");
const { data, loading, error, reload } = useRemoteResource(
  () => route.fullPath,
  async (signal) => {
    const overview: Record<string, any> = await growth.overview(
      query(),
      signal,
    );
    let invitation;
    let ranking;
    let growthError = "";
    if (canGrowth())
      try {
        [invitation, ranking] = await Promise.all([
          growth.report({ start: query().start, end: query().end }, signal),
          growth.referrers(
            {
              start: query().start,
              end: query().end,
              pageSize: 5,
              sort: "registrations",
            },
            signal,
          ),
        ]);
      } catch (e) {
        growthError = e instanceof Error ? e.message : "邀请统计读取失败";
      }
    return { overview, invitation, ranking, growthError };
  },
);
function apply() {
  void router.replace({
    query: {
      start: dates.value?.[0],
      end: dates.value?.[1],
      academy: academy.value || undefined,
    },
  });
}
function day(day: string) {
  dates.value = [day, day];
  apply();
}
const metrics = [
  { key: "cumulativeMembers", label: "累计用户" },
  { key: "newMembers", label: "本期新增" },
  { key: "activeMembers", label: "活跃用户" },
  { key: "enrollments", label: "有效报名" },
];
function goMembers(segment?: string) {
  void router.push({
    path: "/members",
    query: {
      academy: query().academyId,
      segment,
      ...(segment === "new" || segment === "active"
        ? { start: query().start, end: query().end }
        : {}),
    },
  });
}
</script>
<template>
  <PageHeading
    title="运营总览"
    description="查看运营趋势、邀请转化与待办；图表支持下钻到日期。"
    ><el-button @click="reload">刷新</el-button></PageHeading
  >
  <form class="filter-bar" novalidate @submit.prevent="apply">
    <el-date-picker
      v-model="dates"
      type="daterange"
      value-format="YYYY-MM-DD"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      aria-label="统计日期"
    /><el-select
      v-model="academy"
      clearable
      placeholder="全部授权学院"
      aria-label="统计学院"
      ><el-option
        v-for="a in repository
          .read()
          .tables.academies.filter((a) =>
            repository.can('overview:read', [a.id]),
          )"
        :key="a.id"
        :value="a.id"
        :label="a.name" /></el-select
    ><el-button type="primary" native-type="submit">查询</el-button
    ><el-button
      @click="
        dates = [];
        academy = '';
        apply();
      "
      >近30天</el-button
    ><span class="muted"
      >{{ isApi ? "真实接口" : "独立演示" }} · 北京时间 · 数据更新
      {{
        data?.overview.updatedAt ? formatDateTime(data.overview.updatedAt) : "—"
      }}</span
    >
  </form>
  <el-alert v-if="error" :title="error" type="error" :closable="false" />
  <p v-if="loading" role="status">正在更新统计…</p>
  <template v-if="data"
    ><div class="metrics">
      <button
        v-for="m in metrics"
        :key="m.key"
        class="metric-card"
        type="button"
        :disabled="
          !repository.can(
            m.key === 'enrollments' ? 'teaching:read' : 'member:read',
          )
        "
        @click="
          m.key === 'enrollments'
            ? router.push('/enrollments')
            : goMembers(
                m.key === 'newMembers'
                  ? 'new'
                  : m.key === 'activeMembers'
                    ? 'active'
                    : 'current',
              )
        "
      >
        <span>{{ m.label }}</span
        ><strong>{{ data.overview[m.key] ?? 0 }}</strong
        ><small
          >授权学院 ·
          {{
            m.key === "enrollments" ? "点击查看报名管理" : "点击查看学员明细"
          }}</small
        >
      </button>
    </div>
    <TrendChart
      title="新增学员与活跃趋势"
      :points="data.overview.trend"
      :series="[
        { key: 'newMembers', label: '新增学员' },
        { key: 'activeMembers', label: '活跃学员' },
      ]"
      :loading="loading"
      @select="day"
    />
    <p class="muted">{{ data.overview.activeDefinition }}</p>
    <el-alert
      v-if="data.growthError"
      :title="data.growthError"
      type="error"
      :closable="false"
    />
    <template v-if="data.invitation"
      ><p class="muted">
        以下邀请统计为全局数据，不按课程学院划分；需全局邀请读取权限。
      </p>
      <div class="metrics">
        <div class="metric-card">
          <span>邀请访问次数</span
          ><strong>{{
            !data.invitation.collectionEnabled && !data.invitation.visits
              ? "未采集"
              : data.invitation.visits
          }}</strong
          ><small>有效落地 · 重试不重复计数</small>
        </div>
        <div class="metric-card">
          <span>邀请访问人数</span
          ><strong>{{
            !data.invitation.collectionEnabled && !data.invitation.visitors
              ? "未采集"
              : data.invitation.visitors
          }}</strong
          ><small>已同意采集 · 周期去重</small>
        </div>
        <div class="metric-card">
          <span>邀请注册人数</span
          ><strong>{{ data.invitation.registrations }}</strong
          ><small>按真实建档日期统计</small>
        </div>
        <div class="metric-card">
          <span>访问转化率</span
          ><strong>{{
            data.invitation.conversionRate === null
              ? "—"
              : data.invitation.conversionRate + "%"
          }}</strong
          ><small>已转化访客 / 去重访问人数</small>
        </div>
      </div>
      <TrendChart
        title="邀请访问与注册趋势"
        :points="data.invitation.trend as unknown as Record<string, unknown>[]"
        :series="[
          { key: 'visitors', label: '访问人数' },
          { key: 'registrations', label: '注册人数' },
        ]"
        @select="day" />
      <InviteFunnel :report="data.invitation"
    /></template>
    <section v-if="data.ranking" class="panel referrer-top">
      <h2>推荐人贡献榜</h2>
      <p class="muted">
        按本期真实注册排序；当前关系人数和历史业务归因分别统计。
      </p>
      <el-table
        role="region"
        :data="data.ranking.items"
        aria-label="推荐人贡献榜"
      >
        <el-table-column prop="displayName" label="推荐人" /><el-table-column
          prop="visitors"
          label="访问人数"
        /><el-table-column
          prop="registrations"
          label="注册人数"
        /><el-table-column
          prop="directCount"
          label="当前直属"
        /><el-table-column prop="enrollments" label="归因报名" />
        <el-table-column label="操作"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="
                router.push({
                  path: '/referrals',
                  query: {
                    member: row.id,
                    start: query().start,
                    end: query().end,
                  },
                })
              "
              >查看贡献</el-button
            ></template
          ></el-table-column
        >
      </el-table>
    </section>
    <div class="dashboard-grid">
      <section class="panel">
        <h2>热门课程</h2>
        <el-table
          role="region"
          :data="data.overview.hotCourses"
          aria-label="热门课程"
          ><el-table-column
            prop="title"
            label="课程"
            min-width="180" /><el-table-column
            prop="enrollments"
            label="有效报名" /><el-table-column prop="members" label="报名人数"
        /></el-table>
      </section>
      <section class="panel">
        <h2>待处理与学员跟进</h2>
        <p>待审核补签 {{ data.overview.pendingMakeups ?? 0 }} 条</p>
        <el-button
          v-if="repository.can('teaching:read')"
          @click="router.push('/makeups')"
          >查看补签</el-button
        >
        <p v-if="data.overview.pendingFeedback !== null">
          待处理反馈 {{ data.overview.pendingFeedback ?? 0 }} 条
          <el-button
            v-if="repository.globalCan('feedback:read')"
            link
            @click="router.push('/feedback')"
            >查看反馈</el-button
          >
        </p>
        <p class="muted">
          待办为当前存量，不受趋势日期影响；明细按操作人员权限过滤。
        </p>
        <div v-if="repository.can('member:read')" class="care-links">
          <el-button @click="goMembers('due')"
            >到期跟进 {{ data.overview.dueFollowupMembers ?? 0 }} 人</el-button
          ><el-button @click="goMembers('unenrolled')"
            >已注册未报名
            {{ data.overview.unenrolledMembers ?? 0 }} 人</el-button
          ><el-button @click="goMembers('not_attended')"
            >已报名未到课
            {{ data.overview.notAttendedMembers ?? 0 }} 人</el-button
          >
        </div>
        <el-button
          v-if="canGrowth()"
          @click="
            router.push({
              path: '/referrals',
              query: { start: query().start, end: query().end },
            })
          "
          >查看推荐人贡献</el-button
        >
      </section>
    </div>
  </template>
</template>
<style scoped>
.care-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
}
.metric-card:disabled {
  cursor: default;
  opacity: 1;
}
.referrer-top,
.trend-chart,
.invite-funnel {
  margin-bottom: 24px;
}
</style>
