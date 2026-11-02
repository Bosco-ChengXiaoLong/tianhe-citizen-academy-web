<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import type { FormInstance } from "element-plus";
import type {
  CareProfile,
  FollowupRecord,
} from "../../shared/contracts/growth";
import { growth, type Query } from "../services/growth";
import { repository } from "../services/client";
import { uuid } from "../utils/uuid";
import { useRemoteResource } from "../composables/useRemoteResource";
import { useOperation } from "../composables/useOperation";
import { useDraftGuard } from "../composables/useDraftGuard";
import PageHeading from "../components/PageHeading.vue";
const route = useRoute(),
  router = useRouter(),
  keyword = ref(String(route.query.q ?? "")),
  segment = ref(String(route.query.segment ?? "")),
  academy = ref(String(route.query.academy ?? ""));
const dates = ref<string[]>(
  route.query.start && route.query.end
    ? [String(route.query.start), String(route.query.end)]
    : [],
);
const page = computed(() => Math.max(1, Number(route.query.page ?? 1))),
  selected = computed(() =>
    typeof route.query.member === "string" ? route.query.member : "",
  );
const q = (): Query => ({
  keyword: route.query.q as string,
  academyId: route.query.academy as string,
  segment: route.query.segment as string,
  start: route.query.start as string,
  end: route.query.end as string,
  page: page.value,
  pageSize: 20,
});
watch(
  () => route.fullPath,
  () => {
    keyword.value = String(route.query.q ?? "");
    segment.value = String(route.query.segment ?? "");
    academy.value = String(route.query.academy ?? "");
    dates.value =
      route.query.start && route.query.end
        ? [String(route.query.start), String(route.query.end)]
        : [];
  },
);
const list = useRemoteResource(
  () => [
    route.query.q,
    route.query.academy,
    route.query.segment,
    route.query.start,
    route.query.end,
    page.value,
  ],
  (signal) => growth.members(q(), signal),
);
const recordPage = ref(1),
  member = ref<Record<string, any>>(),
  care = ref<CareProfile>({ note: "", version: 0 }),
  originalNote = ref(""),
  records = ref<FollowupRecord[]>([]),
  recordTotal = ref(0),
  detailLoading = ref(false),
  detailError = ref("");
let detailSequence = 0;
async function readCare() {
  const id = ++detailSequence;
  if (!selected.value) {
    member.value = undefined;
    return;
  }
  member.value = undefined;
  detailLoading.value = true;
  detailError.value = "";
  try {
    const [m, n, f] = await Promise.all([
      growth.member(selected.value),
      growth.care(selected.value),
      growth.followups(selected.value, {
        page: recordPage.value,
        pageSize: 10,
      }),
    ]);
    if (id !== detailSequence) return;
    member.value = m;
    care.value = { ...n };
    originalNote.value = n.note;
    records.value = f.items;
    recordTotal.value = f.total;
  } catch (e) {
    if (id === detailSequence)
      detailError.value = e instanceof Error ? e.message : "学员详情读取失败";
  } finally {
    if (id === detailSequence) detailLoading.value = false;
  }
}
watch(
  selected,
  () => {
    recordPage.value = 1;
    noteReason.value = "";
    followContent.value = "";
    void readCare();
  },
  { immediate: false },
);
async function readRecords() {
  if (!selected.value) return;
  const memberId = selected.value;
  try {
    const f = await growth.followups(memberId, {
      page: recordPage.value,
      pageSize: 10,
    });
    if (selected.value !== memberId) return;
    records.value = f.items;
    recordTotal.value = f.total;
  } catch (e) {
    detailError.value = e instanceof Error ? e.message : "跟进历史读取失败";
  }
}
const { busy, error: actionError, run } = useOperation();
const noteReason = ref(""),
  followContent = ref(""),
  followDate = ref(""),
  followId = ref(uuid());
const canWrite = computed(
  () =>
    member.value &&
    repository.can(
      "member:write",
      member.value.academyId ? [member.value.academyId] : undefined,
    ),
);
const editing = ref(false),
  editingId = ref<string>(),
  form = ref<FormInstance>(),
  draft = ref({
    displayName: "",
    studentNo: "",
    academyId: "",
    active: true,
    password: "",
    sourceCredential: "",
    version: 0,
    reason: "",
  }),
  initialDraft = ref("");
