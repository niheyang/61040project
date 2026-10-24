<script setup lang="ts">
import { computed } from "vue";
import { highlightMatches } from "./search.ts";

const props = defineProps<{ text: string; query: string }>();
const parts = computed(() => highlightMatches(props.text, props.query));
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"><mark v-if="part.match" class="search-highlight">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
</template>
