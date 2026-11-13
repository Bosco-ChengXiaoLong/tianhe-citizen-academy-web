<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { IMAGE_UPLOAD } from "../../shared/contracts/protocol";
import { modules } from "../config/modules";
import { repository } from "../services/client";
import { apiRepository } from "../services/api-repository";
import { isApi } from "../services/data-source";
import { javaAdmin } from "../services/java-api";
import { instant } from "../services/wire-mapping";
import { useOperation } from "../composables/useOperation";
import { row } from "../mock/seed";
import { safeReturn } from "../domain/permissions";
import { uuid } from "../utils/uuid";
import type { Field, Row, TableName } from "../types";
import PageHeading from "../components/PageHeading.vue";
import EntityForm from "../components/EntityForm.vue";
import MediaPreview from "../components/MediaPreview.vue";
import ReasonDialog from "../components/ReasonDialog.vue";

const route = useRoute();
const router = useRouter();
const courseFields = modules.find((m) => m.key === "courses")!.fields!;
const teacherFields = modules.find((m) => m.key === "teachers")!.fields!;
const sessionFields = [
  ...modules
    .find((m) => m.key === "sessions")!
    .fields!.filter(
      (field) =>
        !["name", "academyId", "courseId", "changeReason"].includes(field.key),
    ),
  {
    key: "classroomCode",
    label: "课程码（6–32 位字母或数字）",
    kind: "password",
  },
] satisfies Field[];
const draft = ref(
  row(uuid(), "", { academyId: "", status: "草稿", version: 0 }),
);
const teacherDraft = ref(row(uuid(), "", { academyId: "", version: 0 }));
const session = ref(row(uuid(), "", { academyId: "", version: 0 }));
const initial = ref("");
const form = ref<InstanceType<typeof EntityForm>>();
const teacherForm = ref<InstanceType<typeof EntityForm>>();
const sessionForm = ref<InstanceType<typeof EntityForm>>();
const main = useOperation();
const teacherOp = useOperation();
const busy = main.busy;
const loading = ref(false);
const loadError = ref("");
const fieldError = ref("");
const teacherDialog = ref(false);
const teacherRevision = ref(0);
const preview = ref(false);
const confirmation = ref(false);
const setupSession = ref(false);
const hasSessions = ref(false);
const codeSet = ref(false);
const uploading = ref(false);
const uploadError = ref("");
const previewError = ref("");
const localCover = ref("");
let pendingUpload: { file: File; academyId: string; key: string } | undefined;
let loadSequence = 0;
let previewSequence = 0;

const destination = computed(() =>
  safeReturn(route.query.return) === "/overview"
    ? "/courses"
    : safeReturn(route.query.return),
);
const locked = computed(() => busy.value || uploading.value);
const academyScope = computed(() => [draft.value.academyId]);
const mayPublish = computed(
  () =>
    draft.value.academyId &&
    repository.can("course:publish", academyScope.value),
);
const maySchedule = computed(
  () =>
    draft.value.academyId &&
    repository.can("session:write", academyScope.value),
);
const options = (table: TableName) => {
  try {
    return repository
      .list(table)
      .filter(
        (record) => !["停用", "已删除", "已归档"].includes(record.status),
      );
  } catch {
    return [];
  }
};
const teachers = computed(() => {
  teacherRevision.value;
  return options("teachers");
});
const library = computed(() =>
  options("media").filter((asset) => asset.libraryVisible !== false),
);
const coverUrl = computed(() =>
  String(
    draft.value.coverUrl ||
      library.value.find((asset) => asset.id === draft.value.coverId)?.url ||
      "",
  ),
);
const coverPreview = computed(
  () =>
    localCover.value ||
    (draft.value.coverRequiresPreview ? "" : coverUrl.value),
);
const teacherName = computed(() =>
  draft.value.teacherSource === "course_only"
    ? String(draft.value.teacherName ?? "")
    : teachers.value.find((teacher) => teacher.id === draft.value.teacherId)
        ?.name || String(draft.value.teacherName ?? ""),
);
const fingerprint = () =>
  JSON.stringify([draft.value, setupSession.value, session.value]);

