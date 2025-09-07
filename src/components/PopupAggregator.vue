<script setup lang="ts">
// クラスタ/代表用の集約ポップアップを表示する小コンポーネント
// - items: 各子マーカーが既に持っている HTML 断片（アプリ生成の安全な内容）
/**
 * @typedef {Object} Props
 * @property {string[]} items 集約して表示する HTML 断片
 */
const props = defineProps<{ items: string[] }>()
</script>

<template>
  <div class="popup-agg">
    <template v-for="(html, idx) in props.items" :key="idx">
      <div class="entry" v-html="html" />
      <hr v-if="idx < props.items.length - 1" />
    </template>
  </div>
</template>

<style scoped>
.popup-agg { max-width: 320px; }
.popup-agg hr { border: none; border-top: 1px solid rgba(0,0,0,0.12); margin: 8px 0; }
.popup-agg .entry :deep(.popup-time) { color: rgba(0,0,0,0.55); font-size: 12px; }
</style>


