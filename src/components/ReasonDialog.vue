<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  busy?: boolean;
  errorMessage?: string;
}>();
const emit = defineEmits<{ close: []; confirm: [reason: string] }>();
const reason = ref(""),
  error = ref("");
watch(
  () => props.open,
  () => {
    reason.value = "";
    error.value = "";
  },
);
function submit() {
  if (!reason.value.trim()) {
    error.value = "请填写操作原因";
    return;
  }
  emit("confirm", reason.value.trim());
}
</script>
<template>
  <el-dialog
    v-if="open"
    :model-value="open"
    :title="title"
    width="min(560px, calc(100% - 32px))"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    @close="!busy && emit('close')"
    ><p>{{ description }}</p>
    <slot />
    <el-form novalidate label-position="top" @submit.prevent="submit"
      ><el-form-item label="操作原因" :error="error"
        ><el-input
          v-model="reason"
          type="textarea"
          resize="none"
          :rows="3"
          aria-label="操作原因"
          :maxlength="500" /></el-form-item
    ></el-form>
    <p v-if="props.errorMessage" role="alert" class="error-text">
      {{ props.errorMessage }}
    </p>
    <template #footer
      ><el-button :disabled="busy" @click="emit('close')">暂不操作</el-button
      ><el-button type="primary" :loading="busy" @click="submit">{{
        title
      }}</el-button></template
    ></el-dialog
  >
</template>
