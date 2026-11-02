<script setup lang="ts">
import { isApi } from "../services/data-source";
import { uuid } from "../utils/uuid";

import { useDraftGuard } from "../composables/useDraftGuard";
import { clone } from "../utils/clone";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { modules, columnsFor } from "../config/modules";
import { repository } from "../services/client";
import { useList } from "../composables/useList";
import { useOperation } from "../composables/useOperation";
import { row } from "../mock/seed";
import type { Row, TableName } from "../types";
import MediaPreview from "../components/MediaPreview.vue";
import AttachmentGallery from "../components/AttachmentGallery.vue";
import PageHeading from "../components/PageHeading.vue";
import EntityForm from "../components/EntityForm.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
const route = useRoute(),
  router = useRouter();
const module = computed(() =>
  modules.find((m) => m.key === route.meta.module)!,
);
const table = () => module.value.table!;
const {
  rows,
  loading,
  error,
  query,
  filtered,
  total,
  pageRows,
  setQuery,
  load,
} = useList(table);
const { busy, error: actionError, run } = useOperation();
const keyword = ref(query.value.q);
const editor = ref(false),
  draft = ref<Row>(row("", "")),
  initial = ref("");
const form = ref<InstanceType<typeof EntityForm>>();
const selected = ref<Row[]>([]);
useDraftGuard(
  () => editor.value && JSON.stringify(draft.value) !== initial.value,
);
const detail = ref<Row>();
function imageFor(row: Row) {
  return String(
    row.url ??
      row.coverUrl ??
      row.imageUrl ??
      repository.read().tables.media.find((m) => m.id === row.coverId)?.url ??
      "",
  );
}

const detailFields = computed(() =>
  detail.value
    ? Object.fromEntries(
        Object.entries(detail.value).filter(
          ([key]) =>
            ![
              "publishedSnapshot",
              "previousSnapshot",
              "url",
              "attachments",
            ].includes(key),
        ),
      )
    : {},
);
const detailNames: Record<string, string> = {
  id: "记录编号",
  name: "名称",
  academyId: "所属学院",
  status: "状态",
  version: "版本",
  createdAt: "创建时间",
  repliedAt: "回复时间",
  category: "问题类型",
  content: "反馈内容",
  studentNo: "学号",
  phoneMasked: "手机号（脱敏）",
  inviterId: "直属邀请人",
  source: "注册来源",
  description: "内容说明",
  teacherId: "教师编号",
  categoryId: "分类编号",
  venueId: "地点编号",
  roomId: "教室编号",
  memberId: "会员编号",
  sessionId: "场次编号",
  courseId: "课程编号",
  enrollmentId: "报名编号",
  amount: "学分",
  attendance: "出勤状态",
  reviewed: "是否已评价",
  rating: "评分",
  reason: "申请说明",
  reply: "站内答复",
  capacity: "容量",
  startAt: "开课时间",
  endAt: "结束时间",
  registrationStart: "报名开始",
  registrationEnd: "报名截止",
  publishedVersion: "公开版本",
  serviceText: "客服说明",
  externalUrl: "福利外链",
  academyIds: "关联学院",
  courseIds: "推荐课程",
  sort: "显示顺序",
  threshold: "学分门槛",
};

const reason = ref<{
  title: string;
  description: string;
  record: Row;
  status?: string;
  attendance?: "签到" | "签退";
}>();
const enrollment = ref(false),
  enrollmentSession = ref(""),
  enrollmentMember = ref("");
