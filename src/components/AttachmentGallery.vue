<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
import { api } from "../services/http";
import MediaPreview from "./MediaPreview.vue";
const props = defineProps<{ items?: { id: string }[] }>();
const urls = ref<string[]>([]),
  error = ref(""),
  loading = ref(false),
  expanded = ref(false);
let controller: AbortController | undefined;
function clear() {
  controller?.abort();
  for (const url of urls.value) URL.revokeObjectURL(url);
  urls.value = [];
}
async function load() {
  clear();
  error.value = "";
  if (!expanded.value || !props.items?.length) return;
  const current = new AbortController();
  controller = current;
  loading.value = true;
  try {
    for (const item of props.items) {
      const blob = await api.request<Blob>(
        "GET",
        `/attachments/${encodeURIComponent(item.id)}`,
        undefined,
        { authenticated: true, blob: true, signal: current.signal },
      );
      if (current.signal.aborted) return;
      urls.value.push(URL.createObjectURL(blob));
    }
  } catch (e) {
    if (!current.signal.aborted)
      error.value = e instanceof Error ? e.message : "附件读取失败";
  } finally {
    if (controller === current) loading.value = false;
  }
}
watch(
  () => props.items,
  () => {
    void load();
  },
);
onScopeDispose(clear);
</script>
<template>
  <details
    v-if="items?.length"
    class="attachment-gallery"
    @toggle="
      expanded = ($event.target as HTMLDetailsElement).open;
      load();
    "
  >
    <summary>查看证明图片（{{ items.length }}张，仅授权人员可见）</summary>
    <p v-if="loading" role="status">正在读取附件…</p>
    <div class="attachment-gallery__images">
      <MediaPreview
        v-for="(url, index) in urls"
        :key="url"
        :src="url"
        :alt="`证明图片 ${index + 1}`"
      />
    </div>
    <p v-if="error" role="alert">
      {{ error }} <el-button @click="load">重新读取附件</el-button>
    </p>
  </details>
</template>
<style scoped>
.attachment-gallery {
  margin: 16px 0;
}
.attachment-gallery summary {
  cursor: pointer;
  min-height: 44px;
  line-height: 1.6;
  padding: 10px 0;
}
.attachment-gallery__images {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
</style>
