<script setup lang="ts">
// Day3: 現在地取得・地図上のユーザーピン表示・追従/再センタリングUIを実装
import { onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { io, Socket } from 'socket.io-client'
import { useGeolocation } from '@vueuse/core'

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'

// Leaflet の地図コンテナ参照とインスタンス
const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null

// 画面下部に表示するイベント/状態ログ
const logs = ref<string[]>([])
let socket: Socket | null = null

// ログを先頭に積む（時刻付き）
function addLog(text: string) {
  logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${text}`)
}

// バックエンドの疎通確認用エンドポイント
async function fetchHello() {
  try {
    const res = await fetch(`${API_ORIGIN}/api/hello`)
    const data = await res.json()
    addLog(`HTTP /api/hello -> ${JSON.stringify(data)}`)
  } catch (e) {
    addLog(`HTTP error: ${String(e)}`)
  }
}

// Socket.IO でサーバへ ping を送信
function sendPing() {
  if (!socket) return
  socket.emit('ping', { msg: 'hello from frontend' })
  addLog('sent socket ping')
}

// Geolocation（現在地の取得と地図への反映）
// - following: 現在地に地図を追従するかのフラグ
// - useGeolocation: 高精度・タイムアウトなどのオプションを指定
const following = ref(true)
const { coords, error: geoError, resume } = useGeolocation({
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 10_000,
})

// 現在地をもとに、ユーザーピン（marker）と精度円（circle）を更新
// 追従ONのときは、地図の中心を現在地へ移動
function updateUserLocationOnMap() {
  if (!map) return
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  const acc = coords.value?.accuracy
  if (lat == null || lng == null) return

  const pos: L.LatLngExpression = [lat, lng]
  if (!userMarker) {
    userMarker = L.marker(pos)
    userMarker.addTo(map)
  } else {
    userMarker.setLatLng(pos)
  }
  if (acc != null) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle(pos, { radius: acc, color: '#3b82f6', opacity: 0.3, fillOpacity: 0.1 })
      accuracyCircle.addTo(map)
    } else {
      accuracyCircle.setLatLng(pos)
      accuracyCircle.setRadius(acc)
    }
  }
  if (following.value) {
    map.setView(pos, map.getZoom() || 15)
  }
}

// 手動で現在地へ再センタリング（追従もONに）
function recenterToUser() {
  following.value = true
  updateUserLocationOnMap()
}

onMounted(() => {
  // 地図の初期化（東京駅付近に仮センタリング）
  if (mapContainer.value) {
    map = L.map(mapContainer.value).setView([35.681236, 139.767125], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
  }

  // 初回の測位・監視を開始
  resume()

  // 現在地が更新されたら地図表示に反映
  watch(coords, () => {
    updateUserLocationOnMap()
  })

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
        <!-- バックエンドHTTP/ソケットの疎通ボタンと、地図追従/再センタリング操作 -->
        <v-btn color="primary" class="mr-2" @click="fetchHello">HTTP /api/hello</v-btn>
        <v-btn color="secondary" @click="sendPing">Socket ping</v-btn>
        <v-btn class="ml-2" :color="following ? 'success' : 'grey'" @click="following = !following">
          {{ following ? '追従ON' : '追従OFF' }}
        </v-btn>
        <v-btn class="ml-2" color="primary" variant="tonal" @click="recenterToUser">現在地へ</v-btn>
      </v-col>
      <v-col cols="12" md="6" class="text-md-right">
        <div class="text-caption">リアルタイムログ</div>
      </v-col>
    </v-row>
    <!-- 位置情報の取得に失敗した場合のユーザー向けエラー表示 -->
    <v-alert v-if="geoError" type="error" variant="tonal" class="mb-2">
      位置情報の取得に失敗しました: {{ geoError?.message }}
    </v-alert>
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

