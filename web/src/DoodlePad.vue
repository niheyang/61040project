<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import SignaturePad from "signature_pad";
import {
  DRAWING_COLORS, MAX_DRAWING_POINTS, MAX_DRAWING_STROKES, normalizeDrawing,
  type Drawing, type DrawingColor,
} from "../../src/shared/drawing.ts";
import {
  DRAWING_PAPER, drawingPadOptions, drawingPointGroups, sizeDrawingCanvas, snapshotDrawing,
} from "./drawingCanvas.ts";

const props = defineProps<{ modelValue: Drawing | null; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [drawing: Drawing | null] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const ink = ref<DrawingColor>(DRAWING_COLORS[0]);
const notice = ref("");
const current = ref<Drawing | null>(normalizeDrawing(props.modelValue));
const colorNames = ["Navy", "Teal", "Coral"];
let pad: SignaturePad | undefined;
let observer: ResizeObserver | undefined;
let scale = 1;

function render() {
  if (!pad) return;
  pad.off();
  pad.clear();
  if (current.value) pad.fromData(drawingPointGroups(current.value, scale));
  Object.assign(pad, drawingPadOptions(scale, ink.value));
  if (!props.disabled) pad.on();
}

function resize() {
  if (!canvas.value || !pad) return;
  const nextScale = sizeDrawingCanvas(canvas.value);
  if (nextScale === null) return;
  scale = nextScale;
  render();
}

function chooseInk(color: DrawingColor) {
  if (props.disabled) return;
  ink.value = color;
  if (pad) pad.penColor = color;
}

function update(drawing: Drawing | null) {
  current.value = drawing;
  emit("update:modelValue", drawing);
  render();
}

function finishStroke() {
  if (!pad || props.disabled) return;
  const groups = pad.toData();
  const drawing = snapshotDrawing(groups, scale);
  if (!drawing) {
    const pointCount = groups.reduce((total, group) => total + group.points.length, 0);
    notice.value = groups.length > MAX_DRAWING_STROKES || pointCount > MAX_DRAWING_POINTS
      ? "This drawing is full. Undo a stroke or clear it to keep drawing."
      : "That stroke is too long to send. Try a shorter stroke.";
    // Keep every previously completed stroke and discard only this attempt.
    // The parent already holds the last valid draft. Re-emitting a copied
    // draft here would trigger its watcher and immediately hide this notice.
    render();
    return;
  }
  notice.value = "";
  update(drawing);
}

function undo() {
  if (props.disabled || !current.value) return;
  const strokes = current.value.strokes.slice(0, -1);
  notice.value = "";
  update(strokes.length ? { ...current.value, strokes } : null);
}

function clear() {
  if (props.disabled) return;
  notice.value = "";
  update(null);
}

watch(() => props.modelValue, value => {
  current.value = normalizeDrawing(value);
  notice.value = "";
  render();
}, { deep: true });
watch(() => props.disabled, render);

onMounted(() => {
  if (!canvas.value) return;
  pad = new SignaturePad(canvas.value, drawingPadOptions());
  pad.off();
  pad.addEventListener("beginStroke", () => { notice.value = ""; });
  pad.addEventListener("endStroke", finishStroke);
  resize();
  observer = new ResizeObserver(resize);
  observer.observe(canvas.value);
  window.addEventListener("resize", resize);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("resize", resize);
  pad?.removeEventListener("endStroke", finishStroke);
  pad?.off();
});
</script>

<template>
  <div class="doodle-pad">
    <div class="doodle-tools" role="toolbar" aria-label="Drawing tools">
      <button v-for="(color, index) in DRAWING_COLORS" :key="color" class="doodle-ink" type="button" :style="{ '--pen-color': color }" :aria-label="`${colorNames[index]} ink`" :aria-pressed="ink === color" :title="`${colorNames[index]} ink`" :disabled="disabled" @click="chooseInk(color)"><span aria-hidden="true"></span></button>
      <button class="doodle-tool" type="button" :disabled="disabled || !current" @click="undo">Undo</button>
      <button class="doodle-tool" type="button" :disabled="disabled || !current" @click="clear">Clear</button>
    </div>
    <canvas ref="canvas" width="600" height="300" class="doodle-canvas" :class="{ disabled }" :style="{ background: DRAWING_PAPER }" :aria-disabled="disabled || undefined" aria-label="Drawing area. Draw a handwritten note with your mouse, touch, or pen."></canvas>
    <p v-if="notice" class="doodle-notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.doodle-pad { min-width: 0; }
.doodle-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-bottom: 8px; }
.doodle-ink { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 4px; border: 2px solid transparent; border-radius: 6px; background: #fffdf3; }
.doodle-ink span { display: block; width: 20px; height: 20px; border-radius: 50%; background: var(--pen-color); }
.doodle-ink[aria-pressed="true"] { border-color: var(--ink); }
.doodle-tool { min-height: 34px; padding: 5px 9px; border: none; border-radius: 4px; background: transparent; color: var(--ink); font-size: 14px; font-weight: 600; }
.doodle-tool:hover:not(:disabled) { background: var(--paper); }
.doodle-canvas { display: block; width: 100%; max-width: 600px; height: auto; aspect-ratio: 2 / 1; border-radius: 5px; touch-action: none; cursor: crosshair; }
.doodle-canvas.disabled { pointer-events: none; cursor: wait; opacity: 0.75; }
.doodle-notice { color: var(--error-ink); }
</style>
