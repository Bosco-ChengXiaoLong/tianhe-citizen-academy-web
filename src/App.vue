<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { repository, readSession } from "./services/client";
import { useSessionStore } from "./stores/session";
const route = useRoute(),
  router = useRouter(),
  session = useSessionStore(),
  routeError = ref(false);
router.onError(() => {
  routeError.value = true;
});
import { isApi } from "./services/data-source";
import { registerSessionExpired } from "./services/http";
registerSessionExpired(() => {
  session.session = null;
  void router.replace({ path: "/login", query: { redirect: route.fullPath } });
});
const timer = setInterval(() => {
  if (isApi) return;
  const s = readSession();
  if (!s || route.meta.public) return;
  try {
    const db = repository.read();
    if (
      s.expiresAt > Date.now() &&
      s.securityVersion === db.securityVersion &&
      db.accounts.some((a) => a.id === s.accountId && a.active)
    )
      return;
  } catch {
    return;
  }
  const target = route.fullPath;
  session.logout();
  void router.replace({ path: "/login", query: { redirect: target } });
}, 1000);
onUnmounted(() => clearInterval(timer));
function reload() {
  location.reload();
}
</script>
<template>
  <div v-if="routeError" class="panel route-error">
    <h1>页面暂时无法加载</h1>
    <p>请检查网络后重新打开。</p>
    <el-button @click="reload">重新加载</el-button>
  </div>
  <RouterView v-else />
</template>
