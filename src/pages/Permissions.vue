<script setup lang="ts">
import { uuid } from "../utils/uuid";

import { useDraftGuard } from "../composables/useDraftGuard";
import { ref, computed } from "vue";
import { repository } from "../services/client";
import { permissionActions } from "../config/modules";
import { useOperation } from "../composables/useOperation";
import type { Role, Grant } from "../types";
import PageHeading from "../components/PageHeading.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
const data = ref(repository.systemData());
const selection = ref(data.value.roles[1]?.id ?? data.value.roles[0].id);
const editor = ref(false),
  confirmation = ref(false),
  draft = ref<Role>({ id: "", name: "", grants: [] });
const { busy, error, run } = useOperation();
const academies = repository.read().tables.academies;
const scopeMode = ref<Record<string, boolean>>({});
const selected = computed(() =>
  data.value.roles.find((r) => r.id === selection.value),
);
const initialDraft = ref("");
const { allowDiscard } = useDraftGuard(
  () => editor.value && JSON.stringify(draft.value) !== initialDraft.value,
);
async function closeEditor(done?: () => void) {
  if (await allowDiscard()) {
    editor.value = false;
    done?.();
  }
}
function edit(role?: Role) {
  draft.value = role
    ? JSON.parse(JSON.stringify(role))
    : { id: uuid(), name: "", grants: [] };
  scopeMode.value = Object.fromEntries(
    draft.value.grants.map((g) => [g.action, g.scope === "*"]),
  );
  initialDraft.value = JSON.stringify(draft.value);
  editor.value = true;
}
function grant(action: string) {
  return draft.value.grants.find((g) => g.action === action);
}
function toggle(action: string, value: boolean) {
  if (value && !grant(action)) draft.value.grants.push({ action, scope: [] });
  else if (!value)
    draft.value.grants = draft.value.grants.filter((g) => g.action !== action);
}
function changeScope(action: string, scope: Grant["scope"]) {
  const item = grant(action);
  if (item) item.scope = scope;
}
async function save(reason: string) {
  const result = await run(
    () => repository.saveRole(draft.value, reason, data.value.revision),
    "角色授权已保存，原模拟会话需重新登录",
  );
  if (result.ok) {
    confirmation.value = false;
    editor.value = false;
  }
}
</script>
<template>
  <PageHeading
    title="角色与数据权限"
    description="按动作授予学院范围；全局只读不会扩大其他动作的写入范围。"
    ><el-button
      v-if="repository.can('role:grant')"
      type="primary"
      @click="edit()"
      >新建角色</el-button
    ></PageHeading
  >
  <div class="role-grid">
    <section class="panel">
      <h2>角色列表</h2>
      <el-menu :default-active="selection" @select="selection = $event"
        ><el-menu-item
          v-for="role in data.roles"
          :key="role.id"
          :index="role.id"
          >{{ role.name }}</el-menu-item
        ></el-menu
      >
    </section>
    <section class="panel">
      <div class="section-bar">
        <h2>{{ selected?.name }}</h2>
        <el-button
          v-if="selected && repository.can('role:grant')"
          @click="edit(selected)"
          >编辑授权</el-button
        >
      </div>
      <el-table :data="selected?.grants ?? []" aria-label="角色授权矩阵"
        ><el-table-column
          prop="action"
          label="权限动作"
          min-width="180"
        /><el-table-column label="学院范围"
          ><template #default="{ row }">{{
            row.scope === "*"
              ? "全部学院"
              : row.scope
                  .map(
                    (id: string) =>
                      academies.find((a) => a.id === id)?.name ?? id,
                  )
                  .join("、") || "未授权学院"
          }}</template></el-table-column
        ></el-table
      >
      <p class="muted">
        权限保存需原因和差异确认；不允许修改当前账号持有角色。
      </p>
    </section>
  </div>
  <el-drawer
    v-model="editor"
    :before-close="closeEditor"
    title="配置角色授权"
    size="min(860px,100%)"
    ><el-form novalidate label-position="top"
      ><el-form-item label="角色名称"
        ><el-input
          v-model="draft.name"
          aria-label="角色名称" /></el-form-item></el-form
    ><el-table
      :data="permissionActions.map((action) => ({ action }))"
      aria-label="权限动作配置"
      ><el-table-column label="授予" width="70"
        ><template #default="{ row }"
          ><el-checkbox
            :model-value="!!grant(row.action)"
            :aria-label="`授予 ${row.action}`"
            @update:model-value="
              toggle(row.action, !!$event)
            " /></template></el-table-column
      ><el-table-column
        prop="action"
        label="权限动作"
        min-width="170" /><el-table-column label="范围" min-width="360"
        ><template #default="{ row }"
          ><template v-if="grant(row.action)"
            ><el-checkbox
              :model-value="grant(row.action)?.scope === '*'"
              :aria-label="`${row.action} 全部学院`"
              @update:model-value="changeScope(row.action, $event ? '*' : [])"
              >全部学院</el-checkbox
            ><el-select
              v-if="grant(row.action)?.scope !== '*'"
              :model-value="grant(row.action)?.scope as string[]"
              multiple
              :aria-label="`${row.action} 学院范围`"
              @update:model-value="changeScope(row.action, $event)"
              ><el-option
                v-for="a in academies"
                :key="a.id"
                :label="a.name"
                :value="
                  a.id
                " /></el-select></template></template></el-table-column></el-table
    ><template #footer
      ><el-button @click="closeEditor()">取消</el-button
      ><el-button
        type="primary"
        :disabled="!draft.name.trim()"
        @click="confirmation = true"
        >预览授权变更</el-button
      ></template
    ></el-drawer
  ><ReasonDialog
    :open="confirmation"
    title="保存角色授权"
    :description="`角色：${draft.name}；动作 ${draft.grants.length} 项。保存将使现有模拟会话失效。`"
    :busy="busy"
    @close="confirmation = false"
    @confirm="save"
  /><el-alert v-if="error" :title="error" type="error" :closable="false" />
</template>
