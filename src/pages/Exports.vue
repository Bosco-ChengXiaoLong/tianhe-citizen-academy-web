<script setup lang="ts">
import { ref } from "vue";
import { repository } from "../services/client";
import { useOperation } from "../composables/useOperation";
import { downloadRows } from "../utils/download";
import PageHeading from "../components/PageHeading.vue";
const jobs = ref(repository.exportList()),
  { busy, error, run } = useOperation();
async function download(id: string) {
  const result = await run(() => repository.downloadExport(id));
  if (result.ok) downloadRows(result.value, `青木私语学苑-${id}.csv`);
}
</script>
<template>
  <PageHeading
    title="导出任务"
    description="本地任务有效10分钟，仅任务本人可下载，下载时重新核验授权范围。"
    ><el-button @click="jobs = repository.exportList()"
      >刷新任务</el-button
    ></PageHeading
  >
  <section class="panel">
    <el-table :data="jobs" aria-label="导出任务"
      ><el-table-column
        prop="id"
        label="任务编号"
        min-width="260"
      /><el-table-column prop="table" label="来源" /><el-table-column
        prop="count"
        label="记录数"
      /><el-table-column label="状态"
        ><template #default="{ row }">{{
          Date.now() > row.expiresAt ? "已过期" : "本地已生成"
        }}</template></el-table-column
      ><el-table-column label="操作"
        ><template #default="{ row }"
          ><el-button
            v-if="repository.can('export:download')"
            link
            type="primary"
            :disabled="busy || row.expiresAt < Date.now()"
            @click="download(row.id)"
            >下载 CSV</el-button
          ></template
        ></el-table-column
      ></el-table
    ><el-alert v-if="error" :title="error" type="error" :closable="false" />
  </section>
</template>
