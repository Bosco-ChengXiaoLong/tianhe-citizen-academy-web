<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { init, use, type EChartsType } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
]);
const props = defineProps<{
  title: string;
  points: Record<string, unknown>[];
  series: { key: string; label: string }[];
  loading?: boolean;
}>();
const emit = defineEmits<{ select: [day: string] }>();
const target = ref<HTMLElement>(),
  table = ref(false);
let chart: EChartsType | undefined, observer: ResizeObserver | undefined;
function draw() {
  if (!chart) return;
  const css = getComputedStyle(document.documentElement);
  chart.setOption(
    {
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      aria: { enabled: true, description: props.title },
      color: [
        css.getPropertyValue("--brand").trim(),
        css.getPropertyValue("--green").trim(),
        "#547da2",
      ],
      grid: { left: 48, right: 24, top: 50, bottom: 36 },
      tooltip: { trigger: "axis" },
      legend: { top: 4 },
      xAxis: {
        type: "category",
        data: props.points.map((p) => p.day),
        axisLabel: { formatter: (s: string) => s.slice(5) },
      },
      yAxis: { type: "value", minInterval: 1 },
      series: props.series.map((s) => ({
        name: s.label,
        type: "line",
        smooth: false,
        showSymbol: props.points.length < 32,
        data: props.points.map((p) => Number(p[s.key] ?? 0)),
      })),
    },
    true,
  );
}
onMounted(() => {
  if (!target.value) return;
  chart = init(target.value);
  chart.on("click", (p) => {
    if (typeof p.name === "string") emit("select", p.name);
  });
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(target.value);
  draw();
});
watch(
  () => [props.points, props.series],
  async () => {
    await nextTick();
    draw();
  },
  { deep: true },
);
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <section class="panel trend-chart" :aria-label="title" :aria-busy="loading">
    <div class="section-bar">
      <h2>{{ title }}</h2>
      <el-button text @click="table = !table">{{
        table ? "收起图表数据" : "查看图表数据"
      }}</el-button>
    </div>
    <div
      ref="target"
      class="trend-chart__canvas"
      role="img"
      :aria-label="`${title}，可查看下方数据表`"
    />
    <p v-if="!points.length && !loading" class="muted">所选日期暂无数据</p>
    <el-table
      role="region"
      v-if="table"
      :data="points"
      max-height="360"
      :aria-label="title + '明细'"
      ><el-table-column
        prop="day"
        label="日期"
        min-width="120"
      /><el-table-column
        v-for="s in series"
        :key="s.key"
        :prop="s.key"
        :label="s.label"
        min-width="100"
      /><el-table-column label="操作" width="100"
        ><template #default="{ row }"
          ><el-button link @click="emit('select', String(row.day))"
            >查看当日</el-button
          ></template
        ></el-table-column
      ></el-table
    >
  </section>
</template>
<style scoped>
.trend-chart {
  min-width: 0;
}
.trend-chart__canvas {
  width: 100%;
  height: 280px;
}
.trend-chart h2 {
  margin: 0;
}
.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
