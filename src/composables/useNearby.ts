// 周辺投稿の再取得トリガを「距離しきい値」と「デバウンス」で制御する composable
// - 小刻みな位置ブレで過剰にAPIを叩かないためのガード
// 使用例:
//   const { onCoordsChange } = useNearby({ distanceThresholdMeters: 50, debounceMs: 400 })
//   watch(coords, () => onCoordsChange(lat, lng, fetchNearby))
import { ref } from 'vue'

export type UseNearbyOptions = {
    distanceThresholdMeters?: number
    debounceMs?: number
}

export function useNearby(options: UseNearbyOptions = {}) {
    const threshold = options.distanceThresholdMeters ?? 50
    const debounceMs = options.debounceMs ?? 400

    const lastLat = ref<number | null>(null)
    const lastLng = ref<number | null>(null)
    let timer: number | null = null

    // 2点間の概算距離（メートル）: ハバースィン
    function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371000
        const toRad = (d: number) => (d * Math.PI) / 180
        const dLat = toRad(lat2 - lat1)
        const dLng = toRad(lng2 - lng1)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }

    // 最後に取得した座標から「十分に動いたか」を判定
    function movedEnough(lat: number, lng: number): boolean {
        if (lastLat.value == null || lastLng.value == null) return true
        const d = haversineMeters(lastLat.value, lastLng.value, lat, lng)
        return d >= threshold
    }

    // 座標変化時に呼ぶ。しきい値を満たし、デバウンスが経過したら fetchFn を実行
    function onCoordsChange(lat: number, lng: number, fetchFn: () => void) {
        if (!movedEnough(lat, lng)) return
        lastLat.value = lat
        lastLng.value = lng
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => {
            fetchFn()
            timer = null
        }, debounceMs)
    }

    // 内部状態をリセット
    function reset() {
        lastLat.value = null
        lastLng.value = null
        if (timer) window.clearTimeout(timer)
        timer = null
    }

    return { onCoordsChange, reset }
}


