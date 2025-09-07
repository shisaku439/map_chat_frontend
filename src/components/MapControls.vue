<script setup lang="ts">
// 右下の折りたたみコントローラ
// - open: 展開状態
// - radius: 周辺取得の半径
// Emits:
// - update:open: 展開状態の切替
// - update:radius: 半径スライダー変更
// - recenter: 現在地へ移動
// - refresh: 再取得
import { defineModel } from 'vue'
const open = defineModel<boolean>('open', { default: false })
const radius = defineModel<number>('radius', { default: 1000 })
const emit = defineEmits<{ (e: 'recenter'): void; (e: 'refresh'): void }>()

function toggle() { open.value = !open.value }
</script>

<template>
  <transition name="controls-fade">
    <div v-if="open" class="map-controls bottom-right">
      <div class="controls-header">
        <div class="controls-title">オプション</div>
        <v-spacer />
        <v-btn icon variant="text" density="comfortable" @click="toggle" class="controls-toggle open" aria-label="閉じる">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
      <div class="controls-body">
        <div class="option-item">
          <v-btn density="comfortable" color="primary" variant="tonal" @click="emit('recenter')">現在地へ</v-btn>
          <v-btn size="small" variant="tonal" @click="emit('refresh')">再取得</v-btn>
        </div>
        <div class="radius-control ml-2">
          <div class="radius-label">半径: {{ radius }}m</div>
          <v-slider v-model="radius" :min="100" :max="3000" :step="100" density="compact" hide-details />
        </div>
      </div>
    </div>
    <div v-else class="map-controls-collapsed bottom-right">
      <v-btn icon color="primary" class="control-fab controls-toggle" @click="toggle" aria-label="オプションを開く">
        <v-icon>mdi-tune</v-icon>
      </v-btn>
    </div>
  </transition>
</template>

<style scoped>
.map-controls {
  position: absolute;
  z-index: 500;
  max-width: 600px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.map-controls.bottom-right { right: 12px; bottom: var(--controls-bottom-offset, 84px); }
.map-controls-collapsed { position: absolute; right: 12px; bottom: var(--controls-bottom-offset, 84px); z-index: 500; }
.control-fab { width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.controls-header { display: flex; align-items: center; width: 100%; }
.controls-title { font-size: 14px; margin-left: 4px; }
.controls-body { width: 100%; }
.option-item { display: flex; align-items: center; gap: 8px; }
.radius-control { display: flex; align-items: center; gap: 8px; flex: 1 1 240px; min-width: 0; }
.radius-label { font-size: 12px; color: rgba(0,0,0,0.6); min-width: 64px; }
:deep(.v-slider) { min-width: 0; flex: 1 1 auto; }
:deep(.v-btn) { white-space: nowrap; }
.controls-fade-enter-active, .controls-fade-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.controls-fade-enter-from, .controls-fade-leave-to { opacity: 0; transform: translateY(-6px); }
.controls-toggle.open :deep(.v-icon) { transform: rotate(180deg); transition: transform 160ms ease; }
.controls-toggle :deep(.v-icon) { transition: transform 160ms ease; }

@media (max-width: 480px) {
  .map-controls { gap: 6px 8px; }
  .radius-control { flex: 1 1 100%; }
  .radius-label { min-width: 56px; }
}
</style>


