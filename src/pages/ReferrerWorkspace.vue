<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { growth, queryString, type Query, get } from "../services/growth";
import { api } from "../services/http";
import { repository } from "../services/client";
import { isApi } from "../services/data-source";
import { csvCell } from "../utils/download";
import { useRemoteResource } from "../composables/useRemoteResource";
import { useOperation } from "../composables/useOperation";
import PageHeading from "../components/PageHeading.vue";
import TrendChart from "../components/TrendChart.vue";
import InviteFunnel from "../components/InviteFunnel.vue";
import RelationBranch from "../components/RelationBranch.vue";
import ParentSelector from "../components/ParentSelector.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
const route = useRoute(),
  router = useRouter(),
  keyword = ref(""),
  dates = ref<string[]>([]),
  channel = ref(""),
  sort = ref("registrations");
const tab = ref("members"),
  direct = ref(true),
  childPage = ref(1);
const current = computed(() =>
  typeof route.query.member === "string" ? route.query.member : "",
);
watch(
  () => route.fullPath,
  () => {
    keyword.value = String(route.query.q ?? "");
    dates.value =
      route.query.start && route.query.end
        ? [String(route.query.start), String(route.query.end)]
        : [];
    channel.value = String(route.query.channel ?? "");
    sort.value = String(route.query.sort ?? "registrations");
    tab.value = String(route.query.tab ?? "members");
    childPage.value = Number(route.query.childPage ?? 1);
  },
  { immediate: true },
);
const q = (): Query => ({
  start: route.query.start as string,
  end: route.query.end as string,
  keyword: route.query.q as string,
  channel: route.query.channel as string,
  sort: route.query.sort as string,
  page: Number(route.query.page ?? 1),
  pageSize: 20,
});
const { data, loading, error, reload } = useRemoteResource(
  () => [route.fullPath, direct.value],
  async (signal) => {
    const list = await growth.referrers(q(), signal);
    const report = await growth.report(
      { ...q(), inviterId: current.value || undefined },
      signal,
    );
    const selected = current.value
      ? await growth.summary(current.value)
      : undefined;
    const children = current.value
      ? await growth.downstream(
          current.value,
          { direct: String(direct.value), page: childPage.value, pageSize: 20 },
          signal,
        )
      : undefined;
    const facts =
      current.value && tab.value === "history"
        ? await growth.facts(current.value, {
            page: childPage.value,
            pageSize: 20,
          })
        : undefined;
    return { list, report, selected, children, facts };
  },
);
function apply() {
  void router.replace({
    query: {
      ...route.query,
      q: keyword.value || undefined,
      start: dates.value?.[0],
      end: dates.value?.[1],
      channel: channel.value || undefined,
      sort: sort.value,
      page: 1,
    },
  });
}
function select(id: string) {
  void router.push({
    query: { ...route.query, member: id, childPage: 1, tab: "members" },
  });
}
function day(s: string) {
  dates.value = [s, s];
  apply();
}
function setTab(t: string) {
  void router.replace({ query: { ...route.query, tab: t, childPage: 1 } });
}
const channelName = (v: string) =>
  (
    ({
      link: "分享链接",
      qrcode: "二维码",
      manual: "人工建档",
      historical: "历史归因",
    }) as Record<string, string>
  )[v] ?? v;
watch(direct, () => {
  if (Number(route.query.childPage ?? 1) !== 1)
    void router.replace({ query: { ...route.query, childPage: 1 } });
});
const selectedName = computed(
  () =>
    data.value?.selected?.displayName ??
    data.value?.list.items.find((r) => r.id === current.value)?.displayName ??
    repository.read().tables.members.find((m) => m.id === current.value)
      ?.name ??
    "当前推荐人",
);
const { busy, error: actionError, run } = useOperation();
const correcting = ref(false),
  parent = ref(""),
  preview = ref<Record<string, any>>(),
  confirm = ref(false);
