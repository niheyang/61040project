<script setup lang="ts">
import { computed } from "vue";
import SearchHighlight from "./SearchHighlight.vue";
import DoodleMessage from "./DoodleMessage.vue";
import type { ChatMessage } from "./conversations.ts";
import type { MessageRow } from "./api.ts";
import { normalizeDrawing } from "../../src/shared/drawing.ts";

const props = defineProps<{ message: ChatMessage; searchQuery?: string; saved?: boolean; busy?: boolean }>();
const emit = defineEmits<{ save: [message: MessageRow]; remove: [message: MessageRow] }>();

const outgoing = computed(() => props.message.direction === "outgoing");
// JSON represents tuples as ordinary arrays; validate them before replaying.
const drawing = computed(() => normalizeDrawing(props.message.drawing));
const timestamp = computed(() => {
  const date = new Date(props.message.createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
});
const segments = computed(() => props.message.text.split(/(https?:\/\/[^\s]+)/g).filter(Boolean).map((text) => {
  let url: string | undefined;
  if (/^https?:\/\//.test(text)) {
    try {
      const parsed = new URL(text);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.href;
    } catch { /* Malformed URLs stay ordinary text. */ }
  }
  return { text, url };
}));
</script>

<template>
  <article :id="`message-${message.message}`" class="chat-message" :class="{ outgoing }" :aria-label="outgoing ? 'Your message' : `Message from ${message.senderUsername}`">
    <div class="message-bubble">
      <DoodleMessage v-if="drawing" :drawing="drawing" />
      <p v-else class="bubble-text"><template v-for="(segment, index) in segments" :key="index"><a v-if="segment.url" :href="segment.url" target="_blank" rel="noopener noreferrer"><SearchHighlight :text="segment.text" :query="searchQuery ?? ''" /></a><SearchHighlight v-else :text="segment.text" :query="searchQuery ?? ''" /></template></p>
      <div class="bubble-footer">
        <time :datetime="message.createdAt">{{ timestamp }}</time>
        <button v-if="!outgoing" class="bubble-save" :class="{ saved }" :disabled="busy" :aria-label="saved ? 'Remove message from saved' : 'Save message for later'" :title="saved ? 'Remove from saved' : 'Keep for later'" @click="saved ? emit('remove', message) : emit('save', message)"><svg viewBox="0 0 20 20" :fill="saved ? 'currentColor' : 'none'" aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3V3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span>{{ saved ? 'Saved' : 'Save' }}</span></button>
      </div>
    </div>
    <p v-if="outgoing" class="bubble-delivery" :class="{ available: message.status === 'RELEASED' }"><span class="status-dot" aria-hidden="true"></span>{{ message.status === 'RELEASED' ? 'Available' : message.status === 'PENDING' ? 'Waiting for catch-up' : 'Processing' }}</p>
  </article>
</template>
