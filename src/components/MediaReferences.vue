<script setup lang="ts">
import { ref, watch } from "vue";
import { get } from "../services/growth";
const props = defineProps<{ id: string }>();
const page = ref(1),
  items = ref<{ name: string; id: string }[]>([]),
  total = ref(0),
  loading = ref(false),
  error = ref("");
let sequence = 0;
async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const result = await get<{
      items: { name: string; id: string }[];
      total: number;
    }>(`/media/${props.id}/references`, { page: page.value, pageSize: 10 });
    if (current === sequence) {
      items.value = result.items;
      total.value = result.total;
    }
  } catch (e) {
    if (current === sequence)
      error.value = e instanceof Error ? e.message : "引用读取失败";
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => props.id,
  () => {
    page.value = 1;
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="media-references" aria-label="素材引用位置">
    <h3>素材引用位置</h3>
    <p v-if="loading" role="status">正在核对引用…</p>
    <p v-if="error" role="alert">
      {{ error }} <el-button @click="load">重试</el-button>
    </p>
    <ul>
      <li v-for="(item, index) in items" :key="item.id + index">
        {{ item.name }}
      </li>
    </ul>
    <p v-if="!loading && !error && !total">
      当前没有引用，删除时服务端会再次核验。
    </p>
    <el-pagination
      v-if="total > 10"
      v-model:current-page="page"
      :page-size="10"
      :total="total"
      layout="total,prev,next"
      @current-change="load"
    />
  </section>
</template>
<style scoped>
.media-references {
  margin: 16px 0;
  padding: 12px;
  background: var(--bg);
  border-radius: 10px;
}
.media-references ul {
  padding-left: 20px;
  overflow-wrap: anywhere;
}
</style>
