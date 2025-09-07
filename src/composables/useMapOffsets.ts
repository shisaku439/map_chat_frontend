import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 地図UIの下側オフセット（ズームコントロール/コントロールパネル）を
 * 画面サイズやパネル高さの変化に応じて自動調整する composable。
 *
 * @param {Object} [options]
 * @param {number} [options.minZoomBottom] ズームUI下端の最小オフセット(px)
 * @param {number} [options.minControlsBottom] コントロール領域の最小高さ(px)
 * @returns {{
 *   mapPage: import('vue').Ref<HTMLElement|null>,
 *   mapContainer: import('vue').Ref<HTMLElement|null>,
 *   mapControlsRef: import('vue').Ref<HTMLElement|null>,
 *   postBarRef: import('vue').Ref<HTMLElement|null>,
 *   updateUiOffsets: () => void
 * }} map関連DOM参照と再計算関数
 */

export function useMapOffsets(options?: { minZoomBottom?: number; minControlsBottom?: number }) {
    const mapPage = ref<HTMLElement | null>(null)
    const mapContainer = ref<HTMLElement | null>(null)
    const mapControlsRef = ref<HTMLElement | null>(null)
    const postBarRef = ref<HTMLElement | null>(null)
    let controlsResizeObserver: ResizeObserver | null = null

    /**
     * 現在の DOM 状態から下側オフセットを再計算して CSS 変数へ反映する。
     * - 投稿フォームの高さとズームUIの高さを加味
     * - 最小値は `options` の指定を採用
     * @returns {void}
     */
    function updateUiOffsets() {
        const postInner = (postBarRef.value?.firstElementChild as HTMLElement | null) ?? postBarRef.value
        const postH = postInner?.offsetHeight ?? 0
        const zoomEl = mapContainer.value?.querySelector(
            '.leaflet-bottom.leaflet-right .leaflet-control-zoom'
        ) as HTMLElement | null
        const zoomUiHeight = Math.max(zoomEl?.offsetHeight ?? 0, 56)
        const minZoom = options?.minZoomBottom ?? 56
        const minControls = options?.minControlsBottom ?? 100
        const zoomBottom = Math.max(postH + 12, minZoom)
        mapPage.value?.style.setProperty('--zoom-bottom-offset', `${zoomBottom}px`)
        const controlsBottom = zoomBottom + Math.max(zoomUiHeight, minControls) + 8
        mapPage.value?.style.setProperty('--controls-bottom-offset', `${controlsBottom}px`)
    }

    onMounted(() => {
        updateUiOffsets()
        if ('ResizeObserver' in window && mapControlsRef.value) {
            controlsResizeObserver = new ResizeObserver(() => updateUiOffsets())
            controlsResizeObserver.observe(mapControlsRef.value)
        }
        if (postBarRef.value && controlsResizeObserver) {
            controlsResizeObserver.observe(postBarRef.value)
        }
        window.addEventListener('resize', updateUiOffsets)
    })

    onBeforeUnmount(() => {
        if (controlsResizeObserver && mapControlsRef.value) controlsResizeObserver.unobserve(mapControlsRef.value)
        if (controlsResizeObserver && postBarRef.value) controlsResizeObserver.unobserve(postBarRef.value)
        controlsResizeObserver = null
        window.removeEventListener('resize', updateUiOffsets)
    })

    return { mapPage, mapContainer, mapControlsRef, postBarRef, updateUiOffsets }
}