function clearPreview() {
  previewSequence++;
  if (localCover.value.startsWith("blob:"))
    URL.revokeObjectURL(localCover.value);
  localCover.value = "";
}
async function loadPreview() {
  clearPreview();
  previewError.value = "";
  if (!draft.value.coverRequiresPreview || !draft.value.coverId) return;
  const sequence = previewSequence;
  try {
    const blob = await javaAdmin.courseCoverPreview(
      String(draft.value.coverId),
    );
    if (sequence === previewSequence)
      localCover.value = URL.createObjectURL(blob);
  } catch (error) {
    if (sequence === previewSequence)
      previewError.value =
        error instanceof Error ? error.message : "预览读取失败";
  }
}
const chinaTime = (value: unknown) => {
  if (!value) return "";
  return new Date(String(value)).toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
  });
};
async function load() {
  const sequence = ++loadSequence;
  const id = typeof route.params.id === "string" ? route.params.id : "";
  loading.value = true;
  loadError.value = "";
  uploadError.value = "";
  fieldError.value = "";
  pendingUpload = undefined;
  try {
    if (isApi) await apiRepository.references(false);
    const current = id
      ? isApi
        ? await apiRepository.course(id)
        : options("courses").find((course) => course.id === id)
      : undefined;
    if (sequence !== loadSequence) return;
    if (id && !current) throw Error("课程不存在或不在当前授权范围");
    draft.value = current
      ? { ...current, teacherSource: current.teacherSource || "catalog" }
      : row(uuid(), "", {
          academyId: "",
          status: "草稿",
          version: 0,
          teacherSource: "catalog",
        });
    hasSessions.value =
      !!current?.hasSessions ||
      options("sessions").some((item) => item.courseId === id);
    const saved = current?.firstSessionDraftJson
      ? JSON.parse(String(current.firstSessionDraftJson))
      : undefined;
    session.value = row(uuid(), "", {
      academyId: "",
      version: 0,
      ...(saved
        ? {
            roomId: saved.classroomId ?? "",
            teacherId: saved.teacherId ?? "",
            startAt: chinaTime(saved.startsAt),
            endAt: chinaTime(saved.endsAt),
            registrationStart: chinaTime(saved.registrationStartsAt),
            registrationEnd: chinaTime(saved.registrationEndsAt),
            capacity: saved.capacity ?? "",
            credits: saved.credits ?? "",
          }
        : {}),
    });
    setupSession.value = !!saved && !hasSessions.value;
    codeSet.value = !!saved?.classroomCodeSet;
    initial.value = fingerprint();
    await loadPreview();
  } catch (error) {
    if (sequence === loadSequence)
      loadError.value = error instanceof Error ? error.message : "课程读取失败";
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
watch(() => route.params.id, load, { immediate: true });
onBeforeUnmount(() => {
  loadSequence++;
  clearPreview();
});

function filterOptions(field: Field, item: Row) {
  if (field.key === "academyId")
    return repository.can("course:write", [item.id]);
  if (field.key !== "roomId") return true;
  return options("venues").some(
    (venue) =>
      venue.id === item.venueId &&
      (Array.isArray(venue.academyIds)
        ? venue.academyIds.some((id) => id === draft.value.academyId)
        : venue.academyId === draft.value.academyId),
  );
}
function updateAcademy(value: string) {
  if (value === draft.value.academyId) return;
  draft.value.academyId = value;
  session.value.roomId = "";
  if (draft.value.uploadedCoverId) {
    draft.value.uploadedCoverId = "";
    draft.value.coverUrl = "";
    draft.value.coverId = "";
    draft.value.coverRequiresPreview = false;
    clearPreview();
  }
  pendingUpload = undefined;
  uploadError.value = "";
}
function selectCover(id: string) {
  const asset = library.value.find((item) => item.id === id);
  clearPreview();
  pendingUpload = undefined;
  uploadError.value = "";
  previewError.value = "";
  draft.value.coverId = id || "";
  draft.value.coverUrl = String(asset?.url ?? "");
  draft.value.uploadedCoverId = "";
  draft.value.coverRequiresPreview = false;
}
async function uploadCover() {
  if (!pendingUpload || uploading.value) return;
  const { file, academyId, key } = pendingUpload;
  uploading.value = true;
  uploadError.value = "";
  try {
    const asset = isApi
      ? await javaAdmin.uploadCourseCover(file, academyId, key)
      : undefined;
    const source = asset
      ? URL.createObjectURL(file)
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error("图片读取失败"));
          reader.readAsDataURL(file);
        });
    clearPreview();
    localCover.value = source;
    draft.value.uploadedCoverId = asset?.id ?? "";
    draft.value.coverId = asset?.id ?? "";
    draft.value.coverUrl = asset?.url ?? source;
    draft.value.coverRequiresPreview = !!asset;
    previewError.value = "";
    pendingUpload = undefined;
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : "封面上传失败";
  } finally {
    uploading.value = false;
  }
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  pendingUpload = undefined;
  if (
    !(IMAGE_UPLOAD.mimeTypes as readonly string[]).includes(file.type) ||
    !file.size ||
    file.size > IMAGE_UPLOAD.maxBytes
  ) {
    uploadError.value = "请选择 2 MB 以内的 JPG 或 PNG 图片";
    return;
  }
  pendingUpload = { file, academyId: draft.value.academyId, key: uuid() };
  void uploadCover();
}
function selectTeacher(id: string) {
  const previous = draft.value.teacherId;
  draft.value.teacherId = id || "";
  draft.value.teacherName =
    teachers.value.find((item) => item.id === id)?.name ?? "";
  if (!session.value.teacherId || session.value.teacherId === previous)
    session.value.teacherId = id || "";
}
function changeTeacherSource(source: string | number | boolean | undefined) {
  if (source !== "catalog" && source !== "course_only") return;
  if (source === "catalog") {
    const selected = teachers.value.find(
      (item) => item.id === draft.value.teacherId,
    );
    selectTeacher(selected?.id ?? "");
  }
  draft.value.teacherSource = source;
}
function openTeacher() {
  const manual = draft.value.teacherSource === "course_only";
  teacherDraft.value = row(
    uuid(),
    manual ? String(draft.value.teacherName ?? "") : "",
    {
      academyId: "",
      version: 0,
      description: manual ? String(draft.value.teacherDescription ?? "") : "",
    },
  );
  teacherOp.error.value = "";
  teacherDialog.value = true;
}
async function saveTeacher() {
  if (!(await teacherForm.value?.validate())) return;
  const result = await teacherOp.run(
    () => repository.save("teachers", teacherDraft.value),
    "讲师已新增",
  );
  if (!result.ok) return;
  teacherRevision.value++;
  draft.value.teacherSource = "catalog";
  selectTeacher(result.value.id);
  teacherDialog.value = false;
}
function toggleSession(value: boolean) {
  setupSession.value = value;
  if (
    value &&
    !session.value.teacherId &&
    draft.value.teacherSource !== "course_only"
  )
    session.value.teacherId = String(draft.value.teacherId ?? "");
}
function sessionPayload() {
  const data = session.value;
  const time = (key: string) => (data[key] ? instant(data[key]) : undefined);
  return {
    classroomId: data.roomId || undefined,
    teacherId: data.teacherId || undefined,
    startsAt: time("startAt"),
    endsAt: time("endAt"),
    registrationStartsAt: time("registrationStart"),
    registrationEndsAt: time("registrationEnd"),
    capacity: data.capacity || undefined,
    credits: data.credits === "" ? undefined : data.credits,
    classroomCode: isApi ? data.classroomCode || undefined : undefined,
    classroomCodeSet: !isApi
      ? !!data.classroomCode || codeSet.value
      : undefined,
  };
}
async function validate(publish = false) {
  fieldError.value = "";
  if (!(await form.value?.validate())) return false;
  if (!coverUrl.value) fieldError.value = "请选择课程封面";
  else if (
    draft.value.teacherSource === "course_only"
      ? !teacherName.value.trim()
      : !teachers.value.some((teacher) => teacher.id === draft.value.teacherId)
  )
    fieldError.value = "请选择或填写课程讲师";
  else if (
    publish &&
    setupSession.value &&
    (!(await sessionForm.value?.validate()) ||
      (!session.value.classroomCode && !codeSet.value))
  )
    fieldError.value = "请补齐首场授课、教室、时间、名额和课程码";
  return !fieldError.value;
}
async function saveDraft() {
  const payload = {
    ...draft.value,
    coverUrl: coverUrl.value,
    firstSessionDraftJson:
      setupSession.value && maySchedule.value
        ? JSON.stringify(sessionPayload())
        : "",
    clearFirstSessionDraft:
      !setupSession.value && !hasSessions.value && !!maySchedule.value,
  };
  const saved = await repository.save("courses", payload);
  const { classroomCode, ...publicSession } = session.value;
  codeSet.value ||= !!classroomCode;
  session.value = publicSession as Row;
  draft.value = {
    ...draft.value,
    ...saved,
    uploadedCoverId: "",
    coverId: draft.value.coverId,
    firstSessionDraftJson: "",
    clearFirstSessionDraft: false,
  };
  initial.value = fingerprint();
  return saved;
}
async function save() {
  if (locked.value || !(await validate())) return;
  const result = await main.run(saveDraft, "课程草稿已保存");
  if (result.ok) await router.push(destination.value);
}
async function publish() {
  if (locked.value || !(await validate(true))) return;
  confirmation.value = true;
}
async function confirm(reason: string) {
  if (locked.value) return;
  const combined = setupSession.value && !hasSessions.value;
  const result = await main.run(
    async () => {
      if (!draft.value.version || initial.value !== fingerprint())
        await saveDraft();
      const { id, version } = draft.value;
      if (isApi) {
        await javaAdmin.save(
          `/courses/${id}/${combined ? "publish-with-first-session" : "publish"}`,
          { version, reason },
          true,
        );
      } else if (combined) {
        repository.publishFirstSession(id, version, reason, {
          ...session.value,
          name: draft.value.name,
          registrationEnd:
            session.value.registrationEnd || session.value.startAt,
        });
      } else {
        await repository.transition("courses", id, "已发布", version, reason);
      }
    },
    combined ? "课程已发布，首场已开放报名" : "课程已发布",
  );
  if (result.ok) {
    confirmation.value = false;
    await router.push(destination.value);
  }
}
onBeforeRouteLeave(async () => {
  if (locked.value) return false;
  if (!initial.value || initial.value === fingerprint()) return true;
  try {
    await ElMessageBox.confirm("离开将放弃未保存的课程修改。", "离开编辑？", {
      confirmButtonText: "放弃修改",
      cancelButtonText: "继续编辑",
      type: "warning",
    });
    return true;
  } catch {
    return false;
  }
});
</script>

