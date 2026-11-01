import { ref, computed, watch, onScopeDispose } from "vue";
import { useRoute, useRouter } from "vue-router";
import { repository, request } from "../services/client";
import type { Row, TableName } from "../types";
import { isApi } from "../services/data-source";
import { apiRepository } from "../services/api-repository";
export function useList(table: () => TableName) {
  const route = useRoute(),
    router = useRouter();
  const rows = ref<Row[]>([]),
    loading = ref(true),
    error = ref("");
  let controller: AbortController | undefined;
  const query = computed(() => ({
    q: String(route.query.q ?? ""),
    member: String(route.query.member ?? ""),
    academy: String(route.query.academy ?? ""),
    status: String(route.query.status ?? ""),
    sort: String(route.query.sort ?? "name"),
    direction: route.query.direction === "desc" ? -1 : 1,
    page: Math.max(1, Number(route.query.page) || 1),
    size: [10, 20, 50].includes(Number(route.query.size))
      ? Number(route.query.size)
      : 10,
  }));
  const filtered = computed(() =>
    isApi
      ? rows.value
      : rows.value
          .filter(
            (r) =>
              (!query.value.q ||
                `${r.id} ${r.name} ${r.studentNo ?? ""}`.includes(
                  query.value.q,
                )) &&
              (!query.value.academy || r.academyId === query.value.academy) &&
              (!query.value.status || r.status === query.value.status) &&
              (!query.value.member || r.memberId === query.value.member),
          )
          .sort(
            (a, b) =>
              String(a[query.value.sort]).localeCompare(
                String(b[query.value.sort]),
                "zh-CN",
              ) * query.value.direction,
          ),
  );
  const serverTotal = ref(0);
  const total = computed(() =>
    isApi ? serverTotal.value : filtered.value.length,
  );
  const pageRows = computed(() =>
    isApi
      ? rows.value
      : filtered.value.slice(
          (query.value.page - 1) * query.value.size,
          query.value.page * query.value.size,
        ),
  );
  function setQuery(values: Record<string, string | number | undefined>) {
    void router.replace({ query: { ...route.query, ...values } });
  }
  watch([total, () => query.value.size, () => query.value.page], () => {
    const max = Math.max(1, Math.ceil(total.value / query.value.size));
    if (query.value.page > max) setQuery({ page: max });
  });
  async function load() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    loading.value = true;
    error.value = "";
    try {
      if (isApi) {
        const q = query.value;
        const result = await apiRepository.page(
          table(),
          {
            page: q.page,
            pageSize: q.size,
            keyword: q.q,
            academyId: q.academy,
            memberId: q.member,
            status: q.status,
          },
          current.signal,
        );
        if (!current.signal.aborted) {
          rows.value = result.items;
          serverTotal.value = result.total;
        }
        return;
      }
      const result = await request(
        () => repository.list(table()),
        current.signal,
      );
      if (!current.signal.aborted) rows.value = result;
    } catch (e) {
      if (!current.signal.aborted)
        error.value = e instanceof Error ? e.message : "读取失败";
    } finally {
      if (!current.signal.aborted) loading.value = false;
    }
  }
  watch(() => (isApi ? [table(), route.fullPath] : [table()]), load, {
    immediate: true,
  });
  onScopeDispose(() => controller?.abort());
  return {
    rows,
    loading,
    error,
    query,
    filtered,
    total,
    pageRows,
    setQuery,
    load,
  };
}
