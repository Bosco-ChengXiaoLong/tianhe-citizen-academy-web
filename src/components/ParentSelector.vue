<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { get } from "../services/growth";
import { isApi } from "../services/data-source";
import { repository } from "../services/client";
import { descendants } from "../domain/referrals";
const props = defineProps<{ memberId: string }>(),
  model = defineModel<string>({ required: true });
const options = ref<Record<string, any>[]>([]),
  loading = ref(false),
  error = ref(""),
  total = ref(0),
  page = ref(1);
let query = "",
  sequence = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
async function load(reset = false) {
  const id = ++sequence;
  loading.value = true;
  error.value = "";
  if (reset) {
    options.value = [];
    page.value = 1;
  }
  try {
    const r = isApi
      ? await get<{ items: Record<string, any>[]; total: number }>(
          "/growth/parent-options",
          { memberId: props.memberId, keyword: query, page: page.value },
        )
      : {
          items: repository
            .read()
            .tables.members.filter(
              (m) =>
                m.status === "启用" &&
                m.id !== props.memberId &&
                !descendants(
                  repository.read().tables.members,
                  props.memberId,
                ).some((c) => c.id === m.id) &&
                m.name.includes(query),
            )
            .map((m) => ({
              id: m.id,
              displayName: m.name,
              studentNo: m.studentNo,
            })),
          total: 0,
        };
    if (id !== sequence) return;
    options.value.push(...r.items);
    total.value = isApi ? r.total : options.value.length;
    page.value++;
  } catch (e) {
    if (id === sequence)
      error.value = e instanceof Error ? e.message : "邀请人读取失败";
  } finally {
    if (id === sequence) loading.value = false;
  }
}
function search(value: string) {
  query = value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void load(true);
  }, 250);
}
onMounted(() => load(true));
onBeforeUnmount(() => {
  sequence++;
  clearTimeout(timer);
});
</script>
<template>
  <el-select
    v-model="model"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    aria-label="新直属邀请人"
    placeholder="搜索姓名或学号"
    ><el-option
      v-for="m in options"
      :key="m.id"
      :label="`${m.displayName} / ${m.studentNo ?? ''}`"
      :value="m.id"
    /><template #footer
      ><el-button
        v-if="options.length < total"
        :loading="loading"
        @click.stop="load()"
        >加载更多</el-button
      >
      <p v-if="error" role="alert">
        {{ error }} <el-button text @click="load(true)">重试</el-button>
      </p></template
    ></el-select
  >
</template>
