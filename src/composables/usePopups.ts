import { createApp } from 'vue'
import PopupAggregator from '../components/PopupAggregator.vue'

/**
 * ポップアップ関連のユーティリティ。
 * - 集約ポップアップを Vue で動的マウントして HTMLElement を返す
 * - 呼び出し側で `el` を Leaflet の bindPopup / setContent に渡す
 *
 * @returns {{
 *   mountAggregated: (items: string[]) => { el: HTMLElement, app: import('vue').App<Element> }
 * }}
 */
export function usePopups() {
    /**
     * 集約ポップアップを動的にマウントする。
     * 返り値の `app` は必要に応じて呼び出し側で `unmount()` する。
     * @param {string[]} items 各子マーカーのポップアップHTML
     * @returns {{ el: HTMLElement, app: import('vue').App<Element> }}
     */
    function mountAggregated(items: string[]) {
        const mountEl = document.createElement('div')
        const app = createApp(PopupAggregator, { items })
        app.mount(mountEl)
        return { el: mountEl, app }
    }

    return { mountAggregated }
}


