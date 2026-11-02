<script setup lang="ts">
import { computed } from "vue";
import type { GrowthReport } from "../../shared/contracts/growth";
const props = defineProps<{ report: GrowthReport }>();
const steps = computed(() => [
  { name: "邀请访问人数", value: props.report.visitors },
  { name: "已转化访问人数", value: props.report.convertedVisitors },
  { name: "已报名访问人数", value: props.report.enrolledVisitors },
  { name: "已到课访问人数", value: props.report.attendedVisitors },
]);
</script>
<template>
  <section class="panel invite-funnel" aria-label="邀请转化漏斗">
    <h2>邀请转化漏斗</h2>
    <p class="muted">{{ report.cohortDescription }}</p>
    <ol>
      <li v-for="step in steps" :key="step.name">
        <div>
          <span>{{ step.name }}</span
          ><strong>{{ step.value }}</strong>
        </div>
        <meter
          :value="step.value"
          :min="0"
          :max="Math.max(1, report.visitors)"
          :aria-label="step.name"
        />
      </li>
    </ol>
    <p>
      访问转化率：<strong>{{
        report.conversionRate === null ? "—" : report.conversionRate + "%"
      }}</strong>
    </p>
    <p class="muted">
      无关联访问的注册
      {{ report.unlinkedRegistrations }} 人，单列贡献，不计入此漏斗。
    </p>
    <el-alert
      v-if="!report.collectionEnabled"
      title="可选采集未开启；访问数据仅反映历史已采集记录，不代表全部流量。"
      type="info"
      :closable="false"
    />
  </section>
</template>
<style scoped>
.invite-funnel ol {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 16px;
}
.invite-funnel li div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.invite-funnel meter {
  width: 100%;
  height: 18px;
  accent-color: var(--brand);
}
</style>
