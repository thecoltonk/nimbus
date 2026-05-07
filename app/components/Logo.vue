<template>
  <div class="svg-logo" ref="svgContainerRef"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    default: 24
  }
});

const svgContainerRef = ref(null);

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8h-1V6c0-2.76-2.24-5-5-5S8 3.24 8 6v2H7c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-9-2c0-1.66 1.34-3 3-3s3 1.34 3 3v2h-6V6zm9 14H7V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>`;

const loadSvgContent = async () => {
  if (!svgContainerRef.value) return;
  try {
    const response = await fetch(props.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const svgContent = await response.text();
    if (svgContainerRef.value) {
      svgContainerRef.value.innerHTML = svgContent;
    }
  } catch {
    if (svgContainerRef.value) {
      svgContainerRef.value.innerHTML = FALLBACK_SVG;
    }
  }
};

// Flag to track if component is still mounted
const isMounted = ref(true);

onMounted(() => {
  loadSvgContent();
});

// Watch for changes to the src prop and reload the SVG content when it changes
watch(() => props.src, () => {
  if (isMounted.value) {
    loadSvgContent();
  }
});

onUnmounted(() => {
  isMounted.value = false;
});
</script>

<style scoped>
.svg-logo {
  width: v-bind('props.size + "px"');
  height: v-bind('props.size + "px"');
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}

.svg-logo :deep(svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
  color: inherit;
  /* Do not apply stroke to preserve original visual weight */
}
</style>