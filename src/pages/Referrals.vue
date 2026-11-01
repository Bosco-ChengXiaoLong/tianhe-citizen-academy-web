<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { repository } from "../services/client";
import { ancestors, descendants } from "../domain/referrals";
import { useOperation } from "../composables/useOperation";
import PageHeading from "../components/PageHeading.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
const route = useRoute(),
  version = ref(0),
  db = computed(() => {
    void version.value;
    return repository.read();
  });
const memberId = ref(
    typeof route.query.member === "string" &&
      repository.read().tables.members.some((m) => m.id === route.query.member)
      ? route.query.member
      : "demo-member",
  ),
  history = ref(false),
  directOnly = ref(false),
  page = ref(1),
  dialog = ref(false),
  parent = ref(""),
  confirm = ref(false);
const { busy, error, run } = useOperation();
const members = computed(() => db.value.tables.members);
const current = computed(() =>
  members.value.find((m) => m.id === memberId.value)!,
);
const children = computed(() =>
  directOnly.value
    ? members.value.filter((m) => m.inviterId === current.value.id)
    : descendants(members.value, current.value.id),
);
const pageRows = computed(() =>
  children.value.slice((page.value - 1) * 10, page.value * 10),
);
const chain = computed(() =>
  ancestors(members.value, current.value.id).reverse().concat(current.value),
);
async function correct(reason: string) {
  const result = await run(
    () =>
      repository.correctParent(
        current.value.id,
        parent.value,
        reason,
        current.value.version,
      ),
    "直属邀请人已更正，历史归因保持不变",
  );
  if (result.ok) {
    confirm.value = false;
    dialog.value = false;
    version.value++;
  }
}
</script>
<template>
  <PageHeading
    :title="
      route.meta.module === 'contributions' ? '邀请贡献' : '用户与邀请关系'
    "
    description="查看一个人的来源、下游关系与带来的有效报名。"
    ><el-button
      v-if="repository.can('referral:correct')"
      @click="
        parent = '';
        dialog = true;
      "
      >更正直属邀请人</el-button
    ></PageHeading
  >
  <section class="filter-bar">
    <el-select
      v-model="memberId"
      filterable
      aria-label="选择会员"
      @change="page = 1"
      ><el-option
        v-for="m in members"
        :key="m.id"
        :label="`${m.name} / ${m.studentNo}`"
        :value="m.id" /></el-select
    ><el-radio-group v-model="history" aria-label="关系视图"
      ><el-radio-button :value="false">当前关系</el-radio-button
      ><el-radio-button :value="true">历史归因</el-radio-button></el-radio-group
    >
  </section>
  <section class="panel">
    <h2>{{ current.name }} · {{ current.studentNo }}</h2>
    <div class="upstream">
      <span class="muted">上游链</span
      ><template v-for="(m, i) in chain" :key="m.id"
        ><span v-if="i" class="muted">›</span
        ><el-tag :type="m.id === current.id ? 'warning' : 'info'">{{
          m.name
        }}</el-tag></template
      >
    </div>
    <p class="muted">
      首次有效绑定固定 · 注册来源：{{ current.source }} ·
      更正移动整个子树，历史不回写
    </p>
  </section>
  <div class="metrics metrics--three">
    <div class="metric-card">
      <span>直属下游</span
      ><strong>{{
        members.filter((m) => m.inviterId === current.id).length
      }}</strong
      ><small>当前关系 · 一层下游</small>
    </div>
    <div class="metric-card">
      <span>全部下游</span
      ><strong>{{ descendants(members, current.id).length }}</strong
      ><small>当前关系 · 所有层级去重</small>
    </div>
    <div class="metric-card">
      <span>带来有效报名</span
      ><strong>{{
        db.attribution.filter((a) => a.ancestorId === current.id && a.valid)
          .length
      }}</strong
      ><small>历史归因 · 更正不回写</small>
    </div>
  </div>
  <section v-if="!history" class="panel">
    <div class="section-bar">
      <h2>下游用户明细</h2>
      <el-checkbox v-model="directOnly" @change="page = 1"
        >仅看直属</el-checkbox
      >
    </div>
    <el-table :data="pageRows" aria-label="下游用户明细"
      ><el-table-column prop="name" label="用户" /><el-table-column
        prop="studentNo"
        label="学号" /><el-table-column label="直属邀请人"
        ><template #default="{ row }">{{
          members.find((m) => m.id === row.inviterId)?.name
        }}</template></el-table-column
      ><el-table-column
        prop="createdAt"
        label="加入时间"
        min-width="200" /></el-table
    ><el-pagination
      v-model:current-page="page"
      :total="children.length"
      :page-size="10"
      layout="total,prev,pager,next"
    />
  </section>
  <section v-else class="panel">
    <h2>历史归因记录</h2>
    <el-table
      :data="db.attribution.filter((a) => a.ancestorId === current.id)"
      aria-label="历史归因记录"
      ><el-table-column prop="id" label="归因编号" /><el-table-column
        prop="memberId"
        label="被邀请会员"
      /><el-table-column prop="enrollmentId" label="报名编号" /><el-table-column
        label="当前有效"
        ><template #default="{ row }">{{
          row.valid ? "有效" : "已冲销"
        }}</template></el-table-column
      ></el-table
    >
  </section>
  <el-dialog
    v-model="dialog"
    title="更正直属邀请人"
    width="min(600px,calc(100% - 32px))"
    ><p>
      当前对象：{{ current.name }}；移动子树共
      {{ descendants(members, current.id).length + 1 }} 人。
    </p>
    <el-select v-model="parent" filterable aria-label="新直属邀请人"
      ><el-option
        v-for="m in members.filter(
          (m) =>
            m.id !== current.id &&
            !descendants(members, current.id).some((d) => d.id === m.id),
        )"
        :key="m.id"
        :value="m.id"
        :label="m.name"
    /></el-select>
    <p class="muted">历史注册和报名贡献仍保留原快照。</p>
    <template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" :disabled="!parent" @click="confirm = true"
        >预览并确认更正</el-button
      ></template
    ></el-dialog
  ><ReasonDialog
    :open="confirm"
    title="确认更正上游"
    :description="`${current.name} → ${members.find((m) => m.id === parent)?.name ?? ''}；移动当前子树，历史归因不变。`"
    :busy="busy"
    @close="confirm = false"
    @confirm="correct"
  /><el-alert v-if="error" :title="error" type="error" :closable="false" />
</template>
