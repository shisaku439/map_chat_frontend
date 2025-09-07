<script setup lang="ts">
// Home 画面
// - 地図（Leaflet）とリアルタイム（Socket）を扱う中核
// - MapControls/PostBar を子コンポーネントとして読み込み
// - ちらつき対策: 差分レンダリング + isPopupOpen ガード
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import L from 'leaflet'
import { io } from 'socket.io-client'
import PostBar from '../components/PostBar.vue'
import MapControls from '../components/MapControls.vue'
import MapCanvas from '../components/MapCanvas.vue'
import MarkerLayer from '../components/MarkerLayer.vue'
import { useNearby } from '../composables/useNearby'
import { useMapOffsets } from '../composables/useMapOffsets'
import { useFollow } from '../composables/useFollow'
import { useGeolocation } from '@vueuse/core'
import { useAuthStore } from '../stores/auth'
// マーカークラスタリング（重なりをまとめて表示）
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'

// Leaflet の地図コンテナ参照とインスタンス
// - mapPage: 右下UIのオフセット等をCSSカスタムプロパティで適用するラッパ
// - mapContainer: Leafletのマップ本体
// - mapControlsRef / postBarRef: サイズ監視し、オフセット再計算へ反映
const { mapPage, mapContainer, mapControlsRef, postBarRef, updateUiOffsets } = useMapOffsets()
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null
let searchCircle: L.Circle | null = null

let socket: ReturnType<typeof io> | null = null
const auth = useAuthStore()
const message = ref('')
const isPosting = ref(false)
// 周辺投稿（Day5）
const radius = ref(1000) // 100〜3000m（既定1,000m）
// 近傍投稿の状態
const nearby = ref<{ id: number; userId: number; message: string; lat: number; lng: number; createdAt: string; distance: number }[]>([])
// ポップアップの重なり順を管理（クリックで最前面へ）
let nextPopupZ = 10000
// 開いたポップアップ要素ごとに、付与したイベントハンドラを追跡してクリーンアップ
const popupHandlers = new WeakMap<HTMLElement, (ev: Event) => void>()

// 代表・クラスタポップアップ等は MarkerLayer へ移管

// オフセット計算は useMapOffsets へ委譲

// ログはブラウザコンソールへ出力
function addLog(text: string) {
  // 時刻付きで出力
  console.log(`[${new Date().toLocaleTimeString()}] ${text}`)
}

// 画面上部に一時的なアラートを表示（PostBarへ渡す）
const alertMessage = ref('')
let alertTimer: number | null = null
function showAlert(msg: string, ms = 4000) {
  alertMessage.value = msg
  if (alertTimer) window.clearTimeout(alertTimer)
  alertTimer = window.setTimeout(() => { alertMessage.value = ''; alertTimer = null }, ms)
}


// Geolocation（現在地の取得と地図への反映）
// - following: 現在地に地図を追従するかのフラグ
// - useGeolocation: 高精度・タイムアウトなどのオプションを指定
const { following, attachMapFollowHandlers, recenter } = useFollow()
const controlsOpen = ref(true)
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
  if (!map) return
  const lat = coords.value?.latitude
  const lng = coords.value?.longitude
  if (lat == null || lng == null) return
  recenter(map, lat, lng)
}

// 旧: MapControlsに移管（未使用）

// 外側タップで閉じる
function onGlobalPointerDown(ev: PointerEvent) {
  if (!controlsOpen.value) return
  const panel = mapControlsRef.value
  if (!panel) return
  const target = ev.target as Node | null
  if (target && panel.contains(target)) return
  controlsOpen.value = false
  requestAnimationFrame(() => updateUiOffsets())
}

// MapCanvas からの受け取り時に、Leaflet Map へイベントを登録
function onMapReady(m: L.Map, el: HTMLDivElement) {
  map = m as any
  mapContainer.value = el
  ;(map as any).zoomControl.setPosition('bottomright')
  attachMapFollowHandlers(m)

  ;(map as any).on('popupopen', (e: any) => {
    const elc = e?.popup?._container as HTMLElement | undefined
    if (!elc) return
    elc.style.zIndex = String(nextPopupZ++)
    const bringToFront = () => { elc.style.zIndex = String(nextPopupZ++) }
    popupHandlers.set(elc, bringToFront)
    elc.addEventListener('pointerdown', bringToFront)
    elc.addEventListener('click', bringToFront)
  })

  ;(map as any).on('popupclose', (e: any) => {
    const elc = e?.popup?._container as HTMLElement | undefined
    if (!elc) return
    const handler = popupHandlers.get(elc)
    if (!handler) return
    elc.removeEventListener('pointerdown', handler)
    elc.removeEventListener('click', handler)
    popupHandlers.delete(elc)
  })

  // 初期のオフセット調整
  updateUiOffsets()
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
    addLog(`周辺 ${nearby.value.length} 件`)
  } catch (e) {
    const msg = `周辺取得エラー: ${String(e)}`
    addLog(msg)
    showAlert(msg)
  }
}

// 周辺投稿を地図に描画
// 近傍投稿をクラスタ表示し、代表ポップアップを開く
// 旧: 差分レンダリングに移行（未使用）

