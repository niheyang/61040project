<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import SignaturePad from "signature_pad";
import type { Drawing } from "../../src/shared/drawing.ts";
import { DRAWING_PAPER, drawingPadOptions, drawingPointGroups, sizeDrawingCanvas } from "./drawingCanvas.ts";

const props = defineProps<{ drawing: Drawing }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let pad: SignaturePad | undefined;
let observer: ResizeObserver | undefined;

function render() {
  if (!canvas.value || !pad) return;
  const scale = sizeDrawingCanvas(canvas.value);
  if (scale === null) return;
  pad.clear();
  pad.fromData(drawingPointGroups(props.drawing, scale));
}

watch(() => props.drawing, render, { deep: true });
onMounted(() => {
  if (!canvas.value) return;
  pad = new SignaturePad(canvas.value, drawingPadOptions());
  pad.off();
  render();
  observer = new ResizeObserver(render);
  observer.observe(canvas.value);
  window.addEventListener("resize", render);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("resize", render);
  pad?.off();
});
</script>

<template>
  <canvas ref="canvas" class="doodle-message" width="600" height="300" :style="{ background: DRAWING_PAPER }" role="img" aria-label="Handwritten drawing">Handwritten drawing</canvas>
</template>

<style scoped>
.doodle-message { display: block; width: 360px; max-width: 100%; height: auto; aspect-ratio: 2 / 1; border-radius: 5px; }
</style>
