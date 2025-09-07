<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import L from 'leaflet'
import 'leaflet.markercluster'
import { usePopups } from '../composables/usePopups'

/**
 * 地図上の投稿マーカー群を差分レンダリングし、
 * クラスタ時には集約ポップアップを表示するレイヤコンポーネント。
 */
type Post = { id: number; userId: number; message: string; lat: number; lng: number; createdAt: string; distance: number }

const props = defineProps<{
  map: L.Map | null
  posts: Post[]
  formatRelative: (iso: string) => string
}>()

const emit = defineEmits<{
  (e: 'markerOpened', id: number): void
  (e: 'clusterOpened', count: number): void
}>()

// マーカークラスタ用レイヤ（初回アクセス時に生成）
let layer: L.MarkerClusterGroup | null = null
const markerById = new Map<number, L.Marker>()
let createdMarkers: L.Marker[] = []
let representativeMarker: L.Marker | null = null
let popupPersistAttached = false
const { mountAggregated } = usePopups()

/** レイヤを遅延初期化して地図に追加する */
function ensureLayer() {
  if (!props.map) return
  if (!layer) {
    layer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 60 }) as L.MarkerClusterGroup
    props.map.addLayer(layer)
  }
}

/** 個別マーカーのポップアップHTMLを生成（既存スタイル準拠） */
function markerHtml(p: Post) {
  return `${p.message}<br/><span class="popup-time">${props.formatRelative(p.createdAt)}</span>`
}

/** posts の差分を検出し、マーカーを追加/更新/削除する */
function renderDiff() {
  if (!props.map) return
  ensureLayer()
  if (!layer) return
  const nextIds = new Set<number>()
  const newMarkers: L.Marker[] = []

  props.posts.forEach((p) => {
    nextIds.add(p.id)
    let m = markerById.get(p.id)
    if (!m) {
      const icon = L.divIcon({ className: 'comment-dot', html: '<div class="dot"></div>', iconSize: [22,22], iconAnchor: [11,11], popupAnchor: [0,-12] })
      m = L.marker([p.lat, p.lng], { icon })
      m.bindPopup(markerHtml(p), { autoClose: false, closeOnClick: false, autoPan: false })
      ;(m as any).__postMeta = p
      markerById.set(p.id, m)
      layer?.addLayer(m)
      newMarkers.push(m)
    } else {
      m.setLatLng([p.lat, p.lng])
      const next = markerHtml(p)
      const cur = (m.getPopup()?.getContent?.() ?? '') as string
      if (cur !== next) m.getPopup()?.setContent(next)
      ;(m as any).__postMeta = p
    }
  })
  for (const [id, m] of markerById.entries()) {
    if (!nextIds.has(id)) {
      layer.removeLayer(m)
      markerById.delete(id)
    }
  }
  createdMarkers = Array.from(markerById.values())
  representativeMarker = createdMarkers[0] ?? null
  openRepresentativePopup()
  if (!popupPersistAttached && props.map) {
    popupPersistAttached = true
    ;(props.map as any).on('zoomend', openRepresentativePopup)
    ;(props.map as any).on('zoomend', openVisibleMarkerPopups)
    ;(props.map as any).on('zoomend', openVisibleClusterPopups)
  }
  openVisibleMarkerPopups()
}

/**
 * 画面上でクラスター表示されている親に、子マーカーの内容を束ねた
 * 集約ポップアップを表示する。
 * @returns {void}
 */