async function correct() {
  const r = await run(async () => {
    preview.value = isApi
      ? await get(`/referrals/${current.value}/correction-preview`)
      : {
          version: repository
            .read()
            .tables.members.find((m) => m.id === current.value)?.version,
        };
    correcting.value = true;
  });
  return r;
}
async function confirmCorrection(reason: string) {
  const r = await run(async () => {
    if (isApi)
      await api.request(
        "POST",
        `/referrals/${current.value}/correct`,
        {
          parentId: parent.value,
          version:
            preview.value?.graphVersion ?? data.value?.selected?.graphVersion,
          reason,
        },
        { authenticated: true },
      );
    else
      repository.correctParent(
        current.value,
        parent.value,
        reason,
        Number(preview.value?.version),
      );
  }, "邀请关系已更正，历史贡献保留");
  if (r.ok) {
    confirm.value = false;
    correcting.value = false;
    await reload();
  }
}
async function exportRows() {
  await run(async () => {
    if (
      !repository.globalCan("export:create") ||
      !repository.globalCan("export:download")
    )
      throw Error("没有导出及下载权限");
    let blob: Blob;
    if (isApi)
      blob = await api.request<Blob>(
        "GET",
        `/growth/referrers/export?${queryString(q())}`,
        undefined,
        { authenticated: true, blob: true },
      );
    else {
      const all = await growth.referrers({ ...q(), page: 1, pageSize: 10000 });
      blob = new Blob(
        [
          "\ufeff姓名,学号,注册人数\r\n" +
            all.items
              .map((r) =>
                [r.displayName, r.studentNo, r.registrations]
                  .map(csvCell)
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv" },
      );
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "推荐人贡献.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
</script>
<template>
  <PageHeading
    title="推荐人与邀请转化"
    description="先看谁带来了多少人，再查看具体学员、转化过程与历史归因。"
    ><el-button
      v-if="
        repository.globalCan('export:create') &&
        repository.globalCan('export:download')
      "
      :loading="busy"
      @click="exportRows"
      >导出当前筛选</el-button
    ><el-button @click="reload">刷新</el-button></PageHeading
  >
  <form class="filter-bar" novalidate @submit.prevent="apply">
    <el-input
      v-model="keyword"
      placeholder="推荐人姓名或学号"
      aria-label="推荐人搜索"
      clearable
    /><el-date-picker
      v-model="dates"
      type="daterange"
      value-format="YYYY-MM-DD"
      aria-label="邀请统计日期"
    /><el-select
      v-model="channel"
      aria-label="邀请渠道"
      clearable
      placeholder="全部渠道"
      ><el-option label="二维码" value="qrcode" /><el-option
        label="分享链接"
        value="link" /><el-option
        label="人工建档，无访问"
        value="manual" /><el-option
        label="历史归因"
        value="historical" /></el-select
    ><el-select v-model="sort" aria-label="贡献排序"
      ><el-option label="按注册人数" value="registrations" /><el-option
        label="按访问人数"
        value="visitors" /><el-option
        label="按转化率"
        value="conversionRate" /><el-option
        label="按有效报名"
        value="enrollments" /></el-select
    ><el-button type="primary" native-type="submit">查询</el-button>
  </form>
  <el-alert
    v-if="error || actionError"
    :title="error || actionError"
    type="error"
    :closable="false"
  />
  <p v-if="loading" role="status">正在更新邀请数据…</p>
  <template v-if="data"
    ><section class="panel">
      <h2>推荐人贡献榜</h2>
      <el-table
        role="region"
        :data="data.list.items"
        aria-label="推荐人贡献列表"
        ><el-table-column label="推荐人" min-width="170"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="select(row.id)">{{
              row.displayName
            }}</el-button>
            <div class="muted">{{ row.studentNo }}</div></template
          ></el-table-column
        ><el-table-column prop="visitors" label="访问人数" /><el-table-column
          prop="registrations"
          label="邀请注册" /><el-table-column
          prop="directCount"
          label="当前直属" /><el-table-column
          prop="downstreamCount"
          label="全部下游" /><el-table-column label="访问转化率"
          ><template #default="{ row }">{{
            row.conversionRate == null ? "—" : row.conversionRate + "%"
          }}</template></el-table-column
        ><el-table-column
          prop="enrollments"
          label="历史归因有效报名"
          min-width="155" /></el-table
      ><el-pagination
        :current-page="Number(route.query.page ?? 1)"
        :total="data.list.total"
        :page-size="20"
        layout="total,prev,pager,next"
        @current-change="
          router.replace({ query: { ...route.query, page: $event } })
        "
      />
      <p class="muted">
        访问人数按访客标识去重，各推荐人的人数不可直接相加；当前关系与历史贡献分别计算。
      </p>
    </section>
    <section v-if="current" class="panel">
      <div class="section-bar">
        <h2>{{ selectedName }}的邀请详情</h2>
        <el-button
          @click="
            router.replace({ query: { ...route.query, member: undefined } })
          "
          >查看全局统计</el-button
        ><el-button
          v-if="repository.globalCan('referral:correct')"
          @click="correct"
          >更正直属邀请人</el-button
        >
      </div>
      <p>
        直属 {{ data.selected?.direct ?? 0 }} 人 · 全部下游
        {{ data.selected?.downstream ?? 0 }} 人
      </p>
      <div class="upstream">
        上游：<el-button
          v-for="p in data.selected?.upstream ?? []"
          :key="p.id"
          link
          @click="select(p.id)"
          >{{ p.displayName }}</el-button
        ><span v-if="!data.selected?.upstream?.length">无</span>
      </div>
    </section>
    <p class="muted">
      {{ current ? "当前推荐人" : "全局" }} · 北京时间 · 更新于
      {{
        new Date(data.report.updatedAt).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        })
      }}
    </p>
    <div class="metrics">
      <div class="metric-card">
        <span>邀请访问次数</span
        ><strong>{{
          !data.report.collectionEnabled && !data.report.visits
            ? "未采集"
            : data.report.visits
        }}</strong
        ><small>有效落地 · 重试去重</small>
      </div>
      <div class="metric-card">
        <span>邀请访问人数</span
        ><strong>{{
          !data.report.collectionEnabled && !data.report.visitors
            ? "未采集"
            : data.report.visitors
        }}</strong
        ><small>按访客标识周期去重</small>
      </div>
      <div class="metric-card">
        <span>邀请注册人数</span><strong>{{ data.report.registrations }}</strong
        ><small>真实首次建档 · 按注册日期</small>
      </div>
      <div class="metric-card">
        <span>访问转化率</span
        ><strong>{{
          data.report.conversionRate === null
            ? "—"
            : data.report.conversionRate + "%"
        }}</strong
        ><small>已转化访客 / 去重访客</small>
      </div>
    </div>
    <TrendChart
      :title="current ? '该推荐人的访问与注册趋势' : '全局邀请访问与注册趋势'"
      :points="data.report.trend as unknown as Record<string, unknown>[]"
      :series="[
        { key: 'visitors', label: '访问人数' },
        { key: 'registrations', label: '注册人数' },
      ]"
      @select="day"
    />
    <InviteFunnel :report="data.report" />
    <section class="panel">
      <h2>注册来源渠道</h2>
      <el-table
        role="region"
        :data="data.report.channels"
        aria-label="邀请来源渠道"
        ><el-table-column label="来源"
          ><template #default="{ row }">{{
            channelName(row.channel)
          }}</template></el-table-column
        ><el-table-column
          prop="registrations"
          label="注册人数" /><el-table-column
          prop="unlinkedRegistrations"
          label="无关联访问"
      /></el-table>
    </section>
    <section v-if="current" class="panel">
      <el-tabs :model-value="tab" @update:model-value="setTab(String($event))"
        ><el-tab-pane label="被邀请学员" name="members" /><el-tab-pane
          label="关系结构"
          name="tree" /><el-tab-pane label="历史归因" name="history"
      /></el-tabs>
      <template v-if="tab === 'members'"
        ><el-checkbox v-model="direct">仅看直属邀请</el-checkbox
        ><el-table
          role="region"
          :data="data.children?.items ?? []"
          aria-label="被邀请学员名单"
          ><el-table-column label="学员" min-width="150"
            ><template #default="{ row }"
              ><el-button
                v-if="repository.can('member:read')"
                link
                @click="
                  router.push({ path: '/members', query: { member: row.id } })
                "
                >{{ row.displayName }}</el-button
              ><span v-else>{{ row.displayName }}</span></template
            ></el-table-column
          ><el-table-column prop="studentNo" label="学号" /><el-table-column
            prop="inviterName"
            label="直属邀请人" /><el-table-column
            prop="depth"
            label="层级" /><el-table-column
            prop="enrollments"
            label="有效报名" /><el-table-column
            prop="attendance"
            label="到课" /><el-table-column
            prop="createdAt"
            label="加入时间"
            min-width="190" /></el-table
      ></template>
      <RelationBranch
        v-else-if="tab === 'tree'"
        :key="current"
        :id="current"
        :label="selectedName"
        @select="select"
      />
      <el-table v-else :data="data.facts?.items ?? []" aria-label="历史邀请归因"
        ><el-table-column
          prop="displayName"
          label="被邀请学员" /><el-table-column label="贡献类型"
          ><template #default="{ row }">{{
            row.type === "registered" ? "注册" : "报名"
          }}</template></el-table-column
        ><el-table-column prop="depth" label="当时层级" /><el-table-column
          label="状态"
          ><template #default="{ row }">{{
            row.valid ? "有效" : "已冲销"
          }}</template></el-table-column
        ><el-table-column prop="occurredAt" label="发生时间" min-width="190"
      /></el-table>
      <el-pagination
        v-if="tab !== 'tree'"
        :current-page="childPage"
        :page-size="20"
        :total="
          tab === 'history'
            ? (data.facts?.total ?? 0)
            : (data.children?.total ?? 0)
        "
        layout="total,prev,pager,next"
        @current-change="
          router.replace({ query: { ...route.query, childPage: $event } })
        "
      />
    </section>
  </template>
  <el-dialog
    v-model="correcting"
    title="更正直属邀请人"
    width="min(600px,calc(100% - 32px))"
    ><p>更正会移动当前子树，历史注册和报名贡献保留原快照。</p>
    <ParentSelector v-model="parent" :member-id="current" />
    <template #footer
      ><el-button @click="correcting = false">取消</el-button
      ><el-button type="primary" :disabled="!parent" @click="confirm = true"
        >预览并确认更正</el-button
      ></template
    ></el-dialog
  >
  <ReasonDialog
    :open="confirm"
    title="确认更正上游"
    description="确认移动子树并保留历史贡献？"
    :busy="busy"
    :error-message="actionError"
    @close="confirm = false"
    @confirm="confirmCorrection"
  />
</template>
<style scoped>
.panel,
.trend-chart {
  margin-bottom: 24px;
}
.section-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.upstream {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
