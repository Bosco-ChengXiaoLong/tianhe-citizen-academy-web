<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { dictionary, eventSamples } from "../mock/events";
import { repository } from "../services/client";
import PageHeading from "../components/PageHeading.vue";
const route = useRoute();
const tab = ref("samples"),
  course = ref(""),
  quality = ref(""),
  page = ref(1),
  detail = ref<unknown>();
const db = repository.read();
const events = computed(() =>
  eventSamples.filter(
    (e) =>
      (!course.value || e.course_id === course.value) &&
      (!quality.value || e.status === quality.value),
  ),
);
const pageRows = computed(() =>
  events.value.slice((page.value - 1) * 10, page.value * 10),
);
const definitions = Object.entries(dictionary.events).map(
  ([name, definition]) => ({
    name,
    source: definition.source === "client" ? "客户端" : "仅服务端",
    props: Object.keys(definition.props).join("、"),
  }),
);
const courses = computed(() =>
  db.tables.courses.map((c) => ({
    name: c.name,
    impressions: new Set(
      eventSamples
        .filter(
          (e) =>
            e.course_id === c.id &&
            e.event_name === "course_impression" &&
            e.status === "已接收",
        )
        .map((e) => e.member_id || e.event_id),
    ).size,
    views: new Set(
      eventSamples
        .filter(
          (e) =>
            e.course_id === c.id &&
            e.event_name === "course_view" &&
            e.status === "已接收",
        )
        .map((e) => e.member_id || e.event_id),
    ).size,
    favorites: 0,
    enrollments: db.tables.enrollments.filter(
      (e) => e.courseId === c.id && e.status === "已报名",
    ).length,
    attendance: db.tables.enrollments.filter(
      (e) => e.courseId === c.id && e.attendance === "已完成",
    ).length,
  })),
);
</script>
<template>
  <PageHeading
    :title="
      route.meta.module === 'events' ? '埋点事件与接收质量' : '课程偏好与活跃'
    "
    description="区分匿名浏览、会员参与和可信业务事实，模拟样本不代表线上数据。"
  /><el-alert
    title="真实采集未启用；当前数据为独立本地接收样本。事件字典与 H5 共用 v1.0.0。"
    type="info"
    :closable="false"
    show-icon
  /><template v-if="route.meta.module === 'events'"
    ><div class="metrics">
      <div
        v-for="state in ['已接收', '重复', '拒绝', '迟到']"
        :key="state"
        class="metric-card"
      >
        <span>{{ state }}</span
        ><strong>{{
          eventSamples.filter((e) => e.status === state).length
        }}</strong
        ><small>模拟接收队列 · 2026-11-01</small>
      </div>
    </div>
    <section class="panel">
      <el-tabs v-model="tab"
        ><el-tab-pane label="接收样本" name="samples"
          ><form class="filter-bar" novalidate @submit.prevent>
            <el-select
              v-model="course"
              clearable
              placeholder="全部课程"
              aria-label="事件课程"
              @change="page = 1"
              ><el-option
                v-for="c in db.tables.courses"
                :key="c.id"
                :value="c.id"
                :label="c.name" /></el-select
            ><el-select
              v-model="quality"
              clearable
              placeholder="全部接收状态"
              aria-label="接收状态"
              @change="page = 1"
              ><el-option
                v-for="state in ['已接收', '重复', '拒绝', '迟到']"
                :key="state"
                :value="state"
                :label="state"
            /></el-select>
          </form>
          <el-table :data="pageRows" aria-label="埋点接收样本"
            ><el-table-column
              prop="event_id"
              label="事件 ID"
              min-width="140"
            /><el-table-column
              prop="event_name"
              label="事件 key"
              min-width="200"
            /><el-table-column
              prop="schema_version"
              label="字典版本"
            /><el-table-column prop="source" label="可信来源" /><el-table-column
              prop="status"
              label="接收结果"
            /><el-table-column label="操作"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="detail = row"
                  >查看</el-button
                ></template
              ></el-table-column
            ></el-table
          ><el-pagination
            v-model:current-page="page"
            :total="events.length"
            :page-size="10"
            layout="total,prev,pager,next" /></el-tab-pane
        ><el-tab-pane label="事件字典" name="dictionary"
          ><el-table :data="definitions" aria-label="统一事件字典"
            ><el-table-column
              prop="name"
              label="稳定 key"
              min-width="220" /><el-table-column
              prop="source"
              label="采集方"
              min-width="130" /><el-table-column
              prop="props"
              label="白名单字段"
              min-width="340"
          /></el-table>
          <p class="muted">
            信封 session_id 为访问会话；业务场次使用
            course_session_id。注册、出勤、报名成功不可由浏览器伪造。
          </p></el-tab-pane
        ></el-tabs
      >
    </section></template
  ><template v-else
    ><section class="panel">
      <h2>课程对比</h2>
      <el-table :data="courses" aria-label="课程偏好对比"
        ><el-table-column
          prop="name"
          label="课程名称"
          min-width="220" /><el-table-column
          prop="impressions"
          label="曝光 UV" /><el-table-column
          prop="views"
          label="详情 UV" /><el-table-column
          prop="favorites"
          label="收藏用户" /><el-table-column
          prop="enrollments"
          label="有效报名笔数" /><el-table-column
          prop="attendance"
          label="出勤笔数"
      /></el-table>
      <p class="muted">
        当前表是课程周期对比，不是同一观察队列漏斗，不能直接相除作为转化率。收藏尚未提供可信样本，显示0。
      </p>
    </section>
    <section class="panel">
      <h2>指标口径与活跃人群</h2>
      <p>
        DAU/WAU/MAU 从会员日明细按会员去重；不能相加每日 UV 得到月
        UV。匿名和会员分别展示，不按设备猜测身份。
      </p>
      <p class="muted">
        本地尚无完整观察队列与30天事实，不展示虚构漏斗转化率、环比或推荐综合评分。
      </p>
    </section></template
  ><el-drawer
    :model-value="!!detail"
    title="事件样本"
    size="min(640px,100%)"
    @close="detail = undefined"
  >
    <pre>{{ JSON.stringify(detail, null, 2) }}</pre>
  </el-drawer>
</template>
