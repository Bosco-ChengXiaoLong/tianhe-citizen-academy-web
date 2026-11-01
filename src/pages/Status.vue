<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
</script>
<template>
  <section class="panel">
    <el-result
      :icon="route.path === '/403' ? 'warning' : 'info'"
      :sub-title="
        route.path === '/403'
          ? '请联系授权管理员核对账号角色及学院范围。'
          : '链接可能已失效，请从导航继续。'
      "
      ><template #title
        ><h1>
          {{ route.path === "/403" ? "没有访问权限" : "页面不存在" }}
        </h1></template
      ><template #extra
        ><RouterLink to="/overview"
          ><el-button type="primary">返回运营总览</el-button></RouterLink
        ></template
      ></el-result
    >
  </section>
</template>
