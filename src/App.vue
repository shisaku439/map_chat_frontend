<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const isAuthed = computed(() => auth.isAuthenticated)
const avatarUrl = computed(() => {
  const name = auth.username ?? 'U'
  // Home.vue（Leafletのユーザーピン）と同じ生成ロジック
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=ffffff&size=64&bold=true`
})
</script>

<template>
  <v-app style="width: 100vw; height: 100dvh;">
    <v-app-bar app flat density="comfortable">
      <v-app-bar-title style="text-align: left;">Map Chat</v-app-bar-title>
      <v-spacer />
      <div class="pa-2">
        <v-btn variant="text" to="/" :ripple="false" height="36" class="mr-2">Home</v-btn>
        <v-btn v-if="!isAuthed" variant="text" to="/login" :ripple="false" height="36">Login</v-btn>
        <v-btn v-else icon :ripple="false" title="アカウント" style="width:36px;height:36px">
          <v-avatar size="36">
            <img :src="avatarUrl" alt="avatar" height="36" width="36"/>
          </v-avatar>
        </v-btn>
      </div>

    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
  
  
  
  
  
  
  
  
  
  
  
  
</template>

<style scoped>
</style>