const actionPrefix = computed(() => module.value.permission.split(":")[0]);
const canWrite = computed(() => repository.can(`${actionPrefix.value}:write`));
const canPublish = computed(() =>
  repository.can(
    `${actionPrefix.value}:${table() === "sessions" ? "write" : "publish"}`,
  ),
);
const academies = computed(() => {
  try {
    return repository.list("academies");
  } catch {
    return [];
  }
});
const statuses = computed(() => [...new Set(rows.value.map((r) => r.status))]);
function edit(record?: Row) {
  if (table() === "courses") {
    void router.push({
      path: record ? `/courses/${record.id}/edit` : "/courses/new",
      query: { return: route.fullPath },
    });
    return;
  }
  draft.value = record
    ? clone(record)
    : row(uuid(), "", {
        version: 0,
        status: ["sessions", "messages", "configs", "levels"].includes(table())
          ? "草稿"
          : "启用",
        academyId: academies.value[0]?.id ?? "humanities",
      });
  if (table() === "venues" && !record)
    draft.value.academyIds = [draft.value.academyId];
  if (table() === "configs") draft.value.banners ??= [];
  initial.value = JSON.stringify(draft.value);
  editor.value = true;
}
async function save() {
  if (!(await form.value?.validate())) return;
  const result = await run(
    () => repository.save(table(), draft.value),
    "已保存",
  );
  if (result.ok) {
    editor.value = false;
    await load();
  }
}
async function close(done?: () => void) {
  if (JSON.stringify(draft.value) !== initial.value) {
    try {
      await ElMessageBox.confirm(
        "尚有未保存内容，离开将放弃本次修改。",
        "放弃修改？",
        {
          confirmButtonText: "放弃修改",
          cancelButtonText: "继续编辑",
          type: "warning",
        },
      );
    } catch {
      return;
    }
  }
  editor.value = false;
  done?.();
}
function ask(record: Row, status: string) {
  reason.value = {
    title:
      status === "已发布"
        ? "确认发布"
        : status === "已通过"
          ? "通过补签"
          : status === "已驳回"
            ? "驳回补签"
            : status === "回滚"
              ? "回滚配置"
              : status,
    description: `${record.name}：本操作会更新业务状态并保留审计记录。`,
    record,
    status,
  };
}
async function execute(why: string) {
  if (!reason.value) return;
  const current = reason.value;
  const result = await run(
    () =>
      current.attendance
        ? repository.attendance(current.record.id, current.attendance, why)
        : repository.transition(
            table(),
            current.record.id,
            current.status!,
            current.record.version,
            why,
          ),
    "操作已完成",
  );
  if (result.ok) {
    reason.value = undefined;
    await load();
  }
}
function show(value: unknown, key: string) {
  if (key === "category")
    return (
      (
        {
          course: "课程",
          attendance: "考勤",
          account: "账户",
          other: "其他",
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  if (key === "phoneMasked" && !value) return "—";
  if (key === "academyId")
    return academies.value.find((a) => a.id === value)?.name ?? String(value);
  return Array.isArray(value) ? value.join("、") : String(value ?? "—");
}
async function exportRows() {
  const target = (
    selected.value.length ? selected.value : isApi ? [] : filtered.value
  ).map((r) => r.id);
  const result = await run(
    () => repository.createExport(table(), target, JSON.stringify(query.value)),
    "已创建导出任务",
  );
  if (result.ok) void router.push("/exports");
}
function options(t: TableName) {
  try {
    return repository.list(t);
  } catch {
    return [];
  }
}
async function enroll() {
  const result = await run(
    () => repository.enroll(enrollmentSession.value, enrollmentMember.value),
    "代报名已记录",
  );
  if (result.ok) {
    enrollment.value = false;
    await load();
  }
}
</script>
<template>
  <PageHeading :title="module.title" :description="module.description"
    ><el-button v-if="repository.can('export:create')" @click="exportRows"
      >导出{{ selected.length ? "所选" : "筛选结果" }}</el-button
    ><el-button
      v-if="
        canWrite &&
        !(isApi && table() === 'feedback') &&
        module.fields &&
        (table() !== 'academies' || repository.globalCan('academy:write'))
      "
      type="primary"
      @click="edit()"
      >新建{{ module.title.replace("管理", "") }}</el-button
    ><el-button
      v-if="table() === 'enrollments' && canWrite"
      type="primary"
      @click="enrollment = true"
      >代报名</el-button
    ></PageHeading
  >
  <section class="panel">
    <form
      class="filter-bar"
      novalidate
      @submit.prevent="setQuery({ q: keyword, page: 1 })"
    >
      <el-input
        v-model="keyword"
        placeholder="搜索名称、编号"
        aria-label="搜索名称、编号"
        clearable
        @clear="setQuery({ q: undefined, page: 1 })"
      /><el-select
        :model-value="query.academy"
        aria-label="学院筛选"
        placeholder="全部学院"
        clearable
        @update:model-value="
          setQuery({ academy: $event || undefined, page: 1 })
        "
        ><el-option
          v-for="academy in academies"
          :key="academy.id"
          :value="academy.id"
          :label="academy.name" /></el-select
      ><el-select
        :model-value="query.status"
        aria-label="状态筛选"
        placeholder="全部状态"
        clearable
        @update:model-value="setQuery({ status: $event || undefined, page: 1 })"
        ><el-option
          v-for="status in statuses"
          :key="status"
          :value="status"
          :label="status" /></el-select
      ><el-button native-type="submit" type="primary">查询</el-button
      ><el-button
        @click="
          keyword = '';
          router.replace({ query: {} });
        "
        >清空筛选</el-button
      >
    </form>
    <el-alert
      v-if="error || actionError"
      :title="error || actionError"
      type="error"
      :closable="false"
      show-icon
    /><el-button v-if="error" @click="load">重新加载</el-button
    ><el-table
      v-loading="loading"
      :data="pageRows"
      row-key="id"
      stripe
      aria-label="业务记录"
      @selection-change="selected = $event"
      @sort-change="
        setQuery({
          sort: $event.prop ?? 'name',
          direction: $event.order === 'descending' ? 'desc' : 'asc',
          page: 1,
        })
      "
      ><el-table-column
        v-if="['media', 'courses', 'academies', 'venues'].includes(table())"
        label="图片"
        width="115"
        ><template #default="{ row: record }"
          ><MediaPreview
            :src="imageFor(record)"
            :alt="record.name"
            compact /></template></el-table-column
      ><el-table-column
        v-if="repository.can('export:create')"
        type="selection"
        width="46" /><el-table-column
        v-for="column in columnsFor(module)"
        :key="column.key"
        :prop="column.key"
        :label="column.label"
        :min-width="column.width ?? 130"
        sortable="custom"
        ><template #default="{ row: record }"
          ><el-tag
            v-if="column.key === 'status'"
            :type="
              ['已发布', '已通过', '已入账', '启用'].includes(record.status)
                ? 'success'
                : 'info'
            "
            effect="light"
            >{{ record.status }}</el-tag
          ><template v-else>{{
            show(record[column.key], column.key)
          }}</template></template
        ></el-table-column
      ><el-table-column label="操作" :min-width="290"
        ><template #default="{ row: record }"
          ><el-button link type="primary" @click="detail = record"
            >详情</el-button
          ><el-button
            v-if="canWrite && module.fields"
            link
            type="primary"
            @click="edit(record)"
            >编辑</el-button
          ><el-button
            v-if="
              canPublish &&
              (isApi
                ? ['courses']
                : ['courses', 'sessions', 'configs']
              ).includes(table()) &&
              (isApi || record.status !== '已发布')
            "
            link
            type="primary"
            @click="ask(record, '已发布')"
            >发布</el-button
          ><el-button
            v-if="
              canPublish && table() === 'courses' && record.status === '已发布'
            "
            link
            @click="ask(record, '已下架')"
            >下架</el-button
          ><el-button
            v-if="
              canWrite &&
              [
                'academies',
                'venues',
                'teachers',
                'categories',
                'media',
              ].includes(table())
            "
            link
            @click="ask(record, record.status === '停用' ? '启用' : '停用')"
            >{{ record.status === "停用" ? "启用" : "停用" }}</el-button
          ><template
            v-if="
              table() === 'makeups' && canWrite && record.status === '待审核'
            "
            ><el-button link type="primary" @click="ask(record, '已通过')"
              >通过</el-button
            ><el-button link type="danger" @click="ask(record, '已驳回')"
              >驳回</el-button
            ></template
          ><template
            v-if="
              table() === 'enrollments' &&
              canWrite &&
              record.status === '已报名'
            "
            ><el-button
              link
              type="primary"
              @click="
                reason = {
                  title:
                    record.attendance === '未签到' ? '人工签到' : '人工签退',
                  description: '请核对到场事实，并填写核验依据。',
                  record,
                  attendance: record.attendance === '未签到' ? '签到' : '签退',
                }
              "
              >{{ record.attendance === "未签到" ? "签到" : "签退" }}</el-button
            ><el-button
              v-if="record.attendance === '未签到'"
              link
              @click="ask(record, '已取消')"
              >取消报名</el-button
            ></template
          ><el-button
            v-if="
              table() === 'credits' &&
              canWrite &&
              record.status === '已入账' &&
              !record.originalId
            "
            link
            @click="ask(record, '已冲正')"
            >冲正</el-button
          ><el-button
            v-if="
              table() === 'messages' && canWrite && record.status !== '已发送'
            "
            link
            @click="ask(record, '已发送')"
            >发送通知</el-button
          ><el-button
            v-if="
              table() === 'levels' &&
              canWrite &&
              (isApi || record.status !== '已发布')
            "
            link
            type="primary"
            @click="ask(record, '已发布')"
            >发布规则</el-button
          ><el-button
            v-if="
              table() === 'sessions' &&
              canPublish &&
              ['已发布', '报名中'].includes(record.status)
            "
            link
            @click="ask(record, '已关闭')"
            >关闭报名</el-button
          ><el-button
            v-if="
              table() === 'courses' &&
              canPublish &&
              record.status !== '已发布' &&
              record.status !== '已归档'
            "
            link
            @click="ask(record, '已归档')"
            >归档</el-button
          ><el-button
            v-if="table() === 'configs' && canPublish"
            link
            @click="ask(record, '回滚')"
            >回滚</el-button
          ><el-button
            v-if="
              !isApi &&
              table() === 'feedback' &&
              canWrite &&
              record.status === '待处理'
            "
            link
            @click="ask(record, '已处理')"
            >标记已处理</el-button
          ><el-button
            v-if="
              isApi &&
              table() === 'feedback' &&
              canWrite &&
              record.status === '待处理'
            "
            link
            @click="ask(record, '开始处理')"
            >开始处理</el-button
          >
          <el-button
            v-if="isApi && table() === 'evaluations' && canWrite"
            link
            @click="ask(record, record.hidden ? '恢复评价' : '隐藏评价')"
            >{{ record.hidden ? "恢复展示" : "隐藏评价" }}</el-button
          >
          <el-button
            v-if="
              isApi &&
              table() === 'sessions' &&
              canWrite &&
              record.status !== '已取消'
            "
            link
            @click="ask(record, '已取消')"
            >取消整场</el-button
          >
        </template></el-table-column
      ><template #empty
        ><el-empty
          :description="
            query.q || query.academy || query.status
              ? '没有匹配记录，请调整筛选条件'
              : '暂无记录'
          "
          :image-size="60" /></template
    ></el-table>
    <div class="table-footer">
      <span
        >共 {{ total }} 条{{
          selected.length ? ` · 当前选中 ${selected.length} 条` : ""
        }}</span
      ><el-select
        class="page-size-control"
        :model-value="query.size"
        aria-label="每页条数"
        @update:model-value="setQuery({ size: $event, page: 1 })"
        ><el-option
          v-for="size in [10, 20, 50]"
          :key="size"
          :value="size"
          :label="`${size}条/页`" /></el-select
      ><el-pagination
        :current-page="query.page"
        :page-size="query.size"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="prev,pager,next"
        @current-change="setQuery({ page: $event })"
        @size-change="setQuery({ size: $event, page: 1 })"
      />
    </div>
  </section>
  <el-drawer
    v-model="editor"
    :title="`${draft.version ? '编辑' : '新建'}${module.title}`"
    size="min(720px,100%)"
    :before-close="close"
    ><EntityForm
      ref="form"
      v-model="draft"
      :fields="module.fields ?? []"
      :busy="busy"
      @submit="save"
    />
    <p v-if="actionError" role="alert" class="error-text">{{ actionError }}</p>
    <template #footer
      ><el-button :disabled="busy" @click="close()">取消</el-button
      ><el-button type="primary" :loading="busy" @click="save"
        >保存修改</el-button
      ></template
    ></el-drawer
  ><el-drawer
    :model-value="!!detail"
    title="记录详情"
    size="min(600px,100%)"
    @close="detail = undefined"
    ><AttachmentGallery
      v-if="isApi && detail"
      :items="detail.attachments as { id: string }[]"
    /><el-descriptions v-if="detail" :column="1" border
      ><el-descriptions-item
        v-for="(value, key) in detailFields"
        :key="key"
        :label="detailNames[String(key)] ?? String(key)"
        ><span class="break-word">{{
          show(value, String(key))
        }}</span></el-descriptions-item
      >
    </el-descriptions>
    <div v-if="detail && table() === 'members'" class="member-detail-links">
      <RouterLink :to="{ path: '/enrollments', query: { member: detail.id } }"
        ><el-button>查看报名记录</el-button></RouterLink
      ><RouterLink
        v-if="repository.can('credit:read')"
        :to="{ path: '/credits', query: { member: detail.id } }"
        ><el-button>查看学分流水</el-button></RouterLink
      ><RouterLink
        v-if="repository.can('referral:read')"
        :to="{ path: '/referrals', query: { member: detail.id } }"
        ><el-button>查看邀请关系</el-button></RouterLink
      >
    </div></el-drawer
  ><ReasonDialog
    :open="!!reason"
    :title="reason?.title ?? ''"
    :description="reason?.description ?? ''"
    :busy="busy"
    @close="reason = undefined"
    @confirm="execute"
  /><el-dialog
    v-model="enrollment"
    title="后台代报名"
    width="min(560px,calc(100% - 32px))"
    ><el-form novalidate label-position="top"
      ><el-form-item label="开课场次"
        ><el-select v-model="enrollmentSession" aria-label="开课场次"
          ><el-option
            v-for="s in options('sessions').filter(
              (r) => r.status === '已发布',
            )"
            :key="s.id"
            :label="s.name"
            :value="s.id" /></el-select></el-form-item
      ><el-form-item label="学员"
        ><el-select v-model="enrollmentMember" aria-label="学员" filterable
          ><el-option
            v-for="m in options('members')"
            :key="m.id"
            :label="m.name"
            :value="m.id" /></el-select></el-form-item
    ></el-form>
    <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
    <template #footer
      ><el-button @click="enrollment = false">取消</el-button
      ><el-button type="primary" :loading="busy" @click="enroll"
        >确认代报名</el-button
      ></template
    ></el-dialog
  >
</template>
