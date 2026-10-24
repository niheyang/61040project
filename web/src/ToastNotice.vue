<script setup lang="ts">
import { watch } from "vue";

const props = defineProps<{ message: string }>();
const emit = defineEmits<{ dismiss: [] }>();

// A new confirmation replaces the old one and gets its own display time.
// Vue also clears this timeout when the component is unmounted.
watch(() => props.message, (message, _previous, onCleanup) => {
  if (!message) return;
  const timeout = setTimeout(() => emit("dismiss"), 4500);
  onCleanup(() => clearTimeout(timeout));
}, { immediate: true });
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite" aria-atomic="true">
    <div v-if="message" class="toast-notice">
      <svg class="toast-check" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <p>{{ message }}</p>
      <button class="toast-dismiss" type="button" aria-label="Dismiss notification" @click="emit('dismiss')"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
    </div>
  </div>
</template>

<style scoped>
.toast-region { position: fixed; z-index: 20; right: 24px; bottom: max(24px, env(safe-area-inset-bottom)); max-width: min(440px, calc(100vw - 32px)); pointer-events: none; }
.toast-notice { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); box-shadow: 0 4px 18px #00000014; pointer-events: auto; }
.toast-notice p { min-width: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.toast-check { flex-shrink: 0; width: 20px; height: 20px; color: var(--available-ink); }
.toast-dismiss { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; padding: 7px; border: none; border-radius: 4px; background: transparent; color: var(--muted); }
.toast-dismiss:hover { background: var(--surface-soft); color: var(--ink); }
.toast-dismiss svg { width: 18px; height: 18px; }
@media (max-width: 540px) { .toast-region { right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); } }
</style>
