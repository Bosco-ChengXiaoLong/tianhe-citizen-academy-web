<script setup lang="ts">
import { ref } from "vue";
import { IMAGE_UPLOAD } from "../../shared/contracts/protocol";
import type { FormInstance, FormRules } from "element-plus";
import type { Field, Row, TableName, Value } from "../types";
import { repository } from "../services/client";
import { isApi } from "../services/data-source";
import { javaAdmin } from "../services/java-api";
const props = defineProps<{ fields: Field[]; busy: boolean }>();
const model = defineModel<Row>({ required: true });
defineEmits<{ submit: [] }>();
const form = ref<FormInstance>();
const fileError = ref("");
const rules: FormRules = Object.fromEntries(
  props.fields
    .filter((f) => f.required)
    .map((f) => [
      f.key,
      [{ required: true, message: `请填写${f.label}`, trigger: "blur" }],
    ]),
);
function options(table: TableName) {
  try {
    return repository
      .list(table)
      .filter((r) => r.status !== "停用" && r.status !== "已归档");
  } catch {
    return [];
  }
}
function update(key: string, value: Value | undefined) {
  model.value[key] = value ?? "";
}
async function validate() {
  try {
    return await form.value?.validate();
  } catch {
    return false;
  }
}
async function file(event: Event, key: string) {
  const input = event.target as HTMLInputElement;
  const f = input.files?.[0];
  fileError.value = "";
  if (!f) return;
  if (
    !(IMAGE_UPLOAD.mimeTypes as readonly string[]).includes(f.type) ||
    f.size > IMAGE_UPLOAD.maxBytes
  ) {
    fileError.value = "请选择2MB以内 JPG 或 PNG 图片";
    input.value = "";
    return;
  }
  if (isApi) {
    try {
      const asset = await javaAdmin.upload(f, "运营后台上传素材");
      model.value[key] = asset.url;
    } catch (e) {
      fileError.value = e instanceof Error ? e.message : "上传失败";
    }
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    model.value[key] = String(reader.result);
  };
  reader.readAsDataURL(f);
  input.value = "";
}
defineExpose({ validate });
</script>
<template>
  <el-form
    ref="form"
    :model="model"
    :rules="rules"
    label-position="top"
    novalidate
    class="entity-form"
    @submit.prevent="$emit('submit')"
    ><el-form-item
      v-for="field in fields"
      :key="field.key"
      :label="field.label"
      :prop="field.key"
      :class="{
        'entity-form__wide':
          field.kind === 'textarea' || field.kind === 'asset',
      }"
      ><el-select
        v-if="field.kind === 'select'"
        :model-value="model[field.key] as string | string[]"
        :multiple="['academyIds', 'courseIds'].includes(field.key)"
        :aria-label="field.label"
        filterable
        clearable
        @update:model-value="update(field.key, $event)"
        ><el-option
          v-for="option in field.relation ? options(field.relation) : []"
          :key="option.id"
          :label="option.name"
          :value="option.id" /><el-option
          v-for="option in field.options ?? []"
          :key="option"
          :label="option"
          :value="option" /></el-select
      ><el-date-picker
        v-else-if="field.kind === 'datetime'"
        :model-value="String(model[field.key] ?? '')"
        type="datetime"
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DD HH:mm:ss"
        :aria-label="field.label"
        placeholder="选择日期与时间"
        @update:model-value="update(field.key, $event)" /><el-input-number
        v-else-if="field.kind === 'number'"
        :model-value="Number(model[field.key] ?? 0)"
        :min="field.min"
        :step="field.key === 'credits' ? 0.5 : 1"
        :aria-label="field.label"
        @update:model-value="update(field.key, $event)" />
      <div v-else-if="field.kind === 'asset'">
        <input
          type="file"
          :aria-label="field.label"
          accept="image/jpeg,image/png"
          @change="file($event, field.key)"
        />
        <p class="muted">
          {{
            isApi
              ? "图片将上传到学苑服务器，公开可访问。"
              : "仅保存本地演示图片，不上传真实服务器。"
          }}
        </p>
        <img
          v-if="String(model[field.key] ?? '').startsWith('data:image/')"
          :src="String(model[field.key])"
          alt="所选素材预览"
          class="asset-preview"
        />
        <p v-if="fileError" role="alert" class="error-text">{{ fileError }}</p>
      </div>
      <el-input
        v-else
        :model-value="String(model[field.key] ?? '')"
        :type="
          field.kind === 'textarea'
            ? 'textarea'
            : field.kind === 'password'
              ? 'password'
              : 'text'
        "
        :show-password="field.kind === 'password'"
        :autocomplete="field.kind === 'password' ? 'new-password' : undefined"
        :autosize="
          field.kind === 'textarea' ? { minRows: 3, maxRows: 12 } : undefined
        "
        resize="none"
        :aria-label="field.label"
        :maxlength="field.kind === 'textarea' ? 2000 : 200"
        @update:model-value="update(field.key, $event)" /></el-form-item
    ><slot
  /></el-form>
</template>