// 差分レンダリング/ポップアップは MarkerLayer に移管

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
  // MapCanvas の ready で初期化済みになる

  // 初回の測位・監視を開始
  resume()

  // 現在地が更新されたら地図表示に反映（近距離ではfetchをデバウンス）
  const nearbyCtl = useNearby({ distanceThresholdMeters: 50, debounceMs: 400 })
  watch(coords, () => {
    updateUserLocationOnMap()
    const lat = coords.value?.latitude
    const lng = coords.value?.longitude
    if (lat != null && lng != null) {
      nearbyCtl.onCoordsChange(lat, lng, fetchNearby)
    }
  })
  // 半径変更で再取得
  watch(radius, () => {
    updateSearchCircle()
    fetchNearby()
  })

  socket = io(API_ORIGIN)
  if (socket && typeof (socket as any).on === 'function') {
    socket.on('connect', () => addLog('socket connected'))
    socket.on('connect_error', (err: any) => addLog(`socket connect_error: ${String(err)}`))
    // Day6: 新規投稿が届いたら周辺を更新
    socket.on('post_created', (d: any) => {
      addLog(`post_created: ${JSON.stringify(d)}`)
      fetchNearby()
    })
  }

  // オフセットは composable 内で監視・更新される
  updateUiOffsets()
  // 外側タップで閉じる（モバイル含む）
  document.addEventListener('pointerdown', onGlobalPointerDown, { passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown)
})
</script>

<template>
  <div class="map-page" ref="mapPage">
    <!-- 地図（フルスクリーン） -->
    <MapCanvas @ready="onMapReady" />

    <!-- マーカーレイヤ（差分レンダリング + クラスタ + ポップアップ制御） -->
    <MarkerLayer :map="map as any" :posts="nearby" :format-relative="formatRelative" />

    <!-- 地図内コントロール（開閉） -->
    <!-- MapControlsのDOM要素を監視するためにラッパーdivにrefを付与 -->
    <div ref="mapControlsRef">
      <MapControls
        v-model:open="controlsOpen"
        v-model:radius="radius"
        @recenter="recenterToUser"
        @refresh="fetchNearby"
      />
    </div>

    <!-- 下固定の投稿フォーム（DOM要素を参照するためラッパーで囲む） -->
    <div ref="postBarRef">
      <PostBar v-model="message" :loading="isPosting" :alert="alertMessage" @submit="submitPost" />
    </div>
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: 100%; /* ヘッダー/フッター分をVuetifyのレイアウトで差し引いた残り全体 */
  padding-bottom: env(safe-area-inset-bottom);
}
.map-full {
  position: absolute;
  inset: 0;
}
.map-controls {
  position: absolute;
  /* 右下配置に切替（bottom-rightクラスで調整） */
  z-index: 500;
  max-width: 600px ;
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* 小幅では折り返す */
  gap: 8px 10px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.map-controls.bottom-right {
  right: 12px;
  bottom: var(--controls-bottom-offset, 84px);
}
.map-controls-collapsed {
  position: absolute;
  right: 12px;
  bottom: var(--controls-bottom-offset, 84px);
  z-index: 500;
}
.control-fab {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

/* 展開/折りたたみアニメーション */
.controls-fade-enter-active,
.controls-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.controls-fade-enter-from,
.controls-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* トグルボタンの回転で状態を示す（同一アイコンを統一） */
.controls-toggle.open :deep(.v-icon) {
  transform: rotate(180deg);
  transition: transform 160ms ease;
}
.controls-toggle :deep(.v-icon) {
  transition: transform 160ms ease;
}
.controls-header {
  display: flex;
  align-items: center;
  width: 100%;
}
.controls-title {
  font-size: 14px;
  margin-left: 4px;
}
.controls-spacer {
  flex: 1 1 auto;
}
.controls-body {
  width: 100%;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.radius-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 240px; /* 可能なら広がり、狭いときは折り返し */
  min-width: 0; /* 折り返し時のはみ出し防止 */
}
.radius-label {
  font-size: 12px;
  color: rgba(0,0,0,0.6);
  min-width: 64px;
}
/* PostBarへ移動 */

/* Leafletのズームコントロールを右下へ、投稿フォーム高さに連動 */
:global(.leaflet-bottom.leaflet-right) {
  right: 6px;
  bottom: var(--zoom-bottom-offset, 84px);
}

/* ズームコントロールの位置変更にアニメーションを付与 */
:global(.leaflet-bottom.leaflet-right) {
  transition: bottom 160ms ease;
  will-change: bottom;
}

/* 著作権表示は画面の一番右下に固定 */
:global(.leaflet-control-attribution) {
  position: fixed !important;
  right: 6px;
  bottom: 6px;
  z-index: 580; /* 投稿フォーム(z-index:600)の下、ズームより低く/高く適宜 */
}

/* Vuetify内部要素の幅制御（スライダーを詰まらせない） */
:deep(.v-slider) {
  min-width: 0;
  flex: 1 1 auto;
}
:deep(.v-btn) {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .map-controls {
    gap: 6px 8px;
  }
  .radius-control {
    flex: 1 1 100%;
  }
  .radius-label {
    min-width: 56px;
  }
}
</style>

