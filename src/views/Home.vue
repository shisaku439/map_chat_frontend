<script setup lang="ts">
// Day3: 現在地取得・地図上のユーザーピン表示・追従/再センタリングUIを実装
import { onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { io, Socket } from 'socket.io-client'
import { useGeolocation } from '@vueuse/core'
import { useAuthStore } from '../stores/auth'
// マーカークラスタリング（重なりをまとめて表示）
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'

// Leaflet の地図コンテナ参照とインスタンス
const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null

// 画面下部に表示するイベント/状態ログ
const logs = ref<string[]>([])
let socket: Socket | null = null
const auth = useAuthStore()
const message = ref('')
const isPosting = ref(false)
// 周辺投稿（Day5）
const radius = ref(300) // 100〜500m
// 近傍投稿の状態と、地図上に描画するクラスタレイヤ
const nearby = ref<{ id: number; userId: number; message: string; lat: number; lng: number; createdAt: string; distance: number }[]>([])
let nearbyLayer: L.MarkerClusterGroup | null = null

// 「代表」ポップアップ：ズームしても常に見える吹き出しを維持するための基準マーカー
let representativeMarker: L.Marker | null = null

// ズームイベントへのハンドラを重複で貼らないためのフラグ
let popupPersistAttached = false

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

// 周辺投稿の取得
async function fetchNearby() {
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  if (lat == null || lng == null) {
    addLog('現在地が未取得のため周辺投稿を取得できません')
    return
  }
  try {
    const url = new URL(`${API_ORIGIN}/api/posts`)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lng', String(lng))
    url.searchParams.set('radius', String(radius.value))
    const res = await fetch(url.toString())
    const data = await res.json()
    if (!res.ok) {
      addLog(`周辺取得エラー: ${JSON.stringify(data)}`)
      return
    }
    nearby.value = data.items ?? []
    renderNearbyMarkers()
    addLog(`周辺 ${nearby.value.length} 件`)
  } catch (e) {
    addLog(`周辺取得エラー: ${String(e)}`)
  }
}

// 周辺投稿を地図に描画
// 近傍投稿をクラスタ表示し、代表ポップアップを開く
function renderNearbyMarkers() {
  if (!map) return
  if (!nearbyLayer) {
    nearbyLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 60,
    }) as L.MarkerClusterGroup
    map.addLayer(nearbyLayer)
  }
  nearbyLayer!.clearLayers()
  let firstMarker: L.Marker | null = null
  nearby.value.forEach((p, idx) => {
    const m = L.marker([p.lat, p.lng])
    m.bindPopup(`${p.message}<br/>距離: ${p.distance}m`, {
      autoClose: false,
      closeOnClick: false,
    })
    nearbyLayer!.addLayer(m)
    if (idx === 0) firstMarker = m
  })
  representativeMarker = firstMarker
  openRepresentativePopup()
  if (!popupPersistAttached && map) {
    popupPersistAttached = true
    // ズームでクラスタ構造が変わるたびに代表ポップアップを開き直す
    map.on('zoomend', openRepresentativePopup)
  }
}

// 代表ポップアップを開く
// - 代表がクラスター内に吸収されている場合は、クラスター自身に子マーカーの内容を束ねたポップアップを表示
// - 個別マーカーとして可視なら、そのマーカーのポップアップを開く
function openRepresentativePopup() {
  if (!map || !nearbyLayer || !representativeMarker) return
  // いったん既存のポップアップを閉じる
  map.closePopup()
  const grp: any = nearbyLayer as any
  const parent: any = grp.getVisibleParent(representativeMarker)
  if (parent && parent !== representativeMarker) {
    const children = parent.getAllChildMarkers ? parent.getAllChildMarkers() : [representativeMarker]
    const html = children
      .slice(0, 5)
      .map((cm: any) => (cm.getPopup && cm.getPopup()) ? cm.getPopup().getContent() : '')
      .join('<hr/>')
    if (parent.getPopup && parent.getPopup()) parent.getPopup().setContent(html)
    else parent.bindPopup(html, { autoClose: false, closeOnClick: false })
    parent.openPopup()
  } else {
    representativeMarker.openPopup()
  }
}

// 投稿処理（最大280文字、現在地必須、要ログイン）
async function submitPost() {
  if (!auth.isAuthenticated) {
    addLog('未ログインのため投稿できません')
    return
  }
  const text = message.value.trim()
  if (!text) {
    addLog('メッセージは必須です')
    return
  }
  if (text.length > 280) {
    addLog('メッセージは280文字以内で入力してください')
    return
  }
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  if (lat == null || lng == null) {
    addLog('現在地が取得できていません')
    return
  }
  isPosting.value = true
  try {
    const res = await fetch(`${API_ORIGIN}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ message: text, lat, lng }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.error?.message ?? `投稿に失敗しました (${res.status})`
      addLog(msg)
      return
    }
    addLog(`投稿成功: ${JSON.stringify(data)}`)
    message.value = ''
    // 投稿後に周辺リロード
    fetchNearby()
  } catch (e) {
    addLog(`投稿エラー: ${String(e)}`)
  } finally {
    isPosting.value = false
  }
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
    // 位置が取れていれば周辺投稿も更新
    if (coords.value?.latitude != null) fetchNearby()
  })
  // 半径変更で再取得
  watch(radius, () => {
    fetchNearby()
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
    <!-- 半径スライダーと周辺再取得 -->
    <v-row class="mb-2" align="center">
      <v-col cols="12" md="8">
        <v-slider
          v-model="radius"
          :min="100"
          :max="500"
          :step="50"
          ticks
          thumb-label
          label="表示半径(m)"
        />
      </v-col>
      <v-col cols="12" md="4" class="text-md-right">
        <v-btn variant="tonal" color="primary" @click="fetchNearby">周辺を再取得</v-btn>
      </v-col>
    </v-row>
    <!-- 投稿フォーム（最大280文字、現在地必須、ログイン必須） -->
    <v-card variant="tonal" class="mb-2">
      <v-card-text>
        <v-form @submit.prevent="submitPost">
          <v-textarea
            v-model="message"
            label="いまここメッセージ（280文字まで）"
            :counter="280"
            rows="2"
            auto-grow
            placeholder="例: 北側の売店が空いてます！"
          />
          <v-btn :disabled="isPosting" :loading="isPosting" color="primary" type="submit">投稿</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
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

