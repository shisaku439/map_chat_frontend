<script setup lang="ts">
</script>

<template>
  <v-app style="width: 100vw; height: 100dvh;">
    <v-app-bar app flat density="comfortable">
      <v-app-bar-title style="text-align: left;">Map Chat</v-app-bar-title>
      <v-spacer />
      <v-btn variant="text" to="/" :ripple="false">Home</v-btn>
      <v-btn variant="text" to="/login" :ripple="false">Login</v-btn>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
  
  
  
  
  
  
  
  
  
  
  
  
</template>

<style scoped>
</style>
