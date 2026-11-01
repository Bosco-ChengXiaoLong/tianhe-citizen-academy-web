<script setup lang="ts">
import { uuid } from "../utils/uuid";

import { ref, computed } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { ElMessageBox } from "element-plus";
import { modules } from "../config/modules";
import { repository } from "../services/client";
import { useOperation } from "../composables/useOperation";
import { row } from "../mock/seed";
import { safeReturn } from "../domain/permissions";
import type { Row } from "../types";
import PageHeading from "../components/PageHeading.vue";
import EntityForm from "../components/EntityForm.vue";
const route = useRoute(),
  router = useRouter();
const module = modules.find((m) => m.key === "courses")!;
const existing = route.params.id
  ? repository.list("courses").find((r) => r.id === route.params.id)
  : undefined;
const draft = ref<Row>(
  existing
    ? JSON.parse(JSON.stringify(existing))
    : row(uuid(), "", {
        status: "草稿",
        version: 0,
        categoryId: "",
        teacherId: "",
        venueId: "",
        coverId: "",
        description: "",
      }),
);
const initial = ref(JSON.stringify(draft.value));
const form = ref<InstanceType<typeof EntityForm>>();
const preview = ref(false);
const { busy, error, run } = useOperation();
const destination = computed(() =>
  safeReturn(route.query.return) === "/overview"
    ? "/courses"
    : safeReturn(route.query.return),
);
async function save() {
  if (!(await form.value?.validate())) return;
  const result = await run(
    () => repository.save("courses", draft.value),
    "课程草稿已保存",
  );
  if (result.ok) {
    initial.value = JSON.stringify(draft.value);
    await router.push(destination.value);
  }
}
onBeforeRouteLeave(async () => {
  if (initial.value === JSON.stringify(draft.value)) return true;
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
    :title="existing ? '编辑课程' : '新建课程'"
    description="内容保存为草稿，正式发布需在课程列表确认。"
    ><el-button @click="router.push(destination)">返回列表</el-button
    ><el-button @click="preview = true">内容预览</el-button
    ><el-button type="primary" :loading="busy" @click="save"
      >保存草稿</el-button
    ></PageHeading
  >
  <section v-if="!route.params.id || existing" class="panel editor-panel">
    <h2>课程基本信息</h2>
    <EntityForm
      ref="form"
      v-model="draft"
      :fields="module.fields!"
      :busy="busy"
      @submit="save"
    /><el-alert v-if="error" :title="error" type="error" :closable="false" />
  </section>
  <el-empty v-else description="课程不存在或不在当前授权范围" /><el-dialog
    v-model="preview"
    title="课程内容预览"
    width="min(620px,calc(100% - 32px))"
    ><h2>{{ draft.name || "尚未填写课程名称" }}</h2>
    <p class="preview-copy">{{ draft.description || "尚未填写课程介绍" }}</p>
    <p class="muted">这是草稿预览，不会同步 H5 或发布课程。</p></el-dialog
  >
</template>
