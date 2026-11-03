<script setup lang="ts">
import { repository } from "../services/client";
import type { HomeBanner } from "../types";
const externalExample = "/courses 或 https://mp.weixin.qq.com/...";
const model = defineModel<HomeBanner[]>({ default: () => [] });
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
function move(index: number, delta: number) {
  const next = [...model.value];
  const other = index + delta;
  [next[index], next[other]] = [next[other], next[index]];
  model.value = next;
}
function media() {
  try {
    return repository
      .list("media")
      .filter((m) => m.status !== "已删除" && m.url);
  } catch {
    return [];
  }
}
</script>
<template>
  <section class="banner-editor" aria-label="首页轮播图配置">
    <h3>首页轮播图</h3>
    <p>
      按列表顺序展示；建议图片比例343:148、JPG/PNG且不超过2MB。先在素材库上传，再选择图片。保存草稿不影响前台，发布后生效。支持H5站内页面、公众号文章及其他HTTPS链接，外链在当前窗口打开，能否访问由目标平台决定。
    </p>
    <template v-for="(entry, index) in model" :key="index"
      ><fieldset :disabled="disabled" class="banner-editor__item">
        <legend>轮播图 {{ index + 1 }}</legend>
        <el-form-item label="图片说明（供无障碍和图片失败时展示）"
          ><el-input
            v-model="entry.title"
            maxlength="80"
            aria-label="轮播图说明"
        /></el-form-item>
        <el-form-item label="轮播图片"
          ><el-select
            v-model="entry.imageUrl"
            aria-label="轮播图片"
            filterable
            clearable
            ><el-option
              v-for="m in media()"
              :key="m.id"
              :label="m.name"
              :value="String(m.url)" /></el-select
        ></el-form-item>
        <img
          v-if="entry.imageUrl"
          :src="entry.imageUrl"
          :alt="entry.title || '轮播图预览'"
          class="banner-editor__preview"
        />
        <el-form-item label="跳转地址（站内页面或HTTPS外链）"
          ><el-input
            v-model="entry.to"
            :placeholder="externalExample"
            aria-label="轮播跳转路径"
        /></el-form-item>
        <el-switch
          aria-label="启用轮播图"
          :model-value="entry.enabled !== false"
          active-text="启用"
          inactive-text="停用"
          :disabled="disabled"
          @update:model-value="entry.enabled = $event"
        />
        <div class="banner-editor__actions">
          <el-button
            :disabled="disabled || index === 0"
            @click="move(index, -1)"
            >上移</el-button
          ><el-button
            :disabled="disabled || index === model.length - 1"
            @click="move(index, 1)"
            >下移</el-button
          ><el-button
            :disabled="disabled"
            type="danger"
            plain
            @click="model.splice(index, 1)"
            >移除</el-button
          >
        </div>
      </fieldset></template
    >
    <el-button
      :disabled="disabled || model.length >= 20"
      @click="
        model.push({ title: '', imageUrl: '', to: '/courses', enabled: true })
      "
      >添加轮播图</el-button
    >
    <p v-if="!model.length">暂无轮播图，前台将隐藏该模块。</p>
  </section>
</template>
<style scoped>
.banner-editor {
  display: grid;
  gap: 16px;
}
.banner-editor__item {
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 16px;
  min-width: 0;
}
.banner-editor__preview {
  width: 343px;
  max-width: 100%;
  aspect-ratio: 343/148;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  margin-bottom: 16px;
}
.banner-editor__actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
</style>
