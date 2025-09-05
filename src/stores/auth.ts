import { defineStore } from 'pinia'

// 初心者向けコメント: 認証情報を管理するPiniaストアです。
// - ユーザーID/名前/トークン/有効期限を保持します
// - ログイン・新規登録・ログアウトの関数（アクション）を提供します
// - localStorageへ保存し、ページ更新後も状態を復元します

export type AuthState = {
    userId: number | null
    username: string | null
    token: string | null
    expiresAt: number | null // UNIX ms（ミリ秒）
}

const STORAGE_KEY = 'auth'

export const useAuthStore = defineStore('auth', {
    state: (): AuthState => ({
        userId: null,
        username: null,
        token: null,
        expiresAt: null,
    }),

    getters: {
        // トークンが存在して期限内かどうかで認証済みを判定
        isAuthenticated(state): boolean {
            if (!state.token || !state.expiresAt) return false
            return Date.now() < state.expiresAt
        },
    },

    actions: {
        // localStorageから状態を復元
        restoreFromStorage() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY)
                if (!raw) return
                const parsed = JSON.parse(raw) as AuthState
                this.userId = parsed.userId ?? null
                this.username = parsed.username ?? null
                this.token = parsed.token ?? null
                this.expiresAt = parsed.expiresAt ?? null
            } catch {
                // 破損していたら無視
            }
        },

        // 現在の状態をlocalStorageへ保存
        saveToStorage() {
            const data: AuthState = {
                userId: this.userId,
                username: this.username,
                token: this.token,
                expiresAt: this.expiresAt,
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        },

        // ログアウトして状態クリア
        logout() {
            this.userId = null
            this.username = null
            this.token = null
            this.expiresAt = null
            localStorage.removeItem(STORAGE_KEY)
        },

        // サーバの新規登録APIを呼び出し、成功したら状態を保存
        async register(username: string, password: string) {
            const origin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'
            const res = await fetch(`${origin}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err?.error?.message ?? '登録に失敗しました')
            }
            const data = await res.json()
            this.userId = data.userId
            this.username = data.username
            this.token = data.token
            this.expiresAt = data.expiresAt
            this.saveToStorage()
        },

        // サーバのログインAPIを呼び出し、成功したら状態を保存
        async login(username: string, password: string) {
            const origin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000'
            const res = await fetch(`${origin}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err?.error?.message ?? 'ログインに失敗しました')
            }
            const data = await res.json()
            this.userId = data.userId
            this.username = data.username
            this.token = data.token
            this.expiresAt = data.expiresAt
            this.saveToStorage()
        },
    },
})


