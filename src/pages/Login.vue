<script setup lang="ts">
import { ref } from "vue";
import { modules } from "../config/modules";
import { repository } from "../services/client";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { safeReturn } from "../domain/permissions";
import AppIcon from "../components/AppIcon.vue";
const username = ref("admin"),
  password = ref(""),
  busy = ref(false),
  error = ref("");
const session = useSessionStore(),
  route = useRoute(),
  router = useRouter();
async function login() {
  if (busy.value) return;
  error.value = "";
  if (!username.value.trim() || !password.value) {
    error.value = "请填写账号和口令";
    return;
  }
  busy.value = true;
  try {
    await session.login(username.value.trim(), password.value);
    await router.replace(
      route.query.redirect
        ? safeReturn(route.query.redirect)
        : `/${modules.find((m) => repository.can(m.permission))?.key ?? "403"}`,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-brand">
        <AppIcon name="school" /><span>青木私语学苑</span>
      </div>
      <h1>欢迎回到运营管理中心</h1>
      <p class="muted">把课程和服务安排好，让学习融入日常。</p>
      <el-form novalidate label-position="top" @submit.prevent="login"
        ><el-form-item label="后台账号"
          ><el-input
            v-model="username"
            aria-label="后台账号"
            autocomplete="username" /></el-form-item
        ><el-form-item label="账户口令"
          ><el-input
            v-model="password"
            aria-label="账户口令"
            type="password"
            show-password
            autocomplete="current-password" /></el-form-item
        ><el-alert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
        /><el-button
          type="primary"
          native-type="submit"
          :loading="busy"
          class="login-submit"
          >进入演示后台</el-button
        ></el-form
      >
      <div class="login-demo">
        <span class="demo-tag">独立本地 mock</span>
        <p>演示账号：admin / operator / analyst / auditor</p>
        <p>统一演示口令：Demo@2026</p>
        <p>请勿输入真实资料。无真实认证，与 H5 不实时同步。</p>
      </div>
      <p class="login-company">青木私语（广东）健康管理有限公司</p>
    </section>
  </main>
</template>
