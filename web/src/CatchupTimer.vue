<script setup lang="ts">
import { computed } from "vue";
import type { WindowRow } from "./api.ts";

const props = withDefaults(defineProps<{
  window?: WindowRow;
  now: number;
  busy?: boolean;
}>(), { busy: false });

const emit = defineEmits<{
  start: [];
  end: [];
}>();

const durationSeconds = 15 * 60;
const remainingSeconds = computed(() => {
  if (!props.window) return durationSeconds;
  const seconds = Math.ceil((Date.parse(props.window.expiresAt) - props.now) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(durationSeconds, seconds)) : 0;
});
const countdown = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60);
  const seconds = remainingSeconds.value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
});
const progressOffset = computed(() => 100 * (1 - remainingSeconds.value / durationSeconds));
</script>

<template>
  <section class="catchup-timer" aria-labelledby="catchup-timer-title">
    <div class="timer-dial" :class="{ 'timer-dial-active': window }">
      <svg class="timer-ring" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
        <path class="clock-hardware" d="M58 14h12M64 14v9M37 102l-7 13M91 102l7 13" />
        <path class="clock-bell" d="M14 28a17 17 0 0 1 34 0Z" transform="rotate(-35 31 28)" />
        <path class="clock-bell" d="M80 28a17 17 0 0 1 34 0Z" transform="rotate(35 97 28)" />
        <circle class="timer-track" cx="64" cy="66" r="43" />
        <circle
          v-if="window"
          class="timer-progress"
          cx="64"
          cy="66"
          r="43"
          pathLength="100"
          stroke-dasharray="100 100"
          :stroke-dashoffset="progressOffset"
          transform="rotate(-90 64 66)"
        />
      </svg>
      <div class="timer-value" role="timer" aria-live="off">
        <strong>{{ countdown }}</strong>
        <span>{{ window ? 'remaining' : 'minutes' }}</span>
      </div>
    </div>

    <div class="timer-copy">
      <h2 id="catchup-timer-title">{{ window ? 'Catching up' : 'Not receiving' }}</h2>
      <p>{{ window ? 'Receiving new messages across all chats.' : 'New messages stay hidden until you start.' }}</p>
    </div>

    <button v-if="window" class="quiet-button timer-action" type="button" :disabled="busy" @click="emit('end')">End catch-up</button>
    <button v-else class="primary-button timer-action" type="button" :disabled="busy" @click="emit('start')">Catch up now</button>
  </section>
</template>

<style scoped>
.catchup-timer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  margin-bottom: 0;
  padding: 0;
}

.timer-dial {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.timer-ring {
  display: block;
  width: 100%;
  height: 100%;
  fill: none;
  stroke-width: 6;
}

.timer-track { stroke: var(--line); }
.timer-progress { stroke: var(--sky); stroke-linecap: round; }
.clock-hardware { stroke: var(--muted); stroke-width: 3.5; stroke-linecap: round; }
.clock-bell { fill: var(--primary); stroke: none; }

.timer-value {
  position: absolute;
  inset: 3.125% 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}

.timer-value strong {
  color: var(--ink);
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -.6px;
  font-variant-numeric: tabular-nums;
}

.timer-value span { color: var(--muted); font-size: 11px; margin-top: 4px; }
.timer-dial-active .timer-value strong { color: var(--accent); }
.timer-copy h2 { font-size: 20px; letter-spacing: -.35px; }
.timer-copy p { margin-top: 5px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.timer-action { white-space: nowrap; }
.quiet-button.timer-action { min-height: 44px; padding: 8px 0; }

@media (max-width: 580px) {
  .catchup-timer {
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 16px;
    row-gap: 12px;
    padding-inline: 0;
  }

  .timer-dial { width: 104px; height: 104px; grid-row: 1 / 3; align-self: center; }
  .timer-value strong { font-size: 22px; }
  .timer-value span { font-size: 10px; }
  .timer-copy h2 { font-size: 18px; }
  .timer-action { grid-column: 2; justify-self: start; }
}
</style>
