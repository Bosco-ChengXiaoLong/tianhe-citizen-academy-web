<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import SideNav from "./SideNav.vue";
import AppIcon from "./AppIcon.vue";
import { useSessionStore } from "../stores/session";
const menu = ref(false);
const session = useSessionStore(),
  route = useRoute(),
  router = useRouter();
function logout() {
  session.logout();
  void router.replace("/login");
}
</script>
<template>
  <div class="admin-shell">
    <a
      href="#main"
      class="skip-link"
      @click.prevent="($refs.main as HTMLElement)?.focus()"
      >跳到主要内容</a
    >
    <aside class="desktop-sidebar"><SideNav /></aside>
    <el-drawer v-model="menu" title="后台导航" direction="ltr" size="260px"
      ><SideNav @navigate="menu = false"
    /></el-drawer>
    <div class="admin-shell__body">
      <header class="topbar">
        <el-button
          class="menu-toggle"
          aria-label="打开导航"
          @click="menu = true"
          >菜单</el-button
        ><span class="breadcrumb">青木私语学苑 / {{ route.meta.title }}</span>
        <div class="topbar__actions">
          <span class="demo-tag">独立本地演示</span
          ><span class="topbar__date">2026年11月01日</span
          ><AppIcon name="bell" /><span>{{ session.account?.name }}</span
          ><el-button text @click="logout">退出 / 切换账号</el-button>
        </div>
      </header>
      <main id="main" ref="main" tabindex="-1" class="workspace">
        <RouterView :key="route.path" />
      </main>
      <footer class="workspace-footer">
        青木私语（广东）健康管理有限公司 · 模拟数据，不与 H5 实时同步
      </footer>
    </div>
  </div>
</template>