const rules = {
  displayName: [{ required: true, message: "请填写姓名", trigger: "blur" }],
  studentNo: [
    { required: true, message: "请填写学号", trigger: "blur" },
    {
      pattern: /^[A-Z0-9_-]{3,40}$/,
      message: "学号须3至40位大写字母、数字或下划线",
      trigger: "blur",
    },
  ],
  reason: [{ required: true, message: "请填写操作原因", trigger: "blur" }],
};
useDraftGuard(
  () =>
    care.value.note !== originalNote.value ||
    !!followContent.value ||
    (editing.value && JSON.stringify(draft.value) !== initialDraft.value),
);
function apply() {
  void router.replace({
    query: {
      ...route.query,
      q: keyword.value || undefined,
      segment: segment.value || undefined,
      start: dates.value?.[0],
      end: dates.value?.[1],
      academy: academy.value || undefined,
      page: 1,
    },
  });
}
function openMember(id: string) {
  void router.push({ query: { ...route.query, member: id } });
}
async function closeDetail(done?: () => void) {
  if (care.value.note !== originalNote.value || followContent.value)
    try {
      await ElMessageBox.confirm(
        "尚有未保存备注或跟进，关闭将放弃输入。",
        "放弃未保存内容？",
        { confirmButtonText: "放弃输入", cancelButtonText: "继续编辑" },
      );
    } catch {
      return;
    }
  care.value.note = originalNote.value;
  followContent.value = "";
  detailSequence++;
  done?.();
  void router.replace({ query: { ...route.query, member: undefined } });
}
function edit(row?: Record<string, any>) {
  editingId.value = row?.id;
  draft.value = {
    displayName: row?.displayName ?? row?.name ?? "",
    studentNo: row?.studentNo ?? "",
    academyId: row?.academyId ?? "",
    active: !["disabled", "停用"].includes(row?.status),
    password: "",
    sourceCredential: "",
    version: row?.version ?? 0,
    reason: "",
  };
  initialDraft.value = JSON.stringify(draft.value);
  editing.value = true;
}
async function closeEdit(done?: () => void) {
  if (JSON.stringify(draft.value) !== initialDraft.value)
    try {
      await ElMessageBox.confirm(
        "尚有未保存学员信息，是否放弃？",
        "放弃修改？",
        { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" },
      );
    } catch {
      return;
    }
  editing.value = false;
  done?.();
}
function invitationFields(value: string) {
  if (!value.trim()) return {};
  if (!value.includes("#")) return { invitationToken: value.trim() };
  const hash = new URL(value.trim()).hash;
  if (!hash.startsWith("#/courses?"))
    throw Error("请粘贴完整的课程邀请来源链接");
  const p = new URLSearchParams(hash.split("?")[1]);
  if (!p.get("invite")) throw Error("链接缺少邀请凭据");
  return {
    invitationToken: p.get("invite"),
    ...(p.get("visit") ? { invitationVisitId: p.get("visit") } : {}),
  };
}
async function saveMember() {
  try {
    if (!(await form.value?.validate())) return;
  } catch {
    return;
  }
  if (!editingId.value && !draft.value.password) {
    await run(async () => {
      throw Error("新学员须设置账户口令");
    });
    return;
  }
  const result = await run(
    () =>
      growth.saveMember(editingId.value, {
        displayName: draft.value.displayName,
        studentNo: draft.value.studentNo,
        active: draft.value.active,
        version: draft.value.version,
        academyId: draft.value.academyId || undefined,
        password: draft.value.password || undefined,
        reason: draft.value.reason,
        ...(!editingId.value
          ? invitationFields(draft.value.sourceCredential)
          : {}),
      }),
    "学员资料已保存",
  );
  if (result.ok) {
    editing.value = false;
    initialDraft.value = JSON.stringify(draft.value);
    draft.value.password = "";
    await list.reload();
    if (result.value?.id) openMember(result.value.id);
  }
}
async function saveNote() {
  if (!noteReason.value.trim()) {
    await run(async () => {
      throw Error("请填写备注修改说明");
    });
    return;
  }
  const result = await run(
    () => growth.note(selected.value, care.value, noteReason.value),
    "内部备注已保存",
  );
  if (result.ok && result.value) {
    care.value = result.value;
    originalNote.value = care.value.note;
    noteReason.value = "";
  }
}
async function append() {
  if (!followContent.value.trim()) {
    await run(async () => {
      throw Error("请填写跟进内容");
    });
    return;
  }
  const result = await run(
    () =>
      growth.append(selected.value, {
        id: followId.value,
        content: followContent.value.trim(),
        nextContactDate: followDate.value || undefined,
      }),
    "跟进记录已追加",
  );
  if (result.ok) {
    followContent.value = "";
    followDate.value = "";
    followId.value = uuid();
    recordPage.value = 1;
    await readRecords();
    await list.reload();
  }
}
async function complete(row: FollowupRecord) {
  const result = await run(
    () => growth.complete(selected.value, row),
    "跟进已完成",
  );
  if (result.ok) {
    await readRecords();
    await list.reload();
  }
}
if (selected.value) void readCare();
</script>
<template>
  <PageHeading
    title="学员管理"
    description="管理学员账号、内部备注与跟进；备注仅后台授权人员可见。"
    ><el-button
      v-if="repository.can('member:write')"
      type="primary"
      @click="edit()"
      >新建学员</el-button
    ><el-button @click="list.reload">刷新</el-button></PageHeading
  >
  <form class="filter-bar" novalidate @submit.prevent="apply">
    <el-input
      v-model="keyword"
      clearable
      placeholder="姓名或学号"
      aria-label="学员搜索"
    /><el-select
      v-model="academy"
      clearable
      placeholder="全部授权学院"
      aria-label="学员学院"
      ><el-option
        v-for="a in repository
          .read()
          .tables.academies.filter((a) =>
            repository.can('member:read', [a.id]),
          )"
        :key="a.id"
        :value="a.id"
        :label="a.name" /></el-select
    ><el-select
      v-model="segment"
      clearable
      placeholder="全部学员"
      aria-label="跟进筛选"
      ><el-option label="当前有效学员" value="current" /><el-option
        label="本期新增学员"
        value="new" /><el-option
        label="本期活跃学员"
        value="active" /><el-option
        label="到期未完成跟进"
        value="due" /><el-option
        label="已注册未报名"
        value="unenrolled" /><el-option
        label="课程结束仍未到课"
        value="not_attended" /></el-select
    ><el-date-picker
      v-model="dates"
      type="daterange"
      value-format="YYYY-MM-DD"
      aria-label="新增或活跃日期"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
    /><el-button type="primary" native-type="submit">查询</el-button>
  </form>
  <p class="muted">
    日期用于本期新增、本期活跃筛选；其他跟进筛选展示当前存量。
  </p>
  <el-alert
    v-if="list.error.value"
    :title="list.error.value"
    type="error"
    :closable="false"
  />
  <p v-if="list.loading.value" role="status">正在读取学员…</p>
  <section class="panel">
    <el-table
      role="region"
      :data="list.data.value?.items ?? []"
      aria-label="学员列表"
      ><el-table-column
        prop="displayName"
        label="学员姓名"
        min-width="150"
      /><el-table-column
        prop="studentNo"
        label="学号"
        min-width="150"
      /><el-table-column label="来源"
        ><template #default="{ row }">{{
          row.source === "admin_verified" ? "教务核验建档" : row.source || "—"
        }}</template></el-table-column
      ><el-table-column
        prop="nextContactDate"
        label="下次跟进"
      /><el-table-column
        prop="createdAt"
        label="注册时间"
        min-width="180"
      /><el-table-column label="操作" width="210"
        ><template #default="{ row }"
          ><el-button link type="primary" @click="openMember(row.id)"
            >详情与跟进</el-button
          ><el-button
            v-if="
              repository.can(
                'member:write',
                row.academyId ? [row.academyId] : undefined,
              )
            "
            link
            @click="edit(row)"
            >编辑账号</el-button
          ></template
        ></el-table-column
      ></el-table
    ><el-pagination
      :current-page="page"
      :total="list.data.value?.total ?? 0"
      :page-size="20"
      layout="total,prev,pager,next"
      @current-change="
        router.replace({ query: { ...route.query, page: $event } })
      "
    />
  </section>
  <el-drawer
    :model-value="!!selected"
    title="学员详情与教务跟进"
    size="min(760px,100%)"
    :before-close="closeDetail"
    ><p v-if="detailLoading" role="status">正在读取详情…</p>
    <el-alert
      v-if="detailError"
      :title="detailError"
      type="error"
      :closable="false" /><el-button v-if="detailError" @click="readCare"
      >重新读取</el-button
    ><template v-if="member"
      ><h2>{{ member.displayName ?? member.name }} · {{ member.studentNo }}</h2>
      <p class="muted">
        内部备注不展示给H5学员；跟进记录按时间追加，保留记录人。
      </p>
      <el-alert
        v-if="actionError"
        :title="actionError"
        type="error"
        :closable="false"
      />
      <form class="care-form" novalidate @submit.prevent="saveNote">
        <label for="member-note">内部备注</label
        ><el-input
          id="member-note"
          v-model="care.note"
          type="textarea"
          resize="none"
          :rows="4"
          maxlength="3000"
          show-word-limit
          :disabled="!canWrite || busy"
          aria-label="内部备注"
        />
        <p class="muted">
          版本 {{ care.version }} · {{ care.actorName ?? "暂无记录" }} ·
          {{ care.updatedAt ?? "—" }}
        </p>
        <template v-if="canWrite"
          ><label for="note-reason">备注修改说明</label
          ><el-input
            id="note-reason"
            v-model="noteReason"
            maxlength="500"
            aria-label="备注修改说明"
          /><el-button
            native-type="submit"
            type="primary"
            :loading="busy"
            :disabled="care.note === originalNote"
            >保存内部备注</el-button
          ></template
        >
      </form>
      <form
        v-if="canWrite"
        class="care-form"
        novalidate
        @submit.prevent="append"
      >
        <h3>追加跟进记录</h3>
        <label for="followup-content">跟进内容</label
        ><el-input
          id="followup-content"
          v-model="followContent"
          type="textarea"
          resize="none"
          :rows="3"
          maxlength="3000"
          show-word-limit
          aria-label="跟进内容"
        /><label for="followup-date">下次联系日期（选填）</label
        ><el-date-picker
          id="followup-date"
          v-model="followDate"
          value-format="YYYY-MM-DD"
          aria-label="下次联系日期"
        /><el-button native-type="submit" :loading="busy">追加跟进</el-button>
      </form>
      <h3>跟进历史</h3>
      <el-table role="region" :data="records" aria-label="学员跟进记录"
        ><el-table-column
          prop="content"
          label="跟进内容"
          min-width="220" /><el-table-column
          prop="actorName"
          label="记录人" /><el-table-column
          prop="nextContactDate"
          label="下次联系" /><el-table-column label="状态"
          ><template #default="{ row }">{{
            row.status === "open" ? "待完成" : "已完成"
          }}</template></el-table-column
        ><el-table-column label="操作"
          ><template #default="{ row }"
            ><el-button
              v-if="canWrite && row.status === 'open'"
              link
              :disabled="busy"
              @click="complete(row)"
              >完成跟进</el-button
            ></template
          ></el-table-column
        ><el-table-column
          prop="createdAt"
          label="记录时间"
          min-width="180" /></el-table
      ><el-pagination
        v-model:current-page="recordPage"
        :page-size="10"
        :total="recordTotal"
        layout="total,prev,pager,next"
        @current-change="readRecords"
      /> </template
  ></el-drawer>
  <el-dialog
    v-model="editing"
    :title="editingId ? '编辑学员账号' : '新建学员'"
    width="min(640px,100%)"
    :before-close="closeEdit"
    ><el-form
      ref="form"
      :model="draft"
      :rules="rules"
      label-position="top"
      novalidate
      @submit.prevent="saveMember"
      ><el-form-item label="姓名" prop="displayName"
        ><el-input
          v-model="draft.displayName"
          maxlength="80"
          aria-label="学员姓名" /></el-form-item
      ><el-form-item label="学号" prop="studentNo"
        ><el-input
          v-model="draft.studentNo"
          maxlength="40"
          aria-label="学员学号" /></el-form-item
      ><el-form-item label="业务学院（全局账号可留空）"
        ><el-select v-model="draft.academyId" clearable aria-label="业务学院"
          ><el-option
            v-for="a in repository
              .read()
              .tables.academies.filter((a) =>
                repository.can('member:write', [a.id]),
              )"
            :key="a.id"
            :label="a.name"
            :value="a.id" /></el-select></el-form-item
      ><el-form-item
        :label="editingId ? '新口令（留空保留原口令）' : '账户口令'"
        ><el-input
          v-model="draft.password"
          type="password"
          show-password
          autocomplete="new-password"
          aria-label="学员账户口令"
          maxlength="72" /></el-form-item
      ><el-form-item
        v-if="!editingId"
        label="邀请来源凭据（选填，完整链接或邀请token）"
        ><el-input
          v-model="draft.sourceCredential"
          type="textarea"
          resize="none"
          :rows="3"
          aria-label="邀请来源凭据"
        />
        <p class="muted">
          粘贴学员出示的来源链接可关联访问；仅凭邀请token建档将单列无访问注册贡献。已有关系更正请到推荐人模块。
        </p></el-form-item
      ><el-form-item label="账号启用"
        ><el-switch
          v-model="draft.active"
          aria-label="账号启用" /></el-form-item
      ><el-form-item label="操作原因" prop="reason"
        ><el-input
          v-model="draft.reason"
          aria-label="学员操作原因"
          maxlength="500" /></el-form-item
      ><el-alert
        v-if="actionError"
        :title="actionError"
        type="error"
        :closable="false" /></el-form
    ><template #footer
      ><el-button :disabled="busy" @click="closeEdit()">取消</el-button
      ><el-button type="primary" :loading="busy" @click="saveMember"
        >保存学员</el-button
      ></template
    ></el-dialog
  >
</template>
<style scoped>
.care-form {
  display: grid;
  gap: 12px;
  margin: 24px 0;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
}
.care-form .el-button {
  justify-self: start;
}
.filter-bar .el-input {
  max-width: 240px;
}
</style>
