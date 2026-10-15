<script setup lang="ts">
import { computed } from "vue";
import type { MessageRow, SentRow } from "./api.ts";

const props = defineProps<{
  message: MessageRow;
  saved?: boolean;
  status?: SentRow["status"];
  busy?: boolean;
}>();

const emit = defineEmits<{
  save: [message: MessageRow];
  remove: [message: MessageRow];
}>();

const outgoing = computed(() => props.status !== undefined);
const friend = computed(() => outgoing.value ? props.message.recipientUsername : props.message.senderUsername);
const timestamp = computed(() => {
  const date = new Date(props.message.createdAt);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
});
const segments = computed(() => {
  return props.message.text.split(/(https?:\/\/[^\s]+)/g).filter(Boolean).map((text) => {
    let url: string | undefined;
    if (/^https?:\/\//.test(text)) {
      try {
        const parsed = new URL(text);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.href;
      } catch { /* Malformed links remain ordinary text. */ }
    }
    return { text, url };
  });
});
</script>

<template>
  <article class="message-card">
    <header class="message-heading">
      <div class="message-person">
        <div>
          <p class="person-label">{{ outgoing ? 'To' : 'From' }} <strong>@{{ friend }}</strong></p>
          <time :datetime="message.createdAt">{{ timestamp }}</time>
        </div>
      </div>
      <span v-if="status" class="delivery-status" :class="{ available: status === 'RELEASED' }">
        <span aria-hidden="true" class="status-dot"></span>
        {{ status === 'RELEASED' ? 'Available' : status === 'PENDING' ? 'Saved for later' : 'Processing' }}
      </span>
      <span v-else-if="saved" class="saved-label">Saved</span>
    </header>
    <p class="message-text"><template v-for="(segment, index) in segments" :key="index"><a v-if="segment.url" :href="segment.url" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a><template v-else>{{ segment.text }}</template></template></p>
    <footer v-if="!outgoing" class="message-actions">
      <button v-if="!outgoing && !saved" class="text-button" :disabled="busy" @click="emit('save', message)">
        Keep for later
      </button>
      <button v-if="!outgoing && saved" class="text-button" :disabled="busy" @click="emit('remove', message)">
        Remove from saved
      </button>
    </footer>
  </article>
</template>
