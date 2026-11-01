<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { modules } from "../config/modules";
import { repository } from "../services/client";
import AppIcon from "./AppIcon.vue";
defineEmits<{ navigate: [] }>();
const route = useRoute();
const visible = computed(() =>
  modules.filter((m) => repository.can(m.permission)),
);
const groups = computed(() => [...new Set(visible.value.map((m) => m.group))]);
</script>
<template>
  <div class="side-nav">
    <RouterLink class="brand" to="/overview" @click="$emit('navigate')"
      ><AppIcon name="school" /><span
        ><strong>青木私语学苑</strong><small>运营管理中心</small></span
      ></RouterLink
    >
    <nav aria-label="后台主导航">
      <section v-for="group in groups" :key="group">
        <p class="nav-group">{{ group }}</p>
        <RouterLink
          v-for="item in visible.filter((m) => m.group === group)"
          :key="item.key"
          :to="`/${item.key}`"
          class="nav-item"
          :class="{ 'nav-item--active': route.meta.module === item.key }"
          @click="$emit('navigate')"
          ><AppIcon :name="item.icon" /><span>{{
            item.title
          }}</span></RouterLink
        >
      </section>
    </nav>
    <div class="side-scope">
      <small>当前数据范围</small><strong>按账号与动作授权</strong>
    </div>
    <p class="side-footer">天河 · 让学习融入日常</p>
  </div>
</template>
