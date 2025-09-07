import { ref } from 'vue'
import type L from 'leaflet'

/**
 * 地図の「追従」挙動を管理する composable。
 * - ユーザー操作（ドラッグ/ズーム開始）で追従を自動OFF
 * - 明示的な再センタリングで追従ONに戻す
 *
 * @returns {{
 *   following: import('vue').Ref<boolean>,
 *   attachMapFollowHandlers: (map: L.Map) => void,
 *   recenter: (map: L.Map, lat: number, lng: number, zoom?: number) => void
 * }}
 */
export function useFollow() {
    const following = ref(true)

    /**
     * Leaflet Map に追従OFFをトリガーするイベントを登録する。
     * @param {L.Map} map Leaflet Map
     * @returns {void}
     */
    function attachMapFollowHandlers(map: L.Map) {
        ; (map as any).on('dragstart', () => { following.value = false })
            ; (map as any).on('zoomstart', () => { following.value = false })
    }

    /**
     * 指定座標へ再センタリングし、追従をONに戻す。
     * @param {L.Map} map Leaflet Map
     * @param {number} lat 緯度
     * @param {number} lng 経度
     * @param {number} [zoom] 任意のズーム
     * @returns {void}
     */
    function recenter(map: L.Map, lat: number, lng: number, zoom?: number) {
        following.value = true
        const pos = [lat, lng] as L.LatLngExpression
        map.setView(pos, zoom ?? map.getZoom() ?? 15)
    }

    return { following, attachMapFollowHandlers, recenter }
}


