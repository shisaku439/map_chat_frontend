import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import 'leaflet/dist/leaflet.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
