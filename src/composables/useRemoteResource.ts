import { ref, shallowRef, watch, onBeforeUnmount } from "vue";
export function useRemoteResource<T>(
  key: () => unknown,
  loader: (signal: AbortSignal) => Promise<T>,
) {
  const data = shallowRef<T>(),
    loading = ref(false),
    error = ref("");
  let controller: AbortController | undefined;
  async function reload() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    loading.value = true;
    error.value = "";
    try {
      const result = await loader(current.signal);
      if (!current.signal.aborted) data.value = result;
    } catch (e) {
      if (!current.signal.aborted)
        error.value = e instanceof Error ? e.message : "读取失败，请重试";
    } finally {
      if (controller === current) loading.value = false;
    }
  }
  watch(
    key,
    () => {
      void reload();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => controller?.abort());
  return { data, loading, error, reload };
}
