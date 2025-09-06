<script setup lang="ts">
// Day3: 現在地取得・地図上のユーザーピン表示・追従/再センタリングUIを実装
import { onMounted, ref, watch, computed } from 'vue'
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
let searchCircle: L.Circle | null = null

let socket: Socket | null = null
const auth = useAuthStore()
const message = ref('')
const isPosting = ref(false)
// 周辺投稿（Day5）
const radius = ref(1000) // 100〜3000m（既定1,000m）
// 近傍投稿の状態と、地図上に描画するクラスタレイヤ
const nearby = ref<{ id: number; userId: number; message: string; lat: number; lng: number; createdAt: string; distance: number }[]>([])
let nearbyLayer: L.MarkerClusterGroup | null = null
let createdMarkers: L.Marker[] = []
// ポップアップの重なり順を管理（クリックで最前面へ）
let nextPopupZ = 10000
// 開いたポップアップ要素ごとに、付与したイベントハンドラを追跡してクリーンアップ
const popupHandlers = new WeakMap<HTMLElement, (ev: Event) => void>()

// 「代表」ポップアップ：ズームしても常に見える吹き出しを維持するための基準マーカー
let representativeMarker: L.Marker | null = null

// ズームイベントへのハンドラを重複で貼らないためのフラグ
let popupPersistAttached = false

// ログはブラウザコンソールへ出力
function addLog(text: string) {
  // 時刻付きで出力
  console.log(`[${new Date().toLocaleTimeString()}] ${text}`)
}

// 画面上部に一時的なアラートを表示
const alertMessage = ref('')
let alertTimer: number | null = null
function showAlert(msg: string, ms = 4000) {
  alertMessage.value = msg
  if (alertTimer) {
    window.clearTimeout(alertTimer)
  }
  alertTimer = window.setTimeout(() => {
    alertMessage.value = ''
    alertTimer = null
  }, ms)
}


