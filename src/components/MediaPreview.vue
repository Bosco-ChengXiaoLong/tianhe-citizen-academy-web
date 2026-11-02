<script setup lang="ts">
import { computed, ref } from "vue";
const props = withDefaults(
  defineProps<{ src?: string; alt?: string; compact?: boolean }>(),
  { alt: "已上传图片", src: "", compact: false },
);
const retry = ref(0);
const source = computed(() =>
  !props.src
    ? ""
    : retry.value &&
        !props.src.startsWith("data:") &&
        !props.src.startsWith("blob:")
      ? `${props.src}${props.src.includes("?") ? "&" : "?"}previewRetry=${retry.value}`
      : props.src,
);
</script>
<template>
  <el-image
    v-if="src"
    :key="src + retry"
    :src="source"
    :alt="alt"
    :preview-src-list="[source]"
    preview-teleported
    fit="cover"
    class="media-preview"
    :class="{ 'media-preview--compact': compact }"
    ><template #error
      ><div class="media-preview__error">
        <span>图片暂不可用</span
        ><button type="button" @click.stop="retry++">重试预览</button>
      </div></template
    ><template #placeholder
      ><span role="status">正在加载图片</span></template
    ></el-image
  ><span v-else class="muted">暂无图片</span>
</template>
<style scoped>
.media-preview {
  width: 160px;
  max-width: 100%;
  height: 100px;
  border-radius: 10px;
  display: block;
}
.media-preview--compact {
  width: 80px;
  height: 56px;
}
.media-preview__error {
  display: grid;
  place-content: center;
  height: 100%;
  gap: 8px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}
.media-preview__error button {
  cursor: pointer;
  color: var(--el-color-primary);
  border: 0;
  background: none;
}
</style>