<template>
  <PageHeading
    :title="draft.version ? '编辑课程' : '新建课程'"
    description="维护课程资料和报名场次。"
  >
    <el-button :disabled="locked" @click="router.push(destination)"
      >返回列表</el-button
    >
    <template v-if="!loading && !loadError">
      <el-button :disabled="locked" @click="preview = true">内容预览</el-button>
      <el-button :disabled="uploading" :loading="busy" @click="save"
        >保存草稿</el-button
      >
      <el-button
        v-if="mayPublish"
        type="primary"
        :disabled="locked || (setupSession && !maySchedule)"
        @click="publish"
      >
        {{ setupSession ? "发布课程并开放报名" : "发布课程" }}
      </el-button>
    </template>
  </PageHeading>
  <p v-if="loading" role="status">正在读取课程及可选资料…</p>
  <div v-else-if="loadError" class="panel editor-panel">
    <p role="alert">{{ loadError }}</p>
    <el-button @click="load">重新加载</el-button>
  </div>
  <template v-else>
    <section class="panel editor-panel">
      <h2>课程资料</h2>
      <EntityForm
        ref="form"
        v-model="draft"
        :fields="courseFields"
        :busy="locked"
        @submit="save"
      >
        <template #academyId>
          <el-select
            :model-value="draft.academyId"
            aria-label="所属学院"
            filterable
            :disabled="!!draft.version"
            @update:model-value="updateAcademy"
          >
            <el-option
              v-for="academy in options('academies').filter(
                (item) =>
                  draft.academyId === item.id ||
                  repository.can('course:write', [item.id]),
              )"
              :key="academy.id"
              :label="academy.name"
              :value="academy.id"
            />
          </el-select>
        </template>
        <template #teacherId>
          <div class="course-field">
            <el-radio-group
              :model-value="draft.teacherSource"
              aria-label="课程讲师填写方式"
              @update:model-value="changeTeacherSource"
            >
              <el-radio-button value="catalog">选择已有讲师</el-radio-button>
              <el-radio-button value="course_only">手动填写</el-radio-button>
            </el-radio-group>
            <el-select
              v-if="draft.teacherSource !== 'course_only'"
              :model-value="draft.teacherId"
              aria-label="选择课程讲师"
              filterable
              clearable
              @update:model-value="selectTeacher"
            >
              <el-option
                v-for="teacher in teachers"
                :key="teacher.id"
                :label="teacher.name"
                :value="teacher.id"
              />
            </el-select>
            <template v-else>
              <el-input
                v-model="draft.teacherName"
                aria-label="讲师姓名"
                placeholder="讲师姓名（必填）"
                :maxlength="80"
              />
              <el-input
                v-model="draft.teacherDescription"
                aria-label="讲师简介"
                placeholder="讲师简介（选填）"
                type="textarea"
                resize="none"
                :maxlength="2000"
              />
            </template>
            <div v-if="repository.globalCan('teacher:write')">
              <el-button @click="openTeacher">新增讲师</el-button>
            </div>
          </div>
        </template>
        <template #coverId>
          <div class="course-field" :aria-busy="uploading">
            <el-select
              v-if="library.length"
              :model-value="
                library.some((item) => item.id === draft.coverId)
                  ? draft.coverId
                  : undefined
              "
              aria-label="从素材库选择封面"
              placeholder="从素材库选择"
              filterable
              clearable
              @update:model-value="selectCover"
            >
              <el-option
                v-for="asset in library"
                :key="asset.id"
                :label="asset.name || '未命名素材'"
                :value="asset.id"
              />
            </el-select>
            <input
              type="file"
              accept="image/jpeg,image/png"
              aria-label="上传课程封面"
              :aria-describedby="
                uploadError
                  ? 'course-cover-help course-cover-error'
                  : 'course-cover-help'
              "
              :aria-invalid="!!uploadError"
              :disabled="locked || !draft.academyId"
              @change="chooseFile"
            />
            <small id="course-cover-help">{{
              draft.academyId
                ? "JPG 或 PNG，最大 2 MB"
                : "选择所属学院后可以上传图片"
            }}</small>
            <small v-if="uploading" role="status">正在上传封面…</small>
            <div v-if="uploadError" id="course-cover-error" role="alert">
              {{ uploadError }}
              <el-button
                v-if="pendingUpload"
                :disabled="locked"
                @click="uploadCover"
                >重试上传</el-button
              >
            </div>
            <div v-if="previewError" role="alert">
              {{ previewError }}
              <el-button @click="loadPreview">重试预览</el-button>
            </div>
            <MediaPreview
              v-if="coverPreview"
              :src="coverPreview"
              alt="课程封面预览"
            />
          </div>
        </template>
      </EntityForm>
    </section>
    <section
      v-if="hasSessions || maySchedule || setupSession"
      class="panel editor-panel"
    >
      <h2>排课场次</h2>
      <RouterLink
        v-if="hasSessions"
        :to="{ path: '/sessions', query: { course: draft.id } }"
        >查看课程场次</RouterLink
      >
      <template v-else>
        <el-checkbox
          :model-value="setupSession"
          :disabled="locked || !maySchedule"
          @update:model-value="toggleSession($event === true)"
          >配置首个场次</el-checkbox
        >
        <template v-if="setupSession">
          <p v-if="draft.teacherSource === 'course_only'" class="muted">
            请为场次选择正式讲师。可先在上方用手填资料新增讲师档案。
          </p>
          <p v-if="codeSet" class="muted">
            课程码已设置。仅在需要更换时输入新码。
          </p>
          <EntityForm
            ref="sessionForm"
            v-model="session"
            :fields="sessionFields"
            :busy="locked || !maySchedule"
            :filter-options="filterOptions"
          />
        </template>
      </template>
    </section>
    <p v-if="fieldError || main.error.value" role="alert" class="error-text">
      {{ fieldError || main.error.value }}
    </p>
  </template>
  <el-dialog
    v-model="teacherDialog"
    title="新增讲师"
    width="min(540px, calc(100% - 32px))"
    :close-on-click-modal="false"
    :close-on-press-escape="!teacherOp.busy.value"
    :show-close="!teacherOp.busy.value"
  >
    <EntityForm
      ref="teacherForm"
      v-model="teacherDraft"
      :fields="teacherFields"
      :busy="teacherOp.busy.value"
      @submit="saveTeacher"
    />
    <p v-if="teacherOp.error.value" role="alert" class="error-text">
      {{ teacherOp.error.value }}
    </p>
    <template #footer>
      <el-button :disabled="teacherOp.busy.value" @click="teacherDialog = false"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="teacherOp.busy.value"
        @click="saveTeacher"
        >保存讲师</el-button
      >
    </template>
  </el-dialog>
  <el-dialog
    v-model="preview"
    title="课程内容预览"
    width="min(620px, calc(100% - 32px))"
  >
    <MediaPreview :src="coverPreview" alt="课程封面" />
    <h2>{{ draft.name || "尚未填写课程名称" }}</h2>
    <p v-if="teacherName">课程讲师：{{ teacherName }}</p>
    <p class="preview-copy">{{ draft.description || "尚未填写课程介绍" }}</p>
  </el-dialog>
  <ReasonDialog
    :open="confirmation"
    :title="setupSession ? '发布课程并开放报名' : '确认发布课程'"
    :description="
      setupSession
        ? '课程和首场校验通过后将同时发布。'
        : '发布后学员可查看本次保存的课程资料。'
    "
    :busy="busy"
    :error-message="main.error.value"
    @close="confirmation = false"
    @confirm="confirm"
  />
</template>

<style scoped>
.course-field {
  display: grid;
  gap: 8px;
  width: min(100%, 520px);
}
.editor-panel + .editor-panel {
  margin-top: 16px;
}
</style>
