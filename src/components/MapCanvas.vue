<script setup lang="ts">
// 地図のキャンバス。Leaflet の初期化のみを担当
// emits: ready(map, el)
import { onMounted, ref } from 'vue'
import L from 'leaflet'

const emit = defineEmits<{ (e: 'ready', map: L.Map, el: HTMLDivElement): void }>()
const container = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (!container.value) return
  const map = L.map(container.value).setView([35.681236, 139.767125], 14)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)
  emit('ready', map, container.value)
})
</script>

<template>
  <div ref="container" class="map-full"></div>
</template>

<style scoped>
.map-full { position: absolute; inset: 0; }
</style>