function openVisibleClusterPopups() {
  if (!layer) return
  const grp: any = layer as any
  const uniqueParents = new Set<any>()
  createdMarkers.forEach((m) => {
    const parent: any = grp.getVisibleParent(m)
    if (parent && parent !== m) uniqueParents.add(parent)
  })
  uniqueParents.forEach((parent) => {
    const children = parent.getAllChildMarkers ? parent.getAllChildMarkers() : []
    if (!children || children.length === 0) return
    children.sort((a: any, b: any) => new Date(b.__postMeta?.createdAt || 0).getTime() - new Date(a.__postMeta?.createdAt || 0).getTime())
    const items = children.slice(0, 5).map((cm: any) => (cm.getPopup && cm.getPopup()) ? cm.getPopup().getContent() : '')
    const { el } = mountAggregated(items)
    if (parent.getPopup && parent.getPopup()) {
      const pop = parent.getPopup()
      if (pop) pop.options.autoPan = false
      parent.getPopup().setContent(el)
    } else {
      parent.bindPopup(el, { autoClose: false, closeOnClick: false, autoPan: false })
    }
    if (!(parent as any).isPopupOpen || !(parent as any).isPopupOpen()) parent.openPopup()
    emit('clusterOpened', children.length)
  })
}

/**
 * 代表マーカーに対して、可視状態に応じたポップアップを表示する。
 * - クラスタ内なら集約ポップアップ
 * - 個別表示ならそのマーカーのポップアップ
 * @returns {void}
 */
function openRepresentativePopup() {
  if (!layer || !representativeMarker) return
  const grp: any = layer as any
  const parent: any = grp.getVisibleParent(representativeMarker)
  if (parent && parent !== representativeMarker) {
    const children = parent.getAllChildMarkers ? parent.getAllChildMarkers() : [representativeMarker]
    children.sort((a: any, b: any) => new Date(b.__postMeta?.createdAt || 0).getTime() - new Date(a.__postMeta?.createdAt || 0).getTime())
    const items = children.slice(0, 5).map((cm: any) => (cm.getPopup && cm.getPopup()) ? cm.getPopup().getContent() : '')
    const { el } = mountAggregated(items)
    if (parent.getPopup && parent.getPopup()) {
      const pop = parent.getPopup()
      if (pop) pop.options.autoPan = false
      parent.getPopup().setContent(el)
    } else {
      parent.bindPopup(el, { autoClose: false, closeOnClick: false, autoPan: false })
    }
    if (!(parent as any).isPopupOpen || !(parent as any).isPopupOpen()) parent.openPopup()
    emit('clusterOpened', children.length)
  } else {
    const isOpen = (representativeMarker as any).isPopupOpen ? (representativeMarker as any).isPopupOpen() : false
    if (!isOpen) representativeMarker.openPopup()
    const meta = (representativeMarker as any).__postMeta as Post | undefined
    if (meta) emit('markerOpened', meta.id)
  }
}

/** 個別表示されているマーカーのポップアップを自動で開く */
function openVisibleMarkerPopups() {
  if (!layer) return
  const grp: any = layer as any
  createdMarkers.forEach((m) => {
    const parent: any = grp.getVisibleParent(m)
    if (!parent || parent === m) {
      const isOpen = (m as any).isPopupOpen ? (m as any).isPopupOpen() : false
      if (!isOpen) m.openPopup()
    }
  })
}

onMounted(() => {
  renderDiff()
})

watch(() => props.posts, () => { renderDiff() }, { deep: true })
watch(() => props.map, () => { renderDiff() })

onBeforeUnmount(() => {
  if (props.map && popupPersistAttached) {
    ;(props.map as any).off('zoomend', openRepresentativePopup)
    ;(props.map as any).off('zoomend', openVisibleMarkerPopups)
    ;(props.map as any).off('zoomend', openVisibleClusterPopups)
  }
  if (layer && props.map) {
    props.map.removeLayer(layer)
  }
  layer = null
  markerById.clear()
  createdMarkers = []
  representativeMarker = null
  popupPersistAttached = false
})
</script>

<template>
  <div class="marker-layer" />
</template>

<style scoped>
.comment-dot { position: relative; }
.comment-dot .dot { width: 14px; height: 14px; background: #10b981; border-radius: 50%; box-shadow: 0 0 0 3px rgba(16,185,129,0.25); }
.popup-time { color: rgba(0,0,0,0.55); font-size: 12px; }
</style>


