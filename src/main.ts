import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import 'leaflet/dist/leaflet.css'
import App from './App.vue'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'
import Home from './views/Home.vue'
import Login from './views/Login.vue'
import { useAuthStore } from './stores/auth'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: Home },
        { path: '/login', name: 'login', component: Login },
    ],
})

const app = createApp(App)
app.use(createPinia())
// Pinia登録後にストアを使用して状態を復元
const auth = useAuthStore()
auth.restoreFromStorage()
// ルーターの前置ガードを追加
router.beforeEach((to) => {
    const isPublic = to.path === '/login'
    if (!isPublic && !auth.isAuthenticated) {
        return { path: '/login', query: { next: to.fullPath } }
    }
    if (isPublic && auth.isAuthenticated) {
        return { path: '/' }
    }
    return true
})
app.use(router)
app.use(createVuetify({ components, directives }))
app.mount('#app')
