<script setup lang="ts">
import { uuid } from "../utils/uuid";

import { useDraftGuard } from "../composables/useDraftGuard";
import { ref } from "vue";
import { repository } from "../services/client";
import type { AdminAccount } from "../types";
import { useOperation } from "../composables/useOperation";
import PageHeading from "../components/PageHeading.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
const data = repository.systemData(),
  editing = ref(false),
  confirm = ref(false);
const draft = ref<AdminAccount>({
  id: "",
  username: "",
  name: "",
  roleIds: [],
  active: true,
});
const { busy, error, run } = useOperation();
const initialDraft = ref("");
const { allowDiscard } = useDraftGuard(
  () => editing.value && JSON.stringify(draft.value) !== initialDraft.value,
);
async function closeEditor(done?: () => void) {
  if (await allowDiscard()) {
    editing.value = false;
    done?.();
  }
}
function edit(account?: AdminAccount) {
  draft.value = account
    ? JSON.parse(JSON.stringify(account))
    : {
        id: uuid(),
        username: "",
        name: "",
        roleIds: [],
        active: true,
      };
  initialDraft.value = JSON.stringify(draft.value);
  editing.value = true;
}
async function save(reason: string) {
  const result = await run(
    () => repository.saveAccount(draft.value, reason),
    "账号已保存，现有模拟会话失效",
  );
  if (result.ok) {
    confirm.value = false;
    editing.value = false;
  }
}
</script>
<template>
  <PageHeading
    title="后台账号"
    description="独立后台身份；模拟口令统一为 Demo@2026，不属于真实认证。"
    ><el-button
      v-if="repository.can('admin:write')"
      type="primary"
      @click="edit()"
      >新建后台账号</el-button
    ></PageHeading
  >
  <section class="panel">
    <el-table :data="data.accounts" aria-label="后台账号"
      ><el-table-column prop="username" label="账号" /><el-table-column
        prop="name"
        label="姓名"
      /><el-table-column label="角色"
        ><template #default="{ row }">{{
          row.roleIds
            .map((id: string) => data.roles.find((r) => r.id === id)?.name)
            .join("、")
        }}</template></el-table-column
      ><el-table-column label="状态"
        ><template #default="{ row }">{{
          row.active ? "启用" : "停用"
        }}</template></el-table-column
      ><el-table-column label="操作"
        ><template #default="{ row }"
          ><el-button
            v-if="repository.can('admin:write')"
            link
            type="primary"
            @click="edit(row)"
            >编辑账号</el-button
          ></template
        ></el-table-column
      ></el-table
    >
  </section>
  <el-drawer
    v-model="editing"
    :before-close="closeEditor"
    title="账号配置"
    size="min(600px,100%)"
    ><el-form novalidate label-position="top"
      ><el-form-item label="账号"
        ><el-input
          v-model="draft.username"
          aria-label="账号名称" /></el-form-item
      ><el-form-item label="显示姓名"
        ><el-input v-model="draft.name" aria-label="显示姓名" /></el-form-item
      ><el-form-item label="授予角色"
        ><el-select v-model="draft.roleIds" multiple aria-label="授予角色"
          ><el-option
            v-for="r in data.roles"
            :key="r.id"
            :label="r.name"
            :value="r.id" /></el-select></el-form-item
      ><el-checkbox v-model="draft.active">启用账号</el-checkbox></el-form
    ><template #footer
      ><el-button @click="closeEditor()">取消</el-button
      ><el-button type="primary" @click="confirm = true"
        >确认账号变更</el-button
      ></template
    ></el-drawer
  ><ReasonDialog
    :open="confirm"
    title="保存账号变更"
    :description="`${draft.username}：请确认角色及启用状态。`"
    :busy="busy"
    @close="confirm = false"
    @confirm="save"
  /><el-alert v-if="error" :title="error" type="error" :closable="false" />
</template>
