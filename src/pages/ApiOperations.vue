<script setup lang="ts">
import { formatDateTime } from "../utils/date-time";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { api } from "../services/http";
import { apiRepository, labels } from "../services/api-repository";
import { modules } from "../config/modules";
import { useOperation } from "../composables/useOperation";
import AttachmentGallery from "../components/AttachmentGallery.vue";
import BannerEditor from "../components/BannerEditor.vue";
import PageHeading from "../components/PageHeading.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
type Item = Record<string, any>;
const route = useRoute(),
  router = useRouter();
const module = computed(() => String(route.meta.module));
const definition = computed(() => modules.find((m) => m.key === module.value)!);
const rows = ref<Item[]>([]),
  summary = ref<Item>({}),
  total = ref(0),
  loading = ref(false),
  error = ref("");
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const member = ref(String(route.query.member ?? "")),
  direct = ref(false),
  view = ref("courses"),
  detail = ref<Item>();
const keyword = ref(String(route.query.q ?? "")),
  academy = ref(String(route.query.academy ?? ""));
const dates = ref<string[]>([]);
const editing = ref(false),
  draft = ref<Item>({}),
  initial = ref(""),
  permissionList = ref<Item[]>([]),
  roleList = ref<Item[]>([]);
const config = ref<Item>({}),
  history = ref<Item[]>([]);
