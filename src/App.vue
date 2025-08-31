<script setup lang="ts">
import { onMounted, ref } from 'vue'
import L from 'leaflet'
import { io, Socket } from 'socket.io-client'

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null

const logs = ref<string[]>([])
let socket: Socket | null = null

function addLog(text: string) {
  console.log(text) // ← 追加
  logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${text}`)
}

async function fetchHello() {
  try {
    const res = await fetch(`${API_ORIGIN}/api/hello`)
    const data = await res.json()
    addLog(`HTTP /api/hello -> ${JSON.stringify(data)}`)
  } catch (e) {
    addLog(`HTTP error: ${String(e)}`)
  }
}

function sendPing() {
  if (!socket) return
  socket.emit('ping', { msg: 'hello from frontend' })
  addLog('sent socket ping')
}

onMounted(() => {
  if (mapContainer.value) {
    map = L.map(mapContainer.value).setView([35.681236, 139.767125], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
  }

  socket = io(API_ORIGIN)
  socket.on('connect', () => addLog('socket connected'))
  socket.on('connect_error', (err) => addLog(`socket connect_error: ${String(err)}`))
  socket.on('server_message', (d) => addLog(`server_message: ${JSON.stringify(d)}`))
  socket.on('pong', (d) => addLog(`received pong: ${JSON.stringify(d)}`))

  fetchHello()
})
</script>

<template>
  <div class="app-root">
    <header class="app-header">Map Chat MVP</header>
    <div class="toolbar">
      <button @click="fetchHello">HTTP /api/hello</button>
      <button @click="sendPing">Socket ping</button>
    </div>
    <div ref="mapContainer" class="map" />
    <div class="log">
      <div v-for="(l, i) in logs" :key="i">{{ l }}</div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}
.app-header {
  padding: 10px 16px;
  font-weight: 700;
}
.map {
  flex: 1;
}
.toolbar {
  display: flex;
  gap: 8px;
  padding: 0 16px 8px;
}
.log {
  padding: 8px 16px;
  height: 160px;
  overflow: auto;
  border-top: 1px solid #ddd;
  background: #fafafa;
}
</style>
