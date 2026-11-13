<script setup lang="ts">
/** 统一后台页面标题、说明和操作区结构。 */
defineProps<{ title: string; description: string }>();
</script>
<template>
  <div class="page-heading">
    <div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div class="page-heading__actions"><slot /></div>
  </div>
</template>
