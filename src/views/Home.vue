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
  <v-container class="py-4" fluid>
    <v-row class="mb-2" align="center" justify="space-between">
      <v-col cols="12" md="6">
        <v-btn color="primary" class="mr-2" @click="fetchHello">HTTP /api/hello</v-btn>
        <v-btn color="secondary" @click="sendPing">Socket ping</v-btn>
      </v-col>
      <v-col cols="12" md="6" class="text-md-right">
        <div class="text-caption">リアルタイムログ</div>
      </v-col>
    </v-row>
    <div ref="mapContainer" style="height: 60vh;" />
    <v-card class="mt-4" variant="tonal">
      <v-card-text style="max-height: 200px; overflow: auto;">
        <div v-for="(l, i) in logs" :key="i">{{ l }}</div>
      </v-card-text>
    </v-card>
  </v-container>
  
  
  
  
  
</template>

<style scoped>
</style>

