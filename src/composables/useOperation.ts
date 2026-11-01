import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { DomainError } from "../domain/permissions";
import { useSessionStore } from "../stores/session";
import { request } from "../services/client";
export function useOperation() {
  const busy = ref(false),
    error = ref("");
  const router = useRouter(),
    route = useRoute();
  async function run<T>(fn: () => T | Promise<T>, success = "") {
    if (busy.value) return { ok: false as const };
    busy.value = true;
    error.value = "";
    try {
      const value = await request(fn);
      if (success) ElMessage.success(success);
      return { ok: true as const, value };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "暂时无法完成，请重试";
      if (e instanceof DomainError && e.code === "UNAUTHORIZED") {
        useSessionStore().logout();
        await router.replace({
          path: "/login",
          query: { redirect: route.fullPath },
        });
      }
      return { ok: false as const };
    } finally {
      busy.value = false;
    }
  }
  return { busy, error, run };
}
