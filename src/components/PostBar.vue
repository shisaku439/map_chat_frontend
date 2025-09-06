<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  loading?: boolean
  alert?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'submit'): void
}>()

const message = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

function onSubmit() {
  emit('submit')
}
</script>

<template>
  <div class="post-bar">
    <div v-if="alert" class="post-alert">
      <div class="post-alert-box">
        <v-alert type="error" variant="flat" density="comfortable">{{ alert }}</v-alert>
      </div>
    </div>
    <v-form class="post-form" @submit.prevent="onSubmit">
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
      <v-btn class="ml-2" color="success rounded-pill" :disabled="loading" :loading="loading" type="submit">投稿</v-btn>
    </v-form>
  </div>
</template>

<style scoped>
.post-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 600;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  border-radius: 9999px;
  margin-bottom: env(safe-area-inset-bottom);
}
.post-form { display: flex; align-items: center; }
.post-alert { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); z-index: 700; }
.post-alert-box { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
</style>