const { busy, error: actionError, run } = useOperation();
const pending = ref<{
  title: string;
  description: string;
  operation: (reason: string) => Promise<unknown>;
}>();
const auth = { authenticated: true };
const names: Record<string, string> = {
  id: "记录编号",
  name: "名称",
  title: "课程",
  displayName: "姓名",
  studentNo: "学号",
  code: "角色代码",
  username: "账号",
  roles: "角色",
  roleCodes: "角色",
  version: "版本",
  status: "状态",
  state: "状态",
  createdAt: "创建时间",
  actorId: "操作人",
  action: "操作",
  resourceType: "资源类型",
  targetId: "目标",
  reason: "原因",
  requestId: "请求编号",
  dataset: "来源",
  rowCount: "记录数",
  expiresAt: "有效期",
  eventId: "事件编号",
  eventName: "事件",
  memberId: "学员编号",
  courseId: "课程编号",
  academyId: "学院",
  occurredAt: "发生时间",
  receivedAt: "接收时间",
  late: "迟到事件",
  members: "人数",
  enrollments: "有效报名",
  impressions: "曝光",
  views: "浏览",
  favorites: "收藏",
  attendance: "出勤",
  cumulativeMembers: "累计用户",
  newMembers: "本期新增",
  activeMembers: "活跃用户",
  anonymousVisitors: "匿名访客",
  pendingMakeups: "待审核补签",
  accepted: "已接收",
  retentionDays: "保留天数",
  directCount: "直属邀请",
  descendantCount: "全部下游",
  totalDownstream: "全部下游",
  effectiveEnrollments: "有效报名",
  direct: "直属",
  downstream: "全部下游",
  registrations: "有效注册",
  count: "数量",
  total: "总数",
  global: "全部学院",
  academyIds: "学院范围",
  permissionCode: "权限动作",
};
function text(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
    return formatDateTime(value);
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object")
    return Array.isArray(value)
      ? value.map(text).join("、")
      : Object.entries(value as Item)
          .map(([k, v]) => `${names[k] ?? k}：${text(v)}`)
          .join("；");
  return labels[String(value)] ?? String(value);
}
const columns = computed(() =>
  Array.from(
    new Set(
      (rows.value.length
        ? rows.value
        : module.value === "overview"
          ? [{ title: "", enrollments: 0, members: 0 }]
          : []
      ).flatMap((r) => Object.keys(r)),
    ),
  )
    .filter(
      (k) =>
        ![
          "attachments",
          "grants",
          "passwordHash",
          "settings",
          "body",
          "securityVersion",
          "actor",
          "ownerId",
        ].includes(k),
    )
    .slice(0, 10),
);
const metrics = computed(() =>
  Object.entries(summary.value).filter(
    ([k, v]) => typeof v === "number" && !["version"].includes(k),
  ),
);
const canEdit = computed(() =>
  apiRepository.can(
    module.value === "roles"
      ? "role:grant"
      : module.value === "accounts"
        ? "admin:write"
        : module.value === "levels"
          ? "level:write"
          : "config:write",
  ),
);
const academies = computed(() => apiRepository.list("academies"));
const configKey = computed(() =>
  module.value === "levels" ? "levels" : "home",
);
let sequence = 0;
async function get<T = Item>(path: string) {
  return api.request<T>("GET", path, undefined, auth);
}
async function load() {
  const id = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: "20",
    });
    if (academy.value) params.set("academyId", academy.value);
    if (dates.value?.length === 2) {
      params.set("start", dates.value[0]!);
      params.set("end", dates.value[1]!);
    }
    const m = module.value;
    let result: Item;
    let stats: Item = {};
    if (m === "overview") {
      stats = await get(`/overview?${params}`);
      result = {
        items: stats.hotCourses ?? [],
        total: (stats.hotCourses ?? []).length,
      };
    } else if (["configs", "levels"].includes(m)) {
      const c = await get(`/configs/${configKey.value}`);
      const h = await get(`/configs/${configKey.value}/history?${params}`);
      if (id === sequence) {
        config.value = c;
        draft.value = structuredClone({
          ...c.settings,
          banners: c.settings?.banners ?? [],
        });
        history.value = h.items ?? [];
      }
      result = { items: h.items ?? [], total: h.total };
    } else if (m === "referrals" || m === "contributions") {
      const selected = member.value || apiRepository.list("members")[0]?.id;
      if (!selected) {
        result = { items: [], total: 0 };
      } else {
        member.value = selected;
        stats = await get(`/referrals/${selected}`);
        result = await get(
          `/referrals/${selected}/${m === "contributions" ? "contributions" : "downstream"}?${params}&direct=${direct.value}`,
        );
      }
    } else if (m === "analytics") {
      result = await get(`/analytics/${view.value}?${params}`);
      if (!Array.isArray(result.items)) {
        stats = result;
        result = {
          items: result.groups ?? [],
          total: (result.groups ?? []).length,
        };
      }
    } else {
      result = await get(`/${m}?${params}`);
      if (m === "events" && apiRepository.globalCan("event:read"))
        stats = await get("/events/quality");
    }
    if (id !== sequence) return;
    rows.value = result.items ?? [];
    total.value = Number(result.total ?? rows.value.length);
    summary.value = stats;
    if (m === "roles") {
      permissionList.value = await get<Item[]>("/permissions");
    }
    if (m === "accounts") {
      roleList.value = (await get("/roles?pageSize=100")).items ?? [];
    }
  } catch (e) {
    if (id === sequence)
      error.value = e instanceof Error ? e.message : "读取失败";
  } finally {
    if (id === sequence) loading.value = false;
  }
}
watch(() => [route.fullPath, view.value, direct.value], load, {
  immediate: true,
});
function filter() {
  void router.replace({
    query: {
      ...route.query,
      page: 1,
      q: keyword.value || undefined,
      academy: academy.value || undefined,
    },
  });
}
async function close(done?: () => void) {
  if (JSON.stringify(draft.value) !== initial.value) {
    try {
      await ElMessageBox.confirm("离开将放弃未保存内容。", "放弃修改？", {
        confirmButtonText: "放弃修改",
        cancelButtonText: "继续编辑",
      });
    } catch {
      return;
    }
  }
  editing.value = false;
  done?.();
}
function edit(row?: Item) {
  draft.value = row
    ? structuredClone(row)
    : module.value === "roles"
      ? { code: "", name: "", enabled: true, version: 0, grants: [] }
      : {
          username: "",
          displayName: "",
          active: true,
          version: 0,
          roleCodes: [],
          password: "",
        };
  initial.value = JSON.stringify(draft.value);
  editing.value = true;
}
function grant(action: string) {
  return (draft.value.grants ?? []).find((g: Item) => g.action === action);
}
function toggleGrant(action: string, on: boolean) {
  if (on)
    draft.value.grants.push({
      action,
      global:
        permissionList.value.find((p) => p.code === action)?.scopeMode ===
        "global",
      academyIds: [],
    });
  else
    draft.value.grants = draft.value.grants.filter(
      (g: Item) => g.action !== action,
    );
}
function askSave() {
  pending.value = {
    title: "确认保存",
    description: "保存权限或账号会撤销受影响的旧会话，请填写操作原因。",
    operation: async (reason) => {
      const m = module.value;
      const d = draft.value;
      const body =
        m === "roles"
          ? {
              code: d.code,
              name: d.name,
              enabled: d.enabled,
              version: d.version,
              grants: d.grants,
              reason,
            }
          : {
              username: d.username,
              displayName: d.displayName,
              active: d.active,
              version: d.version,
              roleCodes: d.roleCodes,
              password: d.password || undefined,
              reason,
            };
      await api.request(
        m === "accounts" && !d.id ? "POST" : "PUT",
        m === "roles"
          ? `/roles/${d.code}`
          : `/accounts${d.id ? "/" + d.id : ""}`,
        body,
        auth,
      );
      editing.value = false;
      await load();
    },
  };
}
async function perform(reason: string) {
  const op = pending.value;
  if (!op) return;
  const result = await run(() => op.operation(reason), "操作已完成");
  if (result.ok) {
    pending.value = undefined;
    await load();
  }
}
function download(row: Item) {
  void run(async () => {
    const blob = await api.request<Blob>(
      "GET",
      `/exports/${row.id}/download`,
      undefined,
      { ...auth, blob: true },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "青木私语学苑-导出.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function retryExport(row: Item) {
  pending.value = {
    title: "重试导出",
    description: "重新生成此导出任务并按当前权限校验。",
    operation: (reason) =>
      api.request(
        "POST",
        `/exports/${row.id}/retry`,
        { version: row.version, reason },
        auth,
      ),
  };
}
function correctParent() {
  const target = apiRepository
    .list("members")
    .find((m) => m.id === member.value);
  draft.value = { parentId: "", version: target?.version ?? 1 };
  initial.value = JSON.stringify(draft.value);
  editing.value = true;
}
function saveCorrection() {
  pending.value = {
    title: "确认更正直属邀请人",
    description:
      "会移动当前会员及其下游，历史归因保留；服务端会校验权限、防环和版本。",
    operation: async (reason) => {
      await api.request(
        "POST",
        `/referrals/${member.value}/correct`,
        {
          parentId: draft.value.parentId || null,
          version: summary.value.graphVersion,
          reason,
        },
        auth,
      );
      editing.value = false;
      await apiRepository.references();
    },
  };
}
function configure(publish: boolean) {
  pending.value = {
    title: publish ? "发布配置" : "保存配置草稿",
    description: publish
      ? "发布后H5读取新的公开配置。"
      : "草稿不会立即影响H5公开内容。",
    operation: (reason) =>
      api.request(
        publish ? "POST" : "PUT",
        `/configs/${configKey.value}${publish ? "/publish" : ""}`,
        { version: config.value.version, settings: draft.value, reason },
        auth,
      ),
  };
}
function rollback(row: Item) {
  pending.value = {
    title: "回滚公开配置",
    description: "将此历史发布版本恢复为新的公开版本，保留完整版本记录。",
    operation: (reason) =>
      api.request(
        "POST",
        `/configs/${configKey.value}/rollback/${row.version}`,
        {
          version: config.value.version,
          settings: config.value.settings,
          reason,
        },
        auth,
      ),
  };
}
</script>
<template>
  <PageHeading :title="definition.title" :description="definition.description"
    ><el-button :loading="loading" @click="load">刷新</el-button
    ><el-button
      v-if="['accounts', 'roles'].includes(module) && canEdit"
      type="primary"
      @click="edit()"
      >{{ module === "roles" ? "新建角色" : "新建账号" }}</el-button
    ></PageHeading
  >
  <section class="panel">
    <div
      v-if="['overview', 'analytics', 'events'].includes(module)"
      class="filter-bar"
    >
      <el-select
        v-model="academy"
        clearable
        placeholder="全部授权学院"
        aria-label="学院"
        ><el-option
          v-for="a in academies"
          :key="a.id"
          :label="a.name"
          :value="a.id" /></el-select
      ><el-date-picker
        v-model="dates"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
      /><el-button
        @click="
          filter();
          load();
        "
        >查询</el-button
      ><el-select
        v-if="module === 'analytics'"
        v-model="view"
        aria-label="统计类型"
        ><el-option label="课程偏好" value="courses" /><el-option
          label="转化漏斗"
          value="funnel" /><el-option label="活跃人群" value="segments"
      /></el-select>
    </div>
    <div
      v-if="['referrals', 'contributions'].includes(module)"
      class="filter-bar"
    >
      <el-select
        v-model="member"
        filterable
        aria-label="查看会员"
        @change="load"
        ><el-option
          v-for="m in apiRepository.list('members')"
          :key="m.id"
          :value="m.id"
          :label="`${m.name} · ${m.studentNo}`" /></el-select
      ><el-checkbox v-if="module === 'referrals'" v-model="direct"
        >仅直属下游</el-checkbox
      ><el-button
        v-if="apiRepository.can('referral:correct')"
        :disabled="!member"
        @click="correctParent"
        >更正直属邀请人</el-button
      >
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      role="alert"
    />
    <div v-if="metrics.length" class="api-metrics">
      <article v-for="[key, value] in metrics" :key="key">
        <p>{{ names[key] ?? key }}</p>
        <strong>{{ value }}</strong>
      </article>
    </div>
    <el-descriptions
      v-if="['referrals', 'contributions'].includes(module) && member"
      title="来源与邀请汇总"
      :column="2"
      border
      ><el-descriptions-item
        v-for="(value, key) in summary"
        :key="key"
        :label="names[key] ?? String(key)"
        >{{ text(value) }}</el-descriptions-item
      ></el-descriptions
    >
    <template v-if="['configs', 'levels'].includes(module)">
      <el-form
        novalidate
        label-position="top"
        @submit.prevent="configure(false)"
      >
        <template v-if="module === 'configs'"
          ><el-form-item label="客服说明"
            ><el-input
              v-model="draft.serviceText"
              type="textarea"
              :rows="3" /></el-form-item
          ><el-form-item label="福利链接（HTTPS）"
            ><el-input v-model="draft.externalUrl" /></el-form-item
          ><el-form-item label="推荐课程"
            ><el-select v-model="draft.courseIds" multiple aria-label="推荐课程"
              ><el-option
                v-for="c in apiRepository
                  .list('courses')
                  .filter((c) => c.status === '已发布')"
                :key="c.id"
                :label="c.name"
                :value="c.id" /></el-select
          ></el-form-item>
          <BannerEditor v-model="draft.banners" :disabled="!canEdit || busy" />
          <section v-for="key in ['shortcuts']" :key="key">
            <h3>快捷入口</h3>
            <div
              v-for="(entry, index) in draft[key] ?? []"
              :key="index"
              class="filter-bar"
            >
              <el-input
                v-model="entry.title"
                aria-label="入口标题"
                placeholder="标题"
              /><el-input
                v-model="entry.to"
                aria-label="站内路径"
                placeholder="/courses"
              /><el-select
                v-model="entry.imageUrl"
                clearable
                aria-label="入口图片"
                ><el-option
                  v-for="m in apiRepository.list('media')"
                  :key="m.id"
                  :label="m.name"
                  :value="m.url" /></el-select
              ><el-button @click="draft[key].splice(index, 1)">移除</el-button>
            </div>
            <el-button
              @click="
                (draft[key] ??= []).push({
                  title: '',
                  to: '/courses',
                  imageUrl: '',
                })
              "
              >添加入口</el-button
            >
          </section></template
        >
        <template v-else
          ><div
            v-for="(level, index) in draft.levels ?? []"
            :key="index"
            class="filter-bar"
          >
            <el-input
              v-model="level.name"
              aria-label="等级名称"
            /><el-input-number
              v-model="level.threshold"
              :min="0"
              aria-label="所需学分"
            /><el-input
              v-model="level.benefit"
              aria-label="权益说明"
            /><el-button @click="draft.levels.splice(index, 1)"
              >移除等级</el-button
            >
          </div>
          <el-button
            @click="
              (draft.levels ??= []).push({
                name: '',
                threshold: 0,
                benefit: '',
              })
            "
            >添加等级</el-button
          ></template
        >
        <div class="filter-bar">
          <el-button v-if="canEdit" :loading="busy" native-type="submit"
            >保存草稿</el-button
          ><el-button
            v-if="
              apiRepository.can(
                module === 'levels' ? 'level:publish' : 'config:publish',
              )
            "
            type="primary"
            :loading="busy"
            @click="configure(true)"
            >发布配置</el-button
          >
        </div>
      </el-form>
      <h3>配置版本记录</h3>
    </template>
    <el-table
      v-loading="loading"
      :data="rows"
      :aria-label="definition.title"
      @row-dblclick="detail = $event"
      ><el-table-column
        v-for="key in columns"
        :key="key"
        :label="names[key] ?? key"
        min-width="150"
        ><template #default="{ row }">{{
          text(row[key])
        }}</template></el-table-column
      ><el-table-column label="操作" min-width="160"
        ><template #default="{ row }"
          ><el-button link @click="detail = row">详情</el-button
          ><el-button
            v-if="['accounts', 'roles'].includes(module) && canEdit"
            link
            @click="edit(row)"
            >编辑</el-button
          ><el-button
            v-if="
              module === 'exports' &&
              row.status === 'ready' &&
              apiRepository.can('export:download')
            "
            link
            @click="download(row)"
            >下载CSV</el-button
          ><el-button
            v-if="
              module === 'exports' &&
              row.status === 'failed' &&
              apiRepository.can('export:create')
            "
            link
            @click="retryExport(row)"
            >重试</el-button
          ><el-button
            v-if="
              ['configs', 'levels'].includes(module) &&
              row.state === 'published' &&
              apiRepository.can(
                module === 'levels' ? 'level:publish' : 'config:publish',
              )
            "
            link
            @click="rollback(row)"
            >回滚至此版本</el-button
          ></template
        ></el-table-column
      ><template #empty
        ><p>{{ error ? "读取失败，请重试" : "暂无记录" }}</p></template
      ></el-table
    >
    <el-pagination
      :current-page="page"
      :page-size="20"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="
        router.replace({ query: { ...route.query, page: $event } })
      "
    />
  </section>
  <el-dialog
    :model-value="editing"
    title="编辑信息"
    :before-close="close"
    width="760px"
    ><el-form
      novalidate
      label-position="top"
      @submit.prevent="
        ['referrals', 'contributions'].includes(module)
          ? saveCorrection()
          : askSave()
      "
    >
      <template v-if="module === 'roles'"
        ><el-form-item label="角色代码"
          ><el-input
            v-model="draft.code"
            :disabled="!!draft.id" /></el-form-item
        ><el-form-item label="角色名称"
          ><el-input v-model="draft.name" /></el-form-item
        ><el-checkbox v-model="draft.enabled">启用</el-checkbox>
        <div v-for="p in permissionList" :key="p.code" class="filter-bar">
          <el-checkbox
            :model-value="!!grant(p.code)"
            @change="toggleGrant(p.code, !!$event)"
            >{{ p.name ?? p.code }}</el-checkbox
          ><template v-if="grant(p.code)"
            ><el-checkbox v-model="grant(p.code).global">全部学院</el-checkbox
            ><el-select
              v-if="!grant(p.code).global"
              v-model="grant(p.code).academyIds"
              multiple
              aria-label="授权学院"
              ><el-option
                v-for="a in academies"
                :key="a.id"
                :label="a.name"
                :value="a.id" /></el-select
          ></template></div
      ></template>
      <template v-else-if="module === 'accounts'"
        ><el-form-item label="登录账号"
          ><el-input v-model="draft.username" /></el-form-item
        ><el-form-item label="姓名"
          ><el-input v-model="draft.displayName" /></el-form-item
        ><el-form-item :label="draft.id ? '重设口令（留空不修改）' : '初始口令'"
          ><el-input
            v-model="draft.password"
            type="password"
            show-password
            autocomplete="new-password" /></el-form-item
        ><el-form-item label="角色"
          ><el-select v-model="draft.roleCodes" multiple aria-label="角色"
            ><el-option
              v-for="r in roleList"
              :key="r.code"
              :value="r.code"
              :label="r.name" /></el-select></el-form-item
        ><el-checkbox v-model="draft.active">启用账号</el-checkbox></template
      >
      <template v-else
        ><el-form-item label="新的直属邀请人（清空表示解除）"
          ><el-select
            v-model="draft.parentId"
            filterable
            clearable
            aria-label="直属邀请人"
            ><el-option
              v-for="m in apiRepository
                .list('members')
                .filter((m) => m.id !== member)"
              :key="m.id"
              :label="m.name"
              :value="m.id" /></el-select></el-form-item
      ></template>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <el-button :loading="busy" type="primary" native-type="submit"
        >保存并确认</el-button
      ></el-form
    ></el-dialog
  >
  <el-drawer
    :model-value="!!detail"
    title="记录详情"
    @close="detail = undefined"
    ><AttachmentGallery :items="detail?.attachments" /><el-descriptions
      :column="1"
      border
      ><el-descriptions-item
        v-for="(value, key) in detail"
        :key="key"
        :label="names[key] ?? String(key)"
        >{{ text(value) }}</el-descriptions-item
      ></el-descriptions
    ></el-drawer
  >
  <ReasonDialog
    :open="!!pending"
    :title="pending?.title ?? ''"
    :description="pending?.description ?? ''"
    :busy="busy"
    :error-message="actionError"
    @confirm="perform"
    @close="pending = undefined"
  />
</template>
<style scoped>
.api-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.api-metrics article {
  padding: 16px;
  border: 1px solid var(--color-border, #e2e7ed);
  border-radius: 12px;
}
.api-metrics strong {
  font-size: 26px;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0;
}
.filter-bar > .el-input,
.filter-bar > .el-select {
  width: 220px;
}
</style>