// Geolocation（現在地の取得と地図への反映）
// - following: 現在地に地図を追従するかのフラグ
// - useGeolocation: 高精度・タイムアウトなどのオプションを指定
const following = ref(true)
const { coords, resume } = useGeolocation({
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
    userMarker = L.marker(pos, { icon: getUserIcon() })
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
  // 取得半径の円も更新
  updateSearchCircle()
  if (following.value) {
    map.setView(pos, map.getZoom() || 15)
  }
}

// アカウント画像URL（例: ユーザー名から自動アバターを生成）
const avatarUrl = computed(() => {
  const name = auth.username ?? 'U'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=ffffff&size=64&bold=true`
})

// 現在地マーカー用のカスタムアイコン（アバター画像入り）
function getUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'user-avatar-pin',
    html: `<div class="user-avatar"><img src="${avatarUrl.value}" alt="me"/></div>`,
    iconSize: [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -56],
  })
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
    showAlert('現在地が未取得のため周辺投稿を取得できません')
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
      const msg = `周辺取得エラー: ${data?.error?.message ?? res.status}`
      addLog(msg)
      showAlert(msg)
      return
    }
    nearby.value = data.items ?? []
    renderNearbyMarkers()
    addLog(`周辺 ${nearby.value.length} 件`)
  } catch (e) {
    const msg = `周辺取得エラー: ${String(e)}`
    addLog(msg)
    showAlert(msg)
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
  createdMarkers = []
  let firstMarker: L.Marker | null = null
  nearby.value.forEach((p, idx) => {
    // 個別コメントはピンではなく丸いアイコンで表示（クラスタの見た目に寄せる）
    const icon = L.divIcon({
      className: 'comment-dot',
      html: '<div class="dot"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    })
    const m = L.marker([p.lat, p.lng], { icon })
    m.bindPopup(`${p.message}<br/><span class="popup-time">${formatRelative(p.createdAt)}</span>`, {
      autoClose: false,
      closeOnClick: false,
    })
    // クラスタポップアップでの並び替えに使うメタ情報を保持
    ;(m as any).__postMeta = p
    nearbyLayer!.addLayer(m)
    if (idx === 0) firstMarker = m
    createdMarkers.push(m)
  })
  representativeMarker = firstMarker
  openRepresentativePopup()
  if (!popupPersistAttached && map) {
    popupPersistAttached = true
    // ズームでクラスタ構造が変わるたびに代表ポップアップを開き直す
    map.on('zoomend', openRepresentativePopup)
    // ズームでクラスターから外れたマーカーは自動で吹き出しを開く
    map.on('zoomend', openVisibleMarkerPopups)
  }
  // 初回レンダリング時も、クラスターされていないものは開く
  openVisibleMarkerPopups()
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
    // 投稿時刻の新しい順に並べ替え（__postMeta.createdAt を利用）
    children.sort((a: any, b: any) => {
      const ad = new Date(a.__postMeta?.createdAt || 0).getTime()
      const bd = new Date(b.__postMeta?.createdAt || 0).getTime()
      return bd - ad
    })
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

// クラスタに含まれていない（=個別表示されている）マーカーの吹き出しを自動で開く
function openVisibleMarkerPopups() {
  if (!nearbyLayer) return
  const grp: any = nearbyLayer as any
  createdMarkers.forEach((m) => {
    const parent: any = grp.getVisibleParent(m)
    if (!parent || parent === m) {
      // 個別に表示されているので開く（autoClose: false のため併存可能）
      m.openPopup()
    }
  })
}

// 取得半径の円（検索範囲）を現在地に合わせて更新
function updateSearchCircle() {
  if (!map) return
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  if (lat == null || lng == null) return
  const pos: L.LatLngExpression = [lat, lng]
  if (!searchCircle) {
    searchCircle = L.circle(pos, { radius: radius.value, color: '#2563eb', opacity: 0.4, fillOpacity: 0.06 })
    searchCircle.addTo(map)
  } else {
    searchCircle.setLatLng(pos)
    searchCircle.setRadius(radius.value)
  }
}

// 日時を相対表示（X分前 / X時間前 / 24時間超は日付）
function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const min = Math.floor(diffMs / 60000)
  const hr = Math.floor(diffMs / 3600000)
  if (min < 1) return 'たった今'
  if (hr < 1) return `${min}分前`
  if (hr < 24) return `${hr}時間前`
  // 24時間以上前は、日本時間（Asia/Tokyo）で年月日を表示
  try {
    const fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = fmt.formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value || String(d.getUTCFullYear())
    const m = parts.find(p => p.type === 'month')?.value || String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = parts.find(p => p.type === 'day')?.value || String(d.getUTCDate()).padStart(2, '0')
    return `${y}/${m}/${day}`
  } catch {
    // フォールバック: JST相当へ手動オフセット（+9時間）してUTCとして取り出す
    const jst = new Date(d.getTime() + 9 * 3600 * 1000)
    const y = jst.getUTCFullYear()
    const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
    const day = String(jst.getUTCDate()).padStart(2, '0')
    return `${y}/${m}/${day}`
  }
}

// 投稿処理（最大280文字、現在地必須、要ログイン）
async function submitPost() {
  if (!auth.isAuthenticated) {
    addLog('未ログインのため投稿できません')
    showAlert('未ログインのため投稿できません')
    return
  }
  const text = message.value.trim()
  if (!text) {
    addLog('メッセージは必須です')
    showAlert('メッセージは必須です')
    return
  }
  if (text.length > 280) {
    addLog('メッセージは280文字以内で入力してください')
    showAlert('メッセージは280文字以内で入力してください')
    return
  }
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  if (lat == null || lng == null) {
    addLog('現在地が取得できていません')
    showAlert('現在地が取得できていません')
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
      showAlert(msg)
      return
    }
    addLog(`投稿成功: ${JSON.stringify(data)}`)
    message.value = ''
    // 投稿後に周辺リロード
    fetchNearby()
  } catch (e) {
    const msg = `投稿エラー: ${String(e)}`
    addLog(msg)
    showAlert(msg)
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
    updateSearchCircle()
    fetchNearby()
  })

  socket = io(API_ORIGIN)
  socket.on('connect', () => addLog('socket connected'))
  socket.on('connect_error', (err) => addLog(`socket connect_error: ${String(err)}`))
  // Day6: 新規投稿が届いたら周辺を更新
  socket.on('post_created', (d) => {
    addLog(`post_created: ${JSON.stringify(d)}`)
    fetchNearby()
  })

  // どのポップアップを開いても最前面に来るようZ-indexを上げる
  map?.on('popupopen', (e: any) => {
    const el = e?.popup?._container as HTMLElement | undefined
    if (!el) return
    // 開いた瞬間に前面へ
    el.style.zIndex = String(nextPopupZ++)
    // クリック/タップ時にも前面へ持ち上げる
    const bringToFront = () => {
      el.style.zIndex = String(nextPopupZ++)
    }
    popupHandlers.set(el, bringToFront)
    el.addEventListener('pointerdown', bringToFront)
    el.addEventListener('click', bringToFront)
  })

  // ポップアップを閉じたらイベントリスナを除去
  map?.on('popupclose', (e: any) => {
    const el = e?.popup?._container as HTMLElement | undefined
    if (!el) return
    const handler = popupHandlers.get(el)
    if (!handler) return
    el.removeEventListener('pointerdown', handler)
    el.removeEventListener('click', handler)
    popupHandlers.delete(el)
  })

})
</script>

<template>
  <div class="map-page">
    <!-- 地図（フルスクリーン） -->
    <div ref="mapContainer" class="map-full" />

    <!-- 地図内コントロール -->
    <div class="map-controls">
      <v-btn density="comfortable" :color="following ? 'success' : 'grey'" @click="following = !following">
        {{ following ? '追従ON' : '追従OFF' }}
      </v-btn>
      <v-btn density="comfortable" class="ml-2" color="primary" variant="tonal" @click="recenterToUser">現在地へ</v-btn>
      <div class="radius-control ml-2">
        <div class="radius-label">半径: {{ radius }}m</div>
        <v-slider v-model="radius" :min="100" :max="3000" :step="100" density="compact" hide-details />
        <v-btn size="small" variant="tonal" @click="fetchNearby">再取得</v-btn>
      </div>
    </div>

    <!-- 下固定の投稿フォーム -->
    <div class="post-bar">
      <!-- アラートをフォーム上のオーバーレイとして表示（レイアウトを変えない） -->
      <div v-if="alertMessage" class="post-alert">
        <div class="post-alert-box">
          <v-alert type="error" variant="flat" density="comfortable">
            {{ alertMessage }}
          </v-alert>
        </div>
      </div>
      <v-form class="post-form" @submit.prevent="submitPost" >
        <v-text-field
          v-model="message"
          variant=""
          density="comfortable"
          maxlength="280"
          placeholder="今の気持ちをシェアしよう（最大280文字）"
          hide-details="auto"
        >
          <template #append-inner>
            <span class="field-counter">{{ message.length }}/280</span>
          </template>
        </v-text-field>
        <v-btn class="ml-2" color="success rounded-pill"  :disabled="isPosting" :loading="isPosting" type="submit">投稿</v-btn>
      </v-form>
    </div>
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: 100dvh;
}
.map-full {
  position: absolute;
  inset: 0;
}
.map-controls {
  position: absolute;
  /* ヘッダー(v-app-bar app)の高さを考慮して配置 */
  top: calc(var(--v-layout-top, 0px) + 12px);
  left: 12px;
  z-index: 500;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.radius-control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
}
.radius-label {
  font-size: 12px;
  color: rgba(0,0,0,0.6);
  min-width: 80px;
}
.post-bar {
  position: absolute; /* 地図（map-page）の下側に配置 */
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 600;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  border-radius: 9999px;
}
.post-form {
  display: flex;
  align-items: center;
}

/* フォームの上に重ねるアラート（高さを変えない） */
.post-alert {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 700;
}

.post-alert-box {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.18);
}

/* Leafletのズームコントロールもヘッダー高さ分だけ下げる */
:global(.leaflet-top.leaflet-left) {
  top: calc(var(--v-layout-top, 0px) + 60px);
  left: 12px;
}
:global(.leaflet-top.leaflet-right) {
  top: calc(var(--v-layout-top, 0px) + 60px);
  right: 12px;
}
</style>

