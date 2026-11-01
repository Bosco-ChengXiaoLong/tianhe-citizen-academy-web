<script setup lang="ts">
import icons from "../assets/icons.json";
defineProps<{ name: string }>();
const files = import.meta.glob("../assets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const aliases: Record<string, string> = {
  book: "book-open",
  school: "graduation-cap",
  calendar: "clock",
  pin: "map-pin",
  sliders: "sliders-horizontal",
};
const source = (name: string) =>
  files[
    `../assets/${(icons as Record<string, string>)[aliases[name] ?? name]}`
  ];
</script>
<template>
  <img
    :src="source(name)"
    class="app-icon"
    width="20"
    height="20"
    alt=""
    aria-hidden="true"
  />
</template>
<style scoped>
.app-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  object-fit: contain;
}
</style>
