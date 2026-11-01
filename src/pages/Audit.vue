<script setup lang="ts">
import { computed, ref } from "vue";
import { repository } from "../services/client";
import PageHeading from "../components/PageHeading.vue";
import type { AuditEntry } from "../types";
const entries = ref(repository.auditEntries());
const q = ref(""),
  page = ref(1),
  detail = ref<AuditEntry>();
const filtered = computed(() =>
  entries.value.filter((e) =>
    `${e.actor}${e.action}${e.target}${e.reason}`.includes(q.value),
  ),
);
const data = computed(() =>
  filtered.value.slice((page.value - 1) * 10, page.value * 10),
);
</script>
<template>
  <PageHeading
    title="操作审计"
    description="只读审计；包含操作者、对象、原因、前后变更与请求标识。"
  />
  <section class="panel">
    <form novalidate class="filter-bar" @submit.prevent="page = 1">
      <el-input
        v-model="q"
        clearable
        aria-label="搜索审计"
        placeholder="搜索操作者、操作或原因"
        @input="page = 1"
      /><el-button @click="entries = repository.auditEntries()"
        >刷新审计</el-button
      >
    </form>
    <el-table :data="data" aria-label="审计记录"
      ><el-table-column
        prop="at"
        label="时间（UTC）"
        min-width="220"
      /><el-table-column
        prop="actor"
        label="操作人"
        min-width="130"
      /><el-table-column
        prop="action"
        label="操作"
        min-width="140"
      /><el-table-column prop="table" label="对象类型" /><el-table-column
        prop="reason"
        label="原因"
        min-width="210"
      /><el-table-column label="详情"
        ><template #default="{ row }"
          ><el-button link type="primary" @click="detail = row"
            >查看变更</el-button
          ></template
        ></el-table-column
      ></el-table
    ><el-pagination
      v-model:current-page="page"
      :total="filtered.length"
      :page-size="10"
      layout="total,prev,pager,next"
    />
  </section>
  <el-drawer
    :model-value="!!detail"
    title="审计变更详情"
    size="min(760px,100%)"
    @close="detail = undefined"
    ><template v-if="detail"
      ><p>请求标识：{{ detail.requestId }}</p>
      <h2>变更前</h2>
      <pre>{{ detail.before }}</pre>
      <h2>变更后</h2>
      <pre>{{ detail.after }}</pre>
    </template></el-drawer
  >
</template>
