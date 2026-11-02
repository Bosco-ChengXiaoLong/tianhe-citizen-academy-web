<script setup lang="ts">
import { ref } from "vue";
import { growth } from "../services/growth";
defineOptions({ name: "RelationBranch" });
const props = defineProps<{ id: string; label: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const children = ref<Record<string, any>[]>([]),
  total = ref(0),
  page = ref(1),
  loading = ref(false),
  error = ref(""),
  loaded = ref(false);
async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const r = await growth.downstream(props.id, {
      direct: "true",
      page: page.value,
      pageSize: 20,
    });
    children.value.push(...r.items);
    total.value = r.total;
    loaded.value = true;
    page.value++;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "关系读取失败";
  } finally {
    loading.value = false;
  }
}
function toggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open && !loaded.value) void load();
}
</script>
<template>
  <details @toggle="toggle">
    <summary>{{ label }}</summary>
    <el-button link @click="emit('select', id)">查看此人贡献</el-button>
    <p v-if="loading" role="status">正在展开…</p>
    <p v-if="error" role="alert">
      {{ error }} <button type="button" @click="load">重试</button>
    </p>
    <ul>
      <li v-for="child in children" :key="child.id">
        <RelationBranch
          :id="child.id"
          :label="`${child.displayName} · ${child.studentNo ?? ''}`"
          @select="emit('select', $event)"
        />
      </li>
    </ul>
    <el-button
      v-if="loaded && children.length < total"
      :loading="loading"
      @click="load"
      >继续加载下游（{{ children.length }} / {{ total }}）</el-button
    >
    <p v-if="loaded && !total" class="muted">暂无直属下游</p>
  </details>
</template>
<style scoped>
details {
  padding: 8px 0;
}
summary {
  cursor: pointer;
  min-height: 32px;
  font-weight: 600;
}
ul {
  list-style: none;
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
button {
  cursor: pointer;
}
</style>
